/**
 * DrawerSheet - Centralized responsive drawer component
 * Mobile: slides from bottom with pill handle
 * Desktop: floating island from top (like iOS Bluetooth notification)
 * Swipe on overlay dismisses like native iOS/Android notifications.
 */

import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { useDrawerDirection } from './use-drawer-direction';

export interface DrawerSheetProps {
  /** The trigger element (rendered via Drawer.Trigger asChild) */
  trigger: ReactNode;
  /** Optional visible title */
  title?: ReactNode;
  /** Screen-reader-only title when no visible title */
  srTitle?: string;
  /** Sheet content */
  children: ReactNode;
}

/** Minimum px distance to count as a swipe (not a tap) */
const SWIPE_THRESHOLD = 40;

export function DrawerSheet({ trigger, title, srTitle, children }: DrawerSheetProps): ReactNode {
  const direction = useDrawerDirection();
  const isTop = direction === 'top';
  const [open, setOpen] = useState(false);

  // Track touch start position on overlay for swipe-to-dismiss
  const touchStart = useRef<{ y: number } | null>(null);

  const onOverlayTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) touchStart.current = { y: touch.clientY };
  }, []);

  const onOverlayTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const deltaY = touch.clientY - touchStart.current.y;
      touchStart.current = null;
      // bottom drawer: swipe down dismisses; top drawer: swipe up dismisses
      const shouldDismiss = isTop ? deltaY < -SWIPE_THRESHOLD : deltaY > SWIPE_THRESHOLD;
      if (shouldDismiss) {
        setOpen(false);
      }
    },
    [isTop],
  );

  return (
    <Drawer.Root direction={direction} open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 bg-black/25 z-50"
          onTouchStart={onOverlayTouchStart}
          onTouchEnd={onOverlayTouchEnd}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={
            !isTop ? { bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' } : undefined
          }
          className={`fixed z-50 mx-auto flex max-w-lg flex-col rounded-2xl border border-white/15 bg-card shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] outline-none [&::after]:!hidden ${
            isTop ? 'top-3 left-3 right-3' : 'left-3 right-3'
          }`}
        >
          {!isTop && <Drawer.Handle className="mt-2 mb-1" />}
          <div className="px-5 pb-5 pt-3 max-h-[60vh]">
            {title && (
              <Drawer.Title className="font-bold text-base text-foreground mb-3">
                {title}
              </Drawer.Title>
            )}
            {!title && srTitle && <Drawer.Title className="sr-only">{srTitle}</Drawer.Title>}
            {children}
          </div>
          {isTop && <Drawer.Handle className="mb-2 mt-1" />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
