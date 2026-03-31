/**
 * useTurnsLoader
 *
 * Lazy-loads turn-by-turn detail for session reports.
 * Fetches events on demand and projects them into TurnSummary[].
 *
 * Uses canonical mode IDs from persisted sessions.
 *
 * @see packages/logic/src/utils/mode-normalizer.ts
 * @see packages/logic/src/specs/index.ts - AllSpecs registry (SSOT)
 */

import { useState, useCallback } from 'react';
import {
  projectTempoTurns,
  projectMemoTurns,
  projectPlaceTurns,
  projectTraceTurns,
  projectTrackTurns,
  projectCognitiveTaskTurns,
  normalizeModeId,
  AllSpecs,
  type TurnSummary,
  type GameEvent,
  type PlaceEvent,
  type MemoEvent,
  type TraceEvent,
  type MotEvent,
  type Trial,
} from '@neurodual/logic';
import { useHistoryAdapter } from '../context/SessionHistoryContext';

export type TurnsLoaderState = 'idle' | 'loading' | 'loaded' | 'error';

export interface TurnsLoaderResult {
  /** Current loading state */
  state: TurnsLoaderState;
  /** Loaded turns (empty until loaded) */
  turns: readonly TurnSummary[];
  /** Error message if state is 'error' */
  error: string | null;
  /** Trigger loading */
  load: () => Promise<void>;
}

/**
 * Hook for lazy-loading turn-by-turn session detail.
 *
 * @param sessionId - The session ID to load events for
 * @param gameMode - The game mode to determine which projector to use
 * @returns TurnsLoaderResult with state, turns, and load function
 */
export function useTurnsLoader(sessionId: string, gameMode: string): TurnsLoaderResult {
  const historyAdapter = useHistoryAdapter();
  const [state, setState] = useState<TurnsLoaderState>('idle');
  const [turns, setTurns] = useState<readonly TurnSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (state === 'loading' || state === 'loaded') return;

    setState('loading');
    setError(null);

    try {
      const events = await historyAdapter.getSessionEvents(sessionId);

      if (events.length === 0) {
        // No events found (legacy session or imported)
        setTurns([]);
        setState('loaded');
        return;
      }

      // Project based on game mode
      let projectedTurns: TurnSummary[] = [];

      if (isCognitiveTaskSession(events as { type: string }[])) {
        projectedTurns = projectCognitiveTaskTurns(events as { type: string }[]);
      } else if (isTrackMode(gameMode)) {
        projectedTurns = projectTrackTurns(events as MotEvent[]);
      } else if (isTempoMode(gameMode)) {
        projectedTurns = projectTempoTurns(events as GameEvent[]);
      } else if (isPlaceMode(gameMode)) {
        projectedTurns = projectPlaceTurns(events as PlaceEvent[]);
      } else if (isMemoMode(gameMode)) {
        // Memo needs trials data - extract from events
        const trials = extractTrialsFromEvents(events as GameEvent[]);
        projectedTurns = projectMemoTurns(events as MemoEvent[], trials);
      } else if (isTraceMode(gameMode)) {
        projectedTurns = projectTraceTurns(events as TraceEvent[]);
      }

      setTurns(projectedTurns);
      setState('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load turns');
      setState('error');
    }
  }, [sessionId, gameMode, historyAdapter, state]);

  return { state, turns, error, load };
}

// =============================================================================
// Helpers (Spec-Driven)
// =============================================================================

/**
 * Check if a mode uses tempo-style session (GameSession).
 * Uses spec sessionType as SSOT.
 */
function isTempoMode(gameMode: string): boolean {
  const normalized = normalizeModeId(gameMode);
  if (normalized === 'dual-track') return false;
  const spec = AllSpecs[normalized as keyof typeof AllSpecs];
  return spec?.sessionType === 'GameSession';
}

function isTrackMode(gameMode: string): boolean {
  return normalizeModeId(gameMode) === 'dual-track';
}

/**
 * Check if a mode uses place-style session (PlaceSession).
 * Uses spec sessionType as SSOT.
 */
function isPlaceMode(gameMode: string): boolean {
  const normalized = normalizeModeId(gameMode);
  const spec = AllSpecs[normalized as keyof typeof AllSpecs];
  return spec?.sessionType === 'PlaceSession';
}

/**
 * Check if a mode uses memo-style session (MemoSession).
 * Uses spec sessionType as SSOT.
 */
function isMemoMode(gameMode: string): boolean {
  const normalized = normalizeModeId(gameMode);
  const spec = AllSpecs[normalized as keyof typeof AllSpecs];
  return spec?.sessionType === 'MemoSession';
}

/**
 * Check if a mode uses trace-style session (TraceSession).
 */
function isTraceMode(gameMode: string): boolean {
  const normalized = normalizeModeId(gameMode);
  const spec = AllSpecs[normalized as keyof typeof AllSpecs];
  return spec?.sessionType === 'TraceSession';
}

/**
 * Check if events belong to a generic cognitive task session.
 * Detected by the presence of COGNITIVE_TASK_SESSION_STARTED event.
 */
function isCognitiveTaskSession(events: readonly { type: string }[]): boolean {
  return events.some((e) => e.type === 'COGNITIVE_TASK_SESSION_STARTED');
}

/**
 * Extract Trial[] from events for Memo projector.
 */
function extractTrialsFromEvents(events: GameEvent[]): Trial[] {
  const trials: Trial[] = [];
  for (const event of events) {
    if (event.type === 'TRIAL_PRESENTED' && 'trial' in event) {
      trials.push((event as { trial: Trial }).trial);
    }
  }
  return trials;
}
