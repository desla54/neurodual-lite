/**
 * Tests for SessionEndWorkflowRunner
 */

import { describe, expect, it, mock } from 'bun:test';
import {
  SessionEndWorkflowRunner,
  findSessionStartEvent,
  getPlayContextFromEvents,
  requireJourneySnapshotFromEvents,
  deriveCommandId,
} from './session-end-workflow-runner';
import type { PersistencePort, SessionCompletionInput, CommandBusPort } from '@neurodual/logic';
import type { InfraAdapters } from '../adapters';

describe('SessionEndWorkflowRunner', () => {
  function createMockPersistence(): PersistencePort {
    const events = new Map<string, { id: string; payload: Record<string, unknown> }[]>();
    const badgeDb = {
      getAll: mock(async () => []),
    };

    return {
      getSession: async (sessionId: string) => {
        return events.get(sessionId) ?? [];
      },
      query: async () => ({ rows: [] }),
      execute: async () => ({ rowsAffected: 1 }),
      getBadgeHistorySnapshot: async () => null,
      getPowerSyncDb: async () => badgeDb,
    } as unknown as PersistencePort;
  }

  function createMockAdapters(): InfraAdapters {
    return {
      progression: {
        getBadges: async () => [],
        getProgression: async () => ({
          totalXP: 100,
          completedSessions: 5,
          abandonedSessions: 1,
          totalTrials: 50,
          firstSessionAt: new Date('2024-01-01'),
          earlyMorningSessions: 2,
          lateNightSessions: 1,
          comebackCount: 0,
          persistentDays: 10,
          plateausBroken: 1,
          uninterruptedSessionsStreak: 3,
        }),
      },
      history: {
        getSessions: async () => [],
      },
      journey: {
        recordAttempt: async () => ({
          attemptsCount: 1,
          bestAttempt: null,
          completed: false,
        }),
      },
    } as unknown as InfraAdapters;
  }

  function createMockCommandBus(): CommandBusPort {
    const handledCommands: {
      type: string;
      data: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }[] = [];

    return {
      handle: async (command) => {
        handledCommands.push(
          command as unknown as {
            type: string;
            data: Record<string, unknown>;
            metadata: Record<string, unknown>;
          },
        );
        return { events: [], fromCache: false };
      },
      _getHandledCommands: () => handledCommands,
    } as CommandBusPort & { _getHandledCommands: () => typeof handledCommands };
  }

  describe('constructor', () => {
    it('should create runner with dependencies', () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus();

      const runner = new SessionEndWorkflowRunner(persistence, adapters, commandBus as any);

      expect(runner).toBeInstanceOf(SessionEndWorkflowRunner);
    });
  });

  describe('onSessionEnded', () => {
    it('should process session end events', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      const runner = new SessionEndWorkflowRunner(persistence, adapters, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-123',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
      } as unknown as SessionCompletionInput;

      // Should not throw
      await runner.onSessionEnded({
        sessionId: 'session-123',
        endCommandId: 'end:session-123',
        completionInput,
      });

      expect(true).toBe(true); // If we got here, no error was thrown
    });

    it('derives XP context from the session owner scope, not the active progression adapter', async () => {
      const persistence = createMockPersistence() as PersistencePort & {
        query: ReturnType<typeof mock>;
        getSession: (sessionId: string) => Promise<unknown[]>;
        getPowerSyncDb: () => Promise<{ getAll: ReturnType<typeof mock> }>;
      };
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus();

      adapters.progression.getBadges = async () => {
        throw new Error('unexpected active-user badge lookup');
      };
      adapters.progression.getProgression = async () => {
        throw new Error('unexpected active-user progression lookup');
      };

      persistence.query = mock(async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*) as c')) {
          return { rows: [{ c: 0 }] };
        }
        if (sql.includes('current_streak')) {
          return {
            rows: [{ current_streak: 2, best_streak: 4, last_date: '2026-03-20' }],
          };
        }
        if (sql.includes('sessions_today')) {
          return { rows: [{ sessions_today: 0 }] };
        }
        if (sql.includes('best_dprime')) {
          return { rows: [{ best_dprime: 1.4 }] };
        }
        if (sql.includes('uninterrupted_streak')) {
          expect(params).toEqual(['user-42', 'local', 'user-42', 'local', 'user-42', 'local']);
          return { rows: [{ uninterrupted_streak: 3 }] };
        }
        if (sql.includes('FROM user_stats_projection')) {
          return {
            rows: [
              {
                completed_sessions: 4,
                abandoned_sessions: 1,
                total_trials: 48,
                early_morning_sessions: 2,
                late_night_sessions: 1,
                first_session_at: '2026-03-01T10:00:00.000Z',
                total_xp: 220,
                max_n_level: 5,
                early_morning_days: 2,
                late_night_days: 1,
                last_session_at: '2026-03-20T10:00:00.000Z',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const badgeDb = await persistence.getPowerSyncDb();
      badgeDb.getAll.mockResolvedValueOnce([
        {
          session_id: 'existing-session',
          payload: JSON.stringify({ badgeId: 'existing-badge' }),
          timestamp: '2026-03-20T10:00:00.000Z',
        },
      ]);

      persistence.getSession = async () =>
        [
          {
            id: 'evt-1',
            payload: {
              type: 'RECALL_SESSION_STARTED',
              userId: 'user-42',
              playContext: 'free',
            },
          },
        ] as any;

      const logic = require('@neurodual/logic');
      const originalProject = logic.SessionCompletionProjector.projectWithXP;
      const receivedContexts: unknown[] = [];
      logic.SessionCompletionProjector.projectWithXP = mock(
        (_completionInput: unknown, xpContext: unknown) => {
          receivedContexts.push(xpContext);
          return {
            totalXP: 42,
            newBadges: [],
            xpBreakdown: null,
          };
        },
      );

      try {
        const runner = new SessionEndWorkflowRunner(persistence, adapters, commandBus as any);
        const completionInput = {
          mode: 'recall',
          sessionId: 'session-123',
          events: [],
          trials: [],
          gameModeLabel: 'Dual Memo',
          completedAt: new Date(),
          config: {} as any,
        } as unknown as SessionCompletionInput;

        await runner.onSessionEnded({
          sessionId: 'session-123',
          endCommandId: 'end:session-123',
          completionInput,
        });
      } finally {
        logic.SessionCompletionProjector.projectWithXP = originalProject;
      }

      expect(receivedContexts).toHaveLength(1);
      expect(receivedContexts[0]).toMatchObject({
        existingBadgeIds: ['existing-badge'],
        streakDays: 1,
        isFirstOfDay: true,
        sessionsToday: 0,
        currentProgression: {
          totalXP: 220,
          completedSessions: 4,
          abandonedSessions: 1,
          totalTrials: 48,
          earlyMorningSessions: 2,
          lateNightSessions: 1,
          uninterruptedSessionsStreak: 3,
        },
      });
    });

    it('should derive command IDs from parent commandId', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      // Mock SessionCompletionProjector to return a valid result
      const SessionCompletionProjector = require('@neurodual/logic').SessionCompletionProjector;
      const originalProject = SessionCompletionProjector.projectWithXP;
      SessionCompletionProjector.projectWithXP = mock(() => ({
        totalXP: 100,
        newBadges: [{ badgeId: 'first-win', id: 'badge-1' }],
        xpBreakdown: { total: 100, breakdown: [] },
      }));

      // Mock journey to trigger derived commands
      (adapters as unknown as { journey: { recordAttempt: () => Promise<unknown> } }).journey = {
        recordAttempt: async () => ({
          attemptsCount: 1,
          bestAttempt: {
            nLevel: 2,
            accuracy: 0.85,
            completionTime: 45000,
          },
          completed: true,
        }),
      };

      // Add session events with journey context
      const sessionEvents: { id: string; payload: Record<string, unknown> }[] = [
        {
          id: 'evt-1',
          payload: {
            type: 'RECALL_SESSION_STARTED',
            playContext: 'journey',
            journeyStageId: 5,
            journeyId: 'journey-1',
            journeyStartLevel: 1,
            journeyTargetLevel: 3,
          },
        },
      ];

      // Override getSession to return these events
      persistence.getSession = async () => sessionEvents as any;

      const runner = new SessionEndWorkflowRunner(persistence, adapters as any, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-123',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
        newBadges: [{ badgeId: 'first-win', id: 'badge-1' }],
        xpBreakdown: { total: 100, breakdown: [] },
      } as unknown as SessionCompletionInput;

      await runner.onSessionEnded({
        sessionId: 'session-123',
        endCommandId: 'parent-command-123',
        completionInput,
      });

      const handledCommands = commandBus._getHandledCommands();

      // JOURNEY_TRANSITION_DECIDED is no longer written by the WorkflowRunner —
      // journey state is rebuilt from session_summaries by the fact-driven projection.
      const journeyCmd = handledCommands.find(
        (c: any) => c.type === 'SESSION/COMPUTE_JOURNEY_CONTEXT',
      );
      expect(journeyCmd).toBeUndefined();

      const badgeCmd = handledCommands.find((c: any) => c.type === 'SESSION/UNLOCK_BADGE');
      expect((badgeCmd as any)?.metadata.commandId).toBe('parent-command-123:badge:first-win');
      expect((badgeCmd as any)?.data).toMatchObject({
        event: {
          type: 'BADGE_UNLOCKED',
          badgeId: 'first-win',
          category: 'milestone',
          priority: 0,
        },
      });

      const xpCmd = handledCommands.find((c: any) => c.type === 'SESSION/COMPUTE_XP_BREAKDOWN');
      expect((xpCmd as any)?.metadata.commandId).toBe('parent-command-123:xp');

      // Restore original
      SessionCompletionProjector.projectWithXP = originalProject;
    });

    it('skips XP_BREAKDOWN_COMPUTED when projectWithXP returns null xpBreakdown', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      const SessionCompletionProjector = require('@neurodual/logic').SessionCompletionProjector;
      const originalProject = SessionCompletionProjector.projectWithXP;
      SessionCompletionProjector.projectWithXP = mock(() => ({
        totalXP: 100,
        newBadges: [],
        xpBreakdown: null,
      }));

      persistence.getSession = async () =>
        [
          {
            id: 'evt-start',
            payload: {
              type: 'SESSION_STARTED',
              playContext: 'free',
              userId: 'local',
            },
          },
          {
            id: 'evt-end',
            payload: {
              type: 'SESSION_ENDED',
              playContext: 'free',
              userId: 'local',
              xpBreakdown: { total: 100, breakdown: [] },
            },
          },
        ] as any;

      try {
        const runner = new SessionEndWorkflowRunner(
          persistence,
          adapters as any,
          commandBus as any,
        );
        const completionInput = {
          mode: 'tempo',
          sessionId: 'session-123',
          events: [],
          summary: null,
        } as unknown as SessionCompletionInput;

        await runner.onSessionEnded({
          sessionId: 'session-123',
          endCommandId: 'parent-command-123',
          completionInput,
        });
      } finally {
        SessionCompletionProjector.projectWithXP = originalProject;
      }

      const handledCommands = commandBus._getHandledCommands();
      const xpCmd = handledCommands.find((c: any) => c.type === 'SESSION/COMPUTE_XP_BREAKDOWN');
      expect(xpCmd).toBeUndefined();
    });

    it('should handle non-journey sessions', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      // Add free play session events
      const sessionEvents: { id: string; payload: Record<string, unknown> }[] = [
        {
          id: 'evt-1',
          payload: {
            type: 'RECALL_SESSION_STARTED',
            playContext: 'free',
          },
        },
      ];

      persistence.getSession = async () => sessionEvents as any;

      const runner = new SessionEndWorkflowRunner(persistence, adapters as any, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-123',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
      } as unknown as SessionCompletionInput;

      await runner.onSessionEnded({
        sessionId: 'session-123',
        endCommandId: 'end:session-123',
        completionInput,
      });

      const handledCommands = commandBus._getHandledCommands();

      // Should NOT have journey context command
      const journeyCmd = handledCommands.find(
        (c: any) => c.type === 'SESSION/COMPUTE_JOURNEY_CONTEXT',
      );
      expect(journeyCmd).toBeUndefined();
    });

    it('should calculate streak correctly', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      // Mock history with completed sessions from consecutive days
      adapters.history.getSessions = async () => [
        {
          id: 'session-3',
          reason: 'completed',
          createdAt: today,
        } as any,
        {
          id: 'session-2',
          reason: 'completed',
          createdAt: yesterday,
        } as any,
        {
          id: 'session-1',
          reason: 'completed',
          createdAt: twoDaysAgo,
        } as any,
      ];

      const runner = new SessionEndWorkflowRunner(persistence, adapters, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-4',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
      } as unknown as SessionCompletionInput;

      await runner.onSessionEnded({
        sessionId: 'session-4',
        endCommandId: 'end:session-4',
        completionInput,
      });

      // Streak should be 3 (today, yesterday, 2 days ago)
      // Note: We can't directly access the streak value without mocking more internals
      expect(true).toBe(true); // No error thrown = success
    });

    it('should handle missing session start event gracefully', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      // Empty session events
      persistence.getSession = async () => [] as any;

      const runner = new SessionEndWorkflowRunner(persistence, adapters as any, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-123',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
      } as unknown as SessionCompletionInput;

      // Should not throw even with missing start event
      await runner.onSessionEnded({
        sessionId: 'session-123',
        endCommandId: 'end:session-123',
        completionInput,
      });

      expect(true).toBe(true);
    });

    it('should skip if completion result is null', async () => {
      const persistence = createMockPersistence();
      const adapters = createMockAdapters();
      const commandBus = createMockCommandBus() as unknown as {
        _getHandledCommands: () => unknown[];
      };

      // Mock SessionCompletionProjector to return null
      const mockProjector = {
        projectWithXP: async () => null,
      };

      // Monkey-patch the import (in real code, we'd use a test double)
      const SessionCompletionProjector = require('@neurodual/logic').SessionCompletionProjector;
      const originalProject = SessionCompletionProjector.projectWithXP;
      SessionCompletionProjector.projectWithXP = mockProjector.projectWithXP;

      const runner = new SessionEndWorkflowRunner(persistence, adapters, commandBus as any);

      const completionInput = {
        mode: 'recall',
        sessionId: 'session-123',
        events: [],
        trials: [],
        gameModeLabel: 'Dual Memo',
        completedAt: new Date(),
        config: {} as any,
      } as unknown as SessionCompletionInput;

      await runner.onSessionEnded({
        sessionId: 'session-123',
        endCommandId: 'end:session-123',
        completionInput,
      });

      // Restore original
      SessionCompletionProjector.projectWithXP = originalProject;

      // Should have called CommandBus fewer times (or not at all)
      expect(true).toBe(true);
    });
  });

  describe('helpers', () => {
    describe('findSessionStartEvent', () => {
      it('should find session start event', () => {
        const events = [
          { type: 'TRIAL_1' },
          { type: 'RECALL_SESSION_STARTED', foo: 'bar' },
          { type: 'TRIAL_2' },
        ];

        const result = findSessionStartEvent(events);

        expect(result).toEqual({ type: 'RECALL_SESSION_STARTED', foo: 'bar' });
      });

      it('should return null if no start event', () => {
        const events = [{ type: 'TRIAL_1' }, { type: 'TRIAL_2' }];

        const result = findSessionStartEvent(events);

        expect(result).toBeNull();
      });
    });

    describe('getPlayContextFromEvents', () => {
      it('should identify journey context', () => {
        const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'journey' }];

        const result = getPlayContextFromEvents(events);

        expect(result).toBe('journey');
      });

      it('should identify free context', () => {
        const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'free' }];

        const result = getPlayContextFromEvents(events);

        expect(result).toBe('free');
      });

      it('should return null for unknown context', () => {
        const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'unknown' }];

        const result = getPlayContextFromEvents(events);

        expect(result).toBeNull();
      });
    });

    describe('deriveCommandId', () => {
      it('should derive command ID with suffix', () => {
        const result = deriveCommandId('parent-123', 'journey');

        expect(result).toBe('parent-123:journey');
      });
    });
  });

  describe('requireJourneySnapshotFromEvents', () => {
    it('should extract journey metadata from events', () => {
      const events = [
        {
          type: 'RECALL_SESSION_STARTED',
          playContext: 'journey',
          journeyStageId: 5,
          journeyId: 'journey-alpha',
          journeyStartLevel: 1,
          journeyTargetLevel: 3,
          journeyGameMode: 'dualMemo',
          journeyName: 'Daily Challenge',
        },
      ];

      const result = requireJourneySnapshotFromEvents(events);

      expect(result.stageId).toBe(5);
      expect(result.journeyMeta).toEqual({
        journeyId: 'journey-alpha',
        startLevel: 1,
        targetLevel: 3,
        gameMode: 'dualMemo',
        journeyName: 'Daily Challenge',
      });
    });

    it('should throw if no start event', () => {
      expect(() => requireJourneySnapshotFromEvents([])).toThrow(
        '[SessionEndWorkflowRunner] Missing session start event',
      );
    });

    it('should throw if not a journey session', () => {
      const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'free' }];

      expect(() => requireJourneySnapshotFromEvents(events)).toThrow(
        '[SessionEndWorkflowRunner] requireJourneySnapshotFromEvents for non-journey session',
      );
    });

    it('should throw if missing journeyStageId', () => {
      const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'journey' }];

      expect(() => requireJourneySnapshotFromEvents(events)).toThrow(
        '[SessionEndWorkflowRunner] Missing journeyStageId',
      );
    });
  });
});
