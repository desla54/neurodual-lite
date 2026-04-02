/**
 * JourneyProgressionObserver
 *
 * Watches for completed sessions via usePipelineState and updates the
 * journey owned by the report in journey_state_projection.
 *
 * Supports all journey protocols:
 * - NeuroDual Mix: +10% per session with accuracy >= 85%
 * - DNB Classic (Jaeggi): error-based level up/down
 * - Brain Workshop: score-based with strike system
 */

import { usePipelineState } from '@neurodual/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import type { JourneyState } from '@neurodual/logic';
import { useSettingsStore } from '../stores/settings-store';
import { usePersistence } from '../providers';
import { applySessionToJourney, buildFreshJourneyState } from '../lib/journey-progression';
import { extractJourneyProgressionUpdate } from '../lib/journey-progression-update';

// ---------------------------------------------------------------------------
// SQLite read/write helpers
// ---------------------------------------------------------------------------

interface SQLPort {
  query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

async function readJourneyState(db: SQLPort, journeyId: string): Promise<JourneyState | null> {
  const result = await db.query<{ state_json: string }>(
    'SELECT state_json FROM journey_state_projection WHERE journey_id = ? LIMIT 1',
    [journeyId],
  );
  const rows = result.rows;
  if (rows.length === 0 || !rows[0]?.state_json) return null;
  try {
    return JSON.parse(rows[0].state_json) as JourneyState;
  } catch {
    return null;
  }
}

async function writeJourneyState(
  db: SQLPort,
  journeyId: string,
  journeyGameMode: string,
  state: JourneyState,
): Promise<void> {
  const stateJson = JSON.stringify(state);
  const now = new Date().toISOString();
  const key = journeyId;

  await db.execute(
    `INSERT OR IGNORE INTO journey_state_projection
       (id, user_id, journey_id, journey_game_mode, state_json, updated_at, rules_version)
     VALUES (?, '', ?, ?, ?, ?, 1)`,
    [key, journeyId, journeyGameMode, stateJson, now],
  );
  await db.execute(
    `UPDATE journey_state_projection
     SET state_json = ?, journey_game_mode = ?, updated_at = ?
     WHERE id = ?`,
    [stateJson, journeyGameMode, now, key],
  );
}

// ---------------------------------------------------------------------------
// Observer Component
// ---------------------------------------------------------------------------

export function JourneyProgressionObserver(): ReactNode {
  const pipelineState = usePipelineState();
  const persistence = usePersistence();
  const savedJourneys = useSettingsStore((s) => s.savedJourneys);

  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!persistence) return;

    const report = pipelineState.result?.report;
    if (!report) return;

    const progressionUpdate = extractJourneyProgressionUpdate(report);
    if (!progressionUpdate) return;

    const { sessionId, journeyId, journeyGameMode, result } = progressionUpdate;
    if (processedRef.current.has(sessionId)) return;

    const journey = savedJourneys.find((entry) => entry.id === journeyId);
    const startLevel = journey?.startLevel ?? (journeyGameMode === 'neurodual-mix' ? 1 : 2);
    const targetLevel = journey?.targetLevel ?? 5;

    processedRef.current.add(sessionId);

    void (async () => {
      try {
        let state = await readJourneyState(persistence, journeyId);
        if (!state) {
          state = buildFreshJourneyState(startLevel, targetLevel, journeyGameMode);
        }

        const updated = applySessionToJourney(state, journeyGameMode, result);
        if (!updated) return;

        await writeJourneyState(persistence, journeyId, journeyGameMode, updated);
      } catch (err) {
        console.warn('[JourneyProgressionObserver] Failed to update journey state:', err);
      }
    })();
  }, [pipelineState.result?.report, persistence, savedJourneys]);

  return null;
}
