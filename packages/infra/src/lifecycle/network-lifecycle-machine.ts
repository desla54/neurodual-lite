/**
 * Network Lifecycle Machine (XState v5)
 *
 * State machine for network connectivity monitoring.
 * Detects online/offline status and monitors network quality.
 *
 * States:
 * - unknown → online | offline (initial detection)
 * - online ⇄ offline (connectivity changes)
 */

import { setup, assign, createActor, type ActorRefFrom } from 'xstate';
import type {
  NetworkLifecyclePort,
  NetworkState,
  NetworkStateListener,
  NetworkInfo,
  NetworkQuality,
} from '@neurodual/logic';
import { lifecycleLog } from '../logger';

// =============================================================================
// Types
// =============================================================================

interface NetworkContext {
  state: NetworkState;
  quality: NetworkQuality;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  lastUpdated: number;
}

type NetworkEvent =
  | { type: 'ONLINE' }
  | { type: 'OFFLINE' }
  | {
      type: 'QUALITY_CHANGED';
      quality: NetworkQuality;
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    }
  | { type: 'CHECK' };

// =============================================================================
// XState Machine Definition
// =============================================================================

export const networkMachine = setup({
  types: {
    context: {} as NetworkContext,
    events: {} as NetworkEvent,
  },

  actions: {
    logTransition: (_, params: { from: string; to: string }) => {
      lifecycleLog.info(`[Network] ${params.from} → ${params.to}`);
    },

    updateTimestamp: assign({
      lastUpdated: () => Date.now(),
    }),

    setOnline: assign({
      state: () => 'online' as const,
      lastUpdated: () => Date.now(),
    }),

    setOffline: assign({
      state: () => 'offline' as const,
      lastUpdated: () => Date.now(),
    }),

    updateQuality: assign(({ event }) => {
      if (event.type !== 'QUALITY_CHANGED') return {};
      return {
        quality: event.quality,
        effectiveType: event.effectiveType,
        downlink: event.downlink,
        rtt: event.rtt,
        lastUpdated: Date.now(),
      };
    }),
  },

  guards: {
    isNavigatorOnline: () => {
      if (typeof navigator === 'undefined') return true;
      return navigator.onLine;
    },
  },
}).createMachine({
  id: 'networkLifecycle',
  initial: 'unknown',
  context: {
    state: 'unknown',
    quality: 'unknown',
    lastUpdated: Date.now(),
  },

  states: {
    // =========================================================================
    // UNKNOWN - Initial state, detecting connectivity
    // =========================================================================
    unknown: {
      always: [
        {
          guard: 'isNavigatorOnline',
          target: 'online',
          actions: [{ type: 'logTransition', params: { from: 'unknown', to: 'online' } }],
        },
        {
          target: 'offline',
          actions: [{ type: 'logTransition', params: { from: 'unknown', to: 'offline' } }],
        },
      ],
    },

    // =========================================================================
    // ONLINE - Connected to network
    // =========================================================================
    online: {
      entry: 'setOnline',
      on: {
        OFFLINE: {
          target: 'offline',
          actions: [{ type: 'logTransition', params: { from: 'online', to: 'offline' } }],
        },
        QUALITY_CHANGED: {
          actions: ['updateQuality'],
        },
        CHECK: [
          {
            guard: { type: 'isNavigatorOnline', params: {} },
            // Stay in online
          },
          {
            target: 'offline',
            actions: [{ type: 'logTransition', params: { from: 'online', to: 'offline' } }],
          },
        ],
      },
    },

    // =========================================================================
    // OFFLINE - Disconnected from network
    // =========================================================================
    offline: {
      entry: 'setOffline',
      on: {
        ONLINE: {
          target: 'online',
          actions: [{ type: 'logTransition', params: { from: 'offline', to: 'online' } }],
        },
        CHECK: [
          {
            guard: 'isNavigatorOnline',
            target: 'online',
            actions: [{ type: 'logTransition', params: { from: 'offline', to: 'online' } }],
          },
          // Stay in offline
        ],
      },
    },
  },
});

// =============================================================================
// Adapter Class (implements NetworkLifecyclePort)
// =============================================================================

