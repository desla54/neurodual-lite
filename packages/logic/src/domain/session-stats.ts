/**
 * SessionStats - Value Object
 *
 * Encapsule les statistiques d'une session avec méthodes de calcul.
 * Immutable, testable, réutilisable.
 */

import type { ModalityId } from '../domain/modality/modality';
import type { RunningStats, SessionSummary } from '../engine/events';
import type { SessionHistoryItem } from '../ports/history-port';
import type { UnifiedMetrics } from './unified-metrics';
import { computeUnifiedMetrics, computeTempoAccuracy } from './unified-metrics';
import { SDT_DPRIME_PASS, SDT_DPRIME_DOWN, STATS_MIN_TRIALS_FOR_VALID } from '../specs/thresholds';

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

const DPRIME_PASS_THRESHOLD = SDT_DPRIME_PASS;
const DPRIME_DOWN_THRESHOLD = SDT_DPRIME_DOWN;
const MIN_TRIALS_FOR_VALID_STATS = STATS_MIN_TRIALS_FOR_VALID;

// =============================================================================
// ModalityStats Value Object
// =============================================================================

export class ModalityStatsVO {
  constructor(
    readonly hits: number,
    readonly misses: number,
    readonly falseAlarms: number,
    readonly correctRejections: number,
    readonly avgReactionTime: number | null,
  ) {}

  /** Total de trials pour cette modalité */
  get totalTrials(): number {
    return this.hits + this.misses + this.falseAlarms + this.correctRejections;
  }

  /** Taux de précision (hits sur targets) en pourcentage - Hit Rate */
  get accuracy(): number {
    const targets = this.hits + this.misses;
    if (targets === 0) return 0;
    return Math.round((this.hits / targets) * 100);
  }

  /**
   * Précision globale using Balanced Accuracy.
   * Formula: (hitRate + correctRejectionRate) / 2
   * Weighs target detection and noise rejection equally.
   */
  get overallAccuracy(): number {
    const signalTrials = this.hits + this.misses;
    const noiseTrials = this.falseAlarms + this.correctRejections;
    if (signalTrials === 0 && noiseTrials === 0) return 0;

    const hitRate = signalTrials > 0 ? this.hits / signalTrials : 0;
    const crRate = noiseTrials > 0 ? this.correctRejections / noiseTrials : 0;
    return Math.round(((hitRate + crRate) / 2) * 100);
  }

  /** Hit Rate brut (0-1) */
  get hitRate(): number {
    const targets = this.hits + this.misses;
    return targets > 0 ? this.hits / targets : 0;
  }

  /** False Alarm Rate brut (0-1) */
  get falseAlarmRate(): number {
    const nonTargets = this.falseAlarms + this.correctRejections;
    return nonTargets > 0 ? this.falseAlarms / nonTargets : 0;
  }

  /** Temps de réaction moyen formaté (ex: "342ms") */
  get formattedRT(): string | null {
    if (this.avgReactionTime === null) return null;
    return `${Math.round(this.avgReactionTime)}ms`;
  }
}

// =============================================================================
// SessionStats Value Object
// =============================================================================

export class SessionStats {
  private readonly _byModality: Map<ModalityId, ModalityStatsVO>;
  readonly activeModalities: readonly ModalityId[];
  readonly unifiedMetrics: UnifiedMetrics;

  constructor(
    readonly sessionId: string,
    readonly nLevel: number,
    readonly totalTrials: number,
    readonly durationMs: number,
    readonly globalDPrime: number,
    readonly createdAt: Date,
    stats: RunningStats,
    unifiedMetrics?: UnifiedMetrics,
  ) {
    this._byModality = new Map();
    const modalities: ModalityId[] = [];

    for (const [modalityId, modalityStats] of Object.entries(stats.byModality)) {
      modalities.push(modalityId);
      this._byModality.set(
        modalityId,
        new ModalityStatsVO(
          modalityStats.hits,
          modalityStats.misses,
          modalityStats.falseAlarms,
          modalityStats.correctRejections,
          modalityStats.avgRT,
        ),
      );
    }

    this.activeModalities = modalities;

    // Use provided unifiedMetrics or compute from stats
    if (unifiedMetrics) {
      this.unifiedMetrics = unifiedMetrics;
    } else {
      // Compute from stats (fallback for fromSummary)
      let totalHits = 0,
        totalMisses = 0,
        totalFA = 0,
        totalCR = 0;
      for (const modalityStats of Object.values(stats.byModality)) {
        totalHits += modalityStats.hits;
        totalMisses += modalityStats.misses;
        totalFA += modalityStats.falseAlarms;
        totalCR += modalityStats.correctRejections;
      }
      const accuracy = computeTempoAccuracy(totalHits, totalMisses, totalFA, totalCR);
      this.unifiedMetrics = computeUnifiedMetrics(accuracy, nLevel);
    }
  }

