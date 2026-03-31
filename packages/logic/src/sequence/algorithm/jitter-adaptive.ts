/**
 * JitterAdaptiveAlgorithm - Algorithme avec ISI variable (jitter)
 *
 * Stratégie :
 * - ISI de base fixe ou adaptatif
 * - Ajout d'un jitter aléatoire (± X ms) pour empêcher le timing mental
 * - Le jitter peut augmenter avec le d' (plus le joueur est bon, plus de chaos)
 *
 * Modes de jitter :
 * - fixed: jitter constant (ex: ±300ms)
 * - adaptive: jitter augmente avec performance (0 → ±500ms selon d')
 * - rhythm: ISI fixe, pas de jitter (facilite l'entrainement)
 */

import type {
  AdaptiveAlgorithm,
  AlgorithmContext,
  AlgorithmState,
  RandomState,
  SequenceSpec,
  SessionConfig,
  TrialResult,
} from '../types';
import { createSequenceSpec } from '../types';
import { createPRNG, type PRNG } from '../engine';
import { SDTCalculator } from '../../domain/scoring/helpers/sdt-calculator';
import {
  buildStandardModalities,
  buildUniformLureProbabilities,
  buildUniformTargetProbabilities,
} from './standard-spec';
import {
  ADAPTIVE_TARGET_DPRIME_DEFAULT,
  ADAPTIVE_DPRIME_WINDOW_SIZE,
  ARM_PTARGET_MIN,
  ARM_PTARGET_MAX,
  ARM_PLURE_MIN,
  ARM_PLURE_MAX,
  ARM_STIMULUS_DURATION_MIN_MS,
  ARM_STIMULUS_DURATION_MAX_MS,
  ARM_JITTER_BASE_ISI_MIN_MS,
  ARM_JITTER_BASE_ISI_MAX_MS,
  ARM_JITTER_MIN_MS,
  ARM_JITTER_MAX_MS,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

export type JitterMode = 'fixed' | 'adaptive' | 'rhythm';

export interface JitterAdaptiveConfig {
  /** d' cible à maintenir */
  readonly targetDPrime: number;
  /** Niveau N initial */
  readonly initialNLevel: number;
  /** Mode de jitter */
  readonly jitterMode?: JitterMode;
  /** Jitter de base en ms (pour mode 'fixed') */
  readonly baseJitterMs?: number;
  /** Jitter max en ms (pour mode 'adaptive') */
  readonly maxJitterMs?: number;
  /** Mode d'adaptation ('tempo' | 'memo' | 'flow') */
  readonly mode?: 'tempo' | 'memo' | 'flow';
  /** Initial target probability (défaut: 0.30) */
  readonly initialTargetProbability?: number;
  /** Initial stimulus duration in milliseconds (défaut: TIMING_STIMULUS_TEMPO_MS) */
  readonly initialStimulusDurationMs?: number;
  /**
   * When defined, the algorithm must never adjust stimulus duration and must keep it fixed.
   * Used by modes that require precise on/off synchronization (e.g. Dual Catch with 500ms).
   */
  readonly fixedStimulusDurationMs?: number;
}

interface ControllerState {
  params: {
    pTarget: number;
    pLure: number;
    baseIsiMs: number;
    jitterMs: number;
    stimulusDurationMs: number;
    nLevel: number;
  };
  estimatedDPrime: number;
  recentResults: TrialOutcome[];
  trialCount: number;
  sessionSeed: string;
  rng: RandomState;
}

interface TrialOutcome {
  readonly byModality: Record<string, 'hit' | 'miss' | 'false-alarm' | 'correct-rejection'>;
}

// =============================================================================
// Constants
// =============================================================================

/** @see thresholds.ts (SSOT) */
const DPRIME_WINDOW_SIZE = ADAPTIVE_DPRIME_WINDOW_SIZE;
/** @see thresholds.ts (SSOT) */
const PARAM_LIMITS = {
  pTarget: { min: ARM_PTARGET_MIN, max: ARM_PTARGET_MAX },
  pLure: { min: ARM_PLURE_MIN, max: ARM_PLURE_MAX },
  baseIsiMs: { min: ARM_JITTER_BASE_ISI_MIN_MS, max: ARM_JITTER_BASE_ISI_MAX_MS },
  jitterMs: { min: ARM_JITTER_MIN_MS, max: ARM_JITTER_MAX_MS },
  stimulusDurationMs: { min: ARM_STIMULUS_DURATION_MIN_MS, max: ARM_STIMULUS_DURATION_MAX_MS },
};

const DEFAULT_GAINS = {
  kTarget: 0.008,
  kLure: 0.004,
  kJitter: 50, // ms de jitter par unité d'erreur
  smoothingFactor: 0.25,
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// d' Calculation
// =============================================================================

function calculateDPrimeFromWindow(outcomes: TrialOutcome[]): number {
  if (outcomes.length < 3) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

  const modalityIds = new Set<string>();
  for (const o of outcomes) {
    for (const mid of Object.keys(o.byModality)) {
      modalityIds.add(mid);
    }
  }

  if (modalityIds.size === 0) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

  const dPrimes: number[] = [];

  for (const modalityId of modalityIds) {
    let hits = 0,
      misses = 0,
      falseAlarms = 0,
      correctRejections = 0;

    for (const o of outcomes) {
      const result = o.byModality[modalityId];
      if (!result) continue;

      switch (result) {
        case 'hit':
          hits++;
          break;
        case 'miss':
          misses++;
          break;
        case 'false-alarm':
          falseAlarms++;
          break;
        case 'correct-rejection':
          correctRejections++;
          break;
      }
    }

    const totalSignal = hits + misses;
    const totalNoise = falseAlarms + correctRejections;

    if (totalSignal === 0 || totalNoise === 0) continue;

    const hitRate = (hits + 0.5) / (totalSignal + 1);
    const faRate = (falseAlarms + 0.5) / (totalNoise + 1);

    const dPrime = SDTCalculator.probit(hitRate) - SDTCalculator.probit(faRate);
    if (Number.isFinite(dPrime)) {
      dPrimes.push(dPrime);
    }
  }

  if (dPrimes.length === 0) return ADAPTIVE_TARGET_DPRIME_DEFAULT;
  return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
}

// =============================================================================
// Algorithm Implementation
// =============================================================================

export function createJitterAdaptiveAlgorithm(config: JitterAdaptiveConfig): AdaptiveAlgorithm {
  const targetDPrime = config.targetDPrime;
  const jitterMode = config.jitterMode ?? 'adaptive';
  const baseJitterMs = config.baseJitterMs ?? 300;
  const maxJitterMs = config.maxJitterMs ?? 500;
  const fixedStimulusDurationMs =
    typeof config.fixedStimulusDurationMs === 'number' &&
    Number.isFinite(config.fixedStimulusDurationMs) &&
    config.fixedStimulusDurationMs > 0
      ? config.fixedStimulusDurationMs
      : null;
  const initialPTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const initialStimulusDurationMs =
    fixedStimulusDurationMs ?? config.initialStimulusDurationMs ?? TIMING_STIMULUS_TEMPO_MS;

  let currentMode: 'tempo' | 'memo' | 'flow' = config.mode ?? 'tempo';
  let sessionModalityIds: readonly string[] = ['position', 'audio'];

  function generateSessionSeed(): string {
    if (
      typeof crypto !== 'undefined' &&
      'randomUUID' in crypto &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
    return `seed-${Date.now().toString(36)}`;
  }

  let rng: PRNG;

  let state: ControllerState = {
    params: {
      pTarget: initialPTarget,
      pLure: 0.15,
      baseIsiMs: TIMING_INTERVAL_DEFAULT_MS,
      jitterMs: jitterMode === 'fixed' ? baseJitterMs : 0,
      stimulusDurationMs: initialStimulusDurationMs,
      nLevel: config.initialNLevel,
    },
    estimatedDPrime: targetDPrime,
    recentResults: [],
    trialCount: 0,
    sessionSeed: generateSessionSeed(),
    rng: { seed: 'init', callCount: 0 },
  };

  // Init deterministic RNG for jitter/exploration
  rng = createPRNG(`jitter-${state.sessionSeed}`);
  state.rng = rng.getState();

  function adjustParams(error: number): void {
    const { params } = state;

    // Ajuster pTarget et pLure (comme adaptive-controller)
    params.pTarget = clamp(
      params.pTarget + error * DEFAULT_GAINS.kTarget,
      PARAM_LIMITS.pTarget.min,
      PARAM_LIMITS.pTarget.max,
    );

    params.pLure = clamp(
      params.pLure + error * DEFAULT_GAINS.kLure,
      PARAM_LIMITS.pLure.min,
      PARAM_LIMITS.pLure.max,
    );

    // Ajuster le jitter selon le mode
    switch (jitterMode) {
      case 'adaptive':
        // Plus le joueur est bon (d' élevé), plus on ajoute de chaos
        // error > 0 → trop facile → augmenter jitter
        params.jitterMs = clamp(
          params.jitterMs + error * DEFAULT_GAINS.kJitter,
          PARAM_LIMITS.jitterMs.min,
          maxJitterMs,
        );
        break;
      case 'fixed':
        // Jitter constant
        params.jitterMs = baseJitterMs;
        break;
      case 'rhythm':
        // Pas de jitter - rythme parfait
        params.jitterMs = 0;
        break;
    }
  }

  function paramsToSpec(): SequenceSpec {
    const { params } = state;

    const modalities = buildStandardModalities(sessionModalityIds);
    const modalityIds = modalities.map((m) => m.id);
    const pLureApplied = params.nLevel >= 2 ? params.pLure : 0;

    // Calculer ISI effectif avec jitter aléatoire
    const jitter = params.jitterMs > 0 ? Math.floor((rng.random() - 0.5) * 2 * params.jitterMs) : 0;
    const effectiveIsiMs = clamp(
      params.baseIsiMs + jitter,
      PARAM_LIMITS.baseIsiMs.min,
      PARAM_LIMITS.baseIsiMs.max,
    );

    return createSequenceSpec({
      nLevel: params.nLevel,
      modalities,
      targetProbabilities: buildUniformTargetProbabilities(modalityIds, params.pTarget),
      lureProbabilities: buildUniformLureProbabilities(modalityIds, pLureApplied),
      timing: {
        isiMs: effectiveIsiMs,
        stimulusDurationMs: params.stimulusDurationMs,
      },
      // Seed stable par session (le moteur garde son propre RNG state)
      seed: `${state.sessionSeed}-jitter`,
    });
  }

  return {
    name: 'jitter-adaptive',

    initialize(sessionConfig: SessionConfig): void {
      currentMode = sessionConfig.gameMode;
      sessionModalityIds = sessionConfig.modalityIds ?? sessionModalityIds;

      // Reset session-specific state, but KEEP recentResults for cross-session d' smoothing
      state.trialCount = 0;
      state.estimatedDPrime = targetDPrime;
      state.sessionSeed = generateSessionSeed();
      rng = createPRNG(`jitter-${state.sessionSeed}`);
      state.rng = rng.getState();
    },

    getSpec(_context: AlgorithmContext): SequenceSpec {
      const spec = paramsToSpec();
      // Persist RNG callCount for deterministic replay/debug
      state.rng = rng.getState();
      return spec;
    },

    onTrialCompleted(result: TrialResult): void {
      state.trialCount++;

      const byModality: Record<string, 'hit' | 'miss' | 'false-alarm' | 'correct-rejection'> = {};
      for (const [modalityId, response] of Object.entries(result.responses)) {
        byModality[modalityId] = response.result;
      }

      const outcome: TrialOutcome = { byModality };
      state.recentResults.push(outcome);
      if (state.recentResults.length > DPRIME_WINDOW_SIZE) {
        state.recentResults.shift();
      }

      const windowDPrime = calculateDPrimeFromWindow(state.recentResults);

      state.estimatedDPrime = Number.isFinite(windowDPrime)
        ? DEFAULT_GAINS.smoothingFactor * windowDPrime +
          (1 - DEFAULT_GAINS.smoothingFactor) * state.estimatedDPrime
        : state.estimatedDPrime;

      const error = state.estimatedDPrime - targetDPrime;
      adjustParams(error);
    },

    serialize(): AlgorithmState {
      return {
        algorithmType: 'jitter-adaptive',
        version: 1,
        data: {
          config: { targetDPrime, jitterMode, baseJitterMs, maxJitterMs, mode: currentMode },
          state: { ...state },
        },
      };
    },

    restore(saved: AlgorithmState): void {
      if (saved.algorithmType !== 'jitter-adaptive') {
        throw new Error(`Cannot restore: expected jitter-adaptive, got ${saved.algorithmType}`);
      }
      if (saved.version !== 1) {
        throw new Error(`Unsupported version: ${saved.version}`);
      }

      const data = saved.data as { config: JitterAdaptiveConfig; state: ControllerState };
      state = { ...data.state };
      currentMode = data.config.mode ?? 'tempo';

      // Backfill sessionSeed if missing
      if (!state.sessionSeed) {
        state.sessionSeed = generateSessionSeed();
      }
      // Backfill RNG state if missing
      if (!state.rng?.seed) {
        state.rng = { seed: `jitter-${state.sessionSeed}`, callCount: 0 };
      }
      rng = createPRNG(state.rng.seed, state.rng);

      // Validate and clamp restored params to prevent corrupted state from breaking gameplay
      if (state.params) {
        state.params.pTarget = clamp(
          state.params.pTarget ?? GEN_TARGET_PROBABILITY_DEFAULT,
          PARAM_LIMITS.pTarget.min,
          PARAM_LIMITS.pTarget.max,
        );
        state.params.pLure = clamp(
          state.params.pLure ?? GEN_LURE_PROBABILITY_DEFAULT,
          PARAM_LIMITS.pLure.min,
          PARAM_LIMITS.pLure.max,
        );
        state.params.baseIsiMs = clamp(
          state.params.baseIsiMs ?? TIMING_INTERVAL_DEFAULT_MS,
          PARAM_LIMITS.baseIsiMs.min,
          PARAM_LIMITS.baseIsiMs.max,
        );
        state.params.jitterMs = clamp(
          state.params.jitterMs ?? 0,
          PARAM_LIMITS.jitterMs.min,
          PARAM_LIMITS.jitterMs.max,
        );
        state.params.stimulusDurationMs = clamp(
          state.params.stimulusDurationMs ?? TIMING_STIMULUS_TEMPO_MS,
          PARAM_LIMITS.stimulusDurationMs.min,
          PARAM_LIMITS.stimulusDurationMs.max,
        );
        if (fixedStimulusDurationMs !== null) {
          state.params.stimulusDurationMs = clamp(
            fixedStimulusDurationMs,
            PARAM_LIMITS.stimulusDurationMs.min,
            PARAM_LIMITS.stimulusDurationMs.max,
          );
        }
        if (!Number.isInteger(state.params.nLevel) || state.params.nLevel < 1) {
          state.params.nLevel = config.initialNLevel;
        }
      }
    },

    reset(): void {
      state = {
        params: {
          pTarget: initialPTarget,
          pLure: 0.15,
          baseIsiMs: TIMING_INTERVAL_DEFAULT_MS,
          jitterMs: jitterMode === 'fixed' ? baseJitterMs : 0,
          stimulusDurationMs: initialStimulusDurationMs,
          nLevel: config.initialNLevel,
        },
        estimatedDPrime: targetDPrime,
        recentResults: [],
        trialCount: 0,
        sessionSeed: generateSessionSeed(),
        rng: { seed: 'init', callCount: 0 },
      };
      rng = createPRNG(`jitter-${state.sessionSeed}`);
      state.rng = rng.getState();
    },
  };
}
