/**
 * Pipeline Queries
 *
 * TanStack Query integration for the SessionEndPipeline.
 * Provides hooks for session completion with XState-based orchestration.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  SessionEndPipelinePort,
  SessionEndPipelineInput,
  SessionCompletionWithXPResult,
  PipelineState,
  PipelineStage,
  SessionCompletionInput,
} from '@neurodual/logic';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let pipelineAdapter: SessionEndPipelinePort | null = null;

const IDLE_PIPELINE_STATE: PipelineState = {
  stage: 'idle',
  sessionId: null,
  progress: 0,
  error: null,
  retryCount: 0,
  result: null,
  leveledUp: false,
  newLevel: 1,
};

export function setPipelineAdapter(adapter: SessionEndPipelinePort): void {
  pipelineAdapter = adapter;
}

export function getPipelineAdapter(): SessionEndPipelinePort {
  if (!pipelineAdapter) {
    throw new Error('Pipeline adapter not initialized. Call setPipelineAdapter first.');
  }
  return pipelineAdapter;
}

export function hasPipelineAdapter(): boolean {
  return pipelineAdapter !== null;
}

// =============================================================================
// Extended Result Type
// =============================================================================

/**
 * Extended result with level-up information.
 * Matches the structure from useSessionCompletion for compatibility.
 */
export interface SessionCompletionResultWithLevel extends SessionCompletionWithXPResult {
  readonly leveledUp: boolean;
  readonly newLevel: number;
}

// =============================================================================
// Queries / Subscriptions
// =============================================================================

/**
 * Subscribe to pipeline state changes.
 * Uses useSyncExternalStore for proper React 18 concurrent mode support.
 */
export function usePipelineState(): PipelineState {
  const subscribe = useCallback((callback: () => void) => {
    if (!hasPipelineAdapter()) {
      return () => {};
    }
    return getPipelineAdapter().subscribe(() => callback());
  }, []);

  const getSnapshot = useCallback((): PipelineState => {
    if (!hasPipelineAdapter()) {
      return IDLE_PIPELINE_STATE;
    }
    return getPipelineAdapter().getState();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to pipeline stage for progress UI.
 */
export function usePipelineStage(): { stage: PipelineStage; progress: number } {
  const state = usePipelineState();
  return { stage: state.stage, progress: state.progress };
}

/**
 * Check if pipeline is currently running.
 */
export function usePipelineIsRunning(): boolean {
  const state = usePipelineState();
  return state.stage !== 'idle' && state.stage !== 'done' && state.stage !== 'error';
}

/**
 * Check if pipeline has an error.
 */
export function usePipelineError(): Error | null {
  const state = usePipelineState();
  return state.error;
}

// =============================================================================
// Mutations
// =============================================================================

export interface CompleteSessionOptions {
  syncEnabled?: boolean;
}

/**
 * Complete a session using the pipeline.
 * This is the main mutation for session completion.
 */
export function useCompleteSession(): UseMutationResult<
  SessionCompletionResultWithLevel,
  Error,
  { input: SessionCompletionInput; options?: CompleteSessionOptions }
> {
  return useMutation<
    SessionCompletionResultWithLevel,
    Error,
    { input: SessionCompletionInput; options?: CompleteSessionOptions }
  >({
    mutationFn: async ({ input, options }): Promise<SessionCompletionResultWithLevel> => {
      const pipelineInput: SessionEndPipelineInput = {
        completionInput: input,
        syncEnabled: options?.syncEnabled ?? false,
      };

      const result = await getPipelineAdapter().start(pipelineInput);
      const state = getPipelineAdapter().getState();

      return {
        ...result,
        leveledUp: state.leveledUp,
        newLevel: state.newLevel,
      };
    },
    // Note: UI refresh is handled automatically via PowerSync watched queries.
    // Events persisted → SQLite changes → useSessionsQuery auto-updates → useMemo recalculates derived data
  });
}

/**
 * Retry a failed pipeline.
 */
export function usePipelineRetry(): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      getPipelineAdapter().retry();
    },
  });
}

/**
 * Cancel a running or failed pipeline.
 */
export function usePipelineCancel(): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      getPipelineAdapter().cancel();
    },
  });
}

/**
 * Recover an interrupted session (from crash/refresh).
 */
export function usePipelineRecover(): UseMutationResult<
  SessionCompletionResultWithLevel | null,
  Error,
  void
> {
  return useMutation<SessionCompletionResultWithLevel | null, Error, void>({
    mutationFn: async (): Promise<SessionCompletionResultWithLevel | null> => {
      const result = await getPipelineAdapter().recoverInterrupted();
      if (!result) return null;

      const state = getPipelineAdapter().getState();
      return {
        ...result,
        leveledUp: state.leveledUp,
        newLevel: state.newLevel,
      };
    },
    // Note: UI refresh is handled automatically via event sourcing
  });
}
