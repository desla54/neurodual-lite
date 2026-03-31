/**
 * ArithmeticDisplay - shows arithmetic problems for the arithmetic N-back modality.
 *
 * The user tracks the ANSWER (0-12), not the problem expression.
 * The problem is displayed as "3 + 4 = ?" during stimulus presentation.
 *
 * Design: Woven Ink aesthetic, matches Grid component styling.
 */

import type { ReactNode } from 'react';
import type { ArithmeticOperator, ArithmeticProblem } from '@neurodual/logic';
import { cn } from '../lib/utils';

export interface ArithmeticDisplayProps {
  /** The arithmetic problem to display */
  readonly problem: ArithmeticProblem | null;
  /** Whether to show the problem (during stimulus presentation) */
  readonly visible?: boolean;
  /** Additional className for positioning */
  readonly className?: string;
  /** Size variant */
  readonly size?: 'sm' | 'md' | 'lg';
  /** Transition duration in ms (matches Grid transitionDurationMs) */
  readonly transitionDurationMs?: 75 | 100 | 150 | 200;
}

/**
 * Formats an arithmetic operator for display.
 * Uses mathematical symbols (×, −, ÷) for better readability.
 */
function formatOperator(operator: ArithmeticOperator): string {
  switch (operator) {
    case '+':
      return '+';
    case '-':
      return '−'; // Unicode minus sign
    case '*':
      return '×'; // Unicode multiplication sign
    case '/':
      return '÷'; // Unicode division sign
    default:
      return operator;
  }
}

/**
 * ArithmeticDisplay component.
 *
 * Shows arithmetic problems like "3 + 4 = ?" during N-back trials.
 * The user must remember the ANSWER and detect when it matches the n-back answer.
 */
export function ArithmeticDisplay({
  problem,
  visible = true,
  className,
  size = 'md',
  transitionDurationMs = 200,
}: ArithmeticDisplayProps): ReactNode {
  const sizeClasses = {
    sm: 'text-2xl sm:text-3xl',
    md: 'text-3xl sm:text-4xl md:text-5xl',
    lg: 'text-4xl sm:text-5xl md:text-6xl',
  };

  const containerSizeClasses = {
    sm: 'min-h-[60px] px-4 py-3',
    md: 'min-h-[80px] px-6 py-4',
    lg: 'min-h-[100px] px-8 py-5',
  };

  if (!problem) {
    return null;
  }

  return (
    <div
      data-capture-surface="game-card"
      className={cn(
        'relative flex items-center justify-center',
        'bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm rounded-2xl',
        'transition-all',
        containerSizeClasses[size],
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
        className,
      )}
      style={{
        transitionDuration: `${transitionDurationMs}ms`,
      }}
      role="img"
      aria-label={`${problem.operand1} ${problem.operator} ${problem.operand2} equals question mark`}
    >
      <span
        className={cn('font-mono font-bold tracking-wider', 'text-woven-text', sizeClasses[size])}
      >
        <span className="tabular-nums">{problem.operand1}</span>
        <span className="mx-2 sm:mx-3 text-woven-text-muted">
          {formatOperator(problem.operator)}
        </span>
        <span className="tabular-nums">{problem.operand2}</span>
        <span className="mx-2 sm:mx-3 text-woven-text-muted">=</span>
        <span className="text-primary font-extrabold">?</span>
      </span>
    </div>
  );
}

/**
 * Compact arithmetic display for use in timelines or history views.
 * Shows only the problem without decorative container.
 */
export function ArithmeticProblemText({
  problem,
  className,
  showAnswer = false,
}: {
  problem: ArithmeticProblem;
  className?: string;
  showAnswer?: boolean;
}): ReactNode {
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {problem.operand1} {formatOperator(problem.operator)} {problem.operand2}
      {showAnswer ? ` = ${problem.answer}` : ' = ?'}
    </span>
  );
}
