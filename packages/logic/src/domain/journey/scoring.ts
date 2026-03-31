/**
 * Journey Scoring - Source Unique pour le Calcul des Scores Parcours
 *
 * Ce module centralise TOUTES les formules de scoring pour le parcours.
 * Trois stratégies sont supportées:
 *
 * 1. BrainWorkshop (Score Pénalisant):
 *    Score = ((H + CR - FA - M) / Total + 1) / 2 * SCORE_MAX
 *    Seuil: 80%
 *
 * 2. Jaeggi (Basé sur erreurs):
 *    PASS si < 3 erreurs par modalité (FA + M) — "fewer than three" (Jaeggi 2008)
 *    Score = SCORE_MAX - (total_errors * 5) clamped to [0, SCORE_MAX]
 *    Seuil: < 3 erreurs par modalité
 *
 * 3. Balanced Accuracy (Précision équilibrée):
 *    Score = (Sensitivity + Specificity) / 2 * SCORE_MAX
 *    où Sensitivity = H / (H + M), Specificity = CR / (CR + FA)
 *    Seuil: 80%
 */

import type { ModalityId, SDTCounts } from '../../types/core';
import type { ModalityRunningStats, RunningStats, SessionSummary } from '../../engine/events';
import {
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  DPRIME_TO_PERCENT_BASE,
  DPRIME_TO_PERCENT_DIVISOR,
  DPRIME_TO_PERCENT_MULTIPLIER,
  JOURNEY_MIN_PASSING_SCORE,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  JAEGGI_POINTS_PER_ERROR,
  SCORE_MAX,
  SCORE_MIN,
  SDT_DPRIME_PASS,
} from '../../specs/thresholds';
import {
  calculateTempoSessionPassed as calculateTempoPassedFromCentralized,
  type ModalitySDTCounts,
} from '../scoring/session-passed';

// =============================================================================
// Types
// =============================================================================

/**
 * Stratégies de scoring disponibles pour le parcours Journey.
 */
export type JourneyScoringStrategy =
  | 'brainworkshop'
  | 'dualnback-classic'
  | 'jaeggi'
  | 'balanced'
  | 'dprime';

/**
 * Résultat du calcul de score pour un journey.
 */
export interface JourneyScoreResult {
  /** Score en pourcentage (0-100) */
  readonly score: number;
  /** La session est-elle validante? */
  readonly passed: boolean;
  /** Stratégie utilisée */
  readonly strategy: JourneyScoringStrategy;
  /** Détails des comptages */
  readonly details: JourneyScoreDetails;
}

/**
 * Détails des comptages SDT.
 */
export interface JourneyScoreDetails {
  readonly hits: number;
  readonly correctRejections: number;
  readonly falseAlarms: number;
  readonly misses: number;
  /** Erreurs totales par modalité (pour Jaeggi) */
  readonly errorsByModality?: Record<ModalityId, number>;
}

// =============================================================================
// Jaeggi Binary Protocol (Jaeggi et al., 2008)
// =============================================================================

/**
 * Résultat de progression binaire Jaeggi.
 *
 * Protocole original (Jaeggi 2008):
 * - UP:   < 3 erreurs par modalité → monte au N+1 ("fewer than three")
 * - STAY: 3-5 erreurs par modalité → reste au même N
 * - DOWN: > 5 erreurs par modalité → descend au N-1 ("more than five")
 */
export type JaeggiProgression = 'UP' | 'STAY' | 'DOWN';

/**
 * Résultat complet de la progression Jaeggi binaire.
 */
export interface DualnbackClassicProgressionResult {
  /** Direction de progression */
  readonly progression: JaeggiProgression;
  /** Erreurs max par modalité */
  readonly maxErrors: number;
  /** Erreurs par modalité (pour debug) */
  readonly errorsByModality: Record<string, number>;
}

/**
 * Calcule la progression Jaeggi binaire (protocole original 2008).
 *
 * @param byModality - Stats SDT par modalité
 * @returns Résultat avec progression UP/STAY/DOWN
 *
 * @example
 * ```ts
 * const result = computeJaeggiProgression(session.finalStats.byModality);
 * if (result.progression === 'UP') {
 *   // Passer au niveau N+1
 * } else if (result.progression === 'DOWN') {
 *   // Revenir au niveau N-1
 * }
 * ```
 */
