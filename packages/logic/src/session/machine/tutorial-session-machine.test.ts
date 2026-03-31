/**
 * TutorialSessionMachine Tests (XState v5)
 *
 * Unit tests for the XState tutorial session machine.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createActor } from 'xstate';
import { tutorialSessionMachine } from './tutorial-session-machine';
import type { TutorialSessionInput } from './tutorial-session-types';
import type { TutorialSpec } from '../../specs/types';

// =============================================================================
// Mock Setup
// =============================================================================

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 250;
  const intervalMs = options.intervalMs ?? 1;
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function createMockAudio() {
  return {
    init: mock(() => Promise.resolve()),
    play: mock(() => {}),
    stopAll: mock(() => {}),
    schedule: mock(() => {}),
    scheduleCallback: mock(() => 1),
    cancelCallback: mock(() => {}),
    isReady: () => true,
    getVolumeLevel: () => 0.8,
  };
}

function createClassicTutorialSpec(): TutorialSpec {
  return {
    id: 'test-classic',
    nLevel: 2,
    steps: [
      // Step 0: DEMO step (auto-advance)
      {
        id: 'step-0',
        trial: { position: 0, sound: 'C' },
        intent: 'DEMO',
        exitCondition: 'AUTO',
        annotationKey: 'tutorial.step0',
      },
      // Step 1: DEMO step
      {
        id: 'step-1',
        trial: { position: 3, sound: 'H' },
        intent: 'DEMO',
        exitCondition: 'AUTO',
        annotationKey: 'tutorial.step1',
      },
      // Step 2: ACTION step with position match (step >= nLevel)
      {
        id: 'step-2',
        trial: { position: 0, sound: 'K' },
        intent: 'ACTION',
        exitCondition: 'RESPONSE',
        annotationKey: 'tutorial.step2',
        expectedMatch: { position: true, audio: false },
      },
      // Step 3: ACTION step with audio match
      {
        id: 'step-3',
        trial: { position: 5, sound: 'H' },
        intent: 'ACTION',
        exitCondition: 'RESPONSE',
        annotationKey: 'tutorial.step3',
        expectedMatch: { position: false, audio: true },
      },
    ],
    associatedModeId: 'dual-classic',
    titleKey: 'tutorial.test.title',
    descriptionKey: 'tutorial.test.desc',
    iconName: 'Brain',
  };
}

function createDualPickTutorialSpec(): TutorialSpec {
  return {
    id: 'test-dualpick',
    nLevel: 0, // nLevel=0 so step 0 goes to comparing
    controlLayout: 'dual-pick',
    steps: [
      {
        id: 'pick-0',
        trial: { position: 1, sound: 'C' },
        intent: 'ACTION',
        exitCondition: 'RESPONSE',
        annotationKey: 'tutorial.pick0',
        expectedClassification: { position: 'HAUT', sound: 'VOYELLE' },
      },
    ],
    associatedModeId: 'dual-pick',
    titleKey: 'tutorial.pick.title',
    descriptionKey: 'tutorial.pick.desc',
    iconName: 'Tag',
  };
}

function createTestInput(spec?: TutorialSpec): TutorialSessionInput {
  return {
    spec: spec ?? createClassicTutorialSpec(),
    audio: createMockAudio() as unknown as TutorialSessionInput['audio'],
    onComplete: mock(() => {}),
    onExit: mock(() => {}),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('tutorialSessionMachine', () => {
  describe('initial state', () => {
    it('starts in waiting state', () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      expect(actor.getSnapshot().value).toBe('waiting');

      actor.stop();
    });

    it('initializes context correctly', () => {
      const input = createTestInput();
      const actor = createActor(tutorialSessionMachine, { input });
      actor.start();

      const ctx = actor.getSnapshot().context;
      expect(ctx.stepIndex).toBe(-1);
      expect(ctx.currentStimulus).toBeNull();
      expect(ctx.userResponse).toEqual({});
      expect(ctx.awaitingResponse).toBe(false);
      expect(ctx.feedbackActive).toBe(false);

      actor.stop();
    });
  });

  describe('START event', () => {
    it('transitions waiting → starting on START', () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });

      expect(actor.getSnapshot().value).toBe('starting');

      actor.stop();
    });

    it('initializes audio and advances to stimulus', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });

      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      expect(actor.getSnapshot().value).toBe('stimulus');
      expect(actor.getSnapshot().context.stepIndex).toBe(0);
      expect(actor.getSnapshot().context.currentStimulus).not.toBeNull();

      actor.stop();
    });
  });

  describe('STOP event', () => {
    it('transitions to finished on STOP from waiting', () => {
      const input = createTestInput();
      const actor = createActor(tutorialSessionMachine, { input });
      actor.start();

      actor.send({ type: 'STOP' });

      expect(actor.getSnapshot().value).toBe('finished');
      expect(input.onExit).toHaveBeenCalled();

      actor.stop();
    });

    it('transitions to finished on STOP from stimulus', async () => {
      const input = createTestInput();
      const actor = createActor(tutorialSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      actor.send({ type: 'STOP' });

      expect(actor.getSnapshot().value).toBe('finished');

      actor.stop();
    });
  });

  describe('stimulus phase', () => {
    it('advances to traveling on STIMULUS_SHOWN', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      expect(actor.getSnapshot().value).toBe('stimulus');

      actor.send({ type: 'STIMULUS_SHOWN' });

      expect(actor.getSnapshot().value).toBe('traveling');
      // Stimulus should be cleared when entering traveling
      expect(actor.getSnapshot().context.currentStimulus).toBeNull();

      actor.stop();
    });
  });

  describe('traveling phase', () => {
    it('goes to reorganizing when canCompare is false (step < nLevel)', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      // Step 0, nLevel = 2, so canCompare = false
      expect(actor.getSnapshot().context.stepIndex).toBe(0);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });

      expect(actor.getSnapshot().value).toBe('reorganizing');

      actor.stop();
    });
  });

  describe('comparing phase', () => {
    it('enters comparing when canCompare is true (step >= nLevel)', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      // Advance through first two steps
      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      // Step 0
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });

      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 1);

      // Step 1
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });

      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 2);

      // Step 2 (stepIndex = 2, nLevel = 2, so canCompare = true)
      expect(actor.getSnapshot().context.stepIndex).toBe(2);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });

      expect(actor.getSnapshot().value).toBe('comparing');

      actor.stop();
    });
  });

  describe('response phase', () => {
    it('enters response phase when needsUserResponse is true', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      // Advance to step 2 which has expectedMatch
      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      // Step 0
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 1);

      // Step 1
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 2);

      // Step 2
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'COMPARE_COMPLETE' });

      expect(actor.getSnapshot().value).toBe('response');
      expect(actor.getSnapshot().context.awaitingResponse).toBe(true);

      actor.stop();
    });

    it('processes correct response and advances', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      // Advance to step 2
      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 1);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 2);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'COMPARE_COMPLETE' });

      // Correct response: position = true
      actor.send({ type: 'RESPOND', channel: 'position' });

      expect(actor.getSnapshot().value).toBe('feedbackDelay');
      expect(actor.getSnapshot().context.feedbackActive).toBe(true);

      actor.stop();
    });

    it('stays in response on incorrect response', async () => {
      const actor = createActor(tutorialSessionMachine, { input: createTestInput() });
      actor.start();

      // Advance to step 2
      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 1);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'REORG_COMPLETE' });
      await waitForCondition(() => actor.getSnapshot().context.stepIndex === 2);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'COMPARE_COMPLETE' });

      // Wrong response: audio instead of position
      actor.send({ type: 'RESPOND', channel: 'audio' });

      // Should stay in response
      expect(actor.getSnapshot().value).toBe('response');
      expect(actor.getSnapshot().context.userResponse.match).toEqual({
        position: false,
        audio: true,
      });

      actor.stop();
    });
  });

  describe('dual-pick mode', () => {
    it('handles classification responses correctly', async () => {
      const spec = createDualPickTutorialSpec();
      const actor = createActor(tutorialSessionMachine, { input: createTestInput(spec) });
      actor.start();

      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      // Step 0 in dual-pick with nLevel = 1
      expect(actor.getSnapshot().context.stepIndex).toBe(0);

      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      actor.send({ type: 'COMPARE_COMPLETE' });

      expect(actor.getSnapshot().value).toBe('response');

      // First part of classification
      actor.send({ type: 'RESPOND', channel: 'position', value: 'HAUT' });

      // Still in response (need both)
      expect(actor.getSnapshot().value).toBe('response');
      expect(actor.getSnapshot().context.userResponse.classification).toEqual({
        position: 'HAUT',
      });

      // Second part - use 'sound' since expectedClassification uses 'sound'
      actor.send({ type: 'RESPOND', channel: 'sound', value: 'VOYELLE' });

      // Now should advance
      expect(actor.getSnapshot().value).toBe('feedbackDelay');

      actor.stop();
    });
  });

  describe('completion', () => {
    it('calls onComplete when tutorial finishes', async () => {
      // Create a minimal 1-step spec with high nLevel (no comparing)
      const spec: TutorialSpec = {
        id: 'minimal',
        nLevel: 5, // Higher than step count, so canCompare is always false
        steps: [
          {
            id: 'only-step',
            trial: { position: 0, sound: 'C' },
            intent: 'DEMO',
            exitCondition: 'AUTO',
            annotationKey: 'test',
          },
        ],
        associatedModeId: null,
        titleKey: 'test',
        descriptionKey: 'test',
        iconName: 'Brain',
      };

      const input = createTestInput(spec);
      const actor = createActor(tutorialSessionMachine, { input });
      actor.start();

      actor.send({ type: 'START' });
      await waitForCondition(() => actor.getSnapshot().value === 'stimulus');

      // Step 0 with nLevel=5 means canCompare=false, goes directly to reorganizing
      actor.send({ type: 'STIMULUS_SHOWN' });
      actor.send({ type: 'TRAVEL_COMPLETE' });
      // Now in reorganizing (skipped comparing)
      actor.send({ type: 'REORG_COMPLETE' });

      // hasMoreSteps=false, so should finish immediately
      expect(actor.getSnapshot().value).toBe('finished');
      expect(input.onComplete).toHaveBeenCalled();
      expect(input.onExit).not.toHaveBeenCalled();

      actor.stop();
    });
  });
});
