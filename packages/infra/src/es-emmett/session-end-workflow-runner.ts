/**
 * SessionEndWorkflowRunner — writer for post-session derived events.
 *
 * This class persists BADGE_UNLOCKED and XP_BREAKDOWN_COMPUTED events
 * via the CommandBus (which provides idempotency and event-sourcing guarantees).
 *
 * JOURNEY_TRANSITION_DECIDED is no longer written here — journey state is
 * rebuilt from session_summaries by the fact-driven projection, and the
 * pipeline computes JourneyContext on-the-fly.
 */
import type { CommandBusPort, PersistencePort, SessionCompletionInput } from '@neurodual/logic';
import {
  getBadgeById,
  type UnlockedBadge,
  type XPContextInput,
  SessionCompletionProjector,
} from '@neurodual/logic';

import type { InfraAdapters } from '../adapters';
import {
  getBadgeHistorySnapshotForUserScope,
  getBadgesForUserScope,
  getProgressionForUserScope,
} from '../progression/progression-adapter';
import {
  buildSessionSummaryScopeClause,
  effectiveUserIdsWithLocal,
  getAuthenticatedUserId,
} from '../user/user-scope';
import {
  findSessionStartEvent,
  getPlayContextFromEvents,
  requireJourneySnapshotFromEvents,
} from './session-event-utils';

export { findSessionStartEvent, getPlayContextFromEvents, requireJourneySnapshotFromEvents };

export function deriveCommandId(parent: string, suffix: string): string {
  return `${parent}:${suffix}`;
}

async function countCompletedSessionsToday(
  persistence: PersistencePort,
  userId: string,
  excludeSessionId: string,
): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Use range comparisons on ISO strings so SQLite can use (user_id, created_at) indexes.
  const baseWhere = `
    reason = 'completed'
    AND created_at >= ?
    AND created_at < ?
    AND session_id != ?
  `;
  const baseParams: unknown[] = [start.toISOString(), end.toISOString(), excludeSessionId];

  const scope = buildSessionSummaryScopeClause('user_id', effectiveUserIdsWithLocal(userId));
  const res = await persistence.query<{ c: number | string }>(
    `SELECT COUNT(*) as c
     FROM session_summaries
     WHERE ${scope.clause}
       AND ${baseWhere}`,
    [...scope.params, ...baseParams],
  );
  const row = res.rows[0];
  return Number(row?.c ?? 0) || 0;
}

function resolveWorkflowScopeUserId(sessionUserId: string): string {
  if (sessionUserId !== 'local') {
    return sessionUserId;
  }

  return getAuthenticatedUserId() ?? 'local';
}

export class SessionEndWorkflowRunner {
  constructor(
    private readonly persistence: PersistencePort,
    _adapters: InfraAdapters,
    private readonly commandBus: CommandBusPort,
  ) {
    void _adapters;
  }

