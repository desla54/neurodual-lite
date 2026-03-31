/**
 * SessionEndPipelineMachine (XState v5)
 *
 * **UI-side orchestrator** for end-of-session side effects.
 * Sequences stages and updates React state (progress, journey context, errors).
 *
 * This machine does NOT own persistence of derived events. The sole writer
 * is `SessionEndWorkflowRunner`, which runs as a CommandBus postCommit hook
 * during the `persist_events` stage. The `record_journey` stage computes
 * JourneyContext on-the-fly from session events and recordJourneyAttempt,
 * rather than reading a persisted JOURNEY_TRANSITION_DECIDED event.
 *
 * States:
 * - idle → persist_events (START event)
 * - persist_events → project_summary (success) | error (failure)
 * - project_summary → record_journey (success) | save_badges (skip journey)
 * - record_journey → save_badges (success) | error (failure)
 * - save_badges → sync_cloud (success) | skip (no sync)
 * - sync_cloud → done (success) | error (if online+enabled and sync fails)
 * - error → persist_events (START event) | failed stage (RETRY event) | idle (CANCEL event)
 */

import { setup, assign, fromPromise, createActor, type SnapshotFrom } from 'xstate';
import type {
  AttemptResult,
  BadgeHistorySnapshot,
  JourneyContext,
  JourneyMeta,
  SessionCompletionInput,
  SessionEndPipelinePort,
  SessionEndPipelineInput,
  PipelineState,
  PipelineStage,
  PersistedPipelineState,
  SessionCompletionWithXPResult,
  XPContextInput,
  SessionHistoryItem,
  UnlockedBadge,
} from '@neurodual/logic';
import {
  SESSION_START_EVENT_TYPES,
  SessionCompletionProjector,
  projectProgressionFromSessions,
  UserProgression,
  calculatePipelineProgress,
  journeyTransitionRecordToContext,
  buildJourneyTransitionRecord,
} from '@neurodual/logic';
import { pipelineLog } from '../logger';
import { requireJourneySnapshotFromEvents } from '../es-emmett/session-event-utils';

// =============================================================================
// Types
// =============================================================================

interface PipelineContext {
  // Input
  input: SessionEndPipelineInput | null;
  sessionId: string | null;

  // Progress tracking
  currentStage: PipelineStage;
  retryCount: number;
  maxRetries: number;

  // Results (accumulated during pipeline)
  completionResult: SessionCompletionWithXPResult | null;
  leveledUp: boolean;
  newLevel: number;

  // Error tracking
  error: Error | null;
  lastCompletedStage: PipelineStage;

  // Dependencies (injected)
  deps: PipelineDependencies;
}

type PipelineEvent =
  | { type: 'START'; input: SessionEndPipelineInput }
  | { type: 'RETRY' }
  | { type: 'CANCEL' };

interface PipelineInput {
  deps: PipelineDependencies;
  maxRetries?: number;
}

/**
 * Dependencies injected into the pipeline.
 * Allows testing and decoupling from concrete adapters.
 */
export interface PipelineDependencies {
  // Persistence
  persistEvents: (sessionId: string, events: readonly unknown[]) => Promise<void>;

  /**
   * Optional: load raw session events for recovery rehydration.
   * Used when pipeline recovery state intentionally omits events to keep storage fast.
   */
  getSessionEvents?: (sessionId: string) => Promise<readonly unknown[]>;

  // Progression (read-only: progression is computed from session_summaries, not saved manually)
  getProgression: () => Promise<{
    totalXP: number;
    completedSessions: number;
    abandonedSessions: number;
    totalTrials: number;
    firstSessionAt: Date | null;
    earlyMorningSessions: number;
    lateNightSessions: number;
    comebackCount: number;
    persistentDays: number;
    plateausBroken: number;
    uninterruptedSessionsStreak: number;
  } | null>;
  getBadges: () => Promise<UnlockedBadge[]>;
  getBadgeHistory?: () => Promise<BadgeHistorySnapshot | null>;

  // History
  getSessions?: () => Promise<SessionHistoryItem[]>;

  // Journey (optional)
  recordJourneyAttempt?: (
    stageId: number,
    result: SessionCompletionWithXPResult,
    journeyMeta: JourneyMeta,
  ) => Promise<AttemptResult | null>;

  // Cloud sync (optional)
  syncToCloud?: (sessionId: string) => Promise<void>;

  // Recovery persistence
  saveRecoveryState: (state: PersistedPipelineState) => Promise<void>;
  loadRecoveryState: () => Promise<PersistedPipelineState | null>;
  clearRecoveryState: () => Promise<void>;

  // Rewards
  checkAndGrantRewards?: (level: number) => Promise<void>;

  /**
   * Eagerly project session_summaries row so the read model is fresh
   * when the UI navigates home (avoids stale journey strikes).
   */
  ensureSummaryProjected?: (sessionId: string) => Promise<void>;
  /** Eagerly project cognitive_profile_projection for profile/calibration sessions. */
  ensureProfileProjected?: (input: SessionCompletionInput) => Promise<void>;
}

function sanitizePipelineInputForRecovery(input: SessionEndPipelineInput): SessionEndPipelineInput {
  // Storing full `events` arrays (which often contain large nested objects like ModeSpec)
  // can make JSON.stringify + localStorage writes take seconds.
  // Events are already persisted upstream via eventStore; for recovery we can rehydrate
  // from DB using deps.getSessionEvents().
  const completionInput = input.completionInput as unknown as Record<string, unknown>;

  if (!completionInput || typeof completionInput !== 'object') return input;
  if (!('events' in completionInput)) return input;

  return {
    ...input,
    completionInput: {
      ...completionInput,
      events: [],
    } as unknown as SessionEndPipelineInput['completionInput'],
  };
}

