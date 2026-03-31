/**
 * UserProgression Value Object
 *
 * Encapsule l'état de progression du joueur (XP, badges, stats globales).
 * Immutable, testable, réutilisable.
 */

import type { ProgressionRecord, ProgressionView, UnlockedBadge } from '../../types';
import { BADGES, getBadgeById, type BadgeDefinition } from './badges';
import { getLevel, getLevelProgress } from './xp';
import { MS_PER_DAY, BADGE_EARLY_BIRD_HOUR, BADGE_NIGHT_OWL_HOUR } from '../../specs/thresholds';

// =============================================================================
// Re-export types depuis types/ pour rétro-compatibilité
// =============================================================================

export type { ProgressionRecord };

// =============================================================================
// UserProgression Value Object
// =============================================================================

export class UserProgression implements ProgressionView {
  private constructor(
    private readonly _totalXP: number,
    private readonly _unlockedBadges: readonly UnlockedBadge[],
    private readonly _completedSessions: number,
    private readonly _abandonedSessions: number,
    private readonly _totalTrials: number,
    private readonly _firstSessionAt: Date | null,
    private readonly _earlyMorningSessions: number,
    private readonly _lateNightSessions: number,
    private readonly _comebackCount: number,
    private readonly _persistentDays: number,
    private readonly _plateausBroken: number,
    private readonly _uninterruptedSessionsStreak: number,
  ) {}

  // ===========================================================================
  // Accesseurs XP & Niveau
  // ===========================================================================

  get totalXP(): number {
    return this._totalXP;
  }

  get level(): number {
    return getLevel(this._totalXP);
  }

  get levelProgress(): number {
    return getLevelProgress(this._totalXP);
  }

  get formattedXP(): string {
    if (this._totalXP >= 1000) {
      return `${(this._totalXP / 1000).toFixed(1)}k`;
    }
    return this._totalXP.toString();
  }

  // ===========================================================================
  // Accesseurs Sessions
  // ===========================================================================

  get completedSessions(): number {
    return this._completedSessions;
  }

  get abandonedSessions(): number {
    return this._abandonedSessions;
  }

  get totalSessions(): number {
    return this._completedSessions + this._abandonedSessions;
  }

  get completionRate(): number {
    if (this.totalSessions === 0) return 100;
    return Math.round((this._completedSessions / this.totalSessions) * 100);
  }

  get totalTrials(): number {
    return this._totalTrials;
  }

  // ===========================================================================
  // Accesseurs Temps
  // ===========================================================================

  get firstSessionAt(): Date | null {
    return this._firstSessionAt;
  }

  get daysSinceFirstSession(): number {
    if (!this._firstSessionAt) return 0;
    const now = new Date();
    const diffMs = now.getTime() - this._firstSessionAt.getTime();
    return Math.floor(diffMs / MS_PER_DAY);
  }

  get earlyMorningSessions(): number {
    return this._earlyMorningSessions;
  }

  get lateNightSessions(): number {
    return this._lateNightSessions;
  }

  // ===========================================================================
  // Accesseurs Résilience
  // ===========================================================================

  get comebackCount(): number {
    return this._comebackCount;
  }

  get persistentDays(): number {
    return this._persistentDays;
  }

  get plateausBroken(): number {
    return this._plateausBroken;
  }

  get uninterruptedSessionsStreak(): number {
    return this._uninterruptedSessionsStreak;
  }

  // ===========================================================================
  // Accesseurs Volume Metrics (ProgressionView)
  // ===========================================================================

