/**
 * PersistenceLifecycleMachine Tests (XState v5)
 *
 * Tests the state machine logic and the adapter class.
 * Uses direct actor manipulation + manual RETRY to avoid real backoff delays.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createActor } from 'xstate';
import {
  persistenceMachine,
  PersistenceLifecycleAdapter,
  type PersistenceInput,
} from './persistence-lifecycle-machine';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockInput(overrides?: Partial<PersistenceInput>): PersistenceInput {
  return {
    createWorker: mock(() => Promise.resolve()),
    terminateWorker: mock(() => Promise.resolve()),
    ...overrides,
  };
}

function createFailingInput(error = new Error('Worker init failed')): PersistenceInput {
  return {
    createWorker: mock(() => Promise.reject(error)),
    terminateWorker: mock(() => Promise.resolve()),
  };
}

async function waitForState(
  adapter: PersistenceLifecycleAdapter,
  expectedState: string,
  timeout = 500,
) {
  const start = Date.now();
  while (adapter.getState() !== expectedState && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

// =============================================================================
// calculateBackoff (pure function logic)
// =============================================================================

describe('calculateBackoff (formula verification)', () => {
  it('uses exponential backoff: base 1s * 2^retryCount, capped at 10s', () => {
    const calculateBackoff = (retryCount: number): number => {
      const BASE_BACKOFF_MS = 1000;
      const MAX_BACKOFF_MS = 10000;
      return Math.min(BASE_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS);
    };

    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
    expect(calculateBackoff(4)).toBe(10000);
    expect(calculateBackoff(10)).toBe(10000);
  });
});

// =============================================================================
// withTimeout (reimplemented for direct unit testing)
// =============================================================================

describe('withTimeout', () => {
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

  it('resolves when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'timeout');
    expect(result).toBe(42);
  });

  it('rejects with timeout error when promise takes too long', async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(42), 5000));
    await expect(withTimeout(slow, 50, 'Timed out!')).rejects.toThrow('Timed out!');
  });

  it('rejects with original error when promise rejects before timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('original')), 1000, 'timeout'),
    ).rejects.toThrow('original');
  });
});

// =============================================================================
// Raw XState Machine (direct state testing, no real delays)
// =============================================================================

describe('persistenceMachine (raw XState)', () => {
  it('starts in idle state', () => {
    const actor = createActor(persistenceMachine, {
      input: createMockInput(),
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('transitions from idle to starting on INIT', () => {
    const input = createMockInput({
      createWorker: mock((): Promise<void> => new Promise(() => {})),
    });
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    expect(actor.getSnapshot().value).toBe('starting');
    actor.stop();
  });

  it('transitions from starting to ready when worker resolves', async () => {
    const input = createMockInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('ready');
    actor.stop();
  });

  it('transitions from starting to degraded when worker rejects', async () => {
    const input = createFailingInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('degraded');
    expect(actor.getSnapshot().context.error).not.toBeNull();
    actor.stop();
  });

  it('transitions from starting to degraded on WORKER_ERROR', () => {
    const input = createMockInput({
      createWorker: mock((): Promise<void> => new Promise(() => {})),
    });
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    actor.send({ type: 'WORKER_ERROR', error: new Error('crash') });

    expect(actor.getSnapshot().value).toBe('degraded');
    expect(actor.getSnapshot().context.error?.message).toBe('crash');
    actor.stop();
  });

  it('transitions from ready to degraded on WORKER_ERROR', async () => {
    const input = createMockInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('ready');

    actor.send({ type: 'WORKER_ERROR', error: new Error('runtime crash') });
    expect(actor.getSnapshot().value).toBe('degraded');
    actor.stop();
  });

  it('transitions from degraded to restarting on RETRY', () => {
    const input = createMockInput({
      createWorker: mock((): Promise<void> => new Promise(() => {})),
    });
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    actor.send({ type: 'WORKER_ERROR', error: new Error('crash') });
    expect(actor.getSnapshot().value).toBe('degraded');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('restarting');
    expect(actor.getSnapshot().context.retryCount).toBe(1);
    actor.stop();
  });

  it('increments retryCount on each restarting entry', async () => {
    const input = createFailingInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('degraded');
    expect(actor.getSnapshot().context.retryCount).toBe(0);

    // Manual retries bypass backoff delay
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(1);
    await new Promise((r) => setTimeout(r, 50));

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(2);
    await new Promise((r) => setTimeout(r, 50));

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(3);
    await new Promise((r) => setTimeout(r, 50));

    // After retryCount=3, degraded → error via maxRetriesExceeded guard
    expect(actor.getSnapshot().value).toBe('error');
    actor.stop();
  });

  it('transitions to error when maxRetries exceeded', async () => {
    const input = createFailingInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));

    for (let i = 0; i < 3; i++) {
      actor.send({ type: 'RETRY' });
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.retryCount).toBe(3);
    actor.stop();
  });

  it('can retry from error state (resets retryCount)', async () => {
    const input = createFailingInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 3; i++) {
      actor.send({ type: 'RETRY' });
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(actor.getSnapshot().value).toBe('error');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('restarting');
    // retryCount is reset to 0 then incremented to 1 on entry
    expect(actor.getSnapshot().context.retryCount).toBe(1);
    actor.stop();
  });

  it('ignores RETRY and SHUTDOWN in idle', () => {
    const actor = createActor(persistenceMachine, {
      input: createMockInput(),
    });
    actor.start();

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'SHUTDOWN' });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });

  it('transitions to terminated on SHUTDOWN from ready', async () => {
    const input = createMockInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));

    actor.send({ type: 'SHUTDOWN' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('terminated');
    actor.stop();
  });

  it('transitions to terminated on SHUTDOWN from degraded', async () => {
    const input = createMockInput({
      createWorker: mock((): Promise<void> => new Promise(() => {})),
    });
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    actor.send({ type: 'WORKER_ERROR', error: new Error('crash') });

    actor.send({ type: 'SHUTDOWN' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('terminated');
    actor.stop();
  });

  it('transitions to terminated on SHUTDOWN from error', async () => {
    const input = createFailingInput();
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 3; i++) {
      actor.send({ type: 'RETRY' });
      await new Promise((r) => setTimeout(r, 50));
    }

    actor.send({ type: 'SHUTDOWN' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('terminated');
    actor.stop();
  });

  it('resets retryCount on successful restart', async () => {
    let callCount = 0;
    const input = createMockInput({
      createWorker: mock(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      }),
    });
    const actor = createActor(persistenceMachine, { input });
    actor.start();

    actor.send({ type: 'INIT' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('degraded');

    actor.send({ type: 'RETRY' });
    await new Promise((r) => setTimeout(r, 50));
    expect(actor.getSnapshot().value).toBe('ready');
    expect(actor.getSnapshot().context.retryCount).toBe(0);
    actor.stop();
  });
});

// =============================================================================
// PersistenceLifecycleAdapter (fast-path tests only)
// =============================================================================

describe('PersistenceLifecycleAdapter', () => {
  let input: PersistenceInput;
  let adapter: PersistenceLifecycleAdapter;

  beforeEach(() => {
    input = createMockInput();
    adapter = new PersistenceLifecycleAdapter(input);
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe('initial state', () => {
    it('starts in idle', () => {
      expect(adapter.getState()).toBe('idle');
    });

    it('is not ready', () => {
      expect(adapter.isReady()).toBe(false);
    });

    it('is not degraded', () => {
      expect(adapter.isDegraded()).toBe(false);
    });

    it('has no error', () => {
      expect(adapter.getError()).toBeNull();
    });

    it('has zero retry count', () => {
      expect(adapter.getRetryCount()).toBe(0);
    });
  });

  describe('happy path: init → ready', () => {
    it('transitions to ready when worker initializes', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');

      expect(adapter.getState()).toBe('ready');
      expect(adapter.isReady()).toBe(true);
      expect(adapter.isDegraded()).toBe(false);
      expect(adapter.getError()).toBeNull();
    });

    it('calls createWorker', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');
      expect((input.createWorker as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
  });

  describe('error path', () => {
    it('becomes degraded when worker fails', async () => {
      adapter.dispose();
      input = createFailingInput();
      adapter = new PersistenceLifecycleAdapter(input);

      adapter.init();
      await waitForState(adapter, 'degraded');

      expect(adapter.isDegraded()).toBe(true);
      expect(adapter.getError()).not.toBeNull();
    });

    it('becomes degraded on reportError from ready', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');

      adapter.reportError(new Error('Worker crash'));
      await new Promise((r) => setTimeout(r, 30));

      expect(adapter.isDegraded()).toBe(true);
      expect(adapter.getError()?.message).toBe('Worker crash');
    });
  });

  describe('subscribe', () => {
    it('immediately calls listener with current state', () => {
      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      expect(states.length).toBeGreaterThanOrEqual(1);
      expect(states[0]).toBe('idle');
    });

    it('notifies on state changes', async () => {
      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      adapter.init();
      await waitForState(adapter, 'ready');

      expect(states).toContain('idle');
      expect(states).toContain('ready');
    });

    it('unsubscribe stops notifications', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');

      const listener = mock(() => {});
      const unsub = adapter.subscribe(listener);
      const before = listener.mock.calls.length;
      unsub();

      adapter.reportError(new Error('test'));
      await new Promise((r) => setTimeout(r, 50));

      expect(listener.mock.calls.length).toBe(before);
    });

    it('multiple subscribers receive updates', async () => {
      const s1: string[] = [];
      const s2: string[] = [];
      adapter.subscribe((s) => s1.push(s));
      adapter.subscribe((s) => s2.push(s));

      adapter.init();
      await waitForState(adapter, 'ready');

      expect(s1).toContain('ready');
      expect(s2).toContain('ready');
    });
  });

  describe('waitForReady', () => {
    it('resolves immediately if already ready', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');
      await adapter.waitForReady();
      expect(adapter.isReady()).toBe(true);
    });

    it('resolves when machine transitions to ready', async () => {
      const readyPromise = adapter.waitForReady();
      adapter.init();
      await readyPromise;
      expect(adapter.isReady()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('transitions to terminated', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');
      await adapter.shutdown();
      expect(adapter.getState()).toBe('terminated');
    });

    it('calls terminateWorker', async () => {
      adapter.init();
      await waitForState(adapter, 'ready');
      await adapter.shutdown();
      expect(
        (input.terminateWorker as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dispose', () => {
    it('stops the actor without throwing', () => {
      adapter.dispose();
      expect(adapter.getState()).toBeDefined();
    });

    it('can be called multiple times', () => {
      adapter.dispose();
      adapter.dispose();
      expect(true).toBe(true);
    });
  });
});
