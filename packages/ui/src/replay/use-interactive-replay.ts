/**
 * Interactive Replay Hook
 *
 * Manages interactive replay sessions with user corrections.
 * Uses the InteractiveReplayAdapter (XState machine) for state management.
 * RAF loop sends TICK events for 60fps performance.
 *
 * @see docs/specs/domain-replay-interactif.md
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  GameEvent,
  ModalityId,
  ReplayRun,
  ReplayInteractifPort,
  InteractiveReplayEvent,
  RunScoreDelta,
  InteractiveReplayLifecyclePort,
  InteractiveReplayLifecycleState,
  InteractiveReplaySpeed,
  AudioPort,
  RecoveredReplayState,
} from '@neurodual/logic';
import { useMountEffect } from '../hooks';

// =============================================================================
// Types
// =============================================================================

/** Re-export speed type for backwards compatibility */
export type { InteractiveReplaySpeed } from '@neurodual/logic';

/** Status type (maps to lifecycle state) */
export type InteractiveReplayStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'awaitingCompletion'
  | 'finished';

export interface UseInteractiveReplayOptions {
  /** The adapter for persisting replay data */
  adapter: ReplayInteractifPort;
  /** Session ID of the original session */
  sessionId: string;
  /** Session type for mode-specific handling */
  sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
  /** Events from the parent run (Run 0 or previous run) */
  parentEvents: readonly GameEvent[];
  /** Active modalities for this session */
  activeModalities: readonly ModalityId[];
  /** Parent run ID (null if deriving from Run 0) */
  parentRunId: string | null;
  /** Total duration of the session in ms */
  totalDurationMs: number;
  /** Callback when run is completed */
  onComplete?: (run: ReplayRun, score: RunScoreDelta) => void;
  /** Audio adapter for playing sounds during replay */
  audioAdapter?: AudioPort;
  /** Pre-created lifecycle adapter (optional, creates new one if not provided) */
  lifecycleAdapter?: InteractiveReplayLifecyclePort;
}

export interface UseInteractiveReplayReturn {
  // State
  status: InteractiveReplayStatus;
  run: ReplayRun | null;
  currentTimeMs: number;
  progress: number;
  speed: InteractiveReplaySpeed;
  events: readonly InteractiveReplayEvent[];
  score: RunScoreDelta | null;

  // Actions
  start: () => void;
  recover: (recoveredState: RecoveredReplayState) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setSpeed: (speed: InteractiveReplaySpeed) => void;
  respond: (modality: ModalityId) => void;
  complete: () => void;
  abandon: () => void;

  // Mode-Specific Corrections
  flowDrop: (
    proposalId: string,
    proposalType: 'position' | 'audio' | 'unified',
    proposalValue: number | string,
    targetSlot: number,
  ) => void;
  recallPick: (slotIndex: number, modality: 'position' | 'audio', value: number | string) => void;
  dualPickDrop: (proposalId: string, label: string, targetSlot: number) => void;

  // Queries
  hasRespondedForModality: (modality: ModalityId) => boolean;
  wasParentFalseAlarm: (modality: ModalityId) => boolean;
}

// =============================================================================
// Helper to map lifecycle state to status
// =============================================================================

