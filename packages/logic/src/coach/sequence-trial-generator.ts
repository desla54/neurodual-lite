/**
 * SequenceTrialGenerator - Pont entre le moteur de séquences et l'interface TrialGenerator
 *
 * Utilise le nouveau SequenceEngine avec un AdaptiveAlgorithm
 * pour générer des trials compatibles avec le système existant.
 */

import type { GameParams, PerformanceContext, TrialFeedback } from '../types/adaptive';
import type { Trial } from '../domain';
import { SDTCalculator } from '../domain/scoring/helpers/sdt-calculator';
import type { BlockConfig } from '../types/core';
import {
  createSequenceEngine,
  toTrial,
  createDefaultConstraints,
  createDefaultSoftConstraints,
  type AdaptiveAlgorithm,
  type AlgorithmContext,
  type AlgorithmState,
  type Constraint,
  type EngineState,
  type GeneratedTrial,
  type PerformanceMetrics,
  type SequenceSpec,
  type SessionConfig,
  type TrialResult as SequenceTrialResult,
} from '../sequence';
import type { TrialGenerator } from './trial-generator';
import {
  COACH_DIFFICULTY_TO_ZONE_DIVISOR,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_FALLBACK_ISI_SECONDS,
  GEN_FALLBACK_STIMULUS_DURATION_SECONDS,
  DIFFICULTY_MAX_N_LEVEL,
  DIFFICULTY_TARGET_PROBABILITY_REF,
  DIFFICULTY_ISI_MIN_MS,
  DIFFICULTY_ISI_RANGE_MS,
} from '../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

export interface SequenceTrialGeneratorConfig {
  /** Configuration du bloc */
  readonly blockConfig: BlockConfig;
  /** Algorithme adaptatif à utiliser */
  readonly algorithm: AdaptiveAlgorithm;
  /** Nombre de trials scorables (hors buffer) */
  readonly totalTrials: number;
  /** Mode d'adaptation ('tempo' | 'memo' | 'flow') */
  readonly gameMode: 'tempo' | 'memo' | 'flow';
}

// =============================================================================
// SequenceTrialGenerator
// =============================================================================

/**
 * Générateur de trials basé sur le nouveau moteur de séquences.
 */
export class SequenceTrialGenerator implements TrialGenerator {
  private readonly engine = createSequenceEngine();
  private readonly algorithm: AdaptiveAlgorithm;
  private readonly sessionConfig: SessionConfig;
  private readonly totalTrialsCount: number;
  private readonly activeModalities: readonly string[];
  private readonly constraints: readonly Constraint[];

  private currentSpec: SequenceSpec;
  private engineState: EngineState;
  private generatedTrials: Trial[] = [];
  private generatedSequenceTrials: GeneratedTrial[] = [];
  private nextIndex = 0;

  // Performance tracking for algorithm feedback (par modalité)
  private readonly modalityCounts = new Map<
    string,
    {
      hits: number;
      misses: number;
      falseAlarms: number;
      correctRejections: number;
      reactionTimes: number[];
    }
  >();
  private trialsEvaluated = 0;
  private errorStreak = 0;
  private successStreak = 0;
  private reactionTimes: number[] = [];

  constructor(config: SequenceTrialGeneratorConfig) {
    this.algorithm = config.algorithm;
    // totalTrials = trials scorables ; totalTrialsCount = buffer (nLevel) + scorables
    this.totalTrialsCount = config.totalTrials + config.blockConfig.nLevel;
    this.activeModalities = config.blockConfig.activeModalities;
    for (const modalityId of this.activeModalities) {
      this.modalityCounts.set(modalityId, {
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
        reactionTimes: [],
      });
    }

    // Initialize algorithm with correct SessionConfig shape (gameMode passed for lever filtering)
    this.sessionConfig = {
      nLevel: config.blockConfig.nLevel,
      modalityIds: config.blockConfig.activeModalities,
      totalTrials: this.totalTrialsCount,
      gameMode: config.gameMode,
    };
    this.algorithm.initialize(this.sessionConfig);

    // Get initial spec and create engine state
    this.currentSpec = this.algorithm.getSpec(this.buildContext());
    this.engineState = this.engine.createInitialState(this.currentSpec);

    // Create default constraints to prevent repetitions
    // NOTE: nLevel is passed to conditionally add NoImmediateRepeat for nLevel > 1
    this.constraints = [
      ...createDefaultConstraints(this.activeModalities, config.blockConfig.nLevel),
      ...createDefaultSoftConstraints(this.activeModalities, config.blockConfig.nLevel),
    ];
  }

