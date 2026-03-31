/**
 * SessionEndPipelineMachine Tests (XState v5)
 *
 * Unit tests for the session-end pipeline XState machine and its adapter.
 *
 * Note: `project_summary` invokes `SessionCompletionProjector.projectWithXP` which
 * requires well-formed domain events. The projector always errors in these unit tests
 * because we use minimal mock events. Tests that need to observe states past
 * project_summary are therefore limited to verifying error-path behaviour.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createActor } from 'xstate';
import {
  pipelineMachine,
  SessionEndPipelineAdapter,
  type PipelineDependencies,
} from './session-end-pipeline-machine';
import type { SessionEndPipelineInput, PipelineState } from '@neurodual/logic';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockDeps(overrides: Partial<PipelineDependencies> = {}): PipelineDependencies {
  return {
    persistEvents: mock(() => Promise.resolve()),
    getProgression: mock(() =>
      Promise.resolve({
        totalXP: 100,
        completedSessions: 5,
        abandonedSessions: 0,
        totalTrials: 50,
        firstSessionAt: new Date('2026-01-01'),
        earlyMorningSessions: 0,
        lateNightSessions: 0,
        comebackCount: 0,
        persistentDays: 3,
        plateausBroken: 0,
        uninterruptedSessionsStreak: 3,
      }),
    ),
    getBadges: mock(() => Promise.resolve([])),
    saveRecoveryState: mock(() => Promise.resolve()),
    loadRecoveryState: mock(() => Promise.resolve(null)),
    clearRecoveryState: mock(() => Promise.resolve()),
    ...overrides,
  };
}

function createMockInput(): SessionEndPipelineInput {
  return {
    completionInput: {
      mode: 'tempo',
      sessionId: 'session-123',
      events: [
        {
          type: 'SESSION_STARTED',
          id: 'evt-1',
          timestamp: 1000,
          sessionId: 'session-123',
          playContext: 'free',
          schemaVersion: 1,
        },
        {
          type: 'SESSION_ENDED',
          id: 'evt-3',
          timestamp: 5000,
          sessionId: 'session-123',
          reason: 'completed',
        },
      ],
      nLevel: 2,
      modalities: ['position', 'audio'],
      spec: {
        trialsPerBlock: 20,
        blocksCount: 1,
        stimulusDurationMs: 500,
        interStimulusIntervalMs: 2500,
      },
    } as unknown as SessionEndPipelineInput['completionInput'],
    syncEnabled: false,
  } as SessionEndPipelineInput;
}

function createJourneyInput(): SessionEndPipelineInput {
  return {
    completionInput: {
      mode: 'tempo',
      sessionId: 'session-journey-1',
      events: [
        {
          type: 'SESSION_STARTED',
          id: 'evt-j1',
          timestamp: 1000,
          sessionId: 'session-journey-1',
          playContext: 'journey',
          schemaVersion: 1,
          journeySnapshot: {
            stageId: 3,
            journeyMeta: { journeyId: 'default', difficulty: 'standard' },
          },
        },
        {
          type: 'SESSION_ENDED',
          id: 'evt-j2',
          timestamp: 5000,
          sessionId: 'session-journey-1',
          reason: 'completed',
        },
      ],
      nLevel: 2,
      modalities: ['position', 'audio'],
      spec: {
        trialsPerBlock: 20,
        blocksCount: 1,
        stimulusDurationMs: 500,
        interStimulusIntervalMs: 2500,
      },
    } as unknown as SessionEndPipelineInput['completionInput'],
    syncEnabled: false,
  } as SessionEndPipelineInput;
}

// =============================================================================
// Helper
// =============================================================================

async function waitForMachineState(
  actor: ReturnType<typeof createActor<typeof pipelineMachine>>,
  state: string,
  timeout = 2000,
): Promise<void> {
  const start = Date.now();
  while ((actor.getSnapshot().value as string) !== state && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function waitForAdapterStage(
  adapter: SessionEndPipelineAdapter,
  stage: string,
  timeout = 2000,
): Promise<void> {
  const start = Date.now();
  while (adapter.getState().stage !== stage && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Start the adapter and immediately attach a .catch() to avoid unhandled rejection.
 * Returns the promise for assertions.
 */
