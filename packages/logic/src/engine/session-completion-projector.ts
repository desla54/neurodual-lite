/**
 * SessionCompletionProjector - Single Source of Truth for Session Completion
 *
 * Unified orchestrator that composes existing projectors and calculators:
 * - UPSProjector → UnifiedPerformanceScore
 * - calculateXxxSessionPassed → passed boolean
 * - convertXxxSession → SessionEndReportModel
 * - calculateSessionXP → XPBreakdown (in projectWithXP)
 *
 * This is a PURE module - no side effects, no persistence.
 * Side effects (storage, sync, refresh) are handled by useSessionCompletion hook.
 */

import type { Trial, ModalityId } from '../types/core';
import type { TraceSessionSummary } from '../types/trace';
import type { GameEvent, SessionSummary } from './events';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  SessionEndReportModel,
  JourneyContext,
  ReportGameMode,
  FocusStats,
} from '../types/session-report';
import type { XPBreakdown, BadgeDefinition } from '../domain/progression';

import { UPSProjector, type SessionMode } from './ups-projector';
import { extractTempoResponseData } from './session-projector';
import { PlaceSessionProjector } from './place-projector';
import { MemoSessionProjector } from './memo-projector';
import { DualPickSessionProjector } from './dual-pick-projector';
import { projectTempoSessionEntrypoint } from './tempo-projection-entrypoint';
import { TempoConfidenceCalculator } from '../domain/scoring/tempo-confidence';
import { JaeggiConfidenceCalculator } from '../domain/scoring/dualnback-classic-confidence';
import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { AllSpecs, type DualnbackClassicConfidenceSpec, type TempoConfidenceSpec } from '../specs';
import { projectCognitiveTaskTurns } from './turn-projectors';

import {
  calculateTempoSessionPassed,
  calculatePlaceSessionPassed,
  calculateMemoSessionPassed,
  calculateDualPickSessionPassed,
  calculateTraceSessionPassed,
} from '../domain/scoring/session-passed';

import {
  convertTempoSession,
  convertPlaceSession,
  convertMemoSession,
  convertDualPickSession,
  convertTraceSession,
  recommendNextLevelForTempo,
} from '../domain/report';

import { calculateSessionXP, checkNewBadges, type AnySessionSummary } from '../domain/progression';
import type { BadgeContext } from '../domain/progression/badges';
import { UserProgression } from '../domain/progression';
import { UserHistory } from '../domain';
import { SESSION_START_EVENT_TYPES } from './session-start-event-types';
import {
  BW_SCORE_DOWN_PERCENT,
  BW_SCORE_UP_PERCENT,
  BW_STRIKES_TO_DOWN,
  UPS_TIER_ELITE_ACCURACY,
  UPS_TIER_ADVANCED_ACCURACY,
  UPS_TIER_INTERMEDIATE_ACCURACY,
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  XP_FLOW_UPS_THRESHOLD,
} from '../specs/thresholds';
import type { SessionHistoryItem } from '../ports/history-port';

// =============================================================================
// Spec-Driven Confidence Helpers
// =============================================================================

/**
 * Check if a confidence spec is DualnbackClassicConfidenceSpec (has accuracyThreshold).
 */
function isDualnbackClassicConfidenceSpec(
  spec: TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined,
): spec is DualnbackClassicConfidenceSpec {
  return spec !== undefined && 'accuracyThreshold' in spec;
}

/**
 * Get confidence spec from game mode.
 * Returns the confidence spec from the mode's scoring config.
 */
function getConfidenceSpecFromMode(
  gameMode: string,
): TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined {
  const modeSpec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return modeSpec?.scoring?.confidence;
}

function deriveCognitiveTaskLevelFromMetrics(
  metrics: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  if (!metrics) return undefined;

  for (const key of [
    'reportedLevel',
    'maxLevel',
    'maxSpan',
    'maxForwardSpan',
    'maxBackwardSpan',
  ] as const) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
      return Math.round(value);
    }
  }

  return undefined;
}

// =============================================================================
// Input Types (Discriminated Union by Mode)
// =============================================================================

interface BaseCompletionInput {
  readonly sessionId: string;
  readonly gameModeLabel: string;
  readonly journeyContext?: JourneyContext;
}

export interface TempoCompletionInput extends BaseCompletionInput {
  readonly mode: 'tempo';
  readonly events: readonly GameEvent[];
  readonly generator?: string;
  readonly gameMode: string;
  readonly activeModalities: readonly ModalityId[];
  /** BrainWorkshop only: strikes already accumulated at this N-level before this session. */
  readonly currentStrikes?: number;
}

export interface PlaceCompletionInput extends BaseCompletionInput {
  readonly mode: 'flow';
  readonly events: readonly GameEvent[];
  readonly activeModalities: readonly ModalityId[];
  readonly confidenceScore?: number | null;
  readonly directnessRatio?: number;
  readonly wrongSlotDwellMs?: number;
  readonly avgPlacementTimeMs?: number;
}

