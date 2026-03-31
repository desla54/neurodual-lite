/**
 * FixedYAxis - Standalone Y-axis component for scrollable charts
 *
 * Renders a fixed Y-axis column that stays visible while the chart scrolls.
 * Automatically reduces tick count if too many ticks are provided.
 */

import type { ReactNode } from 'react';

export interface FixedYAxisProps {
  /** Tick values to display */
  readonly ticks: readonly number[];
  /** Height of the axis (should match chart height) */
  readonly height: number;
  /** Optional formatter for tick labels */
  readonly tickFormatter?: (value: number) => string;
  /** Maximum number of ticks to display (default: 4) */
  readonly maxTicks?: number;
}

export function FixedYAxis({
  ticks,
  height,
  tickFormatter,
  maxTicks = 4,
}: FixedYAxisProps): ReactNode {
  // Reduce ticks if too many - keep first, last, and evenly spaced middle ones
  let displayTicks: readonly number[] = ticks;
  if (ticks.length > maxTicks) {
    const step = (ticks.length - 1) / (maxTicks - 1);
    displayTicks = Array.from({ length: maxTicks }, (_, i) => {
      const idx = Math.min(Math.round(i * step), ticks.length - 1);
      return ticks[idx] as number;
    });
  }

  const tickCount = displayTicks.length;
  const paddingTop = 10;
  const paddingBottom = 25; // Space for X-axis labels
  const usableHeight = height - paddingTop - paddingBottom;

  return (
    <div
      style={{ height }}
      className="flex flex-col justify-between text-3xs text-muted-foreground"
    >
      <div style={{ paddingTop, height: usableHeight }} className="flex flex-col justify-between">
        {[...displayTicks].reverse().map((tick, i) => (
          <span
            key={tick}
            className="text-right pr-1"
            style={{
              lineHeight: i === 0 || i === tickCount - 1 ? '1' : 'normal',
            }}
          >
            {tickFormatter ? tickFormatter(tick) : tick}
          </span>
        ))}
      </div>
    </div>
  );
}