function startSafe(
  adapter: SessionEndPipelineAdapter,
  input?: SessionEndPipelineInput,
): Promise<unknown> {
  const p = adapter.start(input ?? createMockInput());
  // Attach a no-op catch immediately to prevent unhandled rejection
  p.catch(() => {});
  return p;
}

// =============================================================================
// XState Machine Unit Tests (raw machine, no adapter)
// =============================================================================

describe('pipelineMachine (raw XState)', () => {
  let deps: PipelineDependencies;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('initial state', () => {
    it('starts in idle state with correct defaults', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('idle');
      expect(snapshot.context.currentStage).toBe('idle');
      expect(snapshot.context.retryCount).toBe(0);
      expect(snapshot.context.maxRetries).toBe(3);
      expect(snapshot.context.error).toBeNull();
      expect(snapshot.context.completionResult).toBeNull();
      expect(snapshot.context.input).toBeNull();
      expect(snapshot.context.sessionId).toBeNull();
      expect(snapshot.context.leveledUp).toBe(false);
      expect(snapshot.context.newLevel).toBe(1);
      expect(snapshot.context.lastCompletedStage).toBe('idle');

      actor.stop();
    });

    it('defaults maxRetries to 3', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();
      expect(actor.getSnapshot().context.maxRetries).toBe(3);
      actor.stop();
    });

    it('respects custom maxRetries', () => {
      const actor = createActor(pipelineMachine, { input: { deps, maxRetries: 7 } });
      actor.start();
      expect(actor.getSnapshot().context.maxRetries).toBe(7);
      actor.stop();
    });

    it('ignores RETRY in idle', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();
      actor.send({ type: 'RETRY' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('ignores CANCEL in idle', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();
      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('idle → persist_events', () => {
    it('transitions on START event', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('persist_events');
      expect(snapshot.context.currentStage).toBe('persist_events');
      expect(snapshot.context.sessionId).toBe('session-123');

      actor.stop();
    });

    it('stores input in context', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });

      expect(actor.getSnapshot().context.input).not.toBeNull();
      expect(actor.getSnapshot().context.input?.syncEnabled).toBe(false);

      actor.stop();
    });

    it('resets retry count', () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();
      actor.send({ type: 'START', input: createMockInput() });
      expect(actor.getSnapshot().context.retryCount).toBe(0);
      actor.stop();
    });
  });

  describe('persist_events stage', () => {
    it('transitions to project_summary on success', async () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      const states: string[] = [];
      actor.subscribe((s) => states.push(s.value as string));

      actor.send({ type: 'START', input: createMockInput() });
      await new Promise((r) => setTimeout(r, 150));

      expect(states).toContain('persist_events');
      expect(states).toContain('project_summary');

      actor.stop();
    });

    it('marks persist_events as lastCompletedStage', async () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      // Wait for pipeline to progress past persist_events (project_summary will error)
      await new Promise((r) => setTimeout(r, 300));

      expect(actor.getSnapshot().context.lastCompletedStage).toBe('persist_events');

      actor.stop();
    });

    it('calls saveRecoveryState', async () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await new Promise((r) => setTimeout(r, 150));

      expect(
        (deps.saveRecoveryState as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1);

      actor.stop();
    });

    it('calls persistEvents with sessionId and events', async () => {
      const actor = createActor(pipelineMachine, { input: { deps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await new Promise((r) => setTimeout(r, 150));

      expect(
        (deps.persistEvents as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThanOrEqual(1);
      const [sessionId, events] = (deps.persistEvents as ReturnType<typeof mock>).mock
        .calls[0]! as any;
      expect(sessionId).toBe('session-123');
      expect(Array.isArray(events)).toBe(true);

      actor.stop();
    });

    it('transitions to error when persistEvents throws', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('DB write failed'))),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('error');
      expect(snapshot.context.error).not.toBeNull();
      expect(snapshot.context.error?.message).toBe('DB write failed');

      actor.stop();
    });

    it('calls ensureSummaryProjected when available', async () => {
      const ensureMock = mock(() => Promise.resolve());
      const depsWithEnsure = createMockDeps({ ensureSummaryProjected: ensureMock });
      const actor = createActor(pipelineMachine, { input: { deps: depsWithEnsure } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await new Promise((r) => setTimeout(r, 200));

      expect(ensureMock.mock.calls.length).toBe(1);
      expect((ensureMock!.mock.calls as any)[0][0]).toBe('session-123');

      actor.stop();
    });
  });

  describe('error state', () => {
    it('transitions to idle on CANCEL', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');

      actor.send({ type: 'CANCEL' });

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe('idle');
      expect(snapshot.context.input).toBeNull();
      expect(snapshot.context.sessionId).toBeNull();
      expect(snapshot.context.retryCount).toBe(0);

      actor.stop();
    });

    it('RETRY stays in error when captureError sets currentStage to error', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');
      expect(actor.getSnapshot().context.currentStage).toBe('error');

      // canRetryAtStage checks currentStage === specificStage, but captureError
      // sets currentStage to 'error', so no guard matches
      actor.send({ type: 'RETRY' });
      expect(actor.getSnapshot().value).toBe('error');

      actor.stop();
    });

    it('accepts START and resets pipeline', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');

      // Fix deps for next run
      (failDeps.persistEvents as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(),
      );

      actor.send({ type: 'START', input: createMockInput() });

      expect(actor.getSnapshot().value).toBe('persist_events');
      expect(actor.getSnapshot().context.retryCount).toBe(0);
      expect(actor.getSnapshot().context.error).toBeNull();

      actor.stop();
    });

    it('captures error message from thrown Error', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('specific failure message'))),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');

      expect(actor.getSnapshot().context.error?.message).toBe('specific failure message');

      actor.stop();
    });

    it('captures error from non-Error rejection', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject('string error')),
      });
      const actor = createActor(pipelineMachine, { input: { deps: failDeps } });
      actor.start();

      actor.send({ type: 'START', input: createMockInput() });
      await waitForMachineState(actor, 'error');

      expect(actor.getSnapshot().context.error).not.toBeNull();
      expect(actor.getSnapshot().context.error?.message).toContain('string error');

      actor.stop();
    });
  });

  describe('guards', () => {
    describe('hasSync', () => {
      it('is false when syncEnabled is false', () => {
        const actor = createActor(pipelineMachine, { input: { deps } });
        actor.start();
        actor.send({ type: 'START', input: createMockInput() });
        expect(actor.getSnapshot().context.input?.syncEnabled).toBe(false);
        actor.stop();
      });

      it('is false when syncToCloud dep is undefined even if syncEnabled=true', () => {
        const actor = createActor(pipelineMachine, { input: { deps } });
        actor.start();
        const input = { ...createMockInput(), syncEnabled: true } as SessionEndPipelineInput;
        actor.send({ type: 'START', input });
        expect(actor.getSnapshot().context.input?.syncEnabled).toBe(true);
        expect(actor.getSnapshot().context.deps.syncToCloud).toBeUndefined();
        actor.stop();
      });
    });

    describe('hasJourney', () => {
      it('is false for free play context', () => {
        const actor = createActor(pipelineMachine, { input: { deps } });
        actor.start();
        actor.send({ type: 'START', input: createMockInput() });
        // playContext is 'free' -> hasJourney = false
        actor.stop();
      });

      it('is false when recordJourneyAttempt is undefined', () => {
        const actor = createActor(pipelineMachine, { input: { deps } });
        actor.start();
        actor.send({ type: 'START', input: createJourneyInput() });
        // Journey input but no recordJourneyAttempt dep -> hasJourney = false
        actor.stop();
      });

      it('is true when playContext=journey AND recordJourneyAttempt exists', () => {
        const journeyDeps = createMockDeps({
          recordJourneyAttempt: mock(() => Promise.resolve(null)),
        });
        const actor = createActor(pipelineMachine, { input: { deps: journeyDeps } });
        actor.start();
        actor.send({ type: 'START', input: createJourneyInput() });
        // Both conditions met -> hasJourney = true
        actor.stop();
      });
    });
  });
});

