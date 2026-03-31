import type { JourneyRecordableSession, AttemptResult } from '../../ports/journey-port';
import {
  JAEGGI_ERRORS_DOWN,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  PROGRESSION_SCORE_STRIKE,
  PROGRESSION_SCORE_UP,
  PROGRESSION_STRIKES_TO_DOWN,
  SDT_DPRIME_PASS,
} from '../../specs/thresholds';
import type {
  HybridJourneyStageProgress,
  JourneyConfig,
  JourneyDecision,
  JourneyState,
} from '../../types/journey';
import { hasSDTStats } from '../../domain/journey/scoring';
import { computeJourneyScoreForSession, getScoringStrategyForMode } from './scoring';
import { resolveHybridJourneyStrategyConfig } from './strategy-config';
import {
  classifyDnbZone,
  computeTotalErrors,
  estimateTotalErrorsFromScore,
  hybridProgressToBlockState,
  stepHybridBlock,
  blockStateToHybridProgress,
  createInitialBlockState,
  resolveBlockConfig,
} from './hybrid-block-machine';
import { ALTERNATING_JOURNEY_FIRST_MODE } from '../../specs/journey.spec';

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeDualTrackProgressDeltaPct(score: number): number {
  const safeScore = Number.isFinite(score) ? score : 0;

  if (safeScore >= 99) return 24;
  if (safeScore >= 95) return 16;
  if (safeScore >= 90) return 10;
  if (safeScore >= 80) return 6;
  if (safeScore >= 70) return 4;
  if (safeScore >= 60) return 1;
  if (safeScore >= 50) return -3;
  return -6;
}

function computeDualCatchJourneyScorePctFromDPrime(dPrime: number): number {
  if (!Number.isFinite(dPrime)) return 0;
  const raw = 50 + (dPrime / 3) * 50;
  return clampPct(raw);
}

function computeDualCatchProgressGainPct(dPrime: number): number {
  const safeDPrime = Number.isFinite(dPrime) ? dPrime : 0;

  if (safeDPrime >= 2.5) return 10;
  if (safeDPrime >= 2.0) return 8;
  if (safeDPrime >= SDT_DPRIME_PASS) return 7;
  if (safeDPrime >= 1.0) return 4;
  return 1;
}

function getJaeggiDecisionFromSession(
  session: JourneyRecordableSession,
  score: number,
  passed: boolean,
): JourneyDecision {
  if (hasSDTStats(session)) {
    const modalities = Object.values(session.finalStats.byModality);
    if (modalities.length === 0) return 'stay';

    let maxErrors = 0;
    let totalHits = 0;
    for (const stats of modalities) {
      maxErrors = Math.max(maxErrors, stats.misses + stats.falseAlarms);
      totalHits += stats.hits;
    }

    if (totalHits <= 0) {
      if (maxErrors > JAEGGI_ERRORS_DOWN) return 'down';
      return 'stay';
    }
    if (maxErrors < JAEGGI_MAX_ERRORS_PER_MODALITY) return 'up';
    if (maxErrors > JAEGGI_ERRORS_DOWN) return 'down';
    return 'stay';
  }

  if (passed) return 'up';
  if (score < PROGRESSION_SCORE_STRIKE) return 'down';
  return 'stay';
}

function getCurrentStageProgress(
  state: JourneyState,
  stageId: number,
): {
  readonly validatingSessions: number;
  readonly bestScore: number | null;
  readonly progressPct?: number;
  readonly hybridProgress?: HybridJourneyStageProgress;
} {
  const stage = state.stages.find((item) => item.stageId === stageId);
  return {
    validatingSessions: stage?.validatingSessions ?? 0,
    bestScore: stage?.bestScore ?? null,
    progressPct: stage?.progressPct,
    hybridProgress: stage?.hybridProgress,
  };
}

