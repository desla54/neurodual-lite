/**
 * Hatching → Minimal line separator
 *
 * Replaced SVG hatching patterns with clean, minimal lines.
 * Supports horizontal (section divider) and vertical (frame edge) orientations.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface HatchingProps {
  /** Pattern ID (kept for API compat, unused) */
  id?: string;
  /** Orientation of the separator */
  orientation?: 'horizontal' | 'vertical';
  /** Size of the separator (height for horizontal, width for vertical) */
  size?: number;
  /** Additional class name */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function Hatching({
  orientation = 'horizontal',
  size,
  className,
}: HatchingProps): ReactNode {
  if (orientation === 'vertical') {
    const width = size ?? 1;
    return (
      <div
        className={cn('self-stretch bg-current opacity-[0.12]', className)}
        style={{ width }}
        aria-hidden="true"
      />
    );
  }

  const height = size ?? 1;
  return (
    <div
      className={cn('w-full bg-current opacity-[0.12]', className)}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
