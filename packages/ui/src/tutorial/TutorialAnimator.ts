/**
 * TutorialAnimator - GSAP Animation Engine for Tutorials
 *
 * This class encapsulates all "Visual Verbs" for tutorial animations.
 * The ActiveTutorialEngine is a simple executor that reads the Spec
 * and calls methods on this class.
 *
 * ARCHITECTURE:
 * - TutorialAnimator knows HOW to animate (GSAP implementation)
 * - ActiveTutorialEngine knows WHAT to animate (reads from Spec)
 *
 * VISUAL VERBS:
 * - TRAVEL: Stimulus shrinks from grid center to timeline slot
 * - COMPARE: Cards slide together for comparison
 * - RESET_COMPARE: Cards return to original positions
 * - REORGANIZE: Sequential timeline shift (N-2 exits, N-1→N-2, N→N-1)
 * - INK_IMPACT: Ink infusion effect on grid cells
 * - PULSE: Button pulse for required matches
 *
 * ALL animations use GSAP timelines with onComplete callbacks.
 * NO setTimeout for phase transitions.
 */

import gsap from 'gsap';

const killPatchedSymbol = Symbol('ndTutorialAnimatorKillPatched');

// =============================================================================
// GSAP PERFORMANCE CONFIG
// =============================================================================

// PERFORMANCE FIX: Utiliser le défaut GSAP (500, 33) au lieu de (33, 7)
// Le réglage précédent (33, 7) était trop agressif - déclenchait le smoothing
// à chaque micro-lag, causant des animations saccadées.
// @see https://gsap.com/docs/v3/GSAP/gsap.ticker/
// Note: Ne pas appeler lagSmoothing ici = utilise le défaut GSAP qui est optimal

// =============================================================================
// TYPES
// =============================================================================

export interface TravelerRefs {
  container: HTMLElement;
  grid: HTMLElement;
  letter: HTMLElement;
  posNSlot: HTMLElement;
  audioNSlot: HTMLElement;
  posTraveler: HTMLElement;
  audioTraveler: HTMLElement;
  /** Optional: Active grid cell to fade out during cross-fade */
  activeCell?: HTMLElement | null;
  /** Optional: Letter element to fade out during cross-fade */
  letterSpan?: HTMLElement | null;
}

export interface TimelineSlotRefs {
  posN: HTMLElement | null;
  posN1: HTMLElement | null;
  posN2: HTMLElement | null;
  audioN: HTMLElement | null;
  audioN1: HTMLElement | null;
  audioN2: HTMLElement | null;
}

export interface CardRefs {
  posNCard: HTMLElement | null;
  posN1Card: HTMLElement | null;
  posN2Card: HTMLElement | null;
  audioNCard: HTMLElement | null;
  audioN1Card: HTMLElement | null;
  audioN2Card: HTMLElement | null;
}

export interface GroupLabelRefs {
  posPasseLabel: HTMLElement | null;
  posPresentLabel: HTMLElement | null;
  audioPasseLabel: HTMLElement | null;
  audioPresentLabel: HTMLElement | null;
}

export interface TimelineContainerRefs {
  posContainer: HTMLElement | null;
  audioContainer: HTMLElement | null;
}

export interface CompareSymbolPositions {
  pos: { x: number; y: number } | null;
  audio: { x: number; y: number } | null;
}

