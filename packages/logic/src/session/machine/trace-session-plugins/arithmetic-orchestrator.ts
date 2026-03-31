/**
 * ArithmeticOrchestrator
 *
 * Manages the arithmetic interference phase for Dual Trace mode.
 * Inserts between stimulus and rule reveal to occupy the phonological loop,
 * preventing position chunking and forcing deeper spatial encoding.
 *
 * PRINCIPLES:
 * - Data out: returns config and results, not side effects
 * - Spec-driven: reads config from spec.extensions.arithmeticInterference
 * - Pure functions: no mutations, no I/O
 *
 * KEY BEHAVIOR:
 * - Wrong answer = trial rejected (counted as incorrect)
 * - No answer (timeout) = trial rejected
 * - Must get correct answer to proceed to rule reveal
 */

import type { TraceSpec } from '../../../specs/trace.spec';
import type { ArithmeticOrchestrator, ArithmeticResult, TraceArithmeticProblem } from './types';
import {
  generateInterferenceArithmetic,
  generateInterferenceArithmeticFromSeed,
  type InterferenceArithmeticConfig,
} from '../../../domain/generator/helpers/interference-arithmetic';

// =============================================================================
// Factory
// =============================================================================

export interface ArithmeticOrchestratorConfig {
  readonly spec: TraceSpec;
  /** Random number generator (injectable for testing) */
  readonly random?: () => number;
}

/**
 * Creates an ArithmeticOrchestrator.
 *
 * The orchestrator generates arithmetic problems and validates answers.
 * Problems are chains of 4+ additions/subtractions with results constrained to 0-20.
 */
export function createArithmeticOrchestrator(
  config: ArithmeticOrchestratorConfig,
): ArithmeticOrchestrator {
  const { spec, random = Math.random } = config;
  const arithmeticConfig = spec.extensions.arithmeticInterference;
  const enabled = arithmeticConfig.enabled;
  const variant = arithmeticConfig.variant ?? 'simple';
  const timeoutMs = arithmeticConfig.timeoutMs;
  const cueDisplayMs = arithmeticConfig.cueDisplayMs ?? 1000;

  // Build config for the generator
  const generatorConfig: InterferenceArithmeticConfig = {
    minOperations: arithmeticConfig.minOperations,
    maxOperations: arithmeticConfig.maxOperations,
    minResult: arithmeticConfig.minResult,
    maxResult: arithmeticConfig.maxResult,
    maxDigit: arithmeticConfig.maxDigit,
  };

  function isEnabled(): boolean {
    return enabled;
  }

  function needsArithmeticPhase(_trialIndex: number, isWarmup: boolean): boolean {
    // No arithmetic during warmup
    if (isWarmup) return false;
    // Only if enabled
    return enabled;
  }

  function generateProblem(input?: {
    readonly stimulusPosition?: number | null;
    readonly previousStimulusPosition?: number | null;
  }): TraceArithmeticProblem {
    if (variant === 'color-cue-2step') {
      return generateColorCue2StepProblem({
        maxDigit: generatorConfig.maxDigit,
        minResult: generatorConfig.minResult,
        maxResult: generatorConfig.maxResult,
        cueDisplayMs,
        random,
      });
    }

    if (variant === 'grid-cue-chain') {
      const stimulusPosition = input?.stimulusPosition ?? null;
      const previousStimulusPosition = input?.previousStimulusPosition ?? null;
      return generateGridCueChainProblem({
        stimulusPosition,
        previousStimulusPosition,
        gridMode: spec.extensions.dyslatéralisation?.gridMode ?? '3x3',
        config: generatorConfig,
        cueDisplayMs,
        random,
      });
    }

    const problem = generateInterferenceArithmetic(generatorConfig, random);
    return {
      variant: 'simple',
      expression: problem.expression,
      answer: problem.answer,
    };
  }

  function getTimeoutMs(): number {
    return timeoutMs;
  }

  function createTimeoutResult(expression: string, correctAnswer: number): ArithmeticResult {
    return {
      expression,
      correctAnswer,
      userAnswer: null,
      isCorrect: false,
      confidence: 0,
      writingTimeMs: timeoutMs,
      timedOut: true,
    };
  }

  function validateAnswer(
    expression: string,
    correctAnswer: number,
    userAnswer: number,
    confidence: number,
    writingTimeMs: number,
  ): ArithmeticResult {
    const isCorrect = userAnswer === correctAnswer;

    return {
      expression,
      correctAnswer,
      userAnswer,
      isCorrect,
      confidence,
      writingTimeMs,
      timedOut: false,
    };
  }

  return {
    isEnabled,
    needsArithmeticPhase,
    generateProblem,
    getTimeoutMs,
    createTimeoutResult,
    validateAnswer,
  };
}