  async onSessionEnded(args: {
    readonly sessionId: string;
    readonly endCommandId: string;
    readonly completionInput: SessionCompletionInput;
  }): Promise<void> {
    const { sessionId, endCommandId, completionInput } = args;

    // Read the canonical events from SQLite.
    const rows = await this.persistence.getSession(sessionId);
    const events = rows.map((r) => r.payload as Record<string, unknown>);

    // Note: completion input provides mode-specific context.

    // Extract userId from session events (start event carries the userId).
    const startEvent = findSessionStartEvent(events);
    const sessionUserId =
      typeof startEvent?.['userId'] === 'string' ? (startEvent['userId'] as string) : 'local';
    const workflowScopeUserId = resolveWorkflowScopeUserId(sessionUserId);
    const [existingBadges, badgeHistory, progressionData] = await Promise.all([
      getBadgesForUserScope(this.persistence, workflowScopeUserId).catch(() => []),
      getBadgeHistorySnapshotForUserScope(this.persistence, workflowScopeUserId).catch(() => null),
      getProgressionForUserScope(this.persistence, workflowScopeUserId).catch(() => null),
    ]);

    // Streak computation moved to UnifiedProjectionManager
    // For XP context, use 1 as default (first session of a potential streak)
    const streakDays = 1;
    const sessionsToday = await countCompletedSessionsToday(
      this.persistence,
      workflowScopeUserId,
      sessionId,
    ).catch(() => 0);
    const isFirstOfDay = sessionsToday === 0;

    const xpContext: XPContextInput = {
      streakDays,
      isFirstOfDay,
      sessionsToday,
      existingBadgeIds: existingBadges.map((b: { badgeId: string }) => b.badgeId),
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
      currentProgression: progressionData
        ? {
            totalXP: progressionData.totalXP,
            completedSessions: progressionData.completedSessions,
            abandonedSessions: progressionData.abandonedSessions,
            totalTrials: progressionData.totalTrials,
            firstSessionAt: progressionData.firstSessionAt,
            earlyMorningSessions: progressionData.earlyMorningSessions,
            lateNightSessions: progressionData.lateNightSessions,
            comebackCount: progressionData.comebackCount,
            persistentDays: progressionData.persistentDays,
            plateausBroken: progressionData.plateausBroken,
            uninterruptedSessionsStreak: progressionData.uninterruptedSessionsStreak ?? 0,
          }
        : undefined,
    };

    const completionResult = SessionCompletionProjector.projectWithXP(completionInput, xpContext);
    if (!completionResult) return;

    // 1) Journey context — no longer written as JOURNEY_TRANSITION_DECIDED event.
    // Journey state is now rebuilt from session_summaries by the fact-driven projection.
    // The pipeline computes JourneyContext on-the-fly (see session-end-pipeline-machine.ts).

    // 2) Badges
    const newBadges = (() => {
      if (!completionResult) return null;
      const v = (completionResult as unknown as { newBadges?: unknown }).newBadges;
      return Array.isArray(v) ? (v as UnlockedBadge[]) : null;
    })();

    if (newBadges && newBadges.length > 0) {
      for (const badge of newBadges) {
        const badgeRecord = badge as unknown as { badgeId?: unknown; id?: unknown };
        const badgeId =
          typeof badgeRecord.badgeId === 'string'
            ? badgeRecord.badgeId
            : typeof badgeRecord.id === 'string'
              ? badgeRecord.id
              : '';
        const badgeDefinition = badgeId ? getBadgeById(badgeId) : undefined;
        await this.commandBus.handle({
          type: 'SESSION/UNLOCK_BADGE',
          data: {
            sessionId,
            expectedVersion: -2, // NO_CONCURRENCY_CHECK - post-session derived event
            event: {
              type: 'BADGE_UNLOCKED',
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              sessionId,
              schemaVersion: 1,
              badgeId,
              category: badgeDefinition?.category ?? 'milestone',
              priority: badgeDefinition?.priority ?? 0,
            },
          },
          metadata: {
            commandId: deriveCommandId(endCommandId, `badge:${badgeId}`),
            timestamp: new Date(),
          },
        });
      }
    }

    // 3) XP breakdown (optional): only if schema supports it.
    const xpBreakdown = (() => {
      if (!completionResult) return null;
      return (completionResult as unknown as { xpBreakdown?: unknown }).xpBreakdown ?? null;
    })();
    if (xpBreakdown) {
      await this.commandBus.handle({
        type: 'SESSION/COMPUTE_XP_BREAKDOWN',
        data: {
          sessionId,
          expectedVersion: -2, // NO_CONCURRENCY_CHECK - post-session derived event
          event: {
            type: 'XP_BREAKDOWN_COMPUTED',
            id: `xp-breakdown:${sessionId}`,
            timestamp: Date.now(),
            sessionId,
            schemaVersion: 1,
            xpBreakdown,
          },
        },
        metadata: { commandId: deriveCommandId(endCommandId, 'xp'), timestamp: new Date() },
      });
    }
  }
}
