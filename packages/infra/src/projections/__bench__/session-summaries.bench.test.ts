/**
 * Session Summaries — Bench isolé
 *
 * Mesures de performance sur session_summaries sans connexion à l'application.
 * DB : bun:sqlite in-memory + SQLITE_SCHEMA réel (tous les index inclus).
 *
 * Run :
 *   bun test src/projections/__bench__/session-summaries.bench.ts --timeout 120000
 *
 * Suites :
 *  1. Write   – INSERT batch (100 / 500 / 1000 rows, transaction unique)
 *  2. Read    – 4 requêtes stats clés à 1K / 5K / 10K rows
 *  3. Index   – EXPLAIN QUERY PLAN (révèle si les index sont utilisés)
 *  4. getSession cost – sequential N×1 vs 1 batch IN(…) (session_events JSON blobs)
 */

import { afterAll, beforeAll, describe, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SQLITE_SCHEMA } from '../../db/sqlite-schema';

// =============================================================================
// Constantes bench
// =============================================================================

const USER_ID = 'bench-user';
const GAME_MODES = ['dualnback-classic', 'dual-tempo', 'dual-pick'] as const;
const READ_COUNTS = [1_000, 5_000, 10_000] as const;
const WRITE_COUNTS = [100, 500, 1_000] as const;

// =============================================================================
// BenchDb — wrapper bun:sqlite avec SQLITE_SCHEMA complet
// =============================================================================

class BenchDb {
  readonly raw: Database;

  constructor() {
    this.raw = new Database(':memory:');
    this.raw.exec(SQLITE_SCHEMA);
  }

  query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.raw.query(sql).all(...(params as any)) as T[];
  }

  run(sql: string, params: unknown[] = []): void {
    this.raw.query(sql).run(...(params as any));
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  explainQueryPlan(sql: string, params: unknown[] = []): string {
    const rows = this.raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as any)) as {
      detail: string;
    }[];
    return rows.map((r) => `    ${r.detail}`).join('\n');
  }

  close(): void {
    this.raw.close();
  }
}

// =============================================================================
// Seed helpers
// =============================================================================

function makeByModalityJson(): string {
  return JSON.stringify({
    position: { hits: 8, misses: 2, falseAlarms: 1, correctRejections: 9, avgRT: 350 },
    audio: { hits: 7, misses: 3, falseAlarms: 2, correctRejections: 8, avgRT: 420 },
  });
}

/**
 * Seed N rows in session_summaries via une transaction unique.
 * Spread sur 365 jours pour rendre le GROUP BY date réaliste.
 */
