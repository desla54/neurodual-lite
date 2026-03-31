/**
 * App Lifecycle Machine (XState v5)
 *
 * State machine managing the global application lifecycle.
 * Handles initialization, background/foreground transitions, and shutdown.
 *
 * States:
 * - cold_start → initializing (auto-transition on start)
 * - initializing → ready (init success) or error (init failure)
 * - ready ⇄ active (session start/end)
 * - ready/active → backgrounded (app hidden)
 * - backgrounded → resuming → ready/active (app visible)
 * - error → initializing (RETRY event)
 * - * → shutdown (SHUTDOWN event)
 */

import { setup, assign, fromPromise, createActor, type ActorRefFrom } from 'xstate';
import type {
  AppLifecyclePort,
  AppLifecycleState,
  InitializationProgress,
  PlatformLifecycleSource,
} from '@neurodual/logic';
import { disposeAll } from './disposal-registry';
import { lifecycleLog } from '../logger';

// =============================================================================
// Types
// =============================================================================

interface AppLifecycleContext {
  progress: InitializationProgress | null;
  error: Error | null;
  wasInSession: boolean;
  initSettings: () => Promise<void>;
  initI18n: () => Promise<void>;
  initPersistence: () => Promise<void>;
  checkDatabaseHealth?: () => Promise<void>;
}

type AppLifecycleEvent =
  | { type: 'ENTER_SESSION' }
  | { type: 'EXIT_SESSION' }
  | { type: 'BACKGROUNDED' }
  | { type: 'FOREGROUNDED' }
  | { type: 'RETRY' }
  | { type: 'SHUTDOWN' };

interface AppLifecycleInput {
  initSettings: () => Promise<void>;
  initI18n: () => Promise<void>;
  initPersistence: () => Promise<void>;
  checkDatabaseHealth?: () => Promise<void>;
  platformLifecycleSource?: PlatformLifecycleSource;
}

// =============================================================================
// XState Machine Definition
// =============================================================================