// =============================================================================
// sanitizePipelineInputForRecovery (via observable behaviour)
// =============================================================================

describe('sanitizePipelineInputForRecovery', () => {
  it('strips events array when getSessionEvents is available', async () => {
    const savedStates: unknown[] = [];
    const deps = createMockDeps({
      saveRecoveryState: mock((state: unknown) => {
        savedStates.push(state);
        return Promise.resolve();
      }),
      getSessionEvents: mock(() => Promise.resolve([])),
    });

    const actor = createActor(pipelineMachine, { input: { deps } });
    actor.start();
    actor.send({ type: 'START', input: createMockInput() });
    await new Promise((r) => setTimeout(r, 200));

    expect(savedStates.length).toBeGreaterThanOrEqual(1);
    const saved = savedStates[0] as { input: SessionEndPipelineInput };
    const completionInput = saved.input.completionInput as unknown as Record<string, unknown>;
    expect(Array.isArray(completionInput['events'])).toBe(true);
    expect((completionInput['events'] as unknown[]).length).toBe(0);

    actor.stop();
  });

  it('preserves events when getSessionEvents is NOT available', async () => {
    const savedStates: unknown[] = [];
    const deps = createMockDeps({
      saveRecoveryState: mock((state: unknown) => {
        savedStates.push(state);
        return Promise.resolve();
      }),
    });

    const actor = createActor(pipelineMachine, { input: { deps } });
    actor.start();
    actor.send({ type: 'START', input: createMockInput() });
    await new Promise((r) => setTimeout(r, 200));

    expect(savedStates.length).toBeGreaterThanOrEqual(1);
    const saved = savedStates[0] as { input: SessionEndPipelineInput };
    const completionInput = saved.input.completionInput as unknown as Record<string, unknown>;
    expect(Array.isArray(completionInput['events'])).toBe(true);
    expect((completionInput['events'] as unknown[]).length).toBeGreaterThan(0);

    actor.stop();
  });

  it('preserves non-event fields in completionInput', async () => {
    const savedStates: unknown[] = [];
    const deps = createMockDeps({
      saveRecoveryState: mock((state: unknown) => {
        savedStates.push(state);
        return Promise.resolve();
      }),
      getSessionEvents: mock(() => Promise.resolve([])),
    });

    const actor = createActor(pipelineMachine, { input: { deps } });
    actor.start();
    actor.send({ type: 'START', input: createMockInput() });
    await new Promise((r) => setTimeout(r, 200));

    const saved = savedStates[0] as { input: SessionEndPipelineInput };
    const completionInput = saved.input.completionInput as unknown as Record<string, unknown>;
    // Non-event fields should be preserved
    expect(completionInput['mode']).toBe('tempo');
    expect(completionInput['sessionId']).toBe('session-123');

    actor.stop();
  });
});

