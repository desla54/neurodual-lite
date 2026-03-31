/**
 * useStressTestRunner - Hook for running stress tests
 *
 * Orchestrates the stress test loop:
 * 1. Generate random configs
 * 2. Run sessions with bot
 * 3. Verify invariants
 * 4. Report results
 */

import { useCallback, useRef, useState } from 'react';
import type {
  StressTestState,
  StressTestConfig,
  StressTestResult,
  StressTestError,
  GeneratorOptions,
} from './types';
import { INITIAL_STRESS_TEST_STATE, DEFAULT_GENERATOR_OPTIONS } from './types';
import { generateRandomConfig } from './config-generator';
import {
  runAllInvariantChecks,
  allInvariantsPassed,
  type InvariantContext,
} from './invariant-checkers';
import { useMountEffect } from '@neurodual/ui';

// =============================================================================
// Types
// =============================================================================

export interface StressTestRunnerOptions {
  /** Max sessions to run (0 = infinite) */
  maxSessions?: number;
  /** Config generation options */
  generatorOptions?: GeneratorOptions;
  /** Session timeout in ms */
  sessionTimeoutMs?: number;
  /** Delay between sessions in ms */
  delayBetweenSessionsMs?: number;
}

export interface StressTestRunner {
  /** Current state */
  state: StressTestState;
  /** Start the stress test */
  start: () => void;
  /** Pause the stress test */
  pause: () => void;
  /** Resume after pause */
  resume: () => void;
  /** Stop and reset */
  stop: () => void;
  /** Report a session result (called by session wrapper) */
  reportResult: (result: SessionRunResult) => void;
  /** Report an error */
  reportError: (error: StressTestError) => void;
  /** Get next config to run */
  getNextConfig: () => StressTestConfig | null;
}

export interface SessionRunResult {
  config: StressTestConfig;
  finalPhase: string;
  events: Array<{ type: string; timestamp: number; data?: unknown }>;
  summary?: {
    trialsCompleted: number;
    score?: number;
    dPrime?: number;
    passed?: boolean;
  };
  durationMs: number;
  timedOut: boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useStressTestRunner(options: StressTestRunnerOptions = {}): StressTestRunner {
  const {
    maxSessions = 0,
    generatorOptions = DEFAULT_GENERATOR_OPTIONS,
    // These are available for future use but not currently used
    // sessionTimeoutMs = 60000, // 1 minute max per session
    // delayBetweenSessionsMs = 500,
  } = options;

  const [state, setState] = useState<StressTestState>(INITIAL_STRESS_TEST_STATE);

  // Refs for mutable state in callbacks
  const stateRef = useRef(state);
  const consoleErrorsRef = useRef<string[]>([]);

  // Keep stateRef in sync
  stateRef.current = state;

  // Capture console errors
  useMountEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      consoleErrorsRef.current.push(args.map(String).join(' '));
      originalError.apply(console, args);
    };

    const handleError = (event: ErrorEvent) => {
      consoleErrorsRef.current.push(`${event.message} at ${event.filename}:${event.lineno}`);
    };

    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
    };
  });

  // Generate next config
  const getNextConfig = useCallback((): StressTestConfig | null => {
    const current = stateRef.current;

    if (current.phase !== 'running') return null;
    if (maxSessions > 0 && current.completedCount >= maxSessions) return null;

    const config = generateRandomConfig(generatorOptions);

    setState((s) => ({ ...s, currentConfig: config }));

    // Clear console errors for this session
    consoleErrorsRef.current = [];

    return config;
  }, [maxSessions, generatorOptions]);

  // Report session result
  const reportResult = useCallback(
    (runResult: SessionRunResult) => {
      const context: InvariantContext = {
        config: runResult.config,
        finalPhase: runResult.finalPhase,
        events: runResult.events,
        consoleErrors: consoleErrorsRef.current,
        timedOut: runResult.timedOut,
        summary: runResult.summary,
      };

      const invariants = runAllInvariantChecks(context);
      const passed = allInvariantsPassed(invariants);

      // Get memory usage if available
      const perf = performance as Performance & {
        memory?: { usedJSHeapSize: number };
      };
      const memoryMb = perf.memory ? perf.memory.usedJSHeapSize / 1024 / 1024 : undefined;

      const result: StressTestResult = {
        config: runResult.config,
        passed,
        durationMs: runResult.durationMs,
        errors: consoleErrorsRef.current.map((msg) => ({
          type: 'js_error' as const,
          message: msg,
          timestamp: Date.now(),
        })),
        invariants,
        memoryMb,
        scoring: runResult.summary
          ? {
              dPrime: runResult.summary.dPrime,
              score: runResult.summary.score,
              sessionPassed: runResult.summary.passed,
            }
          : undefined,
      };

      setState((s) => {
        const newCompleted = s.completedCount + 1;
        const newPassed = passed ? s.passedCount + 1 : s.passedCount;
        const newFailed = passed ? s.failedCount : s.failedCount + 1;

        // Check if we should stop
        const shouldStop = maxSessions > 0 && newCompleted >= maxSessions;

        return {
          ...s,
          completedCount: newCompleted,
          passedCount: newPassed,
          failedCount: newFailed,
          results: [...s.results, result],
          currentConfig: null,
          phase: shouldStop ? 'completed' : s.phase,
        };
      });
    },
    [maxSessions],
  );

  // Report error
  const reportError = useCallback((error: StressTestError) => {
    setState((s) => ({
      ...s,
      errors: [...s.errors, error],
    }));
  }, []);

  // Control functions
  const start = useCallback(() => {
    setState({
      ...INITIAL_STRESS_TEST_STATE,
      phase: 'running',
      targetCount: maxSessions,
      startTime: Date.now(),
    });
  }, [maxSessions]);

  const pause = useCallback(() => {
    setState((s) => (s.phase === 'running' ? { ...s, phase: 'paused' } : s));
  }, []);

  const resume = useCallback(() => {
    setState((s) => (s.phase === 'paused' ? { ...s, phase: 'running' } : s));
  }, []);

  const stop = useCallback(() => {
    setState((s) => ({ ...s, phase: 'idle', currentConfig: null }));
  }, []);

  return {
    state,
    start,
    pause,
    resume,
    stop,
    reportResult,
    reportError,
    getNextConfig,
  };
}
