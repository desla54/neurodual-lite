/**
 * Pressable — Universal touch feedback wrapper.
 *
 * Adds native-feeling press feedback (scale + opacity) to any tappable element.
 * Uses pointer events + CSS class toggle instead of :active (which is unreliable on iOS WebKit).
 *
 * Usage:
 * ```tsx
 * <Pressable><Card>...</Card></Pressable>
 * <Pressable as="button" onClick={...}>Tap me</Pressable>
 * ```
 */

import { useRef, useCallback, type ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface PressableProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Disable the press feedback */
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  /** Additional props spread on the div */
  readonly [key: string]: unknown;
}

// CSS class applied on pointer down, removed on pointer up/leave/cancel.
const PRESSED_CLASS = 'pressable--pressed';

export function Pressable({
  children,
  className,
  disabled = false,
  onClick,
  ...rest
}: PressableProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onPointerDown = useCallback(() => {
    if (disabled) return;
    ref.current?.classList.add(PRESSED_CLASS);
  }, [disabled]);

  const clearPressed = useCallback(() => {
    ref.current?.classList.remove(PRESSED_CLASS);
  }, []);

  return (
    <div
      ref={ref}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn('pressable', disabled && 'pressable--disabled', className)}
      onPointerDown={onPointerDown}
      onPointerUp={clearPressed}
      onPointerLeave={clearPressed}
      onPointerCancel={clearPressed}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {children}
    </div>
  );
}