// =============================================================================
// Variant: Grid Cue Chain (V/N + chain, digits from last stimulus position)
// =============================================================================

function getGridPositionsCount(gridMode: '3x3' | '3x4' | '4x3' | '4x4'): number {
  if (gridMode === '4x4') return 16;
  if (gridMode === '3x4' || gridMode === '4x3') return 12;
  // 3x3 trace grid excludes the center: 8 positions.
  return 8;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function buildExpressionWithToken(
  token: 'V' | 'N',
  terms: readonly { readonly operator: '+' | '-' | null; readonly value: number }[],
): string {
  const parts: string[] = [];
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (!term) continue;
    if (term.operator === null) {
      parts.push(token);
    } else {
      parts.push(term.operator);
      parts.push(String(term.value));
    }
  }
  return parts.join(' ');
}

function generateGridCueChainProblem(input: {
  readonly stimulusPosition: number | null;
  readonly previousStimulusPosition: number | null;
  readonly gridMode: '3x3' | '3x4' | '4x3' | '4x4';
  readonly config: InterferenceArithmeticConfig;
  readonly cueDisplayMs: number;
  readonly random: () => number;
}): TraceArithmeticProblem {
  const { stimulusPosition, previousStimulusPosition, gridMode, config, cueDisplayMs, random } =
    input;

  const gridCount = getGridPositionsCount(gridMode);
  const pos =
    typeof stimulusPosition === 'number'
      ? clampInt(stimulusPosition, 0, Math.max(0, gridCount - 1))
      : null;
  const prevPos =
    typeof previousStimulusPosition === 'number'
      ? clampInt(previousStimulusPosition, 0, Math.max(0, gridCount - 1))
      : null;

  // If we cannot link to the grid (should be rare), fallback to classic arithmetic.
  if (pos === null) {
    const fallback = generateInterferenceArithmetic(config, random);
    return { variant: 'simple', expression: fallback.expression, answer: fallback.answer };
  }

  // Both digits use the SAME encoding: top-left = 1 ... bottom-right = N.
  // Digit sources:
  // - lastDigit: current stimulus (this trial)
  // - prevDigit: previous stimulus (trialIndex - 1). If missing, reuse lastDigit.
  const lastDigit = pos + 1;
  const prevDigit = (prevPos ?? pos) + 1;

  // Randomly assign which of (last / previous) gets the green token.
  const greenIsLast = random() < 0.5;
  const vDigit = greenIsLast ? lastDigit : prevDigit;
  const nDigit = greenIsLast ? prevDigit : lastDigit;

  // Randomize left/right placement so side doesn't map to color.
  const leftIsV = random() < 0.5;
  const cue = leftIsV
    ? { leftDigit: vDigit, rightDigit: nDigit, leftToken: 'V' as const, rightToken: 'N' as const }
    : { leftDigit: nDigit, rightDigit: vDigit, leftToken: 'N' as const, rightToken: 'V' as const };

  // Randomly choose whether the chain uses the green (V) or black (N) digit.
  const token: 'V' | 'N' = random() < 0.5 ? 'V' : 'N';
  const seed = token === 'V' ? vDigit : nDigit;

  const chain = generateInterferenceArithmeticFromSeed(seed, config, random);
  return {
    variant: 'grid-cue-chain',
    expression: buildExpressionWithToken(token, chain.terms),
    answer: chain.answer,
    cue,
    cueDisplayMs,
  };
}

