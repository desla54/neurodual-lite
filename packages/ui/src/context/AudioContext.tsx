'use client';

/**
 * AudioContext
 *
 * React context providing access to audio lifecycle state.
 * Allows UI components to:
 * - Check if audio is ready
 * - Display "tap to enable sound" overlay when locked
 * - React to interruptions
 */

import type {
  AudioLifecyclePort,
  AudioLifecycleState,
  AudioLoadingProgress,
} from '@neurodual/logic';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

// =============================================================================
// Context
// =============================================================================

interface AudioContextValue {
  /** Current lifecycle state */
  state: AudioLifecycleState;
  /** Loading progress (when state === 'loading') */
  progress: AudioLoadingProgress | null;
  /** Is audio ready to play? */
  isReady: boolean;
  /** Unlock audio (must be called from user gesture) */
  unlock: () => Promise<void>;
  /** Start preloading audio */
  preload: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface AudioProviderProps {
  /** Audio lifecycle adapter (from infra) */
  adapter: AudioLifecyclePort;
  children: ReactNode;
}

/**
 * AudioProvider
 *
 * Wraps the app to provide audio lifecycle state to all components.
 * Should be placed near the app root, after SystemProvider.
 */
export function AudioProvider({ adapter, children }: AudioProviderProps) {
  const state = useSyncExternalStore(
    useCallback((cb) => adapter.subscribe(() => cb()), [adapter]),
    () => adapter.getState(),
  );
  const progress = useSyncExternalStore(
    useCallback((cb) => adapter.subscribeProgress(() => cb()), [adapter]),
    () => adapter.getLoadingProgress(),
  );

  const unlock = useCallback(() => adapter.unlock(), [adapter]);
  const preload = useCallback(() => adapter.preload(), [adapter]);

  const value: AudioContextValue = useMemo(
    () => ({
      state,
      progress,
      isReady: state === 'ready',
      unlock,
      preload,
    }),
    [state, progress, unlock, preload],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the full audio context value.
 * Throws if used outside AudioProvider.
 */
export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return ctx;
}

/**
 * Get current audio lifecycle state.
 */
export function useAudioState(): AudioLifecycleState {
  return useAudio().state;
}

/**
 * Check if audio is ready to play.
 * Convenience hook for gating UI.
 */
export function useAudioReady(): boolean {
  return useAudio().isReady;
}

/**
 * Get unlock function.
 * Use this in click handlers to unlock audio.
 */
export function useAudioUnlock(): () => Promise<void> {
  return useAudio().unlock;
}

/**
 * Get loading progress.
 * Returns null if not currently loading.
 */
export function useAudioLoadingProgress(): AudioLoadingProgress | null {
  return useAudio().progress;
}
