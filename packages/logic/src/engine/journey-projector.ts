/**
 * Journey Projector
 *
 * Calcule l'état du parcours d'entraînement à partir des événements.
 * Le parcours est une PROJECTION - toujours recalculable depuis les events.
 *
 * Principe:
 * - Events = source de vérité (immutable)
 * - JourneyState = vue calculée (rebuildable)
 */

import {
  JOURNEY_MIN_PASSING_SCORE,
  getSessionsRequired,
  generateJourneyStages,
  getTotalStagesForTarget,
  isSimulatorMode,
} from '../domain/journey/constants';
import {
  aggregateRawStats,
  computeBrainWorkshopScoreFromRaw,
  computeDualnbackClassicScoreFromRaw,
} from '../domain/journey/scoring';
import type { SDTCounts } from '../types/core';
import {
  SimulatorSpecs,
  getAcceptedGameModesForJourney,
  ALTERNATING_JOURNEY_SECOND_MODE,
} from '../specs/journey.spec';
import {
  classifyDnbZone as classifyDnbZoneFromErrors,
  computeTotalErrors,
  estimateTotalErrorsFromScore,
  createInitialBlockState,
  stepHybridBlock,
  resolveBlockConfig,
  blockStateToHybridProgress,
} from '../domain/journey/hybrid-block-machine';
import {
  DPRIME_TO_PERCENT_BASE,
  DPRIME_TO_PERCENT_DIVISOR,
  DPRIME_TO_PERCENT_MULTIPLIER,
  PROGRESSION_SCORE_UP,
  PROGRESSION_SCORE_STRIKE,
  PROGRESSION_STRIKES_TO_DOWN,
  SCORE_MAX,
  SDT_DPRIME_PASS,
} from '../specs/thresholds';
import { evaluateJaeggiProgression } from '../domain/n-level-evaluator';
import { JOURNEY_DEFAULT_TARGET_LEVEL } from '../types/journey';
import type { JourneyStageProgress, JourneyState } from '../types/journey';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampPct(value: number): number {
  return clamp(value, 0, 100);
}

// =============================================================================
// Canonical Journey Projection Session Type
// =============================================================================

/**
 * Minimal session shape required by the journey projector.
 *
 * This is the single canonical type that all callers (infra adapter, UI queries)
 * should target when feeding sessions into `projectJourneyFromHistory`.
 */
export interface JourneyProjectionSession {
  readonly sessionId?: string;
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  readonly nLevel?: number;
  readonly dPrime: number;
  readonly gameMode?: string;
  readonly upsScore?: number;
  readonly timestamp?: number;
  readonly byModality?: Record<string, SDTCounts>;
  /** Pre-computed passed boolean from session_summaries (fallback when byModality is missing). */
  readonly passed?: boolean;
  /** Adaptive path progress (0-100) from the DualTrackPathProfile, if available. */
  readonly adaptivePathProgressPct?: number;
}

export interface HybridJourneyProjectionOptions {
  readonly trackSessionsPerBlock?: number;
  readonly dnbSessionsPerBlock?: number;
}

// =============================================================================
// Jaeggi Decision (error-count based, no score indirection)
// =============================================================================

type JaeggiDecision = 'up' | 'stay' | 'down';

/**
 * Jaeggi 2008 protocol decision.
 *
 * Delegates to the canonical evaluateJaeggiProgression() when byModality is
 * available, with fallbacks for legacy sessions without modality data.
 */