// =============================================================================
// Result type from projectSummary actor
// =============================================================================

interface ProjectSummaryResult {
  result: SessionCompletionWithXPResult;
  leveledUp: boolean;
  newLevel: number;
  updatedProgression: unknown;
}

const PERSIST_EVENTS_TIMEOUT_MS = 15000;
const ENSURE_SUMMARY_PROJECTED_TIMEOUT_MS = 10000;
const ENSURE_PROFILE_PROJECTED_TIMEOUT_MS = 10000;
const PROJECT_SUMMARY_DEP_TIMEOUT_MS = 3000;

// SESSION_START_EVENT_TYPES imported from @neurodual/logic

function findSessionStartEvent(events: readonly unknown[]): Record<string, unknown> | null {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (typeof e !== 'object' || e === null) continue;
    const t = (e as Record<string, unknown>)['type'];
    if (typeof t === 'string' && SESSION_START_EVENT_TYPES.has(t)) {
      return e as Record<string, unknown>;
    }
  }
  return null;
}

function getPlayContextFromEvents(
  events: readonly unknown[],
): 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' | null {
  const start = findSessionStartEvent(events);
  const value = start?.['playContext'];
  return value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
    ? value
    : null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function loadProjectSummaryDependency<T>(params: {
  sessionId: string;
  label: string;
  load: () => Promise<T>;
  fallback: T;
}): Promise<T> {
  const { sessionId, label, load, fallback } = params;
  const startedAt = performance.now();
  try {
    const value = await withTimeout(
      load(),
      PROJECT_SUMMARY_DEP_TIMEOUT_MS,
      `[Pipeline] project_summary ${label} timeout after ${PROJECT_SUMMARY_DEP_TIMEOUT_MS}ms (session=${sessionId})`,
    );
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs > 25) {
      pipelineLog.warn(
        `[Pipeline TIMING] project_summary ${label} slow: ${Math.round(elapsedMs)}ms (session=${sessionId})`,
      );
    }
    return value;
  } catch (error) {
    pipelineLog.warn(
      `[Pipeline] project_summary ${label} failed, using fallback (session=${sessionId})`,
      error,
    );
    return fallback;
  }
}

// =============================================================================
// XState Machine Definition
// =============================================================================

