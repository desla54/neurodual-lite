/**
 * AudioLifecycleMachine (XState v5)
 *
 * State machine managing the audio system lifecycle.
 * Handles browser autoplay policies, visibility changes, and resource loading.
 *
 * States:
 * - uninitialized → loading (PRELOAD event)
 * - loading → locked (buffers ready, AudioContext suspended)
 * - loading → ready (buffers ready, AudioContext running)
 * - locked → ready (UNLOCK event with user gesture)
 * - ready → interrupted (VISIBILITY_HIDDEN/BLUR event)
 * - interrupted → ready (VISIBILITY_VISIBLE/FOCUS event)
 * - ready → loading (CONFIG_CHANGED event)
 */

import { setup, assign, fromPromise, createActor, type ActorRefFrom } from 'xstate';
import { getToneSync, loadTone } from './tone-loader';
import type {
  AudioLifecyclePort,
  AudioLifecycleState,
  AudioLoadingProgress,
} from '@neurodual/logic';
import { audioService, AudioService } from './audio-service';
import { audioLog } from '../logger';

type ToneModule = typeof import('tone');

// Tone is large; keep it lazy. The lifecycle machine must occasionally call Tone.start()
// in a user-gesture stack (iOS PWA workaround). We only do that synchronously when
// Tone is already loaded.
let Tone = null as unknown as ToneModule;
let toneLoaded = false;

async function ensureToneLoaded(): Promise<ToneModule> {
  if (toneLoaded) return Tone;
  Tone = (getToneSync() ?? (await loadTone())) as ToneModule;
  toneLoaded = true;
  return Tone;
}

// =============================================================================
// Types
// =============================================================================

interface AudioLifecycleContext {
  audio: AudioService;
  loadingProgress: AudioLoadingProgress | null;
}

type AudioLifecycleEventType =
  | { type: 'PRELOAD' }
  | { type: 'UNLOCK' }
  | { type: 'CONFIG_CHANGED' }
  | { type: 'VISIBILITY_HIDDEN' }
  | { type: 'VISIBILITY_VISIBLE' }
  | { type: 'FOCUS_LOST' }
  | { type: 'FOCUS_REGAINED' };

interface AudioLifecycleInput {
  audio: AudioService;
}

// =============================================================================
// XState Machine Definition
// =============================================================================