export function decideJourneyAttempt(params: {
  readonly config: JourneyConfig;
  readonly currentState: JourneyState;
  readonly stageId: number;
  readonly session: JourneyRecordableSession;
}): AttemptResult {
  const { config, currentState, stageId, session } = params;
  const scoreResult = computeJourneyScoreForSession(
    session,
    getScoringStrategyForMode(config.gameMode),
  );
  const current = getCurrentStageProgress(currentState, stageId);
  const totalStages = currentState.stages.length;

  if (config.gameMode === 'dual-track') {
    // Use adaptive path progress as single source of truth when available
    const adaptivePct =
      'adaptivePathProgressPct' in session &&
      typeof (session as { adaptivePathProgressPct?: number }).adaptivePathProgressPct === 'number'
        ? (session as { adaptivePathProgressPct: number }).adaptivePathProgressPct
        : undefined;
    const nextProgressPct =
      adaptivePct !== undefined
        ? clampPct(adaptivePct)
        : clampPct(
            (current.progressPct ?? 0) + computeDualTrackProgressDeltaPct(scoreResult.score),
          );
    const stageCompleted = nextProgressPct >= 100;
    return {
      isValidating: scoreResult.passed,
      score: scoreResult.score,
      strategy: scoreResult.strategy,
      totalValidatingSessions: current.validatingSessions + (scoreResult.passed ? 1 : 0),
      sessionsRemaining: Math.max(0, 100 - nextProgressPct),
      progressPct: nextProgressPct,
      stageCompleted,
      nextStageUnlocked: stageCompleted && stageId < totalStages ? stageId + 1 : null,
      nextPlayableStage: stageCompleted ? (stageId < totalStages ? stageId + 1 : null) : stageId,
      bestScore:
        current.bestScore === null
          ? scoreResult.score
          : Math.max(current.bestScore, scoreResult.score),
    };
  }

  if (config.gameMode === 'dual-catch') {
    const dPrime = hasSDTStats(session) ? session.finalStats.globalDPrime : 0;
    const scorePct = computeDualCatchJourneyScorePctFromDPrime(dPrime);
    const nextProgressPct = clampPct(
      (current.progressPct ?? 0) + computeDualCatchProgressGainPct(dPrime),
    );
    const stageCompleted = nextProgressPct >= 100;
    return {
      isValidating: scorePct >= 80,
      score: scorePct,
      strategy: scoreResult.strategy,
      totalValidatingSessions: current.validatingSessions + (scorePct >= 80 ? 1 : 0),
      sessionsRemaining: Math.max(0, 100 - nextProgressPct),
      progressPct: nextProgressPct,
      stageCompleted,
      nextStageUnlocked: stageCompleted && stageId < totalStages ? stageId + 1 : null,
      nextPlayableStage: stageCompleted ? (stageId < totalStages ? stageId + 1 : null) : stageId,
      bestScore: current.bestScore === null ? scorePct : Math.max(current.bestScore, scorePct),
    };
  }

  if (config.gameMode === 'dual-track-dnb-hybrid') {
    const hybridStrategy = resolveHybridJourneyStrategyConfig(config);
    const blockConfig = resolveBlockConfig(hybridStrategy);
    const blockState = current.hybridProgress
      ? hybridProgressToBlockState(current.hybridProgress)
      : createInitialBlockState();

    // Compute zone for DNB sessions
    const rawErrors = hasSDTStats(session)
      ? computeTotalErrors(session.finalStats.byModality)
      : null;
    const totalErrors = rawErrors ?? estimateTotalErrorsFromScore(scoreResult.score);
    const zone = classifyDnbZone(totalErrors);

    const stepResult = stepHybridBlock(
      blockState,
      session.gameMode ?? '',
      session.gameMode === ALTERNATING_JOURNEY_FIRST_MODE ? null : zone,
      blockConfig,
    );

    const isTrackHalf = session.gameMode === ALTERNATING_JOURNEY_FIRST_MODE;
    const bestScore =
      current.bestScore === null
        ? scoreResult.score
        : Math.max(current.bestScore, scoreResult.score);

    // No decision yet — still mid-block
    if (stepResult.decision === null) {
      return {
        isValidating: scoreResult.passed,
        score: scoreResult.score,
        strategy: scoreResult.strategy,
        totalValidatingSessions:
          current.validatingSessions + (!isTrackHalf && zone === 'clean' ? 1 : 0),
        sessionsRemaining: Math.max(0, stepResult.cycleLength - stepResult.cycleProgress),
        progressPct: clampPct((stepResult.cycleProgress / stepResult.cycleLength) * 100),
        stageCompleted: false,
        nextStageUnlocked: null,
        nextPlayableStage: stageId,
        nextSessionGameMode: stepResult.nextSessionGameMode,
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: isTrackHalf ? 'track-half' : 'decision-half',
        journeyDecision: 'pending-pair',
        journeyNameShort: 'Hybride DNB + Track',
        bestScore,
        hybridProgress: blockStateToHybridProgress(stepResult.nextState, blockConfig),
      };
    }

    // Block decided
    const decision = stepResult.decision;
    const suggestedStartLevel =
      decision === 'down' && stageId === 1 && config.startLevel > 1
        ? config.startLevel - 1
        : undefined;
    return {
      isValidating: scoreResult.passed,
      score: scoreResult.score,
      strategy: scoreResult.strategy,
      totalValidatingSessions: current.validatingSessions + (zone === 'clean' ? 1 : 0),
      sessionsRemaining: 0,
      progressPct: decision === 'clean' ? 100 : 0,
      stageCompleted: decision === 'clean',
      nextStageUnlocked: decision === 'clean' && stageId < totalStages ? stageId + 1 : null,
      nextPlayableStage:
        decision === 'clean'
          ? stageId < totalStages
            ? stageId + 1
            : null
          : decision === 'down'
            ? suggestedStartLevel !== undefined
              ? 1
              : Math.max(1, stageId - 1)
            : stageId,
      nextSessionGameMode: stepResult.nextSessionGameMode,
      suggestedStartLevel,
      journeyProtocol: 'hybrid-jaeggi',
      sessionRole: 'decision-half',
      journeyDecision: decision === 'clean' ? 'up' : decision,
      journeyNameShort: 'Hybride DNB + Track',
      bestScore,
    };
  }

  if (config.gameMode === 'sim-brainworkshop') {
    const strikesBefore = currentState.consecutiveStrikes ?? 0;
    const validating = scoreResult.score >= PROGRESSION_SCORE_UP;
    if (validating) {
      return {
        isValidating: true,
        score: scoreResult.score,
        strategy: scoreResult.strategy,
        totalValidatingSessions: current.validatingSessions + 1,
        sessionsRemaining: 0,
        stageCompleted: true,
        nextStageUnlocked: stageId < totalStages ? stageId + 1 : null,
        nextPlayableStage: stageId < totalStages ? stageId + 1 : null,
        consecutiveStrikes: 0,
        bestScore:
          current.bestScore === null
            ? scoreResult.score
            : Math.max(current.bestScore, scoreResult.score),
      };
    }

    if (scoreResult.score < PROGRESSION_SCORE_STRIKE) {
      const strikesAfter = strikesBefore + 1;
      const suggestedStartLevel =
        strikesAfter >= PROGRESSION_STRIKES_TO_DOWN && stageId === 1 && config.startLevel > 1
          ? config.startLevel - 1
          : undefined;
      return {
        isValidating: false,
        score: scoreResult.score,
        strategy: scoreResult.strategy,
        totalValidatingSessions: current.validatingSessions,
        sessionsRemaining: 0,
        stageCompleted: false,
        nextStageUnlocked: null,
        nextPlayableStage:
          strikesAfter >= PROGRESSION_STRIKES_TO_DOWN
            ? suggestedStartLevel !== undefined
              ? 1
              : Math.max(1, stageId - 1)
            : stageId,
        consecutiveStrikes: strikesAfter >= PROGRESSION_STRIKES_TO_DOWN ? 0 : strikesAfter,
        suggestedStartLevel,
        bestScore:
          current.bestScore === null
            ? scoreResult.score
            : Math.max(current.bestScore, scoreResult.score),
      };
    }

    return {
      isValidating: false,
      score: scoreResult.score,
      strategy: scoreResult.strategy,
      totalValidatingSessions: current.validatingSessions,
      sessionsRemaining: 0,
      stageCompleted: false,
      nextStageUnlocked: null,
      nextPlayableStage: stageId,
      consecutiveStrikes: strikesBefore,
      bestScore:
        current.bestScore === null
          ? scoreResult.score
          : Math.max(current.bestScore, scoreResult.score),
    };
  }

  const jaeggiDecision = getJaeggiDecisionFromSession(
    session,
    scoreResult.score,
    scoreResult.passed,
  );
  const suggestedStartLevel =
    jaeggiDecision === 'down' && stageId === 1 && config.startLevel > 1
      ? config.startLevel - 1
      : undefined;
  return {
    isValidating: scoreResult.passed,
    score: scoreResult.score,
    strategy: scoreResult.strategy,
    totalValidatingSessions: current.validatingSessions + (scoreResult.passed ? 1 : 0),
    sessionsRemaining: 0,
    stageCompleted: jaeggiDecision === 'up',
    nextStageUnlocked: jaeggiDecision === 'up' && stageId < totalStages ? stageId + 1 : null,
    nextPlayableStage:
      jaeggiDecision === 'up'
        ? stageId < totalStages
          ? stageId + 1
          : null
        : jaeggiDecision === 'down'
          ? suggestedStartLevel !== undefined
            ? 1
            : Math.max(1, stageId - 1)
          : stageId,
    suggestedStartLevel,
    journeyProtocol: config.gameMode === 'dualnback-classic' ? 'jaeggi' : undefined,
    journeyDecision: jaeggiDecision,
    bestScore:
      current.bestScore === null
        ? scoreResult.score
        : Math.max(current.bestScore, scoreResult.score),
  };
}
