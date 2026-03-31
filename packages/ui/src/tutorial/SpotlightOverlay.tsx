/**
 * SpotlightOverlay - Premium onboarding spotlight effect
 *
 * Features:
 * - Glassmorphism overlay (backdrop-blur)
 * - Soft-edged spotlight with radial gradient
 * - GSAP-powered smooth transitions
 * - Frosted glass callouts without ugly arrows
 * - Sequential step progression
 */

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
// CanvasWeave removed — callout is now borderless text on overlay

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
  /** Optional: intro button text */
  introButtonText?: string;
  /** Optional: outro message after spotlight ends */
  outroMessage?: ReactNode;
  /** Optional: outro button text */
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
  /** Called when the current step changes (index, step ID) */
  onStepChange?: (stepIndex: number, stepId: string) => void;
  /** Optional skip link shown under callout dots */
  skipLabel?: string;
  /** Called when user taps skip */
  onSkip?: () => void;
  /** Group sizes for dot indicators (e.g. [4, 4, 1] for 3 groups) */
  dotGroups?: number[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SPOTLIGHT_PADDING = 12; // Padding around the target element
const TRANSITION_DURATION = 0.5;

const CALLOUT_EST_HEIGHT_PX = 140;
const VIEWPORT_MARGIN_PX = 16;

// =============================================================================
// COMPONENT
// =============================================================================

export function SpotlightOverlay({
  steps,
  onComplete,
  introMessage,
  introButtonText,
  outroMessage,
  outroButtonText,
  gridRef,
  className,
  onImmediateComplete,
  onStepChange,
  skipLabel: _skipLabel,
  onSkip: _onSkip,
  dotGroups: _dotGroups,
}: SpotlightOverlayProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'intro' | 'reveal' | 'spotlight' | 'outro' | 'complete'>(
    'intro',
  );

  // Apply default button texts using translations
  const resolvedIntroButtonText = introButtonText ?? t('tutorial.spotlight.continue', 'Continue');
  const resolvedOutroButtonText = outroButtonText ?? t('tutorial.spotlight.start', 'Start');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [gridRect, setGridRect] = useState<DOMRect | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  // Update grid rect when phase changes to intro/outro
  useEffect(() => {
    if ((phase === 'intro' || phase === 'outro') && gridRef?.current) {
      setGridRect(gridRef.current.getBoundingClientRect());
    }
  }, [phase, gridRef]);

  const currentStep = steps[currentStepIndex];

  // Get target element from ref or selector
  const getTargetElement = useCallback((target: SpotlightStep['target']): HTMLElement | null => {
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return target.current;
  }, []);

  // Update spotlight position based on target element
  const updateSpotlightPosition = useCallback(() => {
    if (!currentStep || phase !== 'spotlight') return;

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

  // Animate spotlight to new position (rectangular cutout via box-shadow)
  useGSAP(
    () => {
      if (!spotlightRect || !spotlightRef.current) return;

      const pad = SPOTLIGHT_PADDING;

      // Animate the cutout element to the target rect
      gsap.to(spotlightRef.current, {
        '--cut-left': `${spotlightRect.left - pad}px`,
        '--cut-top': `${spotlightRect.top - pad}px`,
        '--cut-width': `${spotlightRect.width + pad * 2}px`,
        '--cut-height': `${spotlightRect.height + pad * 2}px`,
        duration: TRANSITION_DURATION,
        ease: 'power2.out',
      });

      // Animate glow ring
      if (glowRef.current) {
        gsap.to(glowRef.current, {
          left: spotlightRect.left - pad - 2,
          top: spotlightRect.top - pad - 2,
          width: spotlightRect.width + pad * 2 + 4,
          height: spotlightRect.height + pad * 2 + 4,
          opacity: 1,
          duration: TRANSITION_DURATION,
          ease: 'power2.out',
        });
      }
    },
    { dependencies: [spotlightRect], scope: overlayRef },
  );

  // Animate callout entrance
  useGSAP(
    () => {
      if (!calloutRef.current || phase !== 'spotlight') return;

      gsap.fromTo(
        calloutRef.current,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          delay: TRANSITION_DURATION + 0.1,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [currentStepIndex, phase], scope: overlayRef },
  );

  // Update position on resize and step change
  useEffect(() => {
    let rafId: number | null = null;

    const handleResize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        updateSpotlightPosition();
        rafId = null;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [updateSpotlightPosition]);

  // Handle intro → reveal → spotlight transition
  const handleIntroComplete = useCallback(() => {
    // Phase 'reveal': overlay fades out, user sees the full UI for ~2.5s, no interaction
    setPhase('reveal');
    setTimeout(() => {
      setPhase('spotlight');
      if (steps[0]) onStepChange?.(0, steps[0].id);
    }, 1000);
  }, [steps, onStepChange]);

  // Handle step advancement
  const handleAdvance = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      const nextStep = steps[nextIdx];
      // Hide callout first
      if (calloutRef.current) {
        gsap.to(calloutRef.current, {
          opacity: 0,
          y: -10,
          duration: 0.2,
          ease: 'power2.in',
          onComplete: () => {
            setCurrentStepIndex(nextIdx);
            if (nextStep) onStepChange?.(nextIdx, nextStep.id);
          },
        });
      } else {
        setCurrentStepIndex(nextIdx);
        if (nextStep) onStepChange?.(nextIdx, nextStep.id);
      }
    } else {
      // Go to outro if there's an outro message, otherwise complete
      if (outroMessage) {
        setPhase('outro');
      } else {
        handleFinalComplete();
      }
    }
  }, [currentStepIndex, steps.length, outroMessage]);

  // Handle outro → complete transition
  const handleOutroComplete = useCallback(() => {
    handleFinalComplete();
  }, []);

  const handleFinalComplete = useCallback(() => {
    // CRITICAL: Call onImmediateComplete SYNCHRONOUSLY before any animation.
    // On iOS, AudioContext must be resumed during the user gesture context,
    // not after animation delays (which lose the gesture context).
    onImmediateComplete?.();

    if (overlayRef.current) {
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: () => {
          setPhase('complete');
          onComplete();
        },
      });
    } else {
      setPhase('complete');
      onComplete();
    }
  }, [onComplete, onImmediateComplete]);

  // Position text below the spotlight rectangle, centered, in the opaque zone.
  const getCalloutStyle = useCallback((): React.CSSProperties => {
    if (!spotlightRect || !currentStep) {
      return { top: '50%', left: VIEWPORT_MARGIN_PX, right: VIEWPORT_MARGIN_PX };
    }

    const padding = SPOTLIGHT_PADDING + 24; // below the cutout + glow
    const viewportH = window.innerHeight;

    // Prefer below; flip to above if no room
    const belowTop = spotlightRect.bottom + padding;
    const canFitBelow = belowTop + CALLOUT_EST_HEIGHT_PX < viewportH - 80; // 80px for bottom bar

    if (canFitBelow) {
      return {
        top: `${belowTop}px`,
        left: VIEWPORT_MARGIN_PX,
        right: VIEWPORT_MARGIN_PX,
      };
    }
    return {
      bottom: `${viewportH - spotlightRect.top + padding}px`,
      left: VIEWPORT_MARGIN_PX,
      right: VIEWPORT_MARGIN_PX,
    };
  }, [spotlightRect, currentStep]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (phase === 'spotlight' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleAdvance();
      }
    },
    [phase, handleAdvance],
  );

  return (
    <div
      ref={overlayRef}
      className={cn('fixed inset-0 z-[2500]', className)}
      onClick={phase === 'spotlight' ? handleAdvance : undefined}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('aria.tutorialIntro')}
      tabIndex={phase === 'spotlight' ? 0 : -1}
    >
      {/* Full-screen backdrop for non-spotlight phases */}
      {phase !== 'spotlight' && (
        <div
          className={cn(
            'absolute inset-0 transition-all',
            phase === 'reveal'
              ? 'bg-transparent duration-500'
              : phase === 'intro' || phase === 'outro'
                ? 'bg-woven-bg/95 backdrop-blur-sm duration-300'
                : 'bg-woven-bg/5 duration-300',
          )}
        />
      )}

      {/* Rectangular spotlight cutout via box-shadow technique */}
      {phase === 'spotlight' && (
        <div
          ref={spotlightRef}
          className="absolute rounded-2xl pointer-events-none transition-all"
          style={{
            left: 'var(--cut-left, 50%)',
            top: 'var(--cut-top, 50%)',
            width: 'var(--cut-width, 100px)',
            height: 'var(--cut-height, 100px)',
            boxShadow: '0 0 0 9999px hsl(var(--woven-bg) / 0.97)',
          }}
        />
      )}

      {/* Subtle ring around spotlight target */}
      {phase === 'spotlight' && (
        <div
          ref={glowRef}
          className="absolute pointer-events-none rounded-2xl opacity-0 border border-woven-text/15"
        />
      )}

      {/* Intro message — structured fiche card, glassmorphism */}
      {phase === 'intro' && introMessage && gridRect && (
        <div
          className="absolute flex flex-col items-center rounded-[22px] border border-border/50 bg-card/85 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl overflow-hidden"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'calc(100vw - 2rem)',
            maxWidth: 440,
            maxHeight: 'calc(100vh - 6rem)',
          }}
        >
          <div className="relative z-10 w-full overflow-y-auto px-5 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-5">
            {introMessage}
          </div>
          <div className="relative z-10 w-full px-5 pb-5 sm:px-6 sm:pb-6 flex justify-center">
            <button
              type="button"
              onClick={handleIntroComplete}
              className="px-6 py-2.5 sm:px-8 sm:py-3 rounded-full bg-woven-text text-woven-bg font-semibold shadow-md transition-all hover:bg-woven-text/90 hover:shadow-lg active:bg-woven-text/80 active:scale-[0.98]"
            >
              {resolvedIntroButtonText}
            </button>
          </div>
        </div>
      )}

      {/* Outro message — same glassmorphism card */}
      {phase === 'outro' && outroMessage && gridRect && (
        <div
          className="absolute flex flex-col items-center rounded-[22px] border border-border/50 bg-card/85 shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45)] backdrop-blur-2xl overflow-hidden"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'calc(100vw - 2rem)',
            maxWidth: 440,
            maxHeight: 'calc(100vh - 6rem)',
          }}
        >
          <div className="relative z-10 w-full overflow-y-auto px-5 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-5">
            {outroMessage}
          </div>
          <div className="relative z-10 w-full px-5 pb-5 sm:px-6 sm:pb-6 flex justify-center">
            <button
              type="button"
              onClick={handleOutroComplete}
              className="px-6 py-2.5 sm:px-8 sm:py-3 rounded-full bg-woven-text text-woven-bg font-semibold shadow-md transition-all hover:bg-woven-text/90 hover:shadow-lg active:bg-woven-text/80 active:scale-[0.98]"
            >
              {resolvedOutroButtonText}
            </button>
          </div>
        </div>
      )}

      {/* Floating text — no box, directly on the opaque overlay zone */}
      {phase === 'spotlight' && currentStep && spotlightRect && (
        <div
          ref={calloutRef}
          className="absolute pointer-events-none flex justify-center"
          style={getCalloutStyle()}
        >
          <div className="max-w-md px-4 text-woven-text text-[15px] sm:text-base font-semibold leading-[1.7] whitespace-pre-line">
            {currentStep.content}
          </div>
        </div>
      )}

      {/* Bottom bar — dots (grouped) + tap hint + skip */}
      {phase === 'spotlight' && (
        <div className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-20 px-5 flex flex-col items-center gap-2">
          {/* One dot per step */}
          {steps.length > 1 && (
            <div className="flex items-center gap-1.5">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'w-[7px] h-[7px] rounded-full transition-all duration-300',
                    index === currentStepIndex
                      ? 'bg-woven-text'
                      : index < currentStepIndex
                        ? 'bg-woven-text/45'
                        : 'bg-woven-text/18',
                  )}
                />
              ))}
            </div>
          )}

          {/* Tap hint — centered */}
          <div className="text-woven-text/40 text-xs font-medium">
            {t('tutorial.spotlight.tapToContinue', 'Tap anywhere to continue')}
          </div>
        </div>
      )}
    </div>
  );
}

export default SpotlightOverlay;
