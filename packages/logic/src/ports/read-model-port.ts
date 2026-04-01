import type { JourneyConfig, JourneyState } from '../types/journey';

import type { ReadModelSnapshot, Subscribable } from './reactive';

/**
 * ReadModelPort
 *
 * Reactive, read-only API for projected data.
 * Implemented by infra (PowerSync/SQLite), consumed by UI.
 */
export interface ReadModelPort {
  /**
   * Reactive journey state derived from session_summaries.
   *
   * userId:
   * - null => local-only scope
   * - string => authenticated scope (should include local legacy rows as well)
   */
  journeyState(
    config: JourneyConfig,
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<JourneyState>>;

  // === Profile (session_summaries aggregates) ===
  profileSummary(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  profileLatestSession(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  profileSessionDays(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  /** Local-time daily aggregates (day = YYYY-MM-DD). */
  trainingDailyTotals(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  profileProgression(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  profileModalitySource(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  /** Streak info from streak_projection table (O(1) lookup). Returns array with 0-1 row. */
  profileStreak(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;

  // === Progression ===
  progressionSummary(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  progressionUninterruptedStreak(
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  badgesUnlocked(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  modeQuickStats(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  lastPlayedMode(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;

  // === Replay ===
  replayRuns(sessionId: string): Subscribable<ReadModelSnapshot<readonly unknown[]>>;

  // === History ===
  historyJourneyRecordableSessions(
    userId: string | null,
    journeyId: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyAvailableJourneyIds(
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummariesFilteredCount(
    userId: string | null,
    filters: SessionSummariesFilters,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;

  historySessionSummariesFilteredIds(
    userId: string | null,
    filters: SessionSummariesFilters,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummariesPage(
    userId: string | null,
    filters: SessionSummariesFilters,
    cursor: SessionSummariesCursor | null,
    pageSize: number,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummariesHeaderCounts(
    userId: string | null,
    filters: SessionSummariesFilters,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummariesCount(
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummariesIds(
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyMaxAchievedLevelForMode(
    userId: string | null,
    modeId: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionsList(userId: string | null): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionDetails(
    userId: string | null,
    sessionId: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionSummaries(
    userId: string | null,
    includeAbandoned: boolean,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyLastAdaptiveDPrime(
    userId: string | null,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyLatestStatsGameMode(
    userId: string | null,
    gameModeIds: readonly string[],
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyRecentSessionsForTrend(
    userId: string | null,
    input: {
      gameMode: string;
      referenceCreatedAtIso: string | null;
      excludeSessionId: string;
      limit: number;
    },
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historySessionsByGameMode(
    userId: string | null,
    gameMode: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyJourneySessions(
    userId: string | null,
    journeyId: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyLatestJourneySession(
    userId: string | null,
    journeyId: string,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
  historyBrainWorkshopStrikes(
    userId: string | null,
    journeyId: string,
    limit: number,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;

  // === Admin ===
  adminRecentSessionHealth(
    userId: string,
    refreshToken?: number,
  ): Subscribable<ReadModelSnapshot<readonly unknown[]>>;
}

// -----------------------------------------------------------------------------
// Shared filter types (used by UI and infra)
// -----------------------------------------------------------------------------

export type ModalityFilterSet = Set<string>;
export type NLevelFilterSet = Set<number>;

export type ModeType =
  | 'all'
  | 'DualTempo'
  | 'DualPlace'
  | 'DualMemo'
  | 'DualPick'
  | 'DualTrace'
  | 'DualTime'
  | 'CorsiBlock'
  | 'Ospan'
  | 'RunningSpan'
  | 'PASAT'
  | 'SWM'
  | 'DualTrack'
  | 'CognitiveTask'
  | 'DualnbackClassic'
  | 'BrainWorkshop'
  | 'Gridlock'
  | 'StroopFlex'
  | 'Libre'
  | 'Journey';

export type JourneyFilterType = 'all' | string;
export type FreeModeFilterType = 'all' | Exclude<ModeType, 'all' | 'Libre' | 'Journey'>;

export interface SessionSummariesFilters {
  mode: ModeType;
  journeyFilter: JourneyFilterType;
  freeModeFilter: FreeModeFilterType;
  modalities: ModalityFilterSet;
  startDate: Date | null;
  endDate: Date | null;
  nLevels: NLevelFilterSet;
}

export interface SessionSummariesCursor {
  createdAt: string;
  sessionId: string;
}
