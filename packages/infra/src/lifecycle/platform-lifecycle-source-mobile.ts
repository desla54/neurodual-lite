/**
 * Mobile Platform Lifecycle Source
 *
 * Implementation of PlatformLifecycleSource using Capacitor App plugin.
 * For native iOS and Android apps.
 */

import type { PlatformLifecycleSource, PlatformLifecycleListener } from '@neurodual/logic';
import { App, type AppState } from '@capacitor/app';
import { lifecycleLog } from '../logger';

/**
 * Mobile implementation using Capacitor App.appStateChange event.
 *
 * On mobile, the app can be in:
 * - Active state (foreground)
 * - Inactive state (brief transition, e.g., control center)
 * - Background state (user switched apps)
 */
export class MobilePlatformLifecycleSource implements PlatformLifecycleSource {
  private listeners: Set<PlatformLifecycleListener> = new Set();
  private removeListener: (() => void) | null = null;
  private disposed = false;
  private currentlyBackgrounded = false;

  constructor() {
    this.setupListeners();
    lifecycleLog.debug('[PlatformLifecycle] Mobile source initialized');
  }

  subscribe(listener: PlatformLifecycleListener): () => void {
    if (this.disposed) {
      lifecycleLog.warn('[PlatformLifecycle] Subscribing to disposed source');
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  isBackgrounded(): boolean {
    return this.currentlyBackgrounded;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.removeListener) {
      this.removeListener();
      this.removeListener = null;
    }

    this.listeners.clear();
    lifecycleLog.debug('[PlatformLifecycle] Mobile source disposed');
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async setupListeners(): Promise<void> {
    try {
      // Get initial state
      const state = await App.getState();
      this.currentlyBackgrounded = !state.isActive;

      // Subscribe to state changes
      const handle = await App.addListener('appStateChange', (state: AppState) => {
        this.handleStateChange(state);
      });

      this.removeListener = () => handle.remove();
    } catch (error) {
      lifecycleLog.error('[PlatformLifecycle] Failed to setup mobile listeners:', error);
    }
  }

  private handleStateChange(state: AppState): void {
    const wasBackgrounded = this.currentlyBackgrounded;
    const isNowBackgrounded = !state.isActive;

    // Only emit events on actual transitions
    if (wasBackgrounded !== isNowBackgrounded) {
      this.currentlyBackgrounded = isNowBackgrounded;

      const event = isNowBackgrounded ? 'BACKGROUNDED' : 'FOREGROUNDED';
      lifecycleLog.debug(`[PlatformLifecycle] Mobile state: ${event}`);

      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (error) {
          lifecycleLog.error('[PlatformLifecycle] Listener error:', error);
        }
      }
    }
  }
}
