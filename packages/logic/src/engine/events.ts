/**
 * Game Events - MINIMAL SET
 *
 * Seuls les événements non-dérivables sont stockés.
 * Les projections (TRIAL_COMPLETED, stats, etc.) sont calculées à la demande.
 *
 * Principe: stocker les FAITS, calculer les ANALYSES.
 */

import { z } from 'zod';
import {
  ARITHMETIC_ANSWERS,
  COLORS,
  IMAGE_MODALITY_SHAPES,
  POSITIONS,
  SOUNDS,
  TONE_VALUES,
  type ModalityId,
} from '../types/core';
import { ModeSpecSchema } from '../specs/validation';
import type { Immutable } from '../types/utils';
import type {
  ModalityRunningStats,
  ModalityTrialOutcome,
  RunningStats,
  TrialOutcome,
} from '../types/events';

// Re-export TrialResult for convenience
export type { TrialResult } from '../types/core';

// =============================================================================
// Base Event
// =============================================================================

// Re-export projection/result types (non-event data structures)
export * from '../types/events';

// =============================================================================
// Standard Emmett Event Envelope
// =============================================================================

/**
 * Standard Emmett event envelope with causation and correlation metadata.
 * Used to track command-to-event causality and correlate related events.
 */
export interface EventEnvelope<TType extends string, TData extends Record<string, unknown>> {
  type: TType;
  data: TData;
  metadata: {
    causationId: string; // ID de la commande qui a causé l'événement
    correlationId?: string; // ID pour corréler les événements liés
    timestamp: Date; // Timestamp métier (non stockage)
    schemaVersion: string; // Version du schéma d'événement
  };
}

/**
 * Helper pour créer une enveloppe événement standard Emmett.
 * Le causationId est obligatoire (provient de la commande).
 * Le correlationId est optionnel (permet de suivre une chaîne d'événements liés).
 */
export function createEmmettEventEnvelope<
  TType extends string,
  TData extends Record<string, unknown>,
>(
  type: TType,
  data: TData,
  causationCommandId: string,
  correlationId?: string,
): EventEnvelope<TType, TData> {
  return {
    type,
    data,
    metadata: {
      causationId: causationCommandId,
      correlationId,
      timestamp: new Date(),
      schemaVersion: '1.0', // TODO: rendre configurable via EVENT_SCHEMA_VERSION
    },
  };
}

// =============================================================================
// Helper Types used in Schemas (that might not be in types/events)
// =============================================================================

// (Any local types needed for Zod schemas below)

// =============================================================================
// Helpers pour accès aux stats par modalité
// =============================================================================

const EMPTY_MODALITY_STATS: ModalityRunningStats = {
  hits: 0,
  misses: 0,
  falseAlarms: 0,
  correctRejections: 0,
  avgRT: null,
  dPrime: 0,
};

const EMPTY_TRIAL_OUTCOME: ModalityTrialOutcome = {
  result: 'correctRejection',
  reactionTime: null,
  wasLure: false,
};

/** Récupère les stats d'une modalité depuis RunningStats (avec fallback) */
export function getModalityStats(
  stats: RunningStats,
  modalityId: ModalityId,
): ModalityRunningStats {
  return stats.byModality[modalityId] ?? EMPTY_MODALITY_STATS;
}

/** Récupère le résultat d'un trial pour une modalité (avec fallback) */
export function getTrialModalityOutcome(
  outcome: TrialOutcome,
  modalityId: ModalityId,
): ModalityTrialOutcome {
  return outcome.byModality[modalityId] ?? EMPTY_TRIAL_OUTCOME;
}

/** Calcule les totaux hits/misses/etc. pour toutes les modalités */
export function getTotalStats(stats: RunningStats): {
  totalHits: number;
  totalMisses: number;
  totalFalseAlarms: number;
  totalCorrectRejections: number;
} {
  let totalHits = 0;
  let totalMisses = 0;
  let totalFalseAlarms = 0;
  let totalCorrectRejections = 0;

  if (stats.byModality) {
    for (const modalityStats of Object.values(stats.byModality)) {
      totalHits += modalityStats.hits;
      totalMisses += modalityStats.misses;
      totalFalseAlarms += modalityStats.falseAlarms;
      totalCorrectRejections += modalityStats.correctRejections;
    }
  }

  return { totalHits, totalMisses, totalFalseAlarms, totalCorrectRejections };
}

/** Extrait tous les temps de réaction d'un outcome */
export function getAllReactionTimes(outcome: TrialOutcome): number[] {
  const rts: number[] = [];
  for (const modalityOutcome of Object.values(outcome.byModality)) {
    if (modalityOutcome.reactionTime !== null) {
      rts.push(modalityOutcome.reactionTime);
    }
  }
  return rts;
}

// =============================================================================
// Zod Schemas (for cloud event validation)
// =============================================================================

const NonEmptyStringSchema = z.string().min(1);
const IdSchema = NonEmptyStringSchema;

const TimestampMsSchema = z.number().int().nonnegative().finite();
const NonNegativeIntSchema = z.number().int().nonnegative().finite();
const NonNegativeMsSchema = z.number().nonnegative().finite();

const ProbabilitySchema = z.number().min(0).max(1).finite();

const NLevelSchema = z.number().int().min(1).max(20);
const TrialsCountSchema = z.number().int().min(1).max(500);
const TrialIndexSchema = z.number().int().nonnegative();

const BaseEventSchema = z
  .object({
    id: IdSchema,
    timestamp: TimestampMsSchema,
    sessionId: IdSchema,
    schemaVersion: z.literal(1),
  })
  .strict();

const DeviceInfoSchema = z
  .object({
    platform: z.enum(['web', 'android', 'ios']),
    // 0 is allowed to represent "unknown" (e.g. missing PlatformInfoPort in some environments/tests).
    screenWidth: z.number().int().nonnegative().finite(),
    screenHeight: z.number().int().nonnegative().finite(),
    userAgent: NonEmptyStringSchema,
    touchCapable: z.boolean(),
    volumeLevel: z.number().min(0).max(1).finite().nullable().optional(),
    appVersion: NonEmptyStringSchema.optional(),
    eventLoopLagMs: z.number().nonnegative().finite().optional(),
  })
  .strict();

const TemporalContextSchema = z
  .object({
    timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']),
    localHour: z.number().int().min(0).max(23),
    dayOfWeek: z.number().int().min(0).max(6),
    timezone: NonEmptyStringSchema,
  })
  .strict();

const FeedbackChannelSchema = z.enum(['visual', 'audio', 'haptic']);
const FeedbackModeSchema = z.record(NonEmptyStringSchema, z.array(FeedbackChannelSchema));

const GeneratorNameSchema = z.enum(['Aleatoire', 'BrainWorkshop', 'DualnbackClassic', 'Sequence']);

const BlockConfigSchema = z
  .object({
    nLevel: NLevelSchema,
    activeModalities: z.array(NonEmptyStringSchema),
    trialsCount: TrialsCountSchema,
    targetProbability: ProbabilitySchema,
    lureProbability: ProbabilitySchema,
    intervalSeconds: z.number().positive().finite(),
    stimulusDurationSeconds: z.number().positive().finite(),
    generator: GeneratorNameSchema,
    feedbackMode: FeedbackModeSchema.optional(),
  })
  .strict();

const PositionSchema = z.union(
  POSITIONS.map((p) => z.literal(p)) as [
    z.ZodLiteral<(typeof POSITIONS)[number]>,
    ...z.ZodLiteral<(typeof POSITIONS)[number]>[],
  ],
);
// Dual Trace can run on real grids (3×4 / 4×4), so positions may exceed the classic 0..7 pool.
// We keep PositionSchema strict for legacy modes and use TracePositionSchema for TRACE_* events.
const TracePositionSchema = z.number().int().min(0).max(15);
const SoundSchema = z.enum(SOUNDS);
const ColorSchema = z.enum(COLORS);
const ImageShapeSchema = z.enum(IMAGE_MODALITY_SHAPES);
const TrialTypeSchema = z.enum(['V-Seul', 'A-Seul', 'Dual', 'Non-Cible', 'Tampon']);
const LureTypeSchema = z.enum(['n-1', 'n+1', 'sequence']);
const ArithmeticAnswerSchema = z.union(
  ARITHMETIC_ANSWERS.map((a) => z.literal(a)) as [
    z.ZodLiteral<(typeof ARITHMETIC_ANSWERS)[number]>,
    ...z.ZodLiteral<(typeof ARITHMETIC_ANSWERS)[number]>[],
  ],
);

const ArithmeticProblemSchema = z
  .object({
    operand1: z.number().int().finite(),
    operator: z.enum(['+', '-', '*', '/']),
    operand2: z.number().int().finite(),
    answer: ArithmeticAnswerSchema,
  })
  .strict();

// Trial schema (fully enumerated to avoid silent corruption)
const TrialSchema = z
  .object({
    index: TrialIndexSchema,
    isBuffer: z.boolean(),
    position: PositionSchema,
    sound: SoundSchema,
    color: ColorSchema,
    image: ImageShapeSchema,
    trialType: TrialTypeSchema,
    // Ground truth flags
    isPositionTarget: z.boolean(),
    isPosition2Target: z.boolean().optional(),
    isPosition3Target: z.boolean().optional(),
    isPosition4Target: z.boolean().optional(),
    isVis1Target: z.boolean().optional(),
    isVis2Target: z.boolean().optional(),
    isVis3Target: z.boolean().optional(),
    isVis4Target: z.boolean().optional(),
    isSoundTarget: z.boolean(),
    isColorTarget: z.boolean(),
    isImageTarget: z.boolean(),
    // Combination modalities (Brain Workshop)
    vis: SoundSchema.optional(),
    isVisVisTarget: z.boolean().optional(),
    isVisAudioTarget: z.boolean().optional(),
    isAudioVisTarget: z.boolean().optional(),
    // Lure detection
    isPositionLure: z.boolean().optional(),
    isPosition2Lure: z.boolean().optional(),
    isPosition3Lure: z.boolean().optional(),
    isPosition4Lure: z.boolean().optional(),
    isVis1Lure: z.boolean().optional(),
    isVis2Lure: z.boolean().optional(),
    isVis3Lure: z.boolean().optional(),
    isVis4Lure: z.boolean().optional(),
    isSoundLure: z.boolean().optional(),
    isColorLure: z.boolean().optional(),
    isImageLure: z.boolean().optional(),
    isVisVisLure: z.boolean().optional(),
    isVisAudioLure: z.boolean().optional(),
    isAudioVisLure: z.boolean().optional(),
    positionLureType: LureTypeSchema.optional(),
    position2LureType: LureTypeSchema.optional(),
    position3LureType: LureTypeSchema.optional(),
    position4LureType: LureTypeSchema.optional(),
    vis1LureType: LureTypeSchema.optional(),
    vis2LureType: LureTypeSchema.optional(),
    vis3LureType: LureTypeSchema.optional(),
    vis4LureType: LureTypeSchema.optional(),
    soundLureType: LureTypeSchema.optional(),
    colorLureType: LureTypeSchema.optional(),
    imageLureType: LureTypeSchema.optional(),
    visvisLureType: LureTypeSchema.optional(),
    visaudioLureType: LureTypeSchema.optional(),
    audiovisLureType: LureTypeSchema.optional(),
    // Multi-stimulus support (Brain Workshop mode)
    positions: z.array(z.tuple([NonEmptyStringSchema, PositionSchema])).optional(),
    visValues: z.array(z.tuple([NonEmptyStringSchema, z.number().int().min(0).max(7)])).optional(),
    // Multi-audio support
    sound2: SoundSchema.optional(),
    isSound2Target: z.boolean().optional(),
    isSound2Lure: z.boolean().optional(),
    sound2LureType: LureTypeSchema.optional(),
    // Arithmetic modality (Brain Workshop mode)
    arithmeticNumber: z.number().int().finite().optional(),
    arithmeticOperation: z.enum(['add', 'subtract', 'multiply', 'divide']).optional(),
    effectiveNBack: z.number().int().min(1).max(20).optional(),
    arithmeticProblem: ArithmeticProblemSchema.optional(),
    isArithmeticTarget: z.boolean().optional(),
    isArithmeticLure: z.boolean().optional(),
    arithmeticLureType: LureTypeSchema.optional(),
  })
  .strict();