export function computeJaeggiProgression(
  byModality: Record<string, SDTCounts>,
): DualnbackClassicProgressionResult {
  const modalities = Object.entries(byModality);

  if (modalities.length === 0) {
    return { progression: 'STAY', maxErrors: 0, errorsByModality: {} };
  }

  const errorsByModality: Record<string, number> = {};
  let maxErrors = 0;

  for (const [modalityId, stats] of modalities) {
    const errors = stats.misses + stats.falseAlarms;
    errorsByModality[modalityId] = errors;
    maxErrors = Math.max(maxErrors, errors);
  }

  // Protocole binaire Jaeggi (2008: "fewer than three"):
  // - < 3 erreurs → UP (monte)
  // - 3-5 erreurs → STAY (reste)
  // - > 5 erreurs → DOWN (descend)
  let progression: JaeggiProgression;
  if (maxErrors < JAEGGI_MAX_ERRORS_PER_MODALITY) {
    progression = 'UP';
  } else if (maxErrors > JAEGGI_ERRORS_DOWN) {
    progression = 'DOWN';
  } else {
    progression = 'STAY';
  }

  return { progression, maxErrors, errorsByModality };
}

// =============================================================================
// BrainWorkshop Binary Protocol
// =============================================================================

/**
 * Résultat de progression par session BrainWorkshop.
 *
 * Protocole:
 * - UP:     Score >= 80% → monte au N+1
 * - STRIKE: Score < 50%  → compte vers la régression
 * - STAY:   Score 50-79% → reste au même N (strikes inchangés)
 *
 * Note: 3 strikes au même N = DOWN (géré par le projector)
 */
export type BrainWorkshopSessionResult = 'UP' | 'STAY' | 'STRIKE';

/**
 * Résultat complet de l'évaluation d'une session BrainWorkshop.
 */
export interface BrainWorkshopProgressionResult {
  /** Résultat de cette session */
  readonly result: BrainWorkshopSessionResult;
  /** Score calculé (0-100) */
  readonly score: number;
}

/**
 * Évalue une session BrainWorkshop pour la progression.
 *
 * @param byModality - Stats SDT par modalité
 * @returns Résultat avec UP/STAY/STRIKE et score
 *
 * @example
 * ```ts
 * const result = evaluateBrainWorkshopSession(session.finalStats.byModality);
 * if (result.result === 'UP') {
 *   // Passer au niveau N+1
 * } else if (result.result === 'STRIKE') {
 *   // Incrémenter le compteur de strikes
 *   if (strikes >= 3) {
 *     // Revenir au niveau N-1
 *   }
 * } else {
 *   // STAY: strikes inchangés
 * }
 * ```
 */
export function evaluateBrainWorkshopSession(
  byModality: Record<string, SDTCounts>,
): BrainWorkshopProgressionResult {
  const aggregated = aggregateRawStats(byModality);
  const score = computeBrainWorkshopScoreFromRaw(aggregated);

  // Protocole BrainWorkshop:
  // - >= 80% → UP (monte)
  // - < 50%  → STRIKE (compte vers régression)
  // - 50-79% → STAY (reste, strikes inchangés)
  let result: BrainWorkshopSessionResult;
  if (score >= BW_SCORE_UP_PERCENT) {
    result = 'UP';
  } else if (score < BW_SCORE_DOWN_PERCENT) {
    result = 'STRIKE';
  } else {
    result = 'STAY';
  }

  return { result, score };
}

// =============================================================================
// Constants (re-exported from thresholds.ts for backward compatibility)
// =============================================================================

/** Seuil BrainWorkshop pour progression (80%) - from centralized thresholds */
export const BW_THRESHOLD = BW_SCORE_UP_PERCENT;

/** Seuil Balanced Accuracy (80%) - from centralized thresholds */
export const BALANCED_THRESHOLD = JOURNEY_MIN_PASSING_SCORE;

// =============================================================================
// Score Computation
// =============================================================================

/**
 * Agrège les stats SDT depuis toutes les modalités.
 */
function aggregateStats(byModality: Record<ModalityId, ModalityRunningStats>): JourneyScoreDetails {
  let hits = 0;
  let correctRejections = 0;
  let falseAlarms = 0;
  let misses = 0;
  const errorsByModality: Record<ModalityId, number> = {};

  for (const [modalityId, stats] of Object.entries(byModality)) {
    hits += stats.hits;
    correctRejections += stats.correctRejections;
    falseAlarms += stats.falseAlarms;
    misses += stats.misses;
    errorsByModality[modalityId as ModalityId] = stats.falseAlarms + stats.misses;
  }

  return { hits, correctRejections, falseAlarms, misses, errorsByModality };
}

