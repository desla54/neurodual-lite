/**
 * useSessionCompletion Hook
 *
 * Unified session completion orchestrator for React.
 * Single entry point for completing sessions across all game modes.
 *
 * Handles:
 * - Session scoring (UPS, passed, nextLevel)
 * - XP calculation and progression update
 * - Badge checking
 * - Report projection availability
 * - Journey recording (optional)
 * - Cloud sync (optional)
 * - Reward detection on level up
 *
 * Works with ALL session types:
 * - Tempo (Catch, Dual N-Back Classic, BW)
 * - Flow (Dual Place)
 * - Recall (Dual Memo)
 * - DualPick (Dual Pick)
 * - Trace (Dual Trace)
 *
 * This hook always delegates to the XState SessionEndPipeline adapter
 * for robust, recoverable session completion.
 */

import { useCallback, useRef, useState } from 'react';
import {
  SESSION_START_EVENT_TYPES,
  type SessionCompletionInput,
  type SessionCompletionWithXPResult,
  type SessionEndPipelinePort,
} from '@neurodual/logic';

import { useRewardDetection } from './use-reward-detection';
import { getPipelineAdapter } from '../queries/pipeline';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended result with level-up information.
 * The projector doesn't know about progression history,
 * so leveledUp is calculated in the hook.
 */
export interface SessionCompletionResultWithLevel extends SessionCompletionWithXPResult {
  /** Whether the user leveled up */
  readonly leveledUp: boolean;
  /** New level after this session (1-based) */
  readonly newLevel: number;
}

export interface UseSessionCompletionOptions {
  /** Cloud sync function (fire and forget) */
  syncToCloud?: () => Promise<void>;
  /** Callback when completion is done */
  onComplete?: (result: SessionCompletionResultWithLevel) => void;
}

export interface UseSessionCompletionReturn {
  /**
   * Complete a session.
   * Call this once when session ends (idempotent).
   *
   * @param input - Session completion input (discriminated by mode)
   * @returns Completion result with XP, badges, report, and level info
   */
  complete: (input: SessionCompletionInput) => Promise<SessionCompletionResultWithLevel | null>;
  /** Last completion result (for display in UI) */
  result: SessionCompletionResultWithLevel | null;
  /** Whether completion is in progress */
  isProcessing: boolean;
  /** Error if completion failed */
  error: Error | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

const SESSION_START_TYPES: ReadonlySet<string> = SESSION_START_EVENT_TYPES;

function hasAbandonedEndEvent(events: readonly unknown[]): boolean {
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue;
    const record = event as Record<string, unknown>;
    if (record['reason'] !== 'abandoned') continue;
    const type = String(record['type'] ?? '');
    if (type === 'SESSION_ENDED' || type.endsWith('_SESSION_ENDED')) {
      return true;
    }
  }
  return false;
}

function isAbandonedCompletionInput(input: SessionCompletionInput): boolean {
  if ('reason' in input && input.reason === 'abandoned') {
    return true;
  }

  if (input.mode === 'trace' && input.summary.completed === false) {
    return true;
  }

  return hasAbandonedEndEvent(input.events);
}

function isJourneyInput(input: SessionCompletionInput): boolean {
  const events = (input as unknown as { events?: readonly unknown[] }).events;
  if (!Array.isArray(events)) return false;
  for (const e of events) {
    if (typeof e !== 'object' || e === null) continue;
    const r = e as Record<string, unknown>;
    if (SESSION_START_TYPES.has(String(r['type'] ?? ''))) {
      return r['playContext'] === 'journey';
    }
  }
  return false;
}

function waitForPipelineProjectedResult(
  pipeline: SessionEndPipelinePort,
  input: SessionCompletionInput,
  options?: { timeoutMs?: number },
): Promise<{ result: SessionCompletionWithXPResult; leveledUp: boolean; newLevel: number }> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  const sessionId = input.sessionId;
  const expectsJourneyContext = isJourneyInput(input);
  const isReady = (state: ReturnType<SessionEndPipelinePort['getState']>): boolean => {
    if (state.sessionId !== sessionId || !state.result) return false;
    if (expectsJourneyContext) {
      // Wait for journeyContext to be set (record_journey stage completed).
      // Fall through if record_journey was skipped (no journey adapter configured).
      const journeyContextSet = state.result.report.journeyContext !== undefined;
      const recordJourneySkipped =
        state.stage !== 'idle' &&
        state.stage !== 'persist_events' &&
        state.stage !== 'project_summary' &&
        state.stage !== 'record_journey';
      return journeyContextSet || recordJourneySkipped;
    }
    return true;
  };

  const state = pipeline.getState();

  if (isReady(state) && state.result) {
    return Promise.resolve({
      result: state.result,
      leveledUp: state.leveledUp,
      newLevel: state.newLevel,
    });
  }

  if (state.sessionId === sessionId && state.stage === 'error') {
    return Promise.reject(state.error ?? new Error('Pipeline failed'));
  }

  return new Promise((resolve, reject) => {
    let timedOut = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = pipeline.subscribe((next) => {
      if (timedOut || settled) return;
      if (next.sessionId !== sessionId) return;

      if (isReady(next) && next.result) {
        settled = true;
        unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          result: next.result,
          leveledUp: next.leveledUp,
          newLevel: next.newLevel,
        });
        return;
      }

      if (next.stage === 'error') {
        settled = true;
        unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
        reject(next.error ?? new Error('Pipeline failed'));
      }
    });

    if (settled) return;

    timeoutId = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      settled = true;
      unsubscribe();
      const current = pipeline.getState();
      reject(
        new Error(
          `[SessionCompletion] Timeout waiting for projected result (session=${sessionId}, stage=${current.stage}, retry=${current.retryCount})`,
        ),
      );
    }, timeoutMs);
  });
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Unified session completion hook.
 * Orchestrates all completion logic in one place.
 */