export interface MemoCompletionInput extends BaseCompletionInput {
  readonly mode: 'recall';
  readonly events: readonly GameEvent[];
  readonly trials: readonly Trial[];
  readonly activeModalities: readonly ModalityId[];
  readonly confidenceScore?: number;
  readonly fluencyScore?: number;
  readonly correctionsCount?: number;
}

export interface DualPickCompletionInput extends BaseCompletionInput {
  readonly mode: 'dual-pick';
  readonly events: readonly GameEvent[];
  readonly activeModalities: readonly ModalityId[];
  readonly confidenceScore?: number;
  readonly directnessRatio?: number;
  readonly wrongSlotDwellMs?: number;
  readonly avgPlacementTimeMs?: number;
}

export interface TraceCompletionInput extends BaseCompletionInput {
  readonly mode: 'trace';
  readonly events: readonly GameEvent[];
  readonly summary: TraceSessionSummary;
  readonly activeModalities: readonly ModalityId[];
  readonly confidenceScore?: number;
}

export interface TimeCompletionInput extends BaseCompletionInput {
  readonly mode: 'time';
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly regularity: number;
  readonly trialsCompleted: number;
  readonly totalTrials: number;
  readonly successfulTrials: number;
  readonly failedTrials: number;
  readonly durationMs: number;
  readonly avgDurationMs: number;
  readonly avgErrorMs: number;
}

export interface TrackCompletionInput extends BaseCompletionInput {
  readonly mode: 'track';
  readonly events: readonly GameEvent[];
}

export interface CorsiCompletionInput extends BaseCompletionInput {
  readonly mode: 'corsi';
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly maxSpan: number;
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly durationMs: number;
}

export interface RunningSpanCompletionInput extends BaseCompletionInput {
  readonly mode: 'running-span';
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly maxSpan: number;
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly durationMs: number;
}

export interface PasatCompletionInput extends BaseCompletionInput {
  readonly mode: 'pasat';
  readonly sessionId: string;
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly fastestIsiMs: number;
  readonly avgResponseTimeMs: number;
  readonly durationMs: number;
}

export interface SwmCompletionInput extends BaseCompletionInput {
  readonly mode: 'swm';
  readonly sessionId: string;
  readonly events: readonly GameEvent[];
  readonly gameModeLabel: string;
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly correctRounds: number;
  readonly totalRounds: number;
  readonly maxSpanReached: number;
  readonly totalWithinErrors: number;
  readonly totalBetweenErrors: number;
  readonly totalErrors: number;
  readonly durationMs: number;
}

export interface OspanCompletionInput extends BaseCompletionInput {
  readonly mode: 'ospan';
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number;
  readonly maxSpan: number;
  readonly absoluteScore: number;
  readonly correctSets: number;
  readonly totalSets: number;
  readonly processingAccuracy: number;
  readonly isValidMeasure: boolean;
  readonly durationMs: number;
}

export interface CognitiveTaskCompletionInput extends BaseCompletionInput {
  readonly mode: 'cognitive-task';
  readonly taskType: string;
  readonly events: readonly GameEvent[];
  readonly reason: 'completed' | 'abandoned';
  readonly accuracy: number; // 0-100
  readonly correctTrials: number;
  readonly totalTrials: number;
  readonly durationMs: number;
  readonly meanRtMs?: number;
  readonly maxLevel?: number;
}

export type SessionCompletionInput =
  | TempoCompletionInput
  | PlaceCompletionInput
  | MemoCompletionInput
  | DualPickCompletionInput
  | TraceCompletionInput
  | TimeCompletionInput
  | TrackCompletionInput
  | CorsiCompletionInput
  | OspanCompletionInput
  | RunningSpanCompletionInput
  | PasatCompletionInput
  | SwmCompletionInput
  | CognitiveTaskCompletionInput;

// =============================================================================
// Output Types
// =============================================================================

/**
 * Result of session completion projection.
 * Contains everything needed for display and persistence.
 */
export interface SessionCompletionResult {
  /** Detected session mode */
  readonly mode: SessionMode;
  /** Session ID */
  readonly sessionId: string;
  /** Unified Performance Score (0-100 with components) */
  readonly ups: UnifiedPerformanceScore;
  /** Did the session pass? (mode-specific threshold) */
  readonly passed: boolean;
  /** Next N-level recommendation */
  readonly nextLevel: number;
  /** Session summary (any mode) - for XP calculation */
  readonly summary: AnySessionSummary;
  /** Complete report model (for display and persistence) */
  readonly report: SessionEndReportModel;
  /** Journey context (if applicable) */
  readonly journeyContext?: JourneyContext;
  /** Active modalities */
  readonly activeModalities: readonly ModalityId[];
}

/**
 * XP context input - provided by caller (from history/progression adapters).
 */
