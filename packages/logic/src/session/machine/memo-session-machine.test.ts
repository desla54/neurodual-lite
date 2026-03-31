/**
 * Tests for MemoSessionMachine
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { createActor } from 'xstate';
import { memoSessionMachine } from './memo-session-machine';
import type { MemoSessionInput } from './memo-session-types';

mock.module('../../engine/memo-projector', () => ({
  MemoSessionProjector: {
    computeStatsUpToWindow: mock(() => ({ accuracy: 0.9 })),
    projectExtended: mock(() => ({ accuracy: 0.9, finalStats: {} })),
  },
}));

describe('MemoSessionMachine', () => {
  let mockInput: MemoSessionInput;
  let idCounter = 0;

  beforeEach(() => {
    idCounter = 0;
    // Basic valid spec for Memo
    const spec = {
      metadata: { id: 'dual-memo', displayName: 'Memo' },
      defaults: { nLevel: 2, trialsCount: 10, activeModalities: ['position', 'audio'] },
      timing: { stimulusDurationMs: 500, stimulusDurationSeconds: 0.5 },
      generation: { targetProbability: 0.2, lureProbability: 0.1 },
      extensions: {
        feedbackMode: 'none',
        feedbackDurationMs: 500,
        fillOrderMode: 'sequential',
        progressiveWindow: { enabled: false, initialDepth: 2 },
        scoringVersion: 1,
        windowDepth: 3,
        stimulusDurationSeconds: 0.5,
        targetProbability: 0.2,
        lureProbability: 0.1,
      },
      scoring: { strategy: 'balanced', passThreshold: 80 },
    };

    mockInput = {
      sessionId: 'session-123',
      userId: 'user-456',
      playMode: 'free',
      spec: spec as any,
      generator: {
        hasMore: mock(() => true),
        generateNext: mock(() => ({ index: 0, position: 1, sound: 'C' })),
        getTotalTrials: mock(() => 10),
        getGameParameters: mock(() => ({ stimulusDuration: 0.5 })),
        getLureProbability: mock(() => 0.1),
        getTargetProbability: mock(() => 0.2),
      } as any,
      audio: {
        init: mock(() => Promise.resolve()),
        schedule: mock((s, t, cb) => {
          if (cb) cb();
        }),
        scheduleCallback: mock((t, cb) => {
          setTimeout(cb, 10);
        }),
        stopAll: mock(() => {}),
        getCurrentTime: mock(() => 0),
      } as any,
      clock: {
        now: mock(() => 1000),
        dateNow: mock(() => Date.now()),
      } as any,
      random: {
        generateId: mock(() => `id-${idCounter++}`),
        random: mock(() => 0.5),
      } as any,
      plugins: {
        deviceContext: {
          getDeviceInfo: mock(() => ({
            platform: 'web',
            screenWidth: 1920,
            screenHeight: 1080,
            userAgent: 'test',
            touchCapable: false,
          })),
          getSessionContextInfo: mock(() => ({
            timeOfDay: 'afternoon',
            localHour: 14,
            dayOfWeek: 1,
            timezone: 'UTC',
          })),
        },
        audio: {
          shouldPlayStimulus: mock(() => true),
          getAudioSyncBufferMs: mock(() => 10),
        },
        fillOrder: {
          generate: mock(() => [0, 1]),
        },
        pick: {
          process: mock((params) => ({
            isAccepted: true,
            isCorrection: false,
            newPicks: new Map(params.currentPicks),
            newCorrectionCounts: new Map(params.correctionCounts),
            newFillOrderIndex: params.fillOrderIndex + 1,
          })),
        },
        windowEval: {
          evaluate: mock(() => ({ feedback: {} })),
        },
        snapshot: {
          build: mock(() => ({})),
        },
        algorithmState: {
          loadAndRestoreState: mock(() => Promise.resolve()),
          saveState: mock(() => Promise.resolve()),
        },
      } as any,
      commandBus: {
        handle: async () => {
          return;
        },
      },
    };
  });

  const waitFor = async (actor: any, state: string) => {
    let attempts = 0;
    while (!actor.getSnapshot().matches(state) && attempts < 100) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }
    return actor.getSnapshot().matches(state);
  };

  test('complete lifecycle: idle -> starting -> stimulus -> recall -> finished', async () => {
    const actor = createActor(memoSessionMachine, { input: mockInput });
    actor.start();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.send({ type: 'START' });

    expect(await waitFor(actor, 'stimulus')).toBe(true);
    // For lifecycle test, just ensure we can reach recall then stop
    expect(await waitFor(actor, 'recall')).toBe(true);

    actor.send({ type: 'STOP' });

    let attempts = 0;
    while (actor.getSnapshot().status !== 'done' && attempts < 50) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }

    expect(actor.getSnapshot().status).toBe('done');
  });

  test('should handle abandon', async () => {
    const actor = createActor(memoSessionMachine, { input: mockInput });
    actor.start();
    actor.send({ type: 'START' });
    await waitFor(actor, 'starting');

    actor.send({ type: 'STOP' });
    await new Promise((r) => setTimeout(r, 20));
    expect(actor.getSnapshot().status).toBe('done');
  });

  test('emits RECALL_SESSION_ENDED with deterministic playContext (journey)', async () => {
    const actor = createActor(memoSessionMachine, {
      input: {
        ...mockInput,
        playMode: 'journey',
        journeyStageId: 4,
        journeyId: 'journey-a',
      },
    });
    actor.start();
    actor.send({ type: 'START' });

    // Ensure session started and can be stopped reliably
    expect(await waitFor(actor, 'stimulus')).toBe(true);

    actor.send({ type: 'STOP' });

    let attempts = 0;
    while (actor.getSnapshot().status !== 'done' && attempts < 50) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }

    const { context } = actor.getSnapshot();
    const endedEvent = context.sessionEvents.find((e: any) => e.type === 'RECALL_SESSION_ENDED');
    expect(endedEvent).toBeDefined();
    expect((endedEvent as any).journeyStageId).toBe(4);
    expect((endedEvent as any).journeyId).toBe('journey-a');
    expect((endedEvent as any).playContext).toBe('journey');
  });

  test('should handle PICK events', async () => {
    const actor = createActor(memoSessionMachine, { input: mockInput });
    actor.start();
    actor.send({ type: 'START' });

    expect(await waitFor(actor, 'recall')).toBe(true);

    actor.send({
      type: 'PICK',
      slotIndex: 0,
      pick: { modality: 'position', value: 1 },
      inputMethod: 'touch',
    });
    expect(mockInput.plugins.pick.process).toHaveBeenCalled();
  });

  test('should handle init failure', async () => {
    (mockInput.audio.init as any).mockReturnValue(Promise.reject('Error'));
    const actor = createActor(memoSessionMachine, { input: mockInput });
    actor.start();
    actor.send({ type: 'START' });

    let attempts = 0;
    while (actor.getSnapshot().status !== 'done' && attempts < 50) {
      await new Promise((r) => setTimeout(r, 10));
      attempts++;
    }
    expect(actor.getSnapshot().status).toBe('done');
  });
});
