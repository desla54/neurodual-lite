/**
 * AudioLifecyclePort
 *
 * Port defining the audio lifecycle state machine interface.
 * Allows UI to observe audio state and trigger unlock after user interaction.
 *
 * States:
 * - uninitialized: Before any initialization
 * - loading: Preloading sound buffers
 * - locked: Buffers ready but AudioContext suspended (autoplay policy)
 * - ready: AudioContext running, can play sounds
 * - interrupted: App lost focus (tab hidden, blur), audio paused
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Audio lifecycle states
 */
export type AudioLifecycleState = 'uninitialized' | 'loading' | 'locked' | 'ready' | 'interrupted';

/**
 * Loading progress during 'loading' state
 */
export interface AudioLoadingProgress {
  /** Number of sounds loaded */
  loaded: number;
  /** Total sounds to load */
  total: number;
  /** Keys of sounds that failed to load */
  failed: string[];
}

/**
 * Audio lifecycle event types
 */
export type AudioLifecycleEvent =
  | { type: 'PRELOAD' }
  | { type: 'BUFFERS_READY'; audioContextState: 'suspended' | 'running' }
  | { type: 'UNLOCK' }
  | { type: 'VISIBILITY_HIDDEN' }
  | { type: 'VISIBILITY_VISIBLE' }
  | { type: 'CONFIG_CHANGED' }
  | { type: 'ERROR'; error: Error };

// =============================================================================
// Port Interface
// =============================================================================

/**
 * AudioLifecyclePort
 *
 * Manages the audio system lifecycle, handling browser autoplay policies,
 * visibility changes, and resource loading.
 */
export interface AudioLifecyclePort {
  /**
   * Get current lifecycle state
   */
  getState(): AudioLifecycleState;

  /**
   * Get loading progress (only meaningful when state === 'loading')
   */
  getLoadingProgress(): AudioLoadingProgress | null;

  /**
   * Check if audio is ready to play
   * Convenience method: equivalent to getState() === 'ready'
   */
  isReady(): boolean;

  /**
   * Start preloading audio resources.
   * Transitions from 'uninitialized' to 'loading'.
   * Call this early (e.g., at app mount) to start loading in background.
   */
  preload(): void;

  /**
   * Unlock audio after user interaction.
   * Transitions from 'locked' to 'ready'.
   * Must be called from a user gesture handler (click, touch, etc.)
   */
  unlock(): Promise<void>;

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  subscribe(listener: (state: AudioLifecycleState) => void): () => void;

  /**
   * Subscribe to loading progress updates
   * @returns Unsubscribe function
   */
  subscribeProgress(listener: (progress: AudioLoadingProgress) => void): () => void;

  /**
   * Dispose the audio lifecycle adapter.
   * Stops the XState actor and removes event listeners.
   * Used for cleanup during HMR and app shutdown.
   */
  dispose(): void;
}
