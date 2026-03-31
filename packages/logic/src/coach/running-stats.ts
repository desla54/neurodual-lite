/**
 * Running Stats Calculator
 *
 * Calcule les statistiques en temps réel pendant une partie.
 * Utilisé par le coach pour prendre des décisions.
 */

import { getIsTarget, type ModalityId, type Trial } from '../domain';
import { SDTCalculator } from '../domain/scoring/helpers/sdt-calculator';
import type { TrainingModalityStats, TrainingRunningStats, TrialResponse } from './types';
import { getResponseForModality } from './types';
import {
  COACH_DPRIME_TREND_THRESHOLD,
  COACH_RT_TREND_THRESHOLD_MS,
  COACH_DPRIME_ESTIMATION_ADJUSTMENT,
  COACH_MIN_TRIALS_FOR_TREND,
  COACH_MIN_RTS_FOR_RT_TREND,
} from '../specs/thresholds';

// =============================================================================
// Running Stats Calculator
// =============================================================================

export class RunningStatsCalculator {
  private trials: Trial[] = [];
  private responses: TrialResponse[] = [];
  private activeModalities: ModalityId[];
  private trialsTotal: number;

  constructor(activeModalities: ModalityId[], trialsTotal: number) {
    this.activeModalities = activeModalities;
    this.trialsTotal = trialsTotal;
  }

  /**
   * Enregistre un trial et sa réponse
   */
  record(trial: Trial, response: TrialResponse): void {
    this.trials.push(trial);
    this.responses.push(response);
  }

  /**
   * Calcule les stats courantes
   */
  calculate(): TrainingRunningStats {
    const byModality = new Map<ModalityId, TrainingModalityStats>();

    if (this.activeModalities.length === 0) {
      return {
        trialsCompleted: this.trials.filter((t) => !t.isBuffer).length,
        trialsTotal: this.trialsTotal,
        byModality,
        currentDPrime: 0,
        trend: 'stable',
        estimatedFinalDPrime: 0,
      };
    }

    for (const modalityId of this.activeModalities) {
      byModality.set(modalityId, this.calculateForModality(modalityId));
    }

    const dPrimes = this.activeModalities.map((m) => byModality.get(m)?.currentDPrime ?? 0);
    const currentDPrime = dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;

    return {
      trialsCompleted: this.trials.filter((t) => !t.isBuffer).length,
      trialsTotal: this.trialsTotal,
      byModality,
      currentDPrime,
      trend: this.calculateTrend(),
      estimatedFinalDPrime: this.estimateFinal(currentDPrime),
    };
  }

  private calculateForModality(modalityId: ModalityId): TrainingModalityStats {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;
    const reactionTimes: number[] = [];

    for (let i = 0; i < this.trials.length; i++) {
      const trial = this.trials[i];
      const response = this.responses[i];

      if (!trial || !response) continue;
      if (trial.isBuffer) continue;

      const isTarget = this.isTarget(trial, modalityId);
      const responseRecord = getResponseForModality(response, modalityId);
      const pressed = responseRecord.pressed;
      const rt = responseRecord.rt;

      if (isTarget) {
        if (pressed) {
          hits++;
          if (rt !== null && rt > 0) reactionTimes.push(rt);
        } else {
          misses++;
        }
      } else {
        if (pressed) {
          falseAlarms++;
        } else {
          correctRejections++;
        }
      }
    }

    const avgRT =
      reactionTimes.length > 0
        ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
        : null;

    return {
      hits,
      misses,
      falseAlarms,
      correctRejections,
      currentDPrime: SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections),
      reactionTimes,
      avgRT,
      rtTrend: this.calculateRTTrend(reactionTimes),
    };
  }

  /**
   * Détermine si une modalité est une cible pour ce trial.
   * Utilise le helper centralisé qui supporte Trial et FlexibleTrial.
   */
  private isTarget(trial: Trial, modalityId: ModalityId): boolean {
    return getIsTarget(trial, modalityId);
  }

  private calculateTrend(): 'improving' | 'stable' | 'declining' {
    if (this.trials.length < COACH_MIN_TRIALS_FOR_TREND) return 'stable';

    // Compare première moitié vs deuxième moitié
    const mid = Math.floor(this.trials.length / 2);
    const firstHalf = this.calculateDPrimeForRange(0, mid);
    const secondHalf = this.calculateDPrimeForRange(mid, this.trials.length);

    const diff = secondHalf - firstHalf;
    if (diff > COACH_DPRIME_TREND_THRESHOLD) return 'improving';
    if (diff < -COACH_DPRIME_TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Calcule d' pour une range de trials.
   * Calcule d' PAR MODALITÉ puis fait la moyenne (évite l'agrégation incorrecte).
   */
  private calculateDPrimeForRange(start: number, end: number): number {
    if (this.activeModalities.length === 0) return 0;

    // Calculer d' par modalité séparément
    const dPrimes: number[] = [];

    for (const modalityId of this.activeModalities) {
      let hits = 0,
        misses = 0,
        fa = 0,
        cr = 0;

      for (let i = start; i < end; i++) {
        const trial = this.trials[i];
        const response = this.responses[i];

        if (!trial || !response) continue;
        if (trial.isBuffer) continue;

        const isTarget = this.isTarget(trial, modalityId);
        const responseRecord = getResponseForModality(response, modalityId);
        const pressed = responseRecord.pressed;

        if (isTarget) {
          if (pressed) hits++;
          else misses++;
        } else {
          if (pressed) fa++;
          else cr++;
        }
      }

      dPrimes.push(SDTCalculator.calculateDPrime(hits, misses, fa, cr));
    }

    // Moyenne des d' par modalité (cohérent avec calculate().currentDPrime)
    return dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
  }

  private calculateRTTrend(rts: number[]): 'faster' | 'stable' | 'slower' {
    if (rts.length < COACH_MIN_RTS_FOR_RT_TREND) return 'stable';

    const mid = Math.floor(rts.length / 2);
    const firstAvg = rts.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondAvg = rts.slice(mid).reduce((a, b) => a + b, 0) / (rts.length - mid);

    const diff = secondAvg - firstAvg;
    if (diff < -COACH_RT_TREND_THRESHOLD_MS) return 'faster';
    if (diff > COACH_RT_TREND_THRESHOLD_MS) return 'slower';
    return 'stable';
  }

  private estimateFinal(current: number): number {
    // Simple: si tendance positive, ajoute un bonus
    const trend = this.calculateTrend();
    if (trend === 'improving') return current + COACH_DPRIME_ESTIMATION_ADJUSTMENT;
    if (trend === 'declining') return current - COACH_DPRIME_ESTIMATION_ADJUSTMENT;
    return current;
  }
}