const audioMachine = setup({
  types: {
    context: {} as AudioLifecycleContext,
    events: {} as AudioLifecycleEventType,
    input: {} as AudioLifecycleInput,
  },

  actions: {
    logTransition: (
      _ctx: { context: AudioLifecycleContext; event: AudioLifecycleEventType },
      params: { from: string; to: string },
    ) => {
      audioLog.info(`[AudioLifecycle] ${params.from} → ${params.to}`);
    },

    initLoadingProgress: assign({
      loadingProgress: (): AudioLoadingProgress | null => ({ loaded: 0, total: 0, failed: [] }),
    }),

    clearLoadingProgress: assign({
      loadingProgress: (): AudioLoadingProgress | null => null,
    }),

    stopAllAudio: ({ context }: { context: AudioLifecycleContext }) => {
      context.audio.stopAll();
    },
  },

  guards: {
    isAudioContextRunning: ({ context }: { context: AudioLifecycleContext }) => {
      return context.audio.isAudioContextRunning();
    },
  },

  actors: {
    /**
     * Preload audio buffers.
     * Resolves when all sounds are loaded.
     */
    preloadAudio: fromPromise(async ({ input }: { input: AudioLifecycleContext }) => {
      audioLog.info('[AudioLifecycle] Starting audio preload...');
      await input.audio.init();
      audioLog.info('[AudioLifecycle] Audio preload complete');
      return input.audio.isReady();
    }),

    /**
     * Resume AudioContext after user gesture.
     */
    resumeAudio: fromPromise(async ({ input }: { input: AudioLifecycleContext }) => {
      audioLog.info('[AudioLifecycle] Resuming AudioContext...');
      await input.audio.resume();
      return input.audio.isReady();
    }),
  },
}).createMachine({
  id: 'audioLifecycle',
  initial: 'uninitialized',
  context: ({ input }: { input: AudioLifecycleInput }) => ({
    audio: input.audio,
    loadingProgress: null,
  }),

  states: {
    // =========================================================================
    // UNINITIALIZED - Waiting for preload
    // =========================================================================
    uninitialized: {
      on: {
        PRELOAD: {
          target: 'loading',
          actions: [
            { type: 'logTransition', params: { from: 'uninitialized', to: 'loading' } },
            'initLoadingProgress',
          ],
        },
      },
    },

    // =========================================================================
    // LOADING - Preloading audio buffers
    // =========================================================================
    loading: {
      invoke: {
        id: 'preloadAudio',
        src: 'preloadAudio',
        input: ({ context }: { context: AudioLifecycleContext }) => context,
        onDone: [
          {
            guard: 'isAudioContextRunning',
            target: 'ready',
            actions: [
              { type: 'logTransition', params: { from: 'loading', to: 'ready' } },
              'clearLoadingProgress',
            ],
          },
          {
            target: 'locked',
            actions: [
              { type: 'logTransition', params: { from: 'loading', to: 'locked' } },
              'clearLoadingProgress',
            ],
          },
        ],
        onError: {
          target: 'locked',
          actions: [{ type: 'logTransition', params: { from: 'loading', to: 'locked (error)' } }],
        },
      },
    },

    // =========================================================================
    // LOCKED - Buffers ready, awaiting user gesture
    // =========================================================================
    locked: {
      on: {
        UNLOCK: {
          target: 'unlocking',
        },
      },
    },

    // =========================================================================
    // UNLOCKING - Resuming AudioContext
    // =========================================================================
    unlocking: {
      invoke: {
        id: 'resumeAudio',
        src: 'resumeAudio',
        input: ({ context }: { context: AudioLifecycleContext }) => context,
        onDone: [
          {
            guard: 'isAudioContextRunning',
            target: 'ready',
            actions: [{ type: 'logTransition', params: { from: 'unlocking', to: 'ready' } }],
          },
          {
            target: 'locked',
            actions: [
              { type: 'logTransition', params: { from: 'unlocking', to: 'locked (failed)' } },
            ],
          },
        ],
        onError: {
          target: 'locked',
        },
      },
    },

    // =========================================================================
    // READY - Audio fully operational
    // =========================================================================
    ready: {
      on: {
        VISIBILITY_HIDDEN: {
          target: 'interrupted',
          actions: [
            { type: 'logTransition', params: { from: 'ready', to: 'interrupted' } },
            'stopAllAudio',
          ],
        },
        FOCUS_LOST: {
          target: 'interrupted',
          actions: [
            { type: 'logTransition', params: { from: 'ready', to: 'interrupted' } },
            'stopAllAudio',
          ],
        },
        CONFIG_CHANGED: {
          target: 'loading',
          actions: [
            { type: 'logTransition', params: { from: 'ready', to: 'loading' } },
            'initLoadingProgress',
          ],
        },
      },
    },

    // =========================================================================
    // INTERRUPTED - App lost focus
    // =========================================================================
    interrupted: {
      on: {
        VISIBILITY_VISIBLE: {
          target: 'resuming',
        },
        FOCUS_REGAINED: {
          target: 'resuming',
        },
      },
    },

    // =========================================================================
    // RESUMING - Attempting to resume after interruption
    // =========================================================================
    resuming: {
      invoke: {
        id: 'resumeFromInterruption',
        src: 'resumeAudio',
        input: ({ context }: { context: AudioLifecycleContext }) => context,
        onDone: [
          {
            guard: 'isAudioContextRunning',
            target: 'ready',
            actions: [{ type: 'logTransition', params: { from: 'resuming', to: 'ready' } }],
          },
          {
            target: 'locked',
            actions: [{ type: 'logTransition', params: { from: 'resuming', to: 'locked' } }],
          },
        ],
        onError: {
          target: 'locked',
        },
      },
    },
  },
});

// =============================================================================
// Adapter Class (implements AudioLifecyclePort)
// =============================================================================

/**
 * AudioLifecycleAdapter
 *
 * Wraps the XState machine to implement AudioLifecyclePort interface.
 * Sets up visibility event listeners and provides a clean API.
 */
export class AudioLifecycleAdapter implements AudioLifecyclePort {
  private actor: ActorRefFrom<typeof audioMachine>;
  private boundHandleVisibilityChange: () => void;
  private boundHandleBlur: () => void;
  private boundHandleFocus: () => void;

  constructor(audio: AudioService = audioService) {
    // Create and start the actor
    this.actor = createActor(audioMachine, {
      input: { audio },
    });
    this.actor.start();

    // Bind handlers
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);
    this.boundHandleFocus = this.handleFocus.bind(this);

    // Setup visibility handlers
    this.setupVisibilityHandlers();

