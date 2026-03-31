import type { PersistencePort } from '@neurodual/logic';

import { persistenceLog } from '../logger';

const META_VERSION_KEY = 'localDbSchemaVersion';

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class LocalDbMigrationError extends Error {
  readonly cause: unknown;
  readonly fromVersion: number;
  readonly targetVersion: number;
  readonly migrationName: string;

  constructor(args: {
    message: string;
    cause: unknown;
    fromVersion: number;
    targetVersion: number;
    migrationName: string;
  }) {
    super(args.message);
    this.name = 'LocalDbMigrationError';
    this.cause = args.cause;
    this.fromVersion = args.fromVersion;
    this.targetVersion = args.targetVersion;
    this.migrationName = args.migrationName;
  }
}

type DbObjectType = 'table' | 'view' | null;

type ManagedObjectPolicy = 'powersync-managed' | 'app-owned' | 'unknown';

const POWERSYNC_MANAGED_OBJECTS = new Set([
  'session_summaries',
  'emt_messages',
  'emt_streams',
  'emt_subscriptions',
  'processed_commands',
  'session_in_progress_events',
]);

const DANGEROUS_DDL_PREFIXES = [
  'alter table',
  'create index',
  'create unique index',
  'drop table',
  'drop view',
];

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractReferencedObjectName(sql: string): string | null {
  const normalized = normalizeSql(sql);
  const matchers = [
    /\balter table(?: if exists)? (?:"?([\w.]+)"?)/,
    /\bcreate(?: unique)? index(?: if not exists)? [\w"]+ on (?:"?([\w.]+)"?)/,
    /\bdrop table(?: if exists)? (?:"?([\w.]+)"?)/,
    /\bdrop view(?: if exists)? (?:"?([\w.]+)"?)/,
    /\bupdate (?:"?([\w.]+)"?)/,
    /\bdelete from (?:"?([\w.]+)"?)/,
  ];

  for (const matcher of matchers) {
    const match = normalized.match(matcher);
    const objectName = match?.[1];
    if (objectName) {
      return objectName.split('.').pop() ?? objectName;
    }
  }

  return null;
}

function classifyObjectPolicy(name: string): ManagedObjectPolicy {
  if (POWERSYNC_MANAGED_OBJECTS.has(name)) {
    return 'powersync-managed';
  }
  return 'app-owned';
}

export interface LocalDbMigrationContext {
  readonly persistence: PersistencePort;
  getObjectType: (name: string) => Promise<DbObjectType>;
  tableExists: (name: string) => Promise<boolean>;
  safeExecSql: (sql: string, params?: unknown[]) => Promise<void>;
  safeExecDeleteAll: (table: string) => Promise<void>;
}

type DbMigration = {
  version: number;
  name: string;
  up: (context: LocalDbMigrationContext) => Promise<void>;
};

async function readLocalDbVersion(persistence: PersistencePort): Promise<number> {
  const raw = await persistence.getSyncMeta(META_VERSION_KEY);
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

async function writeLocalDbVersion(persistence: PersistencePort, version: number): Promise<void> {
  await persistence.setSyncMeta(META_VERSION_KEY, String(version));
}

async function getObjectType(persistence: PersistencePort, name: string): Promise<DbObjectType> {
  try {
    const result = await persistence.query<{ object_type: string }>(
      `SELECT type as object_type
         FROM (
           SELECT type FROM sqlite_master WHERE name = ?
           UNION ALL
           SELECT type FROM sqlite_temp_master WHERE name = ?
         )
         LIMIT 1`,
      [name, name],
    );
    const objectType = result.rows[0]?.object_type;
    return objectType === 'table' || objectType === 'view' ? objectType : null;
  } catch {
    return null;
  }
}

async function tableExists(persistence: PersistencePort, name: string): Promise<boolean> {
  return (await getObjectType(persistence, name)) === 'table';
}

function isDangerousSql(sql: string): boolean {
  const normalized = normalizeSql(sql);
  return DANGEROUS_DDL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function guardedExecSql(
  persistence: PersistencePort,
  sql: string,
  params?: unknown[],
): Promise<void> {
  const objectName = extractReferencedObjectName(sql);
  if (objectName) {
    const policy = classifyObjectPolicy(objectName);
    const objectType = await getObjectType(persistence, objectName);
    if (policy === 'powersync-managed' && objectType === 'view' && isDangerousSql(sql)) {
      throw new Error(
        `[Migrations] Refusing dangerous SQL on PowerSync-managed view "${objectName}": ${normalizeSql(sql)}`,
      );
    }
  }

  await persistence.execute(sql, params);
}

async function safeExecDeleteAll(persistence: PersistencePort, table: string): Promise<void> {
  try {
    if (!(await tableExists(persistence, table))) return;
    await guardedExecSql(persistence, `DELETE FROM ${table}`);
  } catch {
    // Best-effort: on older DBs the table may be missing or have different semantics.
  }
}

async function safeExecSql(
  persistence: PersistencePort,
  sql: string,
  params?: unknown[],
): Promise<void> {
  try {
    await guardedExecSql(persistence, sql, params);
  } catch {
    // Best-effort: migrations should stay resilient to older schemas.
  }
}

function createMigrationContext(persistence: PersistencePort): LocalDbMigrationContext {
  return {
    persistence,
    getObjectType: (name) => getObjectType(persistence, name),
    tableExists: (name) => tableExists(persistence, name),
    safeExecSql: (sql, params) => safeExecSql(persistence, sql, params),
    safeExecDeleteAll: (table) => safeExecDeleteAll(persistence, table),
  };
}

const MIGRATIONS: readonly DbMigration[] = [
  {
    version: 2,
    name: 'wipe-legacy-events-schema',
    up: async (context) => {
      // The legacy schema stored events in a PowerSync-synced `events` table.
      // The new schema uses `emt_messages` (Emmett event store).
      // These are incompatible — a full local wipe + re-sync from Supabase is required.
      // Data was already migrated server-side (20260303_backfill_legacy_events_to_emt_messages).
      //
      // Throwing here triggers attemptMigrationAutoWipe() in setup-persistence.ts,
      // which verifies no local-only data exists before wiping.
      const hasLegacySchema =
        (await context.tableExists('events')) || (await context.tableExists('events_local'));

      if (hasLegacySchema) {
        throw new Error(
          'Legacy events schema detected — local DB must be wiped for emt_messages migration.',
        );
      }
    },
  },
  {
    version: 3,
    name: 'split-session-in-progress-blob-into-rows',
    up: async (context) => {
      const targetObjectType = await context.getObjectType('session_in_progress_events');
      if (targetObjectType === null) {
        throw new Error('[Migrations] session_in_progress_events is missing after schema update.');
      }

      const legacyObjectType = await context.getObjectType('session_in_progress');
      if (legacyObjectType === null) {
        return;
      }

      const legacy = await context.persistence.query<{ id: string; events_json: string | null }>(
        `SELECT id, events_json FROM session_in_progress`,
      );

      for (const row of legacy.rows) {
        if (typeof row.id !== 'string' || row.id.trim().length === 0) continue;

        let events: unknown[] = [];
        try {
          const parsed = JSON.parse(row.events_json ?? '[]') as unknown;
          events = Array.isArray(parsed) ? parsed : [];
        } catch {
          events = [];
        }

        for (const event of events) {
          if (!event || typeof event !== 'object') continue;
          const raw = event as { t?: unknown; d?: unknown; p?: unknown; c?: unknown };
          if (typeof raw.t !== 'string' || raw.t.trim().length === 0) continue;
          if (typeof raw.p !== 'string' || raw.p.trim().length === 0) continue;

          const eventData =
            raw.d && typeof raw.d === 'object'
              ? JSON.stringify(raw.d as Record<string, unknown>)
              : '{}';
          const createdAt =
            typeof raw.c === 'number' && Number.isFinite(raw.c) ? Math.round(raw.c) : 0;

          await context.persistence.execute(
            `INSERT OR IGNORE INTO session_in_progress_events
               (id, session_id, event_type, event_data, global_position, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [`${row.id}:${raw.p}`, row.id, raw.t, eventData, raw.p, createdAt],
          );
        }
      }

      await context.safeExecSql(`DROP VIEW IF EXISTS session_in_progress`);
      await context.safeExecSql(`DROP TABLE IF EXISTS session_in_progress`);
    },
  },
  {
    version: 4,
    name: 'add-progression-columns-to-user-stats-projection',
    up: async (context) => {
      // Add progression fields to user_stats_projection for O(1) progressionSummary reads.
      // safeExecSql silently ignores errors (column may already exist on fresh installs).
      const columns = [
        'abandoned_sessions INTEGER NOT NULL DEFAULT 0',
        'total_trials INTEGER NOT NULL DEFAULT 0',
        'total_xp INTEGER NOT NULL DEFAULT 0',
        'first_session_at TEXT',
        'early_morning_sessions INTEGER NOT NULL DEFAULT 0',
        'late_night_sessions INTEGER NOT NULL DEFAULT 0',
      ];
      for (const col of columns) {
        await context.safeExecSql(`ALTER TABLE user_stats_projection ADD COLUMN ${col}`);
      }
    },
  },
  {
    version: 5,
    name: 'add-missing-indexes',
    up: async (context) => {
      // session_summaries.session_id lost its index during the Emmett cutover (was PK before).
      // Without it, WHERE session_id = ? does a full table scan (2300ms+ on Android).
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_session_id_idx ON session_summaries(session_id)`,
      );
      // emt_messages.message_id used by getEventById lookup.
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS emt_messages_message_id_idx ON emt_messages(message_id) WHERE message_kind = 'E' AND is_archived = 0`,
      );
    },
  },
  {
    version: 6,
    name: 'add-mode-selector-indexes',
    up: async (context) => {
      // useLastPlayedMode: ORDER BY created_at DESC LIMIT 1 without user_id filter → full scan (2300ms).
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_created_at_desc_idx ON session_summaries(created_at DESC)`,
      );
      // useModeQuickStats: GROUP BY game_mode without user_id filter → full scan (2200ms).
      // Covering index includes the aggregated columns to avoid table lookups.
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_game_mode_agg_idx ON session_summaries(game_mode, duration_ms, n_level)`,
      );
    },
  },
  {
    version: 7,
    name: 'add-projection-effects-table',
    up: async (context) => {
      await context.safeExecSql(
        `CREATE TABLE IF NOT EXISTS projection_effects (
          id TEXT PRIMARY KEY,
          projection_id TEXT NOT NULL,
          effect_key TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await context.safeExecSql(
        `CREATE UNIQUE INDEX IF NOT EXISTS projection_effects_projection_key_idx
           ON projection_effects(projection_id, effect_key)`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS projection_effects_projection_idx
           ON projection_effects(projection_id, applied_at)`,
      );
    },
  },
  {
    version: 8,
    name: 'add-journey-state-projection-rules-version',
    up: async (context) => {
      await context.safeExecSql(
        `ALTER TABLE journey_state_projection ADD COLUMN rules_version INTEGER DEFAULT 0`,
      );
    },
  },
  {
    version: 9,
    name: 'add-dual-track-adaptive-progress-to-session-summaries',
    up: async (context) => {
      await context.safeExecSql(
        `ALTER TABLE session_summaries ADD COLUMN adaptive_path_progress_pct REAL`,
      );
    },
  },
  {
    version: 10,
    name: 'create-cognitive-profile-projection',
    up: async (context) => {
      await context.safeExecSql(`
        CREATE TABLE IF NOT EXISTS cognitive_profile_projection (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          phase TEXT DEFAULT 'idle',
          current_step_index INTEGER DEFAULT 0,
          results_json TEXT DEFAULT '{}',
          recent_step_keys_json TEXT DEFAULT '[]',
          global_score INTEGER DEFAULT 0,
          strongest_modality TEXT,
          weakest_modality TEXT,
          calibration_session_id TEXT,
          started_at TEXT,
          completed_at TEXT,
          updated_at TEXT
        )
      `);
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS cognitive_profile_user_idx ON cognitive_profile_projection(user_id)`,
      );
    },
  },
  {
    version: 11,
    name: 'add-recent-step-keys-to-cognitive-profile-projection',
    up: async (context) => {
      await context.safeExecSql(
        `ALTER TABLE cognitive_profile_projection
           ADD COLUMN recent_step_keys_json TEXT DEFAULT '[]'`,
      );
    },
  },
  {
    version: 12,
    name: 'add-provenance-columns-to-cognitive-profile-projection',
    up: async (context) => {
      await context.safeExecSql(
        `ALTER TABLE cognitive_profile_projection
           ADD COLUMN baseline_level INTEGER`,
      );
      await context.safeExecSql(
        `ALTER TABLE cognitive_profile_projection
           ADD COLUMN modality_sources_json TEXT DEFAULT '{}'`,
      );
      await context.safeExecSql(
        `ALTER TABLE cognitive_profile_projection
           ADD COLUMN next_recommended_session_json TEXT`,
      );
    },
  },
  {
    version: 13,
    name: 'add-profile-sessions-count-and-projection-errors',
    up: async (context) => {
      // Add profile_sessions_count to user_stats_projection (needed by cognitive profile page).
      await context.safeExecSql(
        `ALTER TABLE user_stats_projection ADD COLUMN profile_sessions_count INTEGER NOT NULL DEFAULT 0`,
      );
      // Create es_projection_errors table (dead letter queue for failed projections).
      await context.safeExecSql(
        `CREATE TABLE IF NOT EXISTS es_projection_errors (
          id TEXT PRIMARY KEY,
          projector_name TEXT NOT NULL,
          event_global_position TEXT NOT NULL,
          event_stream_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          error_message TEXT,
          error_stack TEXT,
          failed_at TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_retry_at TEXT
        )`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS es_projection_errors_retry_idx
          ON es_projection_errors(retry_count, failed_at)
          WHERE retry_count < 5`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS es_projection_errors_event_idx
          ON es_projection_errors(event_global_position, event_stream_id)`,
      );
    },
  },
  {
    version: 14,
    name: 'add-absolute-score-to-session-summaries',
    up: async (context) => {
      await context.safeExecSql(`ALTER TABLE session_summaries ADD COLUMN absolute_score REAL`);
    },
  },
  {
    version: 15,
    name: 'add-journey-state-projection-ordering-index',
    up: async (context) => {
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS journey_state_projection_journey_user_updated_idx
          ON journey_state_projection(journey_id, user_id, updated_at DESC)`,
      );
    },
  },
  {
    version: 16,
    name: 'normalize-local-session-summary-user-ids-and-add-completed-order-index',
    up: async (context) => {
      await context.safeExecSql(
        `UPDATE session_summaries
           SET user_id = 'local'
         WHERE user_id IS NULL OR TRIM(user_id) = ''`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_completed_order_idx
          ON session_summaries(user_id, created_at DESC, session_id DESC, focus_lost_count)
          WHERE reason IS NULL OR reason = 'completed'`,
      );
    },
  },
  {
    version: 17,
    name: 'normalize-session-summary-reasons-and-add-hot-read-indexes',
    up: async (context) => {
      await context.safeExecSql(
        `UPDATE session_summaries
           SET reason = 'completed'
         WHERE reason IS NULL OR TRIM(reason) = ''`,
      );
      await context.safeExecSql(`DROP INDEX IF EXISTS session_summaries_user_revision_idx`);
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_revision_idx
          ON session_summaries(user_id, created_at DESC)
          WHERE reason = 'completed'`,
      );
      await context.safeExecSql(`DROP INDEX IF EXISTS session_summaries_user_completed_order_idx`);
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_completed_order_idx
          ON session_summaries(user_id, created_at DESC, session_id DESC, focus_lost_count)
          WHERE reason = 'completed'`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_non_abandoned_created_date_idx
          ON session_summaries(user_id, created_date DESC)
          WHERE reason != 'abandoned'`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_completed_dprime_desc_idx
          ON session_summaries(user_id, global_d_prime DESC)
          WHERE reason = 'completed' AND global_d_prime IS NOT NULL`,
      );
    },
  },
  {
    version: 18,
    name: 'normalize-focus-lost-count-and-add-completed-pause-order-index',
    up: async (context) => {
      await context.safeExecSql(
        `UPDATE session_summaries
           SET focus_lost_count = 0
         WHERE focus_lost_count IS NULL`,
      );
      await context.safeExecSql(
        `CREATE INDEX IF NOT EXISTS session_summaries_user_completed_pause_order_idx
          ON session_summaries(user_id, created_at DESC, session_id DESC)
          WHERE reason = 'completed' AND focus_lost_count > 0`,
      );
    },
  },
];

function validateMigrations(migrations: readonly DbMigration[]): void {
  const versions = migrations.map((m) => m.version);
  for (const v of versions) {
    if (!Number.isInteger(v) || v < 2) {
      throw new Error(`[Migrations] Invalid migration version: ${String(v)}`);
    }
  }
  const uniq = new Set(versions);
  if (uniq.size !== versions.length) {
    throw new Error('[Migrations] Duplicate migration version detected');
  }
}

validateMigrations(MIGRATIONS);

export async function runLocalDbMigrations(persistence: PersistencePort): Promise<void> {
  const start = nowMs();
  const currentVersion = await readLocalDbVersion(persistence);
  const context = createMigrationContext(persistence);

  if (MIGRATIONS.length === 0) {
    await writeLocalDbVersion(persistence, currentVersion);
    persistenceLog.info(`[Migrations] No local DB migrations to apply (version=${currentVersion})`);
    return;
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) {
    persistenceLog.info(`[Migrations] Local DB already up to date (version=${currentVersion})`);
    return;
  }

  for (const migration of pending) {
    const migrationStart = nowMs();
    persistenceLog.info(
      `[Migrations] Applying local DB migration v${migration.version} (${migration.name})`,
    );

    try {
      await migration.up(context);
      await writeLocalDbVersion(persistence, migration.version);
    } catch (cause) {
      throw new LocalDbMigrationError({
        message:
          `[Migrations] Failed at v${migration.version} (${migration.name}) ` +
          `from v${currentVersion}`,
        cause,
        fromVersion: currentVersion,
        targetVersion: migration.version,
        migrationName: migration.name,
      });
    }

    const ms = nowMs() - migrationStart;
    persistenceLog.info(
      `[Migrations] Applied v${migration.version} (${migration.name}) in ${ms.toFixed(0)}ms`,
    );
  }

  const totalMs = nowMs() - start;
  persistenceLog.info(
    `[Migrations] Applied ${pending.length} local DB migration(s) in ${totalMs.toFixed(0)}ms`,
  );
}
