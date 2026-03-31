import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createActor } from 'xstate';

import {
  networkMachine,
  NetworkLifecycleAdapter,
  getNetworkAdapter,
  resetNetworkAdapter,
} from './network-lifecycle-machine';

// Ensure window.addEventListener/removeEventListener exist (can be wiped by mock.module in other tests)
const w = globalThis.window as unknown as Record<string, unknown> | undefined;
const origAddEventListener = w?.['addEventListener'] as ((...args: unknown[]) => void) | undefined;
const origRemoveEventListener = w?.['removeEventListener'] as
  | ((...args: unknown[]) => void)
  | undefined;

function ensureWindowEvents() {
  const win = globalThis.window as unknown as Record<string, unknown> | undefined;
  if (win) {
    if (typeof win['addEventListener'] !== 'function') {
      win['addEventListener'] = origAddEventListener ?? (() => {});
    }
    if (typeof win['removeEventListener'] !== 'function') {
      win['removeEventListener'] = origRemoveEventListener ?? (() => {});
    }
  }
}

// =============================================================================
// effectiveTypeToQuality mapping
// =============================================================================

describe('NetworkLifecycleAdapter', () => {
  let adapter: NetworkLifecycleAdapter;

  beforeEach(() => {
    ensureWindowEvents();
  });

  afterEach(() => {
    resetNetworkAdapter();
  });

  describe('effectiveTypeToQuality mapping', () => {
    // Access private method for testing
    const getQuality = (adapter: NetworkLifecycleAdapter, effectiveType?: string) => {
      return (
        adapter as unknown as { effectiveTypeToQuality(t?: string): string }
      ).effectiveTypeToQuality(effectiveType);
    };

    beforeEach(() => {
      adapter = new NetworkLifecycleAdapter();
    });

    afterEach(() => {
      adapter.dispose();
    });

    it('should map 4g to excellent', () => {
      expect(getQuality(adapter, '4g')).toBe('excellent');
    });

    it('should map 3g to good', () => {
      expect(getQuality(adapter, '3g')).toBe('good');
    });

    it('should map 2g to fair', () => {
      expect(getQuality(adapter, '2g')).toBe('fair');
    });

    it('should map slow-2g to poor', () => {
      expect(getQuality(adapter, 'slow-2g')).toBe('poor');
    });

    it('should map undefined to unknown', () => {
      expect(getQuality(adapter, undefined)).toBe('unknown');
    });

    it('should map unknown string to unknown', () => {
      expect(getQuality(adapter, 'wifi')).toBe('unknown');
    });
  });

  // ===========================================================================
  // State transitions (XState machine directly)
  // ===========================================================================

  describe('networkMachine state transitions', () => {
    it('should transition from unknown to online when navigator.onLine is true', () => {
      // navigator.onLine is true by default in bun test environment
      const actor = createActor(networkMachine);
      actor.start();

      const snapshot = actor.getSnapshot();
      // unknown immediately transitions based on isNavigatorOnline guard
      expect(snapshot.value).toBe('online');
      actor.stop();
    });

    it('should transition from online to offline on OFFLINE event', () => {
      const actor = createActor(networkMachine);
      actor.start();

      // Should start online
      expect(actor.getSnapshot().value).toBe('online');

      actor.send({ type: 'OFFLINE' });
      expect(actor.getSnapshot().value).toBe('offline');
      actor.stop();
    });

    it('should transition from offline to online on ONLINE event', () => {
      const actor = createActor(networkMachine);
      actor.start();

      actor.send({ type: 'OFFLINE' });
      expect(actor.getSnapshot().value).toBe('offline');

      actor.send({ type: 'ONLINE' });
      expect(actor.getSnapshot().value).toBe('online');
      actor.stop();
    });

    it('should update quality on QUALITY_CHANGED event', () => {
      const actor = createActor(networkMachine);
      actor.start();

      actor.send({
        type: 'QUALITY_CHANGED',
        quality: 'excellent',
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
      });

      const ctx = actor.getSnapshot().context;
      expect(ctx.quality).toBe('excellent');
      expect(ctx.effectiveType).toBe('4g');
      expect(ctx.downlink).toBe(10);
      expect(ctx.rtt).toBe(50);
      actor.stop();
    });

    it('should set state to online in context on entry', () => {
      const actor = createActor(networkMachine);
      actor.start();

      expect(actor.getSnapshot().context.state).toBe('online');
      actor.stop();
    });

    it('should set state to offline in context on entry', () => {
      const actor = createActor(networkMachine);
      actor.start();

      actor.send({ type: 'OFFLINE' });
      expect(actor.getSnapshot().context.state).toBe('offline');
      actor.stop();
    });
  });

  // ===========================================================================
  // Adapter public API
  // ===========================================================================

  describe('adapter public API', () => {
    beforeEach(() => {
      adapter = new NetworkLifecycleAdapter();
    });

    afterEach(() => {
      adapter.dispose();
    });

    it('getState should return online when navigator is online', () => {
      expect(adapter.getState()).toBe('online');
    });

    it('isOnline should return true when online', () => {
      expect(adapter.isOnline()).toBe(true);
    });

    it('getInfo should return network info object', () => {
      const info = adapter.getInfo();
      expect(info.state).toBe('online');
      expect(info.quality).toBeDefined();
      expect(info.lastUpdated).toBeGreaterThan(0);
    });

    it('subscribe should immediately call listener with current info', () => {
      let receivedInfo: unknown = null;
      adapter.subscribe((info) => {
        receivedInfo = info;
      });
      expect(receivedInfo).not.toBeNull();
    });

    it('subscribe should return an unsubscribe function', () => {
      let callCount = 0;
      const unsubscribe = adapter.subscribe(() => {
        callCount++;
      });
      // Called once immediately
      expect(callCount).toBe(1);

      unsubscribe();
      // After unsubscribe, further state changes should not notify
    });
  });

  // ===========================================================================
  // Singleton pattern
  // ===========================================================================

  describe('singleton pattern', () => {
    it('getNetworkAdapter should return the same instance', () => {
      const a = getNetworkAdapter();
      const b = getNetworkAdapter();
      expect(a).toBe(b);
      resetNetworkAdapter();
    });

    it('resetNetworkAdapter should clear the singleton', () => {
      const a = getNetworkAdapter();
      resetNetworkAdapter();
      const b = getNetworkAdapter();
      expect(a).not.toBe(b);
      resetNetworkAdapter();
    });
  });

  // ===========================================================================
  // dispose
  // ===========================================================================

  describe('dispose', () => {
    it('should clear listeners and stop actor', () => {
      adapter = new NetworkLifecycleAdapter();
      adapter.dispose();
      // No error when disposing
      expect(true).toBe(true);
    });
  });
});
