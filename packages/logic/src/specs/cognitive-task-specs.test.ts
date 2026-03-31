/**
 * Integration tests for cognitive task spec registration and configuration.
 *
 * Verifies that each priority mode has a properly registered spec in AllSpecs
 * with correct scoring, report, timing, and defaults configuration.
 */

import { describe, expect, it } from 'bun:test';
import { AllSpecs } from './index';
import type { ModeSpec, ReportSectionId } from './types';

// =============================================================================
// Target mode IDs (priority cognitive tasks)
// =============================================================================

const PRIORITY_MODE_IDS = [
  'posner-cueing',
  'ufov',
  'ax-cpt',
  'cpt',
  'soroban',
  'mental-rotation',
  'rhythm',
  'chain-recall',
  'tangram',
  'pipeline',
  'sternberg',
  'letter-number',
  'pal',
  'word-list',
  'pattern-recognition',
  'maze',
  'promem',
  'time-promem',
  'dual-task',
  'binding',
] as const;

// Helper to retrieve spec, typed as ModeSpec | undefined
function getSpec(modeId: string): ModeSpec | undefined {
  return (AllSpecs as Record<string, ModeSpec>)[modeId];
}

// =============================================================================
// 1. Spec Registration
// =============================================================================

describe('Spec Registration', () => {
  it.each(PRIORITY_MODE_IDS as any)('%s exists in AllSpecs', (modeId) => {
    const spec = getSpec(modeId as any);
    expect(spec).toBeDefined();
    expect(spec!.metadata.id).toBe(modeId as any);
  });
});

// =============================================================================
// 2. Scoring Config
// =============================================================================

describe('Scoring Config', () => {
  const VALID_STRATEGIES = ['accuracy', 'sdt', 'dualnback-classic', 'brainworkshop'];

  it.each(PRIORITY_MODE_IDS as any)('%s has a valid scoring strategy', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.scoring).toBeDefined();
    expect(VALID_STRATEGIES).toContain(spec.scoring.strategy);
  });

  it.each(PRIORITY_MODE_IDS as any)('%s has a reasonable passThreshold (0 < t <= 1)', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.scoring.passThreshold).toBeGreaterThan(0);
    expect(spec.scoring.passThreshold).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// 3. Report Config
// =============================================================================

describe('Report Config', () => {
  const REQUIRED_SECTIONS: ReportSectionId[] = ['HERO', 'DETAILS'];

  it.each(PRIORITY_MODE_IDS as any)('%s has report.sections with HERO and DETAILS', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.report).toBeDefined();
    expect(Array.isArray(spec.report.sections)).toBe(true);
    for (const section of REQUIRED_SECTIONS) {
      expect(spec.report.sections).toContain(section);
    }
  });

  it.each(PRIORITY_MODE_IDS as any)('%s has report.display.modeScoreKey defined', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.report.display).toBeDefined();
    expect(typeof spec.report.display.modeScoreKey).toBe('string');
    expect(spec.report.display.modeScoreKey.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 4. Timing Config
// =============================================================================

describe('Timing Config', () => {
  it.each(PRIORITY_MODE_IDS as any)('%s has stimulusDurationMs >= 0', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.timing).toBeDefined();
    expect(spec.timing.stimulusDurationMs).toBeGreaterThanOrEqual(0);
  });

  it.each(PRIORITY_MODE_IDS as any)('%s has intervalMs >= 0', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.timing.intervalMs).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// 5. Defaults Config
// =============================================================================

describe('Defaults Config', () => {
  it.each(PRIORITY_MODE_IDS as any)('%s has trialsCount > 0', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.defaults).toBeDefined();
    expect(spec.defaults.trialsCount).toBeGreaterThan(0);
  });

  it.each(PRIORITY_MODE_IDS as any)('%s has nLevel >= 0', (modeId) => {
    const spec = getSpec(modeId as any)!;
    expect(spec.defaults.nLevel).toBeGreaterThanOrEqual(0);
  });
});
