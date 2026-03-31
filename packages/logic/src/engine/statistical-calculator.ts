/**
 * StatisticalCalculator - Centralized Statistical Functions
 *
 * Classe utilitaire OOP pour les calculs statistiques.
 * Centralise les fonctions dupliquées entre projector et cognitive-projector.
 *
 * Fonctionnalités:
 * - Moyenne, variance, écart-type
 * - Tendance linéaire (régression)
 * - D-prime calculation (délégué à SDTCalculator pour cohérence)
 *
 * Utilisée par: SessionProjector, CognitiveProfiler
 */

import { SDTCalculator } from '../domain/scoring/helpers/sdt-calculator';
import {
  STATS_IQR_OUTLIER_MULTIPLIER,
  STATS_MICROLAPSE_MEDIAN_MULTIPLIER,
} from '../specs/thresholds';

// =============================================================================
// StatisticalCalculator
// =============================================================================

/**
 * Calculateur statistique centralisé.
 * Toutes les méthodes sont statiques car ce sont des fonctions pures sans état.
 */
export class StatisticalCalculator {
  // ===========================================================================
  // Basic Statistics
  // ===========================================================================

  /**
   * Calcule la moyenne d'un tableau de nombres.
   */
  static mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calcule la variance (échantillon) d'un tableau de nombres.
   */
  static variance(values: readonly number[]): number {
    if (values.length < 2) return 0;
    const avg = StatisticalCalculator.mean(values);
    return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  }

  /**
   * Calcule l'écart-type d'un tableau de nombres.
   */
  static stdDev(values: readonly number[]): number {
    return Math.sqrt(StatisticalCalculator.variance(values));
  }

  /**
   * Calcule le coefficient de variation (CV = écart-type / moyenne).
   * Retourne 0 si la moyenne est 0.
   */
  static coefficientOfVariation(values: readonly number[]): number {
    const avg = StatisticalCalculator.mean(values);
    if (avg === 0) return 0;
    return StatisticalCalculator.stdDev(values) / avg;
  }

  /**
   * Calcule la médiane d'un tableau de nombres.
   * Utilisé pour la détection des micro-lapses (RT > 2.5 * médiane).
   */
  static median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    }
    return sorted[mid] ?? 0;
  }

  /**
   * Filtre les outliers en utilisant la méthode IQR (Interquartile Range).
   * Garde les valeurs dans [Q1 - k*IQR, Q3 + k*IQR].
   *
   * @param values - Tableau de valeurs
   * @param k - Multiplicateur IQR (défaut: 1.5 pour mild outliers)
   * @returns Valeurs filtrées
   */
  static filterOutliers(
    values: readonly number[],
    k = STATS_IQR_OUTLIER_MULTIPLIER,
  ): readonly number[] {
    if (values.length < 4) return values;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Q1 = 25th percentile, Q3 = 75th percentile
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index] ?? 0;
    const q3 = sorted[q3Index] ?? 0;
    const iqr = q3 - q1;

    const lowerBound = q1 - k * iqr;
    const upperBound = q3 + k * iqr;

    return values.filter((v) => v >= lowerBound && v <= upperBound);
  }

  /**
   * Compte les micro-lapses (RT > threshold * médiane).
   * Utilisé pour le FocusScore dans TempoConfidence.
   *
   * @param reactionTimes - Temps de réaction en ms
   * @param threshold - Multiplicateur de la médiane (défaut: 2.5)
   * @returns Nombre de micro-lapses
   */
  static countMicroLapses(
    reactionTimes: readonly number[],
    threshold = STATS_MICROLAPSE_MEDIAN_MULTIPLIER,
  ): number {
    if (reactionTimes.length < 3) return 0;

    const medianRT = StatisticalCalculator.median(reactionTimes);
    const lapseThreshold = medianRT * threshold;

    return reactionTimes.filter((rt) => rt > lapseThreshold).length;
  }

  /**
   * Calcule le pourcentage de micro-lapses.
   */
  static microLapseRate(
    reactionTimes: readonly number[],
    threshold = STATS_MICROLAPSE_MEDIAN_MULTIPLIER,
  ): number {
    if (reactionTimes.length === 0) return 0;
    const lapseCount = StatisticalCalculator.countMicroLapses(reactionTimes, threshold);
    return lapseCount / reactionTimes.length;
  }

  // ===========================================================================
  // Linear Regression
  // ===========================================================================

  /**
   * Calcule la pente de la régression linéaire simple.
   * Retourne la tendance des valeurs (positif = croissant, négatif = décroissant).
   */
  static linearTrend(values: readonly number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = StatisticalCalculator.mean(values);

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const value = values[i] ?? 0;
      numerator += (i - xMean) * (value - yMean);
      denominator += (i - xMean) ** 2;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  // ===========================================================================
  // Signal Detection Theory
  // ===========================================================================

  /**
   * Calcule d' (d-prime) avec correction de Hautus (log-linear).
   * Délègue à SDTCalculator pour garantir la cohérence avec le reste du système.
   *
   * @param hits - Nombre de hits (cible détectée)
   * @param misses - Nombre de misses (cible manquée)
   * @param falseAlarms - Nombre de fausses alarmes
   * @param correctRejections - Nombre de rejets corrects
   * @returns d' calculé
   */
  static computeDPrime(
    hits: number,
    misses: number,
    falseAlarms: number,
    correctRejections: number,
  ): number {
    // Délégation à SDTCalculator (source unique de vérité pour d')
    return SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  /**
   * Clamp une valeur entre min et max.
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Calcule les stats de timing (min, max, avg).
   */
  static computeTimingStats(values: readonly number[]): {
    min: number;
    max: number;
    avg: number;
    values: readonly number[];
  } {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, values: [] };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg, values };
  }
}
