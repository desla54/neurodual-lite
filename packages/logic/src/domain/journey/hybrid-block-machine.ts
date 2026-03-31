/**
 * Hybrid Block Machine — SSOT for hybrid journey block-level decisions.
 *
 * The hybrid journey alternates between two phases per cycle:
 *   TRACK phase (N track sessions) → DNB phase (M dnb sessions) → repeat
 *
 * During the DNB phase, each session is classified into a zone:
 *   - 'clean' (≤1 total errors)  → builds toward UP
 *   - 'stay'  (2-3 total errors) → neutral (no streak contribution)
 *   - 'down'  (>3 total errors)  → builds toward DOWN
 *
 * A block decision is made when:
 *   - 2 consecutive non-stay zones of the same type → that zone is the decision
 *   - DNB block exhausted without a streak of 2 → forced 'stay'
 *
 * IMPORTANT: 'stay' zones do NOT build streaks. They break any active streak
 * and only trigger a decision as the exhaustion fallback. This ensures consistent
 * behavior across projector and decider.
 *
 * This module is consumed by:
 *   - journey-projector.ts (projectAlternatingJourney) — loops over all sessions
 *   - journey-decider.ts (decideJourneyAttempt) — single session against projected state
 */

import type { HybridJourneyStageProgress } from '../../types/journey';
import {
  ALTERNATING_JOURNEY_FIRST_MODE,
  ALTERNATING_JOURNEY_SECOND_MODE,
  HYBRID_DNB_BLOCK_SIZE_DEFAULT,
  HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
} from '../../specs/journey.spec';

// =============================================================================
// Types
// =============================================================================

export type HybridZone = 'clean' | 'stay' | 'down';
export type HybridPhase = 'track' | 'dnb';

/** Block configuration (clamped, safe values). */
export interface HybridBlockConfig {
  readonly trackSessionsPerBlock: number;
  readonly dnbSessionsPerBlock: number;
}

/** Accumulated state of one hybrid block cycle. */
export interface HybridBlockState {
  readonly phase: HybridPhase;
  readonly trackCount: number;
  readonly dnbCount: number;
  /** Last non-stay zone seen, or null if no non-stay zone yet. */
  readonly activeZone: HybridZone | null;
  /** Consecutive count of the activeZone (only 'clean' or 'down'). */
  readonly activeZoneStreak: number;
  /** Last classified zone (including 'stay'), for UI display. */
  readonly lastZone: HybridZone | null;
}

/** Result of processing one session through the block machine. */
export interface HybridBlockStepResult {
  /** Was the session consumed by the machine? */
  readonly accepted: boolean;
  /** Updated block state after this step. */
  readonly nextState: HybridBlockState;
  /** Non-null when the block reached a decision and the cycle should reset. */
  readonly decision: HybridZone | null;
  /** The next game mode to play. */
  readonly nextSessionGameMode: string;
  /** How many sessions completed in this cycle so far. */
  readonly cycleProgress: number;
  /** Total sessions in a full cycle (track + dnb). */
  readonly cycleLength: number;
}

// =============================================================================
// Zone classification
// =============================================================================

/**
 * Classify a DNB session into a zone based on total errors.
 * This is the single canonical zone classification — all callers must use this.
 */
export function classifyDnbZone(totalErrors: number): HybridZone {
  if (totalErrors <= 1) return 'clean';
  if (totalErrors <= 3) return 'stay';
  return 'down';
}

/**
 * Compute total errors from byModality stats.
 * Returns null if byModality is missing or empty (caller should use score-based fallback).
 */
export function computeTotalErrors(
  byModality: Record<string, { misses: number; falseAlarms: number }> | undefined | null,
): number | null {
  if (!byModality) return null;
  const modalities = Object.values(byModality);
  if (modalities.length === 0) return null;
  return modalities.reduce((sum, s) => sum + (s.misses ?? 0) + (s.falseAlarms ?? 0), 0);
}

/**
 * Estimate total errors from a score when byModality is unavailable.
 */
export function estimateTotalErrorsFromScore(score: number): number {
  if (score >= 100) return 0;
  if (score >= 70) return 2;
  return 4;
}

// =============================================================================
// Block config helpers
// =============================================================================