export function useSessionCompletion(
  options?: UseSessionCompletionOptions,
): UseSessionCompletionReturn {
  const { checkAndGrantRewards } = useRewardDetection();

  // State
  const [result, setResult] = useState<SessionCompletionResultWithLevel | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Idempotence: track processed sessions (with size limit to prevent memory leak)
  const MAX_PROCESSED_SESSIONS = 50;
  const processedRef = useRef<Set<string>>(new Set());
  const skippedRef = useRef<Set<string>>(new Set());
  const resultRef = useRef<SessionCompletionResultWithLevel | null>(null);
  const inFlightRef = useRef<Map<string, Promise<SessionCompletionResultWithLevel | null>>>(
    new Map(),
  );

  // Helper to add sessionId with size limit (LRU-style: remove oldest when full)
  const markProcessed = useCallback((sessionId: string) => {
    const set = processedRef.current;
    if (set.size >= MAX_PROCESSED_SESSIONS) {
      // Remove the first (oldest) entry to prevent unbounded growth
      const firstKey = set.values().next().value;
      if (firstKey) set.delete(firstKey);
    }
    set.add(sessionId);
  }, []);

  const markSkipped = useCallback((sessionId: string) => {
    const set = skippedRef.current;
    if (set.size >= MAX_PROCESSED_SESSIONS) {
      const firstKey = set.values().next().value;
      if (firstKey) set.delete(firstKey);
    }
    set.add(sessionId);
  }, []);

  const complete = useCallback(
    async (input: SessionCompletionInput): Promise<SessionCompletionResultWithLevel | null> => {
      // Idempotence check
      if (processedRef.current.has(input.sessionId)) {
        return resultRef.current;
      }
      if (skippedRef.current.has(input.sessionId)) {
        return null;
      }
      if (isAbandonedCompletionInput(input)) {
        markSkipped(input.sessionId);
        return null;
      }

      const inFlight = inFlightRef.current.get(input.sessionId);
      if (inFlight) {
        return inFlight;
      }

      const completionPromise = (async () => {
        try {
          setIsProcessing(true);
          setError(null);

          const pipeline = getPipelineAdapter();
          const pipelineDonePromise = pipeline.start({
            completionInput: input,
            syncEnabled: options?.syncToCloud !== undefined,
          });

          const projected = await waitForPipelineProjectedResult(pipeline, input);

          const extendedResult: SessionCompletionResultWithLevel = {
            ...projected.result,
            leveledUp: projected.leveledUp,
            newLevel: projected.newLevel,
          };

          // Mark as processed (with size limit)
          markProcessed(input.sessionId);
          resultRef.current = extendedResult;

          // IMMEDIATE: Show report NOW (no lag)
          setResult(extendedResult);
          options?.onComplete?.(extendedResult);

          // BACKGROUND: Await pipeline completion (persistence, sync, etc.) and surface errors if any.
          void pipelineDonePromise.catch((pipelineError) => {
            const errorObj =
              pipelineError instanceof Error
                ? pipelineError
                : new Error(String(pipelineError ?? 'Pipeline failed'));
            setError(errorObj);
            console.error('[SessionCompletion] Pipeline failed after projection:', errorObj);
          });

          // BACKGROUND: Rewards on level up (must be done in React context)
          (async () => {
            try {
              if (extendedResult.leveledUp) {
                await checkAndGrantRewards(extendedResult.newLevel);
              }
            } catch (rewardError) {
              console.error('[SessionCompletion] Background reward detection failed:', rewardError);
            }
          })();

          return extendedResult;
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error('Session completion failed');
          setError(errorObj);
          console.error('[SessionCompletion] Error:', errorObj);
          return null;
        } finally {
          inFlightRef.current.delete(input.sessionId);
          setIsProcessing(false);
        }
      })();

      inFlightRef.current.set(input.sessionId, completionPromise);
      return completionPromise;
    },
    [options, checkAndGrantRewards, markProcessed, markSkipped],
  );

  return {
    complete,
    result,
    isProcessing,
    error,
  };
}
