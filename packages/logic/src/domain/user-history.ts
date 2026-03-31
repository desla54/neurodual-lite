/**
 * UserHistory - Aggregate pour l'analyse de l'historique utilisateur
 *
 * Encapsule la liste des sessions avec méthodes d'analyse.
 * Pour la page stats et les prédictions.
 */

import type { SessionSummary } from '../engine/events';
import type { SessionHistoryItem } from '../ports/history-port';
import type { StreakInfo } from '../types/history-types';
import { SessionStats } from './session-stats';

// Re-export from central types file for backward compatibility
export type { StreakInfo } from '../types/history-types';
import {
  SDT_DPRIME_PASS,
  STATS_DAILY_WINDOW_DAYS,
  STATS_BEST_HOUR_MIN_SESSIONS,
  STATS_BEST_HOUR_MIN_PER_SLOT,
  TREND_RECENT_WINDOW,
  TREND_OLDER_WINDOW,
  TREND_MIN_SESSIONS,
  TREND_IMPROVING_THRESHOLD_PERCENT,
  TREND_DECLINING_THRESHOLD_PERCENT,
  TREND_CONFIDENCE_HIGH_MIN_SESSIONS,
  TREND_CONFIDENCE_MEDIUM_MIN_SESSIONS,
  PLATEAU_DETECTION_THRESHOLD,
  BADGE_EARLY_BIRD_HOUR,
  BADGE_NIGHT_OWL_HOUR,
} from '../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

export interface DailyStats {
  readonly date: string; // YYYY-MM-DD
  readonly sessionsCount: number;
  readonly avgDPrime: number;
  readonly totalDurationMs: number;
  readonly bestDPrime: number;
}

export interface WeeklyStats {
  readonly weekStart: string; // YYYY-MM-DD (lundi)
  readonly sessionsCount: number;
  readonly avgDPrime: number;
  readonly totalDurationMs: number;
  readonly daysActive: number;
}

export interface TrendInfo {
  readonly direction: 'improving' | 'stable' | 'declining';
  readonly changePercent: number;
  readonly confidence: 'low' | 'medium' | 'high';
}

// =============================================================================
// UserHistory
// =============================================================================

export class UserHistory {
  private readonly _sessions: SessionStats[];
  private readonly _sortedByDate: SessionStats[];

