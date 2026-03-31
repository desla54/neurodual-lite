import type { SVGProps } from 'react';
import { cn } from '../lib/utils';

export interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Size in px (maps to width/height). */
  readonly size?: number;
}

/**
 * Sun-style spinner used across the app.
 *
 * Uses currentColor so you can style via `text-*` classes.
 */
export function Spinner({ size = 20, className, ...props }: SpinnerProps) {
  const ariaLabelRaw = props['aria-label'];
  const label =
    ariaLabelRaw !== undefined && ariaLabelRaw !== null && String(ariaLabelRaw).trim().length > 0
      ? String(ariaLabelRaw)
      : null;
  const hasLabel = label !== null;
  const ariaHidden = props['aria-hidden'] ?? (hasLabel ? undefined : true);
  const title = label ?? 'Loading';

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      width={size}
      height={size}
      className={cn('animate-spin', className)}
      aria-hidden={ariaHidden}
      {...props}
    >
      <title>{title}</title>
      <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93" />
    </svg>
  );
}
