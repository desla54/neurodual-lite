/**
 * GsapTimeline - Pure GSAP-controlled Timeline
 *
 * This component renders a timeline where GSAP owns all animations.
 * React only renders the initial structure - GSAP handles:
 * - Card content updates (via DOM manipulation)
 * - Card position animations
 * - Entry/exit animations
 *
 * NO React state is used for card positions or content.
 */

import gsap from 'gsap';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { cn } from '../lib/utils';
import type { TimelineItem } from './types';
import { useMountEffect } from '../hooks';

/** Set the compare symbol on a DOM element.
 *  Uses CSS for "≠" to avoid cross-browser glyph inconsistencies. */
function setCompareSymbol(el: HTMLElement, isMatch: boolean): void {
  if (isMatch) {
    el.textContent = '=';
  } else {
    el.innerHTML =
      '<span style="position:relative;display:inline-block">=<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:0.1em;height:0.8em;background:currentColor;transform:rotate(30deg);border-radius:1px"></span></span></span>';
  }
}

const killPatchedSymbol = Symbol('ndGsapTimelineKillPatched');

// =============================================================================
// GSAP PERFORMANCE CONFIG (ensure 60FPS)
// =============================================================================

// Default lag smoothing is better for performance (prevents jumps)
// gsap.ticker.lagSmoothing(0);

// =============================================================================
// CONSTANTS
// =============================================================================

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

/**
 * Create mini-grid DOM structure safely (no innerHTML)
 * Used for tutorial timeline position cards
 */
function createMiniGridElement(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className =
    'mini-grid-wrapper bg-woven-surface rounded-lg shadow-sm w-9 h-9 p-1 flex items-center justify-center';

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-[1px]';
  grid.style.width = '28px';
  grid.style.height = '28px';

  for (const logicPos of GRID_MAP) {
    const cell = document.createElement('div');
    if (logicPos === null) {
      // Center cell with cross
      cell.className = 'relative flex items-center justify-center';
      const hLine = document.createElement('div');
      hLine.className = 'absolute w-1/2 h-[1px] bg-woven-text-muted/40';
      const vLine = document.createElement('div');
      vLine.className = 'absolute h-1/2 w-[1px] bg-woven-text-muted/40';
      cell.appendChild(hLine);
      cell.appendChild(vLine);
    } else {
      cell.setAttribute('data-pos', String(logicPos));
      cell.className = 'rounded-[2px] bg-woven-cell-rest';
    }
    grid.appendChild(cell);
  }

  wrapper.appendChild(grid);
  return wrapper;
}

// =============================================================================
// TYPES
// =============================================================================

export interface GsapTimelineHandle {
  /** Add a new item to the N slot with animation */
  addItem: (item: TimelineItem, onComplete: () => void) => void;
  /** Shift items: N→N-1, N-1→N-2, N-2→exit. Optional timeScale (1 = normal, <1 = slower, >1 = faster) */
  reorganize: (onComplete: () => void, timeScale?: number) => void;
  /** Show comparison: cards N and N-2 slide toward center with symbols. Optional timeScale */
  showCompare: (
    matchPos: boolean,
    matchAudio: boolean,
    onComplete: () => void,
    timeScale?: number,
  ) => void;
  /** Hide comparison: reset cards to original positions. Optional timeScale */
  hideCompare: (onComplete: () => void, timeScale?: number) => void;
  /** Get slot refs for external animations (compare, etc.) */
  getSlotRefs: () => {
    posN: HTMLDivElement | null;
    posN1: HTMLDivElement | null;
    posN2: HTMLDivElement | null;
    audioN: HTMLDivElement | null;
    audioN1: HTMLDivElement | null;
    audioN2: HTMLDivElement | null;
  };
  /** Get current items for comparison logic */
  getItems: () => { n: TimelineItem | null; n1: TimelineItem | null; n2: TimelineItem | null };
  /** Kill all active animations */
  killAll: () => void;
  /** Prefill timeline slots for recovery (no animation) */
  prefill: (items: {
    n?: TimelineItem | null;
    n1?: TimelineItem | null;
    n2?: TimelineItem | null;
  }) => void;
}

/**
 * Translation function type compatible with i18next TFunction.
 * Uses intersection of overloads to accept both (key) and (key, defaultValue) calls.
 */
interface TranslationFn {
  (key: string): string;
  (key: string, defaultValue: string): string;
}