  private constructor(sessions: SessionStats[]) {
    this._sessions = sessions;
    // Trier par date (plus récent en premier)
    this._sortedByDate = [...this._sessions].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  // ===========================================================================
  // Accesseurs de base
  // ===========================================================================

  get totalSessions(): number {
    return this._sessions.length;
  }

  get isEmpty(): boolean {
    return this._sessions.length === 0;
  }

  /** Sessions triées par date (plus récent en premier) */
  get sessions(): readonly SessionStats[] {
    return this._sortedByDate;
  }

  /** Session la plus récente */
  get lastSession(): SessionStats | null {
    return this._sortedByDate[0] ?? null;
  }

  // ===========================================================================
  // Métriques globales
  // ===========================================================================

  /** d' moyen sur toutes les sessions */
  get avgDPrime(): number {
    if (this._sessions.length === 0) return 0;
    const sum = this._sessions.reduce((acc, s) => acc + s.globalDPrime, 0);
    return sum / this._sessions.length;
  }

  /** Meilleur d' atteint */
  get bestDPrime(): number {
    if (this._sessions.length === 0) return 0;
    return Math.max(...this._sessions.map((s) => s.globalDPrime));
  }

  /** Niveau N maximum atteint */
  get maxNLevel(): number {
    if (this._sessions.length === 0) return 1;
    return Math.max(...this._sessions.map((s) => s.nLevel));
  }

  // ===========================================================================
  // Unified Metrics (Zone-based, cross-mode comparable)
  // ===========================================================================

  /** Zone moyenne sur toutes les sessions (1-20) */
  get avgZone(): number {
    if (this._sessions.length === 0) return 1;
    const sum = this._sessions.reduce((acc, s) => acc + s.unifiedMetrics.zone, 0);
    return Math.round(sum / this._sessions.length);
  }

  /** Meilleure zone atteinte (1-20) */
  get bestZone(): number {
    if (this._sessions.length === 0) return 1;
    return Math.max(...this._sessions.map((s) => s.unifiedMetrics.zone));
  }

  /** Accuracy moyenne sur toutes les sessions (0-100%) */
  get avgAccuracy(): number {
    if (this._sessions.length === 0) return 0;
    const sum = this._sessions.reduce((acc, s) => acc + s.unifiedMetrics.accuracy, 0);
    return Math.round((sum / this._sessions.length) * 100);
  }

  /** Meilleure accuracy atteinte (0-100%) */
  get bestAccuracy(): number {
    if (this._sessions.length === 0) return 0;
    return Math.round(Math.max(...this._sessions.map((s) => s.unifiedMetrics.accuracy)) * 100);
  }

  /** Durée totale de jeu (ms) */
  get totalPlayTimeMs(): number {
    return this._sessions.reduce((acc, s) => acc + s.durationMs, 0);
  }

  /** Durée totale formatée */
  get formattedTotalPlayTime(): string {
    const totalMinutes = Math.floor(this.totalPlayTimeMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}min`;
    return `${hours}h ${minutes}min`;
  }

  // ===========================================================================
  // Analyse temporelle
  // ===========================================================================

  /** Jours depuis la dernière session */
  get daysSinceLastSession(): number | null {
    const last = this.lastSession;
    if (!last) return null;
    const now = new Date();
    const diffMs = now.getTime() - last.createdAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /** Nombre de sessions consécutives sans perte de focus
   * @todo Implement based on focus tracking events */
  get sessionsWithoutFocusLoss(): number {
    // For now return 0 - needs focus tracking data
    return 0;
  }

  /** Streak actuel (jours consécutifs) */
  getStreak(): StreakInfo {
    if (this._sessions.length === 0) {
      return { current: 0, best: 0, lastActiveDate: null };
    }

    const dates = this.getUniqueDates();
    if (dates.length === 0) {
      return { current: 0, best: 0, lastActiveDate: null };
    }

    // Calculer le streak actuel
    let currentStreak = 1;
    const today = this.formatDate(new Date());
    const yesterday = this.formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const firstDate = dates[0];
    // Vérifier si actif aujourd'hui ou hier
    if (firstDate !== today && firstDate !== yesterday) {
      currentStreak = 0;
    } else {
      for (let i = 1; i < dates.length; i++) {
        const prev = dates[i - 1];
        const curr = dates[i];
        if (!prev || !curr) break;
        const prevDate = new Date(prev);
        const currDate = new Date(curr);
        const diffDays = Math.floor(
          (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculer le meilleur streak
    let bestStreak = 1;
    let tempStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const curr = dates[i];
      if (!prev || !curr) break;
      const prevDate = new Date(prev);
      const currDate = new Date(curr);
      const diffDays = Math.floor(
        (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    return {
      current: currentStreak,
      best: Math.max(bestStreak, currentStreak),
      lastActiveDate: firstDate ?? null,
    };
  }

  /** Sessions par jour pour graphique */
  getDailyStats(days: number = STATS_DAILY_WINDOW_DAYS): DailyStats[] {
    const stats: Map<string, { sessions: SessionStats[] }> = new Map();

    // Grouper par jour
    for (const session of this._sessions) {
      const date = this.formatDate(session.createdAt);
      if (!stats.has(date)) {
        stats.set(date, { sessions: [] });
      }
      stats.get(date)?.sessions.push(session);
    }

    // Convertir en array
    const result: DailyStats[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = this.formatDate(date);
      const daySessions = stats.get(dateStr)?.sessions ?? [];

      result.push({
        date: dateStr,
        sessionsCount: daySessions.length,
        avgDPrime:
          daySessions.length > 0
            ? daySessions.reduce((a, s) => a + s.globalDPrime, 0) / daySessions.length
            : 0,
        totalDurationMs: daySessions.reduce((a, s) => a + s.durationMs, 0),
        bestDPrime:
          daySessions.length > 0 ? Math.max(...daySessions.map((s) => s.globalDPrime)) : 0,
      });
    }

    return result.reverse(); // Plus ancien en premier
  }

  // ===========================================================================
  // Analyse de tendance
  // ===========================================================================

  /** Tendance de performance (amélioration/stagnation/régression) */
  getTrend(): TrendInfo {
    const recentSessions = this._sortedByDate.slice(0, TREND_RECENT_WINDOW);
    const olderSessions = this._sortedByDate.slice(TREND_RECENT_WINDOW, TREND_OLDER_WINDOW);

    if (recentSessions.length < TREND_MIN_SESSIONS) {
      return { direction: 'stable', changePercent: 0, confidence: 'low' };
    }

    const recentAvg =
      recentSessions.reduce((a, s) => a + s.globalDPrime, 0) / recentSessions.length;

    if (olderSessions.length < TREND_MIN_SESSIONS) {
      return { direction: 'stable', changePercent: 0, confidence: 'low' };
    }

    const olderAvg = olderSessions.reduce((a, s) => a + s.globalDPrime, 0) / olderSessions.length;

    const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    let direction: 'improving' | 'stable' | 'declining';
    if (changePercent > TREND_IMPROVING_THRESHOLD_PERCENT) {
      direction = 'improving';
    } else if (changePercent < TREND_DECLINING_THRESHOLD_PERCENT) {
      direction = 'declining';
    } else {
      direction = 'stable';
    }

    const confidence =
      this._sessions.length >= TREND_CONFIDENCE_HIGH_MIN_SESSIONS
        ? 'high'
        : this._sessions.length >= TREND_CONFIDENCE_MEDIUM_MIN_SESSIONS
          ? 'medium'
          : 'low';

    return { direction, changePercent: Math.round(changePercent), confidence };
  }

  /** Vérifie si l'utilisateur stagne */
  isPlateauing(threshold: number = PLATEAU_DETECTION_THRESHOLD): boolean {
    const recent = this._sortedByDate.slice(0, 5);
    if (recent.length < 5) return false;

    const dPrimes = recent.map((s) => s.globalDPrime);
    const avg = dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
    const variance = dPrimes.reduce((a, d) => a + (d - avg) ** 2, 0) / dPrimes.length;

    return Math.sqrt(variance) < threshold;
  }

  // ===========================================================================
  // Helpers privés
  // ===========================================================================

  private getUniqueDates(): string[] {
    const dates = new Set<string>();
    for (const session of this._sortedByDate) {
      dates.add(this.formatDate(session.createdAt));
    }
    return Array.from(dates);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] ?? '';
  }

  // ===========================================================================
  // Métriques de précision
  // ===========================================================================

  /** Précision globale (moyenne des accuracies position + audio) */
  get overallAccuracy(): number {
    if (this._sessions.length === 0) return 0;
    const posAcc = this.positionAccuracy;
    const audioAcc = this.audioAccuracy;
    return Math.round((posAcc + audioAcc) / 2);
  }

  /** Précision moyenne en position (%) */
  get positionAccuracy(): number {
    if (this._sessions.length === 0) return 0;
    const sum = this._sessions.reduce((acc, s) => acc + s.position.accuracy, 0);
    return Math.round(sum / this._sessions.length);
  }

  /** Précision moyenne en audio (%) */
  get audioAccuracy(): number {
    if (this._sessions.length === 0) return 0;
    const sum = this._sessions.reduce((acc, s) => acc + s.audio.accuracy, 0);
    return Math.round(sum / this._sessions.length);
  }

  /** Temps de réaction moyen en position (ms) */
  get avgPositionRT(): number | null {
    const rts = this._sessions
      .map((s) => s.position.avgReactionTime)
      .filter((rt): rt is number => rt !== null);
    if (rts.length === 0) return null;
    return Math.round(rts.reduce((a, b) => a + b, 0) / rts.length);
  }

  /** Temps de réaction moyen en audio (ms) */
  get avgAudioRT(): number | null {
    const rts = this._sessions
      .map((s) => s.audio.avgReactionTime)
      .filter((rt): rt is number => rt !== null);
    if (rts.length === 0) return null;
    return Math.round(rts.reduce((a, b) => a + b, 0) / rts.length);
  }

  // ===========================================================================
  // Analyse avancée
  // ===========================================================================

  /** Heure où l'utilisateur performe le mieux */
  getBestHourOfDay(): { hour: number; avgDPrime: number } | null {
    if (this._sessions.length < STATS_BEST_HOUR_MIN_SESSIONS) return null;

    const hourStats = new Map<number, { sum: number; count: number }>();

    for (const session of this._sessions) {
      const hour = session.createdAt.getHours();
      const existing = hourStats.get(hour) ?? { sum: 0, count: 0 };
      existing.sum += session.globalDPrime;
      existing.count += 1;
      hourStats.set(hour, existing);
    }

    let bestHour = 0;
    let bestAvg = -Infinity;

    for (const [hour, stats] of hourStats) {
      if (stats.count >= STATS_BEST_HOUR_MIN_PER_SLOT) {
        // Au moins N sessions à cette heure
        const avg = stats.sum / stats.count;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestHour = hour;
        }
      }
    }

    if (bestAvg === -Infinity) return null;
    return { hour: bestHour, avgDPrime: Math.round(bestAvg * 10) / 10 };
  }

  /** Progression vers le niveau suivant (0-100%) basée sur d-prime */
  progressToNextLevel(): number {
    const last = this.lastSession;
    if (!last) return 0;

    // Seuil pour passer au niveau suivant: d' >= SDT_DPRIME_PASS
    const threshold = SDT_DPRIME_PASS;
    const current = last.globalDPrime;

    if (current >= threshold) return 100;
    if (current <= 0) return 0;

    return Math.round((current / threshold) * 100);
  }

  /** Nombre de sessions réussies (d' >= 1.5) */
  get passedSessionsCount(): number {
    return this._sessions.filter((s) => s.passed).length;
  }

  /** Taux de réussite (%) */
  get passRate(): number {
    if (this._sessions.length === 0) return 0;
    return Math.round((this.passedSessionsCount / this._sessions.length) * 100);
  }

  // ===========================================================================
  // Badge-related metrics
  // ===========================================================================

  /**
   * Count unique days with at least one early morning session (before 8h).
   * Used for the early_bird badge to prevent 5 sessions in one morning.
   */
  getEarlyMorningDaysCount(): number {
    const uniqueDays = new Set<string>();
    for (const session of this._sessions) {
      const hour = session.createdAt.getHours();
      if (hour < BADGE_EARLY_BIRD_HOUR) {
        uniqueDays.add(this.formatDate(session.createdAt));
      }
    }
    return uniqueDays.size;
  }

  /**
   * Count unique days with at least one late night session (after 22h or before 5h).
   * Used for the night_owl badge to prevent 5 sessions in one night.
   */
  getLateNightDaysCount(): number {
    const uniqueDays = new Set<string>();
    for (const session of this._sessions) {
      const hour = session.createdAt.getHours();
      // Late night = after 22h or before 5h (to catch sessions past midnight)
      if (hour >= BADGE_NIGHT_OWL_HOUR || hour < 5) {
        uniqueDays.add(this.formatDate(session.createdAt));
      }
    }
    return uniqueDays.size;
  }

  // ===========================================================================
  // Factory
  // ===========================================================================

  /** Crée un UserHistory depuis des SessionSummary (événements de fin de session) */
  static from(sessions: SessionSummary[]): UserHistory {
    const stats = sessions.map(SessionStats.fromSummary);
    return new UserHistory(stats);
  }

  /** Crée un UserHistory depuis des SessionHistoryItem (données persistées) */
  static fromHistoryItems(items: SessionHistoryItem[]): UserHistory {
    const stats = items.map(SessionStats.fromHistoryItem);
    return new UserHistory(stats);
  }

  static empty(): UserHistory {
    return new UserHistory([]);
  }
}