const FeedbackConfigSchema = z
  .object({
    visualFeedback: z.boolean(),
    audioFeedback: z.boolean(),
  })
  .strict();

const PlayContextSchema = z.enum(['journey', 'free', 'synergy', 'calibration', 'profile']);

const GameModeIdSchema = z.enum([
  'dualnback-classic',
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-place',
  'dual-memo',
  'dual-pick',
  'dual-trace',
  'dual-time',
  'corsi-block',
  'ospan',
  'running-span',
  'pasat',
  'swm',
  'dual-track',
  'dual-track-dnb-hybrid',
  'cognitive-task',
  'custom',
]);

function refineJourneyPlayContext(
  data: {
    type?: string;
    playContext: 'journey' | 'free' | 'synergy' | 'calibration' | 'profile';
    journeyStageId?: number;
    journeyId?: string;
    journeyStartLevel?: number;
    journeyTargetLevel?: number;
    journeyGameMode?: string;
    journeyName?: string;
    journeyStrategyConfig?: unknown;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.playContext === 'journey') {
    if (typeof data.journeyStageId !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'journeyStageId is required when playContext is "journey"',
        path: ['journeyStageId'],
      });
    }
    if (typeof data.journeyId !== 'string' || data.journeyId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'journeyId is required when playContext is "journey"',
        path: ['journeyId'],
      });
    }

    const isStartEvent =
      data.type === 'SESSION_STARTED' ||
      data.type === 'RECALL_SESSION_STARTED' ||
      data.type === 'FLOW_SESSION_STARTED' ||
      data.type === 'DUAL_PICK_SESSION_STARTED' ||
      data.type === 'TRACE_SESSION_STARTED';
    if (isStartEvent) {
      if (typeof data.journeyStartLevel !== 'number') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'journeyStartLevel is required on journey session start events',
          path: ['journeyStartLevel'],
        });
      }
      if (typeof data.journeyTargetLevel !== 'number') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'journeyTargetLevel is required on journey session start events',
          path: ['journeyTargetLevel'],
        });
      }
    }
    return;
  }

  // free
  if (data.journeyStageId !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyStageId must be undefined when playContext is "free"',
      path: ['journeyStageId'],
    });
  }
  if (data.journeyId !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyId must be undefined when playContext is "free"',
      path: ['journeyId'],
    });
  }
  if (data.journeyStartLevel !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyStartLevel must be undefined when playContext is "free"',
      path: ['journeyStartLevel'],
    });
  }
  if (data.journeyTargetLevel !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyTargetLevel must be undefined when playContext is "free"',
      path: ['journeyTargetLevel'],
    });
  }
  if (data.journeyGameMode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyGameMode must be undefined when playContext is "free"',
      path: ['journeyGameMode'],
    });
  }
  if (data.journeyName !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyName must be undefined when playContext is "free"',
      path: ['journeyName'],
    });
  }
  if (data.journeyStrategyConfig !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'journeyStrategyConfig must be undefined when playContext is "free"',
      path: ['journeyStrategyConfig'],
    });
  }
}