function getJaeggiDecision(session: JourneyProjectionSession): JaeggiDecision {
  if (session.byModality) {
    const entries = Object.entries(session.byModality);
    if (entries.length === 0) return 'stay';

    // Guard against passive/idle runs (0 hits across all modalities).
    const totalHits = entries.reduce((sum, [, s]) => sum + s.hits, 0);
    if (totalHits <= 0) {
      const maxErrors = Math.max(...entries.map(([, s]) => s.misses + s.falseAlarms));
      // evaluateJaeggiProgression would UP on low errors, but that's wrong for
      // a session with 0 hits. Only allow DOWN if errors are high enough.
      return maxErrors > 5 ? 'down' : 'stay';
    }

    const result = evaluateJaeggiProgression({
      currentNLevel: session.nLevel ?? 1,
      byModality: new Map(entries),
    });
    if (result.delta > 0) return 'up';
    if (result.delta < 0) return 'down';
    return 'stay';
  }

  // Fallback for legacy sessions without byModality:
  // `passed=false` cannot distinguish Jaeggi "stay" (3-5 errors) from "down" (>5),
  // so we only force UP on explicit pass, otherwise STAY.
  if (session.passed !== undefined) {
    return session.passed ? 'up' : 'stay';
  }

  // Infer from available score fields (UPS / derived score).
  const score = getSessionScore(session);
  if (score >= JOURNEY_MIN_PASSING_SCORE) return 'up';
  if (score < PROGRESSION_SCORE_STRIKE) return 'down';
  return 'stay';
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Vérifie si un score est suffisant pour être comptabilisé dans le parcours.
 */
export function isValidatingScore(score: number): boolean {
  return score >= JOURNEY_MIN_PASSING_SCORE;
}

/**
 * Vérifie si une étape est terminée (sessions suffisantes pour le meilleur score).
 */
export function isStageComplete(progress: JourneyStageProgress): boolean {
  if (progress.status === 'completed') return true;
  if (progress.bestScore === null) return false;
  const required = getSessionsRequired(progress.bestScore);
  return progress.validatingSessions >= required;
}

/**
 * Calcule le ratio de progression d'une étape (0 à 1).
 */
export function getStageProgressRatio(progress: JourneyStageProgress): number {
  if (progress.status === 'completed') return 1;
  if (progress.bestScore === null) return 0;
  const required = getSessionsRequired(progress.bestScore);
  if (required === Infinity) return 0;
  return Math.min(1, progress.validatingSessions / required);
}

// =============================================================================
// Empty State
// =============================================================================

/**
 * Crée un état vide du parcours (étape 1 débloquée)
 * @param isSimulator - Si true, génère 1 stage par niveau (simulateurs BW/Jaeggi)
 */
export function createEmptyJourneyState(
  targetLevel: number = JOURNEY_DEFAULT_TARGET_LEVEL,
  startLevel: number = 1,
  isSimulator: boolean = false,
): JourneyState {
  const stageDefinitions = generateJourneyStages(targetLevel, startLevel, isSimulator);
  const stages: JourneyStageProgress[] = stageDefinitions.map((stage, index) => ({
    stageId: stage.stageId,
    status: index === 0 ? 'unlocked' : 'locked',
    validatingSessions: 0,
    bestScore: null,
    progressPct: 0,
  }));

  return {
    currentStage: 1,
    stages,
    isActive: true, // Parcours actif par défaut pour nouveaux utilisateurs
    startLevel,
    targetLevel,
    isSimulator,
    acceptedSessionCount: 0,
  };
}

// =============================================================================
// State Helpers
// =============================================================================

/**
 * Récupère l'étape courante du parcours
 */
export function getCurrentStageProgress(state: JourneyState): JourneyStageProgress | null {
  const totalStages = getTotalStagesForTarget(
    state.targetLevel,
    state.startLevel,
    state.isSimulator,
  );
  if (state.currentStage > totalStages) return null; // Parcours terminé
  return state.stages.find((s) => s.stageId === state.currentStage) ?? null;
}

/**
 * Vérifie si le parcours est terminé
 */
export function isJourneyComplete(state: JourneyState): boolean {
  const totalStages = getTotalStagesForTarget(
    state.targetLevel,
    state.startLevel,
    state.isSimulator,
  );
  return state.currentStage > totalStages;
}

// =============================================================================
// Journey Score Calculation (Binary Modes Only)
// =============================================================================

/**
 * Calcule le score Journey approprié selon le mode de jeu.
 * Uses centralized scoring from domain/journey/scoring.ts.
 *
 * Only binary progression modes (sim-brainworkshop, dualnback-classic) are supported.
 *
 * @param byModality - Stats par modalité
 * @param gameMode - Mode de jeu ('sim-brainworkshop', 'dualnback-classic')
 * @returns Score en pourcentage (0-100)
 */
export function computeJourneyScore(
  byModality: Record<string, SDTCounts>,
  gameMode?: string,
): number {
  if (gameMode === 'sim-brainworkshop') {
    const aggregated = aggregateRawStats(byModality);
    // BrainWorkshop uses integer-truncated percent (BW v5 behavior).
    // Keep this aligned with evaluateBrainWorkshopProgression() to avoid threshold drift
    // around 50% (strike) and 80% (up).
    return Math.floor(computeBrainWorkshopScoreFromRaw(aggregated));
  }

  if (gameMode === 'dualnback-classic') {
    const { score } = computeDualnbackClassicScoreFromRaw(byModality);
    return score;
  }

  // Non-binary modes don't use journey scoring
  return 0;
}

// =============================================================================
// Session Score Extraction (Binary Modes Only)
// =============================================================================

/**
 * Extrait le score d'une session pour la progression binaire.
 *
 * Priorité:
 * 1. byModality stats → scoring natif du mode
 * 2. upsScore → pre-computed score (Flow, DualPick, tests)
 * 3. pre-computed `passed` boolean → SCORE_MAX ou 0 (sessions legacy)
 * 4. 0 (fallback)
 */
function getSessionScore(session: JourneyProjectionSession): number {
  // 1. Modality stats (Native)
  if (
    session.byModality &&
    (session.gameMode === 'sim-brainworkshop' || session.gameMode === 'dualnback-classic')
  ) {
    return computeJourneyScore(session.byModality, session.gameMode);
  }

  // 2. Pre-computed UPS score (Flow, DualPick, or explicit override in tests)
  if (session.upsScore !== undefined) {
    return session.upsScore;
  }

  // 3. Fallback for legacy sessions without byModality:
  // Use the pre-computed `passed` boolean from session_summaries.
  if (
    session.passed !== undefined &&
    (session.gameMode === 'sim-brainworkshop' || session.gameMode === 'dualnback-classic')
  ) {
    return session.passed ? SCORE_MAX : 0;
  }

  return 0;
}

/**
 * Projette l'état du parcours Journey depuis l'historique des sessions.
 * L'historique est la SOURCE DE VÉRITÉ unique.
 *
 * Seuls les modes à progression binaire sont supportés :
 * - dualnback-classic (Jaeggi 2008): UP/STAY/DOWN basé sur erreurs par modalité
 * - sim-brainworkshop: UP/STAY/STRIKE avec 3 strikes = DOWN
 *
 * Les modes non-binaires utilisent une progression standard (nombre de sessions validantes).
 *
 * @param sessions - Historique des sessions
 * @param targetLevel - Niveau cible du parcours
 * @param startLevel - Niveau de départ du parcours
 * @param journeyId - ID du parcours pour filtrer (undefined = toutes les sessions)
 * @param isSimulator - Si true, parcours simulateur avec 1 stage par niveau
 * @param gameMode - Mode de jeu pour déterminer le type de progression
 */
export function projectJourneyFromHistory(
  sessions: readonly JourneyProjectionSession[],
  targetLevel: number = JOURNEY_DEFAULT_TARGET_LEVEL,
  startLevel: number = 1,
  journeyId?: string,
  isSimulator: boolean = false,
  gameMode?: string,
  hybridOptions?: HybridJourneyProjectionOptions,
): JourneyState {
  const finalIsSimulator = isSimulator || isSimulatorMode(gameMode);
  const state = createEmptyJourneyState(targetLevel, startLevel, finalIsSimulator);

  const totalStages = getTotalStagesForTarget(targetLevel, startLevel, finalIsSimulator);

  // Filtrer les sessions Journey par journeyId si spécifié
  const journeySessions = sessions.filter((s) => {
    if (s.journeyStageId === undefined) return false;
    if (journeyId !== undefined) {
      return s.journeyId === journeyId;
    }
    return true;
  });

  // Phase 2: spec-driven dispatch via projectionKind
  const spec = gameMode ? SimulatorSpecs[gameMode] : undefined;

  if (spec) {
    switch (spec.projectionKind) {
      case 'continuous-dprime':
        return projectDualCatchJourney(journeySessions, state, totalStages);

      case 'alternating':
        return projectAlternatingJourney(
          journeySessions,
          state,
          totalStages,
          targetLevel,
          startLevel,
          hybridOptions,
        );

      case 'continuous-score':
        return projectDualTrackJourney(journeySessions, state, totalStages);

      case 'binary': {
        const stageDefinitions = generateJourneyStages(targetLevel, startLevel, finalIsSimulator);
        const rulesetId = spec.indicator?.rulesetId ?? 'jaeggi';
        const decisionFn = resolveBinaryDecisionFn(rulesetId);
        return projectBinaryJourney(
          journeySessions,
          state,
          stageDefinitions,
          totalStages,
          startLevel,
          decisionFn,
          rulesetId === 'brainworkshop',
        );
      }
    }
  }

  // Non-spec modes: standard progression (non-binary)
  return projectStandardJourney(journeySessions, state, totalStages);
}

function computeDualCatchJourneyScorePctFromDPrime(dPrime: number): number {
  if (!Number.isFinite(dPrime)) return 0;
  const raw =
    DPRIME_TO_PERCENT_BASE + (dPrime / DPRIME_TO_PERCENT_DIVISOR) * DPRIME_TO_PERCENT_MULTIPLIER;
  return Math.round(clamp(raw, 0, 100));
}

/**
 * Continuous Dual Catch progression.
 *
 * Skeleton (tunable later):
 * - Each completed session grants a progress gain (in % points).
 * - Gain increases with d' (better performance fills faster).
 * - Progress is clamped to [0, 100] and is monotonic by default.
 */
function computeDualCatchProgressGainPct(dPrime: number): number {
  // Target: ~10–15 sessions to fill a stage when the user is in the ease band (~d' 2.2).
  // Always grant at least 1% to avoid "stuck" stages during skeleton phase.
  const safeDPrime = Number.isFinite(dPrime) ? dPrime : 0;

  if (safeDPrime >= 2.5) return 10;
  if (safeDPrime >= 2.0) return 8;
  if (safeDPrime >= SDT_DPRIME_PASS) return 7;
  if (safeDPrime >= 1.0) return 4;
  return 1;
}

/**
 * Dual Track progress delta per session.
 *
 * Progress is tier-driven in the adaptive path (DualTrackPathProfile).
 * This projector fallback uses a conservative estimate so the journey card
 * stays roughly in sync. Each step ≈ 1 tier out of ~15 (medium) → ~7%.
 */
function computeDualTrackProgressDeltaPct(score: number): number {
  const safeScore = Number.isFinite(score) ? score : 0;

  if (safeScore >= 90) return 7;
  if (safeScore >= 80) return 5;
  if (safeScore >= 70) return 3;
  if (safeScore >= 60) return 1;
  if (safeScore >= 50) return -2;
  return -4;
}

function projectDualCatchJourney(
  sessions: readonly JourneyProjectionSession[],
  state: JourneyState,
  totalStages: number,
): JourneyState {
  const sessionsByStage = new Map<number, JourneyProjectionSession[]>();
  for (const session of sessions) {
    if (session.journeyStageId === undefined) continue;
    if (session.journeyStageId < 1 || session.journeyStageId > totalStages) continue;
    const existing = sessionsByStage.get(session.journeyStageId) ?? [];
    existing.push(session);
    sessionsByStage.set(session.journeyStageId, existing);
  }

  let maxCompletedStageId = 0;

  for (let stageId = 1; stageId <= totalStages; stageId++) {
    const stageProgress = state.stages[stageId - 1];
    if (!stageProgress) continue;

    const stageSessions = sessionsByStage.get(stageId) ?? [];

    let validatingSessions = 0;
    let bestScore: number | null = null;
    let progressPct = 0;

    for (const session of stageSessions) {
      const dPrime = session.dPrime;

      if (Number.isFinite(dPrime) && dPrime >= SDT_DPRIME_PASS) {
        validatingSessions++;
      }

      const scorePct = computeDualCatchJourneyScorePctFromDPrime(dPrime);
      bestScore = bestScore === null ? scorePct : Math.max(bestScore, scorePct);

      progressPct = clampPct(progressPct + computeDualCatchProgressGainPct(dPrime));
    }

    stageProgress.validatingSessions = validatingSessions;
    stageProgress.bestScore = bestScore;
    stageProgress.progressPct = progressPct;

    if (progressPct >= 100) {
      stageProgress.status = 'completed';
      maxCompletedStageId = stageId;
    } else {
      const isFirst = stageId === 1;
      const prevCompleted = stageId > 1 && state.stages[stageId - 2]?.status === 'completed';
      stageProgress.status = isFirst || prevCompleted ? 'unlocked' : 'locked';
    }
  }

  state.currentStage = Math.min(maxCompletedStageId + 1, totalStages + 1);
  return state;
}

function projectDualTrackJourney(
  sessions: readonly JourneyProjectionSession[],
  state: JourneyState,
  totalStages: number,
): JourneyState {
  const sessionsByStage = new Map<number, JourneyProjectionSession[]>();
  for (const session of sessions) {
    if (session.journeyStageId === undefined) continue;
    if (session.journeyStageId < 1 || session.journeyStageId > totalStages) continue;
    const existing = sessionsByStage.get(session.journeyStageId) ?? [];
    existing.push(session);
    sessionsByStage.set(session.journeyStageId, existing);
  }

  let maxCompletedStageId = 0;

  for (let stageId = 1; stageId <= totalStages; stageId++) {
    const stageProgress = state.stages[stageId - 1];
    if (!stageProgress) continue;

    const stageSessions = sessionsByStage.get(stageId) ?? [];
    let validatingSessions = 0;
    let bestScore: number | null = null;
    let progressPct = 0;

    const sortedStageSessions = [...stageSessions].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    );

    for (const session of sortedStageSessions) {
      const score = getSessionScore(session);

      if (isValidatingScore(score)) {
        validatingSessions++;
      }

      bestScore = bestScore === null ? score : Math.max(bestScore, score);
      if (progressPct >= 100) {
        continue;
      }

      // Use adaptive path progress as single source of truth when available
      if (typeof session.adaptivePathProgressPct === 'number') {
        progressPct = clampPct(session.adaptivePathProgressPct);
      } else {
        progressPct = clampPct(progressPct + computeDualTrackProgressDeltaPct(score));
      }
    }

    stageProgress.validatingSessions = validatingSessions;
    stageProgress.bestScore = bestScore;
    stageProgress.progressPct = progressPct;

    if (progressPct >= 100) {
      stageProgress.status = 'completed';
      maxCompletedStageId = stageId;
    } else {
      const isFirst = stageId === 1;
      const prevCompleted = stageId > 1 && state.stages[stageId - 2]?.status === 'completed';
      stageProgress.status = isFirst || prevCompleted ? 'unlocked' : 'locked';
    }
  }

  state.currentStage = Math.min(maxCompletedStageId + 1, totalStages + 1);
  state.acceptedSessionCount = sessions.length;
  return state;
}

