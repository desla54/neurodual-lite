/**
 * Web Platform Lifecycle Source
 *
 * Implementation of PlatformLifecycleSource using document.visibilitychange.
 * For web browsers only (not Capacitor native).
 */

import type { PlatformLifecycleSource, PlatformLifecycleListener } from '@neurodual/logic';
import { lifecycleLog } from '../logger';

/**
 * Web implementation using document.visibilitychange API.
 */
export class WebPlatformLifecycleSource implements PlatformLifecycleSource {
  private listeners: Set<PlatformLifecycleListener> = new Set();
  private boundHandler: () => void;
  private disposed = false;

  constructor() {
    this.boundHandler = this.handleVisibilityChange.bind(this);
    this.setupListeners();
    lifecycleLog.debug('[PlatformLifecycle] Web source initialized');
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
    if (typeof document === 'undefined') return false;
    return document.hidden;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundHandler);
    }

    this.listeners.clear();
    lifecycleLog.debug('[PlatformLifecycle] Web source disposed');
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private setupListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundHandler);
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    const event = document.hidden ? 'BACKGROUNDED' : 'FOREGROUNDED';
    lifecycleLog.debug(`[PlatformLifecycle] Web visibility: ${event}`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        lifecycleLog.error('[PlatformLifecycle] Listener error:', error);
      }
    }
  }
}