interface GsapTimelineProps {
  className?: string;
  opacity?: number;
  /** i18next translation function */
  t: TranslationFn;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const GsapTimeline = forwardRef<GsapTimelineHandle, GsapTimelineProps>(function GsapTimeline(
  { className, opacity = 1, t },
  ref,
) {
  // Card refs - these are the actual moving elements
  const posCardRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const audioCardRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // Slot refs - fixed position markers
  const posSlotRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const audioSlotRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // Content refs - for updating card content
  const posContentRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const audioContentRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  // Items storage (not React state - just refs)
  const itemsRef = useRef<(TimelineItem | null)[]>([null, null, null]); // [N, N-1, N-2]

  // Symbol refs for comparison (now as overlay)
  const posSymbolRef = useRef<HTMLDivElement>(null);
  const audioSymbolRef = useRef<HTMLDivElement>(null);

  // Timeline container refs (for positioning symbols)
  const posTimelineContainerRef = useRef<HTMLDivElement>(null);
  const audioTimelineContainerRef = useRef<HTMLDivElement>(null);

  // N-1 wrapper refs (the entire N-1 column that should hide)
  const posN1WrapperRef = useRef<HTMLDivElement>(null);
  const audioN1WrapperRef = useRef<HTMLDivElement>(null);

  // "Passé" frame (visual only; animated without layout changes)
  const posPasseFrameHostRef = useRef<HTMLDivElement>(null);
  const audioPasseFrameHostRef = useRef<HTMLDivElement>(null);
  const posPasseFrameRef = useRef<HTMLDivElement>(null);
  const audioPasseFrameRef = useRef<HTMLDivElement>(null);
  const posN2ColRef = useRef<HTMLDivElement>(null);
  const audioN2ColRef = useRef<HTMLDivElement>(null);

  // Label refs for comparison animation (labels move with cards)
  const posLabelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]); // N, N-1, N-2
  const audioLabelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  // Group label refs (Passé, Présent)
  const posPasseGroupRef = useRef<HTMLDivElement>(null);
  const posPresentGroupRef = useRef<HTMLDivElement>(null);
  const audioPasseGroupRef = useRef<HTMLDivElement>(null);
  const audioPresentGroupRef = useRef<HTMLDivElement>(null);

  // "Passé" title ref (to recenter on N-2 when N-1 hides)
  const posPasseTitleRef = useRef<HTMLDivElement>(null);

  // NOTE: Do not change layout metrics during compare animations.
  // The compare symbol positioning relies on stable DOM geometry.

  const activeTimelines = useRef<gsap.core.Timeline[]>([]);

  const trackTimeline = (timeline: gsap.core.Timeline) => {
    activeTimelines.current.push(timeline);

    const untrack = () => {
      const list = activeTimelines.current;
      const idx = list.indexOf(timeline);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    };

    const previousOnComplete = timeline.eventCallback('onComplete') as (() => void) | null;
    const previousOnInterrupt = timeline.eventCallback('onInterrupt') as (() => void) | null;

    timeline.eventCallback('onComplete', () => {
      untrack();
      previousOnComplete?.();
    });

    timeline.eventCallback('onInterrupt', () => {
      untrack();
      previousOnInterrupt?.();
    });

    const typedTimeline = timeline as unknown as Record<string | symbol, unknown> & {
      kill: (...args: unknown[]) => gsap.core.Timeline;
    };
    if (!typedTimeline[killPatchedSymbol]) {
      typedTimeline[killPatchedSymbol] = true;
      const originalKill = typedTimeline.kill.bind(timeline);
      typedTimeline.kill = (...args: unknown[]) => {
        untrack();
        return originalKill(...args);
      };
    }
  };

  const slotDistanceCacheRef = useRef<{
    pos01: number;
    pos12: number;
    audio01: number;
    audio12: number;
    valid: boolean;
  }>({ pos01: 0, pos12: 0, audio01: 0, audio12: 0, valid: false });

  const getSlotDistances = () => {
    const cache = slotDistanceCacheRef.current;
    if (cache.valid) return cache;

    const getCenter = (slot: HTMLDivElement | null | undefined) => {
      if (!slot) return 0;
      const rect = slot.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };

    const posSlots = posSlotRefs.current;
    const audioSlots = audioSlotRefs.current;

    cache.pos01 = getCenter(posSlots[1]) - getCenter(posSlots[0]);
    cache.pos12 = getCenter(posSlots[2]) - getCenter(posSlots[1]);
    cache.audio01 = getCenter(audioSlots[1]) - getCenter(audioSlots[0]);
    cache.audio12 = getCenter(audioSlots[2]) - getCenter(audioSlots[1]);
    cache.valid = true;

    return cache;
  };