function classifySessionZone(
  session: JourneyProjectionSession,
): import('../domain/journey/hybrid-block-machine').HybridZone {
  const totalErrors = computeTotalErrors(session.byModality);
  if (totalErrors !== null) return classifyDnbZoneFromErrors(totalErrors);
  return classifyDnbZoneFromErrors(estimateTotalErrorsFromScore(getSessionScore(session)));
}

function projectAlternatingJourney(
  sessions: readonly JourneyProjectionSession[],
  state: JourneyState,
  totalStages: number,
  targetLevel: number,
  startLevel: number,
  options?: HybridJourneyProjectionOptions,
): JourneyState {
  const config = resolveBlockConfig(options);
  const sortedSessions = [...sessions].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const acceptedModes = new Set(getAcceptedGameModesForJourney('dual-track-dnb-hybrid') ?? []);
  const stageDefinitions = generateJourneyStages(targetLevel, startLevel, true);
  // Only use DNB sessions to determine the starting nLevel — Track sessions
  // store targetCount (MOT targets) in nLevel, which is a different semantic.
  const earliestDnbNLevel = sortedSessions.find(
    (s) => s.gameMode === ALTERNATING_JOURNEY_SECOND_MODE && typeof s.nLevel === 'number',
  )?.nLevel;
  let currentNLevel =
    typeof earliestDnbNLevel === 'number'
      ? Math.min(targetLevel, Math.max(startLevel, earliestDnbNLevel))
      : startLevel;
  const maxNLevel = targetLevel;
  let lowestNLevel = startLevel;
  let acceptedSessionCount = 0;
  const levelStats = new Map<number, { validatingCount: number; bestScore: number | null }>();
  let blockState = createInitialBlockState();

  for (const session of sortedSessions) {
    if (currentNLevel > maxNLevel) break;
    if (!session.gameMode || !acceptedModes.has(session.gameMode)) continue;
    // Only filter by nLevel for DNB sessions — Track sessions store targetCount
    // in nLevel (MOT targets to track), which has a completely different semantic
    // from the N-back level used for progression.
    const isDnb = session.gameMode === ALTERNATING_JOURNEY_SECOND_MODE;
    if (isDnb && typeof session.nLevel === 'number' && session.nLevel !== currentNLevel) continue;

    const zone = session.gameMode === 'dualnback-classic' ? classifySessionZone(session) : null;
    const stepResult = stepHybridBlock(blockState, session.gameMode, zone, config);
    if (!stepResult.accepted) continue;

    acceptedSessionCount++;
    blockState = stepResult.nextState;

    // Track DNB stats per level (only for DNB sessions)
    if (session.gameMode === 'dualnback-classic') {
      const stats = levelStats.get(currentNLevel) ?? { validatingCount: 0, bestScore: null };
      const score = getSessionScore(session);
      stats.bestScore = stats.bestScore === null ? score : Math.max(stats.bestScore, score);
      if (zone === 'clean') {
        stats.validatingCount += 1;
      }
      levelStats.set(currentNLevel, stats);
    }

    if (stepResult.decision !== null) {
      if (stepResult.decision === 'clean') {
        currentNLevel = currentNLevel >= maxNLevel ? maxNLevel + 1 : currentNLevel + 1;
      } else if (stepResult.decision === 'down') {
        currentNLevel = Math.max(currentNLevel - 1, 1);
        lowestNLevel = Math.min(lowestNLevel, currentNLevel);
      }
      // 'stay' → currentNLevel unchanged
      blockState = createInitialBlockState();
    }
  }

  if (lowestNLevel < startLevel) {
    state.suggestedStartLevel = lowestNLevel;
  }

  const currentStageId = Math.max(1, currentNLevel - startLevel + 1);
  const currentHybridProgress =
    currentNLevel <= maxNLevel ? blockStateToHybridProgress(blockState, config) : undefined;

  for (const stageDef of stageDefinitions) {
    const { stageId, nLevel } = stageDef;
    const stageIndex = stageId - 1;
    const stats = levelStats.get(nLevel);
    const isCompleted = currentNLevel > nLevel;
    const isUnlocked = stageId <= currentStageId;
    const isCurrent = nLevel === currentNLevel && !isCompleted;

    state.stages[stageIndex] = {
      stageId,
      status: isCompleted ? 'completed' : isUnlocked ? 'unlocked' : 'locked',
      validatingSessions: stats?.validatingCount ?? (isCompleted ? 1 : 0),
      bestScore: stats?.bestScore ?? null,
      hybridProgress: isCurrent ? currentHybridProgress : undefined,
      progressPct: isCompleted
        ? 100
        : isCurrent
          ? Math.round(
              ((blockState.trackCount + blockState.dnbCount) /
                (config.trackSessionsPerBlock + config.dnbSessionsPerBlock)) *
                100,
            )
          : 0,
    };
  }

  state.currentStage = Math.min(currentStageId, totalStages + 1);
  state.acceptedSessionCount = acceptedSessionCount;
  state.nextSessionGameMode =
    state.currentStage > totalStages
      ? undefined
      : blockState.phase === 'track'
        ? 'dual-track'
        : 'dualnback-classic';
  return state;
}

