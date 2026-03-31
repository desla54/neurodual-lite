import type { SQLQueryPort } from '@neurodual/logic';

type UiCacheRow = {
  revision: string;
  version: number;
  payload_json: string;
};

export interface UiCacheOptions {
  /** Max payload size to persist (bytes). Larger payloads remain RAM-only. */
  maxPersistBytes?: number;
  /** Keep at most this many rows globally (best-effort). */
  maxRows?: number;
  /** Drop rows older than this many days (best-effort). */
  maxAgeDays?: number;
}

export interface UiCache {
  getOrCompute: <T>(input: {
    userId: string;
    kind: string;
    key: string;
    revision: string;
    version: number;
    compute: () => Promise<T>;
  }) => Promise<T>;
}

export function createUiCache(persistence: SQLQueryPort, options: UiCacheOptions = {}): UiCache {
  const maxPersistBytes = options.maxPersistBytes ?? 250_000;
  const maxRows = options.maxRows ?? 400;
  const maxAgeDays = options.maxAgeDays ?? 60;

  const mem = new Map<string, { revision: string; version: number; value: unknown }>();
  const inFlight = new Map<string, Promise<unknown>>();
  let lastPruneAtMs = 0;

  const pruneBestEffort = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastPruneAtMs < 10 * 60 * 1000) return; // 10min throttle
    lastPruneAtMs = now;
    try {
      await persistence.writeTransaction(async (tx) => {
        await tx.execute(`DELETE FROM ui_cache WHERE updated_at < datetime('now', ?)`, [
          `-${maxAgeDays} days`,
        ]);
        // Keep newest N rows globally.
        await tx.execute(
          `DELETE FROM ui_cache
           WHERE cache_key IN (
             SELECT cache_key FROM ui_cache
             ORDER BY updated_at DESC
             LIMIT -1 OFFSET ?
           )`,
          [maxRows],
        );
      });
    } catch {
      // Best-effort only.
    }
  };

  const getOrCompute: UiCache['getOrCompute'] = async (input) => {
    const cacheKey = `ui:${input.userId}:${input.kind}:${input.key}`;

    const memHit = mem.get(cacheKey);
    if (memHit && memHit.revision === input.revision && memHit.version === input.version) {
      return memHit.value as Awaited<ReturnType<typeof input.compute>>;
    }

    const existing = inFlight.get(cacheKey);
    if (existing) return existing as Promise<Awaited<ReturnType<typeof input.compute>>>;

    const p = (async () => {
      try {
        try {
          const rowRes = await persistence.query<UiCacheRow>(
            `SELECT revision, version, payload_json FROM ui_cache WHERE cache_key = ?`,
            [cacheKey],
          );
          const row = rowRes.rows[0];
          if (row && row.revision === input.revision && row.version === input.version) {
            const parsed = JSON.parse(row.payload_json) as unknown;
            mem.set(cacheKey, {
              revision: input.revision,
              version: input.version,
              value: parsed,
            });
            return parsed as Awaited<ReturnType<typeof input.compute>>;
          }
        } catch {
          // Cache table missing/corrupt - treat as miss.
        }

        const value = await input.compute();
        mem.set(cacheKey, { revision: input.revision, version: input.version, value });

        // Persist best-effort.
        try {
          const payload = JSON.stringify(value);
          const byteLen = payload.length;
          if (byteLen <= maxPersistBytes) {
            await persistence.writeTransaction(async (tx) => {
              await tx.execute(
                `
                INSERT INTO ui_cache (
                  cache_key,
                  user_id,
                  kind,
                  revision,
                  version,
                  updated_at,
                  byte_len,
                  payload_json
                ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                  revision = excluded.revision,
                  version = excluded.version,
                  updated_at = excluded.updated_at,
                  byte_len = excluded.byte_len,
                  payload_json = excluded.payload_json
              `,
                [
                  cacheKey,
                  input.userId,
                  input.kind,
                  input.revision,
                  input.version,
                  byteLen,
                  payload,
                ],
              );
            });
            pruneBestEffort().catch(() => {});
          }
        } catch {
          // Ignore cache persistence failures.
        }

        return value;
      } finally {
        inFlight.delete(cacheKey);
      }
    })();

    inFlight.set(cacheKey, p);
    return p as Promise<Awaited<ReturnType<typeof input.compute>>>;
  };

  return { getOrCompute };
}