function computeDPrimeScore(dPrime: number): number {
  if (!Number.isFinite(dPrime)) return 0;
  const raw =
    DPRIME_TO_PERCENT_BASE + (dPrime / DPRIME_TO_PERCENT_DIVISOR) * DPRIME_TO_PERCENT_MULTIPLIER;
  return Math.round(Math.max(SCORE_MIN, Math.min(SCORE_MAX, raw)));
}

/**
 * Calcule le score Brain Workshop (v5.0).
 *
 * Formule (BW original): Score% = H / (H + M + FA) * SCORE_MAX
 *
 * IMPORTANT: Les Correct Rejections (CR) sont IGNORÉS.
 */
function computeBrainWorkshopScore(details: JourneyScoreDetails): number {
  const { hits, falseAlarms, misses } = details;
  const denominator = hits + misses + falseAlarms;

  if (denominator === 0) return 0;

  return (hits / denominator) * SCORE_MAX;
}

/**
 * Calcule le score Jaeggi (basé sur erreurs).
 *
 * PASS si < 3 erreurs par modalité ("fewer than three" — Jaeggi 2008).
 * Score = 100 - (max_modality_errors * 10) clamped to [0, 100]
 */
function computeDualnbackClassicScore(details: JourneyScoreDetails): {
  score: number;
  passed: boolean;
} {
  const { errorsByModality } = details;

  if (!errorsByModality || Object.keys(errorsByModality).length === 0) {
    return { score: SCORE_MAX, passed: true };
  }

  const maxErrors = Math.max(...Object.values(errorsByModality));
  // Jaeggi 2008: "fewer than three" means < 3
  const passed = maxErrors < JAEGGI_MAX_ERRORS_PER_MODALITY;

  // Binary Jaeggi journey progression relies on score=100 for "UP" (< 3 errors per modality).
  // When not passed, score decays with the max errors of the weakest modality.
  const score = passed
    ? SCORE_MAX
    : Math.max(SCORE_MIN, Math.min(SCORE_MAX, SCORE_MAX - maxErrors * JAEGGI_POINTS_PER_ERROR));

  return { score, passed };
}

/**
 * Calcule le score Balanced Accuracy.
 *
 * Formule: (Sensitivity + Specificity) / 2 * SCORE_MAX
 * où Sensitivity = H / (H + M), Specificity = CR / (CR + FA)
 */