  // ===========================================================================
  // TrialGenerator Interface
  // ===========================================================================

  generateNext(feedback?: TrialFeedback): Trial {
    // Process feedback from previous trial
    if (feedback && this.nextIndex > 0) {
      this.processFeedbackInternal(feedback);
    }

    // Update spec from algorithm (may have adapted)
    this.currentSpec = this.algorithm.getSpec(this.buildContext());

    // Generate next trial using sequence engine with constraints
    let result: ReturnType<typeof this.engine.generateNext>;
    try {
      result = this.engine.generateNext(this.currentSpec, this.engineState, this.constraints);
    } catch (err) {
      // Guardrail: if constraints/spec combination becomes unsatisfiable, retry with reduced rules
      console.warn(
        '[SequenceTrialGenerator] Generation failed, retrying without extra constraints',
        err,
      );
      try {
        result = this.engine.generateNext(this.currentSpec, this.engineState);
      } catch (err2) {
        console.error(
          '[SequenceTrialGenerator] Generation failed, falling back to safe spec',
          err2,
        );
        const safeSpec = this.buildSafeSpec(this.currentSpec);
        this.currentSpec = safeSpec;
        result = this.engine.generateNext(safeSpec, this.engineState);
      }
    }
    this.engineState = result.newState;

    // Store the generated trial for context building
    this.generatedSequenceTrials.push(result.trial);

    // Convert to legacy Trial format
    const trial = toTrial(result.trial, this.currentSpec);
    this.generatedTrials.push(trial);
    this.nextIndex++;

    return trial;
  }

  hasMore(): boolean {
    return this.nextIndex < this.totalTrialsCount;
  }

  getTotalTrials(): number {
    return this.totalTrialsCount;
  }

  getNextIndex(): number {
    return this.nextIndex;
  }

  getGeneratedTrials(): Trial[] {
    return [...this.generatedTrials];
  }

  // ===========================================================================
  // Adaptive Methods
  // ===========================================================================

  getGameParameters(): GameParams | null {
    const timing = this.currentSpec.timing;
    const difficulty = this.getDifficulty() ?? 50;
    const lureProbability = this.getLureProbability() ?? 0;
    const targetProbability = this.getTargetProbability() ?? GEN_TARGET_PROBABILITY_DEFAULT;

    return {
      isi: timing?.isiMs ? timing.isiMs / 1000 : GEN_FALLBACK_ISI_SECONDS,
      stimulusDuration: timing?.stimulusDurationMs
        ? timing.stimulusDurationMs / 1000
        : GEN_FALLBACK_STIMULUS_DURATION_SECONDS,
      pLure: lureProbability,
      pTarget: targetProbability,
      difficulty,
    };
  }

  getDifficulty(): number | null {
    // Calculate difficulty based on current parameters (0-100)
    const nLevel = this.currentSpec.nLevel;
    const targetProb =
      this.currentSpec.targetProbabilities['position'] ?? GEN_TARGET_PROBABILITY_DEFAULT;
    const isi = this.currentSpec.timing?.isiMs ?? GEN_FALLBACK_ISI_SECONDS * 1000;

    // Simple difficulty formula: higher N, higher target prob, lower ISI = harder
    const nFactor = (nLevel - 1) / DIFFICULTY_MAX_N_LEVEL; // N=1 -> 0, N=9 -> 1
    const probFactor = targetProb / DIFFICULTY_TARGET_PROBABILITY_REF; // 0.3 -> 0.6, 0.5 -> 1
    const isiFactor = 1 - (isi - DIFFICULTY_ISI_MIN_MS) / DIFFICULTY_ISI_RANGE_MS; // 1500ms -> 1, 5000ms -> 0

    return Math.round(nFactor * 50 + probFactor * 25 + isiFactor * 25);
  }

