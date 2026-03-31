/**
 * FixedAlgorithm - Algorithme à spec constante
 *
 * Retourne toujours la même spec, utile pour :
 * - Tests unitaires
 * - Debug
 * - Comparaisons contrôlées
 */

import type {
  AdaptiveAlgorithm,
  AlgorithmContext,
  AlgorithmState,
  SequenceSpec,
  SessionConfig,
  TrialResult,
} from '../types';
import { createSequenceSpec } from '../types';
import {
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_LABEL,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

export class FixedAlgorithm implements AdaptiveAlgorithm {
  readonly name = 'FixedAlgorithm';

  private spec: SequenceSpec;

  constructor(spec: SequenceSpec) {
    this.spec = spec;
  }

  initialize(_config: SessionConfig): void {
    // Rien à initialiser, la spec est fixe
  }

  getSpec(_context: AlgorithmContext): SequenceSpec {
    return this.spec;
  }

  onTrialCompleted(_result: TrialResult): void {
    // Rien à faire, la spec ne change pas
  }

  serialize(): AlgorithmState {
    return {
      algorithmType: 'fixed',
      version: 1,
      data: this.spec,
    };
  }

  restore(state: AlgorithmState): void {
    if (state.algorithmType !== 'fixed') {
      throw new Error(`Cannot restore FixedAlgorithm from ${state.algorithmType}`);
    }
    this.spec = state.data as SequenceSpec;
  }

  reset(): void {
    // Rien à réinitialiser
  }

  /**
   * Met à jour la spec (pour tests).
   */
  setSpec(spec: SequenceSpec): void {
    this.spec = spec;
  }
}

/**
 * Crée un FixedAlgorithm avec une spec.
 */
export function createFixedAlgorithm(spec: SequenceSpec): FixedAlgorithm {
  return new FixedAlgorithm(spec);
}

// =============================================================================
// Stub Factories - Placeholder pour futurs algorithmes adaptatifs
// =============================================================================

export type AdaptationMode = 'tempo' | 'memo' | 'flow';

export interface AdaptiveAlgorithmConfig {
  readonly mode?: AdaptationMode;
  readonly initialNLevel?: number;
  readonly initialTargetProbability?: number;
  readonly initialLureProbability?: number;
  /** Empêche les répétitions immédiates (même valeur deux fois de suite) */
  readonly noImmediateRepeat?: boolean;
}

/**
 * Crée une spec par défaut pour les stubs.
 */
function createDefaultSpec(
  nLevel: number,
  pTarget: number,
  pLure: number,
  noImmediateRepeat = false,
): SequenceSpec {
  // Build hardConstraints based on options
  const hardConstraints = noImmediateRepeat
    ? [
        { type: 'no-immediate-repeat', params: { modalityId: 'position' } },
        { type: 'no-immediate-repeat', params: { modalityId: 'audio' } },
      ]
    : [];

  return createSequenceSpec({
    nLevel,
    modalities: [
      { id: 'position', values: 8 },
      { id: 'audio', values: ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T'] },
    ],
    targetProbabilities: {
      position: pTarget,
      audio: pTarget,
    },
    lureProbabilities: {
      position: { 'n-1': pLure },
      audio: { 'n-1': pLure },
    },
    timing: {
      isiMs: TIMING_INTERVAL_DEFAULT_MS,
      stimulusDurationMs: TIMING_STIMULUS_TEMPO_MS,
    },
    seed: 'stub',
    hardConstraints,
  });
}

/**
 * Stub: Crée un algorithme pour Dual Tempo.
 * TODO: Implémenter un vrai algorithme adaptatif pour le timing.
 */
export function createDualTempoAlgorithm(
  config: Partial<AdaptiveAlgorithmConfig> = {},
): AdaptiveAlgorithm {
  const nLevel = config.initialNLevel ?? 2;
  const pTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const pLure = config.initialLureProbability ?? GEN_LURE_PROBABILITY_LABEL;
  const noImmediateRepeat = config.noImmediateRepeat ?? false;
  return new FixedAlgorithm(createDefaultSpec(nLevel, pTarget, pLure, noImmediateRepeat));
}

/**
 * Stub: Crée un algorithme pour Dual Memo.
 * TODO: Implémenter un vrai algorithme adaptatif pour le niveau N.
 */
export function createDualMemoAlgorithm(
  config: Partial<AdaptiveAlgorithmConfig> = {},
): AdaptiveAlgorithm {
  const nLevel = config.initialNLevel ?? 2;
  const pTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const pLure = config.initialLureProbability ?? GEN_LURE_PROBABILITY_LABEL;
  const noImmediateRepeat = config.noImmediateRepeat ?? false;
  return new FixedAlgorithm(createDefaultSpec(nLevel, pTarget, pLure, noImmediateRepeat));
}

/**
 * Stub: Crée un algorithme pour Dual Place.
 * TODO: Implémenter un vrai algorithme adaptatif pour la probabilité.
 */
export function createDualPlaceAlgorithm(
  config: Partial<AdaptiveAlgorithmConfig> = {},
): AdaptiveAlgorithm {
  const nLevel = config.initialNLevel ?? 2;
  const pTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const pLure = config.initialLureProbability ?? GEN_LURE_PROBABILITY_LABEL;
  const noImmediateRepeat = config.noImmediateRepeat ?? false;
  return new FixedAlgorithm(createDefaultSpec(nLevel, pTarget, pLure, noImmediateRepeat));
}
