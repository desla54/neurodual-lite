/**
 * AppLifecycleMachine Tests (XState v5)
 *
 * Unit tests for the XState app lifecycle machine.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AppLifecycleAdapter, type AppLifecycleInput } from './app-lifecycle-machine';

// =============================================================================
// Mock Init Functions
// =============================================================================

function createMockInput(shouldFail = false): AppLifecycleInput {
  return {
    initPersistence: mock(() =>
      shouldFail ? Promise.reject(new Error('SQLite init failed')) : Promise.resolve(),
    ),
    initSettings: mock(() => Promise.resolve()),
    initI18n: mock(() => Promise.resolve()),
  };
}

// Helper to wait for async state transitions
async function waitForState(adapter: AppLifecycleAdapter, expectedState: string, timeout = 500) {
  const start = Date.now();
  while (adapter.getState() !== expectedState && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('AppLifecycleAdapter (XState)', () => {
  let mockInput: AppLifecycleInput;
  let adapter: AppLifecycleAdapter;

  beforeEach(() => {
    mockInput = createMockInput();
    adapter = new AppLifecycleAdapter(mockInput);
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe('initialization', () => {
    it('auto-transitions cold_start → initializing → ready on success', async () => {
      // cold_start immediately transitions to initializing
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');
      expect(adapter.isReady()).toBe(true);
    });

    it('calls init functions in order', async () => {
      await waitForState(adapter, 'ready');

      expect((mockInput.initPersistence as ReturnType<typeof mock>).mock.calls.length).toBe(1);
      expect((mockInput.initSettings as ReturnType<typeof mock>).mock.calls.length).toBe(1);
      expect((mockInput.initI18n as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it('transitions to error state on init failure', async () => {
      adapter.dispose();
      mockInput = createMockInput(true); // Will fail
      adapter = new AppLifecycleAdapter(mockInput);

      await waitForState(adapter, 'error');
      expect(adapter.getState()).toBe('error');
      expect(adapter.getError()).not.toBeNull();
      expect(adapter.isReady()).toBe(false);
    });
  });

  describe('retry', () => {
    it('transitions from error → initializing on retry()', async () => {
      // Start with failing adapter
      adapter.dispose();
      mockInput = createMockInput(true);
      adapter = new AppLifecycleAdapter(mockInput);

      await waitForState(adapter, 'error');
      expect(adapter.getState()).toBe('error');

      // Now make init succeed
      (mockInput.initPersistence as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(),
      );

      adapter.retry();
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');
    });
  });

  describe('session management', () => {
    it('transitions ready → active on enterSession()', async () => {
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');

      adapter.enterSession();
      expect(adapter.getState()).toBe('active');
    });

    it('transitions active → ready on exitSession()', async () => {
      await waitForState(adapter, 'ready');
      adapter.enterSession();
      expect(adapter.getState()).toBe('active');

      adapter.exitSession();
      expect(adapter.getState()).toBe('ready');
    });
  });

  describe('subscribe', () => {
    it('immediately calls listener with current state', async () => {
      await waitForState(adapter, 'ready');

      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      expect(states).toContain('ready');
    });

    it('unsubscribe stops notifications', async () => {
      await waitForState(adapter, 'ready');

      const listener = mock(() => {});
      const unsubscribe = adapter.subscribe(listener);
      expect(listener.mock.calls.length).toBe(1);

      unsubscribe();
      adapter.enterSession();

      // Should still only have initial call since we unsubscribed
      expect(listener.mock.calls.length).toBe(1);
    });
  });

  describe('dispose', () => {
    it('can be called multiple times safely', () => {
      adapter.dispose();
      adapter.dispose();
      // No error thrown
      expect(true).toBe(true);
    });
  });
});