  getLureProbability(): number | null {
    // Sum lure probabilities if defined
    const lureProbsPosition = this.currentSpec.lureProbabilities['position'];
    if (!lureProbsPosition) return 0;
    return (lureProbsPosition['n-1'] ?? 0) + (lureProbsPosition['n+1'] ?? 0);
  }

  getTargetProbability(): number | null {
    return this.currentSpec.targetProbabilities['position'] ?? GEN_TARGET_PROBABILITY_DEFAULT;
  }

  getISI(): number | null {
    const isiMs = this.currentSpec.timing?.isiMs;
    return isiMs ? isiMs / 1000 : 3.0;
  }

  getNLevel(): number {
    return this.currentSpec.nLevel;
  }

  getPerformanceContext(): PerformanceContext | null {
    if (this.trialsEvaluated === 0) return null;

    const totals = this.getAggregatedCounts();
    const hitRate = totals.hits / Math.max(1, totals.hits + totals.misses);
    const faRate = totals.falseAlarms / Math.max(1, totals.falseAlarms + totals.correctRejections);
    const avgRT =
      this.reactionTimes.length > 0
        ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
        : null;

    return {
      dPrime: this.calculateDPrime(),
      hitRate,
      faRate,
      errorStreak: this.errorStreak,
      successStreak: this.successStreak,
      trialCount: this.trialsEvaluated,
      avgReactionTime: avgRT,
    };
  }

  getZoneNumber(): number | null {
    // Map difficulty to zone (1-20)
    const difficulty = this.getDifficulty();
    if (difficulty === null) return null;
    return Math.max(1, Math.min(20, Math.ceil(difficulty / COACH_DIFFICULTY_TO_ZONE_DIVISOR)));
  }

  processFeedback(feedback: TrialFeedback): void {
    this.processFeedbackInternal(feedback);
  }

