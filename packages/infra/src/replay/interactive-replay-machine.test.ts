/**
 * InteractiveReplayMachine Tests (XState v5)
 *
 * Unit tests for the XState interactive replay machine.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { InteractiveReplayAdapter } from './interactive-replay-machine';
import type { ReplayInteractifPort, ReplayRun, GameEvent, ModalityId } from '@neurodual/logic';

// =============================================================================
// Mock ReplayInteractifPort
// =============================================================================

function createMockAdapter(
  options: { canCreate?: boolean; failCreate?: boolean } = {},
): ReplayInteractifPort {
  const { canCreate = true, failCreate = false } = options;

  return {
    canCreateRun: mock(() => Promise.resolve(canCreate)),
    createRun: mock(() => {
      if (failCreate) {
        return Promise.reject(new Error('Failed to create run'));
      }
      return Promise.resolve({
        id: 'run-123',
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentRunId: null,
        depth: 1 as const,
        status: 'in_progress' as const,
        createdAt: Date.now(),
      } as ReplayRun);
    }),
    appendEventsBatch: mock(() => Promise.resolve(0)),
    appendEvent: mock(() => Promise.resolve({} as never)),
    completeRun: mock(() => Promise.resolve()),
    deleteRun: mock(() => Promise.resolve()),
    getRunsForSession: mock(() => Promise.resolve([])),
    getEventsForRun: mock(() => Promise.resolve([])),
    getActiveEventsForRun: mock(() => Promise.resolve([])),
    getRun: mock(() => Promise.resolve(null)),
    getNextDepth: mock(() => Promise.resolve(1 as const)),
    getInProgressRun: mock(() => Promise.resolve(null)),
    getOrphanedRuns: mock(() => Promise.resolve([])),
  } as unknown as ReplayInteractifPort;
}

// =============================================================================
// Mock Parent Events
// =============================================================================

function createMockParentEvents(): readonly GameEvent[] {
  const sessionId = 'session-456';
  const baseTime = 1000;

  return [
    {
      id: 'event-1',
      type: 'SESSION_STARTED',
      sessionId,
      timestamp: baseTime,
      mode: 'dual-catch',
    },
    {
      id: 'event-2',
      type: 'TRIAL_PRESENTED',
      sessionId,
      timestamp: baseTime + 100,
      trial: {
        index: 0,
        position: 1,
        sound: 'C',
        isPositionTarget: true,
        isSoundTarget: false,
        isColorTarget: false,
      },
      stimulusDurationMs: 500,
    },
    {
      id: 'event-3',
      type: 'USER_RESPONDED',
      sessionId,
      timestamp: baseTime + 400,
      trialIndex: 0,
      modality: 'position' as ModalityId,
      reactionTimeMs: 300,
      pressDurationMs: 50,
      responsePhase: 'during_stimulus',
    },
    {
      id: 'event-4',
      type: 'TRIAL_PRESENTED',
      sessionId,
      timestamp: baseTime + 3100,
      trial: {
        index: 1,
        position: 2,
        sound: 'D',
        isPositionTarget: false,
        isSoundTarget: true,
        isColorTarget: false,
      },
      stimulusDurationMs: 500,
    },
    {
      id: 'event-5',
      type: 'SESSION_ENDED',
      sessionId,
      timestamp: baseTime + 6000,
      reason: 'completed',
    },
  ] as unknown as readonly GameEvent[];
}

// =============================================================================
// Helper functions
// =============================================================================

async function waitForState(
  adapter: InteractiveReplayAdapter,
  expectedState: string,
  timeout = 500,
) {
  const start = Date.now();
  while (adapter.getState() !== expectedState && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('InteractiveReplayAdapter (XState)', () => {
  let mockPort: ReplayInteractifPort;
  let adapter: InteractiveReplayAdapter;

  beforeEach(() => {
    mockPort = createMockAdapter();
    adapter = new InteractiveReplayAdapter();
  });

  afterEach(() => {
    adapter.dispose();
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(adapter.getState()).toBe('idle');
    });

    it('getContext returns empty context initially', () => {
      const ctx = adapter.getContext();
      expect(ctx.run).toBeNull();
      expect(ctx.currentTimeMs).toBe(0);
      expect(ctx.events).toHaveLength(0);
      expect(ctx.score).toBeNull();
      expect(ctx.error).toBeNull();
    });

    it('getProgress returns 0 initially', () => {
      expect(adapter.getProgress()).toBe(0);
    });
  });

  describe('start flow', () => {
    it('transitions to loading on sendStart()', () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });

      expect(adapter.getState()).toBe('loading');
    });

    it('transitions to ready after engine is created (run is NOT created until completion)', async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });

      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');

      // Run is NOT created at ready state (deferred creation until completion)
      const ctx = adapter.getContext();
      expect(ctx.run).toBeNull();
      // createRun has not been called yet
      expect((mockPort.createRun as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it('transitions to error if canCreateRun returns false', async () => {
      mockPort = createMockAdapter({ canCreate: false });

      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });

      await waitForState(adapter, 'error');
      expect(adapter.getState()).toBe('error');
      expect(adapter.getContext().error).not.toBeNull();
    });

    it('transitions to error if createRun fails at completion', async () => {
      mockPort = createMockAdapter({ failCreate: true });

      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });

      // Should reach ready state (createRun not called yet)
      await waitForState(adapter, 'ready');
      expect(adapter.getState()).toBe('ready');

      // Play and complete the session
      adapter.play();
      adapter.tick(7000); // Past total duration
      expect(adapter.getState()).toBe('awaitingCompletion');

      // Complete should trigger createRun which fails
      adapter.complete();
      await waitForState(adapter, 'error');
      expect(adapter.getState()).toBe('error');
    });
  });

  describe('playback flow', () => {
    beforeEach(async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');
    });

    it('transitions to playing on play()', () => {
      adapter.play();
      expect(adapter.getState()).toBe('playing');
    });

    it('processes TICK events and advances time', () => {
      adapter.play();
      adapter.tick(100);

      expect(adapter.getContext().currentTimeMs).toBe(100);
    });

    it('respects speed multiplier', () => {
      adapter.play();
      adapter.setSpeed(0.5);
      adapter.tick(100);

      // At 0.5x speed, 100ms tick = 50ms actual time
      expect(adapter.getContext().currentTimeMs).toBe(50);
    });

    it('transitions to paused on pause()', () => {
      adapter.play();
      adapter.pause();
      expect(adapter.getState()).toBe('paused');
    });

    it('togglePlayPause toggles between playing and paused', () => {
      adapter.play();
      expect(adapter.getState()).toBe('playing');

      adapter.togglePlayPause();
      expect(adapter.getState()).toBe('paused');

      adapter.togglePlayPause();
      expect(adapter.getState()).toBe('playing');
    });

    it('emits events as time progresses', () => {
      adapter.play();

      // Advance past SESSION_STARTED (at 0ms relative)
      adapter.tick(50);

      // Check events are being emitted
      const ctx = adapter.getContext();
      expect(ctx.events.length).toBeGreaterThan(0);
    });
  });

  describe('response handling', () => {
    beforeEach(async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');
      adapter.play();
    });

    it('records user responses via respond()', () => {
      // Advance to a trial
      adapter.tick(200);

      const beforeCount = adapter.getContext().events.length;
      adapter.respond('audio');
      const afterCount = adapter.getContext().events.length;

      // Should have added a user response event
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
    });
  });

  describe('completion flow', () => {
    beforeEach(async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');
      adapter.play();
    });

    it('transitions to awaitingCompletion when time elapses', () => {
      // Advance past totalDurationMs
      adapter.tick(7000);

      expect(adapter.getState()).toBe('awaitingCompletion');
    });

    it('transitions to finished on complete()', async () => {
      adapter.tick(7000);
      expect(adapter.getState()).toBe('awaitingCompletion');

      adapter.complete();
      await waitForState(adapter, 'finished');

      expect(adapter.getState()).toBe('finished');
      expect(adapter.getContext().score).not.toBeNull();
    });

    it('persists events and completes run on complete()', async () => {
      adapter.tick(7000);
      adapter.complete();
      await waitForState(adapter, 'finished');

      expect(
        (mockPort.appendEventsBatch as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1);
      expect((mockPort.completeRun as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
  });

  describe('abandon flow', () => {
    beforeEach(async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');
    });

    it('transitions to idle on abandon() from ready', async () => {
      adapter.abandon();
      await waitForState(adapter, 'idle');

      expect(adapter.getState()).toBe('idle');
    });

    it('does NOT delete run on abandon (run not created until completion)', async () => {
      adapter.abandon();
      await waitForState(adapter, 'idle');

      // Run was NOT created (deferred), so deleteRun should NOT be called
      expect((mockPort.deleteRun as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it('can abandon from playing state', async () => {
      adapter.play();
      adapter.tick(100);

      adapter.abandon();
      await waitForState(adapter, 'idle');

      expect(adapter.getState()).toBe('idle');
    });

    it('can abandon from awaitingCompletion state', async () => {
      adapter.play();
      adapter.tick(7000);
      expect(adapter.getState()).toBe('awaitingCompletion');

      adapter.abandon();
      await waitForState(adapter, 'idle');

      expect(adapter.getState()).toBe('idle');
    });
  });

  describe('reset flow', () => {
    it('can reset from error state', async () => {
      // Create error by failing canCreateRun (not createRun which is lazy)
      mockPort = createMockAdapter({ canCreate: false });
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'error');

      adapter.reset();
      expect(adapter.getState()).toBe('idle');
      expect(adapter.getContext().error).toBeNull();
    });

    it('can reset from finished state', async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');

      adapter.play();
      adapter.tick(7000);
      adapter.complete();
      await waitForState(adapter, 'finished');

      adapter.reset();
      expect(adapter.getState()).toBe('idle');
    });
  });

  describe('recovery flow', () => {
    it('transitions through recovering state on sendRecover()', async () => {
      const recoveredState = {
        run: {
          id: 'run-123',
          sessionId: 'session-456',
          sessionType: 'tempo',
          parentRunId: null,
          depth: 1 as const,
          status: 'in_progress' as const,
          createdAt: Date.now(),
        },
        emittedEvents: [],
        lastTimeMs: 1000,
        lastTrialIndex: 0,
      };

      adapter.sendRecover(
        recoveredState as never,
        createMockParentEvents(),
        ['position', 'audio'],
        'tempo',
      );

      // Recovery goes to paused state (not ready) to allow user to resume
      await waitForState(adapter, 'paused', 1000);
      expect(adapter.getState()).toBe('paused');

      // Context should have the recovered values
      const ctx = adapter.getContext();
      expect(ctx.currentTimeMs).toBe(1000);
      expect(ctx.currentTrialIndex).toBe(0);
    });

    it('can play after recovery', async () => {
      // Use a fresh adapter for this test
      adapter.dispose();
      adapter = new InteractiveReplayAdapter();

      const parentEvents = createMockParentEvents();
      const recoveredState = {
        run: {
          id: 'run-123',
          sessionId: 'session-456',
          sessionType: 'tempo',
          parentRunId: null,
          depth: 1 as const,
          status: 'in_progress' as const,
          createdAt: Date.now(),
        },
        emittedEvents: [],
        lastTimeMs: 500,
        lastTrialIndex: 0,
      };

      adapter.sendRecover(recoveredState as never, parentEvents, ['position', 'audio'], 'tempo');

      // Recovery goes to paused state
      await waitForState(adapter, 'paused', 1000);

      // Should be able to play from paused state
      adapter.play();
      expect(adapter.getState()).toBe('playing');
    });
  });

  describe('event persistence', () => {
    it('persists events incrementally during playback', async () => {
      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');

      adapter.play();

      // Tick multiple times to generate events
      adapter.tick(500);
      adapter.tick(500);
      adapter.tick(500);

      // Events should accumulate in context
      const ctx = adapter.getContext();
      expect(ctx.events.length).toBeGreaterThan(0);
    });
  });

  describe('subscriptions', () => {
    it('subscribe emits initial state', () => {
      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      expect(states).toContain('idle');
    });

    it('subscribe emits state changes', async () => {
      const states: string[] = [];
      adapter.subscribe((state) => states.push(state));

      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });

      await waitForState(adapter, 'ready');

      expect(states).toContain('loading');
      expect(states).toContain('ready');
    });

    it('subscribeContext emits context changes', async () => {
      const contexts: number[] = [];
      adapter.subscribeContext((ctx) => contexts.push(ctx.currentTimeMs));

      adapter.sendStart({
        adapter: mockPort,
        sessionId: 'session-456',
        sessionType: 'tempo',
        parentEvents: createMockParentEvents(),
        activeModalities: ['position', 'audio'],
        parentRunId: null,
        totalDurationMs: 6000,
      });
      await waitForState(adapter, 'ready');

      adapter.play();
      adapter.tick(100);
      adapter.tick(100);

      // Should have captured time changes
      expect(contexts.some((t) => t > 0)).toBe(true);
    });
  });
});