export const appMachine = setup({
  types: {
    context: {} as AppLifecycleContext,
    events: {} as AppLifecycleEvent,
    input: {} as AppLifecycleInput,
  },

  actions: {
    logTransition: (
      _ctx: { context: AppLifecycleContext; event: AppLifecycleEvent },
      params: { from: string; to: string },
    ) => {
      lifecycleLog.info(`[AppLifecycle] ${params.from} → ${params.to}`);
    },

    setProgress: assign({
      progress: (_, params: { step: InitializationProgress['step']; detail?: string }) => ({
        step: params.step,
        detail: params.detail,
      }),
    }),

    clearProgress: assign({
      progress: () => null,
    }),

    setError: assign({
      error: (_, params: { error: Error }) => params.error,
    }),

    clearError: assign({
      error: () => null,
    }),

    markInSession: assign({
      wasInSession: () => true,
    }),

    markOutOfSession: assign({
      wasInSession: () => false,
    }),
  },

  guards: {
    wasInSession: ({ context }) => context.wasInSession,
  },

  actors: {
    /**
     * Initialize the application.
     * Steps: SQLite → Settings → i18n
     */
    initializeApp: fromPromise(async ({ input }: { input: AppLifecycleContext }) => {
      lifecycleLog.info('[AppLifecycle] Starting initialization...');

      // Step 1: SQLite
      lifecycleLog.debug('[AppLifecycle] Step 1: SQLite');
      await input.initPersistence();

      // Step 2: Settings
      lifecycleLog.debug('[AppLifecycle] Step 2: Settings');
      await input.initSettings();

      // Step 3: i18n
      lifecycleLog.debug('[AppLifecycle] Step 3: i18n');
      await input.initI18n();

      lifecycleLog.info('[AppLifecycle] Initialization complete');
      return true;
    }),

    /**
     * Resume after returning from background.
     */
    resumeApp: fromPromise(async ({ input }: { input: AppLifecycleContext }) => {
      lifecycleLog.info('[AppLifecycle] Resuming from background...');

      // Check database health - if site data was cleared, reload the page
      if (input.checkDatabaseHealth) {
        try {
          await input.checkDatabaseHealth();
          lifecycleLog.debug('[AppLifecycle] Database health check passed');
        } catch (error) {
          lifecycleLog.error(
            '[AppLifecycle] Database health check failed, reloading page...',
            error,
          );
          // Force reload to reinitialize everything
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
          // If reload doesn't happen (SSR context), throw to go to error state
          throw new Error('Database was cleared, page reload required');
        }
      }

      return true;
    }),

    /**
     * Shutdown and cleanup.
     */
    shutdownApp: fromPromise(async () => {
      lifecycleLog.info('[AppLifecycle] Shutting down...');
      await disposeAll();
      lifecycleLog.info('[AppLifecycle] Shutdown complete');
    }),
  },
}).createMachine({
  id: 'appLifecycle',
  initial: 'cold_start',
  context: ({ input }) => ({
    progress: null,
    error: null,
    wasInSession: false,
    initSettings: input.initSettings,
    initI18n: input.initI18n,
    initPersistence: input.initPersistence,
    checkDatabaseHealth: input.checkDatabaseHealth,
  }),

  states: {
    // =========================================================================
    // COLD_START - First launch, nothing initialized
    // =========================================================================
    cold_start: {
      always: {
        target: 'initializing',
        actions: [{ type: 'logTransition', params: { from: 'cold_start', to: 'initializing' } }],
      },
    },

    // =========================================================================
    // INITIALIZING - Init in progress
    // =========================================================================
    initializing: {
      entry: [{ type: 'setProgress', params: { step: 'sqlite' } }, 'clearError'],
      invoke: {
        id: 'initializeApp',
        src: 'initializeApp',
        input: ({ context }) => context,
        onDone: {
          target: 'ready',
          actions: [
            { type: 'logTransition', params: { from: 'initializing', to: 'ready' } },
            'clearProgress',
          ],
        },
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'initializing', to: 'error' } },
            assign({ error: ({ event }) => event.error as Error }),
            'clearProgress',
          ],
        },
      },
    },

    // =========================================================================
    // READY - Everything ready, waiting for user action
    // =========================================================================
    ready: {
      on: {
        ENTER_SESSION: {
          target: 'active',
          actions: [
            { type: 'logTransition', params: { from: 'ready', to: 'active' } },
            'markInSession',
          ],
        },
        BACKGROUNDED: {
          target: 'backgrounded',
          actions: [{ type: 'logTransition', params: { from: 'ready', to: 'backgrounded' } }],
        },
        SHUTDOWN: {
          target: 'shutdown',
          actions: [{ type: 'logTransition', params: { from: 'ready', to: 'shutdown' } }],
        },
      },
    },

    // =========================================================================
    // ACTIVE - Game session in progress
    // =========================================================================
    active: {
      on: {
        EXIT_SESSION: {
          target: 'ready',
          actions: [
            { type: 'logTransition', params: { from: 'active', to: 'ready' } },
            'markOutOfSession',
          ],
        },
        BACKGROUNDED: {
          target: 'backgrounded',
          actions: [{ type: 'logTransition', params: { from: 'active', to: 'backgrounded' } }],
        },
        SHUTDOWN: {
          target: 'shutdown',
          actions: [{ type: 'logTransition', params: { from: 'active', to: 'shutdown' } }],
        },
      },
    },

    // =========================================================================
    // BACKGROUNDED - App in background
    // =========================================================================
    backgrounded: {
      on: {
        FOREGROUNDED: {
          target: 'resuming',
          actions: [{ type: 'logTransition', params: { from: 'backgrounded', to: 'resuming' } }],
        },
        SHUTDOWN: {
          target: 'shutdown',
          actions: [{ type: 'logTransition', params: { from: 'backgrounded', to: 'shutdown' } }],
        },
      },
    },

    // =========================================================================
    // RESUMING - Returning from background
    // =========================================================================
    resuming: {
      invoke: {
        id: 'resumeApp',
        src: 'resumeApp',
        input: ({ context }) => context,
        onDone: [
          {
            guard: 'wasInSession',
            target: 'active',
            actions: [{ type: 'logTransition', params: { from: 'resuming', to: 'active' } }],
          },
          {
            target: 'ready',
            actions: [{ type: 'logTransition', params: { from: 'resuming', to: 'ready' } }],
          },
        ],
        onError: {
          target: 'error',
          actions: [
            { type: 'logTransition', params: { from: 'resuming', to: 'error' } },
            assign({ error: ({ event }) => event.error as Error }),
          ],
        },
      },
    },

    // =========================================================================
    // ERROR - Recoverable error
    // =========================================================================
    error: {
      on: {
        RETRY: {
          target: 'initializing',
          actions: [{ type: 'logTransition', params: { from: 'error', to: 'initializing' } }],
        },
        SHUTDOWN: {
          target: 'shutdown',
          actions: [{ type: 'logTransition', params: { from: 'error', to: 'shutdown' } }],
        },
      },
    },

    // =========================================================================
    // SHUTDOWN - Cleanup in progress
    // =========================================================================
    shutdown: {
      invoke: {
        id: 'shutdownApp',
        src: 'shutdownApp',
        onDone: {
          target: 'terminated',
        },
      },
    },

    // =========================================================================
    // TERMINATED - Final state
    // =========================================================================
    terminated: {
      type: 'final',
    },
  },
});