function computeBalancedScore(details: JourneyScoreDetails): number {
  const { hits, correctRejections, falseAlarms, misses } = details;

  const sensitivity = hits + misses > 0 ? hits / (hits + misses) : 0;
  const specificity =
    correctRejections + falseAlarms > 0 ? correctRejections / (correctRejections + falseAlarms) : 0;

  return ((sensitivity + specificity) / 2) * SCORE_MAX;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Calcule le score du journey pour une session donnée.
 *
 * @param summary - Résumé de la session (avec finalStats)
 * @param strategy - Stratégie de scoring à utiliser
 * @returns Résultat avec score, passed, et détails
 *
 * @example
 * ```ts
 * const result = computeJourneyScore(sessionSummary, 'brainworkshop');
 * if (result.passed) {
 *   console.log(`Stage validé avec ${result.score}%`);
 * }
 * ```
 */
export function computeNativeJourneyScore(
  summary: SessionSummary,
  strategy: JourneyScoringStrategy,
): JourneyScoreResult {
  const details = aggregateStats(summary.finalStats.byModality);

  switch (strategy) {
    case 'dprime': {
      const dPrime = summary.finalStats.globalDPrime;
      return {
        score: computeDPrimeScore(dPrime),
        passed: dPrime >= SDT_DPRIME_PASS,
        strategy,
        details,
      };
    }
    case 'brainworkshop': {
      const score = computeBrainWorkshopScore(details);
      return {
        score,
        passed: score >= BW_THRESHOLD,
        strategy,
        details,
      };
    }

    case 'dualnback-classic':
    case 'jaeggi': {
      const { score, passed } = computeDualnbackClassicScore(details);
      return {
        score,
        passed,
        strategy,
        details,
      };
    }

    case 'balanced': {
      const score = computeBalancedScore(details);
      return {
        score,
        passed: score >= BALANCED_THRESHOLD,
        strategy,
        details,
      };
    }
  }
}

/**
 * Calcule le score du journey depuis des stats brutes (RunningStats).
 *
 * @param stats - Stats de session (byModality)
 * @param strategy - Stratégie de scoring
 * @returns Résultat avec score, passed, et détails
 */
export function computeJourneyScoreFromStats(
  stats: RunningStats,
  strategy: JourneyScoringStrategy,
): JourneyScoreResult {
  const details = aggregateStats(stats.byModality);

  switch (strategy) {
    case 'dprime': {
      const dPrime = stats.globalDPrime;
      return {
        score: computeDPrimeScore(dPrime),
        passed: dPrime >= SDT_DPRIME_PASS,
        strategy,
        details,
      };
    }
    case 'brainworkshop': {
      const score = computeBrainWorkshopScore(details);
      return {
        score,
        passed: score >= BW_THRESHOLD,
        strategy,
        details,
      };
    }

    case 'dualnback-classic':
    case 'jaeggi': {
      const { score, passed } = computeDualnbackClassicScore(details);
      return {
        score,
        passed,
        strategy,
        details,
      };
    }

    case 'balanced': {
      const score = computeBalancedScore(details);
      return {
        score,
        passed: score >= BALANCED_THRESHOLD,
        strategy,
        details,
      };
    }
  }
}

/**
 * Retourne le seuil de validation pour une stratégie.
 *
 * @param strategy - Stratégie de scoring
 * @returns Seuil en pourcentage (80 pour BW/Balanced, 3 erreurs pour DualnbackClassic)
 */
export function getThresholdForStrategy(strategy: JourneyScoringStrategy): number {
  switch (strategy) {
    case 'brainworkshop':
      return BW_THRESHOLD;
    case 'dualnback-classic':
    case 'jaeggi':
      return JAEGGI_MAX_ERRORS_PER_MODALITY;
    case 'balanced':
      return BALANCED_THRESHOLD;
    case 'dprime':
      return SDT_DPRIME_PASS;
  }
}

// Re-export depuis la spec pour rétrocompatibilité
export { getScoringStrategyForGameMode as getScoringStrategyForMode } from '../../specs/journey.spec';

// =============================================================================
// Raw Stats Helpers (for adapters that don't have SessionSummary)
// =============================================================================

/**
 * Statistiques SDT minimales pour le calcul de score.
 * @deprecated Use SDTCounts from types/core.ts instead.
 */
export type RawSDTStats = SDTCounts;

/**
 * Calcule le score Brain Workshop (v5.0) depuis des stats brutes.
 *
 * Formule (BW original): Score% = H / (H + M + FA) * SCORE_MAX
 *
 * @param stats - Stats SDT brutes (agrégées de toutes les modalités)
 * @returns Score en pourcentage (0-SCORE_MAX)
 */
export function computeBrainWorkshopScoreFromRaw(stats: RawSDTStats): number {
  const { hits, falseAlarms, misses } = stats;
  const denominator = hits + misses + falseAlarms;

  if (denominator === 0) return 0;

  return (hits / denominator) * SCORE_MAX;
}

/**
 * Calcule le score Jaeggi depuis des stats par modalité.
 * PASS si toutes les modalités ont < 3 erreurs ("fewer than three" — Jaeggi 2008).
 *
 * @param byModality - Stats SDT par modalité
 * @returns Score et si ça passe
 */
export function computeDualnbackClassicScoreFromRaw(byModality: Record<string, RawSDTStats>): {
  score: number;
  passed: boolean;
} {
  const modalities = Object.values(byModality);
  if (modalities.length === 0) return { score: SCORE_MIN, passed: false };

  let allPass = true;
  let maxErrors = 0;

  for (const stats of modalities) {
    const errors = stats.misses + stats.falseAlarms;
    maxErrors = Math.max(maxErrors, errors);
    if (errors >= JAEGGI_MAX_ERRORS_PER_MODALITY) {
      allPass = false;
    }
  }

  // Score = SCORE_MAX si toutes les modalités passent, sinon décroît avec les erreurs (@see thresholds.ts)
  const score = allPass
    ? SCORE_MAX
    : Math.max(SCORE_MIN, Math.min(SCORE_MAX, SCORE_MAX - maxErrors * JAEGGI_POINTS_PER_ERROR));

  return { score, passed: allPass };
}

/**
 * Calcule le score Balanced Accuracy depuis des stats brutes.
 * Formule: (Sensitivity + Specificity) / 2 * SCORE_MAX
 *
 * @param stats - Stats SDT brutes (agrégées)
 * @returns Score en pourcentage (0-SCORE_MAX)
 */
export function computeBalancedScoreFromRaw(stats: RawSDTStats): number {
  const { hits, correctRejections, falseAlarms, misses } = stats;

  const sensitivity = hits + misses > 0 ? hits / (hits + misses) : 0;
  const specificity =
    correctRejections + falseAlarms > 0 ? correctRejections / (correctRejections + falseAlarms) : 0;

  return ((sensitivity + specificity) / 2) * SCORE_MAX;
}

/**
 * Agrège des stats SDT par modalité en stats globales.
 */
export function aggregateRawStats(byModality: Record<string, RawSDTStats>): RawSDTStats {
  let hits = 0;
  let correctRejections = 0;
  let falseAlarms = 0;
  let misses = 0;

  for (const stats of Object.values(byModality)) {
    hits += stats.hits;
    correctRejections += stats.correctRejections;
    falseAlarms += stats.falseAlarms;
    misses += stats.misses;
  }

  return { hits, correctRejections, falseAlarms, misses };
}

/**
 * Vérifie si une session passe selon son mode de jeu.
 *
 * DELEGUE à calculateTempoSessionPassed (Single Source of Truth).
 *
 * @param byModality - Stats SDT par modalité
 * @param gameMode - Mode de jeu (ex: 'dualnback-classic', 'sim-brainworkshop')
 * @param globalDPrime - d-prime global (pour les modes SDT)
 * @returns true si la session est validante
 */
export function isSessionPassing(
  byModality: Record<string, RawSDTStats>,
  gameMode: string | undefined,
  globalDPrime: number,
): boolean {
  // Convert RawSDTStats to ModalitySDTCounts for centralized function
  const modalityCounts: Record<string, ModalitySDTCounts> = {};
  for (const [key, stats] of Object.entries(byModality)) {
    modalityCounts[key] = {
      hits: stats.hits,
      misses: stats.misses,
      falseAlarms: stats.falseAlarms,
      correctRejections: stats.correctRejections,
    };
  }

  return calculateTempoPassedFromCentralized({
    generator: undefined,
    gameMode,
    byModality: modalityCounts,
    globalDPrime,
  });
}

// =============================================================================
// Pre-computed Score Support (for Flow, DualPick, etc.)
// =============================================================================

/**
 * Interface minimale pour une session avec score pré-calculé.
 * Utilisé pour les modes Flow, DualPick, etc. qui n'ont pas de stats SDT.
 */
export interface PrecomputedScoreSession {
  readonly sessionId: string;
  readonly score: number;
  readonly gameMode?: string;
  /** Adaptive path progress (0-100), used by Dual Track to bypass additive calculation. */
  readonly adaptivePathProgressPct?: number;
}

/**
 * Vérifie si une session a des stats SDT (SessionSummary).
 */
export function hasSDTStats(
  session: SessionSummary | PrecomputedScoreSession,
): session is SessionSummary {
  return 'finalStats' in session && 'byModality' in (session as SessionSummary).finalStats;
}

/**
 * Crée un JourneyScoreResult depuis un score pré-calculé.
 * Pour les sessions Flow, DualPick, etc. qui ont déjà leur score.
 *
 * @param precomputedScore - Score déjà calculé (0-100)
 * @param threshold - Seuil de validation (default: 80)
 * @returns Résultat avec score et passed
 */
export function createScoreResultFromPrecomputed(
  precomputedScore: number,
  threshold: number = BALANCED_THRESHOLD,
): JourneyScoreResult {
  return {
    score: precomputedScore,
    passed: precomputedScore >= threshold,
    strategy: 'balanced', // Precomputed scores use balanced threshold logic
    details: {
      hits: 0,
      correctRejections: 0,
      falseAlarms: 0,
      misses: 0,
    },
  };
}

/**
 * Calcule le score pour une session, supportant:
 * - SessionSummary (N-Back) → calcul SDT
 * - PrecomputedScoreSession (Flow, DualPick) → score direct
 *
 * @param session - Session avec stats SDT ou score pré-calculé
 * @param strategy - Stratégie (ignorée pour scores pré-calculés)
 * @returns Résultat du scoring
 */
export function computeJourneyScoreForSession(
  session: SessionSummary | PrecomputedScoreSession,
  strategy: JourneyScoringStrategy,
): JourneyScoreResult {
  if (hasSDTStats(session)) {
    return computeNativeJourneyScore(session, strategy);
  }

  // Session avec score pré-calculé (Flow, DualPick, etc.)
  return createScoreResultFromPrecomputed(session.score);
}
