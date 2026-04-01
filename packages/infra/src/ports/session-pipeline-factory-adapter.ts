import type {
  BadgeHistorySnapshot,
  GameEvent,
  SessionPipelineFactoryPort,
} from '@neurodual/logic';
import { SESSION_START_EVENT_TYPES } from '@neurodual/logic';
import {
  SessionEndPipelineAdapter,
  type PipelineDependencies,
} from '../pipeline/session-end-pipeline-machine';
import { ensureSummaryProjectedForSession } from '../history/history-projection';

export const sessionPipelineFactoryAdapter: SessionPipelineFactoryPort = {
  create(options) {
    const { historyAdapter, progressionAdapter } = options;
    const persistence = options.persistence ?? null;
    const getActiveUserIdForPersistence = options.getActiveUserIdForPersistence ?? (() => 'local');

    const recordJourneyAttempt = options.recordJourneyAttempt;

    const dependencies: PipelineDependencies = {
      // Persistence
      persistEvents: async (_sessionId: string, events: readonly unknown[]) => {
        if (events.length === 0) return;

        // Validate events have required GameEvent shape before persisting
        const validatedEvents: GameEvent[] = [];
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (
            typeof event === 'object' &&
            event !== null &&
            'type' in event &&
            typeof (event as Record<string, unknown>)['type'] === 'string' &&
            'timestamp' in event &&
            typeof (event as Record<string, unknown>)['timestamp'] === 'number'
          ) {
            validatedEvents.push(event as GameEvent);
          }
        }

        // Strict mode: system events are emitted via workflows on SESSION/END.
        // Pipeline no longer persists derived system events directly.
        return;

        // NOTE: session_summaries projection is owned by the single-writer history projection runner.
        // Avoid direct reprojection here (it creates races with checkpointed projections).
      },

      // Optional: used to rehydrate events when pipeline recovery input omits them
      getSessionEvents: (sessionId: string) => historyAdapter.getSessionEvents(sessionId),

      // Progression
      getProgression: () => progressionAdapter.getProgression(),
      getBadges: () => progressionAdapter.getBadges(),
      getBadgeHistory: async () => {
        const userId = getActiveUserIdForPersistence();
        if (!persistence) {
          const empty: BadgeHistorySnapshot = {
            currentStreak: 0,
            bestStreak: 0,
            sessionsToday: 0,
            earlyMorningDays: 0,
            lateNightDays: 0,
            maxNLevel: 0,
            bestDPrime: 0,
            daysSinceLastSession: null,
          };
          return empty;
        }
        return await persistence.getBadgeHistorySnapshot(userId);
      },

      // History
      getSessions: () => historyAdapter.getSessions(),

      // Recovery persistence (web provides localStorage implementation)
      saveRecoveryState: (state) => options.recoveryStorage.save(state),
      loadRecoveryState: () => options.recoveryStorage.load(),
      clearRecoveryState: () => options.recoveryStorage.clear(),

      // Optional dependencies
      syncToCloud: options.syncToCloud,
      recordJourneyAttempt,
      checkAndGrantRewards: options.checkAndGrantRewards,

      ensureSummaryProjected: persistence
        ? async (sessionId: string) => {
            await ensureSummaryProjectedForSession(persistence, sessionId);
          }
        : undefined,
      ensureProfileProjected: persistence
        ? async (completionInput) => {
            const events = 'events' in completionInput ? completionInput.events : [];
            if (!Array.isArray(events) || events.length === 0) return;

            const playContext = events.find((event) => {
              if (typeof event !== 'object' || event === null) return false;
              const type = (event as Record<string, unknown>)['type'];
              return typeof type === 'string' && SESSION_START_EVENT_TYPES.has(type);
            }) as Record<string, unknown> | undefined;

            const mode = playContext?.['playContext'];
            if (mode !== 'profile' && mode !== 'calibration') return;

            const candidate = persistence as {
              getPowerSyncDb?: () => Promise<import('@powersync/web').AbstractPowerSyncDatabase>;
            };
            if (typeof candidate.getPowerSyncDb !== 'function') return;

            const db = await candidate.getPowerSyncDb();
            const { applyProfileSessionDirectly } = await import(
              '../projections/cognitive-profile-projection'
            );
            await applyProfileSessionDirectly(db, {
              sessionId: completionInput.sessionId,
              sessionEvents: events as GameEvent[],
            });
          }
        : undefined,
    };

    return new SessionEndPipelineAdapter(dependencies, options.maxRetries ?? 3);
  },
};