/**
 * NetworkLifecycleAdapter
 *
 * Wraps the XState machine to implement NetworkLifecyclePort interface.
 * Sets up browser event listeners for online/offline detection.
 */
export class NetworkLifecycleAdapter implements NetworkLifecyclePort {
  private actor: ActorRefFrom<typeof networkMachine>;
  private listeners = new Set<NetworkStateListener>();
  private boundOnline: () => void;
  private boundOffline: () => void;
  private connectionChangeHandler?: () => void;

  constructor() {
    // Create and start the actor
    this.actor = createActor(networkMachine);
    this.actor.start();

    // Bind handlers
    this.boundOnline = this.handleOnline.bind(this);
    this.boundOffline = this.handleOffline.bind(this);

    // Setup event listeners
    this.setupEventListeners();

    // Subscribe to actor for listener notifications
    this.actor.subscribe(() => {
      this.notifyListeners();
    });

    lifecycleLog.info('[Network] XState machine started');
  }

  // ===========================================================================
  // NetworkLifecyclePort Implementation
  // ===========================================================================

  getState(): NetworkState {
    const snapshot = this.actor.getSnapshot();
    return snapshot.context.state;
  }

  getInfo(): NetworkInfo {
    const ctx = this.actor.getSnapshot().context;
    return {
      state: ctx.state,
      quality: ctx.quality,
      effectiveType: ctx.effectiveType,
      downlink: ctx.downlink,
      rtt: ctx.rtt,
      saveData: ctx.saveData,
      lastUpdated: ctx.lastUpdated,
    };
  }

  isOnline(): boolean {
    return this.getState() === 'online';
  }

  subscribe(listener: NetworkStateListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current state
    listener(this.getInfo());

    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.boundOnline);
      window.removeEventListener('offline', this.boundOffline);
    }

    // Remove connection change listener
    if (this.connectionChangeHandler && 'connection' in navigator) {
      const connection = (navigator as NavigatorWithConnection).connection;
      connection?.removeEventListener('change', this.connectionChangeHandler);
    }

    // Stop the actor
    this.actor.stop();
    this.listeners.clear();

    lifecycleLog.info('[Network] XState machine stopped');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private setupEventListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.boundOnline);
      window.addEventListener('offline', this.boundOffline);
    }

    // Setup Network Information API if available
    this.setupNetworkInformationAPI();
  }

  private setupNetworkInformationAPI(): void {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return;
    }

    const connection = (navigator as NavigatorWithConnection).connection;
    if (!connection) return;

    // Initial quality check
    this.updateNetworkQuality(connection);

    // Listen for changes
    this.connectionChangeHandler = () => this.updateNetworkQuality(connection);
    connection.addEventListener('change', this.connectionChangeHandler);
  }

  private updateNetworkQuality(connection: NetworkInformation): void {
    const quality = this.effectiveTypeToQuality(connection.effectiveType);

    this.actor.send({
      type: 'QUALITY_CHANGED',
      quality,
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
    });
  }

  private effectiveTypeToQuality(effectiveType?: string): NetworkQuality {
    switch (effectiveType) {
      case '4g':
        return 'excellent';
      case '3g':
        return 'good';
      case '2g':
        return 'fair';
      case 'slow-2g':
        return 'poor';
      default:
        return 'unknown';
    }
  }

  private handleOnline(): void {
    this.actor.send({ type: 'ONLINE' });
  }

  private handleOffline(): void {
    this.actor.send({ type: 'OFFLINE' });
  }

  private notifyListeners(): void {
    const info = this.getInfo();
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch (e) {
        lifecycleLog.error('[Network] Listener error:', e);
      }
    }
  }
}

// =============================================================================
// Type definitions for Network Information API
// =============================================================================

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

// =============================================================================
// Factory
// =============================================================================

let adapterInstance: NetworkLifecycleAdapter | null = null;

/**
 * Create or get the singleton NetworkLifecycleAdapter instance.
 */
export function getNetworkAdapter(): NetworkLifecycleAdapter {
  if (!adapterInstance) {
    adapterInstance = new NetworkLifecycleAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetNetworkAdapter(): void {
  if (adapterInstance) {
    adapterInstance.dispose();
    adapterInstance = null;
  }
}
