/**
 * ThompsonSamplingAlgorithm - Algorithme adaptatif basé sur Thompson Sampling
 *
 * Apprend la configuration optimale pour chaque utilisateur via un
 * Multi-Armed Bandit bayésien. Chaque "bras" est une zone de difficulté.
 *
 * Avantages :
 * - Ultra-léger (pur TypeScript, zéro dépendance)
 * - Apprend avec très peu de données (10+ sessions)
 * - Gère automatiquement exploration vs exploitation
 * - Converge vers la config optimale personnalisée
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
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
} from '../../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

/**
 * Objectif d'entraînement - définit la reward function.
 */
export type TrainingObjective =
  | 'flow' // Zone de flow (d' ≈ 1.5)
  | 'progression' // Maximiser l'amélioration
  | 'challenge' // Repousser ses limites (d' ≈ 1.0)
  | 'comfort' // Entraînement relaxé (d' ≈ 2.5)
  | 'custom'; // d' cible personnalisé

/**
 * Configuration du Thompson Sampling.
 */
export interface ThompsonSamplingConfig {
  /** Objectif d'entraînement */
  readonly objective: TrainingObjective;
  /** d' cible pour mode 'custom' (défaut: 1.5) */
  readonly customTarget?: number;
  /** Niveau N initial */
  readonly initialNLevel: number;
  /** Nombre de zones de difficulté (bras du bandit) */
  readonly numZones?: number;
}

/**
 * Distribution Beta pour un bras du bandit.
 * Représente notre croyance sur le taux de succès d'une zone.
 */
interface BetaDistribution {
  /** Succès observés + prior */
  alpha: number;
  /** Échecs observés + prior */
  beta: number;
}

/**
 * Zone de difficulté (un "bras" du bandit).
 */
interface DifficultyZone {
  /** Identifiant de la zone (1-based) */
  readonly id: number;
  /** Niveau N-back */
  readonly nLevel: number;
  /** Probabilité de cibles */
  readonly pTarget: number;
  /** Probabilité de leurres */
  readonly pLure: number;
  /** Intervalle inter-stimulus (ms) */
  readonly isiMs: number;
  /** Corrélation inter-modalités */
  readonly correlation: number;
}

/**
 * État interne de l'algorithme.
 */
