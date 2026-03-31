/**
 * MetaLearningAlgorithm - Modèle adaptatif à 3 couches
 *
 * Architecture :
 * - Couche 1 : Modèle Utilisateur (profil cognitif bayésien)
 * - Couche 2 : Politique d'Adaptation (apprend les gains optimaux)
 * - Couche 3 : Contrôleur Temps Réel (ajustements trial-par-trial)
 *
 * Le système apprend à apprendre : il adapte sa stratégie d'adaptation
 * en fonction de ce qui fonctionne pour chaque utilisateur.
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
  SEQUENCE_FATIGUE_RATE_DEFAULT,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

export interface MetaLearningConfig {
  /** d' cible à maintenir */
  readonly targetDPrime: number;
  /** Niveau N initial */
  readonly initialNLevel: number;
  /** Mode d'adaptation ('tempo' | 'memo' | 'flow') */
  readonly mode?: 'tempo' | 'memo' | 'flow';
  /** Données historiques pour initialiser les couches (optionnel) */
  readonly historicalData?: HistoricalSessionData[];
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
 * Données d'une session passée (pour apprentissage).
 */
export interface HistoricalSessionData {
  /** Résultats des trials */
  readonly trials: HistoricalTrial[];
  /** d' moyen de la session */
  readonly averageDPrime: number;
  /** Paramètres utilisés */
  readonly params: {
    nLevel: number;
    pTarget: number;
    pLure: number;
    isiMs: number;
  };
}

interface HistoricalTrial {
  readonly result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
  readonly modality: 'position' | 'audio';
  readonly trialType: 'target' | 'lure' | 'neutral';
  readonly reactionTimeMs?: number;
}

// =============================================================================
// Couche 1 : Modèle Utilisateur (Profil Cognitif)
// =============================================================================

interface UserModelState {
  /** Capacité par modalité (distribution Beta) */
  modalityCapacity: {
    position: { alpha: number; beta: number };
    audio: { alpha: number; beta: number };
  };
  /** Sensibilité aux leurres (distribution Beta) */
  lureSensitivity: { alpha: number; beta: number };
  /** N-level moyen réussi */
  averageSuccessfulN: number;
  /** Compteur de sessions pour pondération */
  sessionCount: number;
  /** Courbe de fatigue estimée (baisse par trial) */
  fatigueRate: number;
}

function createInitialUserModel(): UserModelState {
  return {
    modalityCapacity: {
      position: { alpha: 2, beta: 2 }, // Prior neutre
      audio: { alpha: 2, beta: 2 },
    },
    lureSensitivity: { alpha: 2, beta: 2 },
    averageSuccessfulN: 2,
    sessionCount: 0,
    fatigueRate: SEQUENCE_FATIGUE_RATE_DEFAULT,
  };
}

function updateUserModel(model: UserModelState, sessionData: SessionDataForLearning): void {
  model.sessionCount++;

  // Mise à jour des capacités par modalité
  const posHits = sessionData.modalityStats.position.hits;
  const posMisses = sessionData.modalityStats.position.misses;
  const audioHits = sessionData.modalityStats.audio.hits;
  const audioMisses = sessionData.modalityStats.audio.misses;

  // Bayesian update (pondéré pour éviter la sur-confiance)
  const weight = Math.min(1, 10 / model.sessionCount); // Diminue avec l'expérience
  model.modalityCapacity.position.alpha += posHits * weight;
  model.modalityCapacity.position.beta += posMisses * weight;
  model.modalityCapacity.audio.alpha += audioHits * weight;
  model.modalityCapacity.audio.beta += audioMisses * weight;

  // Mise à jour sensibilité aux leurres
  const lureHits = sessionData.lureStats.correct;
  const lureFails = sessionData.lureStats.failed;
  model.lureSensitivity.alpha += lureFails * weight; // Plus de fails = plus sensible
  model.lureSensitivity.beta += lureHits * weight;

  // N-level moyen (moyenne mobile exponentielle)
  if (sessionData.averageDPrime >= 1.0) {
    model.averageSuccessfulN = 0.8 * model.averageSuccessfulN + 0.2 * sessionData.nLevel;
  }

  // Fatigue (estimée depuis la baisse de performance en fin de session)
  if (sessionData.performanceDecline > 0) {
    model.fatigueRate = 0.9 * model.fatigueRate + 0.1 * sessionData.performanceDecline;
  }
}