export function clampBlockSize(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function resolveBlockConfig(options?: {
  trackSessionsPerBlock?: number;
  dnbSessionsPerBlock?: number;
}): HybridBlockConfig {
  return {
    trackSessionsPerBlock: clampBlockSize(
      options?.trackSessionsPerBlock,
      HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
    ),
    dnbSessionsPerBlock: clampBlockSize(
      options?.dnbSessionsPerBlock,
      HYBRID_DNB_BLOCK_SIZE_DEFAULT,
    ),
  };
}

// =============================================================================
// State machine
// =============================================================================

export function createInitialBlockState(): HybridBlockState {
  return {
    phase: 'track',
    trackCount: 0,
    dnbCount: 0,
    activeZone: null,
    activeZoneStreak: 0,
    lastZone: null,
  };
}

/**
 * Step the hybrid block state machine forward by one session.
 *
 * @param state - Current block state
 * @param sessionGameMode - The game mode of the session being processed
 * @param zone - Pre-classified zone (only meaningful for DNB sessions, ignored for track)
 * @param config - Block size configuration
 * @returns Step result with updated state and optional decision
 */
export function stepHybridBlock(
  state: HybridBlockState,
  sessionGameMode: string,
  zone: HybridZone | null,
  config: HybridBlockConfig,
): HybridBlockStepResult {
  const cycleLength = config.trackSessionsPerBlock + config.dnbSessionsPerBlock;

  // --- Track phase ---
  if (state.phase === 'track') {
    if (sessionGameMode !== ALTERNATING_JOURNEY_FIRST_MODE) {
      return {
        accepted: false,
        nextState: state,
        decision: null,
        nextSessionGameMode: ALTERNATING_JOURNEY_FIRST_MODE,
        cycleProgress: state.trackCount + state.dnbCount,
        cycleLength,
      };
    }

    const trackCount = state.trackCount + 1;
    const trackDone = trackCount >= config.trackSessionsPerBlock;
    const nextPhase: HybridPhase = trackDone ? 'dnb' : 'track';
    const nextSessionGameMode = trackDone
      ? ALTERNATING_JOURNEY_SECOND_MODE
      : ALTERNATING_JOURNEY_FIRST_MODE;

    return {
      accepted: true,
      nextState: {
        ...state,
        phase: nextPhase,
        trackCount: trackDone ? config.trackSessionsPerBlock : trackCount,
        dnbCount: 0,
        // Reset streak state when entering DNB phase
        ...(trackDone ? { activeZone: null, activeZoneStreak: 0, lastZone: null } : {}),
      },
      decision: null,
      nextSessionGameMode,
      cycleProgress: trackCount + state.dnbCount,
      cycleLength,
    };
  }

  // --- DNB phase ---
  if (sessionGameMode !== ALTERNATING_JOURNEY_SECOND_MODE) {
    return {
      accepted: false,
      nextState: state,
      decision: null,
      nextSessionGameMode: ALTERNATING_JOURNEY_SECOND_MODE,
      cycleProgress: state.trackCount + state.dnbCount,
      cycleLength,
    };
  }

  const effectiveZone: HybridZone = zone ?? 'stay';
  const dnbCount = state.dnbCount + 1;

  // Streak logic: only 'clean' and 'down' build streaks.
  // 'stay' breaks any active streak but does NOT start one.
  let activeZone = state.activeZone;
  let activeZoneStreak = state.activeZoneStreak;

  if (effectiveZone === 'stay') {
    // Stay breaks the active streak
    activeZone = null;
    activeZoneStreak = 0;
  } else if (effectiveZone === activeZone) {
    activeZoneStreak += 1;
  } else {
    activeZone = effectiveZone;
    activeZoneStreak = 1;
  }

  // Decision: streak of 2 non-stay zones, or block exhaustion
  const streakDecision = activeZone !== null && activeZoneStreak >= 2 ? activeZone : null;
  const exhaustionDecision = dnbCount >= config.dnbSessionsPerBlock ? 'stay' : null;
  const decision =
    (streakDecision as HybridZone | null) ?? (exhaustionDecision as HybridZone | null);

  const nextState: HybridBlockState = {
    phase: 'dnb',
    trackCount: state.trackCount,
    dnbCount,
    activeZone,
    activeZoneStreak,
    lastZone: effectiveZone,
  };

  return {
    accepted: true,
    nextState,
    decision,
    nextSessionGameMode: decision
      ? ALTERNATING_JOURNEY_FIRST_MODE
      : ALTERNATING_JOURNEY_SECOND_MODE,
    cycleProgress: state.trackCount + dnbCount,
    cycleLength,
  };
}

// =============================================================================
// Conversion helpers (HybridBlockState ↔ HybridJourneyStageProgress)
// =============================================================================

/**
 * Convert persisted HybridJourneyStageProgress back to a HybridBlockState
 * for the decider to continue from.
 */
export function hybridProgressToBlockState(progress: HybridJourneyStageProgress): HybridBlockState {
  // Reconstruct activeZone/streak from the persisted decision zone
  let activeZone: HybridZone | null = null;
  let activeZoneStreak = 0;

  if (
    progress.decisionZone &&
    progress.decisionZone !== 'stay' &&
    typeof progress.decisionStreakCount === 'number'
  ) {
    activeZone = progress.decisionZone;
    activeZoneStreak = progress.decisionStreakCount;
  }

  return {
    phase: progress.loopPhase,
    trackCount:
      progress.loopPhase === 'track'
        ? progress.trackSessionsCompleted
        : progress.trackSessionsRequired,
    dnbCount: progress.dnbSessionsCompleted,
    activeZone,
    activeZoneStreak,
    lastZone: progress.decisionZone ?? null,
  };
}

/**
 * Convert a HybridBlockState to a HybridJourneyStageProgress for persistence.
 */
export function blockStateToHybridProgress(
  state: HybridBlockState,
  config: HybridBlockConfig,
): HybridJourneyStageProgress {
  const base: HybridJourneyStageProgress = {
    loopPhase: state.phase,
    trackSessionsCompleted:
      state.phase === 'track' ? state.trackCount : config.trackSessionsPerBlock,
    trackSessionsRequired: config.trackSessionsPerBlock,
    dnbSessionsCompleted: state.phase === 'dnb' ? state.dnbCount : 0,
    dnbSessionsRequired: config.dnbSessionsPerBlock,
  };

  // Only include streak info for non-stay active zones
  if (state.phase === 'dnb' && state.activeZone && state.activeZone !== 'stay') {
    return {
      ...base,
      decisionZone: state.activeZone,
      decisionStreakCount: state.activeZoneStreak,
      decisionStreakRequired: 2,
    };
  }

  // Include 'stay' as decision zone for UI display when last zone was stay
  if (state.phase === 'dnb' && state.lastZone === 'stay') {
    return {
      ...base,
      decisionZone: 'stay',
    };
  }

  return base;
}