function seedSummaries(db: BenchDb, count: number): void {
  const baseDate = new Date('2024-01-01').getTime();
  const msPerDay = 86_400_000;
  const daysSpread = Math.min(count, 365);

  const stmt = db.raw.prepare(`
    INSERT INTO session_summaries (
      id, session_id, user_id, session_type, created_at, created_date,
      n_level, duration_ms,
      total_hits, total_misses, total_fa, total_cr,
      game_mode, passed, reason,
      ups_score, accuracy, avg_response_time_ms,
      active_modalities_csv, by_modality,
      global_d_prime, worst_modality_error_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.raw.transaction(() => {
    for (let i = 0; i < count; i++) {
      const dayIdx = i % daysSpread;
      const createdAt = new Date(baseDate + dayIdx * msPerDay + i * 1000).toISOString();
      const nLevel = (i % 5) + 1;
      const hits = 8 + (i % 5);
      const misses = 2 - (i % 2);
      const fa = 1 + (i % 3);
      const cr = 9 - (i % 3);

      stmt.run(
        ...([
          `bench-${i}`,
          `bench-${i}`,
          USER_ID,
          'dual-nback',
          createdAt,
          createdAt.substring(0, 10),
          nLevel,
          60_000 + (i % 10) * 30_000,
          hits,
          misses,
          fa,
          cr,
          GAME_MODES[i % GAME_MODES.length],
          1,
          'completed',
          0.65 + (i % 10) * 0.02,
          hits / (hits + misses + fa),
          300 + (i % 5) * 50,
          'audio,position',
          makeByModalityJson(),
          1.2 + (i % 5) * 0.3,
          ((misses + fa) / (hits + misses + fa)) * 100,
        ] as any),
      );
    }
  });

  tx();
}

// =============================================================================
// SQL helpers (inline — pas d'import stats-adapter pour éviter les dépendances Supabase)
// =============================================================================

const COMMON_WHERE = `WHERE user_id = ? AND reason = 'completed'`;
const COMMON_PARAMS: unknown[] = [USER_ID];

function buildCTE(extraWhere = ''): string {
  const where = extraWhere ? `${COMMON_WHERE} AND ${extraWhere}` : COMMON_WHERE;
  return `WITH filtered_sessions AS (SELECT * FROM session_summaries ${where})`;
}

// =============================================================================
// Timing helpers
// =============================================================================

function timed<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

function row(label: string, ms: number): void {
  const bar = '█'.repeat(Math.min(Math.round(ms / 2), 40));
  console.log(`    ${label.padEnd(52)} ${ms.toFixed(2).padStart(8)} ms  ${bar}`);
}

function header(title: string): void {
  console.log(`\n  ┌─ ${title}`);
}

// =============================================================================
// Suite 1 — Write : INSERT session_summaries
// =============================================================================

describe('Bench › 1. Write (INSERT session_summaries)', () => {
  for (const count of WRITE_COUNTS) {
    it(`INSERT ${count} rows — transaction unique`, () => {
      const db = new BenchDb();
      // Warm-up : 10 rows pour initialiser prepared statements
      seedSummaries(db, 10);
      db.raw.exec('DELETE FROM session_summaries');

      const { ms } = timed(() => seedSummaries(db, count));
      header(`INSERT ${count} rows`);
      row(`INSERT ${count} rows (transaction)`, ms);
      row(`Coût par row`, ms / count);
      db.close();
    });
  }
});

// =============================================================================
// Suite 2 — Read : requêtes stats à 1K / 5K / 10K rows
// =============================================================================

describe('Bench › 2. Read (stats queries)', () => {
  for (const rowCount of READ_COUNTS) {
    describe(`N = ${rowCount.toLocaleString()} rows`, () => {
      let db: BenchDb;

      beforeAll(() => {
        db = new BenchDb();
        seedSummaries(db, rowCount);
      });

      afterAll(() => db.close());

      it('getActivityStats — COUNT + SUM + DISTINCT created_date (fixed)', () => {
        const sql = `
          ${buildCTE()}
          SELECT
            COUNT(*) as sessions_count,
            COALESCE(SUM(duration_ms), 0) as total_ms,
            COUNT(DISTINCT created_date) as active_days
          FROM filtered_sessions
        `;
        // Warm-up
        db.query(sql, COMMON_PARAMS);
        const { ms } = timed(() => db.query(sql, COMMON_PARAMS));
        row(`getActivityStats (${rowCount.toLocaleString()})`, ms);
      });

      it('getPerformanceStats — MAX + UPS weighted avg', () => {
        const sql = `
          ${buildCTE()}
          SELECT
            MAX(n_level) as max_n_level,
            SUM(total_hits) * 1.0
              / NULLIF(SUM(total_hits + total_misses + total_fa), 0) as accuracy,
            SUM(
              CASE WHEN ups_score IS NOT NULL
                THEN ups_score * (total_hits + total_misses + total_fa + total_cr)
                ELSE 0 END
            ) / NULLIF(SUM(
              CASE WHEN ups_score IS NOT NULL
                THEN (total_hits + total_misses + total_fa + total_cr)
                ELSE 0 END
            ), 0) as ups_score
          FROM filtered_sessions
        `;
        db.query(sql, COMMON_PARAMS);
        const { ms } = timed(() => db.query(sql, COMMON_PARAMS));
        row(`getPerformanceStats (${rowCount.toLocaleString()})`, ms);
      });

      it('getModalityStats — SQL json_extract aggregation (fixed)', () => {
        const sqlFixed = `
          ${buildCTE()},
          known_modalities(m) AS (
            SELECT 'position' UNION ALL SELECT 'audio'
            UNION ALL SELECT 'color' UNION ALL SELECT 'image'
          )
          SELECT
            km.m AS modality,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)), 0) AS hits,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.misses') AS INTEGER)), 0) AS misses,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)), 0) AS false_alarms,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.correctRejections') AS INTEGER)), 0) AS correct_rejections
          FROM known_modalities km
          JOIN filtered_sessions s
            ON json_extract(s.by_modality, '$.' || km.m) IS NOT NULL
              AND s.by_modality IS NOT NULL AND s.by_modality != ''
          GROUP BY km.m
          HAVING hits + misses + false_alarms + correct_rejections > 0
        `;
        // Warm-up
        db.query(sqlFixed, COMMON_PARAMS);
        const { result, ms } = timed(() => db.query(sqlFixed, COMMON_PARAMS));
        header(`getModalityStats SQL (${rowCount.toLocaleString()}) → ${result.length} modalities`);
        row(`  SQL json_extract aggregation`, ms);
        console.log(`    ✅ 0 bytes transférés à JS, 0 JSON.parse`);
      });

      it('getTimeSeries — GROUP BY created_date (fixed)', () => {
        const sql = `
          ${buildCTE()}
          SELECT
            created_date as day,
            COUNT(*) as sessions_count,
            SUM(duration_ms) as total_ms,
            AVG(n_level) as avg_n_level,
            MAX(n_level) as max_n_level,
            SUM(total_hits) * 1.0
              / NULLIF(SUM(total_hits + total_misses + total_fa), 0) as accuracy
          FROM filtered_sessions
          GROUP BY created_date
          ORDER BY created_date ASC
        `;
        db.query(sql, COMMON_PARAMS);
        const { result, ms } = timed(() => db.query(sql, COMMON_PARAMS));
        row(`getTimeSeries (${rowCount.toLocaleString()}) → ${result.length} days`, ms);
      });

      it('getModalityStats+mode — SQL json_extract (fixed)', () => {
        const sql = `
          ${buildCTE(`game_mode = 'dualnback-classic'`)},
          known_modalities(m) AS (
            SELECT 'position' UNION ALL SELECT 'audio'
            UNION ALL SELECT 'color' UNION ALL SELECT 'image'
          )
          SELECT
            km.m AS modality,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)), 0) AS hits,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.misses') AS INTEGER)), 0) AS misses,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)), 0) AS false_alarms,
            COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.correctRejections') AS INTEGER)), 0) AS correct_rejections
          FROM known_modalities km
          JOIN filtered_sessions s
            ON json_extract(s.by_modality, '$.' || km.m) IS NOT NULL
              AND s.by_modality IS NOT NULL AND s.by_modality != ''
          GROUP BY km.m
          HAVING hits + misses + false_alarms + correct_rejections > 0
        `;
        const params: unknown[] = [USER_ID];
        db.query(sql, params);
        const { result, ms } = timed(() => db.query(sql, params));
        row(`getModalityStats+mode SQL (${rowCount.toLocaleString()}) → ${result.length} mod`, ms);
      });
    });
  }
});

// =============================================================================
// Suite 3 — Index : EXPLAIN QUERY PLAN
// =============================================================================

describe('Bench › 3. Index (EXPLAIN QUERY PLAN)', () => {
  let db: BenchDb;

  beforeAll(() => {
    db = new BenchDb();
    // Seed pour que le query planner ait des stats réalistes
    seedSummaries(db, 1_000);
    db.raw.exec('ANALYZE');
  });

  afterAll(() => db.close());

  it('getActivityStats — plan (doit utiliser created_date sans TEMP B-TREE)', () => {
    const plan = db.explainQueryPlan(
      `WITH filtered_sessions AS (
         SELECT * FROM session_summaries WHERE user_id = ? AND reason = 'completed'
       )
       SELECT COUNT(*), SUM(duration_ms), COUNT(DISTINCT created_date)
       FROM filtered_sessions`,
      COMMON_PARAMS,
    );
    console.log(`\n  [getActivityStats] EXPLAIN QUERY PLAN:\n${plan}`);
  });

  it('getPerformanceStats — plan (doit utiliser un index covering)', () => {
    const plan = db.explainQueryPlan(
      `WITH filtered_sessions AS (
         SELECT * FROM session_summaries
         WHERE user_id = ? AND reason = 'completed' AND game_mode IN ('dualnback-classic')
       )
       SELECT MAX(n_level), SUM(total_hits)
       FROM filtered_sessions`,
      [USER_ID],
    );
    console.log(`\n  [getPerformanceStats+mode] EXPLAIN QUERY PLAN:\n${plan}`);
  });

  it('getModalityStats — plan (full scan? json_valid non-indexable)', () => {
    const plan = db.explainQueryPlan(
      `WITH filtered_sessions AS (
         SELECT * FROM session_summaries WHERE user_id = ? AND reason = 'completed'
       )
       SELECT by_modality FROM filtered_sessions
       WHERE by_modality IS NOT NULL AND json_valid(by_modality) = 1`,
      COMMON_PARAMS,
    );
    console.log(`\n  [getModalityStats] EXPLAIN QUERY PLAN:\n${plan}`);
  });

  it('getTimeSeries — plan (GROUP BY created_date doit éviter TEMP B-TREE)', () => {
    const plan = db.explainQueryPlan(
      `WITH filtered_sessions AS (
         SELECT * FROM session_summaries WHERE user_id = ? AND reason = 'completed'
       )
       SELECT created_date, COUNT(*) FROM filtered_sessions
       GROUP BY created_date ORDER BY created_date ASC`,
      COMMON_PARAMS,
    );
    console.log(`\n  [getTimeSeries] EXPLAIN QUERY PLAN:\n${plan}`);
  });

  it('candidat : index partiel (user_id, reason) WHERE reason = completed — diff plan', () => {
    // Crée un index candidat et compare le plan
    db.exec(`
      CREATE INDEX IF NOT EXISTS bench_cand_user_reason_idx
      ON session_summaries(user_id, reason)
      WHERE reason = 'completed'
    `);
    const plan = db.explainQueryPlan(
      `WITH filtered_sessions AS (
         SELECT * FROM session_summaries WHERE user_id = ? AND reason = 'completed'
       )
       SELECT by_modality FROM filtered_sessions
       WHERE by_modality IS NOT NULL AND json_valid(by_modality) = 1`,
      COMMON_PARAMS,
    );
    console.log(`\n  [getModalityStats + index partiel candidat] EXPLAIN QUERY PLAN:\n${plan}`);
  });
});

// =============================================================================
// Suite 4 — getSession cost (bottleneck projection batch)
//
// Mesure le coût réel du pattern actuel :
//   rebuildMissingSummaries → N × getSession(sessionId) → projection JS → insert
//
// Compare avec l'alternative :
//   1 scan IN(...) pour charger toutes les sessions en une requête
// =============================================================================

describe('Bench › 4. getSession cost (bottleneck projection)', () => {
  /**
   * Mini adapter inline — uses session_events (JSON blob per session).
   * Isole le coût DB pur sans les dépendances PowerSync.
   */
  class SessionEventsBenchDb {
    readonly raw: Database;

    constructor() {
      this.raw = new Database(':memory:');
      this.raw.exec(SQLITE_SCHEMA);
    }

    /** Write a full session as a JSON blob into session_events */
    writeSession(sessionId: string, events: Record<string, unknown>[]): void {
      const eventsJson = JSON.stringify(events);
      const now = new Date().toISOString();
      this.raw
        .query(
          `INSERT OR REPLACE INTO session_events (id, session_id, events_json, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(sessionId, sessionId, eventsJson, now);
    }

    /** Pattern ACTUEL : 1 requête par session (O(N) queries) */
    getSession(sessionId: string): Record<string, unknown>[] {
      const row = this.raw
        .query('SELECT events_json FROM session_events WHERE session_id = ? LIMIT 1')
        .get(sessionId) as { events_json: string } | undefined;
      if (!row?.events_json) return [];
      return JSON.parse(row.events_json) as Record<string, unknown>[];
    }

    /** Pattern ALTERNATIF : 1 requête IN(...) pour N sessions */
    getSessionsBatch(sessionIds: string[]): Map<string, Record<string, unknown>[]> {
      if (sessionIds.length === 0) return new Map();
      const placeholders = sessionIds.map(() => '?').join(', ');
      const rows = this.raw
        .query(
          `SELECT session_id, events_json FROM session_events
           WHERE session_id IN (${placeholders})`,
        )
        .all(...sessionIds) as { session_id: string; events_json: string }[];

      const result = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        result.set(row.session_id, JSON.parse(row.events_json) as Record<string, unknown>[]);
      }
      return result;
    }

    close(): void {
      this.raw.close();
    }
  }

  function seedSessionEvents(
    db: SessionEventsBenchDb,
    sessionCount: number,
    eventsPerSession: number,
  ): string[] {
    const sessionIds: string[] = [];
    const tx = db.raw.transaction(() => {
      for (let s = 0; s < sessionCount; s++) {
        const sessionId = `bench-session-${s}`;
        sessionIds.push(sessionId);

        const events: Record<string, unknown>[] = [];
        events.push({ id: crypto.randomUUID(), type: 'SESSION_STARTED', sessionId, timestamp: Date.now(), schemaVersion: 1, nLevel: 2 });
        for (let e = 0; e < eventsPerSession - 2; e++) {
          events.push({ id: crypto.randomUUID(), type: 'TRIAL_PRESENTED', sessionId, timestamp: Date.now(), schemaVersion: 1, trialIndex: e });
        }
        events.push({ id: crypto.randomUUID(), type: 'SESSION_ENDED', sessionId, timestamp: Date.now(), schemaVersion: 1, reason: 'completed' });

        db.writeSession(sessionId, events);
      }
    });
    tx();
    return sessionIds;
  }

  for (const [sessionCount, eventsPerSession] of [
    [20, 20],
    [100, 20],
    [100, 150],
    [500, 20],
  ] as const) {
    it(`${sessionCount} sessions × ${eventsPerSession} events/session — séquentiel vs batch`, () => {
      const db = new SessionEventsBenchDb();
      const sessionIds = seedSessionEvents(db, sessionCount, eventsPerSession);
      const totalEvents = sessionCount * eventsPerSession;

      // Warm-up (1 session)
      db.getSession(sessionIds[0]!);

      // Pattern actuel : N × getSession()
      const { ms: seqMs } = timed(() => {
        for (const id of sessionIds) db.getSession(id);
      });

      // Pattern alternatif : 1 × getSessionsBatch()
      const { result: batchResult, ms: batchMs } = timed(() => db.getSessionsBatch(sessionIds));

      const speedup = seqMs / batchMs;

      header(`${sessionCount} sessions × ${eventsPerSession} events = ${totalEvents} events total`);
      row(`Séquentiel  (${sessionCount} × getSession)`, seqMs);
      row(`Batch       (1 × getSessionsBatch)`, batchMs);
      row(`Coût/session séquentiel`, seqMs / sessionCount);
      console.log(
        `    🚀 Speedup batch : ×${speedup.toFixed(1)}` +
          `  (${batchResult.size} sessions récupérées)`,
      );

      db.close();
    });
  }
});