function getUserProfile(model: UserModelState) {
  return {
    positionStrength:
      model.modalityCapacity.position.alpha /
      (model.modalityCapacity.position.alpha + model.modalityCapacity.position.beta),
    audioStrength:
      model.modalityCapacity.audio.alpha /
      (model.modalityCapacity.audio.alpha + model.modalityCapacity.audio.beta),
    lureSensitivity:
      model.lureSensitivity.alpha / (model.lureSensitivity.alpha + model.lureSensitivity.beta),
    estimatedMaxN: Math.ceil(model.averageSuccessfulN + 1),
    fatigueRate: model.fatigueRate,
    confidence: Math.min(1, model.sessionCount / 10), // 0-1, plein à 10 sessions
  };
}

// =============================================================================
// Couche 2 : Politique d'Adaptation (Meta-Learning)
// =============================================================================

interface AdaptationPolicyState {
  /** Gains appris pour le contrôleur */
  gains: {
    kTarget: number;
    kLure: number;
    kIsi: number;
    kStimulusDuration: number;
    smoothingFactor: number;
  };
  /** Historique des ajustements et leurs effets */
  adjustmentHistory: AdjustmentRecord[];
  /** Paramètre d'exploration (décroît avec l'expérience) */
  explorationRate: number;
}

interface AdjustmentRecord {
  /** Type d'ajustement */
  paramAdjusted: 'pTarget' | 'pLure' | 'isiMs' | 'stimulusDurationMs';
  /** Index (0-based) du trial dans l'historique de session (dPrimeHistory) */
  trialIndex?: number;
  /** Magnitude de l'ajustement */
  magnitude: number;
  /** Effet observé sur d' */
  dPrimeChange: number;
  /** Contexte (d' avant l'ajustement) */
  contextDPrime: number;
}

function createInitialPolicy(): AdaptationPolicyState {
  return {
    gains: {
      kTarget: 0.015,
      kLure: 0.008,
      kIsi: 30,
      kStimulusDuration: 20,
      smoothingFactor: 0.25,
    },
    adjustmentHistory: [],
    explorationRate: 0.3, // 30% d'exploration au début
  };
}

function updatePolicy(
  policy: AdaptationPolicyState,
  sessionAdjustments: AdjustmentRecord[],
  targetDPrime: number,
): void {
  // Ajouter à l'historique
  policy.adjustmentHistory.push(...sessionAdjustments);

  // Garder seulement les 100 derniers
  if (policy.adjustmentHistory.length > 100) {
    policy.adjustmentHistory = policy.adjustmentHistory.slice(-100);
  }

  // Réduire l'exploration
  policy.explorationRate = Math.max(0.05, policy.explorationRate * 0.95);

  // Apprendre les gains optimaux depuis l'historique
  if (policy.adjustmentHistory.length >= 10) {
    learnOptimalGains(policy, targetDPrime);
  }
}