export interface XPContextInput {
  readonly streakDays: number;
  readonly isFirstOfDay: boolean;
  readonly sessionsToday: number;
  readonly existingBadgeIds: readonly string[];
  /** SQL-first badge history snapshot (avoids rebuilding UserHistory from full session arrays) */
  readonly badgeHistory?: {
    readonly currentStreak: number;
    readonly bestStreak: number;
    readonly earlyMorningDays: number;
    readonly lateNightDays: number;
    readonly maxNLevel: number;
    readonly bestDPrime: number;
    readonly daysSinceLastSession: number | null;
  };
  /** Current progression data for badge checking */
  readonly currentProgression?: {
    readonly totalXP: number;
    readonly completedSessions: number;
    readonly abandonedSessions: number;
    readonly totalTrials: number;
    readonly firstSessionAt: Date | null;
    readonly earlyMorningSessions: number;
    readonly lateNightSessions: number;
    readonly comebackCount: number;
    readonly persistentDays: number;
    readonly plateausBroken: number;
    readonly uninterruptedSessionsStreak?: number;
  };
  /** Session history for badge checking (use SessionHistoryItem from ports) */
  readonly sessionHistory?: readonly SessionHistoryItem[];
}

/**
 * Result with XP calculation included.
 */
export interface SessionCompletionWithXPResult extends SessionCompletionResult {
  /** XP breakdown for the session */
  readonly xpBreakdown: XPBreakdown;
  /** Newly unlocked badges */
  readonly newBadges: readonly BadgeDefinition[];
  /** Whether in flow state (for XP bonus) */
  readonly isInFlow: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapModeToReportMode(mode: SessionMode, gameMode?: string): ReportGameMode {
  switch (mode) {
    case 'tempo':
      if (gameMode?.includes('dualnback')) return 'dualnback-classic';
      if (gameMode?.includes('brainworkshop')) return 'sim-brainworkshop';
      return 'dualnback-classic';
    case 'flow':
      return 'dual-place';
    case 'recall':
      return 'dual-memo';
    case 'dual-pick':
      return 'dual-pick';
    case 'trace':
      return 'dual-trace';
    case 'ospan':
      return 'ospan';
    case 'cognitive-task':
      return 'cognitive-task';
    default:
      return 'custom';
  }
}

/**
 * Calculate next N-level using spec-driven progression logic.
 *
 * Delegates to the centralized report recommendation engine, which applies:
 * - Jaeggi protocol (<3 up, 3-5 same, >5 down)
 * - BrainWorkshop strikes protocol
 * - SDT thresholds (pass/down)
 *
 * @param nLevel - Current N-level
 * @param passed - Whether session passed (from calculateTempoSessionPassed)
 * @param gameMode - Game mode ID (e.g., 'dualnback-classic', 'stroop')
 * @param globalDPrime - Aggregate d' for SDT-based modes
 * @param byModality - SDT counts per modality (for Jaeggi/BW evaluators)
 */
function calculateNextLevelFromSpec(
  nLevel: number,
  passed: boolean,
  gameMode: string,
  globalDPrime: number,
  byModality: Record<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >,
  currentStrikes?: number,
): number {
  return recommendNextLevelForTempo({
    currentLevel: nLevel,
    gameMode,
    byModality,
    globalDPrime,
    passed,
    currentStrikes,
  }).nextLevel;
}

/**
 * Simple next level calculation for non-Tempo modes.
 * These modes don't have downThreshold in their specs.
 */
function calculateNextLevel(nLevel: number, passed: boolean): number {
  if (passed) {
    return nLevel + 1;
  }
  return Math.max(1, nLevel);
}

/**
 * Calculate accuracy from tempo session byModality stats.
 * accuracy = (hits + correctRejections) / totalResponses
 */
function calculateTempoAccuracy(
  byModality: Record<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >,
): number {
  let totalHits = 0;
  let totalCR = 0;
  let totalMisses = 0;
  let totalFA = 0;

  for (const stats of Object.values(byModality)) {
    totalHits += stats.hits;
    totalCR += stats.correctRejections;
    totalMisses += stats.misses;
    totalFA += stats.falseAlarms;
  }

  const total = totalHits + totalCR + totalMisses + totalFA;
  if (total === 0) return 0;

  return (totalHits + totalCR) / total;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function computeBrainWorkshopStrikesAfter(input: {
  readonly currentLevel: number;
  readonly byModality: Record<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >;
  readonly strikesBefore: number;
}): number {
  let totalHits = 0;
  let totalMisses = 0;
  let totalFA = 0;

  for (const stats of Object.values(input.byModality)) {
    totalHits += stats.hits;
    totalMisses += stats.misses;
    totalFA += stats.falseAlarms;
  }

  const denom = totalHits + totalMisses + totalFA;
  const scorePercent = denom > 0 ? Math.floor((totalHits * 100) / denom) : 0;

  const strikesBefore = clampInt(input.strikesBefore, 0, BW_STRIKES_TO_DOWN - 1);
  if (scorePercent >= BW_SCORE_UP_PERCENT) return 0;
  if (scorePercent < BW_SCORE_DOWN_PERCENT) {
    const newStrikes = strikesBefore + 1;
    if (newStrikes >= BW_STRIKES_TO_DOWN) return 0;
    return clampInt(newStrikes, 0, BW_STRIKES_TO_DOWN - 1);
  }
  return strikesBefore;
}

function requirePlayContextFromEvents(
  events: readonly GameEvent[],
): 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' {
  const startEvent = events.find((event) => SESSION_START_EVENT_TYPES.has(event.type)) as
    | { playContext?: 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' }
    | undefined;

  if (!startEvent) {
    throw new Error('[SessionCompletionProjector] Missing session start event');
  }
  if (
    startEvent.playContext !== 'journey' &&
    startEvent.playContext !== 'free' &&
    startEvent.playContext !== 'synergy' &&
    startEvent.playContext !== 'calibration' &&
    startEvent.playContext !== 'profile'
  ) {
    throw new Error('[SessionCompletionProjector] Missing playContext on session start event');
  }
  return startEvent.playContext;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

function extractJourneySnapshotFromEvents(events: readonly GameEvent[]): {
  readonly journeyId?: string;
  readonly journeyStageId?: number;
} {
  let journeyId: string | undefined;
  let journeyStageId: number | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    const record =
      event && typeof event === 'object' ? (event as unknown as Record<string, unknown>) : null;
    if (!record) continue;
    if (journeyId === undefined) {
      journeyId = toNonEmptyString(record['journeyId']);
    }
    if (journeyStageId === undefined) {
      journeyStageId = toPositiveInt(record['journeyStageId']);
    }
    if (journeyId !== undefined && journeyStageId !== undefined) break;
  }
  return { journeyId, journeyStageId };
}

function enrichReportWithEventContext(
  report: SessionEndReportModel,
  events: readonly GameEvent[],
): SessionEndReportModel {
  const playContext = requirePlayContextFromEvents(events);
  const journeySnapshot = playContext === 'journey' ? extractJourneySnapshotFromEvents(events) : {};

  const journeyId =
    playContext === 'journey'
      ? (report.journeyId ?? report.journeyContext?.journeyId ?? journeySnapshot.journeyId)
      : undefined;

  const journeyStageId =
    playContext === 'journey'
      ? (report.journeyStageId ?? report.journeyContext?.stageId ?? journeySnapshot.journeyStageId)
      : undefined;

  return {
    ...report,
    playContext,
    ...(playContext === 'journey' ? { nextStep: undefined } : {}),
    ...(journeyId ? { journeyId } : {}),
    ...(journeyStageId ? { journeyStageId } : {}),
  };
}

function toBadgeHistoryView(
  snapshot: NonNullable<XPContextInput['badgeHistory']>,
): BadgeContext['history'] {
  return {
    maxNLevel: snapshot.maxNLevel,
    daysSinceLastSession: snapshot.daysSinceLastSession,
    bestDPrime: snapshot.bestDPrime,
    sessionsWithoutFocusLoss: 0,
    getStreak: () => ({ current: snapshot.currentStreak, best: snapshot.bestStreak }),
    getEarlyMorningDaysCount: () => snapshot.earlyMorningDays,
    getLateNightDaysCount: () => snapshot.lateNightDays,
  };
}

/**
 * Extract focus metrics from events.
 * Counts FOCUS_LOST events and sums lostDurationMs from FOCUS_REGAINED events.
 */
function extractFocusStats(events: readonly GameEvent[]): FocusStats {
  const focusLostEvents = events.filter((e) => e.type === 'FOCUS_LOST');
  const focusRegainedEvents = events.filter(
    (e): e is GameEvent & { lostDurationMs: number } => e.type === 'FOCUS_REGAINED',
  );
  const focusLostTotalMs = focusRegainedEvents.reduce((sum, e) => sum + e.lostDurationMs, 0);
  return {
    focusLostCount: focusLostEvents.length,
    focusLostTotalMs,
  };
}

// =============================================================================
// Main Projector
// =============================================================================

export class SessionCompletionProjector {
  /**
   * Project complete session completion data.
   * This is a PURE function - no side effects, no persistence.
   *
   * @param input - Mode-specific input with events and context
   * @returns Complete session completion result, or null if projection fails
   */
  static project(input: SessionCompletionInput): SessionCompletionResult | null {
    switch (input.mode) {
      case 'tempo':
        return SessionCompletionProjector.projectTempo(input);
      case 'flow':
        return SessionCompletionProjector.projectFlow(input);
      case 'recall':
        return SessionCompletionProjector.projectRecall(input);
      case 'dual-pick':
        return SessionCompletionProjector.projectDualPick(input);
      case 'trace':
        return SessionCompletionProjector.projectTrace(input);
      case 'ospan':
        return SessionCompletionProjector.projectOspan(input);
      case 'cognitive-task':
        return SessionCompletionProjector.projectCognitiveTask(input);
      default:
        return null;
    }
  }

  /**
   * Project completion result WITH XP calculation.
   * Requires additional context for XP (streaks, badges, etc.)
   *
   * @param input - Mode-specific input
   * @param xpContext - Context for XP calculation (from history/progression)
   * @returns Complete result including XP breakdown
   */
  static projectWithXP(
    input: SessionCompletionInput,
    xpContext: XPContextInput,
  ): SessionCompletionWithXPResult | null {
    const result = SessionCompletionProjector.project(input);
    if (!result) return null;
    const isCompletedSession =
      ('completed' in result.summary && result.summary.completed === true) ||
      result.report.reason === 'completed';

    // Check for new badges (only for Tempo sessions with full context)
    let newBadges: BadgeDefinition[] = [];
    if (
      isCompletedSession &&
      input.mode === 'tempo' &&
      xpContext.currentProgression &&
      'outcomes' in result.summary
    ) {
      let userHistory: BadgeContext['history'] | null = null;
      if (xpContext.badgeHistory) {
        userHistory = toBadgeHistoryView(xpContext.badgeHistory);
      } else if (xpContext.sessionHistory) {
        // Legacy fallback: SessionHistoryItem[] can be passed directly to UserHistory.fromHistoryItems
        userHistory = UserHistory.fromHistoryItems([...xpContext.sessionHistory]);
      }
      if (userHistory) {
        const userProgression = UserProgression.fromRecord(
          {
            ...xpContext.currentProgression,
            uninterruptedSessionsStreak:
              xpContext.currentProgression.uninterruptedSessionsStreak ?? 0,
          },
          [],
        );
        const unlockedIds = new Set(xpContext.existingBadgeIds);

        const badgeContext: BadgeContext = {
          session: result.summary as SessionSummary,
          events: input.events,
          history: userHistory,
          progression: userProgression,
        };

        newBadges = checkNewBadges(badgeContext, unlockedIds);
      }
    }

    // Determine if in flow state (high UPS = flow)
    const isInFlow = isCompletedSession && result.ups.score >= XP_FLOW_UPS_THRESHOLD;

    // Extract confidence score from UPS components
    const confidenceScore = result.ups.components.confidence;

    // Calculate XP using unified engine
    const xpBreakdown = calculateSessionXP({
      session: result.summary,
      newBadges,
      streakDays: xpContext.streakDays,
      isFirstOfDay: xpContext.isFirstOfDay,
      confidenceScore,
      isInFlow,
      sessionsToday: xpContext.sessionsToday,
    });

    return {
      ...result,
      xpBreakdown,
      newBadges,
      isInFlow,
    };
  }

  // ===========================================================================
  // Mode-Specific Projections
  // ===========================================================================

  private static projectTempo(input: TempoCompletionInput): SessionCompletionResult | null {
    // 1. Project summary
    const tempoProjection = projectTempoSessionEntrypoint({
      sessionId: input.sessionId,
      gameMode: input.gameMode,
      events: input.events,
    });
    if (!tempoProjection) return null;

    const summary: SessionSummary = tempoProjection.summary;
    const eventsForProjection = tempoProjection.eventsForProjection;

    // 2. Calculate UPS
    const upsResult = UPSProjector.projectTempo(eventsForProjection);
    if (!upsResult) return null;

    // 3. Calculate passed using centralized logic
    const passed = calculateTempoSessionPassed({
      generator: input.generator,
      gameMode: input.gameMode,
      byModality: summary.finalStats.byModality,
      globalDPrime: summary.finalStats.globalDPrime,
    });

    // 4. Calculate next level (spec-driven: uses Jaeggi/BW evaluators when appropriate)
    const nextLevel = calculateNextLevelFromSpec(
      summary.nLevel,
      passed,
      input.gameMode,
      summary.finalStats.globalDPrime,
      summary.finalStats.byModality,
      input.currentStrikes,
    );

    // 5. Extract focus stats
    const focusStats = extractFocusStats(eventsForProjection);

    // 6. Calculate confidence debug data
    const trials = eventsForProjection.filter(
      (e): e is import('./events').TrialPresentedEvent => e.type === 'TRIAL_PRESENTED',
    );
    const responses = eventsForProjection.filter(
      (e): e is import('./events').UserResponseEvent => e.type === 'USER_RESPONDED',
    );
    const misfireCount = eventsForProjection.filter((e) => e.type === 'INPUT_MISFIRED').length;
    const duplicateCount = eventsForProjection.filter(
      (e) => e.type === 'DUPLICATE_RESPONSE_DETECTED',
    ).length;
    const responseData = extractTempoResponseData(trials, responses, input.activeModalities);

    // Use appropriate calculator based on game mode
    const isDualnbackClassicMode =
      input.gameMode === 'dualnback-classic' || input.generator === 'DualnbackClassic';
    const accuracy = calculateTempoAccuracy(summary.finalStats.byModality);

    // Get confidence spec from mode (spec-driven weights)
    const confidenceSpec = getConfidenceSpecFromMode(input.gameMode);
    const confidenceDebug = isDualnbackClassicMode
      ? JaeggiConfidenceCalculator.calculateWithDebug(
          responseData,
          accuracy,
          isDualnbackClassicConfidenceSpec(confidenceSpec) ? confidenceSpec : undefined,
          {
            misfireCount,
            duplicateCount,
            focusLostCount: focusStats.focusLostCount,
            focusLostTotalMs: focusStats.focusLostTotalMs,
          },
        )
      : TempoConfidenceCalculator.calculateWithDebug(
          responseData,
          confidenceSpec && !isDualnbackClassicConfidenceSpec(confidenceSpec)
            ? confidenceSpec
            : undefined,
          {
            misfireCount,
            duplicateCount,
            focusLostCount: focusStats.focusLostCount,
            focusLostTotalMs: focusStats.focusLostTotalMs,
          },
        );

    // 7. Generate report
    const brainWorkshopStrikesBefore =
      input.gameMode === 'sim-brainworkshop'
        ? clampInt(typeof input.currentStrikes === 'number' ? input.currentStrikes : 0, 0, 2)
        : undefined;
    const brainWorkshopStrikesAfter =
      input.gameMode === 'sim-brainworkshop'
        ? computeBrainWorkshopStrikesAfter({
            currentLevel: summary.nLevel,
            byModality: summary.finalStats.byModality,
            strikesBefore: brainWorkshopStrikesBefore ?? 0,
          })
        : undefined;

    const report = convertTempoSession({
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      gameMode: mapModeToReportMode('tempo', input.gameMode),
      gameModeLabel: input.gameModeLabel,
      activeModalities: input.activeModalities,
      passed,
      nextLevel,
      journeyContext: input.journeyContext,
      ups: upsResult.ups,
      focusStats,
      confidenceDebug,
      brainWorkshopStrikesBefore,
      brainWorkshopStrikesAfter,
    });
    const reportWithPlayContext = enrichReportWithEventContext(report, eventsForProjection);

    return {
      mode: 'tempo',
      sessionId: input.sessionId,
      ups: upsResult.ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: input.activeModalities,
    };
  }

  private static projectFlow(input: PlaceCompletionInput): SessionCompletionResult | null {
    // 1. Project extended summary (FlowExtendedSummary extends PlaceSessionSummary)
    const summary = PlaceSessionProjector.project(input.events);
    if (!summary) return null;

    // 2. Calculate UPS
    const upsResult = UPSProjector.projectFlow(input.events);
    if (!upsResult) return null;

    // 3. Calculate passed using centralized logic
    const accuracy = summary.finalStats.accuracy;
    const passed = calculatePlaceSessionPassed(accuracy);

    // 4. Calculate next level
    const nextLevel = calculateNextLevel(summary.nLevel, passed);

    // 5. Generate report
    const report = convertPlaceSession({
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      activeModalities: input.activeModalities,
      byModalityStats: summary.extendedStats.byModality,
      avgPlacementTimeMs: summary.extendedStats.avgPlacementTimeMs,
      confidenceScore: summary.confidenceScore,
      directnessRatio: input.directnessRatio,
      wrongSlotDwellMs: input.wrongSlotDwellMs,
      gameModeLabel: input.gameModeLabel,
      passed,
      nextLevel,
      journeyContext: input.journeyContext,
      ups: upsResult.ups,
    });
    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    return {
      mode: 'flow',
      sessionId: input.sessionId,
      ups: upsResult.ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: input.activeModalities,
    };
  }

  private static projectRecall(input: MemoCompletionInput): SessionCompletionResult | null {
    // 1. Project extended summary (MemoExtendedSummary extends MemoSessionSummary)
    const summary = MemoSessionProjector.projectExtended(input.events, input.trials);
    if (!summary) return null;

    // 2. Calculate UPS
    const upsResult = UPSProjector.projectRecall(input.events, input.trials);
    if (!upsResult) return null;

    // 3. Calculate passed using centralized logic
    const accuracy = summary.finalStats.accuracy;
    const passed = calculateMemoSessionPassed(accuracy);

    // 4. Calculate next level
    const nextLevel = calculateNextLevel(summary.nLevel, passed);

    // 5. Generate report
    const report = convertMemoSession({
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      activeModalities: input.activeModalities,
      gameModeLabel: input.gameModeLabel,
      passed,
      nextLevel,
      journeyContext: input.journeyContext,
      ups: upsResult.ups,
      confidenceScore: input.confidenceScore ?? summary.avgConfidenceScore ?? undefined,
      fluencyScore: input.fluencyScore ?? summary.fluencyScore,
      correctionsCount: input.correctionsCount,
    });
    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    return {
      mode: 'recall',
      sessionId: input.sessionId,
      ups: upsResult.ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: input.activeModalities,
    };
  }

  private static projectDualPick(input: DualPickCompletionInput): SessionCompletionResult | null {
    // 1. Project extended summary (DualPickExtendedSummary extends DualPickSessionSummary)
    const summary = DualPickSessionProjector.project(input.events);
    if (!summary) return null;

    // 2. Calculate UPS
    const upsResult = UPSProjector.projectDualPick(input.events);
    if (!upsResult) return null;

    // 3. Calculate passed using centralized logic
    const accuracy = summary.finalStats.accuracy;
    const passed = calculateDualPickSessionPassed(accuracy);

    // 4. Calculate next level
    const nextLevel = calculateNextLevel(summary.nLevel, passed);

    // 5. Generate report
    const report = convertDualPickSession({
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      activeModalities: input.activeModalities,
      avgPlacementTimeMs: input.avgPlacementTimeMs ?? summary.extendedStats.avgPlacementTimeMs,
      confidenceScore: input.confidenceScore ?? summary.confidenceScore,
      directnessRatio: input.directnessRatio,
      wrongSlotDwellMs: input.wrongSlotDwellMs,
      gameModeLabel: input.gameModeLabel,
      passed,
      nextLevel,
      journeyContext: input.journeyContext,
      ups: upsResult.ups,
    });
    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    return {
      mode: 'dual-pick',
      sessionId: input.sessionId,
      ups: upsResult.ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: input.activeModalities,
    };
  }

  private static projectTrace(input: TraceCompletionInput): SessionCompletionResult | null {
    const summary = input.summary;

    // 1. Calculate UPS (Trace doesn't have events-based projector, use summary)
    const accuracy = summary.finalStats.accuracy;
    const confidence = input.confidenceScore ?? accuracy; // Use accuracy as fallback

    // Use Flow calculator since Trace is similar (accuracy-based)
    // @see thresholds.ts (SSOT) for UPS_ACCURACY_WEIGHT and UPS_CONFIDENCE_WEIGHT
    const ups = {
      score: Math.round(
        100 * accuracy ** UPS_ACCURACY_WEIGHT * confidence ** UPS_CONFIDENCE_WEIGHT,
      ),
      components: {
        accuracy: Math.round(accuracy * 100),
        confidence: Math.round(confidence * 100),
      },
      journeyEligible: accuracy >= UPS_TIER_INTERMEDIATE_ACCURACY,
      tier:
        accuracy >= UPS_TIER_ELITE_ACCURACY
          ? 'elite'
          : accuracy >= UPS_TIER_ADVANCED_ACCURACY
            ? 'advanced'
            : accuracy >= UPS_TIER_INTERMEDIATE_ACCURACY
              ? 'intermediate'
              : 'novice',
    } as UnifiedPerformanceScore;

    // 2. Calculate passed using centralized logic
    const passed = calculateTraceSessionPassed(accuracy);

    // 3. Calculate next level
    const nextLevel = calculateNextLevel(summary.nLevel, passed);

    // 4. Generate report
    const report = convertTraceSession({
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      activeModalities: input.activeModalities,
      gameModeLabel: input.gameModeLabel,
      passed,
      nextLevel,
      journeyContext: input.journeyContext,
      ups,
      confidenceScore: input.confidenceScore,
    });
    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    return {
      mode: 'trace',
      sessionId: input.sessionId,
      ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: input.activeModalities,
    };
  }

  // Removed: projectTime, projectTrack, projectCorsi, projectRunningSpan, projectPasat, projectSwm (deleted game modes)
  // ===========================================================================
  // OSPAN Mode
  // ===========================================================================

  private static projectOspan(input: OspanCompletionInput): SessionCompletionResult | null {
    const accuracy = input.accuracy / 100;
    const completed = input.reason === 'completed';
    const ups = UnifiedScoreCalculator.calculate(
      input.accuracy,
      input.maxSpan > 0 ? (input.maxSpan / 7) * 100 : null,
      false,
      'ospan',
    );
    const passed =
      completed && input.isValidMeasure && accuracy >= AllSpecs['ospan'].scoring.passThreshold;
    const nextLevel = input.maxSpan;
    const createdAt = new Date(input.events[0]?.timestamp ?? Date.now()).toISOString();

    const report: SessionEndReportModel = {
      sessionId: input.sessionId,
      createdAt,
      reason: input.reason,
      gameMode: 'ospan',
      gameModeLabel: input.gameModeLabel,
      nLevel: input.maxSpan,
      activeModalities: [],
      trialsCount: input.totalSets,
      durationMs: input.durationMs,
      ups,
      unifiedAccuracy: accuracy,
      modeScore: {
        labelKey: 'report.modeScore.ospanSpan',
        value: input.maxSpan,
        unit: 'score',
      },
      passed,
      totals: {
        hits: input.correctSets,
        misses: Math.max(0, input.totalSets - input.correctSets),
        falseAlarms: null,
        correctRejections: null,
      },
      byModality: {},
      errorProfile: {
        errorRate: 1 - accuracy,
        missShare: 1,
        faShare: null,
      },
    };

    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    const summary: TraceSessionSummary = {
      sessionId: input.sessionId,
      nLevel: input.maxSpan,
      totalTrials: input.totalSets,
      rhythmMode: 'self-paced',
      durationMs: input.durationMs,
      completed,
      score: Math.round(accuracy * 100),
      responses: [],
      finalStats: {
        trialsCompleted: input.totalSets,
        warmupTrials: 0,
        correctResponses: input.correctSets,
        incorrectResponses: Math.max(0, input.totalSets - input.correctSets),
        timeouts: 0,
        accuracy,
      },
    };

    return {
      mode: 'ospan',
      sessionId: input.sessionId,
      ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: [],
    };
  }

  private static projectCognitiveTask(
    input: CognitiveTaskCompletionInput,
  ): SessionCompletionResult | null {
    const accuracy = input.accuracy / 100;
    const completed = input.reason === 'completed';
    const endEvent = input.events.find((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED') as
      | Record<string, unknown>
      | undefined;
    const taskMetrics = (endEvent?.['metrics'] as Readonly<Record<string, unknown>>) ?? undefined;
    const derivedLevel = deriveCognitiveTaskLevelFromMetrics(taskMetrics);
    const ups = UnifiedScoreCalculator.calculate(
      input.accuracy,
      input.meanRtMs ? Math.max(0, 100 - input.meanRtMs / 10) : null,
      false,
      input.taskType,
    );
    const spec = AllSpecs[input.taskType as keyof typeof AllSpecs];
    const passThreshold = spec?.scoring?.passThreshold ?? 0.6;
    const passed = completed && accuracy >= passThreshold;
    const nextLevel = derivedLevel ?? input.maxLevel ?? 1;
    const createdAt = new Date(input.events[0]?.timestamp ?? Date.now()).toISOString();

    // Extract signal-detection totals from metrics when available
    const metricHits = typeof taskMetrics?.['hits'] === 'number' ? taskMetrics['hits'] : null;
    const metricFA =
      typeof taskMetrics?.['falseAlarms'] === 'number' ? taskMetrics['falseAlarms'] : null;
    const metricCR =
      typeof taskMetrics?.['correctRejections'] === 'number'
        ? taskMetrics['correctRejections']
        : null;
    const metricMisses = typeof taskMetrics?.['misses'] === 'number' ? taskMetrics['misses'] : null;

    const hits = metricHits ?? input.correctTrials;
    const misses = metricMisses ?? Math.max(0, input.totalTrials - input.correctTrials);

    const report: SessionEndReportModel = {
      sessionId: input.sessionId,
      createdAt,
      reason: input.reason,
      gameMode: 'cognitive-task',
      gameModeLabel: input.gameModeLabel,
      taskType: input.taskType,
      nLevel: nextLevel,
      activeModalities: [],
      trialsCount: input.totalTrials,
      durationMs: input.durationMs,
      ups,
      unifiedAccuracy: accuracy,
      modeScore: {
        labelKey: spec?.report?.display?.modeScoreKey ?? 'report.modeScore.accuracy',
        value: Math.round(accuracy * 100),
        unit: '%',
      },
      passed,
      totals: {
        hits,
        misses,
        falseAlarms: metricFA,
        correctRejections: metricCR,
      },
      byModality: {},
      errorProfile: {
        errorRate: 1 - accuracy,
        missShare: metricFA != null ? misses / (misses + (metricFA ?? 0) || 1) : 1,
        faShare: metricFA != null ? (metricFA ?? 0) / (misses + (metricFA ?? 0) || 1) : null,
      },
      taskMetrics,
      turns: projectCognitiveTaskTurns(input.events),
    };

    const reportWithPlayContext = enrichReportWithEventContext(report, input.events);

    const summary: TraceSessionSummary = {
      sessionId: input.sessionId,
      nLevel: nextLevel,
      totalTrials: input.totalTrials,
      rhythmMode: 'self-paced',
      durationMs: input.durationMs,
      completed,
      score: Math.round(accuracy * 100),
      responses: [],
      finalStats: {
        trialsCompleted: input.totalTrials,
        warmupTrials: 0,
        correctResponses: input.correctTrials,
        incorrectResponses: Math.max(0, input.totalTrials - input.correctTrials),
        timeouts: 0,
        accuracy,
      },
    };

    return {
      mode: 'cognitive-task' as SessionMode,
      sessionId: input.sessionId,
      ups,
      passed,
      nextLevel,
      summary,
      report: reportWithPlayContext,
      journeyContext: input.journeyContext,
      activeModalities: [],
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Detect session mode from events.
   */
  static detectMode(events: readonly GameEvent[]): SessionMode {
    return UPSProjector.detectMode(events);
  }
}
