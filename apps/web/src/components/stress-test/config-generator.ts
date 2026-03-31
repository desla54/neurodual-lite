/**
 * Stress Test Config Generator
 *
 * Generates random configurations for stress testing.
 * Uses pure random sampling to explore the combinatorial space.
 */

import type { GeneratorOptions, StressTestConfig } from './types';
import { DEFAULT_GENERATOR_OPTIONS } from './types';

// =============================================================================
// Mode Definitions
// =============================================================================

/**
 * Available modes with their session types and valid modalities.
 *
 * NOTE: Currently only GameSession modes are testable in the stress test.
 * StressTestSession uses GameSessionXState which validates timing with
 * stimulus < interval constraint. Non-GameSession modes (Flow, Trace, etc.)
 * have different timing semantics that aren't compatible.
 *
 * TODO: Add session type dispatching to support all session types.
 */
const MODE_DEFINITIONS = {
  // GameSession modes (tempo) - TESTABLE
  'dual-catch': {
    sessionType: 'GameSession',
    modalities: ['position', 'audio', 'color', 'image', 'arithmetic'],
    minModalities: 1,
    maxModalities: 3,
  },
  'dualnback-classic': {
    sessionType: 'GameSession',
    modalities: ['position', 'audio'],
    minModalities: 2,
    maxModalities: 2, // Always dual
  },
  'sim-brainworkshop': {
    sessionType: 'GameSession',
    modalities: ['position', 'audio', 'color', 'arithmetic'],
    minModalities: 2,
    maxModalities: 4,
  },
  // NOTE: Non-GameSession modes excluded from stress test for now
  // They use different session classes with different timing semantics:
  // - PlaceSession: 'dual-place' (user-paced drag & drop)
  // - DualPickSession: 'dual-pick' (classification)
  // - RecallSession: 'dual-memo' (reconstruction)
  // - TraceSession: 'dual-trace' (intervalMs means "gap time", not cycle time)
} as const;

type ModeId = keyof typeof MODE_DEFINITIONS;

// =============================================================================
// Random Utilities
// =============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBoolean(probability = 0.5): boolean {
  return Math.random() < probability;
}

function randomChoice<T>(array: readonly T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  return array[Math.floor(Math.random() * array.length)] as T;
}

function randomSubset<T>(array: readonly T[], minCount: number, maxCount: number): T[] {
  const count = randomInt(minCount, Math.min(maxCount, array.length));
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateId(): string {
  return `stress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// Config Generator
// =============================================================================

/**
 * Generate a random stress test configuration.
 */
export function generateRandomConfig(
  options: GeneratorOptions = DEFAULT_GENERATOR_OPTIONS,
): StressTestConfig {
  // Filter modes based on options
  let availableModes = Object.keys(MODE_DEFINITIONS) as ModeId[];

  if (options.includeModes && options.includeModes.length > 0) {
    const includeModes = options.includeModes;
    availableModes = availableModes.filter((m) => includeModes.includes(m));
  }

  if (options.excludeModes && options.excludeModes.length > 0) {
    const excludeModes = options.excludeModes;
    availableModes = availableModes.filter((m) => !excludeModes.includes(m));
  }

  // Pick a random mode
  const modeId = randomChoice(availableModes);
  const modeDef = MODE_DEFINITIONS[modeId];

  // Generate random modalities
  const modalities = randomSubset(modeDef.modalities, modeDef.minModalities, modeDef.maxModalities);

  // Generate random config
  return {
    id: generateId(),
    modeId,
    nLevel: randomInt(options.nLevelRange.min, options.nLevelRange.max),
    modalities,
    trialsCount: randomInt(options.trialsCountRange.min, options.trialsCountRange.max),
    uiSettings: {
      soundEnabled: randomBoolean(0.7), // 70% chance sound is on
      hapticEnabled: randomBoolean(0.5),
      guidedMode: randomBoolean(0.5),
    },
  };
}

/**
 * Generator that yields random configs indefinitely.
 */
export function* configGenerator(
  options: GeneratorOptions = DEFAULT_GENERATOR_OPTIONS,
): Generator<StressTestConfig, never, void> {
  while (true) {
    yield generateRandomConfig(options);
  }
}

/**
 * Generate a batch of random configs.
 */
export function generateConfigBatch(
  count: number,
  options: GeneratorOptions = DEFAULT_GENERATOR_OPTIONS,
): StressTestConfig[] {
  const configs: StressTestConfig[] = [];
  for (let i = 0; i < count; i++) {
    configs.push(generateRandomConfig(options));
  }
  return configs;
}

/**
 * Get all available mode IDs.
 */
export function getAvailableModes(): ModeId[] {
  return Object.keys(MODE_DEFINITIONS) as ModeId[];
}

/**
 * Get mode definition for display purposes.
 */
export function getModeDefinition(modeId: string) {
  return MODE_DEFINITIONS[modeId as ModeId];
}