function learnOptimalGains(policy: AdaptationPolicyState, targetDPrime: number): void {
  const history = policy.adjustmentHistory;

  // Pour chaque type de paramètre, calculer l'efficacité moyenne
  const efficacyByParam: Record<string, number[]> = {
    pTarget: [],
    pLure: [],
    isiMs: [],
    stimulusDurationMs: [],
  };

  for (const record of history) {
    // Efficacité = changement de d' vers la cible / magnitude
    // Positif si l'ajustement a rapproché de la cible
    const wasApproaching =
      Math.abs(record.contextDPrime + record.dPrimeChange - targetDPrime) <
      Math.abs(record.contextDPrime - targetDPrime);

    const efficacy = wasApproaching
      ? Math.abs(record.dPrimeChange / (record.magnitude + 0.001))
      : -Math.abs(record.dPrimeChange / (record.magnitude + 0.001));

    const paramEfficiacy = efficacyByParam[record.paramAdjusted];
    if (paramEfficiacy) {
      paramEfficiacy.push(efficacy);
    }
  }

  // Ajuster les gains en fonction de l'efficacité
  const learningRate = 0.1;

  for (const [param, efficacies] of Object.entries(efficacyByParam)) {
    if (efficacies.length < 3) continue;

    const avgEfficacy = efficacies.reduce((a, b) => a + b, 0) / efficacies.length;

    // Si efficace, augmenter le gain ; sinon, le réduire
    switch (param) {
      case 'pTarget':
        policy.gains.kTarget = clamp(
          policy.gains.kTarget * (1 + avgEfficacy * learningRate),
          0.005,
          0.05,
        );
        break;
      case 'pLure':
        policy.gains.kLure = clamp(
          policy.gains.kLure * (1 + avgEfficacy * learningRate),
          0.002,
          0.03,
        );
        break;
      case 'isiMs':
        policy.gains.kIsi = clamp(policy.gains.kIsi * (1 + avgEfficacy * learningRate), 10, 100);
        break;
      case 'stimulusDurationMs':
        policy.gains.kStimulusDuration = clamp(
          policy.gains.kStimulusDuration * (1 + avgEfficacy * learningRate),
          5,
          50,
        );
        break;
    }
  }
}

// =============================================================================
// Couche 3 : Contrôleur Temps Réel
// =============================================================================

interface ControllerState {
  params: {
    pTarget: number;
    pLure: number;
    isiMs: number;
    stimulusDurationMs: number;
    nLevel: number; // Fixed, never adjusted by algorithm
  };
  estimatedDPrime: number;
  recentResults: TrialOutcome[];
  trialCount: number;
  cumulativeError: number;
  /** Historique des ajustements de cette session (pour Couche 2) */
  sessionAdjustments: AdjustmentRecord[];
  /** Graine unique pour la session (assure la variabilité) */
  sessionSeed: string;
  /** RNG deterministe pour l'exploration (no Math.random) */
  rng: RandomState;
}

interface TrialOutcome {
  /** Outcomes indexés par modalityId */
  readonly byModality: Record<string, 'hit' | 'miss' | 'false-alarm' | 'correct-rejection'>;
}

interface SessionDataForLearning {
  modalityStats: {
    position: { hits: number; misses: number };
    audio: { hits: number; misses: number };
  };
  lureStats: { correct: number; failed: number };
  averageDPrime: number;
  nLevel: number;
  performanceDecline: number;
}

// =============================================================================
// Helpers
// =============================================================================

/** Taille de la fenêtre pour estimer d' (cross-session) @see thresholds.ts (SSOT) */
const DPRIME_WINDOW_SIZE = ADAPTIVE_DPRIME_WINDOW_SIZE;
/** @see thresholds.ts (SSOT) */
const PARAM_LIMITS = {
  pTarget: { min: ARM_PTARGET_MIN, max: ARM_PTARGET_MAX },
  pLure: { min: ARM_PLURE_MIN, max: ARM_PLURE_MAX },
  isiMs: { min: ARM_ISI_MIN_MS, max: ARM_ISI_MAX_MS },
  stimulusDurationMs: { min: ARM_STIMULUS_DURATION_MIN_MS, max: ARM_STIMULUS_DURATION_MAX_MS },
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

/**
 * Calcule d' sur une fenêtre de trials.
 * FIX: Calcule d' PAR MODALITÉ puis fait la moyenne (évite l'OR aggregation).
 */
function calculateDPrimeFromWindow(outcomes: TrialOutcome[]): number {
  if (outcomes.length < 3) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

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

    if (totalSignal === 0 || totalNoise === 0) continue;

    // Correction de Hautus
    const hitRate = (hits + 0.5) / (totalSignal + 1);
    const faRate = (falseAlarms + 0.5) / (totalNoise + 1);

    const dPrime = SDTCalculator.probit(hitRate) - SDTCalculator.probit(faRate);
    if (Number.isFinite(dPrime)) {
      dPrimes.push(dPrime);
    }
  }

  if (dPrimes.length === 0) return ADAPTIVE_TARGET_DPRIME_DEFAULT;

  // Moyenne des d' par modalité
  return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
}