  isAdaptive(): boolean {
    return true;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private processFeedbackInternal(feedback: TrialFeedback): void {
    // Track reaction time (global)
    if (feedback.reactionTime !== undefined) {
      this.reactionTimes.push(feedback.reactionTime);
    }

    const lastTrial = this.generatedTrials[this.generatedTrials.length - 1];
    if (!lastTrial) return;

    // Ne pas inclure les buffers dans l'adaptation/perf (aligné avec RunningStatsCalculator)
    if (lastTrial.isBuffer) return;

    const byModality = feedback.byModality;

    const responses: SequenceTrialResult['responses'] = {};

    let wasGloballyCorrect = true;

    for (const modalityId of this.activeModalities) {
      const wasTarget = this.getWasTarget(lastTrial, modalityId);
      if (wasTarget === null) continue;

      const modalityFeedback = byModality?.[modalityId];
      const isCorrect = modalityFeedback?.isCorrect ?? feedback.isCorrect;
      wasGloballyCorrect = wasGloballyCorrect && isCorrect;

      const resultType = this.toResultType(wasTarget, isCorrect);
      const rt = modalityFeedback?.reactionTime ?? feedback.reactionTime;

      responses[modalityId] = {
        pressed: wasTarget ? isCorrect : !isCorrect,
        wasTarget,
        result: resultType,
        reactionTimeMs: rt,
      };

      this.updateModalityCounts(modalityId, resultType, rt);
    }

    // Update streaks based on global correctness (all active modalities)
    if (wasGloballyCorrect) {
      this.successStreak++;
      this.errorStreak = 0;
    } else {
      this.errorStreak++;
      this.successStreak = 0;
    }

    this.trialsEvaluated++;

    this.algorithm.onTrialCompleted({
      trialIndex: lastTrial.index,
      responses,
      reactionTimeMs: feedback.reactionTime,
    });
  }

  private toResultType(
    isTarget: boolean,
    isCorrect: boolean,
  ): 'hit' | 'miss' | 'false-alarm' | 'correct-rejection' {
    if (isTarget) {
      return isCorrect ? 'hit' : 'miss';
    }
    return isCorrect ? 'correct-rejection' : 'false-alarm';
  }

  private getWasTarget(trial: Trial, modalityId: string): boolean | null {
    switch (modalityId) {
      case 'position':
        return trial.isPositionTarget;
      case 'audio':
        return trial.isSoundTarget;
      case 'color':
        return trial.isColorTarget;
      default:
        return null;
    }
  }

  private updateModalityCounts(
    modalityId: string,
    result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection',
    reactionTimeMs?: number,
  ): void {
    const current =
      this.modalityCounts.get(modalityId) ??
      ({
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
        reactionTimes: [],
      } as const);

    const next = { ...current };
    switch (result) {
      case 'hit':
        next.hits++;
        break;
      case 'miss':
        next.misses++;
        break;
      case 'false-alarm':
        next.falseAlarms++;
        break;
      case 'correct-rejection':
        next.correctRejections++;
        break;
    }

    if (reactionTimeMs !== undefined && reactionTimeMs > 0) {
      next.reactionTimes = [...next.reactionTimes, reactionTimeMs];
    }

    this.modalityCounts.set(modalityId, next);
  }

  private getAggregatedCounts(): {
    hits: number;
    misses: number;
    falseAlarms: number;
    correctRejections: number;
  } {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;

    for (const counts of this.modalityCounts.values()) {
      hits += counts.hits;
      misses += counts.misses;
      falseAlarms += counts.falseAlarms;
      correctRejections += counts.correctRejections;
    }

    return { hits, misses, falseAlarms, correctRejections };
  }

  private buildContext(): AlgorithmContext {
    const performance = this.buildPerformanceMetrics();

    return {
      trialIndex: this.nextIndex,
      history: this.generatedSequenceTrials,
      performance,
    };
  }

  private buildSafeSpec(spec: SequenceSpec): SequenceSpec {
    const modalityIds = spec.modalities.map((m) => m.id);
    const targetProbabilities: Record<string, number> = {};
    const lureProbabilities: Record<string, Record<string, number>> = {};

    for (const id of modalityIds) {
      targetProbabilities[id] = 0;
      lureProbabilities[id] = {};
    }

    return {
      ...spec,
      targetProbabilities,
      lureProbabilities: lureProbabilities as SequenceSpec['lureProbabilities'],
      correlationMatrix: undefined,
      hardConstraints: [],
      softConstraints: [],
      budget: undefined,
    };
  }

  private buildPerformanceMetrics(): PerformanceMetrics | undefined {
    if (this.trialsEvaluated === 0) return undefined;

    const totals = this.getAggregatedCounts();
    const hitRate = totals.hits / Math.max(1, totals.hits + totals.misses);
    const falseAlarmRate =
      totals.falseAlarms / Math.max(1, totals.falseAlarms + totals.correctRejections);
    const avgRT =
      this.reactionTimes.length > 0
        ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
        : null;

    const dPrimeByModality: Record<string, number> = {};
    const dPrimes: number[] = [];

    for (const modalityId of this.activeModalities) {
      const counts = this.modalityCounts.get(modalityId);
      if (!counts) continue;

      const dPrime = SDTCalculator.calculateDPrime(
        counts.hits,
        counts.misses,
        counts.falseAlarms,
        counts.correctRejections,
      );
      dPrimeByModality[modalityId] = dPrime;
      dPrimes.push(dPrime);
    }

    const dPrime = dPrimes.length > 0 ? dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length : 0;

    return {
      dPrime,
      dPrimeByModality,
      hitRate,
      falseAlarmRate,
      avgReactionTimeMs: avgRT,
      trialsEvaluated: this.trialsEvaluated,
    };
  }

  private calculateDPrime(): number {
    const dPrimes: number[] = [];
    for (const modalityId of this.activeModalities) {
      const counts = this.modalityCounts.get(modalityId);
      if (!counts) continue;
      dPrimes.push(
        SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        ),
      );
    }
    if (dPrimes.length === 0) return 0;
    return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
  }

  // ===========================================================================
  // Algorithm State Persistence
  // ===========================================================================

  /**
   * Serialize the algorithm state for persistence.
   * Returns null if the algorithm doesn't support serialization.
   */
  serializeAlgorithmState(): AlgorithmState | null {
    if (!this.algorithm.serialize) return null;
    return this.algorithm.serialize();
  }

