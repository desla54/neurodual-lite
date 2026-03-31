import { X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLandscapeAllowanceStore } from '../../orientation/landscape-allowance';
import { ChartFullscreenContext } from './chart-fullscreen-context';

export interface FullscreenChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  closeAriaLabel?: string;
  children: ReactNode;
}

export function FullscreenChartModal({
  open,
  onOpenChange,
  title,
  headerCenter,
  headerRight,
  closeAriaLabel = 'Close',
  children,
}: FullscreenChartModalProps): ReactNode {
  const acquireLandscapeAllowance = useLandscapeAllowanceStore((s) => s.acquire);
  const contentRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);

  useEffect(() => {
    if (!open) return;

    const releaseLandscape = acquireLandscapeAllowance();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      releaseLandscape();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [acquireLandscapeAllowance, onOpenChange, open]);

  // Measure the content area so charts can adapt to the exact available height
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !open) {
      setAvailableHeight(0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setAvailableHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const ctxValue = useMemo(() => ({ isFullscreen: true, availableHeight }), [availableHeight]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] fullscreen-chart-landscape">
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        onKeyDown={(e) => e.key === 'Enter' && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative safe-fullscreen-inset w-full h-full bg-background flex flex-col"
      >
        <div className="flex items-center gap-3 border-b border-border bg-card/85 backdrop-blur px-4 py-2">
          <div className="min-w-0 shrink-0">
            <div className="text-sm font-semibold truncate">{title}</div>
          </div>
          {headerCenter && <div className="flex-1 flex justify-center min-w-0">{headerCenter}</div>}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {headerRight}
            <button
              type="button"
              aria-label={closeAriaLabel}
              onClick={() => onOpenChange(false)}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <ChartFullscreenContext.Provider value={ctxValue}>
          <div ref={contentRef} className="flex-1 overflow-hidden p-3 sm:p-4">
            {children}
          </div>
        </ChartFullscreenContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
