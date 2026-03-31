/**
 * Replay Interactif Adapter
 *
 * Implementation of ReplayInteractifPort using SQLite.
 * Manages interactive replay runs and events.
 *
 * @see docs/specs/domain-replay-interactif.md
 */

import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  ReplayInteractifPort,
  ReplayRun,
  ReplayEvent,
  ReplayEventInput,
  ReplayRunStatus,
  ReplayEventActor,
  SkipReason,
  PersistencePort,
} from '@neurodual/logic';
import { safeJsonParse } from '../db/sql-helpers';
import { requireDrizzleDb } from '../db/drizzle';

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

// =============================================================================
// Drizzle table definitions
// =============================================================================

const replayRunsTable = sqliteTable('replay_runs', {
  id: text('id').notNull(),
  session_id: text('session_id').notNull(),
  parent_run_id: text('parent_run_id'),
  depth: integer('depth').notNull(),
  status: text('status').notNull(),
  created_at: integer('created_at').notNull(),
});

const replayEventsTable = sqliteTable('replay_events', {
  id: text('id').notNull(),
  run_id: text('run_id').notNull(),
  type: text('type').notNull(),
  timestamp: integer('timestamp').notNull(),
  payload: text('payload').notNull(),
  actor: text('actor').notNull(),
  origin_event_id: text('origin_event_id'),
  skipped: integer('skipped').notNull(),
  skip_reason: text('skip_reason'),
});

// =============================================================================
// Row Types (from SQL)
// =============================================================================

interface ReplayRunRow {
  id: string;
  session_id: string;
  parent_run_id: string | null;
  depth: number;
  status: string;
  created_at: number | string; // SQLite BIGINT or string
}

interface ReplayEventRow {
  id: string;
  run_id: string;
  type: string;
  timestamp: number | string; // SQLite BIGINT or string
  payload: string | Record<string, unknown>; // SQLite stores as TEXT
  actor: string;
  origin_event_id: string | null;
  skipped: number | boolean; // SQLite stores as INTEGER (0/1)
  skip_reason: string | null;
}

// =============================================================================
// Row Converters
// =============================================================================

function rowToRun(row: ReplayRunRow): ReplayRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentRunId: row.parent_run_id,
    depth: row.depth as 0 | 1 | 2 | 3,
    status: row.status as ReplayRunStatus,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
  };
}

