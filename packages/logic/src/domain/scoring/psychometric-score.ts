/**
 * PsychometricScore - Value Object
 *
 * Encapsule les métriques SDT (Signal Detection Theory) avec méthodes.
 * Détection de gaming/spam, classification performance, biais.
 */

import { SDTCalculator } from './helpers/sdt-calculator';
import {
  PSYCHOMETRIC_DPRIME_ELITE,
  PSYCHOMETRIC_DPRIME_ADVANCED,
  PSYCHOMETRIC_DPRIME_INTERMEDIATE,
  PSYCHOMETRIC_SPAM_HIT_RATE,
  PSYCHOMETRIC_SPAM_FA_RATE,
  PSYCHOMETRIC_INACTIVE_HIT_RATE,
  PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD,
  PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD,
} from '../../specs/thresholds';

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

const DPRIME_ELITE = PSYCHOMETRIC_DPRIME_ELITE;
const DPRIME_ADVANCED = PSYCHOMETRIC_DPRIME_ADVANCED;
const DPRIME_INTERMEDIATE = PSYCHOMETRIC_DPRIME_INTERMEDIATE;

const SPAM_THRESHOLD_HIT_RATE = PSYCHOMETRIC_SPAM_HIT_RATE;
const SPAM_THRESHOLD_FA_RATE = PSYCHOMETRIC_SPAM_FA_RATE;
const INACTIVE_THRESHOLD_HIT_RATE = PSYCHOMETRIC_INACTIVE_HIT_RATE;

// =============================================================================
// Types
// =============================================================================

export type PerformanceTier = 'novice' | 'intermediate' | 'advanced' | 'elite';

// =============================================================================
// PsychometricScore
// =============================================================================

export class PsychometricScore {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;

  private readonly _hitRate: number;
  private readonly _falseAlarmRate: number;
  private readonly _dPrime: number;
  private readonly _criterion: number;

  constructor(hits: number, misses: number, falseAlarms: number, correctRejections: number) {
    this.hits = hits;
    this.misses = misses;
    this.falseAlarms = falseAlarms;
    this.correctRejections = correctRejections;

    const totalSignal = hits + misses;
    const totalNoise = falseAlarms + correctRejections;

    // Raw rates
    this._hitRate = totalSignal > 0 ? hits / totalSignal : 0;
    this._falseAlarmRate = totalNoise > 0 ? falseAlarms / totalNoise : 0;

    // Hautus log-linear correction for d' and c
    const correctedHitRate = totalSignal > 0 ? (hits + 0.5) / (totalSignal + 1) : 0.5;
    const correctedFaRate = totalNoise > 0 ? (falseAlarms + 0.5) / (totalNoise + 1) : 0.5;

    const zHit = SDTCalculator.probit(correctedHitRate);
    const zFa = SDTCalculator.probit(correctedFaRate);

    // d' = z(Hit) - z(FA)
    this._dPrime = zHit - zFa;

    // c = -0.5 * (z(Hit) + z(FA)) - criterion/bias
    this._criterion = -0.5 * (zHit + zFa);
  }

  // ===========================================================================
  // Métriques SDT de base
  // ===========================================================================

  /** Hit Rate (0-1) */
  get hitRate(): number {
    return this._hitRate;
  }

  /** False Alarm Rate (0-1) */
  get falseAlarmRate(): number {
    return this._falseAlarmRate;
  }

  /** d-prime - sensibilité (capacité à discriminer signal/bruit) */
  get dPrime(): number {
    return this._dPrime;
  }

  /** Criterion (c) - biais de réponse. Négatif = libéral, Positif = conservateur */
  get criterion(): number {
    return this._criterion;
  }

  /** Beta - likelihood ratio. >1 = conservateur, <1 = libéral */
  get beta(): number {
    return Math.exp(this._criterion * this._dPrime);
  }

  /** d' formaté */
  get formattedDPrime(): string {
    return this._dPrime.toFixed(2);
  }

  // ===========================================================================
  // Détection de comportements suspects
  // ===========================================================================

  /** Détecte le spam (répond à tout) */
  isSpamming(): boolean {
    return this._hitRate > SPAM_THRESHOLD_HIT_RATE && this._falseAlarmRate > SPAM_THRESHOLD_FA_RATE;
  }

  /** Détecte l'inactivité (ne répond presque jamais) */
  isInactive(): boolean {
    return this._hitRate < INACTIVE_THRESHOLD_HIT_RATE;
  }

  /** Le score est-il fiable (pas de gaming détecté)? */
  isReliable(): boolean {
    return !this.isSpamming() && !this.isInactive();
  }

  /** Détecte un comportement de gaming */
  isGaming(): boolean {
    return this.isSpamming() || this.isInactive();
  }

  /** Description du biais */
  getBiasDescription(): 'liberal' | 'neutral' | 'conservative' {
    if (this._criterion < PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD) return 'liberal';
    if (this._criterion > PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD) return 'conservative';
    return 'neutral';
  }

  // ===========================================================================
  // Classification de performance
  // ===========================================================================

  /** Tier de performance basé sur d' */
  get tier(): PerformanceTier {
    if (this._dPrime >= DPRIME_ELITE) return 'elite';
    if (this._dPrime >= DPRIME_ADVANCED) return 'advanced';
    if (this._dPrime >= DPRIME_INTERMEDIATE) return 'intermediate';
    return 'novice';
  }

  /** Précision globale using Balanced Accuracy: (hitRate + crRate) / 2 */
  get accuracy(): number {
    const signalTrials = this.hits + this.misses;
    const noiseTrials = this.falseAlarms + this.correctRejections;
    if (signalTrials === 0 && noiseTrials === 0) return 0;

    const hitRate = signalTrials > 0 ? this.hits / signalTrials : 0;
    const crRate = noiseTrials > 0 ? this.correctRejections / noiseTrials : 0;
    return (hitRate + crRate) / 2;
  }

  /** Précision formatée en % */
  get formattedAccuracy(): string {
    return `${Math.round(this.accuracy * 100)}%`;
  }

  // ===========================================================================
  // Factory
  // ===========================================================================

  static from(data: {
    hits: number;
    misses: number;
    falseAlarms: number;
    correctRejections: number;
  }): PsychometricScore {
    return new PsychometricScore(data.hits, data.misses, data.falseAlarms, data.correctRejections);
  }
}
