/**
 * Mode Metadata Sync Tests
 *
 * Validates that the lightweight mode-metadata.ts values stay in sync
 * with the canonical specs in @neurodual/logic.
 *
 * This test exists because mode-metadata.ts intentionally duplicates
 * some values to avoid importing the heavy gameModeRegistry (~1MB)
 * on the home page. If specs change, this test will fail and remind
 * us to update mode-metadata.ts accordingly.
 */

import { describe, it, expect } from 'bun:test';
import { GAME_MODE_ROUTES, MODE_DEFAULTS, type GameRoute } from './mode-metadata';
import { THRESHOLDS, AllSpecs } from '@neurodual/logic';

describe('mode-metadata sync with specs', () => {
  describe('default values', () => {
    it('DEFAULT_N_LEVEL should match THRESHOLDS.defaults.nLevel', () => {
      // All modes in MODE_DEFAULTS should have nLevel matching spec
      for (const defaults of Object.values(MODE_DEFAULTS)) {
        expect(defaults.nLevel).toBe(THRESHOLDS.defaults.nLevel);
      }
    });

    it('trialsCount should match spec defaults', () => {
      const tempoModes = ['dualnback-classic', 'sim-brainworkshop', 'custom'];
      const flowModes = ['dual-place', 'dual-pick', 'dual-trace', 'dual-memo'];

      // Tempo modes should use trialsTempo
      for (const modeId of tempoModes) {
        const defaults = MODE_DEFAULTS[modeId as keyof typeof MODE_DEFAULTS];
        if (defaults) {
          expect(defaults.trialsCount).toBe(THRESHOLDS.defaults.trialsTempo);
        }
      }

      // Flow modes should use trialsFlow
      for (const modeId of flowModes) {
        const defaults = MODE_DEFAULTS[modeId as keyof typeof MODE_DEFAULTS];
        if (defaults) {
          expect(defaults.trialsCount).toBe(THRESHOLDS.defaults.trialsFlow);
        }
      }
    });
  });

  describe('route mappings', () => {
    it('all routes should be valid GameRoute values', () => {
      const validRoutes: GameRoute[] = [
        '/nback',
        '/dual-place',
        '/dual-memo',
        '/dual-pick',
        '/dual-trace',
      ];
      for (const route of Object.values(GAME_MODE_ROUTES)) {
        expect(validRoutes).toContain(route);
      }
    });
  });

  describe('mode IDs', () => {
    it('all MODE_DEFAULTS keys should exist in AllSpecs', () => {
      for (const modeId of Object.keys(MODE_DEFAULTS)) {
        expect(modeId in AllSpecs, `Mode "${modeId}" in MODE_DEFAULTS but not in AllSpecs`).toBe(
          true,
        );
      }
    });

    it('all GAME_MODE_ROUTES keys should exist in AllSpecs', () => {
      for (const modeId of Object.keys(GAME_MODE_ROUTES)) {
        expect(modeId in AllSpecs, `Mode "${modeId}" in GAME_MODE_ROUTES but not in AllSpecs`).toBe(
          true,
        );
      }
    });
  });
});