interface ThompsonState {
  /** Distributions Beta pour chaque zone */
  distributions: BetaDistribution[];
  /** Zone actuellement sélectionnée */
  currentZoneIndex: number;
  /** Historique des d' par zone (pour calcul de progression) */
  dPrimeHistory: number[][];
  /** Dernier d' observé (pour calcul de progression) */
  lastDPrime: number | null;
  /** Nombre total de trials complétés */
  totalTrials: number;
  /** Trials dans la session courante */
  sessionTrials: number;
  /** Stats de la session courante pour calculer d' */
  sessionStats: {
    hits: number;
    misses: number;
    falseAlarms: number;
    correctRejections: number;
  };
  /** RNG deterministe (no Math.random) */
  rng: RandomState;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Zones de difficulté prédéfinies.
 * Couvrent un large spectre de configurations.
 */
const DEFAULT_ZONES: DifficultyZone[] = [
  // Zone 1: Très facile (warmup)
  { id: 1, nLevel: 1, pTarget: 0.25, pLure: 0.05, isiMs: 3500, correlation: 0.3 },
  // Zone 2: Facile
  {
    id: 2,
    nLevel: 1,
    pTarget: 0.3,
    pLure: 0.08,
    isiMs: TIMING_INTERVAL_DEFAULT_MS,
    correlation: 0.2,
  },
  // Zone 3: Facile-moyen
  { id: 3, nLevel: 2, pTarget: 0.25, pLure: 0.05, isiMs: 3500, correlation: 0.2 },
  // Zone 4: Moyen
  {
    id: 4,
    nLevel: 2,
    pTarget: 0.3,
    pLure: 0.08,
    isiMs: TIMING_INTERVAL_DEFAULT_MS,
    correlation: 0.1,
  },
  // Zone 5: Moyen+
  { id: 5, nLevel: 2, pTarget: 0.3, pLure: 0.1, isiMs: 2800, correlation: 0 },
  // Zone 6: Moyen-difficile
  { id: 6, nLevel: 2, pTarget: 0.35, pLure: 0.12, isiMs: 2500, correlation: 0 },
  // Zone 7: Difficile
  {
    id: 7,
    nLevel: 3,
    pTarget: 0.28,
    pLure: 0.08,
    isiMs: TIMING_INTERVAL_DEFAULT_MS,
    correlation: 0,
  },
  // Zone 8: Difficile+
  { id: 8, nLevel: 3, pTarget: 0.3, pLure: 0.1, isiMs: 2800, correlation: -0.1 },
  // Zone 9: Très difficile
  { id: 9, nLevel: 3, pTarget: 0.32, pLure: 0.12, isiMs: 2500, correlation: -0.2 },
  // Zone 10: Expert
  {
    id: 10,
    nLevel: 4,
    pTarget: 0.28,
    pLure: 0.1,
    isiMs: TIMING_INTERVAL_DEFAULT_MS,
    correlation: -0.2,
  },
];

/**
 * d' cibles par objectif.
 */
const OBJECTIVE_TARGETS: Record<Exclude<TrainingObjective, 'custom'>, number> = {
  flow: ADAPTIVE_TARGET_DPRIME_DEFAULT,
  progression: ADAPTIVE_TARGET_DPRIME_DEFAULT, // Cible initiale, puis on récompense le delta
  challenge: 1.0,
  comfort: 2.5,
};

// =============================================================================
// Reward Functions
// =============================================================================

/**
 * Calcule la reward selon l'objectif.
 */
function computeReward(
  dPrime: number,
  objective: TrainingObjective,
  customTarget: number,
  lastDPrime: number | null,
): number {
  const target = objective === 'custom' ? customTarget : OBJECTIVE_TARGETS[objective];

  if (objective === 'progression' && lastDPrime !== null) {
    // Récompense le delta positif
    const delta = dPrime - lastDPrime;
    // Bonus si progression, pénalité si régression, base si proche de la cible
    const proximityReward = Math.exp(-Math.abs(dPrime - target));
    const progressionReward = delta > 0 ? 0.5 : delta < -0.2 ? -0.3 : 0;
    return Math.max(0, Math.min(1, proximityReward + progressionReward));
  }

  // Reward gaussienne centrée sur la cible
  const distance = Math.abs(dPrime - target);
  return Math.exp(-distance * distance);
}

// =============================================================================
// Beta Distribution Helpers
// =============================================================================

/**
 * Échantillonne depuis une distribution Beta.
 * Utilise l'approximation de Jöhnk pour la génération.
 */
function sampleBeta(alpha: number, beta: number, rng: PRNG): number {
  // Cas dégénérés
  if (alpha <= 0) return 0;
  if (beta <= 0) return 1;

  // Génération par méthode gamma
  const gammaAlpha = sampleGamma(alpha, rng);
  const gammaBeta = sampleGamma(beta, rng);
  return gammaAlpha / (gammaAlpha + gammaBeta);
}

/**
 * Échantillonne depuis une distribution Gamma.
 * Utilise l'algorithme de Marsaglia et Tsang.
 */
function sampleGamma(shape: number, rng: PRNG): number {
  if (shape < 1) {
    // Pour shape < 1, utiliser la transformation
    return sampleGamma(1 + shape, rng) * rng.random() ** (1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Génère un nombre aléatoire selon une distribution normale standard.
 * Utilise la méthode de Box-Muller.
 */
function randomNormal(rng: PRNG): number {
  const u1 = rng.random();
  const u2 = rng.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// =============================================================================
// d' Calculation
// =============================================================================

/**
 * Calcule le d' depuis les stats de session.
 */
function calculateDPrime(stats: ThompsonState['sessionStats']): number {
  const { hits, misses, falseAlarms, correctRejections } = stats;

  const totalSignal = hits + misses;
  const totalNoise = falseAlarms + correctRejections;

  if (totalSignal === 0 || totalNoise === 0) {
    return ADAPTIVE_TARGET_DPRIME_DEFAULT; // Valeur neutre si pas assez de données
  }

  // Hit rate et false alarm rate avec correction de Hautus
  const hitRate = (hits + 0.5) / (totalSignal + 1);
  const faRate = (falseAlarms + 0.5) / (totalNoise + 1);

  // Transformation z (inverse de la CDF normale)
  const zHit = SDTCalculator.probit(hitRate);
  const zFa = SDTCalculator.probit(faRate);

  return zHit - zFa;
}

// =============================================================================
// Algorithm Implementation
// =============================================================================

export function createThompsonSamplingAlgorithm(config: ThompsonSamplingConfig): AdaptiveAlgorithm {
  const zones = DEFAULT_ZONES;
  const numZones = config.numZones ?? zones.length;
  const customTarget = config.customTarget ?? ADAPTIVE_TARGET_DPRIME_DEFAULT;

  function generateSeed(): string {
    if (
      typeof crypto !== 'undefined' &&
      'randomUUID' in crypto &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
    return `seed-${Date.now().toString(36)}`;
  }

  let rng: PRNG = createPRNG(`ts-${generateSeed()}`);
  let sessionModalityIds: readonly string[] = ['position', 'audio'];

  // Trouver la zone initiale basée sur le nLevel
  const initialZoneIndex = Math.max(
    0,
    zones.findIndex((z) => z.nLevel >= config.initialNLevel),
  );

  let state: ThompsonState = {
    distributions: Array(numZones)
      .fill(null)
      .map(() => ({ alpha: 1, beta: 1 })), // Prior uniforme
    currentZoneIndex: initialZoneIndex,
    dPrimeHistory: Array(numZones)
      .fill(null)
      .map(() => []),
    lastDPrime: null,
    totalTrials: 0,
    sessionTrials: 0,
    sessionStats: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    rng: rng.getState(),
  };

  /**
   * Sélectionne la meilleure zone via Thompson Sampling.
   */
  function selectZone(): number {
    // Échantillonner depuis chaque distribution Beta
    const samples = state.distributions.map((dist) => sampleBeta(dist.alpha, dist.beta, rng));

    // Retourner l'index avec le plus grand échantillon
    let bestIndex = 0;
    let bestSample = samples[0] ?? 0;
    for (let i = 1; i < samples.length; i++) {
      const sample = samples[i] ?? 0;
      if (sample > bestSample) {
        bestSample = sample;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Met à jour la distribution après une session.
   */
  function updateDistribution(zoneIndex: number, reward: number): void {
    // Convertir reward [0,1] en succès/échec probabiliste
    // reward > 0.5 = plus de chance de succès
    const isSuccess = rng.random() < reward;
    const dist = state.distributions[zoneIndex];
    if (!dist) return;

    if (isSuccess) {
      dist.alpha += 1;
    } else {
      dist.beta += 1;
    }
    state.rng = rng.getState();
  }

  /**
   * Crée une SequenceSpec depuis une zone.
   */
  function zoneToSpec(zone: DifficultyZone): SequenceSpec {
    const modalities = buildStandardModalities(sessionModalityIds);
    const modalityIds = modalities.map((m) => m.id);
    const pLureApplied = zone.nLevel >= 2 ? zone.pLure : 0;

    const shouldApplyCorrelation =
      zone.correlation !== 0 && modalityIds.includes('position') && modalityIds.includes('audio');

    return createSequenceSpec({
      nLevel: zone.nLevel,
      modalities,
      targetProbabilities: buildUniformTargetProbabilities(modalityIds, zone.pTarget),
      lureProbabilities: buildUniformLureProbabilities(modalityIds, pLureApplied),
      correlationMatrix: shouldApplyCorrelation ? { audio_position: zone.correlation } : undefined,
      timing: {
        isiMs: zone.isiMs,
        stimulusDurationMs: TIMING_STIMULUS_TEMPO_MS,
      },
      seed: `ts-${state.totalTrials}`,
    });
  }

  // ===========================================================================
  // AdaptiveAlgorithm Interface
  // ===========================================================================

  return {
    name: `thompson-sampling-${config.objective}`,

    initialize(sessionConfig: SessionConfig): void {
      sessionModalityIds = sessionConfig.modalityIds ?? sessionModalityIds;
      // Reset session stats
      state.sessionTrials = 0;
      state.sessionStats = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };

      // Sélectionner une nouvelle zone pour cette session
      state.currentZoneIndex = selectZone();
      state.rng = rng.getState();
    },

    getSpec(_context: AlgorithmContext): SequenceSpec {
      const zone = zones[state.currentZoneIndex];
      if (!zone) {
        const fallbackZone = zones[0];
        if (!fallbackZone) throw new Error('No zones configured');
        return zoneToSpec(fallbackZone);
      }
      return zoneToSpec(zone);
    },

    onTrialCompleted(result: TrialResult): void {
      state.totalTrials++;
      state.sessionTrials++;

      // Mettre à jour les stats de session
      for (const response of Object.values(result.responses)) {
        switch (response.result) {
          case 'hit':
            state.sessionStats.hits++;
            break;
          case 'miss':
            state.sessionStats.misses++;
            break;
          case 'false-alarm':
            state.sessionStats.falseAlarms++;
            break;
          case 'correct-rejection':
            state.sessionStats.correctRejections++;
            break;
        }
      }

      // Toutes les 20 trials (fin de bloc), évaluer et potentiellement changer de zone
      if (state.sessionTrials >= 20 && state.sessionTrials % 20 === 0) {
        const dPrime = calculateDPrime(state.sessionStats);

        // Calculer la reward
        const reward = computeReward(dPrime, config.objective, customTarget, state.lastDPrime);

        // Mettre à jour la distribution de la zone courante
        updateDistribution(state.currentZoneIndex, reward);

        // Stocker le d' dans l'historique
        const history = state.dPrimeHistory[state.currentZoneIndex];
        if (history) {
          history.push(dPrime);
        }
        state.lastDPrime = dPrime;

        // Reset stats pour le prochain bloc
        state.sessionStats = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
      }
    },

    serialize(): AlgorithmState {
      state.rng = rng.getState();
      return {
        algorithmType: `thompson-sampling-${config.objective}`,
        version: 1,
        data: {
          config: {
            objective: config.objective,
            customTarget: config.customTarget,
            initialNLevel: config.initialNLevel,
          },
          state,
        },
      };
    },

    restore(savedState: AlgorithmState): void {
      if (!savedState.algorithmType.startsWith('thompson-sampling')) {
        throw new Error(
          `Cannot restore ThompsonSamplingAlgorithm from ${savedState.algorithmType}`,
        );
      }
      const data = savedState.data as { state: ThompsonState };
      state = data.state;
      if (!state.rng?.seed) {
        state.rng = { seed: `ts-${generateSeed()}`, callCount: 0 };
      }
      rng = createPRNG(state.rng.seed, state.rng);
    },

    reset(): void {
      state = {
        distributions: Array(numZones)
          .fill(null)
          .map(() => ({ alpha: 1, beta: 1 })),
        currentZoneIndex: initialZoneIndex,
        dPrimeHistory: Array(numZones)
          .fill(null)
          .map(() => []),
        lastDPrime: null,
        totalTrials: 0,
        sessionTrials: 0,
        sessionStats: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
        rng: { seed: `ts-${generateSeed()}`, callCount: 0 },
      };
      rng = createPRNG(state.rng.seed, state.rng);
    },

    // === Méthodes additionnelles pour debug/UI ===

    /** Retourne la zone courante (pour affichage UI) */
    getCurrentZone(): DifficultyZone {
      const zone = zones[state.currentZoneIndex];
      if (!zone) {
        const fallbackZone = zones[0];
        if (!fallbackZone) throw new Error('No zones configured');
        return fallbackZone;
      }
      return zone;
    },

    /** Retourne les distributions (pour debug/visualisation) */
    getDistributions(): BetaDistribution[] {
      return [...state.distributions];
    },

    /** Retourne le numéro de zone (1-based, pour UI) */
    getZoneNumber(): number {
      return zones[state.currentZoneIndex]?.id ?? 1;
    },
  } as AdaptiveAlgorithm & {
    getCurrentZone(): DifficultyZone;
    getDistributions(): BetaDistribution[];
    getZoneNumber(): number;
  };
}
