/**
 * Button primitive component.
 */

import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly type?: 'button' | 'submit' | 'reset';
  /** Native tooltip text */
  readonly title?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Primary = Bouton principal unique (Jouer) - Utilise la couleur primary du thème
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 shadow-md hover:shadow-lg',
  // Secondary = Boutons importants - Contour ink (noir réservé aux états actifs)
  secondary:
    'bg-transparent text-foreground border-2 border-foreground hover:bg-foreground/10 active:bg-foreground/20',
  // Ghost = Actions mineures
  ghost: 'bg-transparent text-muted-foreground hover:bg-secondary active:bg-secondary/80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  title,
}: ButtonProps): ReactNode {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
    >
      {children}
    </button>
  );
}
