import { describe, it, expect } from 'vitest';
import {
  TUTORIAL_GATES,
  DEFAULT_TUTORIAL_CONTENT,
  getPendingTutorial,
  getTutorialContent,
  getAllTutorialIds,
} from './rule-tutorials';

describe('TUTORIAL_GATES', () => {
  it('has 3 gates', () => {
    expect(TUTORIAL_GATES).toHaveLength(3);
  });

  it('gates are ordered by trigger level', () => {
    for (let i = 1; i < TUTORIAL_GATES.length; i++) {
      expect(TUTORIAL_GATES[i]!.triggerLevel).toBeGreaterThan(TUTORIAL_GATES[i - 1]!.triggerLevel);
    }
  });

  it('logic-rules gate triggers at level 17', () => {
    const gate = TUTORIAL_GATES.find((g) => g.id === 'logic-rules');
    expect(gate).toBeDefined();
    expect(gate!.triggerLevel).toBe(17);
    expect(gate!.rules).toEqual(['xor', 'and', 'or']);
    expect(gate!.mandatory).toBe(true);
  });

  it('mesh-overlay gate triggers at level 21', () => {
    const gate = TUTORIAL_GATES.find((g) => g.id === 'mesh-overlay');
    expect(gate).toBeDefined();
    expect(gate!.triggerLevel).toBe(21);
    expect(gate!.mandatory).toBe(false);
  });

  it('meta-rules gate triggers at level 29', () => {
    const gate = TUTORIAL_GATES.find((g) => g.id === 'meta-rules');
    expect(gate).toBeDefined();
    expect(gate!.triggerLevel).toBe(29);
    expect(gate!.rules).toEqual(['cross_attribute', 'meta_cycle']);
    expect(gate!.mandatory).toBe(true);
  });
});

describe('getPendingTutorial', () => {
  it('returns null below all trigger levels', () => {
    expect(getPendingTutorial(16, new Set())).toBeNull();
    expect(getPendingTutorial(1, new Set())).toBeNull();
  });

  it('returns logic-rules at level 17', () => {
    const gate = getPendingTutorial(17, new Set());
    expect(gate).not.toBeNull();
    expect(gate!.id).toBe('logic-rules');
  });

  it('returns mesh-overlay at level 21 when logic-rules already seen', () => {
    const gate = getPendingTutorial(21, new Set(['logic-rules']));
    expect(gate!.id).toBe('mesh-overlay');
  });

  it('returns meta-rules at level 29 when others already seen', () => {
    const gate = getPendingTutorial(29, new Set(['logic-rules', 'mesh-overlay']));
    expect(gate!.id).toBe('meta-rules');
  });

  it('returns null when all tutorials have been seen', () => {
    const allSeen = new Set(['logic-rules', 'mesh-overlay', 'meta-rules']);
    expect(getPendingTutorial(30, allSeen)).toBeNull();
  });

  it('returns lowest unseen tutorial when multiple are pending', () => {
    // At level 25, both logic-rules (17) and mesh-overlay (21) apply
    const gate = getPendingTutorial(25, new Set());
    expect(gate!.id).toBe('logic-rules'); // lowest first
  });

  it('skips seen tutorials and returns next one', () => {
    // At level 25, logic-rules seen, mesh-overlay not
    const gate = getPendingTutorial(25, new Set(['logic-rules']));
    expect(gate!.id).toBe('mesh-overlay');
  });
});

describe('getTutorialContent', () => {
  it('returns content for all gate IDs', () => {
    for (const gate of TUTORIAL_GATES) {
      const content = getTutorialContent(gate.id);
      expect(content).not.toBeNull();
      expect(content!.title).toBeTruthy();
      expect(content!.description).toBeTruthy();
      expect(content!.ruleExplanations.length).toBeGreaterThan(0);
    }
  });

  it('logic-rules has 3 rule explanations (XOR, AND, OR)', () => {
    const content = getTutorialContent('logic-rules');
    expect(content!.ruleExplanations).toHaveLength(3);
  });

  it('returns null for unknown gate ID', () => {
    expect(getTutorialContent('nonexistent')).toBeNull();
  });
});

describe('getAllTutorialIds', () => {
  it('returns all 3 gate IDs', () => {
    const ids = getAllTutorialIds();
    expect(ids).toEqual(['logic-rules', 'mesh-overlay', 'meta-rules']);
  });
});

describe('DEFAULT_TUTORIAL_CONTENT', () => {
  it('every rule explanation has a name and explanation', () => {
    for (const [, content] of Object.entries(DEFAULT_TUTORIAL_CONTENT)) {
      for (const rule of content.ruleExplanations) {
        expect(rule.name).toBeTruthy();
        expect(rule.explanation).toBeTruthy();
      }
    }
  });
});