// =============================================================================
// Adapter Class (implements AppLifecyclePort)
// =============================================================================

/**
 * AppLifecycleAdapter
 *
 * Wraps the XState machine to implement AppLifecyclePort interface.
 * Uses injected PlatformLifecycleSource for background/foreground detection.
 */
export class AppLifecycleAdapter implements AppLifecyclePort {
  private actor: ActorRefFrom<typeof appMachine>;
  private platformSource: PlatformLifecycleSource | null;
  private unsubscribePlatform: (() => void) | null = null;

  constructor(input: AppLifecycleInput) {
    // Create and start the actor
    this.actor = createActor(appMachine, { input });
    this.actor.start();

    // Store and setup platform lifecycle source
    this.platformSource = input.platformLifecycleSource ?? null;
    this.setupPlatformSource();

    lifecycleLog.info('[AppLifecycle] XState machine started');
  }

  // ===========================================================================
  // AppLifecyclePort Implementation
  // ===========================================================================

  getState(): AppLifecycleState {
    const snapshot = this.actor.getSnapshot();
    const stateValue = snapshot.value;

    // Map XState state to AppLifecycleState
    if (stateValue === 'cold_start') return 'cold_start';
    if (stateValue === 'initializing') return 'initializing';
    if (stateValue === 'ready') return 'ready';
    if (stateValue === 'active') return 'active';
    if (stateValue === 'backgrounded') return 'backgrounded';
    if (stateValue === 'resuming') return 'resuming';
    if (stateValue === 'error') return 'error';
    if (stateValue === 'shutdown' || stateValue === 'terminated') return 'shutdown';

    return 'cold_start';
  }

  getProgress(): InitializationProgress | null {
    return this.actor.getSnapshot().context.progress;
  }

  getError(): Error | null {
    return this.actor.getSnapshot().context.error;
  }

  isReady(): boolean {
    const state = this.getState();
    return state === 'ready' || state === 'active';
  }

  retry(): void {
    this.actor.send({ type: 'RETRY' });
  }

  enterSession(): void {
    this.actor.send({ type: 'ENTER_SESSION' });
  }

  exitSession(): void {
    this.actor.send({ type: 'EXIT_SESSION' });
  }

  async shutdown(): Promise<void> {
    this.actor.send({ type: 'SHUTDOWN' });

    // Wait for shutdown to complete
    return new Promise((resolve) => {
      const checkDone = () => {
        const state = this.getState();
        if (state === 'shutdown') {
          resolve();
        } else {
          setTimeout(checkDone, 50);
        }
      };
      setTimeout(checkDone, 100);
    });
  }

  subscribe(listener: (state: AppLifecycleState) => void): () => void {
    // Immediately notify with current state
    listener(this.getState());

    // Subscribe to actor changes
    const subscription = this.actor.subscribe(() => {
      listener(this.getState());
    });

    return () => subscription.unsubscribe();
  }

  subscribeProgress(listener: (progress: InitializationProgress) => void): () => void {
    const current = this.getProgress();
    if (current) listener(current);

    const subscription = this.actor.subscribe(() => {
      const progress = this.getProgress();
      if (progress) listener(progress);
    });

    return () => subscription.unsubscribe();
  }

  // ===========================================================================
  // Private - Platform Lifecycle Source
  // ===========================================================================

  private setupPlatformSource(): void {
    if (!this.platformSource) {
      lifecycleLog.warn('[AppLifecycle] No platform lifecycle source provided');
      return;
    }

    this.unsubscribePlatform = this.platformSource.subscribe(
      (event: 'BACKGROUNDED' | 'FOREGROUNDED') => {
        this.handlePlatformEvent(event);
      },
    );
  }

  private handlePlatformEvent(event: 'BACKGROUNDED' | 'FOREGROUNDED'): void {
    const state = this.getState();

    if (event === 'BACKGROUNDED') {
      // Only send BACKGROUNDED if we're in ready or active state
      if (state === 'ready' || state === 'active') {
        this.actor.send({ type: 'BACKGROUNDED' });
      }
    } else {
      // Only send FOREGROUNDED if we're in backgrounded state
      if (state === 'backgrounded') {
        this.actor.send({ type: 'FOREGROUNDED' });
      }
    }
  }

  /**
   * Dispose the adapter (for tests)
   */
  dispose(): void {
    // Unsubscribe from platform source
    if (this.unsubscribePlatform) {
      this.unsubscribePlatform();
      this.unsubscribePlatform = null;
    }

    // Dispose platform source
    if (this.platformSource) {
      this.platformSource.dispose();
      this.platformSource = null;
    }

    this.actor.stop();
    lifecycleLog.info('[AppLifecycle] XState machine stopped');
  }
}

export type { AppLifecycleInput };
