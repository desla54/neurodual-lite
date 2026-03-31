/**
 * SessionEndPipelinePort
 *
 * Interface for the session completion pipeline.
 * Orchestrates all end-of-session side effects in a deterministic,
 * idempotent, and recoverable sequence.
 *
 * Pipeline stages:
 * 1. PERSIST_EVENTS - Save raw events to EventStore
 * 2. PROJECT_SUMMARY - Compute SessionCompletionResult (pure)
 * 3. RECORD_JOURNEY - Record journey attempt + build JourneyContext (if applicable)
 * 4. SAVE_BADGES - Persist newly unlocked badges (via BADGE_UNLOCKED events)
 * 5. SYNC_CLOUD - Push to cloud (optional, fire-and-forget)
 *
 * Each stage is:
 * - Idempotent: Can be retried without side effects
 * - Observable: UI can track progress
 * - Recoverable: If app crashes, resume from last completed stage
 */

import type {
  SessionCompletionInput,
  SessionCompletionWithXPResult,
} from '../engine/session-completion-projector';

// =============================================================================
// Pipeline States
// =============================================================================

/**
 * Pipeline stage identifiers.
 * Ordered sequence of completion steps.
 */
export type PipelineStage =
  | 'idle'
  | 'persist_events'
  | 'project_summary'
  | 'save_badges'
  | 'record_journey'
  | 'sync_cloud'
  | 'done'
  | 'error';

/**
 * Pipeline execution state.
 */
export interface PipelineState {
  /** Current stage */
  readonly stage: PipelineStage;
  /** Session being processed */
  readonly sessionId: string | null;
  /** Progress (0-100) */
  readonly progress: number;
  /** Error if stage === 'error' */
  readonly error: Error | null;
  /** Number of retry attempts for current stage */
  readonly retryCount: number;
  /** Completion result (available after project_summary) */
  readonly result: SessionCompletionWithXPResult | null;
  /** Level up info */
  readonly leveledUp: boolean;
  readonly newLevel: number;
}

// =============================================================================
// Pipeline Input
// =============================================================================

/**
 * Input to start the pipeline.
 */
export interface SessionEndPipelineInput {
  /** Session completion input (from session) */
  readonly completionInput: SessionCompletionInput;
  /** Whether to sync to cloud */
  readonly syncEnabled: boolean;
}

// =============================================================================
// Pipeline Events (for XState)
// =============================================================================

/**
 * Events that can be sent to the pipeline.
 */
export type SessionEndPipelineEvent =
  | { type: 'START'; input: SessionEndPipelineInput }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'STAGE_COMPLETE'; stage: PipelineStage }
  | { type: 'STAGE_ERROR'; stage: PipelineStage; error: Error };

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for session end pipeline.
 * Implemented by XState machine adapter in infra.
 */
export interface SessionEndPipelinePort {
  // ===========================================================================
  // State
  // ===========================================================================

  /** Get current pipeline state */
  getState(): PipelineState;

  /** Check if pipeline is idle (ready to start) */
  isIdle(): boolean;

  /** Check if pipeline is running */
  isRunning(): boolean;

  /** Check if pipeline completed successfully */
  isDone(): boolean;

  /** Check if pipeline is in error state */
  hasError(): boolean;

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Start the pipeline.
   * Idempotent: if already running for same sessionId, returns current state.
   *
   * @param input - Pipeline input with completion data
   * @returns Promise that resolves when pipeline completes (or rejects on error)
   */
  start(input: SessionEndPipelineInput): Promise<SessionCompletionWithXPResult>;

  /**
   * Retry from current failed stage.
   * Only valid when state.stage === 'error'.
   */
  retry(): void;

  /**
   * Cancel the pipeline.
   * Resets to idle state. Use with caution - may leave partial data.
   */
  cancel(): void;

  /**
   * Check for and resume any interrupted pipeline.
   * Called on app startup to recover from crashes.
   *
   * @returns The interrupted session result if recovered, null otherwise
   */
  recoverInterrupted(): Promise<SessionCompletionWithXPResult | null>;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to pipeline state changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: (state: PipelineState) => void): () => void;

  /**
   * Subscribe to stage transitions.
   * Useful for UI progress indicators.
   */
  subscribeStage(listener: (stage: PipelineStage, progress: number) => void): () => void;

  /** Optional cleanup hook for long-lived implementations (eg. XState actors). */
  dispose?: () => void;
}

// =============================================================================
// Recovery State (persisted)
// =============================================================================

/**
 * Persisted state for crash recovery.
 * Stored in DB so pipeline can resume after app restart.
 */
export interface PersistedPipelineState {
  /** Session ID being processed */
  readonly sessionId: string;
  /** Last completed stage */
  readonly lastCompletedStage: PipelineStage;
  /** Original input */
  readonly input: SessionEndPipelineInput;
  /** Partial result (if available) */
  readonly partialResult?: SessionCompletionWithXPResult;
  /** Timestamp when pipeline started */
  readonly startedAt: string;
  /** Timestamp of last update */
  readonly updatedAt: string;
}

// =============================================================================
// Stage Metadata
// =============================================================================

/**
 * Metadata for each pipeline stage.
 * Used for progress calculation and UI display.
 */
export const PIPELINE_STAGES: readonly {
  readonly id: PipelineStage;
  readonly weight: number;
  readonly labelKey: string;
}[] = [
  { id: 'persist_events', weight: 10, labelKey: 'pipeline.persist_events' },
  { id: 'project_summary', weight: 30, labelKey: 'pipeline.project_summary' },
  { id: 'record_journey', weight: 20, labelKey: 'pipeline.record_journey' },
  { id: 'save_badges', weight: 20, labelKey: 'pipeline.save_badges' },
  { id: 'sync_cloud', weight: 20, labelKey: 'pipeline.sync_cloud' },
] as const;

/**
 * Calculate progress percentage for a given stage.
 */
export function calculatePipelineProgress(currentStage: PipelineStage): number {
  if (currentStage === 'idle') return 0;
  if (currentStage === 'done') return 100;
  if (currentStage === 'error') return -1;

  let accumulated = 0;
  for (const stage of PIPELINE_STAGES) {
    if (stage.id === currentStage) {
      return accumulated;
    }
    accumulated += stage.weight;
  }
  return accumulated;
}
