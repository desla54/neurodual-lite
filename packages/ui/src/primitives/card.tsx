/**
 * Card primitive components.
 * Uses centralized glass tokens from ./glass.ts
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { GLASS_CARD, GLASS_LIGHT } from './glass';

export interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly padding?: 'none' | 'sm' | 'md' | 'lg';
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}

const paddingClasses: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children,
  className = '',
  padding = 'md',
  onClick,
  disabled,
}: CardProps): ReactNode {
  const pressRef = useRef<HTMLDivElement>(null);
  const isInteractive = Boolean(onClick);

  const onPointerDown = useCallback(() => {
    if (!isInteractive || disabled) return;
    pressRef.current?.classList.add('pressable--pressed');
  }, [isInteractive, disabled]);

  const clearPressed = useCallback(() => {
    pressRef.current?.classList.remove('pressable--pressed');
  }, []);

  return (
    <div
      ref={pressRef}
      className={`${GLASS_CARD} ${paddingClasses[padding]} ${padding === 'none' ? 'overflow-hidden' : ''} ${isInteractive ? 'pressable' : ''} ${disabled ? 'pressable--disabled' : ''} ${className}`}
      onPointerDown={isInteractive ? onPointerDown : undefined}
      onPointerUp={isInteractive ? clearPressed : undefined}
      onPointerLeave={isInteractive ? clearPressed : undefined}
      onPointerCancel={isInteractive ? clearPressed : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * SubCard - A subtle nested card for grouping related content within a Card.
 * Uses GLASS_LIGHT for a lighter, less prominent appearance.
 */
export interface SubCardProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function SubCard({ children, className = '' }: SubCardProps): ReactNode {
  return <div className={`py-3 px-4 ${GLASS_LIGHT} ${className}`}>{children}</div>;
}