  useMountEffect(() => {
    const invalidateCache = () => {
      slotDistanceCacheRef.current.valid = false;
    };
    window.addEventListener('resize', invalidateCache);
    return () => window.removeEventListener('resize', invalidateCache);
  });

  // Helper to update card content via DOM (Optimized: recycle elements)
  const updateCardContent = (cardIndex: number, item: TimelineItem | null) => {
    const posContent = posContentRefs.current[cardIndex];
    const audioContent = audioContentRefs.current[cardIndex];

    // --- POSITION CARD UPDATE ---
    if (posContent) {
      if (!item) {
        // Clear content safely
        while (posContent.firstChild) {
          posContent.removeChild(posContent.firstChild);
        }
      } else {
        // Check if structure exists
        let wrapper = posContent.firstElementChild;
        if (!wrapper?.classList.contains('mini-grid-wrapper')) {
          // Create structure once using safe DOM API
          while (posContent.firstChild) {
            posContent.removeChild(posContent.firstChild);
          }
          wrapper = createMiniGridElement();
          posContent.appendChild(wrapper);
        }
        // Update cells
        const cells = wrapper?.querySelectorAll('[data-pos]');
        if (cells) {
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (!cell) continue;
            const pos = Number(cell.getAttribute('data-pos'));
            // Direct className update is faster than classList.toggle for simple swap
            cell.className =
              pos === item.position
                ? 'rounded-[2px] bg-visual'
                : 'rounded-[2px] bg-woven-cell-rest';
          }
        }
      }
    }

