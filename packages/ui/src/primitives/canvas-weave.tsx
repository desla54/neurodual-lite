/**
 * CanvasWeave - Decorative woven texture overlay
 *
 * SVG-based grid pattern that provides a subtle canvas/paper texture.
 * Uses CSS variables for theming.
 */

import { memo, type ReactNode } from 'react';
import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface CanvasWeaveProps {
  /** Number of grid lines (both horizontal and vertical) */
  lineCount?: number;
  /** Border radius preset */
  rounded?: 'full' | '2xl' | 'xl' | 'lg' | 'md' | 'none';
  /** Override opacity (0-1), uses CSS variable by default */
  opacity?: number;
  /** Additional class name */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export const CanvasWeave = memo(function CanvasWeave({
  lineCount = 15,
  rounded = '2xl',
  opacity,
  className,
}: CanvasWeaveProps): ReactNode {
  const roundedClass = {
    full: 'rounded-full',
    '2xl': 'rounded-2xl',
    xl: 'rounded-xl',
    lg: 'rounded-lg',
    md: 'rounded-md',
    none: '',
  }[rounded];

  const opacityStyle = opacity !== undefined ? opacity : 'var(--woven-weave-opacity)';

  return (
    <svg
      data-canvas-weave="true"
      className={cn(
        'absolute inset-0 w-full h-full pointer-events-none z-0 stroke-woven-weave',
        roundedClass,
        className,
      )}
      aria-hidden="true"
    >
      {/* Horizontal lines */}
      {Array.from({ length: lineCount + 1 }).map((_, i) => (
        <line
          key={`h-${i}`}
          x1="0%"
          y1={`${(i / lineCount) * 100}%`}
          x2="100%"
          y2={`${(i / lineCount) * 100}%`}
          strokeWidth={0.5}
          style={{ opacity: opacityStyle }}
        />
      ))}
      {/* Vertical lines */}
      {Array.from({ length: lineCount + 1 }).map((_, i) => (
        <line
          key={`v-${i}`}
          x1={`${(i / lineCount) * 100}%`}
          y1="0%"
          x2={`${(i / lineCount) * 100}%`}
          y2="100%"
          strokeWidth={0.5}
          style={{ opacity: opacityStyle }}
        />
      ))}
    </svg>
  );
});