/**
 * Projette un parcours standard (non-simulateur, non-binaire).
 * Basé sur l'accumulation de sessions validantes par stage.
 */
function projectStandardJourney(
  sessions: readonly JourneyProjectionSession[],
  state: JourneyState,
  totalStages: number,
): JourneyState {
  // 1. Grouper les sessions par stageId
  const sessionsByStage = new Map<number, JourneyProjectionSession[]>();
  for (const session of sessions) {
    if (session.journeyStageId === undefined) continue;
    const existing = sessionsByStage.get(session.journeyStageId) ?? [];
    existing.push(session);
    sessionsByStage.set(session.journeyStageId, existing);
  }

  // 2. Traiter chaque stage dans l'ordre
  let maxCompletedStageId = 0;

  for (let stageId = 1; stageId <= totalStages; stageId++) {
    const stageSessions = sessionsByStage.get(stageId) ?? [];
    const stageProgress = state.stages[stageId - 1];
    if (!stageProgress) continue;

    let validatingCount = 0;
    let bestScore: number | null = null;

    for (const session of stageSessions) {
      const score = getSessionScore(session);
      if (isValidatingScore(score)) {
        validatingCount++;
      }
      if (bestScore === null || score > (bestScore ?? -1)) {
        bestScore = score;
      }
    }

    stageProgress.validatingSessions = validatingCount;
    stageProgress.bestScore = bestScore;

    // Déterminer le statut
    if (isStageComplete(stageProgress)) {
      stageProgress.status = 'completed';
      maxCompletedStageId = stageId;
    } else {
      // Débloqué si c'est le premier ou si le précédent est complété
      const isFirst = stageId === 1;
      const prevCompleted = stageId > 1 && state.stages[stageId - 2]?.status === 'completed';

      if (isFirst || prevCompleted) {
        stageProgress.status = 'unlocked';
      } else {
        stageProgress.status = 'locked';
      }
    }
  }

  // L'étape courante est celle après la dernière complétée
  state.currentStage = Math.min(maxCompletedStageId + 1, totalStages + 1);
  state.acceptedSessionCount = sessions.length;

  return state;
}

