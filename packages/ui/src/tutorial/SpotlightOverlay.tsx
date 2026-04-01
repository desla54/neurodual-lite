/**
 * SpotlightOverlay - Premium onboarding spotlight effect
 *
 * Unified flow: intro, spotlight steps, and outro are all part of the same
 * sequential progression. No separate modal phases.
 *
 * - Steps with a target: spotlight cutout + positioned callout
 * - Steps without a target (intro/outro): full overlay + centered callout
 * - Same tappable callout UI throughout (dots + chevron)
 */

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useMemo, type ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface SpotlightStep {
  /** Unique step ID */
  id: string;
  /** Target element ref or selector */
  target: React.RefObject<HTMLElement | null> | string;
  /** Callout content - short text */
  content: ReactNode;
  /** Optional: callout position relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface SpotlightOverlayProps {
  /** Steps to show in sequence */
  steps: SpotlightStep[];
  /** Called when all steps are completed */
  onComplete: () => void;
  /** Optional: intro message before spotlight begins */
  introMessage?: ReactNode;
  /** Optional: intro button text (unused, kept for API compat) */
  introButtonText?: string;
  /** Optional: outro message after spotlight ends */
  outroMessage?: ReactNode;
  /** Optional: outro button text (unused, kept for API compat) */
  outroButtonText?: string;
  /** Optional: ref to the grid element for positioning intro/outro messages */
  gridRef?: React.RefObject<HTMLElement | null>;
  /** Optional: className for the overlay */
  className?: string;
  /**
   * Called IMMEDIATELY when user clicks to complete (before animations).
   * Critical for iOS: AudioContext must be resumed during user gesture,
   * not after animation delays.
   */
  onImmediateComplete?: () => void;
  /** Called when the current step changes (index, step ID) — only for real spotlight steps */
  onStepChange?: (stepIndex: number, stepId: string) => void;
  /** Optional skip link shown under callout dots */
  skipLabel?: string;
  /** Called when user taps skip */
  onSkip?: () => void;
  /** Group sizes for dot indicators (e.g. [4, 4, 1] for 3 groups) */
  dotGroups?: number[];
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface InternalStep {
  id: string;
  content: ReactNode;
  target?: React.RefObject<HTMLElement | null> | string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SPOTLIGHT_PADDING = 12;
const CUTOUT_MOVE_DURATION = 0.55;
const CUTOUT_EASE = 'back.out(1.15)';
const CALLOUT_ENTER_DURATION = 0.4;
const CALLOUT_EXIT_DURATION = 0.2;
/** Duration for overlay fade during reveal transition */
const REVEAL_FADE_DURATION = 0.3;
/** Pause after overlay fades before spotlight appears */
const REVEAL_PAUSE_DURATION = 0.3;

const CALLOUT_EST_HEIGHT_PX = 140;
const VIEWPORT_MARGIN_PX = 16;

// =============================================================================
// COMPONENT
// =============================================================================

export function SpotlightOverlay({
  steps,
  onComplete,
  introMessage,
  introButtonText: _introButtonText,
  outroMessage,
  outroButtonText: _outroButtonText,
  gridRef: _gridRef,
  className,
  onImmediateComplete,
  onStepChange,
  skipLabel: _skipLabel,
  onSkip: _onSkip,
  dotGroups: _dotGroups,
}: SpotlightOverlayProps) {
  const { t } = useTranslation();

  // ── Build unified steps array ──
  const allSteps = useMemo(() => {
    const result: InternalStep[] = [];
    if (introMessage) {
      result.push({ id: '__intro', content: introMessage });
    }
    for (const step of steps) {
      result.push(step);
    }
    if (outroMessage) {
      result.push({ id: '__outro', content: outroMessage });
    }
    return result;
  }, [introMessage, outroMessage, steps]);

  const [phase, setPhase] = useState<'active' | 'reveal' | 'complete'>('active');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayBgRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const isFirstSpotlightRef = useRef(true);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const currentStep = allSteps[currentIndex];
  const hasTarget = !!currentStep?.target;

  // Map internal index to real step index for onStepChange
  const introOffset = introMessage ? 1 : 0;

  // ── Get target element ──
  const getTargetElement = useCallback((target: InternalStep['target']): HTMLElement | null => {
    if (!target) return null;
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return target.current;
  }, []);

  // ── Update spotlight position ──
  const updateSpotlightPosition = useCallback(() => {
    if (!currentStep?.target || phase !== 'active') return;

    const targetEl = getTargetElement(currentStep.target);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    setSpotlightRect((prev) => {
      if (!prev) return rect;
      const same =
        Math.abs(prev.left - rect.left) < 0.5 &&
        Math.abs(prev.top - rect.top) < 0.5 &&
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5;
      return same ? prev : rect;
    });
  }, [currentStep, phase, getTargetElement]);

  // ── Animate spotlight cutout ──
  useGSAP(
    () => {
      if (!spotlightRect || !spotlightRef.current) return;

      const pad = SPOTLIGHT_PADDING;
      const isFirst = isFirstSpotlightRef.current;

      if (isFirst) {
        isFirstSpotlightRef.current = false;
        gsap.set(spotlightRef.current, {
          '--cut-left': `${spotlightRect.left - pad}px`,
          '--cut-top': `${spotlightRect.top - pad}px`,
          '--cut-width': `${spotlightRect.width + pad * 2}px`,
          '--cut-height': `${spotlightRect.height + pad * 2}px`,
          scale: 1.1,
          opacity: 0,
        });
        gsap.to(spotlightRef.current, {
          scale: 1,
          opacity: 1,
          duration: 0.3,
          ease: 'back.out(1.8)',
        });
      } else {
        gsap.to(spotlightRef.current, {
          '--cut-left': `${spotlightRect.left - pad}px`,
          '--cut-top': `${spotlightRect.top - pad}px`,
          '--cut-width': `${spotlightRect.width + pad * 2}px`,
          '--cut-height': `${spotlightRect.height + pad * 2}px`,
          duration: CUTOUT_MOVE_DURATION,
          ease: CUTOUT_EASE,
        });
      }

      // Glow ring
      if (glowRef.current) {
        const glowVars: gsap.TweenVars = {
          left: spotlightRect.left - pad - 2,
          top: spotlightRect.top - pad - 2,
          width: spotlightRect.width + pad * 2 + 4,
          height: spotlightRect.height + pad * 2 + 4,
          opacity: 1,
          duration: isFirst ? 0.35 : CUTOUT_MOVE_DURATION,
          ease: isFirst ? 'power2.out' : CUTOUT_EASE,
        };
        if (isFirst) glowVars.delay = 0.05;
        gsap.to(glowRef.current, glowVars);
      }
    },
    { dependencies: [spotlightRect], scope: overlayRef },
  );

  // ── Animate callout entrance ──
  // Tracks whether callout is actually mounted in the DOM.
  // For target steps, it only mounts after spotlightRect is set.
  const calloutMounted = phase === 'active' && !!currentStep && (!hasTarget || !!spotlightRect);

  // Callout entrance animation.
  // Uses a double-RAF to survive React strict mode's effect double-fire.
  useEffect(() => {
    if (!calloutMounted) return;

    let raf1 = 0;
    let raf2 = 0;
    let tween: gsap.core.Tween | null = null;

    // First RAF: skip strict mode's synchronous cleanup/re-run cycle
    raf1 = requestAnimationFrame(() => {
      // Second RAF: element is guaranteed painted
      raf2 = requestAnimationFrame(() => {
        const el = calloutRef.current;
        if (!el) return;

        const calloutDelay = hasTarget ? CUTOUT_MOVE_DURATION * 0.45 : 0;
        gsap.set(el, { opacity: 0, y: 12 });
        tween = gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: CALLOUT_ENTER_DURATION,
          delay: calloutDelay,
          ease: 'power3.out',
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      tween?.kill();
    };
  }, [currentIndex, calloutMounted, hasTarget]);

  // ── Animate dot pulse ──
  useEffect(() => {
    const container = dotsRef.current;
    if (!container || phase !== 'active') return;

    const dots = container.querySelectorAll('[data-dot]');
    const activeDot = dots[currentIndex];
    if (!activeDot) return;

    const tween = gsap.fromTo(
      activeDot,
      { scale: 1.6 },
      { scale: 1, duration: 0.35, ease: 'back.out(3)' },
    );

    return () => { tween.kill(); };
  }, [currentIndex, phase]);

  // ── Resize handling ──
  useEffect(() => {
    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateSpotlightPosition();
        rafId = null;
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [updateSpotlightPosition]);

  // ── Helpers for step advancement ──
  /** Immediately resolve spotlight rect for a target step */
  const resolveTargetRect = useCallback(
    (step: InternalStep) => {
      if (!step.target) return;
      const el = getTargetElement(step.target);
      if (el) setSpotlightRect(el.getBoundingClientRect());
    },
    [getTargetElement],
  );

  /** Fire onStepChange for real spotlight steps (not intro/outro) */
  const fireStepChange = useCallback(
    (internalIdx: number) => {
      const realIdx = internalIdx - introOffset;
      if (realIdx >= 0 && realIdx < steps.length) {
        onStepChange?.(realIdx, steps[realIdx]!.id);
      }
    },
    [introOffset, steps, onStepChange],
  );

  // ── Advance to next step ──
  const advanceToIndex = useCallback(
    (nextIdx: number) => {
      const nextStep = allSteps[nextIdx];
      if (!nextStep) return;

      const wasNoTarget = !allSteps[currentIndex]?.target;
      const nextHasTarget = !!nextStep.target;

      // Transition from no-target → target: do reveal animation
      if (wasNoTarget && nextHasTarget) {
        if (calloutRef.current) {
          gsap.to(calloutRef.current, { opacity: 0, y: -8, duration: CALLOUT_EXIT_DURATION, ease: 'power2.in' });
        }
        if (overlayBgRef.current) {
          gsap.to(overlayBgRef.current, {
            opacity: 0,
            duration: REVEAL_FADE_DURATION,
            ease: 'power2.inOut',
            onComplete: () => {
              setPhase('reveal');
              gsap.delayedCall(REVEAL_PAUSE_DURATION, () => {
                setCurrentIndex(nextIdx);
                setPhase('active');
                resolveTargetRect(nextStep);
                fireStepChange(nextIdx);
              });
            },
          });
        } else {
          setCurrentIndex(nextIdx);
          resolveTargetRect(nextStep);
          fireStepChange(nextIdx);
        }
        return;
      }

      // Normal transition (target → target, or no-target → no-target)
      const commitAdvance = () => {
        setCurrentIndex(nextIdx);
        if (nextHasTarget) resolveTargetRect(nextStep);
        fireStepChange(nextIdx);
      };

      if (calloutRef.current) {
        gsap.to(calloutRef.current, {
          opacity: 0,
          y: -8,
          duration: CALLOUT_EXIT_DURATION,
          ease: 'power2.in',
          onComplete: commitAdvance,
        });
      } else {
        commitAdvance();
      }
    },
    [allSteps, currentIndex, introOffset, steps, onStepChange],
  );

  const handleAdvance = useCallback(() => {
    if (currentIndex < allSteps.length - 1) {
      advanceToIndex(currentIndex + 1);
    } else {
      // Last step — complete
      handleFinalComplete();
    }
  }, [currentIndex, allSteps.length, advanceToIndex]);

  const handleFinalComplete = useCallback(() => {
    // CRITICAL: Call onImmediateComplete SYNCHRONOUSLY before any animation.
    // On iOS, AudioContext must be resumed during the user gesture context.
    onImmediateComplete?.();

    if (overlayRef.current) {
      const tl = gsap.timeline({
        onComplete: () => {
          setPhase('complete');
          onComplete();
        },
      });

      if (calloutRef.current) {
        tl.to(calloutRef.current, { opacity: 0, y: -8, duration: 0.2, ease: 'power2.in' }, 0);
      }
      if (spotlightRef.current) {
        tl.to(spotlightRef.current, { opacity: 0, scale: 1.08, duration: 0.3, ease: 'power2.in' }, 0.05);
      }
      if (glowRef.current) {
        tl.to(glowRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0);
      }
      tl.to(overlayRef.current, { opacity: 0, duration: 0.3, ease: 'power2.out' }, 0.1);
    } else {
      setPhase('complete');
      onComplete();
    }
  }, [onComplete, onImmediateComplete]);

  // ── Swipe gesture ──
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (phase !== 'active') return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    },
    [phase],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (phase !== 'active' || !touchStartRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isSwipe = absDx > 40 && absDx > absDy * 1.5 && dt < 400;

      if (isSwipe && dx < 0) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        handleAdvance();
      }
    },
    [phase, handleAdvance],
  );

  // ── Callout position ──
  const calloutCentered = !hasTarget || !spotlightRect;
  const getCalloutStyle = useCallback((): React.CSSProperties => {
    // No-target step: use inset-0 flex centering (no transform — GSAP-safe)
    if (calloutCentered) {
      return {
        inset: 0,
        left: VIEWPORT_MARGIN_PX,
        right: VIEWPORT_MARGIN_PX,
      };
    }

    const padding = SPOTLIGHT_PADDING + 24;
    const viewportH = window.innerHeight;
    const belowTop = spotlightRect!.bottom + padding;
    const canFitBelow = belowTop + CALLOUT_EST_HEIGHT_PX < viewportH - 80;

    if (canFitBelow) {
      return { top: `${belowTop}px`, left: VIEWPORT_MARGIN_PX, right: VIEWPORT_MARGIN_PX };
    }
    return {
      bottom: `${viewportH - spotlightRect!.top + padding}px`,
      left: VIEWPORT_MARGIN_PX,
      right: VIEWPORT_MARGIN_PX,
    };
  }, [calloutCentered, spotlightRect]);

  // ── Keyboard ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (phase === 'active' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleAdvance();
      }
    },
    [phase, handleAdvance],
  );

  if (phase === 'complete') return null;

  // Should we show the spotlight cutout?
  const showCutout = phase === 'active' && hasTarget;
  // Should we show the full overlay background?
  const showFullOverlay = phase === 'active' && !hasTarget;

  return (
    <div
      ref={overlayRef}
      className={cn('fixed inset-0 z-[2500]', className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('aria.tutorialIntro')}
      tabIndex={phase === 'active' ? 0 : -1}
    >
      {/* Full opaque overlay for no-target steps (intro/outro) */}
      {showFullOverlay && (
        <div
          ref={overlayBgRef}
          className="absolute inset-0"
          style={{
            backgroundColor: 'hsl(var(--woven-bg) / 0.97)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* Spotlight cutout for target steps */}
      {showCutout && (
        <div
          ref={spotlightRef}
          className="absolute rounded-2xl pointer-events-none"
          style={{
            left: 'var(--cut-left, 50%)',
            top: 'var(--cut-top, 50%)',
            width: 'var(--cut-width, 100px)',
            height: 'var(--cut-height, 100px)',
            boxShadow: '0 0 0 9999px hsl(var(--woven-bg) / 0.97)',
            willChange: 'transform',
          }}
        />
      )}

      {/* Glow ring */}
      {showCutout && (
        <div
          ref={glowRef}
          className="absolute pointer-events-none rounded-2xl opacity-0 border border-woven-text/20 shadow-[0_0_20px_-4px_hsl(var(--woven-text)/0.08)]"
        />
      )}

      {/* Unified callout — same UI for all steps */}
      {phase === 'active' && currentStep && (hasTarget ? spotlightRect : true) && (
        <div
          ref={calloutRef}
          className={cn('absolute flex justify-center z-30', calloutCentered && 'items-center')}
          style={getCalloutStyle()}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleAdvance();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAdvance();
              }
            }}
            className="max-w-md px-4 cursor-pointer select-none active:opacity-70 transition-opacity duration-100"
          >
            {/* Text content */}
            <div className="text-woven-text text-[15px] sm:text-base font-semibold leading-[1.7] whitespace-pre-line">
              {currentStep.content}
            </div>

            {/* Dots + chevron */}
            <div className="flex items-center justify-between mt-3">
              {allSteps.length > 1 ? (
                <div ref={dotsRef} className="flex items-center gap-1.5">
                  {allSteps.map((step, index) => (
                    <div
                      key={step.id}
                      data-dot
                      className={cn(
                        'rounded-full',
                        index === currentIndex
                          ? 'w-[7px] h-[7px] bg-woven-text'
                          : index < currentIndex
                            ? 'w-[6px] h-[6px] bg-woven-text/40'
                            : 'w-[6px] h-[6px] bg-woven-text/15',
                      )}
                      style={{ transition: 'width 0.3s, height 0.3s, background-color 0.3s' }}
                    />
                  ))}
                </div>
              ) : (
                <div />
              )}

              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-woven-text/50"
              >
                <path
                  d="M6 3.5L10.5 8L6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpotlightOverlay;
