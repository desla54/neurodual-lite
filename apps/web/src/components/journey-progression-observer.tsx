/**
 * JourneyProgressionObserver
 *
 * Watches for completed sessions via usePipelineState and updates the
 * active journey's progression in journey_state_projection.
 *
 * Supports all journey protocols:
 * - NeuroDual Mix: +10% per session with accuracy >= 85%
 * - DNB Classic (Jaeggi): error-based level up/down
 * - Brain Workshop: score-based with strike system
 */

import { usePipelineState } from '@neurodual/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import type { JourneyState, ModalityId } from '@neurodual/logic';
import { useSettingsStore } from '../stores/settings-store';
import { usePersistence } from '../providers';
import {
  applySessionToJourney,
  buildFreshJourneyState,
  type JourneySessionResult,
} from '../lib/journey-progression';

// ---------------------------------------------------------------------------
// Journey option → gameMode mapping
// ---------------------------------------------------------------------------

const JOURNEY_ID_TO_GAME_MODE: Record<string, string> = {
  'neurodual-mix-journey': 'neurodual-mix',
  'dualnback-classic-journey': 'dualnback-classic',
  'sim-brainworkshop-journey': 'sim-brainworkshop',
};

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
  const activeJourneyId = useSettingsStore((s) => s.ui.activeJourneyId);
  const activeJourney = useSettingsStore((s) =>
    s.savedJourneys.find((j) => j.id === activeJourneyId),
  );

  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!persistence) return;

    const journeyGameMode = JOURNEY_ID_TO_GAME_MODE[activeJourneyId];
    if (!journeyGameMode) return;

    const report = pipelineState.result?.report;
    if (!report) return;

    const sessionId = report.sessionId;
    if (!sessionId || processedRef.current.has(sessionId)) return;

    // Resolve effective gameMode: cognitive-task with taskType='stroop-flex' → 'stroop-flex'
    let gameMode = report.gameMode as string;
    if (gameMode === 'cognitive-task' && report.taskType === 'stroop-flex') {
      gameMode = 'stroop-flex';
    }
    const nLevel = report.nLevel;
    const accuracy = report.unifiedAccuracy;

    if (!gameMode || nLevel == null || accuracy == null) return;

    // Build per-modality errors for Jaeggi protocol
    const modalityErrors: number[] = [];
    if (report.byModality) {
      for (const stats of Object.values(report.byModality as Record<ModalityId, { misses: number | null; falseAlarms: number | null }>)) {
        const misses = stats.misses ?? 0;
        const fa = stats.falseAlarms ?? 0;
        modalityErrors.push(misses + fa);
      }
    }

    const result: JourneySessionResult = {
      gameMode,
      nLevel,
      accuracy,
      upsScore: report.ups?.score,
      modalityErrors: modalityErrors.length > 0 ? modalityErrors : undefined,
    };

    processedRef.current.add(sessionId);

    const startLevel = activeJourney?.startLevel ?? (journeyGameMode === 'neurodual-mix' ? 1 : 2);
    const targetLevel = activeJourney?.targetLevel ?? 5;

    void (async () => {
      try {
        let state = await readJourneyState(persistence, activeJourneyId);
        if (!state) {
          state = buildFreshJourneyState(startLevel, targetLevel, journeyGameMode);
        }

        const updated = applySessionToJourney(state, journeyGameMode, result);
        if (!updated) return;

        await writeJourneyState(persistence, activeJourneyId, journeyGameMode, updated);
      } catch (err) {
        console.warn('[JourneyProgressionObserver] Failed to update journey state:', err);
      }
    })();
  }, [pipelineState.result?.report, activeJourneyId, activeJourney, persistence]);

  return null;
}