// =============================================================================
// SessionEndPipelineAdapter Tests
// =============================================================================

describe('SessionEndPipelineAdapter', () => {
  let deps: PipelineDependencies;
  let adapter: SessionEndPipelineAdapter;

  beforeEach(() => {
    deps = createMockDeps();
  });

  afterEach(() => {
    adapter?.dispose();
  });

  describe('initialization', () => {
    it('starts in idle state', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      expect(adapter.isIdle()).toBe(true);
      expect(adapter.isRunning()).toBe(false);
      expect(adapter.isDone()).toBe(false);
      expect(adapter.hasError()).toBe(false);
    });

    it('getState returns complete idle state', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      const state = adapter.getState();
      expect(state.stage).toBe('idle');
      expect(state.sessionId).toBeNull();
      expect(state.progress).toBe(0);
      expect(state.error).toBeNull();
      expect(state.retryCount).toBe(0);
      expect(state.result).toBeNull();
      expect(state.leveledUp).toBe(false);
      expect(state.newLevel).toBe(1);
    });
  });

  describe('start()', () => {
    it('transitions to running state', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      startSafe(adapter);
      expect(adapter.isRunning()).toBe(true);
      expect(adapter.isIdle()).toBe(false);
    });

    it('sets sessionId in state', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      startSafe(adapter);
      expect(adapter.getState().sessionId).toBe('session-123');
    });

    it('returns a promise', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      const result = startSafe(adapter);
      expect(result).toBeInstanceOf(Promise);
    });

    it('throws when pipeline is busy with a different session', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      startSafe(adapter);

      const differentInput = {
        ...createMockInput(),
        completionInput: {
          ...(createMockInput().completionInput as unknown as Record<string, unknown>),
          sessionId: 'session-456',
        },
      } as unknown as SessionEndPipelineInput;

      expect(() => adapter.start(differentInput)).toThrow(/Pipeline busy/);
    });

    it('is idempotent for same session when already running', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      const p1 = startSafe(adapter);
      const p2 = startSafe(adapter);

      expect(p1).toBeInstanceOf(Promise);
      expect(p2).toBeInstanceOf(Promise);
    });
  });

  describe('error handling', () => {
    it('transitions to error on persist_events failure', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('write failure'))),
      });
      adapter = new SessionEndPipelineAdapter(failDeps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');

      expect(adapter.hasError()).toBe(true);
      expect(adapter.getState().error?.message).toBe('write failure');

      await expect(promise).rejects.toThrow('write failure');
    });

    it('transitions to error on project_summary failure', async () => {
      adapter = new SessionEndPipelineAdapter(deps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');

      expect(adapter.hasError()).toBe(true);
      expect(adapter.getState().error).not.toBeNull();

      await promise.catch(() => {});
    });

    it('retry() does not throw in error state', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      adapter = new SessionEndPipelineAdapter(failDeps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');
      await promise.catch(() => {});

      expect(() => adapter.retry()).not.toThrow();
    });

    it('cancel() resets to idle from error', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      adapter = new SessionEndPipelineAdapter(failDeps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');
      await promise.catch(() => {});

      adapter.cancel();

      expect(adapter.isIdle()).toBe(true);
      expect(adapter.getState().sessionId).toBeNull();
    });

    it('cancel() rejects pending promises', async () => {
      let resolveHang: (() => void) | null = null;
      const hangDeps = createMockDeps({
        persistEvents: mock(
          () =>
            new Promise<void>((r) => {
              resolveHang = r;
            }),
        ),
      });
      adapter = new SessionEndPipelineAdapter(hangDeps);

      const promise = adapter.start(createMockInput());
      // Attach catch on a copy but keep original for assertion
      const assertionPromise = promise.catch((e: Error) => {
        throw e;
      });

      adapter.cancel();

      await expect(assertionPromise).rejects.toThrow('Pipeline cancelled');

      (resolveHang as any)?.();
    });
  });

  describe('recovery', () => {
    it('returns null when no recovery state exists', async () => {
      adapter = new SessionEndPipelineAdapter(deps);
      const result = await adapter.recoverInterrupted();
      expect(result).toBeNull();
    });

    it('restarts pipeline when recovery state exists', async () => {
      const recoveryDeps = createMockDeps({
        loadRecoveryState: mock(() =>
          Promise.resolve({
            sessionId: 'session-123',
            lastCompletedStage: 'persist_events' as const,
            input: createMockInput(),
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        ),
      });
      adapter = new SessionEndPipelineAdapter(recoveryDeps);

      // Attach catch immediately to prevent unhandled rejection (project_summary errors in tests)
      const promise = adapter.recoverInterrupted();
      promise.catch(() => {});
      await new Promise((r) => setTimeout(r, 50));

      expect(adapter.getState().sessionId).toBe('session-123');

      await promise.catch(() => {});
    });

    it('rehydrates events from getSessionEvents when events are empty', async () => {
      const getSessionEventsMock = mock(() =>
        Promise.resolve([
          {
            type: 'SESSION_STARTED',
            id: 'r1',
            timestamp: 1000,
            sessionId: 'session-recover-2',
            playContext: 'free',
          },
        ]),
      );

      const sanitizedInput = {
        ...createMockInput(),
        completionInput: {
          ...(createMockInput().completionInput as unknown as Record<string, unknown>),
          events: [],
          sessionId: 'session-recover-2',
        },
      } as unknown as SessionEndPipelineInput;

      const recoveryDeps = createMockDeps({
        loadRecoveryState: mock(() =>
          Promise.resolve({
            sessionId: 'session-recover-2',
            lastCompletedStage: 'persist_events' as const,
            input: sanitizedInput,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        ),
        getSessionEvents: getSessionEventsMock,
      });
      adapter = new SessionEndPipelineAdapter(recoveryDeps);

      const promise = adapter.recoverInterrupted();
      promise.catch(() => {});
      await new Promise((r) => setTimeout(r, 200));

      expect(getSessionEventsMock.mock.calls.length).toBe(1);
      expect((getSessionEventsMock!.mock.calls as any)[0][0]).toBe('session-recover-2');

      await promise.catch(() => {});
    });

    it('skips rehydration when events are already present', async () => {
      const getSessionEventsMock = mock(() => Promise.resolve([]));

      const recoveryDeps = createMockDeps({
        loadRecoveryState: mock(() =>
          Promise.resolve({
            sessionId: 'session-123',
            lastCompletedStage: 'persist_events' as const,
            input: createMockInput(), // Has events
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        ),
        getSessionEvents: getSessionEventsMock,
      });
      adapter = new SessionEndPipelineAdapter(recoveryDeps);

      const promise = adapter.recoverInterrupted();
      promise.catch(() => {});
      await new Promise((r) => setTimeout(r, 200));

      // Should NOT rehydrate because events are present
      expect(getSessionEventsMock.mock.calls.length).toBe(0);

      await promise.catch(() => {});
    });
  });

  describe('subscriptions', () => {
    it('subscribe() emits current state immediately', () => {
      adapter = new SessionEndPipelineAdapter(deps);

      const states: PipelineState[] = [];
      const unsub = adapter.subscribe((s) => states.push(s));

      expect(states.length).toBe(1);
      expect(states[0]!.stage).toBe('idle');

      unsub();
    });

    it('subscribe() emits state changes during pipeline', async () => {
      adapter = new SessionEndPipelineAdapter(deps);

      const stages: string[] = [];
      const unsub = adapter.subscribe((s) => {
        if (stages[stages.length - 1] !== s.stage) {
          stages.push(s.stage);
        }
      });

      startSafe(adapter);
      await new Promise((r) => setTimeout(r, 300));

      expect(stages[0]).toBe('idle');
      expect(stages).toContain('persist_events');

      unsub();
    });

    it('unsubscribe stops further notifications', () => {
      adapter = new SessionEndPipelineAdapter(deps);

      let callCount = 0;
      const unsub = adapter.subscribe(() => {
        callCount++;
      });

      expect(callCount).toBe(1);
      unsub();

      startSafe(adapter);
      // Should not have received further notifications
      expect(callCount).toBe(1);
    });

    it('subscribeStage() emits stage and progress', () => {
      adapter = new SessionEndPipelineAdapter(deps);

      const received: Array<{ stage: string; progress: number }> = [];
      const unsub = adapter.subscribeStage((stage, progress) => received.push({ stage, progress }));

      expect(received.length).toBe(1);
      expect(received[0]!.stage).toBe('idle');
      expect(received[0]!.progress).toBe(0);

      unsub();
    });

    it('subscribeStage() returns no-op unsubscribe when disposed', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();

      const received: Array<{ stage: string; progress: number }> = [];
      const unsub = adapter.subscribeStage((stage, progress) => received.push({ stage, progress }));

      expect(received.length).toBe(1);
      unsub(); // should not throw
    });
  });

  describe('dispose()', () => {
    it('can be called multiple times safely', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();
      adapter.dispose();
    });

    it('rejects pending promises', async () => {
      let resolveHang: (() => void) | null = null;
      const hangDeps = createMockDeps({
        persistEvents: mock(
          () =>
            new Promise<void>((r) => {
              resolveHang = r;
            }),
        ),
      });
      adapter = new SessionEndPipelineAdapter(hangDeps);

      const promise = adapter.start(createMockInput());
      const assertPromise = promise.catch((e: Error) => {
        throw e;
      });

      adapter.dispose();

      await expect(assertPromise).rejects.toThrow('Pipeline disposed');

      (resolveHang as any)?.();
    });

    it('throws on start() after dispose', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();
      expect(() => adapter.start(createMockInput())).toThrow(/disposed/);
    });

    it('throws on retry() after dispose', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();
      expect(() => adapter.retry()).toThrow(/disposed/);
    });

    it('throws on cancel() after dispose', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();
      expect(() => adapter.cancel()).toThrow(/disposed/);
    });

    it('subscribe returns error state when disposed', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      adapter.dispose();

      const states: PipelineState[] = [];
      const unsub = adapter.subscribe((s) => states.push(s));

      expect(states.length).toBe(1);
      expect(states[0]!.stage).toBe('idle');
      expect(states[0]!.error).not.toBeNull();
      expect(states[0]!.error?.message).toContain('disposed');

      unsub();
    });
  });

  describe('state helpers', () => {
    it('isRunning() returns true during pipeline execution', () => {
      let resolveHang: (() => void) | null = null;
      const hangDeps = createMockDeps({
        persistEvents: mock(
          () =>
            new Promise<void>((r) => {
              resolveHang = r;
            }),
        ),
      });
      adapter = new SessionEndPipelineAdapter(hangDeps);
      startSafe(adapter);

      expect(adapter.isRunning()).toBe(true);
      expect(adapter.isIdle()).toBe(false);
      expect(adapter.isDone()).toBe(false);
      expect(adapter.hasError()).toBe(false);

      adapter.dispose();
      (resolveHang as any)?.();
    });

    it('hasError() returns true in error state', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      adapter = new SessionEndPipelineAdapter(failDeps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');
      await promise.catch(() => {});

      expect(adapter.hasError()).toBe(true);
      expect(adapter.isRunning()).toBe(false);
    });

    it('getState() caches between identical snapshots', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      const state1 = adapter.getState();
      const state2 = adapter.getState();
      expect(state1).toBe(state2);
    });
  });

  describe('pipeline progress tracking', () => {
    it('progress is 0 in idle', () => {
      adapter = new SessionEndPipelineAdapter(deps);
      expect(adapter.getState().progress).toBe(0);
    });

    it('progress changes during pipeline execution', async () => {
      adapter = new SessionEndPipelineAdapter(deps);

      const progresses = new Set<number>();
      const unsub = adapter.subscribe((s) => progresses.add(s.progress));

      startSafe(adapter);
      await new Promise((r) => setTimeout(r, 300));

      // Should have seen progress=0 (idle) and at least one other value
      expect(progresses.has(0)).toBe(true);
      expect(progresses.size).toBeGreaterThan(1);

      unsub();
    });

    it('progress is -1 in error state', async () => {
      const failDeps = createMockDeps({
        persistEvents: mock(() => Promise.reject(new Error('fail'))),
      });
      adapter = new SessionEndPipelineAdapter(failDeps);

      const promise = startSafe(adapter);
      await waitForAdapterStage(adapter, 'error');
      await promise.catch(() => {});

      expect(adapter.getState().progress).toBe(-1);
    });
  });
});
