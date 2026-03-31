/**
 * Tests for Modality System
 *
 * Tests REAL behavior of:
 * - createStimulus function
 * - ModalityRegistry class
 * - modalityRegistry global instance
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  createStimulus,
  ModalityRegistry,
  modalityRegistry,
  type ModalityDefinition,
} from './modality';

// =============================================================================
// createStimulus Tests
// =============================================================================

describe('createStimulus', () => {
  test('should create stimulus with all properties', () => {
    const stimulus = createStimulus('position', 3, true, false);

    expect(stimulus.modalityId).toBe('position');
    expect(stimulus.value).toBe(3);
    expect(stimulus.isTarget).toBe(true);
    expect(stimulus.isLure).toBe(false);
    expect(stimulus.lureType).toBeUndefined();
  });

  test('should create stimulus with lure type', () => {
    const stimulus = createStimulus('audio', 'C', false, true, 'n-1');

    expect(stimulus.modalityId).toBe('audio');
    expect(stimulus.value).toBe('C');
    expect(stimulus.isTarget).toBe(false);
    expect(stimulus.isLure).toBe(true);
    expect(stimulus.lureType).toBe('n-1');
  });

  test('should create non-target non-lure stimulus', () => {
    const stimulus = createStimulus('color', 'red', false, false);

    expect(stimulus.isTarget).toBe(false);
    expect(stimulus.isLure).toBe(false);
  });

  test('should handle string values', () => {
    const stimulus = createStimulus('audio', 'K', true, false);

    expect(stimulus.value).toBe('K');
  });

  test('should handle number values', () => {
    const stimulus = createStimulus('position', 7, false, false);

    expect(stimulus.value).toBe(7);
  });

  test('should support different lure types', () => {
    const n1Lure = createStimulus('position', 1, false, true, 'n-1');
    const n2Lure = createStimulus('position', 2, false, true, 'n+1');

    expect(n1Lure.lureType).toBe('n-1');
    expect(n2Lure.lureType).toBe('n+1');
  });
});

// =============================================================================
// ModalityRegistry Tests
// =============================================================================

describe('ModalityRegistry', () => {
  let registry: ModalityRegistry;

  beforeEach(() => {
    registry = new ModalityRegistry();
  });

  describe('register()', () => {
    test('should register a modality', () => {
      const definition: ModalityDefinition<number> = {
        id: 'test',
        displayName: 'Test',
        type: 'visual',
        pool: [1, 2, 3],
        requiresRender: true,
      };

      registry.register(definition);

      expect(registry.has('test')).toBe(true);
    });

    test('should be chainable', () => {
      const result = registry
        .register({
          id: 'a',
          displayName: 'A',
          type: 'visual',
          pool: [1],
          requiresRender: true,
        })
        .register({
          id: 'b',
          displayName: 'B',
          type: 'auditory',
          pool: ['x'],
          requiresRender: false,
        });

      expect(result).toBe(registry);
      expect(registry.list().length).toBe(2);
    });
  });

  describe('get()', () => {
    test('should return registered modality', () => {
      const definition: ModalityDefinition = {
        id: 'myModality',
        displayName: 'My Modality',
        type: 'haptic',
        pool: [1, 2, 3],
        requiresRender: false,
      };
      registry.register(definition);

      const result = registry.get('myModality');

      expect(result.id).toBe('myModality');
      expect(result.displayName).toBe('My Modality');
      expect(result.type).toBe('haptic');
    });

    test('should throw for unknown modality', () => {
      expect(() => registry.get('unknown')).toThrow('Unknown modality: unknown');
    });
  });

  describe('has()', () => {
    test('should return true for registered modality', () => {
      registry.register({
        id: 'exists',
        displayName: 'Exists',
        type: 'visual',
        pool: [1],
        requiresRender: true,
      });

      expect(registry.has('exists')).toBe(true);
    });

    test('should return false for unregistered modality', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list()', () => {
    test('should return empty array for empty registry', () => {
      expect(registry.list()).toEqual([]);
    });

    test('should return all modality IDs', () => {
      registry.register({
        id: 'alpha',
        displayName: 'Alpha',
        type: 'visual',
        pool: [1],
        requiresRender: true,
      });
      registry.register({
        id: 'beta',
        displayName: 'Beta',
        type: 'auditory',
        pool: ['a'],
        requiresRender: false,
      });

      const list = registry.list();

      expect(list).toContain('alpha');
      expect(list).toContain('beta');
      expect(list.length).toBe(2);
    });
  });

  describe('getAll()', () => {
    test('should return empty array for empty registry', () => {
      expect(registry.getAll()).toEqual([]);
    });

    test('should return all modality definitions', () => {
      registry.register({
        id: 'one',
        displayName: 'One',
        type: 'visual',
        pool: [1],
        requiresRender: true,
      });
      registry.register({
        id: 'two',
        displayName: 'Two',
        type: 'auditory',
        pool: ['x'],
        requiresRender: false,
      });

      const all = registry.getAll();

      expect(all.length).toBe(2);
      expect(all.some((m) => m.id === 'one')).toBe(true);
      expect(all.some((m) => m.id === 'two')).toBe(true);
    });
  });

  describe('getByType()', () => {
    test('should filter by type', () => {
      registry.register({
        id: 'visual1',
        displayName: 'Visual 1',
        type: 'visual',
        pool: [1],
        requiresRender: true,
      });
      registry.register({
        id: 'visual2',
        displayName: 'Visual 2',
        type: 'visual',
        pool: [2],
        requiresRender: true,
      });
      registry.register({
        id: 'audio1',
        displayName: 'Audio 1',
        type: 'auditory',
        pool: ['a'],
        requiresRender: false,
      });

      const visualModalities = registry.getByType('visual');
      const auditoryModalities = registry.getByType('auditory');
      const hapticModalities = registry.getByType('haptic');

      expect(visualModalities.length).toBe(2);
      expect(auditoryModalities.length).toBe(1);
      expect(hapticModalities.length).toBe(0);
    });
  });
});

// =============================================================================
// Global modalityRegistry Tests
// =============================================================================

describe('modalityRegistry (global)', () => {
  test('should have position modality registered', () => {
    expect(modalityRegistry.has('position')).toBe(true);

    const position = modalityRegistry.get('position');
    expect(position.displayName).toBe('Position');
    expect(position.type).toBe('visual');
    expect(position.pool).toContain(0);
    expect(position.pool).toContain(7);
    expect(position.pool.length).toBe(8);
    expect(position.requiresRender).toBe(true);
  });

  test('should have audio modality registered', () => {
    expect(modalityRegistry.has('audio')).toBe(true);

    const audio = modalityRegistry.get('audio');
    expect(audio.displayName).toBe('Audio');
    expect(audio.type).toBe('auditory');
    expect(audio.pool).toContain('C');
    expect(audio.pool).toContain('T');
    expect(audio.pool.length).toBe(8);
    expect(audio.requiresRender).toBe(false);
  });

  test('should have color modality registered', () => {
    expect(modalityRegistry.has('color')).toBe(true);

    const color = modalityRegistry.get('color');
    expect(color.displayName).toBe('Couleur');
    expect(color.type).toBe('visual');
    expect(color.pool).toContain('red');
    expect(color.pool).toContain('blue');
    expect(color.defaultValue).toBe('blue');
    expect(color.requiresRender).toBe(true);
  });

  test('should have 3 modalities by default', () => {
    const all = modalityRegistry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  test('should have 2 visual modalities', () => {
    const visual = modalityRegistry.getByType('visual');
    expect(visual.length).toBeGreaterThanOrEqual(2);
    expect(visual.some((m) => m.id === 'position')).toBe(true);
    expect(visual.some((m) => m.id === 'color')).toBe(true);
  });

  test('should have 1 auditory modality', () => {
    const auditory = modalityRegistry.getByType('auditory');
    expect(auditory.length).toBeGreaterThanOrEqual(1);
    expect(auditory.some((m) => m.id === 'audio')).toBe(true);
  });
});
