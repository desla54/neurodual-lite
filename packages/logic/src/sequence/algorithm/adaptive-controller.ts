/**
 * AdaptiveControllerAlgorithm - Contrôleur adaptatif temps réel
 *
 * Maintient le d' à une valeur cible via ajustements trial-par-trial.
 * Utilise un contrôleur proportionnel avec lissage exponentiel.
 *
 * C'est la "Couche 3" du système - peut fonctionner seul ou être
 * paramétré par les couches supérieures (profil, meta-learning).
 */

import { createSequenceSpec } from '../types';
import type {
  AdaptiveAlgorithm,
  AlgorithmContext,
  AlgorithmState,
  SequenceSpec,
  SessionConfig,
  TrialResult,
} from '../types';
import { SDTCalculator } from '../../domain/scoring/helpers/sdt-calculator';
import type { AdaptationMode } from './fixed';
import {
  buildNoImmediateRepeatConstraints,
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
  ARM_ISI_MIN_MS,
  ARM_ISI_MAX_MS,
  ARM_STIMULUS_DURATION_MIN_MS,
  ARM_STIMULUS_DURATION_MAX_MS,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration du contrôleur adaptatif.
 */
export interface AdaptiveControllerConfig {
  /** d' cible à maintenir (défaut: 1.5 pour zone de flow) */
  readonly targetDPrime: number;
  /** Niveau N initial */
  readonly initialNLevel: number;
  /** Mode d'adaptation - détermine quels paramètres sont ajustés */
  readonly mode?: AdaptationMode;
  /** Gains du contrôleur (peuvent être fournis par Couche 2) */
  readonly gains?: ControllerGains;
  /** Profil utilisateur (peut être fourni par Couche 1) */
  readonly userProfile?: UserProfile;
  /** Empêche les répétitions immédiates (même valeur deux fois de suite) */
  readonly noImmediateRepeat?: boolean;
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

/**
 * Gains du contrôleur - définissent la "force" des ajustements.
 * Peuvent être appris par la Couche 2 (meta-learning).
 */
export interface ControllerGains {
  /** Gain pour pTarget (défaut: 0.015) */
  readonly kTarget: number;
  /** Gain pour pLure (défaut: 0.008) */
  readonly kLure: number;
  /** Gain pour ISI (défaut: 30ms) - only used in tempo mode */
  readonly kIsi: number;
  /** Gain pour stimulus duration (défaut: 20ms) */
  readonly kStimulusDuration: number;
  /** Facteur de lissage du d' estimé (0-1, défaut: 0.25) */
  readonly smoothingFactor: number;
}

/**
 * Profil utilisateur - décrit les capacités du joueur.
 * Peut être fourni par la Couche 1.
 */
export interface UserProfile {
  /** Capacité estimée par modalité (0-1) */
  readonly modalityStrength: {
    readonly position: number;
    readonly audio: number;
  };
  /** Sensibilité aux leurres (0-1, 1 = très sensible) */
  readonly lureSensitivity: number;
  /** N-level max estimé */
  readonly estimatedMaxN: number;
  /** Facteur de fatigue (baisse de perf par trial, ex: 0.001) */
  readonly fatigueFactor: number;
}

/**
 * Paramètres ajustables en temps réel.
 */
interface AdjustableParams {
  pTarget: number;
  pLure: number;
  isiMs: number;
  stimulusDurationMs: number;
  nLevel: number; // Fixed, never adjusted by algorithm
}

/**
 * État interne du contrôleur.
 */
interface ControllerState {
  /** Paramètres courants */
  params: AdjustableParams;
  /** d' estimé (lissé) */
  estimatedDPrime: number;
  /** Historique récent des résultats (pour calcul d') */
  recentResults: TrialOutcome[];
  /** Nombre de trials dans la session */
  trialCount: number;
  /** Erreur cumulée (pour terme intégral si besoin) */
  cumulativeError: number;
  /** Graine unique pour la session (assure la variabilité) */
  sessionSeed: string;
}

type ModalityOutcome = 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';

/**
 * Outcome d'un trial stocké PAR MODALITÉ.
 * Évite le bug d'OR aggregation qui créait des états invalides
 * comme { isHit: true, isMiss: true }.
 */
interface TrialOutcome {
  /** Outcomes indexés par modalityId */
  readonly byModality: Record<string, ModalityOutcome>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_GAINS: ControllerGains = {
  kTarget: 0.008, // Reduced from 0.015 for smoother adaptation
  kLure: 0.004, // Reduced proportionally
  kIsi: 30,
  kStimulusDuration: 20,
  smoothingFactor: 0.25,
};

const DEFAULT_PROFILE: UserProfile = {
  modalityStrength: { position: 0.5, audio: 0.5 },
  lureSensitivity: 0.5,
  estimatedMaxN: 4,
  fatigueFactor: 0.0005,
};

/** Limites des paramètres @see thresholds.ts (SSOT) */
const PARAM_LIMITS = {
  pTarget: { min: ARM_PTARGET_MIN, max: ARM_PTARGET_MAX },
  pLure: { min: ARM_PLURE_MIN, max: ARM_PLURE_MAX },
  isiMs: { min: ARM_ISI_MIN_MS, max: ARM_ISI_MAX_MS },
  stimulusDurationMs: { min: ARM_STIMULUS_DURATION_MIN_MS, max: ARM_STIMULUS_DURATION_MAX_MS },
};

/** Taille de la fenêtre pour estimer d' (cross-session) @see thresholds.ts (SSOT) */
const DPRIME_WINDOW_SIZE = ADAPTIVE_DPRIME_WINDOW_SIZE;

// =============================================================================
// d' Calculation
// =============================================================================

/**
 * Calcule d' sur une fenêtre de trials.
 * FIX: Calcule d' PAR MODALITÉ puis fait la moyenne (évite l'OR aggregation).
 */
function calculateDPrimeFromWindow(outcomes: TrialOutcome[]): number {
  if (outcomes.length < 3) return ADAPTIVE_TARGET_DPRIME_DEFAULT; // Pas assez de données

  // Collecter tous les modalityIds présents
  const modalityIds = new Set<string>();
  for (const o of outcomes) {
    for (const mid of Object.keys(o.byModality)) {
      modalityIds.add(mid);
    }
  }

  if (modalityIds.size === 0) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

  // Calculer d' par modalité
  const dPrimes: number[] = [];

  for (const modalityId of modalityIds) {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;

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

    if (totalSignal === 0 || totalNoise === 0) {
      // Pas assez de données pour cette modalité, skip
      continue;
    }

    // Correction de Hautus pour éviter les valeurs extrêmes
    const hitRate = (hits + 0.5) / (totalSignal + 1);
    const faRate = (falseAlarms + 0.5) / (totalNoise + 1);

    dPrimes.push(SDTCalculator.probit(hitRate) - SDTCalculator.probit(faRate));
  }

  if (dPrimes.length === 0) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

  // Moyenne des d' par modalité
  return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
}

// Algorithm Implementation
// =============================================================================

function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback sans Math.random() (reste non-déterministe, mais évite l'aléatoire implicite)
  const now = Date.now().toString(36);
  const perf =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? Math.floor(performance.now()).toString(36)
      : '0';
  return `id-${now}-${perf}`;
}

export function createAdaptiveControllerAlgorithm(
  config: AdaptiveControllerConfig,
): AdaptiveAlgorithm {
  const targetDPrime = Number.isFinite(config.targetDPrime)
    ? config.targetDPrime
    : ADAPTIVE_TARGET_DPRIME_DEFAULT;
  const gains = config.gains ?? DEFAULT_GAINS;
  const profile = config.userProfile ?? DEFAULT_PROFILE;

  // Mode determines which levers are active:
  // - tempo: ISI, pTarget, pLure, stimulusDuration
  // - memo: pTarget, pLure, stimulusDuration (NO ISI - user-paced)
  // - flow: pTarget, pLure, stimulusDuration (NO ISI - user-paced)
  // - nLevel is NEVER adjusted by the algorithm (fixed by user/journey)
  let currentMode: 'tempo' | 'memo' | 'flow' = config.mode ?? 'tempo';
  const noImmediateRepeat = config.noImmediateRepeat ?? false;
  let sessionModalityIds: readonly string[] = ['position', 'audio'];

  // Initial params (use config values if provided, otherwise defaults)
  const initialPTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const fixedStimulusDurationMs =
    typeof config.fixedStimulusDurationMs === 'number' &&
    Number.isFinite(config.fixedStimulusDurationMs) &&
    config.fixedStimulusDurationMs > 0
      ? config.fixedStimulusDurationMs
      : null;
  const initialStimulusDurationMs =
    fixedStimulusDurationMs ?? config.initialStimulusDurationMs ?? TIMING_STIMULUS_TEMPO_MS;

  // État initial basé sur le profil
  let state: ControllerState = {
    params: {
      pTarget: initialPTarget,
      pLure: 0.15,
      isiMs: TIMING_INTERVAL_DEFAULT_MS,
      stimulusDurationMs: initialStimulusDurationMs,
      nLevel: config.initialNLevel, // Fixed, never changed
    },
    estimatedDPrime: targetDPrime, // On suppose qu'on démarre à la cible
    recentResults: [],
    trialCount: 0,
    cumulativeError: 0,
    sessionSeed: generateId(),
  };

  /**
   * Ajuste les paramètres en fonction de l'erreur.
   * Respecte les leviers autorisés par mode:
   * - tempo: ISI ✓, pTarget ✓, pLure ✓, stimulusDuration ✓
   * - memo/flow: ISI ✗, pTarget ✓, pLure ✓, stimulusDuration ✓
   * - nLevel: NEVER adjusted (fixed by user/journey)
   */
  function adjustParams(error: number): void {
    if (!Number.isFinite(error)) return;

    // error > 0 → d' trop haut → trop facile → augmenter difficulté
    // error < 0 → d' trop bas → trop dur → baisser difficulté

    const { params } = state;

    // Ajuster pTarget (plus de cibles = plus de décisions = plus difficile)
    // All modes: ✓
    params.pTarget = clamp(
      params.pTarget + error * gains.kTarget,
      PARAM_LIMITS.pTarget.min,
      PARAM_LIMITS.pTarget.max,
    );

    // Ajuster pLure (plus de leurres = plus d'interférences = plus difficile)
    // All modes: ✓
    params.pLure = clamp(
      params.pLure + error * gains.kLure,
      PARAM_LIMITS.pLure.min,
      PARAM_LIMITS.pLure.max,
    );

    // Ajuster stimulusDuration (moins de temps = plus difficile)
    // All modes: ✓
    if (fixedStimulusDurationMs === null) {
      params.stimulusDurationMs = clamp(
        params.stimulusDurationMs - error * gains.kStimulusDuration,
        PARAM_LIMITS.stimulusDurationMs.min,
        PARAM_LIMITS.stimulusDurationMs.max,
      );
    } else {
      params.stimulusDurationMs = clamp(
        fixedStimulusDurationMs,
        PARAM_LIMITS.stimulusDurationMs.min,
        PARAM_LIMITS.stimulusDurationMs.max,
      );
    }

    // Ajuster ISI (moins de temps = plus de pression = plus difficile)
    // ONLY tempo mode - memo/flow are user-paced
    if (currentMode === 'tempo') {
      params.isiMs = clamp(
        params.isiMs - error * gains.kIsi,
        PARAM_LIMITS.isiMs.min,
        PARAM_LIMITS.isiMs.max,
      );
    }

    // nLevel is NEVER adjusted by the algorithm
    // It's fixed by the user in settings or by the journey stage
  }

  function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return (min + max) / 2;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Crée une SequenceSpec depuis les paramètres courants.
   */
  function paramsToSpec(): SequenceSpec {
    const { params } = state;

    const modalities = buildStandardModalities(sessionModalityIds);
    const modalityIds = modalities.map((m) => m.id);

    // N=1: pas de lures N-1
    const pLureApplied = params.nLevel >= 2 ? params.pLure : 0;

    // Build hardConstraints based on options
    const hardConstraints =
      noImmediateRepeat && params.nLevel > 1 ? buildNoImmediateRepeatConstraints(modalityIds) : [];

    return createSequenceSpec({
      nLevel: params.nLevel,
      modalities,
      targetProbabilities: buildUniformTargetProbabilities(modalityIds, params.pTarget),
      lureProbabilities: buildUniformLureProbabilities(modalityIds, pLureApplied),
      timing: {
        isiMs: params.isiMs,
        stimulusDurationMs: params.stimulusDurationMs,
      },
      // Seed stable par session (le moteur garde son propre RNG state)
      seed: `${state.sessionSeed}-ctrl`,
      hardConstraints,
    });
  }

  // ===========================================================================
  // AdaptiveAlgorithm Interface
  // ===========================================================================

  return {
    name: 'adaptive-controller',

    initialize(sessionConfig: SessionConfig): void {
      // Update mode from session config (authoritative source)
      currentMode = sessionConfig.gameMode;
      sessionModalityIds = sessionConfig.modalityIds ?? sessionModalityIds;

      // Reset session-specific state, but KEEP recentResults for cross-session d' smoothing
      // This prevents aggressive adaptation at session start
      state.trialCount = 0;
      state.estimatedDPrime = targetDPrime;
      state.cumulativeError = 0;
      state.sessionSeed = generateId(); // New seed for new session
    },

    getSpec(_context: AlgorithmContext): SequenceSpec {
      return paramsToSpec();
    },

    onTrialCompleted(result: TrialResult): void {
      state.trialCount++;

      // Extraire l'outcome du trial PAR MODALITÉ (évite l'OR aggregation)
      const byModality: Record<string, ModalityOutcome> = {};

      for (const [modalityId, response] of Object.entries(result.responses)) {
        byModality[modalityId] = response.result;
      }

      const outcome: TrialOutcome = { byModality };

      // Ajouter à la fenêtre glissante
      state.recentResults.push(outcome);
      if (state.recentResults.length > DPRIME_WINDOW_SIZE) {
        state.recentResults.shift();
      }

      // Calculer d' sur la fenêtre
      const windowDPrime = calculateDPrimeFromWindow(state.recentResults);

      // Lissage exponentiel (sécurisé contre NaN)
      if (Number.isFinite(windowDPrime)) {
        state.estimatedDPrime =
          gains.smoothingFactor * windowDPrime +
          (1 - gains.smoothingFactor) * state.estimatedDPrime;
      }

      // Calculer l'erreur
      const error = state.estimatedDPrime - targetDPrime;
      if (Number.isFinite(error)) {
        state.cumulativeError = Math.max(-10, Math.min(10, state.cumulativeError + error * 0.1));

        // Ajuster les paramètres (seulement après quelques trials)
        if (state.trialCount >= 5) {
          adjustParams(error);
        }
      }
    },

    serialize(): AlgorithmState {
      return {
        algorithmType: 'adaptive-controller',
        version: 1,
        data: {
          config: {
            targetDPrime,
            initialNLevel: config.initialNLevel,
            mode: currentMode,
            gains,
            userProfile: profile,
          },
          state,
        },
      };
    },

    restore(savedState: AlgorithmState): void {
      if (savedState.algorithmType !== 'adaptive-controller') {
        throw new Error(
          `Cannot restore AdaptiveControllerAlgorithm from ${savedState.algorithmType}`,
        );
      }
      // Version guard: only restore if we understand the format
      const SUPPORTED_VERSIONS = [1];
      if (!SUPPORTED_VERSIONS.includes(savedState.version)) {
        throw new Error(
          `Unsupported adaptive-controller state version ${savedState.version}. ` +
            `Supported: ${SUPPORTED_VERSIONS.join(', ')}. Starting fresh.`,
        );
      }
      const data = savedState.data as {
        state: ControllerState;
        config?: { mode?: 'tempo' | 'memo' | 'flow' };
      };
      state = data.state;
      // NOTE: Don't restore mode from persisted state - the session's gameMode is authoritative.
      // Restoring mode would cause cross-mode contamination when user switches between modes.

      // Backfill sessionSeed if restoring from old state
      if (!state.sessionSeed) {
        state.sessionSeed = generateId();
      }

      // Validate and clamp restored params to prevent corrupted state from breaking gameplay
      // This guards against old or malformed persisted data
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
        state.params.isiMs = clamp(
          state.params.isiMs ?? TIMING_INTERVAL_DEFAULT_MS,
          PARAM_LIMITS.isiMs.min,
          PARAM_LIMITS.isiMs.max,
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
        // nLevel: use persisted value or fall back to config
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
          isiMs: TIMING_INTERVAL_DEFAULT_MS,
          stimulusDurationMs: initialStimulusDurationMs,
          nLevel: config.initialNLevel,
        },
        estimatedDPrime: targetDPrime,
        recentResults: [],
        trialCount: 0,
        cumulativeError: 0,
        sessionSeed: generateId(),
      };
    },
  };
}
