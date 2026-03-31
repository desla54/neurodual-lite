// packages/ui/src/replay/use-replay-state.ts
/**
 * Replay State Store
 *
 * Zustand store for managing replay playback state.
 * Handles time synchronization, play/pause, speed control.
 */

import { create } from 'zustand';
import type { ReplaySession } from '@neurodual/logic';

// =============================================================================
// Types
// =============================================================================

export type ReplaySpeed = 0.5 | 1 | 2;

export type ReplayStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'finished';

export interface ReplayState {
  // Session data
  session: ReplaySession | null;
  status: ReplayStatus;

  // Playback state
  currentTimeMs: number;
  speed: ReplaySpeed;

  // Derived
  progress: number; // 0-1

  // Actions
  setSession: (session: ReplaySession) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  seek: (timeMs: number) => void;
  seekToProgress: (progress: number) => void;
  tick: (deltaMs: number) => void;
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useReplayState = create<ReplayState>((set, get) => ({
  // Initial state
  session: null,
  status: 'idle',
  currentTimeMs: 0,
  speed: 1,
  progress: 0,

  // Set session and prepare for playback
  setSession: (session) => {
    set({
      session,
      status: 'ready',
      currentTimeMs: 0,
      progress: 0,
    });
  },

  // Start playback
  play: () => {
    const { status } = get();
    if (status === 'ready' || status === 'paused') {
      set({ status: 'playing' });
    } else if (status === 'finished') {
      // Restart from beginning
      set({ status: 'playing', currentTimeMs: 0, progress: 0 });
    }
  },

  // Pause playback
  pause: () => {
    const { status } = get();
    if (status === 'playing') {
      set({ status: 'paused' });
    }
  },

  // Toggle play/pause
  togglePlayPause: () => {
    const { status, play, pause } = get();
    if (status === 'playing') {
      pause();
    } else {
      play();
    }
  },

  // Set playback speed
  setSpeed: (speed) => {
    set({ speed });
  },

  // Seek to specific time
  seek: (timeMs) => {
    const { session } = get();
    if (!session) return;

    const clampedTime = Math.max(0, Math.min(timeMs, session.totalDurationMs));
    const progress = session.totalDurationMs > 0 ? clampedTime / session.totalDurationMs : 0;

    set({
      currentTimeMs: clampedTime,
      progress,
      status: clampedTime >= session.totalDurationMs ? 'finished' : get().status,
    });
  },

  // Seek to progress (0-1)
  seekToProgress: (progress) => {
    const { session } = get();
    if (!session) return;

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const timeMs = clampedProgress * session.totalDurationMs;

    set({
      currentTimeMs: timeMs,
      progress: clampedProgress,
      status: clampedProgress >= 1 ? 'finished' : get().status,
    });
  },

  // Advance time (called each frame)
  tick: (deltaMs) => {
    const { status, session, currentTimeMs, speed } = get();
    if (status !== 'playing' || !session) return;

    const newTime = currentTimeMs + deltaMs * speed;

    if (newTime >= session.totalDurationMs) {
      // Finished
      set({
        currentTimeMs: session.totalDurationMs,
        progress: 1,
        status: 'finished',
      });
    } else {
      set({
        currentTimeMs: newTime,
        progress: newTime / session.totalDurationMs,
      });
    }
  },

  // Reset state
  reset: () => {
    set({
      session: null,
      status: 'idle',
      currentTimeMs: 0,
      speed: 1,
      progress: 0,
    });
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const selectIsPlaying = (state: ReplayState) => state.status === 'playing';
export const selectIsPaused = (state: ReplayState) => state.status === 'paused';
export const selectIsFinished = (state: ReplayState) => state.status === 'finished';
export const selectCanPlay = (state: ReplayState) =>
  state.status === 'ready' || state.status === 'paused' || state.status === 'finished';