    audioLog.info('[AudioLifecycle] XState machine started');
  }

  // ===========================================================================
  // AudioLifecyclePort Implementation
  // ===========================================================================

  getState(): AudioLifecycleState {
    const snapshot = this.actor.getSnapshot();
    const stateValue = snapshot.value;

    // Map XState states to AudioLifecycleState
    if (stateValue === 'uninitialized') return 'uninitialized';
    if (stateValue === 'loading') return 'loading';
    if (stateValue === 'locked' || stateValue === 'unlocking') return 'locked';
    if (stateValue === 'ready') return 'ready';
    if (stateValue === 'interrupted' || stateValue === 'resuming') return 'interrupted';

    return 'uninitialized';
  }

  getLoadingProgress(): AudioLoadingProgress | null {
    return this.actor.getSnapshot().context.loadingProgress;
  }

  isReady(): boolean {
    return this.getState() === 'ready';
  }

  preload(): void {
    this.actor.send({ type: 'PRELOAD' });
  }

  async unlock(): Promise<void> {
    const state = this.getState();

    if (state === 'ready') {
      audioLog.debug('[AudioLifecycle] Already ready, unlock() is a no-op');
      return;
    }

    // iOS PWA STANDALONE FIX:
    // On iOS PWA standalone, calling Tone.start() from a deferred context (via XState actor)
    // loses the "user interaction" context, causing the AudioContext to stay suspended.
    // We MUST call Tone.start() SYNCHRONOUSLY within the click handler's call stack.
    //
    // This is a workaround for:
    // - https://bugs.webkit.org/show_bug.cgi?id=198277
    // - https://bugs.webkit.org/show_bug.cgi?id=261858
    //
    // The approach: call Tone.start() immediately (fire-and-forget) before deferring to XState.
    // This ensures the AudioContext receives the unlock signal while we're still in the
    // trusted user interaction context.
    const isIOSPWA = AudioService.isIOSPWAStandalone();
    if (isIOSPWA) {
      audioLog.info('[AudioLifecycle] iOS PWA standalone detected - immediate Tone.start()');
    }

    try {
      // Fire-and-forget: don't await, just kick off the unlock immediately
      // This runs synchronously within the click handler's call stack
      const tone = getToneSync();
      if (tone && tone.getContext().state !== 'running') {
        audioLog.debug('[AudioLifecycle] Immediate Tone.start() for user gesture context');
        // Don't await - let it resolve in background while XState handles the rest
        tone.start().catch(() => {
          // Ignore - XState will handle retry
        });
      } else if (!tone) {
        // Ensure Tone is at least loading so subsequent unlock/resume paths are fast.
        void ensureToneLoaded().catch(() => {
          // best-effort
        });
      }
    } catch {
      // Ignore - XState will handle the full init
    }

    if (state === 'uninitialized') {
      // Trigger full init
      this.actor.send({ type: 'PRELOAD' });
    }

    // Send unlock and wait for ready state
    this.actor.send({ type: 'UNLOCK' });

    // Wait for state to become ready (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 3000);

      const checkReady = () => {
        if (this.getState() === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });
  }

  subscribe(listener: (state: AudioLifecycleState) => void): () => void {
    // Immediately notify with current state
    listener(this.getState());

    // Subscribe to actor changes
    const subscription = this.actor.subscribe(() => {
      listener(this.getState());
    });

    return () => subscription.unsubscribe();
  }

  subscribeProgress(listener: (progress: AudioLoadingProgress) => void): () => void {
    const current = this.getLoadingProgress();
    if (current) listener(current);

    const subscription = this.actor.subscribe(() => {
      const progress = this.getLoadingProgress();
      if (progress) listener(progress);
    });

    return () => subscription.unsubscribe();
  }

  // ===========================================================================
  // Additional Methods
  // ===========================================================================

  notifyConfigChanged(): void {
    this.actor.send({ type: 'CONFIG_CHANGED' });
  }

  dispose(): void {
    this.removeVisibilityHandlers();
    this.actor.stop();
    audioLog.info('[AudioLifecycle] XState machine stopped');
  }

  // ===========================================================================
  // Private - Visibility Handlers
  // ===========================================================================

  private setupVisibilityHandlers(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.boundHandleBlur);
      window.addEventListener('focus', this.boundHandleFocus);
    }
  }

  private removeVisibilityHandlers(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.boundHandleBlur);
      window.removeEventListener('focus', this.boundHandleFocus);
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    if (document.hidden) {
      this.actor.send({ type: 'VISIBILITY_HIDDEN' });
    } else {
      this.actor.send({ type: 'VISIBILITY_VISIBLE' });
    }
  }

  private handleBlur(): void {
    // Only interrupt if document is also hidden
    if (typeof document !== 'undefined' && document.hidden) {
      this.actor.send({ type: 'FOCUS_LOST' });
    }
  }

  private handleFocus(): void {
    this.actor.send({ type: 'FOCUS_REGAINED' });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const audioLifecycleAdapter = new AudioLifecycleAdapter();

// Alias for backwards compatibility with main.tsx
export { audioLifecycleAdapter as audioLifecycleMachine };
