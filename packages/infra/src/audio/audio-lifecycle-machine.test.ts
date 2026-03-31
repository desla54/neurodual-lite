/**
 * AudioLifecycleMachine Tests (XState v5)
 *
 * Unit tests for the XState audio lifecycle machine.
 */

// Setup window and document mocks BEFORE importing the module
// The singleton audioLifecycleAdapter is created at module load time and needs these
if (typeof window === 'undefined' || !window.addEventListener) {
  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof document === 'undefined' || !document.addEventListener) {
  (globalThis as Record<string, unknown>).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  };
}

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AudioLifecycleAdapter } from './audio-lifecycle-machine';
import type { AudioService } from './audio-service';

// =============================================================================
// Mock AudioService
// =============================================================================

function createMockAudioService(buffersReady = true, contextRunning = true): AudioService {
  return {
    init: mock(() => Promise.resolve()),
    resume: mock(() => Promise.resolve()),
    isReady: mock(() => buffersReady),
    isAudioContextRunning: mock(() => contextRunning),
    stopAll: mock(() => {}),
  } as unknown as AudioService;
}

// Helper to wait for async state transitions
async function waitForState(adapter: AudioLifecycleAdapter, expectedState: string, timeout = 200) {
  const start = Date.now();
  while (adapter.getState() !== expectedState && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('AudioLifecycleAdapter (XState)', () => {
  let mockAudio: AudioService;
  let adapter: AudioLifecycleAdapter;

  beforeEach(() => {
    mockAudio = createMockAudioService();
    adapter = new AudioLifecycleAdapter(mockAudio);
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe('initial state', () => {
    it('starts in uninitialized state', () => {
      expect(adapter.getState()).toBe('uninitialized');
    });

    it('isReady returns false initially', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('getLoadingProgress returns null initially', () => {
      expect(adapter.getLoadingProgress()).toBeNull();
    });
  });

  describe('preload', () => {
    it('transitions to loading state on preload()', () => {
      adapter.preload();
      expect(adapter.getState()).toBe('loading');
    });

    it('transitions to ready when AudioService is ready', async () => {
      adapter.preload();
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');
    });

    it('transitions to locked when AudioContext is suspended', async () => {
      adapter.dispose();
      mockAudio = createMockAudioService(true, false); // buffers ready, context not running
      adapter = new AudioLifecycleAdapter(mockAudio);

      adapter.preload();
      await waitForState(adapter, 'locked');
      expect(adapter.getState()).toBe('locked');
    });
  });

  describe('unlock', () => {
    it('transitions from locked to ready on unlock()', async () => {
      // Start with locked audio
      adapter.dispose();
      mockAudio = createMockAudioService(true, false);
      adapter = new AudioLifecycleAdapter(mockAudio);

      adapter.preload();
      await waitForState(adapter, 'locked');
      expect(adapter.getState()).toBe('locked');

      // Now make it ready and unlock
      (mockAudio.isAudioContextRunning as ReturnType<typeof mock>).mockImplementation(() => true);
      await adapter.unlock();
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');
    });

    it('is a no-op when already ready', async () => {
      adapter.preload();
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');

      await adapter.unlock();
      expect(adapter.getState()).toBe('ready');
    });
  });

  describe('subscribe', () => {
    it('immediately calls listener with current state', () => {
      const listener = mock(() => {});
      adapter.subscribe(listener);
      expect(listener).toHaveBeenCalledWith('uninitialized');
    });

    it('calls listener on state changes', async () => {
      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      expect(states).toContain('uninitialized');

      adapter.preload();
      await waitForState(adapter, 'ready');

      expect(states).toContain('loading');
      expect(states).toContain('ready');
    });

    it('unsubscribe stops notifications', async () => {
      const listener = mock(() => {});
      const unsubscribe = adapter.subscribe(listener);
      expect(listener.mock.calls.length).toBe(1);

      unsubscribe();
      adapter.preload();
      await waitForState(adapter, 'ready');

      // Should only have initial call
      expect(listener.mock.calls.length).toBe(1);
    });
  });

  describe('notifyConfigChanged', () => {
    it('triggers reload when in ready state', async () => {
      adapter.preload();
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');

      adapter.notifyConfigChanged();
      expect(adapter.getState()).toBe('loading');
    });

    it('does nothing when in uninitialized state', () => {
      adapter.notifyConfigChanged();
      expect(adapter.getState()).toBe('uninitialized');
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
