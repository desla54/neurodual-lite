/**
 * Tutorial Spec Unit Tests (NeuroDual Lite)
 *
 * Verifies the ClassicTutorialSpec is correctly structured.
 * Only the basics tutorial is included in Lite.
 */

import { describe, expect, test } from 'bun:test';
import { ClassicTutorialSpec } from './tutorial.spec';

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

describe('TutorialSpecs Registry', () => {
  test('should contain only basics tutorial spec', () => {
    const { TutorialSpecs } = require('./tutorial.spec');
    expect(Object.keys(TutorialSpecs)).toHaveLength(1);
    expect(TutorialSpecs.basics).toBeDefined();
  });

  test('basics tutorial should have steps defined', () => {
    const { TutorialSpecs } = require('./tutorial.spec');
    expect(TutorialSpecs.basics.steps.length).toBeGreaterThan(0); // 22 steps
  });
});
