/**
 * Tutorial Spec Unit Tests
 *
 * Verifies the ClassicTutorialSpec is correctly structured.
 */

import { describe, expect, test } from 'bun:test';
import {
  ClassicTutorialSpec,
  PlaceTutorialSpec,
  MemoTutorialSpec,
  PickTutorialSpec,
  TraceTutorialSpec,
} from './tutorial.spec';

describe('ClassicTutorialSpec', () => {
  test('should have 22 steps', () => {
    expect(ClassicTutorialSpec.steps.length).toBe(22);
  });

  test('should have nLevel = 2', () => {
    expect(ClassicTutorialSpec.nLevel).toBe(2);
  });

  test('should have unique step IDs', () => {
    const ids = ClassicTutorialSpec.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('all steps should have valid intent', () => {
    const validIntents = ['DEMO', 'COMPARE', 'ACTION'];
    for (const step of ClassicTutorialSpec.steps) {
      expect(validIntents).toContain(step.intent);
    }
  });

  test('all steps should have valid exitCondition', () => {
    const validConditions = ['AUTO', 'RESPONSE'];
    for (const step of ClassicTutorialSpec.steps) {
      expect(validConditions).toContain(step.exitCondition);
    }
  });

  test('all steps should have annotationKey', () => {
    for (const step of ClassicTutorialSpec.steps) {
      expect(step.annotationKey).toBeDefined();
      expect(step.annotationKey.startsWith('tutorial.annotations.')).toBe(true);
    }
  });

  test('first 2 steps should be DEMO intent', () => {
    expect(ClassicTutorialSpec.steps[0]?.intent).toBe('DEMO');
    expect(ClassicTutorialSpec.steps[1]?.intent).toBe('DEMO');
  });

  test('should have first position match at step 2', () => {
    const step = ClassicTutorialSpec.steps[2];
    expect(step?.expectedMatch?.position).toBe(true);
    expect(step?.expectedMatch?.audio).toBe(false);
  });

  test('should have first audio match at step 3', () => {
    const step = ClassicTutorialSpec.steps[3];
    expect(step?.expectedMatch?.position).toBe(false);
    expect(step?.expectedMatch?.audio).toBe(true);
  });

  test('should have first dual match at step 7', () => {
    const step = ClassicTutorialSpec.steps[7];
    expect(step?.expectedMatch?.position).toBe(true);
    expect(step?.expectedMatch?.audio).toBe(true);
  });

  test('highlightSlots should only be defined for match steps', () => {
    for (const step of ClassicTutorialSpec.steps) {
      if (step.highlightSlots) {
        // Should only contain valid slot IDs
        for (const slot of step.highlightSlots) {
          expect(['n', 'n-1', 'n-2']).toContain(slot);
        }
      }
    }
  });

  test('trial data should have valid position (0-7)', () => {
    for (const step of ClassicTutorialSpec.steps) {
      expect(step.trial.position).toBeGreaterThanOrEqual(0);
      expect(step.trial.position).toBeLessThanOrEqual(7);
    }
  });

  test('trial data should have valid sound (single letter)', () => {
    for (const step of ClassicTutorialSpec.steps) {
      expect(step.trial.sound).toMatch(/^[A-Z]$/);
    }
  });

  // Hub metadata tests
  test('should have hub metadata', () => {
    expect(ClassicTutorialSpec.titleKey).toBeDefined();
    expect(ClassicTutorialSpec.descriptionKey).toBeDefined();
    expect(ClassicTutorialSpec.iconName).toBeDefined();
    expect(ClassicTutorialSpec.associatedModeId).toBeDefined();
  });

  test('should have id = basics', () => {
    expect(ClassicTutorialSpec.id).toBe('basics');
  });
});

describe('PlaceTutorialSpec', () => {
  test('should have 16 steps', () => {
    expect(PlaceTutorialSpec.steps.length).toBe(16);
  });

  test('should have nLevel = 2', () => {
    expect(PlaceTutorialSpec.nLevel).toBe(2);
  });

  test('should have controlLayout = place', () => {
    expect(PlaceTutorialSpec.controlLayout).toBe('place');
  });

  test('should have unique step IDs', () => {
    const ids = PlaceTutorialSpec.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('first 3 steps should be DEMO intent (buffer building)', () => {
    expect(PlaceTutorialSpec.steps[0]?.intent).toBe('DEMO');
    expect(PlaceTutorialSpec.steps[1]?.intent).toBe('DEMO');
    expect(PlaceTutorialSpec.steps[2]?.intent).toBe('DEMO');
  });

  test('step 3 should have expectedPlacement for first position placement', () => {
    const step3 = PlaceTutorialSpec.steps[3];
    expect(step3?.expectedPlacement).toEqual({
      modality: 'position',
      slot: 'N-2',
      value: 0,
    });
  });

  test('step 12 should have expectedPlacements with 6 items (dual batch)', () => {
    const step12 = PlaceTutorialSpec.steps[12];
    expect(step12?.expectedPlacements).toHaveLength(6);
    // Verify it contains both position and audio placements
    const positionPlacements =
      step12?.expectedPlacements?.filter((p) => p.modality === 'position') ?? [];
    const audioPlacements = step12?.expectedPlacements?.filter((p) => p.modality === 'audio') ?? [];
    expect(positionPlacements).toHaveLength(3);
    expect(audioPlacements).toHaveLength(3);
  });

  test('ACTION steps should have expectedPlacement or expectedPlacements', () => {
    const actionSteps = PlaceTutorialSpec.steps.filter((s) => s.intent === 'ACTION');
    for (const step of actionSteps) {
      const hasPlacement = step.expectedPlacement !== undefined;
      const hasPlacements = step.expectedPlacements !== undefined;
      expect(hasPlacement || hasPlacements).toBe(true);
    }
  });

  test('should have spotlight configuration', () => {
    expect(PlaceTutorialSpec.spotlight).toBeDefined();
    expect(PlaceTutorialSpec.spotlight?.steps.length).toBeGreaterThan(0);
  });

  test('should have hub metadata', () => {
    expect(PlaceTutorialSpec.titleKey).toBe('tutorial.hub.place.title');
    expect(PlaceTutorialSpec.associatedModeId).toBe('dual-place');
    expect(PlaceTutorialSpec.iconName).toBe('MapPin');
  });
});

describe('MemoTutorialSpec', () => {
  test('should have 18 steps', () => {
    expect(MemoTutorialSpec.steps.length).toBe(18);
  });

  test('should have nLevel = 2', () => {
    expect(MemoTutorialSpec.nLevel).toBe(2);
  });

  test('should have controlLayout = memo', () => {
    expect(MemoTutorialSpec.controlLayout).toBe('memo');
  });

  test('should have unique step IDs', () => {
    const ids = MemoTutorialSpec.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('first 3 steps should be DEMO intent (conscious observation)', () => {
    expect(MemoTutorialSpec.steps[0]?.intent).toBe('DEMO');
    expect(MemoTutorialSpec.steps[1]?.intent).toBe('DEMO');
    expect(MemoTutorialSpec.steps[2]?.intent).toBe('DEMO');
  });

  test('ACTION steps should have expectedRecall or expectedRecalls', () => {
    const actionSteps = MemoTutorialSpec.steps.filter((s) => s.intent === 'ACTION');
    for (const step of actionSteps) {
      const hasRecall = step.expectedRecall !== undefined;
      const hasRecalls = step.expectedRecalls !== undefined;
      expect(hasRecall || hasRecalls).toBe(true);
    }
  });

  test('should use vowels for easier memorization', () => {
    const stimuliSteps = MemoTutorialSpec.steps.filter(
      (s) => s.trial?.sound && s.trial.sound !== '',
    );
    const sounds = stimuliSteps.map((s) => s.trial.sound);
    const vowels = ['A', 'E', 'I', 'O', 'U'];
    const vowelCount = sounds.filter((s) => vowels.includes(s)).length;
    // All sounds should be vowels for easier memorization
    expect(vowelCount).toBe(sounds.length);
  });

  test('should have spotlight configuration', () => {
    expect(MemoTutorialSpec.spotlight).toBeDefined();
    expect(MemoTutorialSpec.spotlight?.steps.length).toBeGreaterThan(0);
  });

  test('should have hub metadata', () => {
    expect(MemoTutorialSpec.titleKey).toBe('tutorial.hub.memo.title');
    expect(MemoTutorialSpec.associatedModeId).toBe('dual-memo');
    expect(MemoTutorialSpec.iconName).toBe('Brain');
  });
});

describe('PickTutorialSpec', () => {
  test('should have 18 steps', () => {
    expect(PickTutorialSpec.steps.length).toBe(18);
  });

  test('should have controlLayout = dual-pick', () => {
    expect(PickTutorialSpec.controlLayout).toBe('dual-pick');
  });

  test('should have unique step IDs', () => {
    const ids = PickTutorialSpec.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('ACTION steps should have expectedClassification', () => {
    const actionSteps = PickTutorialSpec.steps.filter((s) => s.intent === 'ACTION');
    for (const step of actionSteps) {
      expect(step.expectedClassification).toBeDefined();
    }
  });

  test('step 2 should expect position HAUT (first position exercise)', () => {
    const step2 = PickTutorialSpec.steps[2];
    expect(step2?.expectedClassification?.position).toBe('HAUT');
  });

  test('step 8 should expect sound VOYELLE (first sound exercise)', () => {
    const step8 = PickTutorialSpec.steps[8];
    expect(step8?.expectedClassification?.sound).toBe('VOYELLE');
  });

  test('step 13 should expect dual classification (HAUT + VOYELLE)', () => {
    const step13 = PickTutorialSpec.steps[13];
    expect(step13?.expectedClassification?.position).toBe('HAUT');
    expect(step13?.expectedClassification?.sound).toBe('VOYELLE');
  });

  test('steps 0-1 should be DEMO with AUTO exit (intro phase)', () => {
    expect(PickTutorialSpec.steps[0]?.intent).toBe('DEMO');
    expect(PickTutorialSpec.steps[0]?.exitCondition).toBe('AUTO');
    expect(PickTutorialSpec.steps[1]?.intent).toBe('DEMO');
    expect(PickTutorialSpec.steps[1]?.exitCondition).toBe('AUTO');
  });

  test('steps 16-17 should be DEMO with AUTO exit (rhythm + conclusion)', () => {
    const step16 = PickTutorialSpec.steps[16];
    const step17 = PickTutorialSpec.steps[17];
    expect(step16?.intent).toBe('DEMO');
    expect(step16?.exitCondition).toBe('AUTO');
    expect(step17?.intent).toBe('DEMO');
    expect(step17?.exitCondition).toBe('AUTO');
  });

  test('should have spotlight configuration', () => {
    expect(PickTutorialSpec.spotlight).toBeDefined();
    expect(PickTutorialSpec.spotlight?.steps.length).toBeGreaterThan(0);
  });

  test('should have hub metadata', () => {
    expect(PickTutorialSpec.titleKey).toBe('tutorial.hub.label.title');
    expect(PickTutorialSpec.descriptionKey).toBe('tutorial.hub.label.description');
    expect(PickTutorialSpec.associatedModeId).toBe('dual-pick');
    expect(PickTutorialSpec.iconName).toBe('Tag');
  });
});

describe('TraceTutorialSpec', () => {
  test('should have 14 steps', () => {
    expect(TraceTutorialSpec.steps.length).toBe(14);
  });

  test('should have nLevel = 1 (N-1 for simplicity)', () => {
    expect(TraceTutorialSpec.nLevel).toBe(1);
  });

  test('should have controlLayout = trace', () => {
    expect(TraceTutorialSpec.controlLayout).toBe('trace');
  });

  test('should have unique step IDs', () => {
    const ids = TraceTutorialSpec.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('first 2 steps should be DEMO intent (buffer building)', () => {
    expect(TraceTutorialSpec.steps[0]?.intent).toBe('DEMO');
    expect(TraceTutorialSpec.steps[1]?.intent).toBe('DEMO');
  });

  test('step 2 should be first swipe action (first ACTION step)', () => {
    const step2 = TraceTutorialSpec.steps[2];
    expect(step2?.intent).toBe('ACTION');
    expect(step2?.exitCondition).toBe('RESPONSE');
    expect(step2?.expectedSwipe?.targetPosition).toBe(3); // Position from step 1
  });

  test('step 6 should have first audio match with expectedSwipe.audioMatch', () => {
    const step6 = TraceTutorialSpec.steps[6];
    expect(step6?.expectedSwipe?.audioMatch).toBe(true);
  });

  test('ACTION steps should have expectedSwipe', () => {
    const actionSteps = TraceTutorialSpec.steps.filter((s) => s.intent === 'ACTION');
    for (const step of actionSteps) {
      expect(step.expectedSwipe).toBeDefined();
      expect(step.expectedSwipe?.targetPosition).toBeDefined();
    }
  });

  test('should have spotlight configuration', () => {
    expect(TraceTutorialSpec.spotlight).toBeDefined();
    expect(TraceTutorialSpec.spotlight?.steps.length).toBeGreaterThan(0);
  });

  test('should have hub metadata', () => {
    expect(TraceTutorialSpec.titleKey).toBe('tutorial.hub.trace.title');
    expect(TraceTutorialSpec.associatedModeId).toBe('dual-trace');
    expect(TraceTutorialSpec.iconName).toBe('Fingerprint');
  });
});

describe('TutorialSpecs Registry', () => {
  test('should contain all 5 tutorial specs', () => {
    const { TutorialSpecs } = require('./tutorial.spec');
    expect(Object.keys(TutorialSpecs)).toHaveLength(5);
    expect(TutorialSpecs.basics).toBeDefined();
    expect(TutorialSpecs.place).toBeDefined();
    expect(TutorialSpecs.pick).toBeDefined();
    expect(TutorialSpecs.trace).toBeDefined();
    expect(TutorialSpecs.memo).toBeDefined();
  });

  test('all tutorials should have steps defined', () => {
    const { TutorialSpecs } = require('./tutorial.spec');
    expect(TutorialSpecs.basics.steps.length).toBeGreaterThan(0); // 22 steps
    expect(TutorialSpecs.pick.steps.length).toBeGreaterThan(0); // 6 steps
    expect(TutorialSpecs.place.steps.length).toBeGreaterThan(0); // 16 steps
    expect(TutorialSpecs.trace.steps.length).toBeGreaterThan(0); // 14 steps
    expect(TutorialSpecs.memo.steps.length).toBeGreaterThan(0); // 18 steps
  });
});