  /** @todo Compute from session history when available */
  get sessionsWithHighAccuracy(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get sessionsWithVeryHighAccuracy(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get perfectSessions(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get fastReactionSessions(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get veryFastReactionSessions(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get ultraFastReactionSessions(): number {
    return 0;
  }

  // ===========================================================================
  // Accesseurs Cognitive Metrics (ProgressionView)
  // ===========================================================================

  /** @todo Compute from session history when available */
  get metronomeSessionCount(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get placeSessionCount(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get resilientSessionCount(): number {
    return 0;
  }

  /** @todo Compute from session history when available */
  get strongComebackCount(): number {
    return 0;
  }

  // ===========================================================================
  // Accesseurs Badges
  // ===========================================================================

  get unlockedBadges(): readonly UnlockedBadge[] {
    return this._unlockedBadges;
  }

  get unlockedBadgeIds(): Set<string> {
    return new Set(this._unlockedBadges.map((b) => b.badgeId));
  }

  get unlockedBadgeCount(): number {
    return this._unlockedBadges.length;
  }

  get totalBadgeCount(): number {
    return BADGES.length;
  }

  hasBadge(badgeId: string): boolean {
    return this._unlockedBadges.some((b) => b.badgeId === badgeId);
  }

  getBadgeUnlockDate(badgeId: string): Date | undefined {
    return this._unlockedBadges.find((b) => b.badgeId === badgeId)?.unlockedAt;
  }

  getUnlockedBadgeDefinitions(): BadgeDefinition[] {
    return this._unlockedBadges
      .map((b) => getBadgeById(b.badgeId))
      .filter((b): b is BadgeDefinition => b !== undefined);
  }

  getLockedBadges(): BadgeDefinition[] {
    const unlockedIds = this.unlockedBadgeIds;
    return BADGES.filter((b) => !unlockedIds.has(b.id));
  }

  // ===========================================================================
  // Accesseurs Premium Rewards
  // ===========================================================================

  /** @see Use getUnlockedRewards(level) from xp.ts for current rewards */
  /** @see Use getNextReward(level) from xp.ts for next reward */

  // ===========================================================================
  // Immutable Updates
  // ===========================================================================

  withAddedXP(xp: number): UserProgression {
    return new UserProgression(
      this._totalXP + xp,
      this._unlockedBadges,
      this._completedSessions,
      this._abandonedSessions,
      this._totalTrials,
      this._firstSessionAt,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount,
      this._persistentDays,
      this._plateausBroken,
      this._uninterruptedSessionsStreak,
    );
  }

  withNewBadges(badges: UnlockedBadge[]): UserProgression {
    return new UserProgression(
      this._totalXP,
      [...this._unlockedBadges, ...badges],
      this._completedSessions,
      this._abandonedSessions,
      this._totalTrials,
      this._firstSessionAt,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount,
      this._persistentDays,
      this._plateausBroken,
      this._uninterruptedSessionsStreak,
    );
  }

  /**
   * @param trials Number of trials in the session
   * @param hour Hour of day when session was completed (0-23)
   * @param hadPause Whether the session had any pause (resets uninterrupted streak)
   */
  withCompletedSession(trials: number, hour: number, hadPause = false): UserProgression {
    const isEarlyMorning = hour < BADGE_EARLY_BIRD_HOUR;
    const isLateNight = hour >= BADGE_NIGHT_OWL_HOUR;
    const firstSession = this._firstSessionAt ?? new Date();
    // Update uninterrupted streak: increment if no pause, reset to 0 if paused
    const newUninterruptedStreak = hadPause ? 0 : this._uninterruptedSessionsStreak + 1;

    return new UserProgression(
      this._totalXP,
      this._unlockedBadges,
      this._completedSessions + 1,
      this._abandonedSessions,
      this._totalTrials + trials,
      firstSession,
      this._earlyMorningSessions + (isEarlyMorning ? 1 : 0),
      this._lateNightSessions + (isLateNight ? 1 : 0),
      this._comebackCount,
      this._persistentDays,
      this._plateausBroken,
      newUninterruptedStreak,
    );
  }

  withAbandonedSession(): UserProgression {
    const firstSession = this._firstSessionAt ?? new Date();

    return new UserProgression(
      this._totalXP,
      this._unlockedBadges,
      this._completedSessions,
      this._abandonedSessions + 1,
      this._totalTrials,
      firstSession,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount,
      this._persistentDays,
      this._plateausBroken,
      0, // Reset uninterrupted streak on abandoned session
    );
  }

  withComeback(): UserProgression {
    return new UserProgression(
      this._totalXP,
      this._unlockedBadges,
      this._completedSessions,
      this._abandonedSessions,
      this._totalTrials,
      this._firstSessionAt,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount + 1,
      this._persistentDays,
      this._plateausBroken,
      this._uninterruptedSessionsStreak,
    );
  }

  withPersistentDay(): UserProgression {
    return new UserProgression(
      this._totalXP,
      this._unlockedBadges,
      this._completedSessions,
      this._abandonedSessions,
      this._totalTrials,
      this._firstSessionAt,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount,
      this._persistentDays + 1,
      this._plateausBroken,
      this._uninterruptedSessionsStreak,
    );
  }

  withPlateauBroken(): UserProgression {
    return new UserProgression(
      this._totalXP,
      this._unlockedBadges,
      this._completedSessions,
      this._abandonedSessions,
      this._totalTrials,
      this._firstSessionAt,
      this._earlyMorningSessions,
      this._lateNightSessions,
      this._comebackCount,
      this._persistentDays,
      this._plateausBroken + 1,
      this._uninterruptedSessionsStreak,
    );
  }

  // ===========================================================================
  // Factories
  // ===========================================================================

  static empty(): UserProgression {
    return new UserProgression(0, [], 0, 0, 0, null, 0, 0, 0, 0, 0, 0);
  }

  static fromRecord(record: ProgressionRecord, badges: readonly UnlockedBadge[]): UserProgression {
    return new UserProgression(
      record.totalXP,
      badges,
      record.completedSessions,
      record.abandonedSessions,
      record.totalTrials,
      record.firstSessionAt,
      record.earlyMorningSessions,
      record.lateNightSessions,
      record.comebackCount,
      record.persistentDays,
      record.plateausBroken,
      record.uninterruptedSessionsStreak ?? 0,
    );
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  toRecord(): ProgressionRecord {
    return {
      totalXP: this._totalXP,
      completedSessions: this._completedSessions,
      abandonedSessions: this._abandonedSessions,
      totalTrials: this._totalTrials,
      firstSessionAt: this._firstSessionAt,
      earlyMorningSessions: this._earlyMorningSessions,
      lateNightSessions: this._lateNightSessions,
      comebackCount: this._comebackCount,
      persistentDays: this._persistentDays,
      plateausBroken: this._plateausBroken,
      uninterruptedSessionsStreak: this._uninterruptedSessionsStreak,
    };
  }
}
