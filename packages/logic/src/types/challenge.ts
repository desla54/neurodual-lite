/**
 * Challenge Types
 *
 * Statistical challenge based on daily training time.
 * This is NOT a Journey: no level progression, no stage rules.
 */

export type LocalDayKey = `${number}-${number}-${number}`;

export interface TrainingDailyTotal {
  /** Local day key formatted as YYYY-MM-DD (local time). */
  readonly day: LocalDayKey;
  /** Total training duration for this day (ms). */
  readonly totalDurationMs: number;
  /** Number of sessions completed for this day. */
  readonly sessionsCount: number;
}

export interface Challenge20Config {
  readonly totalDays: number;
  /** Target minutes per day (e.g. 15). */
  readonly targetMinutesPerDay: number;
}

export interface ChallengeDayCard {
  /** 1-based index (J1..J20). */
  readonly index: number;
  /** Day key on which the card was completed (completed cards only). */
  readonly completedDay: LocalDayKey | null;
  /** Minutes trained on the completed day (completed cards only). */
  readonly completedMinutes: number | null;
  /** Card visual status. */
  readonly status: 'completed' | 'current' | 'locked';
  /** For current card only: minutes trained today (local). */
  readonly currentMinutesToday: number | null;
  /** For current card only: progress ratio [0..1]. */
  readonly currentProgress: number | null;
}

export interface Challenge20State {
  readonly config: Challenge20Config;
  /** Local day key for "today" (device local time). */
  readonly today: LocalDayKey;
  /** Number of completed days (0..20). */
  readonly completedDays: number;
  /** Current card index (1..20), or null when today's card is already validated or the challenge is complete. */
  readonly currentIndex: number | null;
  /** Whether the whole challenge is complete. */
  readonly isComplete: boolean;
  /** Cards (always length 20). */
  readonly cards: readonly ChallengeDayCard[];
  /** Today's minutes (local), across all activities. */
  readonly todayMinutes: number;
  /** Today's duration in ms. */
  readonly todayDurationMs: number;
}
