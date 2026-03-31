/**
 * Invariant Checkers
 *
 * Verify that sessions complete correctly and data is consistent.
 */

import type { InvariantCheckResult, StressTestConfig } from './types';

// =============================================================================
// Invariant Check Interface
// =============================================================================

export interface InvariantChecker {
  readonly name: string;
  check(context: InvariantContext): InvariantCheckResult;
}

export interface InvariantContext {
  /** The config that was tested */
  readonly config: StressTestConfig;
  /** Final phase of the session machine */
  readonly finalPhase: string;
  /** Events collected during the session */
  readonly events: readonly SessionEvent[];
  /** Console errors during the session */
  readonly consoleErrors: readonly string[];
  /** Whether the session timed out */
  readonly timedOut: boolean;
  /** Session summary if available */
  readonly summary?: SessionSummary;
}

interface SessionEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly data?: unknown;
}

interface SessionSummary {
  readonly trialsCompleted: number;
  readonly score?: number;
  readonly dPrime?: number;
  readonly passed?: boolean;
}

// =============================================================================
// Individual Invariant Checkers
// =============================================================================

/**
 * Check that the session ended properly (not stuck or crashed).
 */
export const sessionEndedChecker: InvariantChecker = {
  name: 'Session Ended Properly',
  check(ctx) {
    // Valid end phases (GameSessionXState uses 'finished')
    const validEndPhases = ['ended', 'completed', 'results', 'idle', 'finished'];
    const passed = validEndPhases.includes(ctx.finalPhase) && !ctx.timedOut;

    return {
      name: this.name,
      passed,
      message: passed
        ? undefined
        : `Session ended in phase "${ctx.finalPhase}"${ctx.timedOut ? ' (timed out)' : ''}`,
    };
  },
};

/**
 * Check that no JavaScript errors occurred.
 */
export const noJsErrorsChecker: InvariantChecker = {
  name: 'No JS Errors',
  check(ctx) {
    const passed = ctx.consoleErrors.length === 0;
    return {
      name: this.name,
      passed,
      message: passed ? undefined : `${ctx.consoleErrors.length} error(s): ${ctx.consoleErrors[0]}`,
    };
  },
};

/**
 * Check that trials were actually played.
 */
export const trialsPlayedChecker: InvariantChecker = {
  name: 'Trials Played',
  check(ctx) {
    // Count trial events
    const trialEvents = ctx.events.filter(
      (e) => e.type === 'TRIAL_PRESENTED' || e.type === 'TRIAL_COMPLETED',
    );

    // Should have at least some trials
    const minExpected = Math.max(1, ctx.config.trialsCount * 0.5);
    const passed = trialEvents.length >= minExpected;

    return {
      name: this.name,
      passed,
      message: passed
        ? undefined
        : `Expected at least ${minExpected} trial events, got ${trialEvents.length}`,
    };
  },
};

/**
 * Check that the score is valid (not NaN, not negative for most metrics).
 */
export const validScoreChecker: InvariantChecker = {
  name: 'Valid Score',
  check(ctx) {
    if (!ctx.summary) {
      // No summary = can't check, assume OK if session ended
      return { name: this.name, passed: true };
    }

    const score = ctx.summary.score ?? ctx.summary.dPrime;
    if (score === undefined) {
      return { name: this.name, passed: true };
    }

    const passed = !Number.isNaN(score) && Number.isFinite(score);
    return {
      name: this.name,
      passed,
      message: passed ? undefined : `Invalid score: ${score}`,
    };
  },
};

/**
 * Check that bot "perfect" play results in high d-prime.
 * Bot responds correctly to all trials, so d' should be positive.
 */
export const botPerformanceChecker: InvariantChecker = {
  name: 'Bot Performance',
  check(ctx) {
    if (!ctx.summary?.dPrime) {
      // No d-prime = can't check (might be accuracy-based mode)
      return { name: this.name, passed: true };
    }

    // Bot playing perfectly should have positive d-prime
    // We use a low threshold (0.5) to account for:
    // - Random sequences with few targets
    // - Edge cases in scoring
    const minDPrime = 0.5;
    const passed = ctx.summary.dPrime >= minDPrime;

    return {
      name: this.name,
      passed,
      message: passed
        ? undefined
        : `Bot d'=${ctx.summary.dPrime.toFixed(2)} < ${minDPrime} (expected higher for perfect play)`,
    };
  },
};

/**
 * Check that events are in chronological order.
 */
export const eventsOrderedChecker: InvariantChecker = {
  name: 'Events Ordered',
  check(ctx) {
    if (ctx.events.length < 2) {
      return { name: this.name, passed: true };
    }

    for (let i = 1; i < ctx.events.length; i++) {
      const current = ctx.events[i];
      const previous = ctx.events[i - 1];
      if (current && previous && current.timestamp < previous.timestamp) {
        return {
          name: this.name,
          passed: false,
          message: `Event ${i} has earlier timestamp than event ${i - 1}`,
        };
      }
    }

    return { name: this.name, passed: true };
  },
};

/**
 * Check that session started and ended events are present.
 */
export const sessionLifecycleChecker: InvariantChecker = {
  name: 'Session Lifecycle',
  check(ctx) {
    const hasStart = ctx.events.some((e) => e.type === 'SESSION_STARTED' || e.type === 'START');
    const hasEnd = ctx.events.some(
      (e) => e.type === 'SESSION_ENDED' || e.type === 'SESSION_COMPLETED' || e.type === 'END',
    );

    const passed = hasStart && hasEnd;
    return {
      name: this.name,
      passed,
      message: passed
        ? undefined
        : `Missing ${!hasStart ? 'start' : ''}${!hasStart && !hasEnd ? ' and ' : ''}${!hasEnd ? 'end' : ''} event`,
    };
  },
};

/**
 * Check memory usage hasn't exploded.
 */
export const memoryStableChecker: InvariantChecker = {
  name: 'Memory Stable',
  check(_ctx) {
    // Check if performance.memory is available (Chrome only)
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    if (!perf.memory) {
      return { name: this.name, passed: true, message: 'Memory API not available' };
    }

    const usedMb = perf.memory.usedJSHeapSize / 1024 / 1024;
    const threshold = 500; // 500MB warning threshold

    const passed = usedMb < threshold;
    return {
      name: this.name,
      passed,
      message: passed ? undefined : `High memory usage: ${usedMb.toFixed(1)}MB`,
    };
  },
};

// =============================================================================
// Combined Checker
// =============================================================================

/**
 * All invariant checkers to run after each session.
 */
export const ALL_INVARIANT_CHECKERS: readonly InvariantChecker[] = [
  sessionEndedChecker,
  noJsErrorsChecker,
  trialsPlayedChecker,
  validScoreChecker,
  botPerformanceChecker,
  eventsOrderedChecker,
  sessionLifecycleChecker,
  memoryStableChecker,
];

/**
 * Run all invariant checks on a session context.
 */
export function runAllInvariantChecks(context: InvariantContext): InvariantCheckResult[] {
  return ALL_INVARIANT_CHECKERS.map((checker) => checker.check(context));
}

/**
 * Check if all invariants passed.
 */
export function allInvariantsPassed(results: readonly InvariantCheckResult[]): boolean {
  return results.every((r) => r.passed);
}