export const pipelineMachine = setup({
  types: {
    context: {} as PipelineContext,
    events: {} as PipelineEvent,
    input: {} as PipelineInput,
  },

  actions: {
    logTransition: (_, params: { from: string; to: string }) => {
      pipelineLog.info(`${params.from} → ${params.to}`);
    },

    setInput: assign(({ event }) => {
      if (event.type !== 'START') return {};
      return {
        input: event.input,
        sessionId: event.input.completionInput.sessionId,
      };
    }),

    setStage: assign((_, params: { stage: PipelineStage }) => ({
      currentStage: params.stage,
    })),

    setResult: assign((_, params: { result: SessionCompletionWithXPResult }) => ({
      completionResult: params.result,
    })),

    setJourneyContext: assign(({ context }, params: { journeyContext: JourneyContext }) => {
      const completionResult = context.completionResult;
      if (!completionResult) return {};

      return {
        completionResult: {
          ...completionResult,
          journeyContext: params.journeyContext,
          report: {
            ...completionResult.report,
            journeyContext: params.journeyContext,
            nextStep: undefined,
          },
        },
      };
    }),

    setLevelInfo: assign((_, params: { leveledUp: boolean; newLevel: number }) => ({
      leveledUp: params.leveledUp,
      newLevel: params.newLevel,
    })),

    captureError: assign(({ event }) => {
      // Extract error from XState error event
      const errorEvent = event as unknown as { error: unknown };
      const error =
        errorEvent.error instanceof Error ? errorEvent.error : new Error(String(errorEvent.error));
      return {
        error,
        currentStage: 'error' as PipelineStage,
      };
    }),

    clearError: assign(() => ({
      error: null,
    })),

    incrementRetry: assign(({ context }) => ({
      retryCount: context.retryCount + 1,
    })),

    resetRetry: assign(() => ({
      retryCount: 0,
    })),

    markStageComplete: assign(({ context }) => ({
      lastCompletedStage: context.currentStage,
    })),

    resetPipeline: assign(() => ({
      input: null,
      sessionId: null,
      currentStage: 'idle' as PipelineStage,
      retryCount: 0,
      completionResult: null,
      leveledUp: false,
      newLevel: 1,
      error: null,
      lastCompletedStage: 'idle' as PipelineStage,
    })),

    warnMaxRetries: () => {
      pipelineLog.warn('Max retries reached');
    },
  },

  guards: {
    hasJourney: ({ context }) => {
      const input = context.input;
      if (!input || context.deps.recordJourneyAttempt === undefined) return false;
      const completionInput = input.completionInput as unknown as { events?: readonly unknown[] };
      const events = Array.isArray(completionInput.events) ? completionInput.events : [];
      return getPlayContextFromEvents(events) === 'journey';
    },
    hasSync: ({ context }) =>
      context.input?.syncEnabled === true && context.deps.syncToCloud !== undefined,
    canRetry: ({ context }) => context.retryCount < context.maxRetries,
    canRetryAtStage: ({ context }, params: { stage: PipelineStage }) =>
      context.retryCount < context.maxRetries && context.currentStage === params.stage,
  },

  actors: {
    // =========================================================================
    // Stage 1: Persist Events
    // =========================================================================
    persistEvents: fromPromise(async ({ input }: { input: PipelineContext }) => {
      if (!input.input) throw new Error('No input');

      const { completionInput } = input.input;
      const t0 = performance.now();

      // Extract events from completion input (mode-specific)
      let events: readonly unknown[] = [];
      if ('events' in completionInput) {
        events = completionInput.events as readonly unknown[];
      }

      pipelineLog.debug(
        `[Pipeline] Persisting ${events.length} events for ${completionInput.sessionId}`,
      );

      // Skip if no events (some modes like Trace don't have events array)
      if (events.length > 0) {
        await withTimeout(
          input.deps.persistEvents(completionInput.sessionId, events),
          PERSIST_EVENTS_TIMEOUT_MS,
          `[Pipeline] persist_events timeout after ${PERSIST_EVENTS_TIMEOUT_MS}ms (session=${completionInput.sessionId}, events=${events.length})`,
        );
      }

      // Save recovery state
      const sanitizedInput = input.deps.getSessionEvents
        ? sanitizePipelineInputForRecovery(input.input)
        : input.input;
      await input.deps.saveRecoveryState({
        sessionId: completionInput.sessionId,
        lastCompletedStage: 'persist_events',
        input: sanitizedInput,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Ensure the session_summaries row exists before the report reads progression/stats.
      // On fresh Android installs, the local-only table can materialize slightly later.
      const ensureSummaryProjected = input.deps.ensureSummaryProjected;
      if (ensureSummaryProjected) {
        const ensureStart = performance.now();
        pipelineLog.info(
          `[Pipeline] ensureSummaryProjected: projecting summary for ${completionInput.sessionId}`,
        );
        await withTimeout(
          ensureSummaryProjected(completionInput.sessionId),
          ENSURE_SUMMARY_PROJECTED_TIMEOUT_MS,
          `[Pipeline] ensureSummaryProjected timeout after ${ENSURE_SUMMARY_PROJECTED_TIMEOUT_MS}ms (session=${completionInput.sessionId})`,
        );
        const ensureMs = performance.now() - ensureStart;
        pipelineLog.info(
          `[Pipeline] ensureSummaryProjected: done for ${completionInput.sessionId} (${Math.round(ensureMs)}ms)`,
        );
      }

      const ensureProfileProjected = input.deps.ensureProfileProjected;
      if (ensureProfileProjected) {
        const ensureStart = performance.now();
        await withTimeout(
          ensureProfileProjected(completionInput),
          ENSURE_PROFILE_PROJECTED_TIMEOUT_MS,
          `[Pipeline] ensureProfileProjected timeout after ${ENSURE_PROFILE_PROJECTED_TIMEOUT_MS}ms (session=${completionInput.sessionId})`,
        );
        const ensureMs = performance.now() - ensureStart;
        pipelineLog.info(
          `[Pipeline] ensureProfileProjected: done for ${completionInput.sessionId} (${Math.round(ensureMs)}ms)`,
        );
      }

      const totalMs = performance.now() - t0;
      if (totalMs > 25) {
        pipelineLog.warn(
          `[Pipeline TIMING] persist_events slow: ${Math.round(totalMs)}ms (session=${completionInput.sessionId})`,
        );
      }

      return true;
    }),

    // =========================================================================
    // Stage 2: Project Summary (Pure)
    // =========================================================================
    projectSummary: fromPromise(
      async ({ input }: { input: PipelineContext }): Promise<ProjectSummaryResult> => {
        if (!input.input) throw new Error('No input');

        const { completionInput } = input.input;
        const skipHeavyXpReads = completionInput.mode === 'track';
        const timings: Record<string, number> = {};
        let stepStart = performance.now();

        pipelineLog.debug(`[Pipeline] Projecting summary for ${completionInput.sessionId}`);
        pipelineLog.debug('[Pipeline TIMING] Starting projectSummary...');

        // Load XP context
        stepStart = performance.now();
        const progressionPromise = skipHeavyXpReads
          ? Promise.resolve(null)
          : loadProjectSummaryDependency({
              sessionId: completionInput.sessionId,
              label: 'getProgression',
              load: () => input.deps.getProgression(),
              fallback: null,
            });
        const existingBadgesPromise = skipHeavyXpReads
          ? Promise.resolve([] as UnlockedBadge[])
          : loadProjectSummaryDependency({
              sessionId: completionInput.sessionId,
              label: 'getBadges',
              load: () => input.deps.getBadges(),
              fallback: [] as UnlockedBadge[],
            });
        const badgeHistoryPromise = skipHeavyXpReads
          ? Promise.resolve(null)
          : loadProjectSummaryDependency({
              sessionId: completionInput.sessionId,
              label: 'getBadgeHistory',
              load: () =>
                input.deps.getBadgeHistory ? input.deps.getBadgeHistory() : Promise.resolve(null),
              fallback: null,
            });
        const sessionsPromise =
          skipHeavyXpReads || !input.deps.getSessions
            ? Promise.resolve([] as SessionHistoryItem[])
            : loadProjectSummaryDependency({
                sessionId: completionInput.sessionId,
                label: 'getSessions',
                load: () => input.deps.getSessions?.() ?? Promise.resolve([]),
                fallback: [] as SessionHistoryItem[],
              });
        const [progressionData, existingBadges, badgeHistory] = await Promise.all([
          progressionPromise,
          existingBadgesPromise,
          badgeHistoryPromise,
        ]);
        timings['1_loadData'] = performance.now() - stepStart;
        pipelineLog.debug(`[Pipeline TIMING] 1_loadData: ${timings['1_loadData'].toFixed(0)}ms`);

        stepStart = performance.now();
        let completedSessions: SessionHistoryItem[] = [];
        let progressionBeforeSession = progressionData;
        let streakDays = 1;
        let isFirstOfDay = true;
        let sessionsToday = 0;

        if (badgeHistory) {
          streakDays = Math.max(1, badgeHistory.currentStreak);
          sessionsToday = Math.max(0, badgeHistory.sessionsToday);
          isFirstOfDay = sessionsToday === 0;
        } else if (input.deps.getSessions && !skipHeavyXpReads) {
          const sessions = await sessionsPromise;
          const sessionsBeforeCurrent = sessions.filter((s) => s.id !== completionInput.sessionId);
          completedSessions = sessionsBeforeCurrent.filter((s) => s.reason === 'completed');
          const hasCurrentSessionAlreadyProjected =
            sessionsBeforeCurrent.length !== sessions.length;
          progressionBeforeSession =
            progressionData && !hasCurrentSessionAlreadyProjected
              ? progressionData
              : projectProgressionFromSessions(sessionsBeforeCurrent);
          // Streak computation moved to UnifiedProjectionManager
          // For XP context, use 1 as default (first session of a potential streak)
          streakDays = 1;
          isFirstOfDay = isFirstSessionOfDay(completedSessions);
          sessionsToday = countSessionsToday(completedSessions);
        }
        timings['2_filterSessions'] = performance.now() - stepStart;
        pipelineLog.debug(
          `[Pipeline TIMING] 2_prepareContext: ${timings['2_filterSessions'].toFixed(0)}ms (${completedSessions.length} completed fallback)`,
        );

        // Build XP context (same logic as useSessionCompletion)
        stepStart = performance.now();
        const xpContext: XPContextInput = {
          streakDays,
          isFirstOfDay,
          sessionsToday,
          existingBadgeIds: existingBadges.map((b) => b.badgeId),
          badgeHistory: badgeHistory
            ? {
                currentStreak: badgeHistory.currentStreak,
                bestStreak: badgeHistory.bestStreak,
                earlyMorningDays: badgeHistory.earlyMorningDays,
                lateNightDays: badgeHistory.lateNightDays,
                maxNLevel: badgeHistory.maxNLevel,
                bestDPrime: badgeHistory.bestDPrime,
                daysSinceLastSession: badgeHistory.daysSinceLastSession,
              }
            : undefined,
          sessionHistory: completedSessions.length > 0 ? completedSessions : undefined,
          currentProgression: progressionBeforeSession
            ? {
                totalXP: progressionBeforeSession.totalXP,
                completedSessions: progressionBeforeSession.completedSessions,
                abandonedSessions: progressionBeforeSession.abandonedSessions,
                totalTrials: progressionBeforeSession.totalTrials,
                firstSessionAt: progressionBeforeSession.firstSessionAt,
                earlyMorningSessions: progressionBeforeSession.earlyMorningSessions,
                lateNightSessions: progressionBeforeSession.lateNightSessions,
                comebackCount: progressionBeforeSession.comebackCount,
                persistentDays: progressionBeforeSession.persistentDays,
                plateausBroken: progressionBeforeSession.plateausBroken,
                uninterruptedSessionsStreak:
                  progressionBeforeSession.uninterruptedSessionsStreak ?? 0,
              }
            : undefined,
        };
        timings['3_buildXPContext'] = performance.now() - stepStart;
        pipelineLog.debug(
          `[Pipeline TIMING] 3_buildXPContext: ${timings['3_buildXPContext'].toFixed(0)}ms`,
        );

        // Project result (PURE)
        stepStart = performance.now();
        const result = SessionCompletionProjector.projectWithXP(completionInput, xpContext);
        timings['4_projectWithXP'] = performance.now() - stepStart;
        pipelineLog.debug(
          `[Pipeline TIMING] 4_projectWithXP: ${timings['4_projectWithXP'].toFixed(0)}ms`,
        );

        if (!result) {
          throw new Error('Failed to project session completion');
        }

        // Calculate level info
        stepStart = performance.now();
        const progressionBase = progressionBeforeSession ?? {
          totalXP: 0,
          completedSessions: 0,
          abandonedSessions: 0,
          totalTrials: 0,
          firstSessionAt: null,
          earlyMorningSessions: 0,
          lateNightSessions: 0,
          comebackCount: 0,
          persistentDays: 0,
          plateausBroken: 0,
          uninterruptedSessionsStreak: 0,
        };
        const previousLevel = progressionBeforeSession
          ? UserProgression.fromRecord(
              {
                ...progressionBase,
                uninterruptedSessionsStreak: progressionBase.uninterruptedSessionsStreak ?? 0,
              },
              existingBadges,
            ).level
          : 1;
        timings['5_calculateLevel'] = performance.now() - stepStart;
        pipelineLog.debug(
          `[Pipeline TIMING] 5_calculateLevel: ${timings['5_calculateLevel'].toFixed(0)}ms`,
        );

        const hour = new Date().getHours();
        const isEarlyMorning = hour >= 5 && hour < 7;
        const isLateNight = hour >= 23 || hour < 5;

        const updatedProgression = {
          totalXP: progressionBase.totalXP + result.xpBreakdown.total,
          completedSessions: progressionBase.completedSessions + 1,
          abandonedSessions: progressionBase.abandonedSessions,
          totalTrials: progressionBase.totalTrials + result.summary.totalTrials,
          firstSessionAt: progressionBase.firstSessionAt ?? new Date(),
          earlyMorningSessions: progressionBase.earlyMorningSessions + (isEarlyMorning ? 1 : 0),
          lateNightSessions: progressionBase.lateNightSessions + (isLateNight ? 1 : 0),
          comebackCount: progressionBase.comebackCount,
          persistentDays: xpContext.streakDays,
          plateausBroken: progressionBase.plateausBroken,
          uninterruptedSessionsStreak: progressionBase.uninterruptedSessionsStreak ?? 0,
        };

        stepStart = performance.now();
        const newLevel = UserProgression.fromRecord(updatedProgression, existingBadges).level;
        const leveledUp = newLevel > previousLevel;
        timings['6_newLevel'] = performance.now() - stepStart;
        pipelineLog.debug(`[Pipeline TIMING] 6_newLevel: ${timings['6_newLevel'].toFixed(0)}ms`);

        // Update recovery state
        const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);
        pipelineLog.debug(
          `[Pipeline TIMING] TOTAL projectSummary: ${totalTime.toFixed(0)}ms`,
          timings,
        );

        return { result, leveledUp, newLevel, updatedProgression };
      },
    ),

    // =========================================================================
    // Stage 4: Save Badges (via Event Sourcing)
    // =========================================================================
    saveBadges: fromPromise(async ({ input }: { input: PipelineContext }) => {
      if (!input.completionResult) throw new Error('No completion result');
      if (!input.sessionId) throw new Error('No session ID');

      const sessionId = input.sessionId;
      const newBadges = input.completionResult.newBadges;
      pipelineLog.debug(
        `[Pipeline] Emitting ${newBadges.length} BADGE_UNLOCKED events for ${sessionId}`,
      );

      // Create BADGE_UNLOCKED events for each new badge
      const badgeEvents = newBadges.map((badge) => ({
        type: 'BADGE_UNLOCKED' as const,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId,
        schemaVersion: 1 as const,
        badgeId: badge.id,
        category: badge.category,
        priority: badge.priority ?? 0,
      }));

      // Persist badge events (same idempotent pattern as session events)
      if (badgeEvents.length > 0) {
        await input.deps.persistEvents(input.sessionId, badgeEvents);
      }

      // Grant rewards if leveled up
      if (input.leveledUp && input.deps.checkAndGrantRewards) {
        await input.deps.checkAndGrantRewards(input.newLevel);
      }

      return true;
    }),

    // =========================================================================
    // Stage 3: Record Journey (computes journey context from session events)
    // =========================================================================
    recordJourney: fromPromise(async ({ input }: { input: PipelineContext }) => {
      if (!input.input) throw new Error('No input');
      if (!input.sessionId) throw new Error('No sessionId');
      if (!input.completionResult) throw new Error('No completionResult');

      const completionInput = input.input.completionInput as unknown as {
        events?: readonly unknown[];
      };
      const events = Array.isArray(completionInput.events) ? completionInput.events : [];
      const playContext = getPlayContextFromEvents(events);
      if (playContext !== 'journey') {
        return null; // Skip
      }

      pipelineLog.debug(`[Pipeline] Computing journey context for session ${input.sessionId}`);

      const { stageId, journeyMeta } = requireJourneySnapshotFromEvents(events);

      if (!input.deps.recordJourneyAttempt) {
        pipelineLog.debug(`[Pipeline] No recordJourneyAttempt dep, skipping journey`);
        return null;
      }

      const attempt = await input.deps.recordJourneyAttempt(
        stageId,
        input.completionResult,
        journeyMeta,
      );
      if (!attempt) return null;

      const journeyTransition = buildJourneyTransitionRecord({
        stageId,
        journeyMeta,
        attempt,
      });
      if (!journeyTransition) return null;

      return journeyTransitionRecordToContext(
        journeyTransition as unknown as Parameters<typeof journeyTransitionRecordToContext>[0],
      );
    }),

    // =========================================================================
    // Stage 6: Sync Cloud (fire-and-forget)
    // =========================================================================
    syncCloud: fromPromise(async ({ input }: { input: PipelineContext }) => {
      if (!input.input?.syncEnabled || !input.deps.syncToCloud) {
        return true; // Skip
      }

      pipelineLog.debug(`[Pipeline] Syncing to cloud for ${input.sessionId}`);

      if (!input.sessionId) {
        throw new Error('No sessionId for syncCloud stage');
      }
      await input.deps.syncToCloud(input.sessionId);

      return true;
    }),

    // =========================================================================
    // Cleanup
    // =========================================================================
    cleanup: fromPromise(async ({ input }: { input: PipelineContext }) => {
      pipelineLog.info(`[Pipeline] Cleaning up recovery state for ${input.sessionId}`);
      await input.deps.clearRecoveryState();
      return true;
    }),
  },
}).createMachine({
  id: 'sessionEndPipeline',
  initial: 'idle',
  context: ({ input }) => ({
    input: null,
    sessionId: null,
    currentStage: 'idle' as PipelineStage,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    completionResult: null,
    leveledUp: false,
    newLevel: 1,
    error: null,
    lastCompletedStage: 'idle' as PipelineStage,
    deps: input.deps,
  }),

  states: {
    // =========================================================================
    // IDLE - Waiting for START
    // =========================================================================
    idle: {
      on: {
        START: {
          target: 'persist_events',
          actions: [
            { type: 'logTransition', params: { from: 'idle', to: 'persist_events' } },
            'setInput',
            { type: 'setStage', params: { stage: 'persist_events' as PipelineStage } },
            'resetRetry',
          ],
        },
      },
    },

    // =========================================================================
    // PERSIST_EVENTS
    // =========================================================================
    persist_events: {
      invoke: {
        id: 'persistEvents',
        src: 'persistEvents',
        input: ({ context }) => context,
        onDone: {
          target: 'project_summary',
          actions: [
            { type: 'logTransition', params: { from: 'persist_events', to: 'project_summary' } },
            'markStageComplete',
            { type: 'setStage', params: { stage: 'project_summary' as PipelineStage } },
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'persist_events', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // PROJECT_SUMMARY
    // =========================================================================
    project_summary: {
      invoke: {
        id: 'projectSummary',
        src: 'projectSummary',
        input: ({ context }) => context,
        onDone: [
          {
            guard: 'hasJourney',
            target: 'record_journey',
            actions: [
              { type: 'logTransition', params: { from: 'project_summary', to: 'record_journey' } },
              'markStageComplete',
              { type: 'setStage', params: { stage: 'record_journey' as PipelineStage } },
              {
                type: 'setResult',
                params: ({ event }) => ({ result: (event.output as ProjectSummaryResult).result }),
              },
              {
                type: 'setLevelInfo',
                params: ({ event }) => {
                  const output = event.output as ProjectSummaryResult;
                  return {
                    leveledUp: output.leveledUp,
                    newLevel: output.newLevel,
                  };
                },
              },
            ],
          },
          {
            target: 'save_badges',
            actions: [
              { type: 'logTransition', params: { from: 'project_summary', to: 'save_badges' } },
              'markStageComplete',
              { type: 'setStage', params: { stage: 'save_badges' as PipelineStage } },
              {
                type: 'setResult',
                params: ({ event }) => ({ result: (event.output as ProjectSummaryResult).result }),
              },
              {
                type: 'setLevelInfo',
                params: ({ event }) => {
                  const output = event.output as ProjectSummaryResult;
                  return {
                    leveledUp: output.leveledUp,
                    newLevel: output.newLevel,
                  };
                },
              },
            ],
          },
        ],
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'project_summary', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // SAVE_BADGES
    // =========================================================================
    save_badges: {
      invoke: {
        id: 'saveBadges',
        src: 'saveBadges',
        input: ({ context }) => context,
        onDone: [
          {
            guard: 'hasSync',
            target: 'sync_cloud',
            actions: [
              { type: 'logTransition', params: { from: 'save_badges', to: 'sync_cloud' } },
              'markStageComplete',
              { type: 'setStage', params: { stage: 'sync_cloud' as PipelineStage } },
            ],
          },
          {
            target: 'cleanup',
            actions: [
              { type: 'logTransition', params: { from: 'save_badges', to: 'cleanup' } },
              'markStageComplete',
            ],
          },
        ],
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'save_badges', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // RECORD_JOURNEY
    // =========================================================================
    record_journey: {
      invoke: {
        id: 'recordJourney',
        src: 'recordJourney',
        input: ({ context }) => context,
        onDone: {
          target: 'save_badges',
          actions: [
            { type: 'logTransition', params: { from: 'record_journey', to: 'save_badges' } },
            'markStageComplete',
            { type: 'setStage', params: { stage: 'save_badges' as PipelineStage } },
            {
              type: 'setJourneyContext',
              params: ({ event }) => {
                const journeyContext = (event.output as JourneyContext | null) ?? null;
                if (!journeyContext) {
                  throw new Error('[Pipeline] recordJourney completed without JourneyContext');
                }
                return { journeyContext };
              },
            },
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'record_journey', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // SYNC_CLOUD
    // =========================================================================
    sync_cloud: {
      invoke: {
        id: 'syncCloud',
        src: 'syncCloud',
        input: ({ context }) => context,
        onDone: {
          target: 'cleanup',
          actions: [
            { type: 'logTransition', params: { from: 'sync_cloud', to: 'cleanup' } },
            'markStageComplete',
          ],
        },
        onError: {
          // Cloud sync is blocking when enabled (offline -> syncToCloud should no-op/queue).
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'sync_cloud', to: 'error' } },
            'captureError',
          ],
        },
      },
    },

    // =========================================================================
    // CLEANUP - Clear recovery state
    // =========================================================================
    cleanup: {
      invoke: {
        id: 'cleanup',
        src: 'cleanup',
        input: ({ context }) => context,
        onDone: {
          target: 'done',
          actions: [
            { type: 'logTransition', params: { from: 'cleanup', to: 'done' } },
            { type: 'setStage', params: { stage: 'done' as PipelineStage } },
          ],
        },
        onError: {
          // Cleanup errors are non-blocking
          target: 'done',
          actions: [
            { type: 'logTransition', params: { from: 'cleanup', to: 'done (cleanup failed)' } },
          ],
        },
      },
    },

    // =========================================================================
    // DONE - Pipeline completed successfully
    // Actor stays alive to handle new sessions (singleton pattern)
    // =========================================================================
    done: {
      // NOT final - actor must stay alive for next session
      on: {
        START: {
          target: 'persist_events',
          actions: [
            'resetPipeline',
            { type: 'logTransition', params: { from: 'done', to: 'persist_events' } },
            'setInput',
            { type: 'setStage', params: { stage: 'persist_events' as PipelineStage } },
            'resetRetry',
          ],
        },
      },
    },

    // =========================================================================
    // ERROR - Recoverable error state
    // =========================================================================
    error: {
      on: {
        START: {
          target: 'persist_events',
          actions: [
            'resetPipeline',
            { type: 'logTransition', params: { from: 'error', to: 'persist_events' } },
            'setInput',
            { type: 'setStage', params: { stage: 'persist_events' as PipelineStage } },
            'resetRetry',
            'clearError',
          ],
        },
        RETRY: [
          {
            guard: {
              type: 'canRetryAtStage',
              params: { stage: 'persist_events' as PipelineStage },
            },
            target: 'persist_events',
            actions: [
              { type: 'logTransition', params: { from: 'error', to: 'persist_events (retry)' } },
              'incrementRetry',
              'clearError',
              { type: 'setStage', params: { stage: 'persist_events' as PipelineStage } },
            ],
          },
          {
            guard: {
              type: 'canRetryAtStage',
              params: { stage: 'project_summary' as PipelineStage },
            },
            target: 'project_summary',
            actions: [
              {
                type: 'logTransition',
                params: { from: 'error', to: 'project_summary (retry)' },
              },
              'incrementRetry',
              'clearError',
              { type: 'setStage', params: { stage: 'project_summary' as PipelineStage } },
            ],
          },
          {
            guard: {
              type: 'canRetryAtStage',
              params: { stage: 'record_journey' as PipelineStage },
            },
            target: 'record_journey',
            actions: [
              {
                type: 'logTransition',
                params: { from: 'error', to: 'record_journey (retry)' },
              },
              'incrementRetry',
              'clearError',
              { type: 'setStage', params: { stage: 'record_journey' as PipelineStage } },
            ],
          },
          {
            guard: {
              type: 'canRetryAtStage',
              params: { stage: 'save_badges' as PipelineStage },
            },
            target: 'save_badges',
            actions: [
              { type: 'logTransition', params: { from: 'error', to: 'save_badges (retry)' } },
              'incrementRetry',
              'clearError',
              { type: 'setStage', params: { stage: 'save_badges' as PipelineStage } },
            ],
          },
          {
            guard: {
              type: 'canRetryAtStage',
              params: { stage: 'sync_cloud' as PipelineStage },
            },
            target: 'sync_cloud',
            actions: [
              { type: 'logTransition', params: { from: 'error', to: 'sync_cloud (retry)' } },
              'incrementRetry',
              'clearError',
              { type: 'setStage', params: { stage: 'sync_cloud' as PipelineStage } },
            ],
          },
          {
            // Max retries reached or unknown stage — stay in error
            actions: ['warnMaxRetries'],
          },
        ],
        CANCEL: {
          target: 'idle',
          actions: [
            { type: 'logTransition', params: { from: 'error', to: 'idle' } },
            'resetPipeline',
          ],
        },
      },
    },
  },
});

// Machine type for external use
type PipelineMachineSnapshot = SnapshotFrom<typeof pipelineMachine>;

// =============================================================================
// Helper Functions (copied from useSessionCompletion)
// =============================================================================

function isFirstSessionOfDay(history: SessionHistoryItem[]): boolean {
  if (history.length === 0) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return !history.some((s) => {
    const sessionDate = new Date(s.createdAt);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });
}

function countSessionsToday(history: SessionHistoryItem[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return history.filter((s) => {
    const sessionDate = new Date(s.createdAt);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  }).length;
}

// =============================================================================
// Adapter Class (implements SessionEndPipelinePort)
// =============================================================================

/**
 * SessionEndPipelineAdapter
 *
 * Wraps the XState machine to implement SessionEndPipelinePort interface.
 */
export class SessionEndPipelineAdapter implements SessionEndPipelinePort {
  private actor: ReturnType<typeof createActor<typeof pipelineMachine>>;
  private disposed = false;
  private cachedSnapshot: PipelineMachineSnapshot | null = null;
  private cachedState: PipelineState | null = null;
  // Changed from single promise to array to support multiple callers waiting on same session
  private pendingPromises: Array<{
    resolve: (result: SessionCompletionWithXPResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(deps: PipelineDependencies, maxRetries = 3) {
    this.actor = createActor(pipelineMachine, {
      input: { deps, maxRetries },
    });
    this.actor.start();

    // Subscribe to completion
    this.actor.subscribe((snapshot) => {
      if (this.matchesState(snapshot, 'done') && this.pendingPromises.length > 0) {
        const result = snapshot.context.completionResult;
        // Resolve ALL pending promises (not just one)
        for (const pending of this.pendingPromises) {
          if (result) {
            pending.resolve(result);
          } else {
            pending.reject(new Error('Pipeline completed without result'));
          }
        }
        this.pendingPromises = [];
      }

      if (this.matchesState(snapshot, 'error') && this.pendingPromises.length > 0) {
        const error = snapshot.context.error ?? new Error('Pipeline failed');
        // Reject ALL pending promises
        for (const pending of this.pendingPromises) {
          pending.reject(error);
        }
        this.pendingPromises = [];
      }
    });

    pipelineLog.info('XState machine started');
  }

  private ensureActive(method: string): void {
    if (this.disposed) {
      throw new Error(`SessionEndPipelineAdapter is disposed: cannot call ${method}()`);
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private matchesState(snapshot: PipelineMachineSnapshot, state: string): boolean {
    return snapshot.value === state;
  }

  // ===========================================================================
  // State
  // ===========================================================================

  getState(): PipelineState {
    const snapshot = this.actor.getSnapshot();
    if (this.cachedSnapshot === snapshot && this.cachedState) {
      return this.cachedState;
    }
    const ctx = snapshot.context;

    const nextState: PipelineState = {
      stage: ctx.currentStage,
      sessionId: ctx.sessionId,
      progress: calculatePipelineProgress(ctx.currentStage),
      error: ctx.error,
      retryCount: ctx.retryCount,
      result: ctx.completionResult,
      leveledUp: ctx.leveledUp,
      newLevel: ctx.newLevel,
    };

    this.cachedSnapshot = snapshot;
    this.cachedState = nextState;
    return nextState;
  }

  isIdle(): boolean {
    return this.matchesState(this.actor.getSnapshot(), 'idle');
  }

  isRunning(): boolean {
    const snapshot = this.actor.getSnapshot();
    const state = snapshot.value as string;
    return state !== 'idle' && state !== 'done' && state !== 'error';
  }

  isDone(): boolean {
    return this.matchesState(this.actor.getSnapshot(), 'done');
  }

  hasError(): boolean {
    return this.matchesState(this.actor.getSnapshot(), 'error');
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  start(input: SessionEndPipelineInput): Promise<SessionCompletionWithXPResult> {
    this.ensureActive('start');

    // Idempotence check
    const currentState = this.getState();
    const newSessionId = input.completionInput.sessionId;

    if (currentState.sessionId === newSessionId) {
      // SAME session - idempotent handling
      if (currentState.stage === 'done' && currentState.result) {
        return Promise.resolve(currentState.result);
      }
      if (this.isRunning()) {
        // Wait for current run to complete (add to queue, don't overwrite!)
        return new Promise((resolve, reject) => {
          this.pendingPromises.push({ resolve, reject });
        });
      }
    }

    // DIFFERENT session while pipeline is running
    // Bug fix: Reject to prevent orphaned promises (previous pendingPromise would never resolve)
    if (this.isRunning() && currentState.sessionId !== newSessionId) {
      pipelineLog.warn(
        `[Pipeline] Rejecting new session ${newSessionId} - pipeline busy with ${currentState.sessionId}`,
      );
      throw new Error(
        `Pipeline busy processing session ${currentState.sessionId}. Cannot start ${newSessionId}.`,
      );
    }

    // Start new pipeline
    return new Promise((resolve, reject) => {
      this.pendingPromises.push({ resolve, reject });
      this.actor.send({ type: 'START', input });
    });
  }

  retry(): void {
    this.ensureActive('retry');
    this.actor.send({ type: 'RETRY' });
  }

  cancel(): void {
    this.ensureActive('cancel');
    this.actor.send({ type: 'CANCEL' });
    // Reject all pending promises
    for (const pending of this.pendingPromises) {
      pending.reject(new Error('Pipeline cancelled'));
    }
    this.pendingPromises = [];
  }

  async recoverInterrupted(): Promise<SessionCompletionWithXPResult | null> {
    this.ensureActive('recoverInterrupted');
    const deps = this.actor.getSnapshot().context.deps;
    const recoveryState = await deps.loadRecoveryState();

    if (!recoveryState) {
      return null;
    }

    pipelineLog.info(`[Pipeline] Recovering interrupted session: ${recoveryState.sessionId}`);

    // Recovery after app restart always replays from persist_events (via START).
    // This is safe because persist_events is idempotent — already-persisted events
    // are a no-op. The RETRY handler (error state) is stage-aware and resumes from
    // the failed stage within the same session.
    if (recoveryState.partialResult) {
      pipelineLog.info(
        `[Pipeline] Recovery replays from persist_events (lastCompleted=${recoveryState.lastCompletedStage})`,
      );
    }
    let recoveredInput: SessionEndPipelineInput = recoveryState.input;

    // Recovery inputs may intentionally omit events for performance.
    // Rehydrate them from persistence if possible.
    try {
      const completionInput = recoveredInput.completionInput as unknown as Record<string, unknown>;
      if (
        completionInput &&
        typeof completionInput === 'object' &&
        'events' in completionInput &&
        deps.getSessionEvents
      ) {
        const existing = (completionInput as { events?: unknown }).events;
        const hasEvents = Array.isArray(existing) && existing.length > 0;
        if (!hasEvents) {
          const hydrated = await deps.getSessionEvents(recoveryState.sessionId);
          pipelineLog.info(
            `[Pipeline] Rehydrated ${hydrated.length} events for recovery (session=${recoveryState.sessionId})`,
          );
          recoveredInput = {
            ...recoveredInput,
            completionInput: {
              ...completionInput,
              events: hydrated,
            } as unknown as SessionEndPipelineInput['completionInput'],
          };
        }
      }
    } catch (err) {
      pipelineLog.warn('[Pipeline] Failed to rehydrate events for recovery', err);
    }

    return this.start(recoveredInput);
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  subscribe(listener: (state: PipelineState) => void): () => void {
    if (this.disposed) {
      listener({
        stage: 'idle',
        sessionId: null,
        progress: 0,
        error: new Error('SessionEndPipelineAdapter is disposed'),
        retryCount: 0,
        result: null,
        leveledUp: false,
        newLevel: 1,
      });
      return () => {};
    }

    listener(this.getState());

    const subscription = this.actor.subscribe(() => {
      listener(this.getState());
    });

    return () => subscription.unsubscribe();
  }

  subscribeStage(listener: (stage: PipelineStage, progress: number) => void): () => void {
    if (this.disposed) {
      listener('idle', 0);
      return () => {};
    }

    const state = this.getState();
    listener(state.stage, state.progress);

    const subscription = this.actor.subscribe(() => {
      const state = this.getState();
      listener(state.stage, state.progress);
    });

    return () => subscription.unsubscribe();
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  dispose(): void {
    if (this.disposed) return;

    // Reject all pending promises before stopping
    for (const pending of this.pendingPromises) {
      pending.reject(new Error('Pipeline disposed'));
    }
    this.pendingPromises = [];
    this.disposed = true;
    this.actor.stop();
    pipelineLog.info('XState machine stopped');
  }
}