function mapStateToStatus(state: InteractiveReplayLifecycleState): InteractiveReplayStatus {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'loading':
      return 'loading';
    case 'ready':
      return 'ready';
    case 'playing':
      return 'playing';
    case 'paused':
      return 'paused';
    case 'awaitingCompletion':
      return 'awaitingCompletion';
    case 'finished':
      return 'finished';
    case 'error':
      return 'idle'; // Fallback, could show error UI
    default:
      return 'idle';
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useInteractiveReplay(
  options: UseInteractiveReplayOptions,
): UseInteractiveReplayReturn {
  const {
    adapter,
    sessionId,
    sessionType,
    parentEvents,
    activeModalities,
    parentRunId,
    totalDurationMs,
    onComplete,
    audioAdapter,
    lifecycleAdapter: externalAdapter,
  } = options;

  // Lifecycle adapter must be provided externally
  // (Can't use dynamic require() in browser ESM bundles)
  if (!externalAdapter) {
    throw new Error(
      'useInteractiveReplay: lifecycleAdapter is required. ' +
        'Create it with createInteractiveReplayAdapter() from @neurodual/infra before calling this hook.',
    );
  }

  const lifecycleAdapter = externalAdapter;

  // RAF refs
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);

  // Subscribe to state changes using useSyncExternalStore
  const state = useSyncExternalStore(
    useCallback((callback) => lifecycleAdapter.subscribe(callback), [lifecycleAdapter]),
    useCallback(() => lifecycleAdapter.getState(), [lifecycleAdapter]),
  );

  // Subscribe to context changes
  const context = useSyncExternalStore(
    useCallback((callback) => lifecycleAdapter.subscribeContext(callback), [lifecycleAdapter]),
    useCallback(() => lifecycleAdapter.getContext(), [lifecycleAdapter]),
  );

  // Derived values
  const status = mapStateToStatus(state);
  const progress = lifecycleAdapter.getProgress();

  // Handle completion callback
  const prevStateRef = useRef<InteractiveReplayLifecycleState>(state);
  const autoCompleteRequestedRef = useRef(false);
  useEffect(() => {
    if (prevStateRef.current !== 'finished' && state === 'finished') {
      if (onComplete && context.run && context.score) {
        onComplete(context.run, context.score);
      }
    }
    prevStateRef.current = state;
  }, [state, context.run, context.score, onComplete]);

  // Auto-confirm completion once replay reaches end.
  useEffect(() => {
    if (state === 'awaitingCompletion') {
      if (!autoCompleteRequestedRef.current) {
        autoCompleteRequestedRef.current = true;
        lifecycleAdapter.complete();
      }
      return;
    }

    if (state !== 'finished') {
      autoCompleteRequestedRef.current = false;
    }
  }, [state, lifecycleAdapter]);

  // Start action
  const start = useCallback(() => {
    if ('sendStart' in lifecycleAdapter) {
      (lifecycleAdapter as { sendStart: (input: unknown, audio?: AudioPort) => void }).sendStart(
        {
          adapter,
          sessionId,
          sessionType,
          parentEvents,
          activeModalities,
          parentRunId,
          totalDurationMs,
        },
        audioAdapter,
      );
    }
  }, [
    lifecycleAdapter,
    adapter,
    sessionId,
    sessionType,
    parentEvents,
    activeModalities,
    parentRunId,
    totalDurationMs,
    audioAdapter,
  ]);

  // Recover action (for resuming after page refresh)
  const recover = useCallback(
    (recoveredState: RecoveredReplayState) => {
      if ('sendRecover' in lifecycleAdapter) {
        (
          lifecycleAdapter as {
            sendRecover: (
              state: RecoveredReplayState,
              events: readonly GameEvent[],
              modalities: readonly ModalityId[],
              type: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track',
              audio?: AudioPort,
            ) => void;
          }
        ).sendRecover(recoveredState, parentEvents, activeModalities, sessionType, audioAdapter);
      }
    },
    [lifecycleAdapter, parentEvents, activeModalities, sessionType, audioAdapter],
  );

  // Playback actions
  const play = useCallback(() => {
    lifecycleAdapter.play();
  }, [lifecycleAdapter]);

  const pause = useCallback(() => {
    lifecycleAdapter.pause();
  }, [lifecycleAdapter]);

  const togglePlayPause = useCallback(() => {
    lifecycleAdapter.togglePlayPause();
  }, [lifecycleAdapter]);

  const setSpeed = useCallback(
    (speed: InteractiveReplaySpeed) => {
      lifecycleAdapter.setSpeed(speed);
    },
    [lifecycleAdapter],
  );

  // Response action
  const respond = useCallback(
    (modality: ModalityId) => {
      lifecycleAdapter.respond(modality);
    },
    [lifecycleAdapter],
  );

  // Completion actions
  const complete = useCallback(() => {
    lifecycleAdapter.complete();
  }, [lifecycleAdapter]);

  const abandon = useCallback(() => {
    lifecycleAdapter.abandon();
  }, [lifecycleAdapter]);

  // Query functions
  const hasRespondedForModality = useCallback(
    (modality: ModalityId): boolean => {
      return lifecycleAdapter.hasRespondedForModality(modality);
    },
    [lifecycleAdapter],
  );

  const wasParentFalseAlarm = useCallback(
    (modality: ModalityId): boolean => {
      return lifecycleAdapter.wasParentFalseAlarm(modality);
    },
    [lifecycleAdapter],
  );

  // RAF loop for TICK events
  useEffect(() => {
    if (state !== 'playing') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const tick = (timestamp: number) => {
      const deltaMs = timestamp - lastTickTimeRef.current;
      lastTickTimeRef.current = timestamp;

      // Send TICK to the machine
      lifecycleAdapter.tick(deltaMs);

      // Continue loop if still playing
      if (lifecycleAdapter.getState() === 'playing') {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    lastTickTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, lifecycleAdapter]);

  // Cleanup on unmount
  useMountEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Adapter disposal is caller's responsibility
    };
  });

  return {
    status,
    run: context.run,
    currentTimeMs: context.currentTimeMs,
    progress,
    speed: context.speed,
    events: context.events,
    score: context.score,
    start,
    recover,
    play,
    pause,
    togglePlayPause,
    setSpeed,
    respond,
    complete,
    abandon,
    flowDrop: useCallback(
      (
        proposalId: string,
        proposalType: 'position' | 'audio' | 'unified',
        proposalValue: number | string,
        targetSlot: number,
      ) => lifecycleAdapter.flowDrop(proposalId, proposalType, proposalValue, targetSlot),
      [lifecycleAdapter],
    ),
    recallPick: useCallback(
      (slotIndex: number, modality: 'position' | 'audio', value: number | string) =>
        lifecycleAdapter.recallPick(slotIndex, modality, value),
      [lifecycleAdapter],
    ),
    dualPickDrop: useCallback(
      (proposalId: string, label: string, targetSlot: number) =>
        lifecycleAdapter.dualPickDrop(proposalId, label, targetSlot),
      [lifecycleAdapter],
    ),
    hasRespondedForModality,
    wasParentFalseAlarm,
  };
}