// =============================================================================
// Algorithm Implementation
// =============================================================================

export function createMetaLearningAlgorithm(config: MetaLearningConfig): AdaptiveAlgorithm {
  const targetDPrime = config.targetDPrime;

  // Mode determines which levers are active:
  // - tempo: ISI, pTarget, pLure, stimulusDuration
  // - memo: pTarget, pLure, stimulusDuration (NO ISI - user-paced)
  // - flow: pTarget, pLure, stimulusDuration (NO ISI - user-paced)
  // - nLevel is NEVER adjusted by the algorithm (fixed by user/journey)
  let currentMode: 'tempo' | 'memo' | 'flow' = config.mode ?? 'tempo';
  const noImmediateRepeat = config.noImmediateRepeat ?? false;
  let sessionModalityIds: readonly string[] = ['position', 'audio'];
  const fixedStimulusDurationMs =
    typeof config.fixedStimulusDurationMs === 'number' &&
    Number.isFinite(config.fixedStimulusDurationMs) &&
    config.fixedStimulusDurationMs > 0
      ? config.fixedStimulusDurationMs
      : null;
  const initialPTarget = config.initialTargetProbability ?? GEN_TARGET_PROBABILITY_DEFAULT;
  const initialStimulusDurationMs =
    fixedStimulusDurationMs ?? config.initialStimulusDurationMs ?? TIMING_STIMULUS_TEMPO_MS;

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

  // RNG deterministe pour l'exploration (séparé du RNG du moteur)
  let rng: PRNG;
  let hasFinalizedThisSession = false;

  // Les 3 couches
  let userModel = createInitialUserModel();
  let policy = createInitialPolicy();
  let controller: ControllerState = {
    params: {
      pTarget: initialPTarget,
      pLure: 0.15,
      isiMs: TIMING_INTERVAL_DEFAULT_MS,
      stimulusDurationMs: initialStimulusDurationMs,
      nLevel: config.initialNLevel, // Fixed, never changed
    },
    estimatedDPrime: targetDPrime,
    recentResults: [],
    trialCount: 0,
    cumulativeError: 0,
    sessionAdjustments: [],
    sessionSeed: generateSessionSeed(),
    rng: { seed: 'init', callCount: 0 },
  };
  rng = createPRNG(`meta-${controller.sessionSeed}`);
  controller.rng = rng.getState();

  // Stats de session pour apprentissage
  let sessionStats = {
    modalityStats: {
      position: { hits: 0, misses: 0, total: 0 },
      audio: { hits: 0, misses: 0, total: 0 },
    },
    lureStats: { correct: 0, failed: 0 },
    dPrimeHistory: [] as number[],
    firstHalfDPrime: 0,
    secondHalfDPrime: 0,
  };

  // Initialiser depuis l'historique si disponible
  if (config.historicalData && config.historicalData.length > 0) {
    initializeFromHistory(config.historicalData);
  }

  function initializeFromHistory(history: HistoricalSessionData[]): void {
    for (const session of history) {
      // Simuler l'apprentissage pour chaque session historique
      const sessionData: SessionDataForLearning = {
        modalityStats: {
          position: { hits: 0, misses: 0 },
          audio: { hits: 0, misses: 0 },
        },
        lureStats: { correct: 0, failed: 0 },
        averageDPrime: session.averageDPrime,
        nLevel: session.params.nLevel,
        performanceDecline: 0,
      };

      // Compter les stats depuis les trials
      for (const trial of session.trials) {
        const modalityStats = sessionData.modalityStats[trial.modality];
        if (trial.result === 'hit') modalityStats.hits++;
        if (trial.result === 'miss') modalityStats.misses++;

        if (trial.trialType === 'lure') {
          if (trial.result === 'correct-rejection') sessionData.lureStats.correct++;
          if (trial.result === 'false-alarm') sessionData.lureStats.failed++;
        }
      }

      updateUserModel(userModel, sessionData);
    }

    // Note: nLevel is NOT adjusted here - it's fixed by config
    // The profile's estimatedMaxN is informational only
  }

  /**
   * Ajuste les paramètres en fonction de l'erreur.
   * Respecte les leviers autorisés par mode:
   * - tempo: ISI ✓, pTarget ✓, pLure ✓, stimulusDuration ✓
   * - memo/flow: ISI ✗, pTarget ✓, pLure ✓, stimulusDuration ✓
   * - nLevel: NEVER adjusted (fixed by user/journey)
   */
  function adjustParams(error: number, trialIndex: number): void {
    const { params } = controller;
    const { gains } = policy;
    const prevDPrime = controller.estimatedDPrime;

    // Exploration vs exploitation
    const shouldExplore = rng.random() < policy.explorationRate;

    // Ajuster pTarget (all modes: ✓)
    const pTargetAdjust = error * gains.kTarget * (shouldExplore ? rng.random() * 2 : 1);
    const oldPTarget = params.pTarget;
    params.pTarget = clamp(
      params.pTarget + pTargetAdjust,
      PARAM_LIMITS.pTarget.min,
      PARAM_LIMITS.pTarget.max,
    );

    // Ajuster pLure (all modes: ✓) - utiliser le profil pour moduler
    const profile = getUserProfile(userModel);
    const lureMultiplier = profile.lureSensitivity > 0.6 ? 0.5 : 1; // Moins agressif si sensible
    const pLureAdjust = error * gains.kLure * lureMultiplier;
    const oldPLure = params.pLure;
    params.pLure = clamp(
      params.pLure + pLureAdjust,
      PARAM_LIMITS.pLure.min,
      PARAM_LIMITS.pLure.max,
    );

    // Ajuster stimulusDuration (all modes: ✓) - moins de temps = plus difficile
    const oldStimulusDuration = params.stimulusDurationMs;
    if (fixedStimulusDurationMs === null) {
      const stimulusAdjust = -error * gains.kStimulusDuration;
      params.stimulusDurationMs = clamp(
        params.stimulusDurationMs + stimulusAdjust,
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

    // Ajuster ISI (ONLY tempo mode - memo/flow are user-paced)
    let oldIsi = params.isiMs;
    if (currentMode === 'tempo') {
      const isiAdjust = -error * gains.kIsi;
      oldIsi = params.isiMs;
      params.isiMs = clamp(
        params.isiMs + isiAdjust,
        PARAM_LIMITS.isiMs.min,
        PARAM_LIMITS.isiMs.max,
      );
    }

    // nLevel is NEVER adjusted by the algorithm
    // It's fixed by the user in settings or by the journey stage

    // Enregistrer pour meta-learning
    if (Math.abs(params.pTarget - oldPTarget) > 0.001) {
      controller.sessionAdjustments.push({
        paramAdjusted: 'pTarget',
        trialIndex,
        magnitude: params.pTarget - oldPTarget,
        dPrimeChange: 0, // Sera mis à jour au prochain calcul
        contextDPrime: prevDPrime,
      });
    }
    if (Math.abs(params.pLure - oldPLure) > 0.001) {
      controller.sessionAdjustments.push({
        paramAdjusted: 'pLure',
        trialIndex,
        magnitude: params.pLure - oldPLure,
        dPrimeChange: 0,
        contextDPrime: prevDPrime,
      });
    }
    if (
      fixedStimulusDurationMs === null &&
      Math.abs(params.stimulusDurationMs - oldStimulusDuration) > 1
    ) {
      controller.sessionAdjustments.push({
        paramAdjusted: 'stimulusDurationMs',
        trialIndex,
        magnitude: params.stimulusDurationMs - oldStimulusDuration,
        dPrimeChange: 0,
        contextDPrime: prevDPrime,
      });
    }
    if (currentMode === 'tempo' && Math.abs(params.isiMs - oldIsi) > 1) {
      controller.sessionAdjustments.push({
        paramAdjusted: 'isiMs',
        trialIndex,
        magnitude: params.isiMs - oldIsi,
        dPrimeChange: 0,
        contextDPrime: prevDPrime,
      });
    }
  }

  function paramsToSpec(): SequenceSpec {
    const { params } = controller;

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
      seed: `${controller.sessionSeed}-meta`,
      hardConstraints,
    });
  }

  function finalizeSession(): void {
    if (hasFinalizedThisSession) return;
    hasFinalizedThisSession = true;

    // Calculer les stats de session pour apprentissage
    const avgDPrime =
      sessionStats.dPrimeHistory.length > 0
        ? sessionStats.dPrimeHistory.reduce((a, b) => a + b, 0) / sessionStats.dPrimeHistory.length
        : targetDPrime;

    // Performance decline = différence entre 1ère et 2ème moitié
    const performanceDecline =
      Math.max(0, sessionStats.firstHalfDPrime - sessionStats.secondHalfDPrime) /
      controller.trialCount;

    const sessionData: SessionDataForLearning = {
      modalityStats: {
        position: sessionStats.modalityStats.position,
        audio: sessionStats.modalityStats.audio,
      },
      lureStats: sessionStats.lureStats,
      averageDPrime: avgDPrime,
      nLevel: controller.params.nLevel,
      performanceDecline,
    };

    // Mettre à jour les effets des ajustements
    for (let i = 0; i < controller.sessionAdjustments.length; i++) {
      const adjustment = controller.sessionAdjustments[i];
      if (adjustment) {
        const history = sessionStats.dPrimeHistory;
        const last = Math.max(0, history.length - 1);

        const idxRaw = typeof adjustment.trialIndex === 'number' ? adjustment.trialIndex : i;
        const idx = Math.max(0, Math.min(last, Math.round(idxRaw)));

        const nextDPrime = history[Math.min(idx + 5, last)];
        const prevDPrime = history[Math.max(0, idx - 1)];
        if (nextDPrime !== undefined && prevDPrime !== undefined) {
          adjustment.dPrimeChange = nextDPrime - prevDPrime;
        }
      }
    }

    // Couche 1 : Mettre à jour le modèle utilisateur
    updateUserModel(userModel, sessionData);

    // Couche 2 : Mettre à jour la politique
    updatePolicy(policy, controller.sessionAdjustments, targetDPrime);
  }

  // ===========================================================================
  // AdaptiveAlgorithm Interface
  // ===========================================================================

  return {
    name: 'meta-learning',

    initialize(sessionConfig: SessionConfig): void {
      // Update mode from session config (authoritative source)
      currentMode = sessionConfig.gameMode;
      sessionModalityIds = sessionConfig.modalityIds ?? sessionModalityIds;

      // Reset session-specific state, but KEEP recentResults for cross-session d' smoothing
      hasFinalizedThisSession = false;
      controller.trialCount = 0;
      controller.cumulativeError = 0;
      controller.sessionAdjustments = [];
      controller.estimatedDPrime = targetDPrime;
      controller.sessionSeed = generateSessionSeed(); // New seed for new session
      rng = createPRNG(`meta-${controller.sessionSeed}`);
      controller.rng = rng.getState();

      sessionStats = {
        modalityStats: {
          position: { hits: 0, misses: 0, total: 0 },
          audio: { hits: 0, misses: 0, total: 0 },
        },
        lureStats: { correct: 0, failed: 0 },
        dPrimeHistory: [],
        firstHalfDPrime: 0,
        secondHalfDPrime: 0,
      };

      // Note: nLevel is NOT adjusted from profile
      // It's fixed by the user in settings or by the journey stage
    },

    getSpec(_context: AlgorithmContext): SequenceSpec {
      const spec = paramsToSpec();
      controller.rng = rng.getState();
      return spec;
    },

    onTrialCompleted(result: TrialResult): void {
      controller.trialCount++;

      // Extraire l'outcome du trial PAR MODALITÉ (évite l'OR aggregation)
      const byModality: Record<string, 'hit' | 'miss' | 'false-alarm' | 'correct-rejection'> = {};

      for (const [modalityId, response] of Object.entries(result.responses)) {
        const modality = modalityId as 'position' | 'audio';
        const stats = sessionStats.modalityStats[modality];
        if (!stats) continue;

        byModality[modalityId] = response.result;

        switch (response.result) {
          case 'hit':
            stats.hits++;
            stats.total++;
            break;
          case 'miss':
            stats.misses++;
            stats.total++;
            break;
          case 'false-alarm':
            stats.total++;
            break;
          case 'correct-rejection':
            stats.total++;
            break;
        }

        // Lure detection (approximatif - on regarde les false alarms)
        if (response.result === 'false-alarm') {
          sessionStats.lureStats.failed++;
        } else if (response.result === 'correct-rejection') {
          sessionStats.lureStats.correct++;
        }
      }

      const outcome: TrialOutcome = { byModality };

      // Fenêtre glissante
      controller.recentResults.push(outcome);
      if (controller.recentResults.length > DPRIME_WINDOW_SIZE) {
        controller.recentResults.shift();
      }

      // Calculer d' sur la fenêtre
      const windowDPrime = calculateDPrimeFromWindow(controller.recentResults);
      sessionStats.dPrimeHistory.push(windowDPrime);

      // Lissage exponentiel (sécurisé contre NaN)
      const smoothing = policy.gains.smoothingFactor;
      controller.estimatedDPrime = Number.isFinite(windowDPrime)
        ? smoothing * windowDPrime + (1 - smoothing) * controller.estimatedDPrime
        : controller.estimatedDPrime;

      // Calculer l'erreur
      const error = controller.estimatedDPrime - targetDPrime;
      controller.cumulativeError = clamp(controller.cumulativeError + error * 0.1, -10, 10);

      // Stats pour calcul de fatigue
      const halfwayPoint = 20; // Supposons ~40 trials par session
      if (controller.trialCount === halfwayPoint) {
        sessionStats.firstHalfDPrime = controller.estimatedDPrime;
      } else if (controller.trialCount === halfwayPoint * 2) {
        sessionStats.secondHalfDPrime = controller.estimatedDPrime;
      }

      // Ajuster les paramètres (après warmup)
      if (controller.trialCount >= 5 && Number.isFinite(error)) {
        // Index 0-based dans l'historique de dPrime de cette session
        const idx = sessionStats.dPrimeHistory.length - 1;
        adjustParams(error, idx);
        controller.rng = rng.getState();
      }
    },

    serialize(): AlgorithmState {
      // Important: Meta-learning needs to "close" the session before persisting,
      // otherwise the learned userModel/policy never gets updated.
      if (controller.trialCount > 0) {
        finalizeSession();
      }
      controller.rng = rng.getState();

      return {
        algorithmType: 'meta-learning',
        version: 1,
        data: {
          config: {
            targetDPrime,
            initialNLevel: config.initialNLevel,
            mode: currentMode,
          },
          userModel,
          policy,
          controller: {
            params: controller.params,
            estimatedDPrime: controller.estimatedDPrime,
            trialCount: controller.trialCount,
            cumulativeError: controller.cumulativeError,
            sessionSeed: controller.sessionSeed,
            recentResults: controller.recentResults,
            rng: controller.rng,
          },
        },
      };
    },

    restore(savedState: AlgorithmState): void {
      if (savedState.algorithmType !== 'meta-learning') {
        throw new Error(`Cannot restore MetaLearningAlgorithm from ${savedState.algorithmType}`);
      }
      // Version guard: only restore if we understand the format
      const SUPPORTED_VERSIONS = [1];
      if (!SUPPORTED_VERSIONS.includes(savedState.version)) {
        throw new Error(
          `Unsupported meta-learning state version ${savedState.version}. ` +
            `Supported: ${SUPPORTED_VERSIONS.join(', ')}. Starting fresh.`,
        );
      }
      const data = savedState.data as {
        config?: { mode?: 'tempo' | 'memo' | 'flow' };
        userModel: UserModelState;
        policy: AdaptationPolicyState;
        controller: Partial<ControllerState>;
      };
      userModel = data.userModel;
      policy = data.policy;
      controller.params = data.controller.params ?? controller.params;
      controller.estimatedDPrime = data.controller.estimatedDPrime ?? targetDPrime;
      controller.cumulativeError = data.controller.cumulativeError ?? 0;
      controller.recentResults = data.controller.recentResults ?? controller.recentResults;

      // Restore sessionSeed, backfill if missing (migration)
      if (data.controller.sessionSeed) {
        controller.sessionSeed = data.controller.sessionSeed;
      } else {
        controller.sessionSeed = generateSessionSeed();
      }
      // Restore RNG state, backfill if missing (migration)
      if (data.controller.rng?.seed) {
        controller.rng = data.controller.rng as RandomState;
      } else {
        controller.rng = { seed: `meta-${controller.sessionSeed}`, callCount: 0 };
      }
      rng = createPRNG(controller.rng.seed, controller.rng);

      // Validate and clamp restored params to prevent corrupted state from breaking gameplay
      // This guards against old or malformed persisted data
      if (controller.params) {
        controller.params.pTarget = clamp(
          controller.params.pTarget ?? GEN_TARGET_PROBABILITY_DEFAULT,
          PARAM_LIMITS.pTarget.min,
          PARAM_LIMITS.pTarget.max,
        );
        controller.params.pLure = clamp(
          controller.params.pLure ?? GEN_LURE_PROBABILITY_DEFAULT,
          PARAM_LIMITS.pLure.min,
          PARAM_LIMITS.pLure.max,
        );
        controller.params.isiMs = clamp(
          controller.params.isiMs ?? TIMING_INTERVAL_DEFAULT_MS,
          PARAM_LIMITS.isiMs.min,
          PARAM_LIMITS.isiMs.max,
        );
        controller.params.stimulusDurationMs = clamp(
          controller.params.stimulusDurationMs ?? TIMING_STIMULUS_TEMPO_MS,
          PARAM_LIMITS.stimulusDurationMs.min,
          PARAM_LIMITS.stimulusDurationMs.max,
        );
        if (fixedStimulusDurationMs !== null) {
          controller.params.stimulusDurationMs = clamp(
            fixedStimulusDurationMs,
            PARAM_LIMITS.stimulusDurationMs.min,
            PARAM_LIMITS.stimulusDurationMs.max,
          );
        }
        // nLevel: use persisted value or fall back to config
        if (!Number.isInteger(controller.params.nLevel) || controller.params.nLevel < 1) {
          controller.params.nLevel = config.initialNLevel;
        }
      }

      // NOTE: Don't restore mode from persisted state - the session's gameMode is authoritative.
      // Restoring mode would cause cross-mode contamination when user switches between modes.
    },

    reset(): void {
      userModel = createInitialUserModel();
      policy = createInitialPolicy();
      controller = {
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
        sessionAdjustments: [],
        sessionSeed: generateSessionSeed(),
        rng: { seed: 'init', callCount: 0 },
      };
      rng = createPRNG(`meta-${controller.sessionSeed}`);
      controller.rng = rng.getState();
      hasFinalizedThisSession = false;
    },

    // === Méthodes additionnelles pour debug/UI ===

    /** Retourne le profil utilisateur actuel */
    getUserProfile() {
      return getUserProfile(userModel);
    },

    /** Retourne les gains actuels de la politique */
    getPolicyGains() {
      return { ...policy.gains };
    },

    /** Retourne les paramètres courants */
    getCurrentParams() {
      return { ...controller.params };
    },

    /** Retourne le d' estimé */
    getEstimatedDPrime() {
      return controller.estimatedDPrime;
    },
  } as AdaptiveAlgorithm & {
    getUserProfile(): ReturnType<typeof getUserProfile>;
    getPolicyGains(): AdaptationPolicyState['gains'];
    getCurrentParams(): ControllerState['params'];
    getEstimatedDPrime(): number;
  };
}
