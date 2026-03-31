/**
 * SuspenseFade — Crossfade from skeleton to content.
 *
 * Wraps React.Suspense to provide a smooth opacity transition
 * instead of an instant swap from fallback to content.
 *
 * Usage:
 * ```tsx
 * <SuspenseFade fallback={<Skeleton />}>
 *   <LazyComponent />
 * </SuspenseFade>
 * ```
 */

import { Suspense, useState, type ReactNode } from 'react';
import { useMountEffect } from '@neurodual/ui';

interface SuspenseFadeProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  /** Fade duration in ms (default: 300) */
  readonly duration?: number;
}

function FadeIn({ children, duration }: { children: ReactNode; duration: number }) {
  const [visible, setVisible] = useState(false);

  useMountEffect(() => {
    // Trigger fade-in on next frame so the initial opacity:0 is painted first
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  });

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

export function SuspenseFade({ children, fallback, duration = 300 }: SuspenseFadeProps) {
  return (
    <Suspense fallback={fallback}>
      <FadeIn duration={duration}>{children}</FadeIn>
    </Suspense>
  );
}