// =============================================================================
// Variant: Color Cue (2-step)
// =============================================================================

function pickDigit(maxDigit: number, random: () => number): number {
  return Math.floor(random() * (maxDigit + 1));
}

function pickOp(random: () => number): '+' | '-' {
  return random() < 0.5 ? '+' : '-';
}

function eval2(a: number, op: '+' | '-', b: number): number {
  return op === '+' ? a + b : a - b;
}

function generateColorCue2StepProblem(input: {
  readonly maxDigit: number;
  readonly minResult: number;
  readonly maxResult: number;
  readonly cueDisplayMs: number;
  readonly random: () => number;
}): TraceArithmeticProblem {
  const { maxDigit, minResult, maxResult, cueDisplayMs, random } = input;

  // Retry a bunch of times to satisfy result bounds.
  for (let attempt = 0; attempt < 200; attempt++) {
    const vDigit = pickDigit(maxDigit, random);
    const nDigit = pickDigit(maxDigit, random);

    // Randomize left/right so the player cannot associate side with color.
    const leftIsV = random() < 0.5;
    const cue = leftIsV
      ? { leftDigit: vDigit, rightDigit: nDigit, leftToken: 'V' as const, rightToken: 'N' as const }
      : {
          leftDigit: nDigit,
          rightDigit: vDigit,
          leftToken: 'N' as const,
          rightToken: 'V' as const,
        };

    // Choose which token is used in the expression.
    const token: 'V' | 'N' = random() < 0.5 ? 'V' : 'N';
    const tokenDigit = token === 'V' ? vDigit : nDigit;

    // Build a 2-term expression with 1 operation.
    // Keeps the cue/mapping challenge (V or N) but reduces arithmetic load.
    const otherDigit = pickDigit(maxDigit, random);
    const op = pickOp(random);
    const tokenIsLeft = random() < 0.5;

    const leftTerm = tokenIsLeft ? token : String(otherDigit);
    const rightTerm = tokenIsLeft ? String(otherDigit) : token;

    const leftValue = tokenIsLeft ? tokenDigit : otherDigit;
    const rightValue = tokenIsLeft ? otherDigit : tokenDigit;

    const answer = eval2(leftValue, op, rightValue);
    if (answer < minResult || answer > maxResult) continue;

    const expression = `${leftTerm} ${op} ${rightTerm}`;

    return {
      variant: 'color-cue-2step',
      expression,
      answer,
      cue,
      cueDisplayMs,
    };
  }

  // Fallback - should be extremely rare.
  return {
    variant: 'color-cue-2step',
    expression: `V + 0`,
    answer: 0,
    cue: { leftDigit: 0, rightDigit: 0, leftToken: 'V', rightToken: 'N' },
    cueDisplayMs,
  };
}

/**
 * Creates a no-op ArithmeticOrchestrator for when interference is disabled.
 * Always returns false for needsArithmeticPhase.
 */
export function createNoopArithmeticOrchestrator(): ArithmeticOrchestrator {
  return {
    isEnabled: () => false,
    needsArithmeticPhase: () => false,
    generateProblem: () => ({ variant: 'simple', expression: '0', answer: 0 }),
    getTimeoutMs: () => 0,
    createTimeoutResult: (expression, correctAnswer) => ({
      expression,
      correctAnswer,
      userAnswer: null,
      isCorrect: false,
      confidence: 0,
      writingTimeMs: 0,
      timedOut: true,
    }),
    validateAnswer: (expression, correctAnswer, userAnswer, confidence, writingTimeMs) => ({
      expression,
      correctAnswer,
      userAnswer,
      isCorrect: userAnswer === correctAnswer,
      confidence,
      writingTimeMs,
      timedOut: false,
    }),
  };
}
