/**
 * Tabs - Radix UI based tabs component
 * Woven Ink design with hatched border texture
 */

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';
import { useMountEffect } from '../hooks';

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-12 items-center rounded-2xl bg-surface p-1.5 text-muted-foreground border border-border/50',
      'w-full overflow-x-auto scrollbar-hide',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const innerRef = useRef<HTMLButtonElement>(null);
  const setComposedRef = useCallback(
    (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Scroll into view when tab becomes active
  useMountEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-state') {
          const isActive = element.getAttribute('data-state') === 'active';
          if (isActive) {
            const tabList = element.closest<HTMLElement>('[role="tablist"]');
            const canOverflow = tabList !== null && tabList.scrollWidth - tabList.clientWidth > 1;
            if (canOverflow) {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
          }
        }
      }
    });

    observer.observe(element, { attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  });

  return (
    <TabsPrimitive.Trigger
      ref={setComposedRef}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
        'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/80',
        'flex-1 min-w-fit',
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'animate-in fade-in-50 slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