  // ===========================================================================
  // Accesseurs Modalités
  // ===========================================================================

  /** Récupère les stats d'une modalité (retourne stats vides si inexistante) */
  getModality(modalityId: ModalityId): ModalityStatsVO {
    return this._byModality.get(modalityId) ?? new ModalityStatsVO(0, 0, 0, 0, null);
  }

  /** Récupère toutes les stats par modalité */
  get byModality(): ReadonlyMap<ModalityId, ModalityStatsVO> {
    return this._byModality;
  }

  // Backward compatibility getters
  get position(): ModalityStatsVO {
    return this.getModality('position');
  }

  get audio(): ModalityStatsVO {
    return this.getModality('audio');
  }

  // ===========================================================================
  // Métriques Globales
  // ===========================================================================

  /** Session réussie (d' >= seuil) */
  get passed(): boolean {
    return this.globalDPrime >= DPRIME_PASS_THRESHOLD;
  }

  /** Session trop courte pour stats fiables */
  get isShortSession(): boolean {
    return this.totalTrials < MIN_TRIALS_FOR_VALID_STATS;
  }

  /** Durée formatée (ex: "2min 30s") */
  get formattedDuration(): string {
    const totalSeconds = Math.floor(this.durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}min ${seconds}s`;
  }

  /** d' formaté (ex: "2.3") */
  get formattedDPrime(): string {
    return this.globalDPrime.toFixed(1);
  }

  // ===========================================================================
  // Décisions de Progression
  // ===========================================================================

  /** Devrait monter de niveau */
  shouldLevelUp(): boolean {
    return this.globalDPrime >= DPRIME_PASS_THRESHOLD;
  }

  /** Devrait descendre de niveau */
  shouldLevelDown(): boolean {
    return this.globalDPrime < DPRIME_DOWN_THRESHOLD && this.nLevel > 1;
  }

  /** Niveau recommandé pour la prochaine session */
  getNextLevel(): number {
    if (this.shouldLevelUp()) return this.nLevel + 1;
    if (this.shouldLevelDown()) return Math.max(1, this.nLevel - 1);
    return this.nLevel;
  }

  // ===========================================================================
  // Factory
  // ===========================================================================

  static fromSummary(summary: SessionSummary): SessionStats {
    return new SessionStats(
      summary.sessionId,
      summary.nLevel,
      summary.totalTrials,
      summary.durationMs,
      summary.finalStats.globalDPrime,
      new Date(), // SessionSummary n'a pas de date, utiliser maintenant
      summary.finalStats,
    );
  }

  static fromHistoryItem(item: SessionHistoryItem): SessionStats {
    // Convertir byModality de SessionHistoryItem vers RunningStats.byModality
    const byModality: Record<
      string,
      {
        hits: number;
        misses: number;
        falseAlarms: number;
        correctRejections: number;
        avgRT: number | null;
        dPrime: number;
      }
    > = {};

    for (const [modalityId, stats] of Object.entries(item.byModality)) {
      // Utiliser le dPrime stocké (pas de recalcul pour éviter divergence)
      byModality[modalityId] = {
        hits: stats.hits,
        misses: stats.misses,
        falseAlarms: stats.falseAlarms,
        correctRejections: stats.correctRejections,
        avgRT: stats.avgRT,
        dPrime: stats.dPrime,
      };
    }

    const runningStats: RunningStats = {
      trialsCompleted: item.trialsCount,
      globalDPrime: item.dPrime,
      byModality,
    };

    return new SessionStats(
      item.id,
      item.nLevel,
      item.trialsCount,
      item.durationMs,
      item.dPrime,
      item.createdAt,
      runningStats,
      item.unifiedMetrics, // Pass unifiedMetrics from history item
    );
  }
}