const JourneyStrategyConfigSchema = z
  .object({
    hybrid: z
      .object({
        trackSessionsPerBlock: z.number().int().min(1).max(10).optional(),
        dnbSessionsPerBlock: z.number().int().min(1).max(10).optional(),
      })
      .strict()
      .optional(),
    dualTrack: z
      .object({
        preset: z.enum(['easy', 'medium', 'hard']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const HybridJourneyStageProgressSchema = z
  .object({
    loopPhase: z.enum(['track', 'dnb']),
    trackSessionsCompleted: z.number().int().min(0),
    trackSessionsRequired: z.number().int().min(1),
    dnbSessionsCompleted: z.number().int().min(0),
    dnbSessionsRequired: z.number().int().min(1),
    decisionZone: z.enum(['clean', 'stay', 'down']).optional(),
    decisionStreakCount: z.number().int().min(0).optional(),
    decisionStreakRequired: z.number().int().min(1).optional(),
  })
  .strict();

const SessionStartedEventSchema = BaseEventSchema.extend({
  type: z.literal('SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  nLevel: NLevelSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  config: BlockConfigSchema,
  spec: ModeSpecSchema.optional(),
  gameMode: GameModeIdSchema.optional(),
  /**
   * Brain Workshop only: strikes already accumulated at this N-level when the session starts.
   * This makes history projections deterministic (no hidden external state required).
   */
  currentStrikes: z.number().int().min(0).max(2).optional(),
  trialsSeed: NonEmptyStringSchema.optional(),
  trialsHash: NonEmptyStringSchema.optional(),
  feedbackConfig: FeedbackConfigSchema.optional(),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  journeyStrategyConfig: JourneyStrategyConfigSchema.optional(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Session Health Metrics Schema
// =============================================================================

const ProcessingLagStatsSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite(),
    avg: z.number().finite(),
    p95: z.number().finite(),
  })
  .strict();

const SessionHealthMetricsSchema = z
  .object({
    processingLag: ProcessingLagStatsSchema,
    eventLoopLagAtStartMs: z.number().min(0).finite(),
    rtStabilityCV: z.number().min(0).finite(),
    focusLossCount: z.number().int().min(0).finite(),
    totalFocusLostMs: z.number().min(0).finite(),
    freezeCount: z.number().int().min(0).finite(),
    longTaskCount: z.number().int().min(0).finite(),
    reliabilityScore: z.number().min(0).max(100).finite(),
    quality: z.enum(['high', 'medium', 'degraded']),
  })
  .strict();

const SessionEndedEventSchema = BaseEventSchema.extend({
  type: z.literal('SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned', 'error']),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  // XP breakdown computed at session end (optional, added for unified XP engine)
  xpBreakdown: z
    .object({
      base: z.number().finite(),
      performance: z.number().finite(),
      accuracy: z.number().finite(),
      badgeBonus: z.number().finite(),
      streakBonus: z.number().finite(),
      dailyBonus: z.number().finite(),
      flowBonus: z.number().finite(),
      confidenceMultiplier: z.number().finite(),
      subtotalBeforeConfidence: z.number().finite(),
      total: z.number().finite(),
      dailyCapReached: z.boolean(),
    })
    .strict()
    .optional(),
  // Session health metrics for RT reliability assessment
  healthMetrics: SessionHealthMetricsSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const SessionImportedEventSchema = BaseEventSchema.extend({
  type: z.literal('SESSION_IMPORTED'),
  nLevel: NLevelSchema,
  dPrime: z.number(),
  passed: z.boolean(),
  trialsCount: TrialsCountSchema,
  durationMs: z.number().nonnegative().finite(),
  generator: GeneratorNameSchema,
  activeModalities: z.array(NonEmptyStringSchema),
  byModality: z.record(
    NonEmptyStringSchema,
    z
      .object({
        hits: NonNegativeIntSchema,
        misses: NonNegativeIntSchema,
        falseAlarms: NonNegativeIntSchema,
        correctRejections: NonNegativeIntSchema,
        avgRT: z.number().min(0).max(30000).finite().nullable(),
        dPrime: z.number().finite(),
      })
      .strict(),
  ),
  originalCreatedAt: NonEmptyStringSchema,
  reason: z.enum(['completed', 'abandoned', 'error']).optional(),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  journeyStrategyConfig: JourneyStrategyConfigSchema.optional(),
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
  // UPS metrics
  upsScore: z.number().optional(),
  upsAccuracy: z.number().optional(),
  upsConfidence: z.number().optional(),
  // Flow confidence metrics
  flowConfidenceScore: z.number().optional(),
  flowDirectnessRatio: z.number().optional(),
  flowWrongSlotDwellMs: z.number().optional(),
  // Recall confidence metrics
  recallConfidenceScore: z.number().optional(),
  recallFluencyScore: z.number().optional(),
  recallCorrectionsCount: z.number().optional(),
  // Timing metrics
  avgResponseTimeMs: z.number().optional(),
  medianResponseTimeMs: z.number().optional(),
  responseTimeStdDev: z.number().optional(),
  avgPressDurationMs: z.number().optional(),
  pressDurationStdDev: z.number().optional(),
  responsesDuringStimulus: z.number().optional(),
  responsesAfterStimulus: z.number().optional(),
  // Focus metrics
  focusLostCount: z.number().optional(),
  focusLostTotalMs: z.number().optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const TrialPresentedEventSchema = BaseEventSchema.extend({
  type: z.literal('TRIAL_PRESENTED'),
  trial: TrialSchema,
  isiMs: z.number().nonnegative().finite(),
  stimulusDurationMs: z.number().nonnegative().finite(),
  // Adaptive parameters (optional, for trajectory analysis)
  effectiveTargetProbability: ProbabilitySchema.optional(),
  effectiveLureProbability: ProbabilitySchema.optional(),
  adaptiveZone: z.number().int().min(0).finite().optional(),
  estimatedDPrime: z.number().finite().optional(),
  // Audio/visual sync snapshot (helps debug RT/phase reliability)
  syncMode: z.enum(['single-audio', 'multi-audio', 'visual-only']).optional(),
  audioSyncBufferMs: z.number().min(0).max(60000).finite().optional(),
  visualOffsetMs: z.number().min(-60000).max(60000).finite().optional(),
  useAudioDrivenVisualSync: z.boolean().optional(),
  // Scheduled stimulus start time on the audio clock (seconds)
  scheduledStimulusStartAudioTimeSec: z.number().min(0).max(1e9).finite().optional(),
  /**
   * Scheduling timestamps (performance.now, ms).
   * Used for A/V drift diagnostics (scheduled vs actual callbacks).
   */
  audioScheduleCalledAtMs: z.number().min(0).max(600000000).finite().optional(),
  scheduledAudioSyncAtMs: z.number().min(0).max(600000000).finite().optional(),
  scheduledStimulusShownAtMs: z.number().min(0).max(600000000).finite().optional(),
  scheduledStimulusHiddenAtMs: z.number().min(0).max(600000000).finite().optional(),
  // Per-trial callback timestamps (performance.now, ms) - filled progressively
  audioSyncAtMs: z.number().min(0).max(600000000).finite().optional(),
  stimulusShownAtMs: z.number().min(0).max(600000000).finite().optional(),
  stimulusHiddenAtMs: z.number().min(0).max(600000000).finite().optional(),
  audioEndedAtMs: z.number().min(0).max(600000000).finite().optional(),
  // Mouse input tracking
  cursorPosition: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
}).strict();

const UserResponseEventSchema = BaseEventSchema.extend({
  type: z.literal('USER_RESPONDED'),
  trialIndex: TrialIndexSchema,
  modality: NonEmptyStringSchema,
  reactionTimeMs: z.number().min(0).max(30000).finite(),
  pressDurationMs: z.number().min(0).max(30000).finite(),
  responsePhase: z.enum(['during_stimulus', 'after_stimulus']),
  inputMethod: z.enum(['keyboard', 'mouse', 'touch', 'gamepad', 'bot']).optional(),
  /** Correlation ID for UI pipeline telemetry */
  telemetryId: NonEmptyStringSchema.optional(),
  /** performance.now() captured at input time (keydown/pointerdown) */
  capturedAtMs: z.number().min(0).max(600000000).finite().optional(),
  /** performance.now() when stimulus was shown (audio callback → visual trigger) */
  stimulusShownAtMs: z.number().min(0).max(600000000).finite().optional(),
  /** performance.now() when stimulus was hidden (pre-hide trigger or audio-ended) */
  stimulusHiddenAtMs: z.number().min(0).max(600000000).finite().optional(),
  /** Audio clock at stimulus start reference (seconds) */
  stimulusStartAudioTimeSec: z.number().min(0).max(1e9).finite().optional(),
  /** Audio clock at response time (seconds) */
  responseAtAudioTimeSec: z.number().min(0).max(1e9).finite().optional(),
  /** Whether the stimulus is currently visible (machine-level) at response time */
  stimulusVisibleAtResponse: z.boolean().optional(),
  processingLagMs: z.number().min(0).max(60000).finite().optional(),
  wasTarget: z.boolean().optional(),
  isCorrect: z.boolean().optional(),
  // Brain Workshop arithmetic typed-answer (optional)
  answerText: NonEmptyStringSchema.optional(),
  // Mouse input tracking
  buttonPosition: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
  responseIndexInTrial: z.union([z.literal(0), z.literal(1)]).optional(),
}).strict();

const DuplicateResponseEventSchema = BaseEventSchema.extend({
  type: z.literal('DUPLICATE_RESPONSE_DETECTED'),
  trialIndex: TrialIndexSchema,
  modality: NonEmptyStringSchema,
  deltaSinceFirstMs: z.number().min(0).max(60000).finite(),
  inputMethod: z.enum(['keyboard', 'mouse', 'touch', 'gamepad', 'bot']).optional(),
  phase: z.enum(['stimulus', 'waiting']),
}).strict();

const ResponseFilteredEventSchema = BaseEventSchema.extend({
  type: z.literal('RESPONSE_FILTERED'),
  trialIndex: TrialIndexSchema,
  modality: NonEmptyStringSchema,
  reason: z.enum(['too_fast', 'touch_bounce']),
  reactionTimeMs: z.number().min(0).max(600000).finite().nullable().optional(),
  inputMethod: z.enum(['keyboard', 'mouse', 'touch', 'gamepad', 'bot']).optional(),
  phase: z.enum(['stimulus', 'waiting']),
  telemetryId: NonEmptyStringSchema.optional(),
  capturedAtMs: z.number().min(0).max(600000000).finite().optional(),
  processingLagMs: z.number().min(0).max(60000).finite().optional(),
  minValidRtMs: z.number().min(0).max(30000).finite().optional(),
  deltaSinceFirstMs: z.number().min(0).max(60000).finite().optional(),
}).strict();

const InputPipelineLatencyEventSchema = BaseEventSchema.extend({
  type: z.literal('INPUT_PIPELINE_LATENCY'),
  telemetryId: NonEmptyStringSchema.optional(),
  trialIndex: TrialIndexSchema,
  modality: NonEmptyStringSchema,
  inputMethod: z.enum(['keyboard', 'mouse', 'touch', 'gamepad', 'bot']).optional(),
  phase: z.enum(['stimulus', 'waiting']),
  /** performance.now() captured at input time (keydown/pointerdown) */
  capturedAtMs: z.number().min(0).max(600000000).finite(),
  /** performance.now() immediately after dispatch() returns (optional; UI may omit) */
  dispatchCompletedAtMs: z.number().min(0).max(600000000).finite().optional(),
  /** performance.now() captured right after the render commit (optional; UI may omit) */
  commitAtMs: z.number().min(0).max(600000000).finite().optional(),
  /** performance.now() captured after a paint (double rAF) */
  paintAtMs: z.number().min(0).max(600000000).finite(),
  /** dispatchCompletedAtMs - capturedAtMs */
  inputToDispatchMs: z.number().min(0).max(60000).finite().optional(),
  /** commitAtMs - capturedAtMs */
  inputToCommitMs: z.number().min(0).max(60000).finite().optional(),
  /** paintAtMs - capturedAtMs */
  inputToPaintMs: z.number().min(0).max(60000).finite().optional(),
}).strict();

const InputMisfiredEventSchema = BaseEventSchema.extend({
  type: z.literal('INPUT_MISFIRED'),
  key: NonEmptyStringSchema,
  trialIndex: TrialIndexSchema,
  phase: z.enum(['stimulus', 'waiting', 'idle']),
}).strict();

const FocusLostEventSchema = BaseEventSchema.extend({
  type: z.literal('FOCUS_LOST'),
  trialIndex: TrialIndexSchema.nullable(),
  phase: z.enum(['stimulus', 'waiting', 'idle']),
}).strict();

const FocusRegainedEventSchema = BaseEventSchema.extend({
  type: z.literal('FOCUS_REGAINED'),
  trialIndex: TrialIndexSchema.nullable(),
  lostDurationMs: z
    .number()
    .min(0)
    .max(60 * 60 * 1000)
    .finite(),
}).strict();

const UserStateDeclaredEventSchema = BaseEventSchema.extend({
  type: z.literal('USER_STATE_DECLARED'),
  energyLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  localHour: z.number().int().min(0).max(23),
}).strict();

const SessionPausedEventSchema = BaseEventSchema.extend({
  type: z.literal('SESSION_PAUSED'),
  trialIndex: TrialIndexSchema,
  previousPhase: z.enum(['stimulus', 'waiting', 'starting']),
  elapsedMs: z.number().min(0).finite(),
}).strict();

const SessionResumedEventSchema = BaseEventSchema.extend({
  type: z.literal('SESSION_RESUMED'),
  trialIndex: TrialIndexSchema,
}).strict();

// =============================================================================
// Recall Event Schemas
// =============================================================================

const ModeBaseEventSchema = BaseEventSchema.extend({
  eventId: IdSchema,
  seq: NonNegativeIntSchema,
  occurredAtMs: NonNegativeMsSchema,
  monotonicMs: NonNegativeMsSchema,
}).strict();

const RecallBaseEventSchema = ModeBaseEventSchema;

const ProgressiveWindowConfigSchema = z
  .object({
    enabled: z.boolean(),
    initialDepth: z.number().int().positive(),
    expansionThreshold: ProbabilitySchema,
    contractionThreshold: ProbabilitySchema,
    observationWindows: z.number().int().positive(),
    cooldownWindows: z.number().int().nonnegative(),
  })
  .strict();

const MemoSessionConfigSchema = z
  .object({
    nLevel: NLevelSchema,
    activeModalities: z.array(NonEmptyStringSchema),
    trialsCount: TrialsCountSchema,
    stimulusDurationSeconds: z.number().positive().finite(),
    feedbackMode: z.enum(['none', 'on-commit']),
    feedbackDurationMs: z.number().min(0).finite(),
    progressiveWindow: ProgressiveWindowConfigSchema,
    scoringVersion: NonEmptyStringSchema,
    targetProbability: ProbabilitySchema,
    lureProbability: ProbabilitySchema,
    fillOrderMode: z.enum(['sequential', 'random']),
    disableWindowAdaptation: z.boolean().optional(),
    initialLureProbability: ProbabilitySchema.optional(),
  })
  .strict();

const ModalityPickSchema = z.discriminatedUnion('modality', [
  z.object({ modality: z.literal('position'), value: PositionSchema }).strict(),
  z.object({ modality: z.literal('audio'), value: SoundSchema }).strict(),
  z.object({ modality: z.literal('color'), value: ColorSchema }).strict(),
]);

const MemoSessionStartedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: MemoSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  trialsSeed: NonEmptyStringSchema,
  trialsHash: NonEmptyStringSchema,
  trialsCount: TrialsCountSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  spec: ModeSpecSchema.optional(),
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const MemoStimulusShownEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_STIMULUS_SHOWN'),
  trialIndex: TrialIndexSchema,
  trial: TrialSchema,
  stimulusDurationMs: z.number().nonnegative().finite(),
}).strict();

const RecallStimulusHiddenEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_STIMULUS_HIDDEN'),
  trialIndex: TrialIndexSchema,
}).strict();

const RecallWindowOpenedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_WINDOW_OPENED'),
  trialIndex: TrialIndexSchema,
  requiredWindowDepth: z.number().int().positive(),
}).strict();

const RecallPickedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_PICKED'),
  trialIndex: TrialIndexSchema,
  slotIndex: z.number().int().nonnegative(),
  pick: ModalityPickSchema,
  isCorrection: z.boolean().optional(),
  trajectory: z
    .object({
      sampleRate: z.literal(20),
      containerSize: z.object({ w: z.number().finite(), h: z.number().finite() }).strict(),
      points: z.array(
        z.tuple([z.number().finite(), z.number().finite(), NonNegativeMsSchema] as const),
      ),
    })
    .strict()
    .optional(),
  inputMethod: z.enum(['mouse', 'touch']).optional(),
}).strict();

const RecallWindowCommittedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_WINDOW_COMMITTED'),
  trialIndex: TrialIndexSchema,
  recallDurationMs: z.number().min(0).finite(),
}).strict();

const RecallCorrectionShownEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_CORRECTION_SHOWN'),
  trialIndex: TrialIndexSchema,
  feedbackDurationMs: z.number().min(0).finite(),
}).strict();

const MemoSessionEndedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const RecallParamsUpdatedEventSchema = RecallBaseEventSchema.extend({
  type: z.literal('RECALL_PARAMS_UPDATED'),
  effectiveWindowDepth: z.number().int().positive(),
  effectiveLureProbability: ProbabilitySchema,
  effectiveTargetProbability: ProbabilitySchema,
  triggerWindowIndex: z.number().int().nonnegative(),
  decisionReason: NonEmptyStringSchema,
}).strict();

// =============================================================================
// Flow Event Schemas
// =============================================================================

const FlowBaseEventSchema = ModeBaseEventSchema;

const PlaceSessionConfigSchema = z
  .object({
    nLevel: NLevelSchema,
    activeModalities: z.array(NonEmptyStringSchema),
    trialsCount: TrialsCountSchema,
    stimulusDurationMs: z.number().positive().finite(),
    placementOrderMode: z.enum(['free', 'random', 'oldestFirst', 'newestFirst']),
    distractorCount: z.number().int().min(0).max(20).optional(),
    distractorSource: z.enum(['random', 'proactive']).optional(),
  })
  .strict();

const PlaceSessionStartedEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: PlaceSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  spec: ModeSpecSchema.optional(),
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const FlowStimulusShownEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_STIMULUS_SHOWN'),
  trialIndex: TrialIndexSchema,
  position: PositionSchema,
  sound: SoundSchema,
  stimulusDurationMs: z.number().positive().finite(),
  adaptiveZone: z.number().int().min(0).finite().optional(),
}).strict();

const FlowPlacementStartedEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_PLACEMENT_STARTED'),
  trialIndex: TrialIndexSchema,
  proposalCount: z.number().int().min(0).finite(),
  proposalIds: z.array(IdSchema),
}).strict();

const DragSlotEnterSchema = z
  .object({
    slot: z.number().int().nonnegative(),
    type: z.enum(['position', 'audio', 'unified']),
    mirror: z.boolean().optional(),
    atMs: NonNegativeMsSchema,
  })
  .strict();

const PlaceSlotEnterSchema = DragSlotEnterSchema;
const DualPickSlotEnterSchema = DragSlotEnterSchema;

const FlowDropAttemptedEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_DROP_ATTEMPTED'),
  trialIndex: TrialIndexSchema,
  proposalId: IdSchema,
  proposalType: z.enum(['position', 'audio']),
  proposalValue: z.union([z.number(), z.string()]),
  targetSlot: z.number().int().nonnegative(),
  correct: z.boolean(),
  placementTimeMs: z.number().min(0).finite(),
  dropOrder: z.number().int().nonnegative(),
  isLastSlot: z.boolean().optional(),
  // Trajectory facts (optional, for confidence scoring)
  dragStartedAtMs: NonNegativeMsSchema.optional(),
  totalDistancePx: z.number().min(0).finite().optional(),
  directDistancePx: z.number().min(0).finite().optional(),
  slotEnters: z.array(PlaceSlotEnterSchema).optional(),
  // XY trajectory for replay animation
  trajectory: z
    .object({
      sampleRate: z.literal(20),
      containerSize: z
        .object({
          w: z.number().finite(),
          h: z.number().finite(),
        })
        .strict(),
      points: z.array(
        z.tuple([z.number().finite(), z.number().finite(), NonNegativeMsSchema] as const),
      ),
    })
    .strict()
    .optional(),
  // Input method (mouse or touch)
  inputMethod: z.enum(['mouse', 'touch']).optional(),
}).strict();

const FlowDragCancelledEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_DRAG_CANCELLED'),
  trialIndex: TrialIndexSchema,
  proposalId: IdSchema,
  proposalType: z.enum(['position', 'audio']),
  dragDurationMs: z.number().min(0).finite(),
  totalDistancePx: z.number().min(0).finite().optional(),
  slotEnters: z.array(PlaceSlotEnterSchema).optional(),
  releasedOnSlot: z.number().nullable().optional(),
  invalidDrop: z.boolean().optional(),
  trajectory: z
    .object({
      sampleRate: z.literal(20),
      containerSize: z.object({ w: z.number().finite(), h: z.number().finite() }).strict(),
      points: z.array(
        z.tuple([z.number().finite(), z.number().finite(), NonNegativeMsSchema] as const),
      ),
    })
    .strict()
    .optional(),
  // Input method (mouse or touch)
  inputMethod: z.enum(['mouse', 'touch']).optional(),
}).strict();

const FlowTurnCompletedEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_TURN_COMPLETED'),
  trialIndex: TrialIndexSchema,
  turnDurationMs: z.number().min(0).finite(),
}).strict();

const PlaceSessionEndedEventSchema = FlowBaseEventSchema.extend({
  type: z.literal('FLOW_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

/**
 * Schema Zod pour valider les GameEvents depuis le cloud.
 * Utilise z.discriminatedUnion pour une validation efficace basée sur le type.
 */

// =============================================================================
// Dual Label Event Schemas
// =============================================================================

const DualPickBaseEventSchema = ModeBaseEventSchema;

const DualPickSessionConfigSchema = z
  .object({
    nLevel: NLevelSchema,
    activeModalities: z.array(NonEmptyStringSchema),
    trialsCount: TrialsCountSchema,
    stimulusDurationMs: z.number().positive().finite(),
    placementOrderMode: z.enum(['free', 'random', 'oldestFirst', 'newestFirst']),
    distractorCount: z.number().int().min(0).max(20),
    timelineMode: z.enum(['separated', 'unified']).optional(),
    distractorSource: z.enum(['random', 'proactive']).optional(),
  })
  .strict();

const DualPickProposalSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyStringSchema, // 'N', 'N-1', 'N-2'
    type: z.enum(['position', 'audio', 'unified']),
    correctSlot: z.number().int().nonnegative().optional(),
  })
  .strict();

const DualPickSessionStartedEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: DualPickSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  spec: ModeSpecSchema.optional(),
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const DualPickStimulusShownEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_STIMULUS_SHOWN'),
  trialIndex: TrialIndexSchema,
  position: PositionSchema,
  sound: SoundSchema,
  stimulusDurationMs: z.number().positive().finite(),
  adaptiveZone: z.number().int().min(0).finite().optional(),
}).strict();

const DualPickPlacementStartedEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_PLACEMENT_STARTED'),
  trialIndex: TrialIndexSchema,
  proposals: z.array(DualPickProposalSchema),
}).strict();

const DualPickDropAttemptedEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_DROP_ATTEMPTED'),
  trialIndex: TrialIndexSchema,
  proposalId: IdSchema,
  proposalType: z.enum(['position', 'audio', 'unified']),
  proposalLabel: NonEmptyStringSchema,
  targetSlot: z.number().int().nonnegative(),
  mirror: z.boolean(),
  correct: z.boolean(),
  placementTimeMs: z.number().min(0).finite(),
  dropOrder: z.number().int().nonnegative(),
  dragStartedAtMs: NonNegativeMsSchema.optional(),
  totalDistancePx: z.number().min(0).finite().optional(),
  directDistancePx: z.number().min(0).finite().optional(),
  slotEnters: z.array(DualPickSlotEnterSchema).optional(),
  trajectory: z
    .object({
      sampleRate: z.literal(20),
      containerSize: z
        .object({
          w: z.number().finite(),
          h: z.number().finite(),
        })
        .strict(),
      points: z.array(
        z.tuple([z.number().finite(), z.number().finite(), NonNegativeMsSchema] as const),
      ),
    })
    .strict()
    .optional(),
  inputMethod: z.enum(['mouse', 'touch']).optional(),
  isLastSlot: z.boolean().optional(),
}).strict();

const DualPickTurnCompletedEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_TURN_COMPLETED'),
  trialIndex: TrialIndexSchema,
  turnDurationMs: z.number().min(0).finite(),
}).strict();

const DualPickSessionEndedEventSchema = DualPickBaseEventSchema.extend({
  type: z.literal('DUAL_PICK_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Trace Event Schemas (BETA)
// =============================================================================

const TraceBaseEventSchema = ModeBaseEventSchema;

const TraceSessionConfigSchema = z.discriminatedUnion('rhythmMode', [
  z
    .object({
      nLevel: NLevelSchema,
      trialsCount: TrialsCountSchema,
      rhythmMode: z.literal('self-paced'),
      stimulusDurationMs: z.number().positive().finite(),
      // Self-paced sessions do not have a response time window (0 = "not applicable").
      responseWindowMs: z.number().nonnegative().finite(),
    })
    .strict(),
  z
    .object({
      nLevel: NLevelSchema,
      trialsCount: TrialsCountSchema,
      rhythmMode: z.literal('timed'),
      stimulusDurationMs: z.number().positive().finite(),
      responseWindowMs: z.number().positive().finite(),
    })
    .strict(),
]);

const TraceSessionStartedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: TraceSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  spec: ModeSpecSchema.optional(),
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const TraceStimulusShownEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_STIMULUS_SHOWN'),
  trialIndex: TrialIndexSchema,
  position: TracePositionSchema,
  isWarmup: z.boolean(),
  stimulusDurationMs: z.number().positive().finite(),
}).strict();

const TraceStimulusHiddenEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_STIMULUS_HIDDEN'),
  trialIndex: TrialIndexSchema,
}).strict();

const TraceResponseEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_RESPONDED'),
  trialIndex: TrialIndexSchema,
  responseType: z.enum(['swipe', 'double-tap', 'hold', 'skip', 'reject']),
  position: TracePositionSchema.nullable(),
  expectedPosition: TracePositionSchema.nullable(),
  isCorrect: z.boolean(),
  isWarmup: z.boolean(),
  responseTimeMs: z.number().min(0).max(300000).finite(),
  inputMethod: z.enum(['mouse', 'touch']).optional(),
  processingLagMs: z.number().min(0).max(60000).finite().optional(),
}).strict();

const TraceTimeoutEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_TIMED_OUT'),
  trialIndex: TrialIndexSchema,
  expectedPosition: TracePositionSchema.nullable(),
}).strict();

const TracePausedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_PAUSED'),
  trialIndex: TrialIndexSchema,
  previousPhase: z.enum([
    'idle',
    'starting',
    'countdown',
    'stimulus',
    'arithmetic',
    'ruleReveal',
    'response',
    'writing',
    'positionFeedback',
    'writingFeedback',
    'waiting',
    'preStimGap',
    'paused',
    'computing',
    'finished',
  ]),
  elapsedMs: z.number().min(0).finite(),
}).strict();

const TraceResumedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_RESUMED'),
  trialIndex: TrialIndexSchema,
}).strict();

const TraceSessionEndedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  trialsCompleted: z.number().int().min(0).max(500),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Time Event Schemas (ALPHA)
// =============================================================================

const TimeBaseEventSchema = ModeBaseEventSchema;

const TimeSessionConfigSchema = z
  .object({
    trialsCount: TrialsCountSchema,
    targetDurationMs: z.number().positive().finite(),
    estimationEnabled: z.boolean().optional(),
    sliderShape: z.enum(['line', 'circle']).optional(),
    sliderDirection: z.enum(['normal', 'reverse']).optional(),
  })
  .strict();

const TimeSessionStartedEventSchema = TimeBaseEventSchema.extend({
  type: z.literal('TIME_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: TimeSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const TimeTrialCompletedEventSchema = TimeBaseEventSchema.extend({
  type: z.literal('TIME_TRIAL_COMPLETED'),
  trialIndex: TrialIndexSchema,
  durationMs: z.number().min(0).finite(),
  estimatedMs: z.number().min(0).finite().nullable(),
  accuracyScore: z.number().min(0).max(100).finite(),
  regularityScore: z.number().min(0).max(100).finite(),
  skipped: z.boolean(),
}).strict();

const TimeSessionEndedEventSchema = TimeBaseEventSchema.extend({
  type: z.literal('TIME_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  trialsCompleted: z.number().int().min(0).max(500),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Corsi Block Event Schemas
// =============================================================================

const CorsiBaseEventSchema = ModeBaseEventSchema;

const CorsiSessionConfigSchema = z
  .object({
    startSpan: z.number().int().min(1).max(9),
    maxConsecutiveFailures: z.number().int().min(0).max(5),
    direction: z.enum(['forward', 'backward']),
  })
  .strict();

const CorsiSessionStartedEventSchema = CorsiBaseEventSchema.extend({
  type: z.literal('CORSI_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: CorsiSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const CorsiTrialCompletedEventSchema = CorsiBaseEventSchema.extend({
  type: z.literal('CORSI_TRIAL_COMPLETED'),
  trialIndex: TrialIndexSchema,
  span: z.number().int().min(1).max(9),
  sequence: z.array(z.number().int().min(0).max(8)),
  recalled: z.array(z.number().int().min(0).max(8)),
  correct: z.boolean(),
  responseTimeMs: z.number().min(0).finite(),
}).strict();

const CorsiSessionEndedEventSchema = CorsiBaseEventSchema.extend({
  type: z.literal('CORSI_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  correctTrials: z.number().int().min(0),
  maxSpan: z.number().int().min(0).max(9),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// MOT (Dual Track) Event Schemas
// =============================================================================

const MotBaseEventSchema = ModeBaseEventSchema;

const MotAdaptivePathSchema = z
  .object({
    targetCountStage: z.number().int().min(2).max(5),
    difficultyTier: z.number().int().min(0).max(25),
    tierCount: z.number().int().min(1).max(25),
    stageProgressPct: z.number().min(0).max(100).finite(),
    phaseIndex: z.number().int().min(0).max(5).optional(),
    phaseIdentityMode: z.enum(['classic', 'audio', 'color', 'audio-color']).optional(),
    highestCompletedTargetCount: z.number().int().min(0).max(5),
    nextTargetCountStage: z.number().int().min(2).max(5).optional(),
    nextDifficultyTier: z.number().int().min(0).max(25).optional(),
    progressDeltaPct: z.number().min(-100).max(100).finite().optional(),
    promotedTargetCount: z.boolean().optional(),
    tierChanged: z.boolean().optional(),
    performanceBand: z.enum(['mastery', 'solid', 'building', 'struggling']).optional(),
    completed: z.boolean().optional(),
  })
  .strict();

const MotInitialObjectSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    speedPxPerSec: z.number().min(0).finite(),
    headingRad: z.number().finite(),
    turnRateRadPerSec: z.number().finite(),
    turnJitterTimerMs: z.number().min(0).finite(),
    minTurnIntervalMs: z.number().min(0).finite(),
    maxTurnIntervalMs: z.number().min(0).finite(),
    maxTurnRateRadPerSec: z.number().min(0).finite(),
    rngSeed: NonEmptyStringSchema,
  })
  .strict();

const TrackCalibrationModalitySchema = z.enum([
  'position',
  'letters',
  'color',
  'shape',
  'spatial',
  'numbers',
  'emotions',
  'semantic',
  'tones',
]);

const MotSessionConfigSchema = z
  .object({
    sessionKind: z.enum(['standard', 'calibration']).optional(),
    calibrationModality: TrackCalibrationModalitySchema.optional(),
    trialsCount: z.number().int().min(1).max(100),
    totalObjects: z.number().int().min(4).max(20),
    targetCount: z.number().int().min(1).max(10),
    highlightDurationMs: z.number().min(500).finite(),
    trackingDurationMs: z.number().min(1000).finite(),
    speedPxPerSec: z.number().min(10).finite(),
    motionComplexity: z.enum(['smooth', 'standard', 'agile']),
    crowdingMode: z.enum(['low', 'standard', 'dense']).optional(),
    crowdingThresholdPx: z.number().min(0).finite(),
    minSeparationPx: z.number().min(0).finite(),
    arenaWidthPx: z.number().min(0).finite().optional(),
    arenaHeightPx: z.number().min(0).finite().optional(),
  })
  .strict();

const MotSessionStartedEventSchema = MotBaseEventSchema.extend({
  type: z.literal('MOT_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: MotSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyName: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
  adaptivePath: MotAdaptivePathSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const MotTrialDefinedEventSchema = MotBaseEventSchema.extend({
  type: z.literal('MOT_TRIAL_DEFINED'),
  trialIndex: TrialIndexSchema,
  trialSeed: NonEmptyStringSchema,
  arenaWidthPx: z.number().min(0).finite(),
  arenaHeightPx: z.number().min(0).finite(),
  totalObjects: z.number().int().min(1).max(20),
  targetCount: z.number().int().min(1).max(10),
  initialObjects: z.array(MotInitialObjectSchema).min(1).max(20),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  adaptivePath: MotAdaptivePathSchema.optional(),
}).strict();

const MotIdentityPromptColorSchema = z.enum(['red', 'green', 'blue', 'yellow', 'purple']);
const MotIdentityPromptLetterSchema = z.enum(SOUNDS);
const MotIdentityPromptToneSchema = z.enum(TONE_VALUES);

const MotTrialCompletedEventSchema = MotBaseEventSchema.extend({
  type: z.literal('MOT_TRIAL_COMPLETED'),
  trialIndex: TrialIndexSchema,
  targetIndices: z.array(z.number().int().min(0)),
  selectedIndices: z.array(z.number().int().min(0)),
  correctCount: z.number().int().min(0),
  totalTargets: z.number().int().min(1),
  accuracy: z.number().min(0).max(1).finite(),
  identityPromptColorIds: z.array(MotIdentityPromptColorSchema).min(1).max(5).optional(),
  identityPromptLetters: z.array(MotIdentityPromptLetterSchema).min(1).max(5).optional(),
  identityPromptTones: z.array(MotIdentityPromptToneSchema).min(1).max(5).optional(),
  selectionPromptOrder: z.array(z.number().int().min(0)).min(1).max(10).optional(),
  colorPassSelections: z.array(z.number().int().min(0)).min(1).max(10).optional(),
  colorSelectionPromptOrder: z.array(z.number().int().min(0)).min(1).max(10).optional(),
  responseTimeMs: z.number().min(0).finite(),
  crowdingEvents: z.number().int().min(0),
  minInterObjectDistancePx: z.number().min(0).finite(),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  adaptivePath: MotAdaptivePathSchema.optional(),
}).strict();

const MotSessionEndedEventSchema = MotBaseEventSchema.extend({
  type: z.literal('MOT_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  correctTrials: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).finite(),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  journeyStageId: z.number().int().min(1).max(60).optional(),
  journeyId: NonEmptyStringSchema.optional(),
  playContext: PlayContextSchema,
  adaptivePath: MotAdaptivePathSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// OSPAN (Operation Span) Event Schemas
// =============================================================================

const OspanBaseEventSchema = ModeBaseEventSchema;

const OspanSessionConfigSchema = z
  .object({
    startSpan: z.number().int().min(1).max(9),
    maxConsecutiveFailures: z.number().int().min(0).max(5),
  })
  .strict();

const OspanSessionStartedEventSchema = OspanBaseEventSchema.extend({
  type: z.literal('OSPAN_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: OspanSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const OspanSetCompletedEventSchema = OspanBaseEventSchema.extend({
  type: z.literal('OSPAN_SET_COMPLETED'),
  setIndex: TrialIndexSchema,
  span: z.number().int().min(1).max(7),
  letters: z.array(z.string().min(1).max(1)),
  recalled: z.array(z.string().min(1).max(1)),
  recallCorrect: z.boolean(),
  equationAccuracy: z.number().min(0).max(100).finite(),
  responseTimeMs: z.number().min(0).finite(),
}).strict();

const OspanSessionEndedEventSchema = OspanBaseEventSchema.extend({
  type: z.literal('OSPAN_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalSets: TrialsCountSchema,
  correctSets: z.number().int().min(0),
  maxSpan: z.number().int().min(0).max(7),
  absoluteScore: z.number().int().min(0).finite(),
  recallAccuracy: z.number().min(0).max(100).finite(),
  processingAccuracy: z.number().min(0).max(100).finite(),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Running Span Event Schemas
// =============================================================================

const RunningSpanBaseEventSchema = ModeBaseEventSchema;

const RunningSpanSessionConfigSchema = z
  .object({
    startSpan: z.number().int().min(1).max(9),
    maxConsecutiveFailures: z.number().int().min(0).max(5),
  })
  .strict();

const RunningSpanSessionStartedEventSchema = RunningSpanBaseEventSchema.extend({
  type: z.literal('RUNNING_SPAN_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: RunningSpanSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const RunningSpanTrialCompletedEventSchema = RunningSpanBaseEventSchema.extend({
  type: z.literal('RUNNING_SPAN_TRIAL_COMPLETED'),
  trialIndex: TrialIndexSchema,
  span: z.number().int().min(1).max(9),
  streamLength: z.number().int().min(1),
  targetLetters: z.array(z.string().min(1).max(1)),
  recalled: z.array(z.string().min(1).max(1)),
  correct: z.boolean(),
  responseTimeMs: z.number().min(0).finite(),
}).strict();

const RunningSpanSessionEndedEventSchema = RunningSpanBaseEventSchema.extend({
  type: z.literal('RUNNING_SPAN_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  correctTrials: z.number().int().min(0),
  maxSpan: z.number().int().min(0).max(9),
  accuracy: z.number().min(0).max(100).finite(),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// PASAT Event Schemas
// =============================================================================

const PasatBaseEventSchema = ModeBaseEventSchema;

const PasatSessionConfigSchema = z
  .object({
    defaultIsiMs: z.number().int().min(500).max(10000),
    maxConsecutiveFailures: z.number().int().min(0).max(10),
  })
  .strict();

const PasatSessionStartedEventSchema = PasatBaseEventSchema.extend({
  type: z.literal('PASAT_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: PasatSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const PasatTrialCompletedEventSchema = PasatBaseEventSchema.extend({
  type: z.literal('PASAT_TRIAL_COMPLETED'),
  trialIndex: TrialIndexSchema,
  previousNumber: z.number().int().min(1).max(9),
  currentNumber: z.number().int().min(1).max(9),
  correctAnswer: z.number().int().min(2).max(18),
  playerAnswer: z.number().int(),
  correct: z.boolean(),
  responseTimeMs: z.number().min(0).finite(),
  isiMs: z.number().int().min(0),
}).strict();

const PasatSessionEndedEventSchema = PasatBaseEventSchema.extend({
  type: z.literal('PASAT_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: TrialsCountSchema,
  correctTrials: z.number().int().min(0),
  accuracy: z.number().min(0).max(100).finite(),
  fastestIsiMs: z.number().int().min(0),
  avgResponseTimeMs: z.number().int().min(0),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// SWM Event Schemas
// =============================================================================

const SwmBaseEventSchema = ModeBaseEventSchema;

const SwmSessionConfigSchema = z
  .object({
    startBoxes: z.number().int().min(2).max(12),
    maxBoxes: z.number().int().min(2).max(12),
    maxConsecutiveFailures: z.number().int().min(0).max(5),
  })
  .strict();

const SwmSessionStartedEventSchema = SwmBaseEventSchema.extend({
  type: z.literal('SWM_SESSION_STARTED'),
  userId: NonEmptyStringSchema,
  config: SwmSessionConfigSchema,
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const SwmRoundCompletedEventSchema = SwmBaseEventSchema.extend({
  type: z.literal('SWM_ROUND_COMPLETED'),
  roundIndex: TrialIndexSchema,
  span: z.number().int().min(2).max(12),
  tokenPosition: z.number().int().min(0),
  withinSearchErrors: z.number().int().min(0),
  betweenSearchErrors: z.number().int().min(0),
  totalErrors: z.number().int().min(0),
  searchesUsed: z.number().int().min(0),
  correct: z.boolean(),
  roundTimeMs: z.number().min(0).finite(),
}).strict();

const SwmSessionEndedEventSchema = SwmBaseEventSchema.extend({
  type: z.literal('SWM_SESSION_ENDED'),
  userId: NonEmptyStringSchema.optional(),
  reason: z.enum(['completed', 'abandoned']),
  totalRounds: TrialsCountSchema,
  correctRounds: z.number().int().min(0),
  accuracy: z.number().min(0).max(100).finite(),
  maxSpanReached: z.number().int().min(0).max(12),
  totalWithinErrors: z.number().int().min(0),
  totalBetweenErrors: z.number().int().min(0),
  totalErrors: z.number().int().min(0),
  score: z.number().min(0).max(100).finite(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Journey Context Event Schemas
// =============================================================================

const JourneyContextSchema = z
  .object({
    journeyId: NonEmptyStringSchema.optional(),
    stageId: z.number().int().min(1).max(60),
    stageMode: z.enum(['pick', 'place', 'memo', 'catch', 'simulator']),
    nLevel: z.number().int().min(1),
    journeyName: NonEmptyStringSchema,
    journeyGameMode: GameModeIdSchema.optional(),
    upsThreshold: z.number().min(0).max(100),
    isValidating: z.boolean(),
    validatingSessions: z.number().int().nonnegative(),
    sessionsRequired: z.number().int().positive(),
    progressPct: z.number().min(0).max(100).finite().optional(),
    bestScore: z.number().min(0).max(100).finite().nullable().optional(),
    stageCompleted: z.boolean(),
    nextStageUnlocked: z.number().int().nullable(),
    nextPlayableStage: z.number().int().nullable().optional(),
    nextSessionGameMode: GameModeIdSchema.optional(),
    consecutiveStrikes: z.number().int().min(0).max(2).optional(),
    suggestedStartLevel: z.number().int().min(1).optional(),
    journeyProtocol: z
      .enum(['standard', 'jaeggi', 'brainworkshop', 'dual-track-mastery', 'hybrid-jaeggi'])
      .optional(),
    sessionRole: z.enum(['single-session', 'track-half', 'decision-half']).optional(),
    journeyDecision: z.enum(['up', 'stay', 'down', 'pending-pair']).optional(),
    journeyNameShort: NonEmptyStringSchema.optional(),
    guidanceSource: z.enum(['historical-session', 'current-state']).optional(),
    hybridProgress: HybridJourneyStageProgressSchema.optional(),
  })
  .strict();

const JourneyContextComputedEventSchema = BaseEventSchema.extend({
  type: z.literal('JOURNEY_CONTEXT_COMPUTED'),
  userId: NonEmptyStringSchema.optional(),
  journeyId: NonEmptyStringSchema.optional(),
  journeyStartLevel: z.number().int().min(1).max(20).optional(),
  journeyTargetLevel: z.number().int().min(1).max(20).optional(),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyStrategyConfig: JourneyStrategyConfigSchema.optional(),
  journeyContext: JourneyContextSchema,
}).strict();

const JourneyTransitionDecidedEventSchema = BaseEventSchema.extend({
  type: z.literal('JOURNEY_TRANSITION_DECIDED'),
  userId: NonEmptyStringSchema.optional(),
  journeyId: NonEmptyStringSchema,
  journeyStartLevel: z.number().int().min(1).max(20),
  journeyTargetLevel: z.number().int().min(1).max(20),
  journeyGameMode: GameModeIdSchema.optional(),
  journeyStrategyConfig: JourneyStrategyConfigSchema.optional(),
  stageId: z.number().int().min(1).max(60),
  stageMode: z.enum(['pick', 'place', 'memo', 'catch', 'simulator']),
  nLevel: z.number().int().min(1),
  journeyName: NonEmptyStringSchema,
  journeyNameShort: NonEmptyStringSchema.optional(),
  upsThreshold: z.number().min(0).max(100),
  isValidating: z.boolean(),
  validatingSessions: z.number().int().nonnegative(),
  sessionsRequired: z.number().int().positive(),
  progressPct: z.number().min(0).max(100).finite().optional(),
  bestScore: z.number().min(0).max(100).finite().nullable().optional(),
  stageCompleted: z.boolean(),
  nextStageUnlocked: z.number().int().nullable(),
  nextPlayableStage: z.number().int().nullable().optional(),
  nextSessionGameMode: GameModeIdSchema.optional(),
  consecutiveStrikes: z.number().int().min(0).max(2).optional(),
  suggestedStartLevel: z.number().int().min(1).optional(),
  journeyProtocol: z
    .enum(['standard', 'jaeggi', 'brainworkshop', 'dual-track-mastery', 'hybrid-jaeggi'])
    .optional(),
  sessionRole: z.enum(['single-session', 'track-half', 'decision-half']).optional(),
  journeyDecision: z.enum(['up', 'stay', 'down', 'pending-pair']).optional(),
  guidanceSource: z.enum(['historical-session', 'current-state']).optional(),
  hybridProgress: HybridJourneyStageProgressSchema.optional(),
}).strict();

const TraceWritingStartedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_WRITING_STARTED'),
  trialIndex: TrialIndexSchema,
  expectedLetter: NonEmptyStringSchema.nullable(),
  mode: z.enum(['grid-overlay', 'target-cell', 'floating-zone', 'fullscreen']),
  timeoutMs: z.number().min(0).finite(),
}).strict();

const TraceWritingCompletedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_WRITING_COMPLETED'),
  trialIndex: TrialIndexSchema,
  recognizedLetter: NonEmptyStringSchema.nullable(),
  expectedLetter: NonEmptyStringSchema.nullable(),
  isCorrect: z.boolean(),
  confidence: z.number().min(0).max(1).finite(),
  writingTimeMs: z.number().min(0).finite(),
  selectedColor: z.string().nullable().optional(),
  expectedColor: z.string().nullable().optional(),
  colorCorrect: z.boolean().nullable().optional(),
}).strict();

const TraceWritingTimeoutEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_WRITING_TIMEOUT'),
  trialIndex: TrialIndexSchema,
  writingTimeMs: z.number().min(0).finite(),
}).strict();

// Arithmetic Interference Events
const TraceArithmeticStartedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_ARITHMETIC_STARTED'),
  trialIndex: TrialIndexSchema,
  expression: NonEmptyStringSchema,
  correctAnswer: z.number().int().finite(),
  timeoutMs: z.number().min(0).finite(),
}).strict();

const TraceArithmeticCompletedEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_ARITHMETIC_COMPLETED'),
  trialIndex: TrialIndexSchema,
  expression: NonEmptyStringSchema,
  correctAnswer: z.number().int().finite(),
  userAnswer: z.number().int().finite().nullable(),
  isCorrect: z.boolean(),
  confidence: z.number().min(0).max(1).finite(),
  writingTimeMs: z.number().min(0).finite(),
}).strict();

const TraceArithmeticTimeoutEventSchema = TraceBaseEventSchema.extend({
  type: z.literal('TRACE_ARITHMETIC_TIMEOUT'),
  trialIndex: TrialIndexSchema,
  expression: NonEmptyStringSchema,
  correctAnswer: z.number().int().finite(),
  writingTimeMs: z.number().min(0).finite(),
}).strict();

// =============================================================================
// Generic Cognitive Task Event Schemas
// =============================================================================

const CognitiveTaskBaseEventSchema = ModeBaseEventSchema;

const CognitiveTaskSessionStartedEventSchema = CognitiveTaskBaseEventSchema.extend({
  type: z.literal('COGNITIVE_TASK_SESSION_STARTED'),
  taskType: NonEmptyStringSchema,
  userId: NonEmptyStringSchema,
  config: z.record(z.string(), z.unknown()),
  device: DeviceInfoSchema,
  context: TemporalContextSchema,
  playContext: PlayContextSchema,
  gameMode: GameModeIdSchema.optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

const CognitiveTaskTrialCompletedEventSchema = CognitiveTaskBaseEventSchema.extend({
  type: z.literal('COGNITIVE_TASK_TRIAL_COMPLETED'),
  taskType: NonEmptyStringSchema,
  trialIndex: TrialIndexSchema,
  correct: z.boolean(),
  responseTimeMs: z.number().min(0).finite(),
  condition: NonEmptyStringSchema.optional(),
  trialData: z.record(z.string(), z.unknown()).optional(),
}).strict();

const CognitiveTaskSessionEndedEventSchema = CognitiveTaskBaseEventSchema.extend({
  type: z.literal('COGNITIVE_TASK_SESSION_ENDED'),
  taskType: NonEmptyStringSchema,
  reason: z.enum(['completed', 'abandoned']),
  totalTrials: z.number().int().min(0),
  correctTrials: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).finite(),
  meanRtMs: z.number().min(0).finite().optional(),
  durationMs: z.number().min(0).finite(),
  playContext: PlayContextSchema,
  metrics: z.record(z.string(), z.unknown()).optional(),
})
  .strict()
  .superRefine(refineJourneyPlayContext);

// =============================================================================
// Progression Event Schemas
// =============================================================================

const BadgeUnlockedEventSchema = BaseEventSchema.extend({
  type: z.literal('BADGE_UNLOCKED'),
  badgeId: NonEmptyStringSchema,
  category: z.enum([
    'consistency',
    'performance',
    'resilience',
    'exploration',
    'milestone',
    'cognitive',
  ]),
  priority: z.number().int().min(0).finite(),
}).strict();

const XPBreakdownComputedEventSchema = BaseEventSchema.extend({
  type: z.literal('XP_BREAKDOWN_COMPUTED'),
  sessionId: NonEmptyStringSchema,
  xpBreakdown: z
    .object({
      base: z.number().finite(),
      performance: z.number().finite(),
      accuracy: z.number().finite(),
      badgeBonus: z.number().finite(),
      streakBonus: z.number().finite(),
      dailyBonus: z.number().finite(),
      flowBonus: z.number().finite(),
      confidenceMultiplier: z.number().finite(),
      subtotalBeforeConfidence: z.number().finite(),
      total: z.number().finite(),
      dailyCapReached: z.boolean(),
    })
    .strict(),
}).strict();

export const GameEventSchema = z.discriminatedUnion('type', [
  SessionStartedEventSchema,
  SessionEndedEventSchema,
  JourneyContextComputedEventSchema,
  JourneyTransitionDecidedEventSchema,
  SessionImportedEventSchema,
  TrialPresentedEventSchema,
  UserResponseEventSchema,
  DuplicateResponseEventSchema,
  ResponseFilteredEventSchema,
  InputPipelineLatencyEventSchema,
  InputMisfiredEventSchema,
  FocusLostEventSchema,
  FocusRegainedEventSchema,
  UserStateDeclaredEventSchema,
  SessionPausedEventSchema,
  SessionResumedEventSchema,
  // Recall events
  MemoSessionStartedEventSchema,
  MemoStimulusShownEventSchema,
  RecallStimulusHiddenEventSchema,
  RecallWindowOpenedEventSchema,
  RecallPickedEventSchema,
  RecallWindowCommittedEventSchema,
  RecallCorrectionShownEventSchema,
  MemoSessionEndedEventSchema,
  RecallParamsUpdatedEventSchema,
  // Flow events
  PlaceSessionStartedEventSchema,
  FlowStimulusShownEventSchema,
  FlowPlacementStartedEventSchema,
  FlowDropAttemptedEventSchema,
  FlowDragCancelledEventSchema,
  FlowTurnCompletedEventSchema,
  PlaceSessionEndedEventSchema,
  // Dual Label events
  DualPickSessionStartedEventSchema,
  DualPickStimulusShownEventSchema,
  DualPickPlacementStartedEventSchema,
  DualPickDropAttemptedEventSchema,
  DualPickTurnCompletedEventSchema,
  DualPickSessionEndedEventSchema,
  // Trace events
  TraceSessionStartedEventSchema,
  TraceStimulusShownEventSchema,
  TraceStimulusHiddenEventSchema,
  TraceResponseEventSchema,
  TraceTimeoutEventSchema,
  TracePausedEventSchema,
  TraceResumedEventSchema,
  TraceSessionEndedEventSchema,
  TraceWritingStartedEventSchema,
  TraceWritingCompletedEventSchema,
  TraceWritingTimeoutEventSchema,
  // Trace Arithmetic events
  TraceArithmeticStartedEventSchema,
  TraceArithmeticCompletedEventSchema,
  TraceArithmeticTimeoutEventSchema,
  // Time events
  TimeSessionStartedEventSchema,
  TimeTrialCompletedEventSchema,
  TimeSessionEndedEventSchema,
  // Corsi Block events
  CorsiSessionStartedEventSchema,
  CorsiTrialCompletedEventSchema,
  CorsiSessionEndedEventSchema,
  // MOT (Dual Track) events
  MotSessionStartedEventSchema,
  MotTrialDefinedEventSchema,
  MotTrialCompletedEventSchema,
  MotSessionEndedEventSchema,
  // OSPAN events
  OspanSessionStartedEventSchema,
  OspanSetCompletedEventSchema,
  OspanSessionEndedEventSchema,
  // Running Span events
  RunningSpanSessionStartedEventSchema,
  RunningSpanTrialCompletedEventSchema,
  RunningSpanSessionEndedEventSchema,
  // PASAT events
  PasatSessionStartedEventSchema,
  PasatTrialCompletedEventSchema,
  PasatSessionEndedEventSchema,
  // SWM events
  SwmSessionStartedEventSchema,
  SwmRoundCompletedEventSchema,
  SwmSessionEndedEventSchema,
  // Generic Cognitive Task events
  CognitiveTaskSessionStartedEventSchema,
  CognitiveTaskTrialCompletedEventSchema,
  CognitiveTaskSessionEndedEventSchema,
  // Progression events
  BadgeUnlockedEventSchema,
  XPBreakdownComputedEventSchema,
]);

// =============================================================================
// Inferred Types (Zod = SSOT)
// =============================================================================

export type BaseEvent = Immutable<z.infer<typeof BaseEventSchema>>;
export type DeviceInfo = Immutable<z.infer<typeof DeviceInfoSchema>>;
export type TemporalContext = Immutable<z.infer<typeof TemporalContextSchema>>;
export type FeedbackConfig = Immutable<z.infer<typeof FeedbackConfigSchema>>;
export type SessionPlayContext = z.infer<typeof PlayContextSchema>;

export type ProcessingLagStats = Immutable<z.infer<typeof ProcessingLagStatsSchema>>;
export type SessionHealthMetrics = Immutable<z.infer<typeof SessionHealthMetricsSchema>>;

export type SessionStartedEvent = Immutable<z.infer<typeof SessionStartedEventSchema>>;
export type SessionEndedEvent = Immutable<z.infer<typeof SessionEndedEventSchema>>;
export type SessionImportedEvent = Immutable<z.infer<typeof SessionImportedEventSchema>>;

export type TrialPresentedEvent = Immutable<z.infer<typeof TrialPresentedEventSchema>>;
export type UserResponseEvent = Immutable<z.infer<typeof UserResponseEventSchema>>;
export type DuplicateResponseEvent = Immutable<z.infer<typeof DuplicateResponseEventSchema>>;
export type ResponseFilteredEvent = Immutable<z.infer<typeof ResponseFilteredEventSchema>>;
export type InputMisfiredEvent = Immutable<z.infer<typeof InputMisfiredEventSchema>>;
export type FocusLostEvent = Immutable<z.infer<typeof FocusLostEventSchema>>;
export type FocusRegainedEvent = Immutable<z.infer<typeof FocusRegainedEventSchema>>;
export type UserStateDeclaredEvent = Immutable<z.infer<typeof UserStateDeclaredEventSchema>>;
export type SessionPausedEvent = Immutable<z.infer<typeof SessionPausedEventSchema>>;
export type SessionResumedEvent = Immutable<z.infer<typeof SessionResumedEventSchema>>;

export type JourneyContextComputedEvent = Immutable<
  z.infer<typeof JourneyContextComputedEventSchema>
>;
export type JourneyTransitionDecidedEvent = Immutable<
  z.infer<typeof JourneyTransitionDecidedEventSchema>
>;
export type BadgeUnlockedEvent = Immutable<z.infer<typeof BadgeUnlockedEventSchema>>;

// Recall / Memo
export type ModeBaseEvent = Immutable<z.infer<typeof ModeBaseEventSchema>>;
export type RecallBaseEvent = ModeBaseEvent;
export type MemoSessionStartedEvent = Immutable<z.infer<typeof MemoSessionStartedEventSchema>>;
export type MemoStimulusShownEvent = Immutable<z.infer<typeof MemoStimulusShownEventSchema>>;
export type RecallStimulusHiddenEvent = Immutable<z.infer<typeof RecallStimulusHiddenEventSchema>>;
export type RecallWindowOpenedEvent = Immutable<z.infer<typeof RecallWindowOpenedEventSchema>>;
export type RecallPickedEvent = Immutable<z.infer<typeof RecallPickedEventSchema>>;
export type RecallWindowCommittedEvent = Immutable<
  z.infer<typeof RecallWindowCommittedEventSchema>
>;
export type RecallCorrectionShownEvent = Immutable<
  z.infer<typeof RecallCorrectionShownEventSchema>
>;
export type MemoSessionEndedEvent = Immutable<z.infer<typeof MemoSessionEndedEventSchema>>;
export type RecallParamsUpdatedEvent = Immutable<z.infer<typeof RecallParamsUpdatedEventSchema>>;

export type MemoEvent = Extract<
  GameEvent,
  {
    type:
      | 'RECALL_SESSION_STARTED'
      | 'RECALL_STIMULUS_SHOWN'
      | 'RECALL_STIMULUS_HIDDEN'
      | 'RECALL_WINDOW_OPENED'
      | 'RECALL_PICKED'
      | 'RECALL_WINDOW_COMMITTED'
      | 'RECALL_CORRECTION_SHOWN'
      | 'RECALL_SESSION_ENDED'
      | 'RECALL_PARAMS_UPDATED';
  }
>;

// Place / Flow
export type FlowBaseEvent = ModeBaseEvent;
export type PlaceBaseEvent = FlowBaseEvent;
export type PlaceSlotEnter = Immutable<z.infer<typeof PlaceSlotEnterSchema>>;
export type PlaceSessionStartedEvent = Immutable<z.infer<typeof PlaceSessionStartedEventSchema>>;
export type PlaceStimulusShownEvent = Immutable<z.infer<typeof FlowStimulusShownEventSchema>>;
export type PlacePlacementStartedEvent = Immutable<z.infer<typeof FlowPlacementStartedEventSchema>>;
export type PlaceDropAttemptedEvent = Immutable<z.infer<typeof FlowDropAttemptedEventSchema>>;
export type PlaceDragCancelledEvent = Immutable<z.infer<typeof FlowDragCancelledEventSchema>>;
export type PlaceTurnCompletedEvent = Immutable<z.infer<typeof FlowTurnCompletedEventSchema>>;
export type PlaceSessionEndedEvent = Immutable<z.infer<typeof PlaceSessionEndedEventSchema>>;

// Back-compat aliases (old Flow naming)
export type FlowStimulusShownEvent = PlaceStimulusShownEvent;
export type FlowPlacementStartedEvent = PlacePlacementStartedEvent;
export type FlowDropAttemptedEvent = PlaceDropAttemptedEvent;
export type FlowDragCancelledEvent = PlaceDragCancelledEvent;
export type FlowTurnCompletedEvent = PlaceTurnCompletedEvent;

export type PlaceEvent = Extract<
  GameEvent,
  {
    type:
      | 'FLOW_SESSION_STARTED'
      | 'FLOW_STIMULUS_SHOWN'
      | 'FLOW_PLACEMENT_STARTED'
      | 'FLOW_DROP_ATTEMPTED'
      | 'FLOW_DRAG_CANCELLED'
      | 'FLOW_TURN_COMPLETED'
      | 'FLOW_SESSION_ENDED';
  }
>;

// Dual Pick
export type DualPickBaseEvent = ModeBaseEvent;
export type DualPickSlotEnter = Immutable<z.infer<typeof DualPickSlotEnterSchema>>;
export type DualPickSessionStartedEvent = Immutable<
  z.infer<typeof DualPickSessionStartedEventSchema>
>;
export type DualPickStimulusShownEvent = Immutable<
  z.infer<typeof DualPickStimulusShownEventSchema>
>;
export type DualPickProposal = Immutable<z.infer<typeof DualPickProposalSchema>>;
export type DualPickPlacementStartedEvent = Immutable<
  z.infer<typeof DualPickPlacementStartedEventSchema>
>;
export type DualPickDropAttemptedEvent = Immutable<
  z.infer<typeof DualPickDropAttemptedEventSchema>
>;
export type DualPickTurnCompletedEvent = Immutable<
  z.infer<typeof DualPickTurnCompletedEventSchema>
>;
export type DualPickSessionEndedEvent = Immutable<z.infer<typeof DualPickSessionEndedEventSchema>>;

export type DualPickEvent = Extract<
  GameEvent,
  {
    type:
      | 'DUAL_PICK_SESSION_STARTED'
      | 'DUAL_PICK_STIMULUS_SHOWN'
      | 'DUAL_PICK_PLACEMENT_STARTED'
      | 'DUAL_PICK_DROP_ATTEMPTED'
      | 'DUAL_PICK_TURN_COMPLETED'
      | 'DUAL_PICK_SESSION_ENDED';
  }
>;

// Trace
export type TraceBaseEvent = ModeBaseEvent;
export type TraceSessionStartedEvent = Immutable<z.infer<typeof TraceSessionStartedEventSchema>>;
export type TraceStimulusShownEvent = Immutable<z.infer<typeof TraceStimulusShownEventSchema>>;
export type TraceStimulusHiddenEvent = Immutable<z.infer<typeof TraceStimulusHiddenEventSchema>>;
export type TraceResponseEvent = Immutable<z.infer<typeof TraceResponseEventSchema>>;
export type TraceTimeoutEvent = Immutable<z.infer<typeof TraceTimeoutEventSchema>>;
export type TracePausedEvent = Immutable<z.infer<typeof TracePausedEventSchema>>;
export type TraceResumedEvent = Immutable<z.infer<typeof TraceResumedEventSchema>>;
export type TraceSessionEndedEvent = Immutable<z.infer<typeof TraceSessionEndedEventSchema>>;
export type TraceWritingStartedEvent = Immutable<z.infer<typeof TraceWritingStartedEventSchema>>;
export type TraceWritingCompletedEvent = Immutable<
  z.infer<typeof TraceWritingCompletedEventSchema>
>;
export type TraceWritingTimeoutEvent = Immutable<z.infer<typeof TraceWritingTimeoutEventSchema>>;
export type TraceArithmeticStartedEvent = Immutable<
  z.infer<typeof TraceArithmeticStartedEventSchema>
>;
export type TraceArithmeticCompletedEvent = Immutable<
  z.infer<typeof TraceArithmeticCompletedEventSchema>
>;
export type TraceArithmeticTimeoutEvent = Immutable<
  z.infer<typeof TraceArithmeticTimeoutEventSchema>
>;

export type TraceEvent = Extract<
  GameEvent,
  {
    type:
      | 'TRACE_SESSION_STARTED'
      | 'TRACE_STIMULUS_SHOWN'
      | 'TRACE_STIMULUS_HIDDEN'
      | 'TRACE_RESPONDED'
      | 'TRACE_TIMED_OUT'
      | 'TRACE_PAUSED'
      | 'TRACE_RESUMED'
      | 'TRACE_SESSION_ENDED'
      | 'TRACE_WRITING_STARTED'
      | 'TRACE_WRITING_COMPLETED'
      | 'TRACE_WRITING_TIMEOUT'
      | 'TRACE_ARITHMETIC_STARTED'
      | 'TRACE_ARITHMETIC_COMPLETED'
      | 'TRACE_ARITHMETIC_TIMEOUT';
  }
>;

// Time
export type TimeSessionStartedEvent = Immutable<z.infer<typeof TimeSessionStartedEventSchema>>;
export type TimeTrialCompletedEvent = Immutable<z.infer<typeof TimeTrialCompletedEventSchema>>;
export type TimeSessionEndedEvent = Immutable<z.infer<typeof TimeSessionEndedEventSchema>>;

export type TimeEvent = Extract<
  GameEvent,
  {
    type: 'TIME_SESSION_STARTED' | 'TIME_TRIAL_COMPLETED' | 'TIME_SESSION_ENDED';
  }
>;

// Corsi Block
export type CorsiSessionStartedEvent = Immutable<z.infer<typeof CorsiSessionStartedEventSchema>>;
export type CorsiTrialCompletedEvent = Immutable<z.infer<typeof CorsiTrialCompletedEventSchema>>;
export type CorsiSessionEndedEvent = Immutable<z.infer<typeof CorsiSessionEndedEventSchema>>;

export type CorsiEvent = Extract<
  GameEvent,
  {
    type: 'CORSI_SESSION_STARTED' | 'CORSI_TRIAL_COMPLETED' | 'CORSI_SESSION_ENDED';
  }
>;

// OSPAN
export type OspanSessionStartedEvent = Immutable<z.infer<typeof OspanSessionStartedEventSchema>>;
export type OspanSetCompletedEvent = Immutable<z.infer<typeof OspanSetCompletedEventSchema>>;
export type OspanSessionEndedEvent = Immutable<z.infer<typeof OspanSessionEndedEventSchema>>;

export type OspanEvent = Extract<
  GameEvent,
  {
    type: 'OSPAN_SESSION_STARTED' | 'OSPAN_SET_COMPLETED' | 'OSPAN_SESSION_ENDED';
  }
>;

// Running Span
export type RunningSpanSessionStartedEvent = Immutable<
  z.infer<typeof RunningSpanSessionStartedEventSchema>
>;
export type RunningSpanTrialCompletedEvent = Immutable<
  z.infer<typeof RunningSpanTrialCompletedEventSchema>
>;
export type RunningSpanSessionEndedEvent = Immutable<
  z.infer<typeof RunningSpanSessionEndedEventSchema>
>;

export type RunningSpanEvent = Extract<
  GameEvent,
  {
    type:
      | 'RUNNING_SPAN_SESSION_STARTED'
      | 'RUNNING_SPAN_TRIAL_COMPLETED'
      | 'RUNNING_SPAN_SESSION_ENDED';
  }
>;

// PASAT
export type PasatSessionStartedEvent = Immutable<z.infer<typeof PasatSessionStartedEventSchema>>;
export type PasatTrialCompletedEvent = Immutable<z.infer<typeof PasatTrialCompletedEventSchema>>;
export type PasatSessionEndedEvent = Immutable<z.infer<typeof PasatSessionEndedEventSchema>>;

export type PasatEvent = Extract<
  GameEvent,
  {
    type: 'PASAT_SESSION_STARTED' | 'PASAT_TRIAL_COMPLETED' | 'PASAT_SESSION_ENDED';
  }
>;

// SWM
export type SwmSessionStartedEvent = Immutable<z.infer<typeof SwmSessionStartedEventSchema>>;
export type SwmRoundCompletedEvent = Immutable<z.infer<typeof SwmRoundCompletedEventSchema>>;
export type SwmSessionEndedEvent = Immutable<z.infer<typeof SwmSessionEndedEventSchema>>;

export type SwmEvent = Extract<
  GameEvent,
  {
    type: 'SWM_SESSION_STARTED' | 'SWM_ROUND_COMPLETED' | 'SWM_SESSION_ENDED';
  }
>;

// MOT (Dual Track)
export type MotSessionStartedEvent = Immutable<z.infer<typeof MotSessionStartedEventSchema>>;
export type MotTrialDefinedEvent = Immutable<z.infer<typeof MotTrialDefinedEventSchema>>;
export type MotTrialCompletedEvent = Immutable<z.infer<typeof MotTrialCompletedEventSchema>>;
export type MotSessionEndedEvent = Immutable<z.infer<typeof MotSessionEndedEventSchema>>;

export type MotEvent = Extract<
  GameEvent,
  {
    type: 'MOT_SESSION_STARTED' | 'MOT_TRIAL_DEFINED' | 'MOT_TRIAL_COMPLETED' | 'MOT_SESSION_ENDED';
  }
>;

// Generic Cognitive Task
export type CognitiveTaskSessionStartedEvent = Immutable<
  z.infer<typeof CognitiveTaskSessionStartedEventSchema>
>;
export type CognitiveTaskTrialCompletedEvent = Immutable<
  z.infer<typeof CognitiveTaskTrialCompletedEventSchema>
>;
export type CognitiveTaskSessionEndedEvent = Immutable<
  z.infer<typeof CognitiveTaskSessionEndedEventSchema>
>;

export type CognitiveTaskEvent = Extract<
  GameEvent,
  {
    type:
      | 'COGNITIVE_TASK_SESSION_STARTED'
      | 'COGNITIVE_TASK_TRIAL_COMPLETED'
      | 'COGNITIVE_TASK_SESSION_ENDED';
  }
>;

/** Union canonique (stockée) */
export type GameEvent = Immutable<z.infer<typeof GameEventSchema>>;
export type GameEventType = GameEvent['type'];

/** Type "schema output" (post-parse) */
export type ValidatedGameEvent = Immutable<z.infer<typeof GameEventSchema>>;
