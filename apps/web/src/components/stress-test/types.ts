/**
 * Stress Test Types
 *
 * Types for the automated stress testing system.
 */

import type { GameModeId } from '@neurodual/logic';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * A single stress test configuration to run.
 */
export interface StressTestConfig {
  /** Unique run ID */
  readonly id: string;
  /** Game mode to test */
  readonly modeId: GameModeId;
  /** N-level for the session */
  readonly nLevel: number;
  /** Active modalities */
  readonly modalities: readonly string[];
  /** Number of trials */
  readonly trialsCount: number;
  /** UI settings */
  readonly uiSettings: {
    readonly soundEnabled: boolean;
    readonly hapticEnabled: boolean;
    readonly guidedMode: boolean;
  };
}

/**
 * Result of a single stress test run.
 */
export interface StressTestResult {
  /** Config that was tested */
  readonly config: StressTestConfig;
  /** Whether the test passed all invariants */
  readonly passed: boolean;
  /** Duration of the session in ms */
  readonly durationMs: number;
  /** Errors encountered */
  readonly errors: readonly StressTestError[];
  /** Invariant check results */
  readonly invariants: readonly InvariantCheckResult[];
  /** Memory usage if available */
  readonly memoryMb?: number;
  /** Scoring data from the session */
  readonly scoring?: {
    readonly dPrime?: number;
    readonly score?: number;
    readonly sessionPassed?: boolean;
  };
}

/**
 * An error encountered during stress testing.
 */
export interface StressTestError {
  readonly type: 'js_error' | 'render_error' | 'state_error' | 'timeout';
  readonly message: string;
  readonly stack?: string;
  readonly timestamp: number;
}

/**
 * Result of an invariant check.
 */
export interface InvariantCheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}

// =============================================================================
// Runner State
// =============================================================================

export type StressTestPhase = 'idle' | 'running' | 'paused' | 'completed' | 'error';

/**
 * Current state of the stress test runner.
 */
export interface StressTestState {
  readonly phase: StressTestPhase;
  /** Total sessions to run (0 = infinite) */
  readonly targetCount: number;
  /** Sessions completed */
  readonly completedCount: number;
  /** Sessions that passed all invariants */
  readonly passedCount: number;
  /** Sessions that failed */
  readonly failedCount: number;
  /** Current config being tested */
  readonly currentConfig: StressTestConfig | null;
  /** All results so far */
  readonly results: readonly StressTestResult[];
  /** Start time of the run */
  readonly startTime: number | null;
  /** Errors collected */
  readonly errors: readonly StressTestError[];
}

export const INITIAL_STRESS_TEST_STATE: StressTestState = {
  phase: 'idle',
  targetCount: 0,
  completedCount: 0,
  passedCount: 0,
  failedCount: 0,
  currentConfig: null,
  results: [],
  startTime: null,
  errors: [],
};

// =============================================================================
// Generator Options
// =============================================================================

/**
 * Options for the config generator.
 */
export interface GeneratorOptions {
  /** Modes to include (empty = all) */
  readonly includeModes?: readonly GameModeId[];
  /** Modes to exclude */
  readonly excludeModes?: readonly GameModeId[];
  /** N-level range */
  readonly nLevelRange: { min: number; max: number };
  /** Trials count range */
  readonly trialsCountRange: { min: number; max: number };
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  nLevelRange: { min: 1, max: 4 },
  trialsCountRange: { min: 10, max: 20 }, // Short sessions for fast testing
};