  /**
   * Restore the algorithm state from persisted data.
   * No-op if the algorithm doesn't support restoration.
   */
  restoreAlgorithmState(state: AlgorithmState): void {
    if (!this.algorithm.restore) return;
    this.algorithm.restore(state);

    // Important: persisted states are cross-session (profile/parameters).
    // Re-initialize the algorithm for the current session so session-scoped counters/seed reset.
    this.algorithm.initialize(this.sessionConfig);

    // If we restore before generating any trial, rebuild engine state so the seed is coherent.
    if (this.nextIndex === 0) {
      this.currentSpec = this.algorithm.getSpec(this.buildContext());
      this.engineState = this.engine.createInitialState(this.currentSpec);
      this.generatedTrials = [];
      this.generatedSequenceTrials = [];
    }
  }

  /**
   * Get the algorithm type (for persistence key).
   */
  getAlgorithmType(): string {
    return this.algorithm.name;
  }

  /**
   * Avance le générateur à un index donné (pour la reprise de session).
   * Pour le mode adaptatif, rejoue les feedbacks pour reconstruire l'état interne.
   *
   * @param index - L'index à atteindre
   * @param history - Les trials déjà générés
   * @param feedbacks - Les feedbacks des trials passés
   */
  skipTo(index: number, history?: readonly Trial[], feedbacks?: readonly TrialFeedback[]): void {
    if (index < 0 || index > this.totalTrialsCount) {
      throw new Error(`Invalid skipTo index: ${index} (valid range: 0-${this.totalTrialsCount})`);
    }

    // Si pas d'historique fourni, on ne peut pas reconstruire l'état
    // On avance simplement l'index (mode dégradé)
    if (!history || history.length === 0) {
      console.warn('[SequenceTrialGenerator] skipTo without history - degraded recovery');
      this.nextIndex = index;
      return;
    }

    // Rejouer les trials un par un pour reconstruire l'état du moteur
    // et les compteurs de performance
    console.log(
      `[SequenceTrialGenerator] Recovering to index ${index} with ${history.length} trials`,
    );

    // Reset state
    this.generatedTrials = [];
    this.generatedSequenceTrials = [];
    this.nextIndex = 0;
    this.trialsEvaluated = 0;
    this.errorStreak = 0;
    this.successStreak = 0;
    this.reactionTimes = [];
    for (const modalityId of this.activeModalities) {
      this.modalityCounts.set(modalityId, {
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
        reactionTimes: [],
      });
    }

    // Rejouer chaque trial avec son feedback correspondant
    for (let i = 0; i < index && i < history.length; i++) {
      const trial = history[i];
      if (!trial) continue;

      // Stocker le trial
      this.generatedTrials.push(trial);

      // Reconstruire GeneratedTrial pour l'historique du moteur
      // Note: L'intention n'est pas parfaitement reconstituée mais l'algo
      // s'adapte principalement via onTrialCompleted, pas via l'historique.
      const values: Record<
        string,
        { modalityId: string; value: number | string; intention: 'target' | 'neutral' }
      > = {
        position: {
          modalityId: 'position',
          value: trial.position,
          intention: trial.isPositionTarget ? 'target' : 'neutral',
        },
        audio: {
          modalityId: 'audio',
          value: trial.sound,
          intention: trial.isSoundTarget ? 'target' : 'neutral',
        },
      };

      if (trial.color !== undefined) {
        values['color'] = {
          modalityId: 'color',
          value: trial.color,
          intention: trial.isColorTarget ? 'target' : 'neutral',
        };
      }

      this.generatedSequenceTrials.push({
        index: trial.index,
        values,
      } as GeneratedTrial);

      this.nextIndex++;

      // Appliquer le feedback s'il existe
      const feedback = feedbacks?.[i];
      if (feedback) {
        this.processFeedbackInternal(feedback);
      }
    }

    // Mettre à jour la spec depuis l'algorithme (état adapté)
    this.currentSpec = this.algorithm.getSpec(this.buildContext());

    console.log(
      `[SequenceTrialGenerator] Recovery complete: index=${this.nextIndex}, evaluated=${this.trialsEvaluated}`,
    );
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Crée un SequenceTrialGenerator avec l'algorithme approprié.
 */
export function createSequenceTrialGenerator(
  blockConfig: BlockConfig,
  algorithm: AdaptiveAlgorithm,
  gameMode: 'tempo' | 'memo' | 'flow' = 'tempo',
): SequenceTrialGenerator {
  return new SequenceTrialGenerator({
    blockConfig,
    algorithm,
    totalTrials: blockConfig.trialsCount,
    gameMode,
  });
}