function rowToEvent(row: ReplayEventRow): ReplayEvent {
  // SQLite stores payload as TEXT, need to parse
  const payload =
    typeof row.payload === 'string'
      ? safeJsonParse<Record<string, unknown>>(row.payload, {})
      : row.payload;

  // SQLite stores boolean as INTEGER (0/1)
  const skipped = typeof row.skipped === 'number' ? row.skipped !== 0 : row.skipped;

  return {
    id: row.id,
    runId: row.run_id,
    type: row.type,
    timestamp: typeof row.timestamp === 'string' ? Number(row.timestamp) : row.timestamp,
    payload,
    actor: row.actor as ReplayEventActor,
    originEventId: row.origin_event_id,
    skipped,
    skipReason: row.skip_reason as SkipReason | null,
  };
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a replay interactif adapter using the provided PersistencePort.
 */
export function createReplayInteractifAdapter(persistence: PersistencePort): ReplayInteractifPort {
  return {
    // =========================================================================
    // Run Operations
    // =========================================================================

    async createRun(sessionId: string, parentRunId: string | null): Promise<ReplayRun> {
      // Calculate depth
      let depth: number;
      if (parentRunId === null) {
        // Dérivé de Run 0 (session originale)
        depth = 1;
      } else {
        // Dérivé d'un run existant
        const parentRun = await this.getRun(parentRunId);
        if (!parentRun) {
          throw new Error(`Parent run not found: ${parentRunId}`);
        }
        depth = parentRun.depth + 1;
      }

      // Check max depth
      if (depth > 3) {
        throw new Error('Maximum replay depth (3) exceeded');
      }

      const id = generateId();
      const createdAt = Date.now();

      const db = requireDrizzleDb(persistence);
      await db.run(
        sql`INSERT INTO replay_runs (id, session_id, parent_run_id, depth, status, created_at)
            VALUES (${id}, ${sessionId}, ${parentRunId}, ${depth}, 'in_progress', ${createdAt})`,
      );

      return {
        id,
        sessionId,
        parentRunId,
        depth: depth as 0 | 1 | 2 | 3,
        status: 'in_progress',
        createdAt,
      };
    },

    async getRun(runId: string): Promise<ReplayRun | null> {
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayRunsTable.id,
          session_id: replayRunsTable.session_id,
          parent_run_id: replayRunsTable.parent_run_id,
          depth: replayRunsTable.depth,
          status: replayRunsTable.status,
          created_at: replayRunsTable.created_at,
        })
        .from(replayRunsTable)
        .where(eq(replayRunsTable.id, runId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return rowToRun(row);
    },

    async getRunsForSession(sessionId: string): Promise<ReplayRun[]> {
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayRunsTable.id,
          session_id: replayRunsTable.session_id,
          parent_run_id: replayRunsTable.parent_run_id,
          depth: replayRunsTable.depth,
          status: replayRunsTable.status,
          created_at: replayRunsTable.created_at,
        })
        .from(replayRunsTable)
        .where(eq(replayRunsTable.session_id, sessionId))
        .orderBy(
          asc(replayRunsTable.depth),
          asc(replayRunsTable.created_at),
          asc(replayRunsTable.id),
        );
      return rows.map(rowToRun);
    },

    async completeRun(runId: string): Promise<void> {
      const db = requireDrizzleDb(persistence);
      await db.run(sql`UPDATE replay_runs SET status = 'completed' WHERE id = ${runId}`);
    },

    async deleteRun(runId: string): Promise<void> {
      // Local-only tables do not guarantee FK cascade: delete events explicitly.
      await persistence.writeTransaction(async (tx) => {
        await tx.execute('DELETE FROM replay_events WHERE run_id = ?', [runId]);
        await tx.execute('DELETE FROM replay_runs WHERE id = ?', [runId]);
      });
    },

    async canCreateRun(sessionId: string, parentRunId: string | null): Promise<boolean> {
      if (parentRunId === null) {
        // Check if session already has a depth-3 run
        const db = requireDrizzleDb(persistence);
        const rows = await db
          .select({ max_depth: sql<number>`COALESCE(MAX(${replayRunsTable.depth}), 0)` })
          .from(replayRunsTable)
          .where(eq(replayRunsTable.session_id, sessionId));
        const maxDepth = rows[0]?.max_depth ?? 0;
        return maxDepth < 3;
      }

      // Check parent depth
      const parentRun = await this.getRun(parentRunId);
      if (!parentRun) return false;
      return parentRun.depth < 3;
    },

    async getNextDepth(_sessionId: string, parentRunId: string | null): Promise<0 | 1 | 2 | 3> {
      if (parentRunId === null) {
        // Derived from Run 0 (original session) = depth 1
        return 1;
      }

      // Derived from an existing run
      const parentRun = await this.getRun(parentRunId);
      if (!parentRun) {
        throw new Error(`Parent run not found: ${parentRunId}`);
      }

      const nextDepth = parentRun.depth + 1;
      if (nextDepth > 3) {
        throw new Error('Maximum replay depth (3) exceeded');
      }

      return nextDepth as 0 | 1 | 2 | 3;
    },

    async getInProgressRun(sessionId: string): Promise<ReplayRun | null> {
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayRunsTable.id,
          session_id: replayRunsTable.session_id,
          parent_run_id: replayRunsTable.parent_run_id,
          depth: replayRunsTable.depth,
          status: replayRunsTable.status,
          created_at: replayRunsTable.created_at,
        })
        .from(replayRunsTable)
        .where(
          and(eq(replayRunsTable.session_id, sessionId), eq(replayRunsTable.status, 'in_progress')),
        )
        .orderBy(desc(replayRunsTable.created_at), desc(replayRunsTable.id))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return rowToRun(row);
    },

    // =========================================================================
    // Event Operations
    // =========================================================================

    async appendEvent(event: ReplayEventInput): Promise<ReplayEvent> {
      const id = generateId();

      const db = requireDrizzleDb(persistence);
      await db.run(
        sql`INSERT INTO replay_events
            (id, run_id, type, timestamp, payload, actor, origin_event_id, skipped, skip_reason)
            VALUES (
              ${id},
              ${event.runId},
              ${event.type},
              ${event.timestamp},
              ${JSON.stringify(event.payload)},
              ${event.actor},
              ${event.originEventId},
              ${event.skipped ? 1 : 0},
              ${event.skipReason}
            )`,
      );

      return { id, ...event };
    },

    async appendEventsBatch(events: ReplayEventInput[]): Promise<number> {
      if (events.length === 0) return 0;

      const db = requireDrizzleDb(persistence);
      const valueRows = events.map(
        (event) =>
          sql`(
          ${generateId()},
          ${event.runId},
          ${event.type},
          ${event.timestamp},
          ${JSON.stringify(event.payload)},
          ${event.actor},
          ${event.originEventId},
          ${event.skipped ? 1 : 0},
          ${event.skipReason}
        )`,
      );
      await db.run(
        sql`INSERT INTO replay_events
            (id, run_id, type, timestamp, payload, actor, origin_event_id, skipped, skip_reason)
            VALUES ${sql.join(valueRows, sql`, `)}`,
      );

      return events.length;
    },

    async getEventsForRun(runId: string): Promise<ReplayEvent[]> {
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayEventsTable.id,
          run_id: replayEventsTable.run_id,
          type: replayEventsTable.type,
          timestamp: replayEventsTable.timestamp,
          payload: replayEventsTable.payload,
          actor: replayEventsTable.actor,
          origin_event_id: replayEventsTable.origin_event_id,
          skipped: replayEventsTable.skipped,
          skip_reason: replayEventsTable.skip_reason,
        })
        .from(replayEventsTable)
        .where(eq(replayEventsTable.run_id, runId))
        .orderBy(asc(replayEventsTable.timestamp), asc(replayEventsTable.id));
      return rows.map(rowToEvent);
    },

    async getActiveEventsForRun(runId: string): Promise<ReplayEvent[]> {
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayEventsTable.id,
          run_id: replayEventsTable.run_id,
          type: replayEventsTable.type,
          timestamp: replayEventsTable.timestamp,
          payload: replayEventsTable.payload,
          actor: replayEventsTable.actor,
          origin_event_id: replayEventsTable.origin_event_id,
          skipped: replayEventsTable.skipped,
          skip_reason: replayEventsTable.skip_reason,
        })
        .from(replayEventsTable)
        .where(and(eq(replayEventsTable.run_id, runId), eq(replayEventsTable.skipped, 0)))
        .orderBy(asc(replayEventsTable.timestamp), asc(replayEventsTable.id));
      return rows.map(rowToEvent);
    },

    // =========================================================================
    // Cleanup Operations
    // =========================================================================

    async getOrphanedRuns(olderThanMs: number): Promise<ReplayRun[]> {
      const threshold = Date.now() - olderThanMs;
      const db = requireDrizzleDb(persistence);
      const rows = await db
        .select({
          id: replayRunsTable.id,
          session_id: replayRunsTable.session_id,
          parent_run_id: replayRunsTable.parent_run_id,
          depth: replayRunsTable.depth,
          status: replayRunsTable.status,
          created_at: replayRunsTable.created_at,
        })
        .from(replayRunsTable)
        .where(
          and(eq(replayRunsTable.status, 'in_progress'), lt(replayRunsTable.created_at, threshold)),
        );
      return rows.map(rowToRun);
    },
  };
}