// =============================================================================
// Unified Binary Progression (Phase 2)
// =============================================================================

/**
 * Decision function for a single session in a binary journey.
 * Returns the progression decision and updated strike count.
 */
type BinaryDecisionFn = (
  session: JourneyProjectionSession,
  strikes: number,
) => { decision: 'up' | 'stay' | 'down'; newStrikes: number };

/** Jaeggi 2008 decision: error-count based, no strikes. */
function makeJaeggiDecisionFn(): BinaryDecisionFn {
  return (session, strikes) => ({
    decision: getJaeggiDecision(session),
    newStrikes: strikes, // Jaeggi has no strike system
  });
}

/**
 * BrainWorkshop decision: score-based with 3-strike down.
 *
 * Uses getSessionScore() (which delegates to computeJourneyScore for BW mode)
 * and applies the BW strike protocol. The N-level floor is NOT enforced here —
 * the projection loop handles clamping to min 1.
 *
 * Note: we cannot delegate to evaluateBrainWorkshopProgression() because that
 * evaluator guards against N=1 internally (skipping strikes), while the projector
 * must still accumulate strikes at any level and let the loop clamp the result.
 */
function makeBwDecisionFn(): BinaryDecisionFn {
  return (session, strikes) => {
    const score = getSessionScore(session);
    if (score >= PROGRESSION_SCORE_UP) {
      return { decision: 'up', newStrikes: 0 };
    }
    if (score < PROGRESSION_SCORE_STRIKE) {
      const newStrikes = strikes + 1;
      if (newStrikes >= PROGRESSION_STRIKES_TO_DOWN) {
        return { decision: 'down', newStrikes: 0 };
      }
      return { decision: 'stay', newStrikes };
    }
    return { decision: 'stay', newStrikes: strikes };
  };
}