export interface CompareResult {
  posSymbol: '=' | '≠';
  audioSymbol: '=' | '≠';
  symbolPositions: CompareSymbolPositions;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCenter(el: HTMLElement | null): { x: number; y: number } {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// =============================================================================
// TUTORIAL ANIMATOR CLASS
// =============================================================================

export class TutorialAnimator {
  private activeTimelines = new Set<gsap.core.Timeline>();

  private trackTimeline(timeline: gsap.core.Timeline): gsap.core.Timeline {
    this.activeTimelines.add(timeline);

    const untrack = () => {
      this.activeTimelines.delete(timeline);
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

    return timeline;
  }

  // ---------------------------------------------------------------------------
  // VERB: TRAVEL (Stimulus → Timeline Slot)
  // ---------------------------------------------------------------------------

  /**
   * Animate travelers from grid/letter center to N timeline slots.
   * Uses direct GSAP animation for straight-line trajectories.
   */
  travel(refs: TravelerRefs, timeScale: number = 1, onComplete: () => void): gsap.core.Timeline {
    const {
      container,
      grid,
      letter,
      posNSlot,
      audioNSlot,
      posTraveler,
      audioTraveler,
      activeCell,
      letterSpan,
    } = refs;

    const shrinkDuration = 1.4 / timeScale;
    const crossFadeDuration = 0.25 / timeScale;

    // BATCH ALL READS to avoid layout thrashing
    const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 };
    const gridRect = grid.getBoundingClientRect();
    const letterRect = letter.getBoundingClientRect();
    const posSlotRect = posNSlot.getBoundingClientRect();
    const audioSlotRect = audioNSlot.getBoundingClientRect();

    const gridCenterX = gridRect.left + gridRect.width / 2 - containerRect.left;
    const gridCenterY = gridRect.top + gridRect.height / 2 - containerRect.top;
    const letterCenterX = letterRect.left + letterRect.width / 2 - containerRect.left;
    const letterCenterY = letterRect.top + letterRect.height / 2 - containerRect.top;

    const posSlotCenterX = posSlotRect.left + posSlotRect.width / 2 - containerRect.left;
    const posSlotCenterY = posSlotRect.top + posSlotRect.height / 2 - containerRect.top;
    const audioSlotCenterX = audioSlotRect.left + audioSlotRect.width / 2 - containerRect.left;
    const audioSlotCenterY = audioSlotRect.top + audioSlotRect.height / 2 - containerRect.top;

    const posWidth = posSlotRect.width;
    const posHeight = posSlotRect.height;
    const audioWidth = audioSlotRect.width;
    const audioHeight = audioSlotRect.height;

    gsap.set(posTraveler, {
      x: gridCenterX - posWidth / 2,
      y: gridCenterY - posHeight / 2,
      width: posWidth,
      height: posHeight,
      scale: 2.5,
      opacity: 0,
      xPercent: 0,
      yPercent: 0,
    });
    gsap.set(audioTraveler, {
      x: letterCenterX - audioWidth / 2,
      y: letterCenterY - audioHeight / 2,
      width: audioWidth,
      height: audioHeight,
      scale: 2,
      opacity: 0,
      xPercent: 0,
      yPercent: 0,
    });

    const tl = gsap.timeline({
      onStart: () => {
        gsap.set([posTraveler, audioTraveler], { willChange: 'transform, opacity' });
      },
      onComplete: () => {
        gsap.set(posTraveler, { opacity: 0, clearProps: 'width,height', willChange: 'auto' });
        gsap.set(audioTraveler, { opacity: 0, clearProps: 'width,height', willChange: 'auto' });
        if (activeCell) gsap.set(activeCell, { opacity: 1 });
        if (letterSpan) gsap.set(letterSpan, { opacity: 1 });
        onComplete();
      },
    });

    this.trackTimeline(tl);

    tl.to(
      posTraveler,
      {
        x: posSlotCenterX - posWidth / 2,
        y: posSlotCenterY - posHeight / 2,
        scale: 1,
        duration: shrinkDuration,
        ease: 'power2.inOut',
      },
      0,
    );

    tl.to(
      audioTraveler,
      {
        x: audioSlotCenterX - audioWidth / 2,
        y: audioSlotCenterY - audioHeight / 2,
        scale: 1,
        duration: shrinkDuration,
        ease: 'power2.inOut',
      },
      0,
    );

    tl.fromTo(
      [posTraveler, audioTraveler],
      { opacity: 0 },
      { opacity: 1, duration: crossFadeDuration, ease: 'power2.out' },
      0,
    );

    if (activeCell) {
      tl.to(activeCell, { opacity: 0, duration: crossFadeDuration, ease: 'power2.out' }, 0);
    }
    if (letterSpan) {
      tl.to(letterSpan, { opacity: 0, duration: crossFadeDuration, ease: 'power2.out' }, 0);
    }

    return tl;
  }

  // ---------------------------------------------------------------------------
  // VERB: COMPARE (Bring Cards Together)
  // ---------------------------------------------------------------------------

  /**
   * Animate cards together for comparison.
   * N and N-2 slide toward N-1 position with symbols between them.
   *
   * @param cardRefs - Card wrapper refs (includes labels)
   * @param slotRefs - Slot refs for positioning
   * @param containerRefs - Timeline container refs for symbol positioning
   * @param labelRefs - Group label refs (Passé/Présent)
   * @param matchPos - Whether position matches
   * @param matchAudio - Whether audio matches
   * @param onComplete - Callback when animation finishes
   * @returns CompareResult with symbol info and positions
   */
  compare(
    cardRefs: CardRefs,
    slotRefs: TimelineSlotRefs,
    containerRefs: TimelineContainerRefs,
    labelRefs: GroupLabelRefs,
    matchPos: boolean,
    matchAudio: boolean,
    onComplete: () => void,
  ): { timeline: gsap.core.Timeline; result: CompareResult } {
    const { posNCard, posN1Card, posN2Card, audioNCard, audioN1Card, audioN2Card } = cardRefs;
    const { posN1: posN1Slot, audioN1: audioN1Slot } = slotRefs;
    const { posContainer, audioContainer } = containerRefs;
    const { posPasseLabel, posPresentLabel, audioPasseLabel, audioPresentLabel } = labelRefs;

    const result: CompareResult = {
      posSymbol: matchPos ? '=' : '≠',
      audioSymbol: matchAudio ? '=' : '≠',
      symbolPositions: { pos: null, audio: null },
    };

    const tl = gsap.timeline({ onComplete });
    this.trackTimeline(tl);

    // Hide N-1 cards
    tl.to([posN1Card, audioN1Card].filter(Boolean), {
      opacity: 0,
      duration: 0.2,
      ease: 'power2.inOut',
    });

    // Calculate dx based on card width
    const cardWidth = posNCard?.getBoundingClientRect().width || 48;
    const dx = Math.ceil(cardWidth / 2) + 12;

    // Position timeline animation
    if (posNCard && posN2Card && posN1Card) {
      const meetPoint = getCenter(posN1Card);
      const nPos = getCenter(posNCard);
      const n2Pos = getCenter(posN2Card);

      const nDeltaX = meetPoint.x + dx - nPos.x;
      const nDeltaY = meetPoint.y - nPos.y;
      const n2DeltaX = meetPoint.x - dx - n2Pos.x;
      const n2DeltaY = meetPoint.y - n2Pos.y;

      // Set symbol position
      const slotCenter = getCenter(posN1Slot);
      const containerRect = posContainer?.getBoundingClientRect();
      if (containerRect) {
        result.symbolPositions.pos = {
          x: meetPoint.x - containerRect.left,
          y: slotCenter.y - containerRect.top,
        };
      }

      // Animate N card
      tl.to(posNCard, { x: nDeltaX, y: nDeltaY, duration: 0.5, ease: 'power2.out' }, 0.2);
      if (posPresentLabel) {
        tl.to(posPresentLabel, { x: nDeltaX, y: nDeltaY, duration: 0.5, ease: 'power2.out' }, 0.2);
      }

      // Animate N-2 card
      tl.to(posN2Card, { x: n2DeltaX, y: n2DeltaY, duration: 0.5, ease: 'power2.out' }, 0.2);
      if (posPasseLabel) {
        const passeCenter = getCenter(posPasseLabel);
        const n2FinalX = meetPoint.x - dx;
        const passeDeltaX = n2FinalX - passeCenter.x;
        tl.to(
          posPasseLabel,
          { x: passeDeltaX, y: n2DeltaY, duration: 0.5, ease: 'power2.out' },
          0.2,
        );
      }
    }

    // Audio timeline animation
    if (audioNCard && audioN2Card && audioN1Card) {
      const meetPoint = getCenter(audioN1Card);
      const nPos = getCenter(audioNCard);
      const n2Pos = getCenter(audioN2Card);

      const nDeltaX = meetPoint.x + dx - nPos.x;
      const nDeltaY = meetPoint.y - nPos.y;
      const n2DeltaX = meetPoint.x - dx - n2Pos.x;
      const n2DeltaY = meetPoint.y - n2Pos.y;

      // Set symbol position
      const slotCenter = getCenter(audioN1Slot);
      const containerRect = audioContainer?.getBoundingClientRect();
      if (containerRect) {
        result.symbolPositions.audio = {
          x: meetPoint.x - containerRect.left,
          y: slotCenter.y - containerRect.top,
        };
      }

      // Animate N card
      tl.to(audioNCard, { x: nDeltaX, y: nDeltaY, duration: 0.5, ease: 'power2.out' }, 0.2);
      if (audioPresentLabel) {
        tl.to(
          audioPresentLabel,
          { x: nDeltaX, y: nDeltaY, duration: 0.5, ease: 'power2.out' },
          0.2,
        );
      }

      // Animate N-2 card
      tl.to(audioN2Card, { x: n2DeltaX, y: n2DeltaY, duration: 0.5, ease: 'power2.out' }, 0.2);
      if (audioPasseLabel) {
        const passeCenter = getCenter(audioPasseLabel);
        const n2FinalX = meetPoint.x - dx;
        const passeDeltaX = n2FinalX - passeCenter.x;
        tl.to(
          audioPasseLabel,
          { x: passeDeltaX, y: n2DeltaY, duration: 0.5, ease: 'power2.out' },
          0.2,
        );
      }
    }

    // Hold briefly
    tl.to({}, { duration: 0.3 });

    return { timeline: tl, result };
  }

  // ---------------------------------------------------------------------------
  // VERB: RESET_COMPARE (Return to Original Positions)
  // ---------------------------------------------------------------------------

  /**
   * Reset cards and labels to original positions after comparison.
   *
   * @param cardRefs - Card wrapper refs
   * @param labelRefs - Group label refs
   * @param onComplete - Callback when animation finishes
   * @returns The GSAP timeline
   */
  resetCompare(
    cardRefs: CardRefs,
    labelRefs: GroupLabelRefs,
    onComplete: () => void,
  ): gsap.core.Timeline {
    const { posNCard, posN1Card, posN2Card, audioNCard, audioN1Card, audioN2Card } = cardRefs;
    const { posPasseLabel, posPresentLabel, audioPasseLabel, audioPresentLabel } = labelRefs;

    const tl = gsap.timeline({ onComplete });
    this.trackTimeline(tl);

    // Restore N-1 visibility
    tl.to([posN1Card, audioN1Card].filter(Boolean), {
      opacity: 1,
      duration: 0.2,
      ease: 'power2.inOut',
      clearProps: 'opacity',
    });

    // Reset all positions
    tl.to(
      [
        posNCard,
        posN2Card,
        audioNCard,
        audioN2Card,
        posPasseLabel,
        posPresentLabel,
        audioPasseLabel,
        audioPresentLabel,
      ].filter(Boolean),
      {
        x: 0,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
        clearProps: 'transform',
      },
      0,
    );

    return tl;
  }

  // ---------------------------------------------------------------------------
  // VERB: INK_IMPACT (Ink Infusion on Grid Cell)
  // ---------------------------------------------------------------------------

  /**
   * Animate ink impact on a grid cell.
   * Box-shadow expands inward then fades.
   *
   * @param cell - The grid cell element
   * @param isCorrect - Whether to show success (green) or error (red)
   * @returns The GSAP timeline
   */
  inkImpact(cell: HTMLElement, isCorrect: boolean): gsap.core.Timeline {
    gsap.killTweensOf(cell, 'boxShadow');

    const color = isCorrect ? '#22c55e' : '#ef4444';

    const tl = gsap.timeline();
    this.trackTimeline(tl);

    tl.set(cell, { boxShadow: `inset 0 0 0 0 ${color}` })
      .to(cell, {
        boxShadow: `inset 0 0 0 60px ${color}`,
        duration: 0.2,
        ease: 'power2.out',
      })
      .to(cell, {
        boxShadow: `inset 0 0 0 60px transparent`,
        duration: 0.35,
        ease: 'power1.out',
      })
      .set(cell, { boxShadow: 'none' });

    return tl;
  }

  // ---------------------------------------------------------------------------
  // VERB: PULSE (Button Pulse for Required Matches)
  // ---------------------------------------------------------------------------

  /**
   * Pulse effect on button to indicate required action.
   *
   * @param element - The button element
   * @param glowColor - The glow color (rgba format)
   * @returns The GSAP tween (repeat: -1, yoyo: true)
   */
  pulse(element: HTMLElement, glowColor: string): gsap.core.Tween {
    gsap.set(element, { boxShadow: `0 0 0 3px ${glowColor}` });

    const tween = gsap.to(element, {
      scale: 1.05,
      duration: 0.35,
      ease: 'power1.inOut',
      repeat: -1,
      yoyo: true,
    });

    return tween;
  }

  /**
   * Clear pulse effect from element.
   *
   * @param element - The button element
   * @param tween - The pulse tween to kill
   */
  clearPulse(element: HTMLElement, tween: gsap.core.Tween): void {
    tween.kill();
    gsap.set(element, { clearProps: 'transform,boxShadow' });
  }

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------

  /**
   * Kill all active timelines.
   * Call this when component unmounts or when resetting.
   */
  killAll(): void {
    for (const tl of this.activeTimelines) {
      tl.kill();
    }
    this.activeTimelines.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const tutorialAnimator = new TutorialAnimator();
