/**
 * ArithmeticKeypad - Number input keypad for Brain Workshop arithmetic mode
 *
 * A 3x4 numeric keypad for entering arithmetic answers.
 * Displays current input and provides digit, minus, decimal, and clear buttons.
 */

import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

/**
 * Input method types.
 */
type InputMethod = 'mouse' | 'touch';

/**
 * Arithmetic input key types.
 */
export type ArithmeticKey =
  | { kind: 'digit'; digit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
  | { kind: 'minus' }
  | { kind: 'decimal' }
  | { kind: 'reset' };

export interface ArithmeticKeypadProps {
  /** Current input display value */
  display: string;
  /** Whether the keypad is disabled */
  disabled: boolean;
  /** Labels for UI elements */
  labels: {
    answer: string;
    clear: string;
    hint: string;
  };
  /** Dispatch arithmetic input */
  onInput: (key: ArithmeticKey, inputMethod: InputMethod) => void;
  /** Play click sound */
  onPlayClick?: () => void;
}

/**
 * Detect input method from click event.
 */
function getInputMethod(event: ReactMouseEvent<HTMLButtonElement>): InputMethod {
  const nativeEvent = event.nativeEvent as PointerEvent;
  if (nativeEvent.pointerType) {
    return nativeEvent.pointerType === 'touch' ? 'touch' : 'mouse';
  }
  if (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 1024) {
    return 'touch';
  }
  return 'mouse';
}

/**
 * Numeric keypad for Brain Workshop arithmetic mode.
 */
export function ArithmeticKeypad({
  display,
  disabled,
  labels,
  onInput,
  onPlayClick,
}: ArithmeticKeypadProps): ReactNode {
  const handleDigit = (digit: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) => {
    return (e: ReactMouseEvent<HTMLButtonElement>) => {
      onPlayClick?.();
      onInput({ kind: 'digit', digit }, getInputMethod(e));
    };
  };

  const handleZero = (e: ReactMouseEvent<HTMLButtonElement>) => {
    onPlayClick?.();
    onInput({ kind: 'digit', digit: 0 }, getInputMethod(e));
  };

  const handleMinus = (e: ReactMouseEvent<HTMLButtonElement>) => {
    onPlayClick?.();
    onInput({ kind: 'minus' }, getInputMethod(e));
  };

  const handleDecimal = (e: ReactMouseEvent<HTMLButtonElement>) => {
    onPlayClick?.();
    onInput({ kind: 'decimal' }, getInputMethod(e));
  };

  const handleReset = (e: ReactMouseEvent<HTMLButtonElement>) => {
    onPlayClick?.();
    onInput({ kind: 'reset' }, getInputMethod(e));
  };

  const buttonClass =
    'h-12 rounded-xl border border-woven-border bg-woven-cell-rest hover:bg-woven-cell-active active:scale-[0.99] transition-all font-mono font-extrabold text-lg text-woven-text disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="w-full max-w-[360px] px-2">
      <div className="w-full rounded-2xl border border-woven-border bg-woven-surface shadow-sm overflow-hidden">
        {/* Display */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-woven-border">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {labels.answer}
          </div>
          <div className="font-mono font-extrabold tabular-nums text-2xl text-woven-text">
            {display}
          </div>
        </div>

        {/* Keypad */}
        <div className="p-3 grid grid-cols-3 gap-2">
          {/* Row 1: 1, 2, 3 */}
          {[1, 2, 3].map((digit) => (
            <button
              key={`digit-${digit}`}
              type="button"
              disabled={disabled}
              onClick={handleDigit(digit as 1 | 2 | 3)}
              className={buttonClass}
            >
              {digit}
            </button>
          ))}

          {/* Row 2: 4, 5, 6 */}
          {[4, 5, 6].map((digit) => (
            <button
              key={`digit-${digit}`}
              type="button"
              disabled={disabled}
              onClick={handleDigit(digit as 4 | 5 | 6)}
              className={buttonClass}
            >
              {digit}
            </button>
          ))}

          {/* Row 3: 7, 8, 9 */}
          {[7, 8, 9].map((digit) => (
            <button
              key={`digit-${digit}`}
              type="button"
              disabled={disabled}
              onClick={handleDigit(digit as 7 | 8 | 9)}
              className={buttonClass}
            >
              {digit}
            </button>
          ))}

          {/* Row 4: minus, 0, decimal */}
          <button type="button" disabled={disabled} onClick={handleMinus} className={buttonClass}>
            −
          </button>
          <button type="button" disabled={disabled} onClick={handleZero} className={buttonClass}>
            0
          </button>
          <button type="button" disabled={disabled} onClick={handleDecimal} className={buttonClass}>
            .
          </button>

          {/* Clear button spans full width */}
          <button
            type="button"
            disabled={disabled}
            onClick={handleReset}
            className="col-span-3 h-11 rounded-xl border border-woven-border bg-woven-surface hover:bg-woven-cell-active active:scale-[0.99] transition-all text-sm font-bold text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {labels.clear}
          </button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="mt-2 text-4xs text-muted-foreground text-center">{labels.hint}</div>
    </div>
  );
}