/** Accuracy decision (dual-trace): passed → up, else stay. No down, no strikes. */
function makeAccuracyDecisionFn(): BinaryDecisionFn {
  return (session, strikes) => {
    // Use passed boolean if available, otherwise use score
    if (session.passed !== undefined) {
      return { decision: session.passed ? 'up' : 'stay', newStrikes: strikes };
    }
    const score = getSessionScore(session);
    return { decision: isValidatingScore(score) ? 'up' : 'stay', newStrikes: strikes };
  };
}

/** Resolve the decision function from a spec's rulesetId. */
function resolveBinaryDecisionFn(rulesetId: string): BinaryDecisionFn {
  switch (rulesetId) {
    case 'jaeggi':
      return makeJaeggiDecisionFn();
    case 'brainworkshop':
      return makeBwDecisionFn();
    case 'trace-accuracy':
    case 'accuracy':
      return makeAccuracyDecisionFn();
    default:
      return makeJaeggiDecisionFn(); // conservative fallback
  }
}

/**
 * Unified binary journey projector.
 * Works for Jaeggi, BrainWorkshop, and accuracy-based binary modes.
 */
function projectBinaryJourney(
  sessions: readonly JourneyProjectionSession[],
  state: JourneyState,
  stageDefinitions: readonly { stageId: number; nLevel: number }[],
  totalStages: number,
  startLevel: number,
  decisionFn: BinaryDecisionFn,
  hasStrikes: boolean,
): JourneyState {
  const sortedSessions = [...sessions].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const maxNLevel = startLevel + totalStages - 1;
  const earliestPlayedNLevel = sortedSessions.find((s) => typeof s.nLevel === 'number')?.nLevel;
  let currentNLevel =
    typeof earliestPlayedNLevel === 'number'
      ? Math.min(maxNLevel, Math.max(startLevel, earliestPlayedNLevel))
      : startLevel;
  let lowestNLevel = currentNLevel;
  let strikes = 0;

  const levelStats = new Map<
    number,
    { bestScore: number; attempts: number; validatingCount: number }
  >();

  for (const session of sortedSessions) {
    const sessionNLevel = session.nLevel;
    const score = getSessionScore(session);

    if (typeof sessionNLevel === 'number') {
      const existing = levelStats.get(sessionNLevel) ?? {
        bestScore: 0,
        attempts: 0,
        validatingCount: 0,
      };
      levelStats.set(sessionNLevel, {
        bestScore: Math.max(existing.bestScore, score),
        attempts: existing.attempts + 1,
        validatingCount: existing.validatingCount + (isValidatingScore(score) ? 1 : 0),
      });
    }

    if (typeof sessionNLevel !== 'number') continue;
    if (sessionNLevel !== currentNLevel) continue;

    const { decision, newStrikes } = decisionFn(session, strikes);
    strikes = newStrikes;

    if (decision === 'up') {
      currentNLevel = currentNLevel >= maxNLevel ? maxNLevel + 1 : currentNLevel + 1;
    } else if (decision === 'down') {
      currentNLevel = Math.max(currentNLevel - 1, 1);
      lowestNLevel = Math.min(lowestNLevel, currentNLevel);
    }
  }

  if (lowestNLevel < startLevel) {
    state.suggestedStartLevel = lowestNLevel;
  }

  const currentStageId = Math.max(1, currentNLevel - startLevel + 1);

  for (const stageDef of stageDefinitions) {
    const { stageId, nLevel } = stageDef;
    const stageIndex = stageId - 1;
    const stats = levelStats.get(nLevel);
    const isCompleted = currentNLevel > nLevel;
    const isUnlocked = stageId <= currentStageId;

    state.stages[stageIndex] = {
      stageId,
      status: isCompleted ? 'completed' : isUnlocked ? 'unlocked' : 'locked',
      validatingSessions: stats?.validatingCount ?? (isCompleted ? 1 : 0),
      bestScore: stats?.bestScore ?? null,
    };
  }

  state.currentStage = Math.min(currentStageId, totalStages + 1);

  // Only expose strikes for modes with a strike system (BW).
  // Setting 0 instead of undefined would incorrectly show lives UI on Jaeggi/accuracy modes.
  if (hasStrikes) {
    state.consecutiveStrikes = strikes;
  }

  return state;
}
