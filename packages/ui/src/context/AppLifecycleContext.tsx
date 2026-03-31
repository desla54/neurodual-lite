'use client';

/**
 * AppLifecycleContext
 *
 * React context providing access to app lifecycle state.
 * Allows UI components to:
 * - Check if app is ready
 * - Display loading/error screens
 * - Trigger retry on error
 */

import type { AppLifecyclePort, AppLifecycleState, InitializationProgress } from '@neurodual/logic';
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

interface AppLifecycleContextValue {
  /** Current lifecycle state */
  state: AppLifecycleState;
  /** Initialization progress (when state === 'initializing') */
  progress: InitializationProgress | null;
  /** Error details (when state === 'error') */
  error: Error | null;
  /** Is app ready for user interaction? */
  isReady: boolean;
  /** Retry initialization after error */
  retry: () => void;
  /** Notify entering a game session */
  enterSession: () => void;
  /** Notify exiting a game session */
  exitSession: () => void;
}

const AppLifecycleContext = createContext<AppLifecycleContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface AppLifecycleProviderProps {
  /** App lifecycle adapter (from infra) */
  adapter: AppLifecyclePort;
  children: ReactNode;
}

/**
 * AppLifecycleProvider
 *
 * Wraps the app to provide lifecycle state to all components.
 * Should be placed near the app root.
 */
export function AppLifecycleProvider({ adapter, children }: AppLifecycleProviderProps) {
  const state = useSyncExternalStore(
    useCallback((cb) => adapter.subscribe(() => cb()), [adapter]),
    () => adapter.getState(),
  );
  const progress = useSyncExternalStore(
    useCallback((cb) => adapter.subscribeProgress(() => cb()), [adapter]),
    () => adapter.getProgress(),
  );
  const error = adapter.getError();

  const retry = useCallback(() => adapter.retry(), [adapter]);
  const enterSession = useCallback(() => adapter.enterSession(), [adapter]);
  const exitSession = useCallback(() => adapter.exitSession(), [adapter]);
  const isReady = adapter.isReady();

  const value: AppLifecycleContextValue = useMemo(
    () => ({
      state,
      progress,
      error,
      isReady,
      retry,
      enterSession,
      exitSession,
    }),
    [state, progress, error, isReady, retry, enterSession, exitSession],
  );

  return <AppLifecycleContext.Provider value={value}>{children}</AppLifecycleContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Get the full app lifecycle context value.
 * Throws if used outside AppLifecycleProvider.
 */
export function useAppLifecycle(): AppLifecycleContextValue {
  const ctx = useContext(AppLifecycleContext);
  if (!ctx) {
    throw new Error('useAppLifecycle must be used within AppLifecycleProvider');
  }
  return ctx;
}

/**
 * Get current app lifecycle state.
 */
export function useAppLifecycleState(): AppLifecycleState {
  return useAppLifecycle().state;
}

/**
 * Check if app is ready for user interaction.
 */
export function useAppReady(): boolean {
  return useAppLifecycle().isReady;
}

/**
 * Get retry function for error recovery.
 */
export function useAppRetry(): () => void {
  return useAppLifecycle().retry;
}

/**
 * Get initialization progress.
 * Returns null if not currently initializing.
 */
export function useInitProgress(): InitializationProgress | null {
  return useAppLifecycle().progress;
}

/**
 * Get current error (if any).
 */
export function useAppError(): Error | null {
  return useAppLifecycle().error;
}