    // --- AUDIO CARD UPDATE ---
    if (audioContent) {
      if (!item) {
        // Clear content safely
        while (audioContent.firstChild) {
          audioContent.removeChild(audioContent.firstChild);
        }
      } else {
        let wrapper = audioContent.firstElementChild;
        if (!wrapper?.classList.contains('mini-letter-wrapper')) {
          // Create structure using safe DOM API
          while (audioContent.firstChild) {
            audioContent.removeChild(audioContent.firstChild);
          }
          const newWrapper = document.createElement('div');
          newWrapper.className =
            'mini-letter-wrapper bg-woven-surface rounded-lg shadow-sm w-9 h-9 flex items-center justify-center';
          const span = document.createElement('span');
          span.className = 'font-bold text-audio text-base';
          newWrapper.appendChild(span);
          audioContent.appendChild(newWrapper);
          wrapper = newWrapper;
        }
        const span = wrapper?.querySelector('span');
        if (span && span.textContent !== item.letter) {
          span.textContent = item.letter;
        }
      }
    }
  };

  // Helper to position card at slot
  const positionCardAtSlot = (cardIndex: number, slotIndex: number) => {
    const posCard = posCardRefs.current[cardIndex];
    const audioCard = audioCardRefs.current[cardIndex];
    const posSlot = posSlotRefs.current[slotIndex];
    const audioSlot = audioSlotRefs.current[slotIndex];

    if (posCard && posSlot) {
      const slotRect = posSlot.getBoundingClientRect();
      const cardRect = posCard.getBoundingClientRect();
      gsap.set(posCard, {
        x: slotRect.left - cardRect.left + (slotRect.width - cardRect.width) / 2,
        y: slotRect.top - cardRect.top + (slotRect.height - cardRect.height) / 2,
      });
    }
    if (audioCard && audioSlot) {
      const slotRect = audioSlot.getBoundingClientRect();
      const cardRect = audioCard.getBoundingClientRect();
      gsap.set(audioCard, {
        x: slotRect.left - cardRect.left + (slotRect.width - cardRect.width) / 2,
        y: slotRect.top - cardRect.top + (slotRect.height - cardRect.height) / 2,
      });
    }
  };

  useImperativeHandle(ref, () => ({
    addItem: (item: TimelineItem, onComplete: () => void) => {
      // Update items array
      itemsRef.current[0] = item;

      // Update card 0 content
      updateCardContent(0, item);

      // Show card 0 at N slot
      const posCard = posCardRefs.current[0];
      const audioCard = audioCardRefs.current[0];

      if (posCard) {
        gsap.set(posCard, { opacity: 1, scale: 1 });
      }
      if (audioCard) {
        gsap.set(audioCard, { opacity: 1, scale: 1 });
      }

      // Position at N slot
      positionCardAtSlot(0, 0);

      onComplete();
    },

    reorganize: (onComplete: () => void, timeScale = 1) => {
      const tl = gsap.timeline({
        onComplete: () => {
          // Shift items in ref
          const item1 = itemsRef.current[1] ?? null;
          const item0 = itemsRef.current[0] ?? null;
          itemsRef.current[2] = item1;
          itemsRef.current[1] = item0;
          itemsRef.current[0] = null;

          // Update card contents to match new positions
          updateCardContent(0, itemsRef.current[0] ?? null);
          updateCardContent(1, itemsRef.current[1] ?? null);
          updateCardContent(2, itemsRef.current[2] ?? null);

          // Reset card positions and visibility
          for (let i = 0; i < 3; i++) {
            const posCard = posCardRefs.current[i];
            const audioCard = audioCardRefs.current[i];
            const item = itemsRef.current[i];

            if (posCard) {
              gsap.set(posCard, { x: 0, y: 0, opacity: item ? 1 : 0, scale: 1 });
            }
            if (audioCard) {
              gsap.set(audioCard, { x: 0, y: 0, opacity: item ? 1 : 0, scale: 1 });
            }
          }

          onComplete();
        },
      });

      trackTimeline(tl);
      tl.timeScale(timeScale);

      const distances = getSlotDistances();

      if (itemsRef.current[2]) {
        const posCard2 = posCardRefs.current[2];
        const audioCard2 = audioCardRefs.current[2];
        if (posCard2) {
          tl.to(
            posCard2,
            { x: '-=50', opacity: 0, scale: 0.8, duration: 0.4, ease: 'power2.in' },
            0,
          );
        }
        if (audioCard2) {
          tl.to(
            audioCard2,
            { x: '-=50', opacity: 0, scale: 0.8, duration: 0.4, ease: 'power2.in' },
            0,
          );
        }
      }

      if (itemsRef.current[1]) {
        const posCard1 = posCardRefs.current[1];
        const audioCard1 = audioCardRefs.current[1];
        if (posCard1) {
          tl.to(
            posCard1,
            { x: `+=${distances.pos12}`, duration: 0.5, ease: 'slow(0.5, 0.7)' },
            0.1,
          );
        }
        if (audioCard1) {
          tl.to(
            audioCard1,
            { x: `+=${distances.audio12}`, duration: 0.5, ease: 'slow(0.5, 0.7)' },
            0.1,
          );
        }
      }

      if (itemsRef.current[0]) {
        const posCard0 = posCardRefs.current[0];
        const audioCard0 = audioCardRefs.current[0];
        if (posCard0) {
          tl.to(
            posCard0,
            { x: `+=${distances.pos01}`, duration: 0.5, ease: 'slow(0.5, 0.7)' },
            0.2,
          );
        }
        if (audioCard0) {
          tl.to(
            audioCard0,
            { x: `+=${distances.audio01}`, duration: 0.5, ease: 'slow(0.5, 0.7)' },
            0.2,
          );
        }
      }
    },

    showCompare: (
      matchPos: boolean,
      matchAudio: boolean,
      onComplete: () => void,
      timeScale = 1,
    ) => {
      const tl = gsap.timeline({ onComplete });
      trackTimeline(tl);
      tl.timeScale(timeScale);

      // Calculate slide distance - groups slide toward center symmetrically
      // Reduce slide to leave breathing room around the symbol
      const n1WrapperWidth = posN1WrapperRef.current?.offsetWidth ?? 56;
      const slideDistance = n1WrapperWidth / 2 - 8;

      // === SHRINK "PASSÉ" FRAME (visual only; no reflow) ===
      const paddingX = 16; // px-2 on both sides
      if (posPasseFrameHostRef.current && posPasseFrameRef.current) {
        const hostW = posPasseFrameHostRef.current.offsetWidth;
        const n2W = posN2ColRef.current?.offsetWidth ?? 0;
        const targetW = Math.max(0, Math.min(hostW, Math.round(n2W + paddingX)));
        const scale = hostW > 0 ? targetW / hostW : 1;
        gsap.set(posPasseFrameRef.current, { scaleX: 1, transformOrigin: 'left center' });
        tl.to(posPasseFrameRef.current, { scaleX: scale, duration: 0.3, ease: 'power2.out' }, 0.1);
      }
      if (audioPasseFrameHostRef.current && audioPasseFrameRef.current) {
        const hostW = audioPasseFrameHostRef.current.offsetWidth;
        const n2W = audioN2ColRef.current?.offsetWidth ?? 0;
        const targetW = Math.max(0, Math.min(hostW, Math.round(n2W + paddingX)));
        const scale = hostW > 0 ? targetW / hostW : 1;
        gsap.set(audioPasseFrameRef.current, { scaleX: 1, transformOrigin: 'left center' });
        tl.to(
          audioPasseFrameRef.current,
          { scaleX: scale, duration: 0.3, ease: 'power2.out' },
          0.1,
        );
      }

      // === RECENTER "PASSÉ" LABEL ON N-2 (shift left by half of N-1 width + gap) ===
      // The label is centered over N-2+N-1, we need to shift it left to center on N-2 only.
      const n1Width = posN1WrapperRef.current?.offsetWidth ?? 56;
      const gap = 6; // gap-1.5 = 6px
      const labelShift = (n1Width + gap) / 2;
      if (posPasseTitleRef.current) {
        tl.to(posPasseTitleRef.current, { x: -labelShift, duration: 0.3, ease: 'power2.out' }, 0.1);
      }

      // === HIDE N-1 WRAPPERS (transform-only; no reflow) ===
      // Keep width so slots keep stable positions for symbol timing/geometry.
      if (posN1WrapperRef.current) {
        gsap.set(posN1WrapperRef.current, { transformOrigin: 'center' });
        tl.to(
          posN1WrapperRef.current,
          { opacity: 0, scaleX: 0.85, duration: 0.25, ease: 'power2.out' },
          0,
        );
      }
      if (audioN1WrapperRef.current) {
        gsap.set(audioN1WrapperRef.current, { transformOrigin: 'center' });
        tl.to(
          audioN1WrapperRef.current,
          { opacity: 0, scaleX: 0.85, duration: 0.25, ease: 'power2.out' },
          0,
        );
      }

      // === SLIDE GROUPS TOWARD CENTER ===
      // Passé slides right, Présent slides left
      if (posPasseGroupRef.current) {
        tl.to(
          posPasseGroupRef.current,
          { x: slideDistance, duration: 0.4, ease: 'power2.out' },
          0.1,
        );
      }
      if (posPresentGroupRef.current) {
        tl.to(
          posPresentGroupRef.current,
          { x: -slideDistance, duration: 0.4, ease: 'power2.out' },
          0.1,
        );
      }
      if (audioPasseGroupRef.current) {
        tl.to(
          audioPasseGroupRef.current,
          { x: slideDistance, duration: 0.4, ease: 'power2.out' },
          0.1,
        );
      }
      if (audioPresentGroupRef.current) {
        tl.to(
          audioPresentGroupRef.current,
          { x: -slideDistance, duration: 0.4, ease: 'power2.out' },
          0.1,
        );
      }

      // === POSITION AND SHOW SYMBOLS ===
      const posSymbol = posSymbolRef.current;
      const audioSymbol = audioSymbolRef.current;
      const posContainer = posTimelineContainerRef.current;
      const audioContainer = audioTimelineContainerRef.current;
      const posN2Slot = posSlotRefs.current[2];
      const posNSlot = posSlotRefs.current[0];
      const audioN2Slot = audioSlotRefs.current[2];
      const audioNSlot = audioSlotRefs.current[0];

      // Position symbol exactly between N-2 and N cards (after they slide)
      if (posSymbol && posContainer && posN2Slot && posNSlot) {
        const containerRect = posContainer.getBoundingClientRect();
        const n2Rect = posN2Slot.getBoundingClientRect();
        const nRect = posNSlot.getBoundingClientRect();
        // After slide: N-2 moves right by slideDistance, N moves left by slideDistance
        // Midpoint between right edge of N-2 and left edge of N (after slide)
        const n2RightAfterSlide = n2Rect.right - containerRect.left + slideDistance;
        const nLeftAfterSlide = nRect.left - containerRect.left - slideDistance;
        const centerX = (n2RightAfterSlide + nLeftAfterSlide) / 2;
        // Vertical: center of the cards
        const centerY = n2Rect.top + n2Rect.height / 2 - containerRect.top;
        gsap.set(posSymbol, { left: centerX, top: centerY, xPercent: -50, yPercent: -50 });
        setCompareSymbol(posSymbol, matchPos);
        tl.fromTo(
          posSymbol,
          { opacity: 0, scale: 0.5 },
          { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' },
          0.35,
        );
      }

      if (audioSymbol && audioContainer && audioN2Slot && audioNSlot) {
        const containerRect = audioContainer.getBoundingClientRect();
        const n2Rect = audioN2Slot.getBoundingClientRect();
        const nRect = audioNSlot.getBoundingClientRect();
        // After slide: N-2 moves right by slideDistance, N moves left by slideDistance
        const n2RightAfterSlide = n2Rect.right - containerRect.left + slideDistance;
        const nLeftAfterSlide = nRect.left - containerRect.left - slideDistance;
        const centerX = (n2RightAfterSlide + nLeftAfterSlide) / 2;
        // Vertical: center of the cards
        const centerY = n2Rect.top + n2Rect.height / 2 - containerRect.top;
        gsap.set(audioSymbol, { left: centerX, top: centerY, xPercent: -50, yPercent: -50 });
        setCompareSymbol(audioSymbol, matchAudio);
        tl.fromTo(
          audioSymbol,
          { opacity: 0, scale: 0.5 },
          { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' },
          0.35,
        );
      }
    },

    hideCompare: (onComplete: () => void, timeScale = 1) => {
      const tl = gsap.timeline({ onComplete });
      trackTimeline(tl);
      tl.timeScale(timeScale);

      // === HIDE SYMBOLS ===
      const posSymbol = posSymbolRef.current;
      const audioSymbol = audioSymbolRef.current;

      if (posSymbol) {
        tl.to(posSymbol, { opacity: 0, scale: 0.5, duration: 0.2 }, 0);
      }
      if (audioSymbol) {
        tl.to(audioSymbol, { opacity: 0, scale: 0.5, duration: 0.2 }, 0);
      }

      // === RESET GROUP POSITIONS ===
      const groups = [
        posPasseGroupRef.current,
        posPresentGroupRef.current,
        audioPasseGroupRef.current,
        audioPresentGroupRef.current,
      ].filter(Boolean);

      tl.to(groups, { x: 0, duration: 0.3, ease: 'power2.out' }, 0.1);

      // === RESTORE "PASSÉ" FRAME WIDTH ===
      if (posPasseFrameHostRef.current && posPasseFrameRef.current) {
        tl.to(posPasseFrameRef.current, { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 0.1);
        tl.set(posPasseFrameRef.current, { clearProps: 'transform' });
      }
      if (audioPasseFrameHostRef.current && audioPasseFrameRef.current) {
        tl.to(audioPasseFrameRef.current, { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 0.1);
        tl.set(audioPasseFrameRef.current, { clearProps: 'transform' });
      }

      // === RESET "PASSÉ" LABEL POSITION ===
      if (posPasseTitleRef.current) {
        tl.to(posPasseTitleRef.current, { x: 0, duration: 0.3, ease: 'power2.out' }, 0.1);
      }

      // === SHOW N-1 WRAPPERS AGAIN ===
      if (posN1WrapperRef.current) {
        tl.to(
          posN1WrapperRef.current,
          { opacity: 1, scaleX: 1, duration: 0.25, ease: 'power2.out' },
          0.25,
        );
        tl.set(posN1WrapperRef.current, { clearProps: 'transform,opacity' });
      }
      if (audioN1WrapperRef.current) {
        tl.to(
          audioN1WrapperRef.current,
          { opacity: 1, scaleX: 1, duration: 0.25, ease: 'power2.out' },
          0.25,
        );
        tl.set(audioN1WrapperRef.current, { clearProps: 'transform,opacity' });
      }
    },

    getSlotRefs: () => ({
      posN: posSlotRefs.current[0] ?? null,
      posN1: posSlotRefs.current[1] ?? null,
      posN2: posSlotRefs.current[2] ?? null,
      audioN: audioSlotRefs.current[0] ?? null,
      audioN1: audioSlotRefs.current[1] ?? null,
      audioN2: audioSlotRefs.current[2] ?? null,
    }),

    getItems: () => ({
      n: itemsRef.current[0] ?? null,
      n1: itemsRef.current[1] ?? null,
      n2: itemsRef.current[2] ?? null,
    }),

    killAll: () => {
      for (const tl of activeTimelines.current) {
        tl.kill();
      }
      activeTimelines.current = [];
    },

    prefill: (items: {
      n?: TimelineItem | null;
      n1?: TimelineItem | null;
      n2?: TimelineItem | null;
    }) => {
      // Set items in ref
      const nItem = items.n ?? null;
      const n1Item = items.n1 ?? null;
      const n2Item = items.n2 ?? null;

      itemsRef.current[0] = nItem;
      itemsRef.current[1] = n1Item;
      itemsRef.current[2] = n2Item;

      // Update content and visibility for each slot
      const allItems = [nItem, n1Item, n2Item];
      for (let i = 0; i < 3; i++) {
        const item = allItems[i] ?? null;
        updateCardContent(i, item);

        const posCard = posCardRefs.current[i];
        const audioCard = audioCardRefs.current[i];

        if (posCard) {
          gsap.set(posCard, { x: 0, y: 0, opacity: item ? 1 : 0, scale: 1 });
        }
        if (audioCard) {
          gsap.set(audioCard, { x: 0, y: 0, opacity: item ? 1 : 0, scale: 1 });
        }
      }
    },
  }));

  return (
    <div className={cn('flex flex-col items-center gap-1 sm:gap-3', className)} style={{ opacity }}>
      {/* Position Timeline */}
      <div ref={posTimelineContainerRef} className="relative flex items-center gap-2 sm:gap-4">
        {/* Passé group */}
        <div ref={posPasseGroupRef} className="relative flex flex-col items-center">
          <div
            ref={posPasseTitleRef}
            className="text-3xs font-medium uppercase tracking-wider text-woven-text-muted mb-1"
          >
            {t('tutorial.timeline.past', 'Past')}
          </div>
          <div ref={posPasseFrameHostRef} className="relative px-2 py-1.5">
            <div
              ref={posPasseFrameRef}
              className="absolute left-0 right-0 top-0 bottom-0 bg-woven-surface rounded-2xl border border-woven-border pointer-events-none"
              style={{ willChange: 'transform', transformOrigin: 'left center' }}
            />
            <div className="relative z-10 flex items-center gap-1.5">
              {/* N-2 slot */}
              <div ref={posN2ColRef} className="flex flex-col items-center">
                <div
                  ref={(el) => {
                    posLabelRefs.current[2] = el;
                  }}
                  className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-visual"
                >
                  N-2
                </div>
                <div
                  ref={(el) => {
                    posSlotRefs.current[2] = el;
                  }}
                  className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest border border-dashed border-woven-border"
                >
                  {/* Card 2 - position */}
                  <div
                    ref={(el) => {
                      posCardRefs.current[2] = el;
                    }}
                    className="absolute"
                    style={{ opacity: 0, willChange: 'transform, opacity' }}
                  >
                    <div
                      ref={(el) => {
                        posContentRefs.current[2] = el;
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* N-1 slot */}
              <div ref={posN1WrapperRef} className="flex flex-col items-center relative">
                <div
                  ref={(el) => {
                    posLabelRefs.current[1] = el;
                  }}
                  className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-visual"
                >
                  N-1
                </div>
                <div
                  ref={(el) => {
                    posSlotRefs.current[1] = el;
                  }}
                  className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest border border-dashed border-woven-border"
                >
                  {/* Card 1 - position */}
                  <div
                    ref={(el) => {
                      posCardRefs.current[1] = el;
                    }}
                    className="absolute"
                    style={{ opacity: 0, willChange: 'transform, opacity' }}
                  >
                    <div
                      ref={(el) => {
                        posContentRefs.current[1] = el;
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Présent */}
        <div ref={posPresentGroupRef} className="relative flex flex-col items-center">
          <div className="text-3xs font-medium uppercase tracking-wider text-visual/80 mb-1">
            {t('tutorial.timeline.present', 'Present')}
          </div>
          <div className="flex flex-col items-center bg-woven-surface rounded-2xl px-2 py-1.5 border border-woven-border">
            <div
              ref={(el) => {
                posLabelRefs.current[0] = el;
              }}
              className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-visual"
            >
              N
            </div>
            <div
              ref={(el) => {
                posSlotRefs.current[0] = el;
              }}
              className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest/30 border border-dashed border-woven-border/40"
            >
              {/* Card 0 - position */}
              <div
                ref={(el) => {
                  posCardRefs.current[0] = el;
                }}
                className="absolute"
                style={{ opacity: 0, willChange: 'transform, opacity' }}
              >
                <div
                  ref={(el) => {
                    posContentRefs.current[0] = el;
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Position Compare Symbol - OVERLAY (absolute positioned) */}
        <div
          ref={posSymbolRef}
          className="absolute z-30 text-2xl font-bold text-visual pointer-events-none"
          style={{ opacity: 0 }}
        />
      </div>

      {/* Audio Timeline - no PASSÉ/PRÉSENT labels (redundant with Position timeline above) */}
      <div ref={audioTimelineContainerRef} className="relative flex items-center gap-2 sm:gap-4">
        {/* Passé group */}
        <div ref={audioPasseGroupRef} className="relative flex flex-col items-center">
          <div ref={audioPasseFrameHostRef} className="relative px-2 py-1.5">
            <div
              ref={audioPasseFrameRef}
              className="absolute left-0 right-0 top-0 bottom-0 bg-woven-surface rounded-2xl border border-woven-border pointer-events-none"
              style={{ willChange: 'transform', transformOrigin: 'left center' }}
            />
            <div className="relative z-10 flex items-center gap-1.5">
              {/* N-2 slot */}
              <div ref={audioN2ColRef} className="flex flex-col items-center">
                <div
                  ref={(el) => {
                    audioLabelRefs.current[2] = el;
                  }}
                  className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-audio"
                >
                  N-2
                </div>
                <div
                  ref={(el) => {
                    audioSlotRefs.current[2] = el;
                  }}
                  className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest border border-dashed border-woven-border"
                >
                  {/* Card 2 - audio */}
                  <div
                    ref={(el) => {
                      audioCardRefs.current[2] = el;
                    }}
                    className="absolute"
                    style={{ opacity: 0, willChange: 'transform, opacity' }}
                  >
                    <div
                      ref={(el) => {
                        audioContentRefs.current[2] = el;
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* N-1 slot */}
              <div ref={audioN1WrapperRef} className="flex flex-col items-center relative">
                <div
                  ref={(el) => {
                    audioLabelRefs.current[1] = el;
                  }}
                  className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-audio"
                >
                  N-1
                </div>
                <div
                  ref={(el) => {
                    audioSlotRefs.current[1] = el;
                  }}
                  className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest border border-dashed border-woven-border"
                >
                  {/* Card 1 - audio */}
                  <div
                    ref={(el) => {
                      audioCardRefs.current[1] = el;
                    }}
                    className="absolute"
                    style={{ opacity: 0, willChange: 'transform, opacity' }}
                  >
                    <div
                      ref={(el) => {
                        audioContentRefs.current[1] = el;
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Présent */}
        <div ref={audioPresentGroupRef} className="relative flex flex-col items-center">
          {/* No title - aligned with Position timeline above */}
          <div className="flex flex-col items-center bg-woven-surface rounded-2xl px-2 py-1.5 border border-woven-border">
            <div
              ref={(el) => {
                audioLabelRefs.current[0] = el;
              }}
              className="text-xxs font-bold uppercase mb-0.5 tracking-wide text-audio"
            >
              N
            </div>
            <div
              ref={(el) => {
                audioSlotRefs.current[0] = el;
              }}
              className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-woven-cell-rest/30 border border-dashed border-woven-border/40"
            >
              {/* Card 0 - audio */}
              <div
                ref={(el) => {
                  audioCardRefs.current[0] = el;
                }}
                className="absolute"
                style={{ opacity: 0, willChange: 'transform, opacity' }}
              >
                <div
                  ref={(el) => {
                    audioContentRefs.current[0] = el;
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Audio Compare Symbol - OVERLAY (absolute positioned) */}
        <div
          ref={audioSymbolRef}
          className="absolute z-30 text-2xl font-bold text-audio pointer-events-none"
          style={{ opacity: 0 }}
        />
      </div>

      {/* Legend */}
      {opacity > 0.1 && (
        <div className="text-4xs text-woven-text-muted mt-0.5 sm:mt-1 tracking-wide font-serif italic">
          {t('tutorial.timeline.legend', "Visualisation de l'effort cognitif")}
        </div>
      )}
    </div>
  );
});
