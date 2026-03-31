/**
 * NumericKeypad - Shared responsive numeric input for game modes
 *
 * Digit Span-style keypad: 3×3 grid of digits 1-9 + bottom row (action, 0, submit).
 * Uses onPointerDown for immediate touch response.
 * Full-width rounded buttons sized for comfortable thumb tapping on mobile.
 */

import type { ReactNode } from 'react';
import { cn } from '@neurodual/ui';

export interface NumericKeypadProps {
  /** Called when a digit (0-9) is pressed */
  onDigit: (digit: number) => void;
  /** Called when the bottom-left action button is pressed (delete/clear) */
  onAction: () => void;
  /** Called when the submit (OK) button is pressed */
  onSubmit: () => void;
  /** Whether the submit button is enabled */
  submitEnabled: boolean;
  /** Whether the entire keypad is disabled */
  disabled?: boolean;
  /** Label for bottom-left action button (default: "DEL") */
  actionLabel?: string;
  /** Label for submit button (default: "OK") */
  submitLabel?: string;
}

const DIGIT_CLASS =
  'min-h-[3.2rem] sm:min-h-[3.5rem] rounded-2xl bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border border-woven-border/60 shadow-sm text-2xl font-bold tabular-nums text-woven-text active:brightness-90 transition-transform touch-manipulation select-none';

const ACTION_CLASS =
  'min-h-[3.2rem] sm:min-h-[3.5rem] rounded-2xl bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border border-woven-border/60 shadow-sm text-sm font-bold text-woven-text-muted active:brightness-90 transition-transform touch-manipulation select-none';

export function NumericKeypad({
  onDigit,
  onAction,
  onSubmit,
  submitEnabled,
  disabled = false,
  actionLabel = 'DEL',
  submitLabel = 'OK',
}: NumericKeypadProps): ReactNode {
  return (
    <div className="w-full max-w-[22rem] sm:max-w-[24rem] space-y-3 px-2">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onDigit(d);
            }}
            disabled={disabled}
            className={DIGIT_CLASS}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            if (!disabled) onAction();
          }}
          disabled={disabled}
          className={ACTION_CLASS}
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            if (!disabled) onDigit(0);
          }}
          disabled={disabled}
          className={DIGIT_CLASS}
        >
          0
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            if (!submitEnabled || disabled) return;
            e.preventDefault();
            onSubmit();
          }}
          disabled={!submitEnabled || disabled}
          className={cn(
            'min-h-[3.2rem] sm:min-h-[3.5rem] rounded-2xl border text-sm font-bold active:scale-95 transition-transform touch-manipulation select-none',
            submitEnabled && !disabled
              ? 'bg-primary border-primary text-primary-foreground shadow-sm'
              : 'bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border-woven-border/60 text-woven-text-muted opacity-50',
          )}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
