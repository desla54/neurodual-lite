/**
 * Persistence Lifecycle Machine (XState v5)
 *
 * State machine managing the SQLite WebWorker lifecycle.
 * Handles initialization, crash recovery, and restart with exponential backoff.
 *
 * States:
 * - idle → starting (INIT event)
 * - starting → ready (worker responds) or degraded (timeout/error)
 * - ready → degraded (worker crash/error)
 * - degraded → restarting (RETRY or auto-retry)
 * - restarting → ready (success) or degraded (failure, increment retries)
 * - degraded → error (max retries exceeded)
 */

import { setup, assign, fromPromise, createActor, type ActorRefFrom } from 'xstate';
import type { PersistenceLifecyclePort, PersistenceLifecycleState } from '@neurodual/logic';
import { lifecycleLog } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;
const INIT_TIMEOUT_MS = 30000;

/**
 * Race a promise against a timeout, ensuring the timeout is always cleared.
 * Prevents unhandled rejection when the main promise wins.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// =============================================================================
// Types
// =============================================================================

interface PersistenceContext {
  error: Error | null;
  retryCount: number;
  lastErrorAt: number | null;
  createWorker: () => Promise<void>;
  terminateWorker: () => Promise<void>;
}

type PersistenceEvent =
  | { type: 'INIT' }
  | { type: 'WORKER_READY' }
  | { type: 'WORKER_ERROR'; error: Error }
  | { type: 'RETRY' }
  | { type: 'SHUTDOWN' };

interface PersistenceInput {
  createWorker: () => Promise<void>;
  terminateWorker: () => Promise<void>;
}

// =============================================================================
// Helpers
// =============================================================================

function calculateBackoff(retryCount: number): number {
  const backoff = BASE_BACKOFF_MS * 2 ** retryCount;
  return Math.min(backoff, MAX_BACKOFF_MS);
}

// =============================================================================
// XState Machine Definition
// =============================================================================

export const persistenceMachine = setup({
  types: {
    context: {} as PersistenceContext,
    events: {} as PersistenceEvent,
    input: {} as PersistenceInput,
  },

  actions: {
    logTransition: (
      _ctx: { context: PersistenceContext; event: PersistenceEvent },
      params: { from: string; to: string },
    ) => {
      lifecycleLog.info(`[PersistenceLifecycle] ${params.from} → ${params.to}`);
    },

    setError: assign({
      error: (_, params: { error: Error }) => params.error,
      lastErrorAt: () => Date.now(),
    }),

    clearError: assign({
      error: () => null,
    }),

    incrementRetry: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),

    resetRetries: assign({
      retryCount: () => 0,
    }),
  },

  guards: {
    canRetry: ({ context }) => context.retryCount < MAX_RETRIES,
    maxRetriesExceeded: ({ context }) => context.retryCount >= MAX_RETRIES,
  },

  delays: {
    backoffDelay: ({ context }) => calculateBackoff(context.retryCount),
  },

  actors: {
    /**
     * Initialize the worker.
     */
    initWorker: fromPromise(async ({ input }: { input: PersistenceContext }) => {
      lifecycleLog.info('[PersistenceLifecycle] Creating worker...');

      await withTimeout(input.createWorker(), INIT_TIMEOUT_MS, 'Worker initialization timeout');

      lifecycleLog.info('[PersistenceLifecycle] Worker ready');
      return true;
    }),

    /**
     * Restart the worker after a crash.
     */
    restartWorker: fromPromise(async ({ input }: { input: PersistenceContext }) => {
      lifecycleLog.info('[PersistenceLifecycle] Restarting worker...');

      // First terminate the old worker
      await input.terminateWorker();

      // Then create a new one with timeout
      await withTimeout(input.createWorker(), INIT_TIMEOUT_MS, 'Worker restart timeout');

      lifecycleLog.info('[PersistenceLifecycle] Worker restarted successfully');
      return true;
    }),

    /**
     * Shutdown the worker.
     */
    shutdownWorker: fromPromise(async ({ input }: { input: PersistenceContext }) => {
      lifecycleLog.info('[PersistenceLifecycle] Shutting down worker...');
      await input.terminateWorker();
      lifecycleLog.info('[PersistenceLifecycle] Worker terminated');
    }),
  },
}).createMachine({
  id: 'persistenceLifecycle',
  initial: 'idle',
  context: ({ input }) => ({
    error: null,
    retryCount: 0,
    lastErrorAt: null,
    createWorker: input.createWorker,
    terminateWorker: input.terminateWorker,
  }),

  states: {
    // =========================================================================
    // IDLE - Not yet initialized
    // =========================================================================
    idle: {
      on: {
        INIT: {
          target: 'starting',
          actions: [{ type: 'logTransition', params: { from: 'idle', to: 'starting' } }],
        },
      },
    },

    // =========================================================================
    // STARTING - Worker initialization in progress
    // =========================================================================
    starting: {
      entry: ['clearError'],
      invoke: {
        id: 'initWorker',
        src: 'initWorker',
        input: ({ context }) => context,
        onDone: {
          target: 'ready',
          actions: [
            { type: 'logTransition', params: { from: 'starting', to: 'ready' } },
            'resetRetries',
          ],
        },
        onError: {
          target: 'degraded',
          actions: [
            { type: 'logTransition', params: { from: 'starting', to: 'degraded' } },
            { type: 'setError', params: ({ event }) => ({ error: event.error as Error }) },
          ],
        },
      },
      // Handle WORKER_ERROR from bridge during init (e.g., early crash)
      on: {
        WORKER_ERROR: {
          target: 'degraded',
          actions: [
            { type: 'logTransition', params: { from: 'starting', to: 'degraded' } },
            { type: 'setError', params: ({ event }) => ({ error: event.error }) },
          ],
        },
      },
    },

    // =========================================================================
    // READY - Worker is operational
    // =========================================================================
    ready: {
      on: {
        WORKER_ERROR: {
          target: 'degraded',
          actions: [
            { type: 'logTransition', params: { from: 'ready', to: 'degraded' } },
            { type: 'setError', params: ({ event }) => ({ error: event.error }) },
          ],
        },
        SHUTDOWN: {
          target: 'shuttingDown',
          actions: [{ type: 'logTransition', params: { from: 'ready', to: 'shuttingDown' } }],
        },
      },
    },

    // =========================================================================
    // DEGRADED - Worker crashed, waiting for retry
    // =========================================================================
    degraded: {
      always: [
        {
          guard: 'maxRetriesExceeded',
          target: 'error',
          actions: [{ type: 'logTransition', params: { from: 'degraded', to: 'error' } }],
        },
      ],
      after: {
        backoffDelay: {
          target: 'restarting',
          actions: [{ type: 'logTransition', params: { from: 'degraded', to: 'restarting' } }],
        },
      },
      on: {
        RETRY: {
          target: 'restarting',
          actions: [{ type: 'logTransition', params: { from: 'degraded', to: 'restarting' } }],
        },
        SHUTDOWN: {
          target: 'shuttingDown',
          actions: [{ type: 'logTransition', params: { from: 'degraded', to: 'shuttingDown' } }],
        },
      },
    },

    // =========================================================================
    // RESTARTING - Attempting to restart the worker
    // =========================================================================
    restarting: {
      entry: ['incrementRetry'],
      invoke: {
        id: 'restartWorker',
        src: 'restartWorker',
        input: ({ context }) => context,
        onDone: {
          target: 'ready',
          actions: [
            { type: 'logTransition', params: { from: 'restarting', to: 'ready' } },
            'resetRetries',
            'clearError',
          ],
        },
        onError: {
          target: 'degraded',
          actions: [
            { type: 'logTransition', params: { from: 'restarting', to: 'degraded' } },
            { type: 'setError', params: ({ event }) => ({ error: event.error as Error }) },
          ],
        },
      },
      // Handle WORKER_ERROR from bridge during restart (e.g., early crash)
      on: {
        WORKER_ERROR: {
          target: 'degraded',
          actions: [
            { type: 'logTransition', params: { from: 'restarting', to: 'degraded' } },
            { type: 'setError', params: ({ event }) => ({ error: event.error }) },
          ],
        },
      },
    },

    // =========================================================================
    // ERROR - Max retries exceeded, manual intervention needed
    // =========================================================================
    error: {
      on: {
        RETRY: {
          target: 'restarting',
          actions: [
            { type: 'logTransition', params: { from: 'error', to: 'restarting' } },
            'resetRetries',
          ],
        },
        SHUTDOWN: {
          target: 'shuttingDown',
          actions: [{ type: 'logTransition', params: { from: 'error', to: 'shuttingDown' } }],
        },
      },
    },

    // =========================================================================
    // SHUTTING_DOWN - Cleanup in progress
    // =========================================================================
    shuttingDown: {
      invoke: {
        id: 'shutdownWorker',
        src: 'shutdownWorker',
        input: ({ context }) => context,
        onDone: {
          target: 'terminated',
        },
        onError: {
          // Even on error, consider it terminated
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
// Adapter Class (implements PersistenceLifecyclePort)
// =============================================================================

/**
 * PersistenceLifecycleAdapter
 *
 * Wraps the XState machine to implement PersistenceLifecyclePort interface.
 */
export class PersistenceLifecycleAdapter implements PersistenceLifecyclePort {
  private actor: ActorRefFrom<typeof persistenceMachine>;

  constructor(input: PersistenceInput) {
    this.actor = createActor(persistenceMachine, { input });
    this.actor.start();
    lifecycleLog.info('[PersistenceLifecycle] XState machine started');
  }

  // ===========================================================================
  // PersistenceLifecyclePort Implementation
  // ===========================================================================

  getState(): PersistenceLifecycleState {
    const snapshot = this.actor.getSnapshot();
    const stateValue = snapshot.value;

    if (stateValue === 'idle') return 'idle';
    if (stateValue === 'starting') return 'starting';
    if (stateValue === 'ready') return 'ready';
    if (stateValue === 'degraded') return 'degraded';
    if (stateValue === 'restarting') return 'restarting';
    if (stateValue === 'error') return 'error';
    if (stateValue === 'shuttingDown' || stateValue === 'terminated') return 'terminated';

    return 'idle';
  }

  getError(): Error | null {
    return this.actor.getSnapshot().context.error;
  }

  getRetryCount(): number {
    return this.actor.getSnapshot().context.retryCount;
  }

  isReady(): boolean {
    return this.getState() === 'ready';
  }

  isDegraded(): boolean {
    const state = this.getState();
    return state === 'degraded' || state === 'restarting' || state === 'error';
  }

  init(): void {
    this.actor.send({ type: 'INIT' });
  }

  retry(): void {
    this.actor.send({ type: 'RETRY' });
  }

  reportError(error: Error): void {
    this.actor.send({ type: 'WORKER_ERROR', error });
  }

  async shutdown(): Promise<void> {
    this.actor.send({ type: 'SHUTDOWN' });

    return new Promise((resolve) => {
      const checkDone = () => {
        const state = this.getState();
        if (state === 'terminated') {
          resolve();
        } else {
          setTimeout(checkDone, 50);
        }
      };
      setTimeout(checkDone, 100);
    });
  }

  subscribe(listener: (state: PersistenceLifecycleState) => void): () => void {
    listener(this.getState());

    const subscription = this.actor.subscribe(() => {
      listener(this.getState());
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Wait for the machine to reach 'ready' state.
   * Rejects if it enters 'error' state.
   */
  waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReady()) {
        resolve();
        return;
      }

      const subscription = this.actor.subscribe(() => {
        const state = this.getState();
        if (state === 'ready') {
          subscription.unsubscribe();
          resolve();
        } else if (state === 'error') {
          subscription.unsubscribe();
          reject(this.getError() ?? new Error('Persistence initialization failed'));
        }
      });
    });
  }

  /**
   * Dispose the adapter.
   */
  dispose(): void {
    this.actor.stop();
    lifecycleLog.info('[PersistenceLifecycle] XState machine stopped');
  }
}

export type { PersistenceInput };
