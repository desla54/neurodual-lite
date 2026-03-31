/**
 * InfoPopover - Accessible tooltip alternative for mobile/desktop
 * Uses Popover (tap/click) instead of Tooltip (hover only)
 */

import { Info } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { useMountEffect } from '../hooks';

export interface InfoPopoverProps {
  /** Content to display in the popover */
  children: ReactNode;
  /** Optional title for the popover */
  title?: string;
  /** Icon size in pixels */
  iconSize?: number;
  /** Additional class for the trigger button */
  triggerClassName?: string;
  /** Popover alignment */
  align?: 'start' | 'center' | 'end';
  /** Popover side */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function InfoPopover({
  children,
  title,
  iconSize = 14,
  triggerClassName = '',
  align = 'center',
  side = 'top',
}: InfoPopoverProps): ReactNode {
  const { t } = useTranslation();
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [computedSide, setComputedSide] = useState<'top' | 'right' | 'bottom' | 'left'>(side);

  useMountEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 640px)');
    const update = () => setIsSmallViewport(mq.matches);
    update();

    // Safari < 14 fallback
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  });

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      if (isSmallViewport) {
        const nextSide =
          side === 'left' || side === 'right' ? ('bottom' as const) : (side as typeof computedSide);
        setComputedSide((prev) => (prev === nextSide ? prev : nextSide));
        return;
      }
      if (side !== 'left' && side !== 'right') {
        setComputedSide((prev) => (prev === side ? prev : side));
        return;
      }

      const el = triggerRef.current;
      if (!el) {
        setComputedSide((prev) => (prev === side ? prev : side));
        return;
      }

      const rect = el.getBoundingClientRect();
      const safePadding = 16;
      const minSpaceNeeded = 260;
      const availableRight = window.innerWidth - rect.right - safePadding;
      const availableLeft = rect.left - safePadding;

      if (side === 'right') {
        const nextSide =
          availableRight >= minSpaceNeeded
            ? ('right' as const)
            : availableLeft >= minSpaceNeeded
              ? ('left' as const)
              : ('bottom' as const);
        setComputedSide((prev) => (prev === nextSide ? prev : nextSide));
        return;
      }

      const nextSide =
        availableLeft >= minSpaceNeeded
          ? ('left' as const)
          : availableRight >= minSpaceNeeded
            ? ('right' as const)
            : ('bottom' as const);
      setComputedSide((prev) => (prev === nextSide ? prev : nextSide));
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [computedSide, isSmallViewport, side]);

  const effectiveSide = computedSide;
  const effectiveAlign = isSmallViewport ? 'center' : align;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={`inline-flex items-center justify-center p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${triggerClassName}`}
          aria-label={t('aria.moreInfo')}
        >
          <Info size={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={effectiveAlign}
        side={effectiveSide}
        sideOffset={8}
        className="max-w-xs"
      >
        {title && <h4 className="font-bold text-sm text-foreground mb-2">{title}</h4>}
        <div className="text-sm text-muted-foreground leading-relaxed break-words">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
