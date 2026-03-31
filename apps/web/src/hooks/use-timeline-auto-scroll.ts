// biome-ignore lint/style/noRestrictedImports: legitimate reactive effects with cleanup (scroll + ResizeObserver)
import { useEffect, useRef } from 'react';

export interface UseTimelineAutoScrollOptions {
  /** The current trial index — triggers re-centering when it changes. */
  readonly trialIndex: number;
  /** External trigger to force re-center (increment to trigger). */
  readonly centerTrigger?: number;
  /** Callback when scroll state changes (true = has horizontal scroll). */
  readonly onHasScrollChange?: (hasScroll: boolean) => void;
}

export interface UseTimelineAutoScrollReturn {
  /** Ref to attach to the outer scrollable container. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to the element that should be centered (e.g. the "present" slot). */
  presentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * useTimelineAutoScroll
 *
 * Handles two concerns shared by PlaceTimeline and DualPickTimeline:
 * 1. Auto-centering on the "present" element when trial/trigger changes.
 * 2. Detecting horizontal overflow via ResizeObserver and notifying the parent.
 */
export function useTimelineAutoScroll({
  trialIndex,
  centerTrigger,
  onHasScrollChange,
}: UseTimelineAutoScrollOptions): UseTimelineAutoScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const presentRef = useRef<HTMLDivElement>(null);

  // Auto-center on mount, trial change, or external trigger
  useEffect(() => {
    if (presentRef.current) {
      presentRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [trialIndex, centerTrigger]);

  // Detect horizontal scroll and notify parent
  useEffect(() => {
    if (!onHasScrollChange || !scrollContainerRef.current) return;

    const checkScroll = () => {
      const el = scrollContainerRef.current;
      if (el) {
        const hasScroll = el.scrollWidth > el.clientWidth;
        onHasScrollChange(hasScroll);
      }
    };

    // Check on mount and when slots change
    checkScroll();

    // Use ResizeObserver to detect size changes
    const observer = new ResizeObserver(checkScroll);
    observer.observe(scrollContainerRef.current);

    return () => observer.disconnect();
  }, [onHasScrollChange, trialIndex]);

  return { scrollContainerRef, presentRef };
}
