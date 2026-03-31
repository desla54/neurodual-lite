/**
 * Section - Layout component for grouping content with optional title
 * Nordic design system
 */

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Optional action element (e.g., toggle) displayed next to the title */
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, action, className, children, ...props }: SectionProps): ReactNode {
  return (
    <section className={cn('space-y-3 w-full', className)} {...props}>
      {(title || action) && (
        <div className="flex items-center gap-3 px-2 pl-3 pt-2">
          {title && (
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
