import {
  THRESHOLDS,
  type AudioPort,
  type Sound,
  type SpotlightTarget,
  type TutorialSpec,
  type TutorialStepSpec,
  type TutorialCompletionReport,
} from '@neurodual/logic';
import { useGSAP } from '@gsap/react';
import { House, Pause, Play, Timer } from '@phosphor-icons/react';
import gsap from 'gsap';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TimelineItem } from './types';

import { GameControls } from '../game/game-controls';
import { HUD_BADGE, HUD_BTN } from '../game/game-hud';
import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { CanvasWeave } from '../primitives/canvas-weave';
import { AnnotationZone } from './AnnotationZone';
// NeuroDual Lite: Only classic (dualnback-classic) tutorial controls are used.
// DualPickControls, TraceTutorialControls, PlaceTutorialControls, MemoTutorialControls removed.
import type { GsapTimelineHandle } from './gsap-timeline';
import { GsapTimeline } from './gsap-timeline';
import { useTutorialLayout } from './hooks/use-tutorial-layout';
import { SpotlightOverlay, type SpotlightStep } from './SpotlightOverlay';
import { TutorialAnimator } from './TutorialAnimator';
import { useTutorialSession } from './use-tutorial-session';
import { useMountEffect } from '../hooks';

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

const SPEED_BOOST = 1.3;
const BASE_SPEED = 0.5625 * SPEED_BOOST;
const TRAVEL_BOOST = 1.4;
const TIMELINE_SLOW = 0.6;

const ASSESSMENT_CONTROLS_HEIGHT = 140; // Match useGameLayout default minControlsHeight

const BUTTON_ERROR_FLASH_MS = 520;

const WovenMiniGrid = memo(function WovenMiniGrid({ position }: { position: number }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm w-9 h-9 p-1 flex items-center justify-center">
      <div className="grid grid-cols-3 gap-[1px]" style={{ width: 28, height: 28 }}>
        {GRID_MAP.map((logicPos, idx) => {
          if (logicPos === null) {
            return (
              <div key="center" className="relative flex items-center justify-center">
                <div className="absolute w-1/2 h-[1px] bg-woven-text-muted/40" />
                <div className="absolute h-1/2 w-[1px] bg-woven-text-muted/40" />
              </div>
            );
          }
          return (
            <div
              key={idx}
              className={cn(
                'rounded-[2px]',
                logicPos === position ? 'bg-visual' : 'bg-woven-cell-rest',
              )}
            />
          );
        })}
      </div>
    </div>
  );
});

const WovenMiniLetter = memo(function WovenMiniLetter({ letter }: { letter: string }) {
  return (
    <div className="bg-woven-surface rounded-lg shadow-sm w-9 h-9 flex items-center justify-center">
      <span className="font-bold text-audio text-base">{letter}</span>
    </div>
  );
});

interface TutorialHUDProps {
  nLevel: number;
  stepNumber: number;
  totalSteps: number;
  isPaused: boolean;
  isPlaying: boolean;
  onPause: () => void;
  onResume: () => void;
  onHome: () => void;
}

const TutorialHUD = memo(function TutorialHUD({
  nLevel,
  stepNumber,
  totalSteps,
  isPaused,
  isPlaying,
  onPause,
  onResume,
  onHome,
}: TutorialHUDProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="relative flex flex-col w-fit max-w-md rounded-2xl overflow-hidden border border-woven-border/50 bg-woven-surface/60 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)]">
        <CanvasWeave lineCount={8} rounded="2xl" opacity={0.04} />
        <div className="relative z-10 flex items-center justify-between gap-2 p-2 px-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={HUD_BADGE}>N-{nLevel}</div>
            <div className={cn(HUD_BADGE, 'gap-1')}>
              <Timer size={12} weight="bold" className="text-woven-text-muted" />
              <span className="text-[15px] tabular-nums tracking-tight">
                {String(stepNumber).padStart(2, '0')}
              </span>
              <span className="text-woven-text-muted"> / </span>
              <span className="text-[15px] tabular-nums tracking-tight">
                {String(totalSteps).padStart(2, '0')}
              </span>
            </div>
          </div>
          <div className="w-px self-stretch bg-woven-border/25" />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              className={cn(HUD_BTN, !(isPlaying || isPaused) && 'opacity-50')}
              disabled={!isPlaying && !isPaused}
            >
              {isPaused ? <Play size={15} weight="bold" /> : <Pause size={15} weight="bold" />}
            </button>
            <button type="button" onClick={onHome} className={HUD_BTN}>
              <House size={15} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

interface TutorialGridProps {
  activePosition: number | null;
  gridRef: React.RefObject<HTMLDivElement | null>;
  cellRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  showPlayButton?: boolean;
  onPlay?: () => void;
  gridSize: number;
  showCenterMarker?: boolean;
}

const TutorialGrid = memo(function TutorialGrid({
  activePosition,
  gridRef,
  cellRefs,
  showPlayButton,
  onPlay,
  gridSize,
  showCenterMarker = true,
}: TutorialGridProps) {
  const rows = [
    [GRID_MAP[0], GRID_MAP[1], GRID_MAP[2]],
    [GRID_MAP[3], GRID_MAP[4], GRID_MAP[5]],
    [GRID_MAP[6], GRID_MAP[7], GRID_MAP[8]],
  ];

  return (
    <div ref={gridRef} className="relative" style={{ width: gridSize, height: gridSize }}>
      <div
        className={cn(
          'relative grid grid-cols-1 gap-3 p-4 rounded-2xl aspect-square overflow-hidden',
          'bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border border-woven-border/60 shadow-sm shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)]',
        )}
      >
        <CanvasWeave />
        {rows.map((rowCells, rowIdx) => (
          <div key={`row-${rowIdx}`} className="grid grid-cols-3 gap-3">
            {rowCells.map((logicPos) => {
              if (logicPos === null) {
                return <div key="center" className="bg-transparent" />;
              }
              const isActive = activePosition === logicPos;
              return (
                <div
                  key={logicPos}
                  ref={(el) => {
                    if (el) cellRefs.current.set(logicPos, el);
                  }}
                  data-position={logicPos}
                  className={cn(
                    'relative rounded-xl z-10 bg-woven-cell-rest border border-woven-border',
                    isActive ? 'scale-100' : 'scale-[0.98]',
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-0 rounded-xl bg-woven-cell-active',
                      isActive ? 'opacity-100 shadow-lg' : 'opacity-0',
                    )}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!showPlayButton && showCenterMarker && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-6 h-0.5 rounded-sm bg-woven-focus" />
        </div>
      )}
      {showPlayButton && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            type="button"
            onClick={onPlay}
            className="w-16 h-16 rounded-full bg-woven-text hover:opacity-90 flex items-center justify-center transition-all hover:scale-105 active:brightness-90 pointer-events-auto backdrop-blur-md backdrop-saturate-150"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-woven-bg ml-1"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});

export interface TutorialEngineProps {
  spec: TutorialSpec;
  audioAdapter: AudioPort;
  onExit: () => void;
  onComplete: (report?: TutorialCompletionReport) => void;
  startAtStep?: number;
  onStepChange?: (stepIndex: number) => void;
}

export function TutorialEngine({
  spec,
  audioAdapter,
  onExit,
  onComplete,
  startAtStep,
  onStepChange,
}: TutorialEngineProps) {
  const { t } = useTranslation();
  const layout = useTutorialLayout();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameZoneRef = useRef<HTMLDivElement>(null);

  const timelineRef = useRef<GsapTimelineHandle>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLDivElement>(null);
  const letterSpanRef = useRef<HTMLDivElement>(null);
  const posTravelerRef = useRef<HTMLDivElement>(null);
  const audioTravelerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingItemRef = useRef<TimelineItem | null>(null);

  const hudRef = useRef<HTMLDivElement>(null);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const controlsWrapperRef = useRef<HTMLDivElement>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [spotlightComplete, setSpotlightComplete] = useState(startAtStep !== undefined);

  // Button "active" used to emulate a press flash.
  // We now rely on GameControls' built-in pointer flash (nd-flash-active) for the game-like feel.
  const [pressError, setPressError] = useState<{ position: boolean; audio: boolean }>({
    position: false,
    audio: false,
  });
  const pressErrorTimeoutsRef = useRef<{ position: number | null; audio: number | null }>({
    position: null,
    audio: null,
  });

  const animatorRef = useRef<TutorialAnimator | null>(null);
  if (!animatorRef.current) {
    animatorRef.current = new TutorialAnimator();
  }
  const animator = animatorRef.current;

  useGSAP(
    () => {
      return () => {
        animator.killAll();
      };
    },
    { scope: gameZoneRef },
  );

  const {
    send,
    context,
    isWaiting,
    isStarting,
    isStimulus,
    isTraveling,
    isComparing,
    isResponse,
    isReorganizing,
    isPaused,
    stepIndex,
    totalSteps,
    nLevel,
    isDualPick,
    isTrace: _isTrace,
    isPlace: _isPlace,
    isMemo: _isMemo,
    awaitingResponse,
    feedbackActive,
  } = useTutorialSession({
    spec,
    audio: audioAdapter,
    onComplete,
    onExit,
    startAtStep,
  });

  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;

  useMountEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('perfTutorial')) return;
    if (!('PerformanceObserver' in window)) return;
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;

    let lastLogAt = 0;
    const observer = new PerformanceObserver((list) => {
      const now = performance.now();
      if (now - lastLogAt < 750) return;
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType !== 'longtask') continue;
        if (entry.duration < 80) continue;
        lastLogAt = now;
        // eslint-disable-next-line no-console
        console.warn(
          `[tutorial perf] longtask ${Math.round(entry.duration)}ms (step=${stepIndexRef.current})`,
        );
        break;
      }
    });

    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  });

  const currentStep = spec.steps[stepIndex] as TutorialStepSpec | undefined;
  const isStarted = stepIndex >= 0;
  // Include isStarting to avoid interface flash during audio initialization
  const showInterface = isWaiting || isStarting || isStarted;
  const stimulus = context.currentStimulus;
  const userResponse = context.userResponse;
  const isPlaying = isStimulus || isTraveling || isComparing || isResponse || isReorganizing;

  const hasExpectedMatch =
    currentStep?.expectedMatch?.position || currentStep?.expectedMatch?.audio;
  const hasExpectedSwipe = !!currentStep?.expectedSwipe;

  const assessmentStartStepIndex = spec.assessment?.startStepIndex;
  const isAssessment =
    assessmentStartStepIndex !== undefined && stepIndex >= assessmentStartStepIndex;

  // Assessment UI should feel like the real game: no timeline, no letter, bigger centered grid.
  // Compute a larger grid size using similar constraints as the classic gameplay layout.
  const assessmentGridSize = useMemo(() => {
    if (!isAssessment) return layout.gridSize;
    if (typeof window === 'undefined') return layout.gridSize;

    const viewportW = window.innerWidth;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const padding = 16;
    const gap = 16;
    const safeBottom = 16;

    const headerH = layout.hudHeight + gap;
    const controlsH = ASSESSMENT_CONTROLS_HEIGHT;

    const availableW = viewportW - padding * 2;
    const heightForGrid = viewportH - headerH - controlsH - gap - safeBottom - padding;

    const maxGridSize = Math.min(availableW, 400);
    const clamped = Math.min(Math.max(heightForGrid, 180), maxGridSize);
    return Math.round(clamped);
  }, [isAssessment, layout.gridSize, layout.controlsHeight, layout.hudHeight]);

  const hudTotalSteps =
    isAssessment && assessmentStartStepIndex !== undefined
      ? Math.max(0, totalSteps - assessmentStartStepIndex)
      : totalSteps;
  const hudStepNumber = isWaiting
    ? 0
    : isAssessment && assessmentStartStepIndex !== undefined
      ? Math.max(0, stepIndex - assessmentStartStepIndex)
      : stepIndex + 1;

  // Gate the first assessed step with an explicit transition message.
  // This keeps the gameplay UI identical to the real session (no extra HUD widgets).
  const [showAssessmentGate, setShowAssessmentGate] = useState(false);
  const assessmentGateShownRef = useRef(false);
  useEffect(() => {
    if (assessmentStartStepIndex === undefined) return;
    if (stepIndex !== assessmentStartStepIndex) return;
    if (assessmentGateShownRef.current) return;
    assessmentGateShownRef.current = true;
    setShowAssessmentGate(true);
    send({ type: 'PAUSE' });
  }, [assessmentStartStepIndex, stepIndex, send]);

  const handleAssessmentGateContinue = useCallback(() => {
    setShowAssessmentGate(false);
    send({ type: 'RESUME' });
  }, [send]);

  const showTapToContinue = isResponse && !isAssessment && !hasExpectedMatch && !hasExpectedSwipe;

  // Annotation visibility control.
  // For ACTION steps, we show the instruction only once the compare animation finished (response state),
  // then clear it immediately on the first user action (press or tap-to-continue).
  const [didActThisStep, setDidActThisStep] = useState(false);
  const [annotationPreReveal, setAnnotationPreReveal] = useState(false);
  useEffect(() => {
    setDidActThisStep(false);
    setAnnotationPreReveal(false);
  }, [stepIndex]);

  // Make the instruction appear slightly BEFORE the compare animation completes,
  // so the text reveal feels synchronized with the "=" moment.
  useEffect(() => {
    if (!isComparing) return;
    if (isAssessment) return;
    if (!currentStep) return;
    if (currentStep.intent === 'DEMO') return;
    if (!currentStep.annotationKey) return;

    // Base compare animation lasts ~0.50s at timeScale=1 (see gsap-timeline.tsx).
    // Reveal the annotation slightly BEFORE the end so it lands with the "=" moment.
    const stepTimeScale = currentStep.timeScale ?? 1;
    const effectiveTimeScale = stepTimeScale * BASE_SPEED * TIMELINE_SLOW;
    const totalSeconds = 0.5 / Math.max(0.1, effectiveTimeScale);
    const revealDelay = Math.max(0.02, totalSeconds - 0.22);

    const delayed = gsap.delayedCall(revealDelay, () => {
      setAnnotationPreReveal(true);
    });
    return () => {
      delayed.kill();
    };
  }, [
    isComparing,
    isAssessment,
    currentStep?.annotationKey,
    currentStep?.intent,
    currentStep?.timeScale,
  ]);

  // Trace mode: track position and audio responses separately
  const [_tracePositionResponded, setTracePositionResponded] = useState(false);
  const [_traceAudioResponded, setTraceAudioResponded] = useState(false);

  // Reset trace responses when step changes
  useEffect(() => {
    setTracePositionResponded(false);
    setTraceAudioResponded(false);
  }, [stepIndex]);

  const travelerContentRef = useRef<{ position: number; letter: string }>({
    position: 0,
    letter: '',
  });

  const stableOnStepChange = useEffectEvent((idx: number) => {
    onStepChange?.(idx);
  });

  useEffect(() => {
    if (stepIndex >= 0) {
      stableOnStepChange(stepIndex);
    }
  }, [stepIndex]);

  useEffect(() => {
    if (startAtStep !== undefined && isWaiting) {
      send({ type: 'START' });
    }
  }, [startAtStep, isWaiting, send]);

  useMountEffect(() => {
    return () => {
      const ePos = pressErrorTimeoutsRef.current.position;
      const eAudio = pressErrorTimeoutsRef.current.audio;
      if (ePos !== null) window.clearTimeout(ePos);
      if (eAudio !== null) window.clearTimeout(eAudio);
    };
  });

  useEffect(() => {
    if (startAtStep === undefined || !timelineRef.current) return;
    const buildItem = (stepIdx: number): TimelineItem | null => {
      if (stepIdx < 0) return null;
      const step = spec.steps[stepIdx];
      if (!step?.trial) return null;
      return {
        id: `recovery-${stepIdx}`,
        turn: stepIdx,
        position: step.trial.position,
        letter: step.trial.sound,
      };
    };
    const n1Item = buildItem(startAtStep - 1);
    const n2Item = buildItem(startAtStep - 2);
    timelineRef.current.prefill({ n: null, n1: n1Item, n2: n2Item });
  }, [startAtStep, spec.steps]);

  useGSAP(
    () => {
      if (!isStimulus) return;
      if (showAssessmentGate) return;
      if (!currentStep || !stimulus) return;
      pendingItemRef.current = {
        id: stimulus.id,
        turn: stimulus.turn,
        position: stimulus.position,
        letter: stimulus.letter,
      };
      const stepTimeScale = currentStep.timeScale ?? 1;
      const effectiveTimeScale = isAssessment ? 1 : stepTimeScale * BASE_SPEED;

      // Assessment segment: match classic Dual N-Back pacing.
      // - stimulus: 0.5s
      // - ISI / response window: handled by spec.assessment.responseWindowMs (set to 3000ms)
      const stimulusDurationMs = isAssessment
        ? 500
        : (spec.timing?.stimulusDurationMs ?? THRESHOLDS.sessionTiming.tutorialStimulus);
      const stimulusDuration = stimulusDurationMs / 1000 / effectiveTimeScale;
      const delayedCall = gsap.delayedCall(stimulusDuration, () => {
        send({ type: 'STIMULUS_SHOWN' });
      });
      return () => {
        delayedCall.kill();
      };
    },
    {
      scope: gameZoneRef,
      dependencies: [
        isStimulus,
        showAssessmentGate,
        isAssessment,
        currentStep,
        stimulus,
        send,
        spec.timing?.stimulusDurationMs,
      ],
    },
  );

  useEffect(() => {
    if (!isStimulus || !stimulus?.letter) return;
    if (showAssessmentGate) return;
    audioAdapter.play(stimulus.letter as Sound);
  }, [isStimulus, showAssessmentGate, stimulus?.letter, audioAdapter]);

  useGSAP(
    () => {
      if (!isTraveling) return;

      // Assessment segment: no travel animation and no visible timeline.
      if (isAssessment) {
        pendingItemRef.current = null;
        send({ type: 'TRAVEL_COMPLETE' });
        return;
      }

      const posTraveler = posTravelerRef.current;
      const audioTraveler = audioTravelerRef.current;
      const gridEl = gridRef.current;
      const letterEl = letterRef.current;
      const container = gameZoneRef.current;
      const timeline = timelineRef.current;
      const slots = timeline?.getSlotRefs();
      const posNSlot = slots?.posN;
      const audioNSlot = slots?.audioN;

      if (
        !posTraveler ||
        !audioTraveler ||
        !gridEl ||
        !letterEl ||
        !posNSlot ||
        !audioNSlot ||
        !container ||
        !timeline
      ) {
        const item = pendingItemRef.current;
        if (item && timeline) {
          timeline.addItem(item, () => {});
          pendingItemRef.current = null;
        }
        send({ type: 'TRAVEL_COMPLETE' });
        return;
      }

      const stepTimeScale = currentStep?.timeScale ?? 1;
      const effectiveTimeScale = stepTimeScale * BASE_SPEED * TRAVEL_BOOST;

      const item = pendingItemRef.current;
      if (item) {
        travelerContentRef.current = { position: item.position, letter: item.letter };
        const posGrid = posTraveler.querySelector('.grid');
        if (posGrid) {
          const gridChildren = posGrid.children;
          for (let idx = 0; idx < gridChildren.length; idx++) {
            const logicPos = GRID_MAP[idx];
            if (logicPos === null) continue;
            const cell = gridChildren[idx];
            if (cell) {
              cell.className = `rounded-[2px] ${logicPos === item.position ? 'bg-visual' : 'bg-woven-cell-rest'}`;
            }
          }
        }
        const letterSpan = audioTraveler.querySelector('span');
        if (letterSpan) {
          letterSpan.textContent = item.letter;
        }
      }

      const tl = animator.travel(
        {
          container,
          grid: gridEl,
          letter: letterEl,
          posNSlot,
          audioNSlot,
          posTraveler,
          audioTraveler,
          activeCell: null,
          letterSpan: letterSpanRef.current,
        },
        effectiveTimeScale,
        () => {
          const item = pendingItemRef.current;
          if (item && timeline) {
            timeline.addItem(item, () => {});
            pendingItemRef.current = null;
          }
          send({ type: 'TRAVEL_COMPLETE' });
        },
      );

      return () => {
        tl.kill();
      };
    },
    {
      scope: gameZoneRef,
      dependencies: [isTraveling, isAssessment, currentStep?.timeScale, send],
    },
  );

  useGSAP(
    () => {
      if (!isComparing) return;

      // Assessment segment: no compare animation (real-game feel).
      if (isAssessment) {
        send({ type: 'COMPARE_COMPLETE' });
        return;
      }

      const timeline = timelineRef.current;
      const matchPos = !!currentStep?.expectedMatch?.position;
      const matchAudio = !!currentStep?.expectedMatch?.audio;
      const stepTimeScale = currentStep?.timeScale ?? 1;
      const effectiveTimeScale = stepTimeScale * BASE_SPEED * TIMELINE_SLOW;
      if (timeline) {
        timeline.showCompare(
          matchPos,
          matchAudio,
          () => {
            send({ type: 'COMPARE_COMPLETE' });
          },
          effectiveTimeScale,
        );
      } else {
        send({ type: 'COMPARE_COMPLETE' });
      }
    },
    {
      scope: gameZoneRef,
      dependencies: [
        isComparing,
        isAssessment,
        currentStep?.expectedMatch?.position,
        currentStep?.expectedMatch?.audio,
        currentStep?.timeScale,
        send,
      ],
    },
  );

  useGSAP(
    () => {
      if (!awaitingResponse || !containerRef.current) return;
      if (isAssessment) return;
      const root = containerRef.current;
      const tweens: gsap.core.Tween[] = [];
      const pulsedElements: HTMLElement[] = [];

      const expected = currentStep?.expectedMatch;
      const currentMatch = userResponse.match || { position: false, audio: false };
      const posIncorrect = !!expected?.position !== !!currentMatch.position;
      const audioIncorrect = !!expected?.audio !== !!currentMatch.audio;

      // IMPORTANT: Kill any existing tweens on BOTH buttons FIRST to prevent
      // leftover pulses from previous steps (e.g. transitioning from position
      // match to audio-only match)
      const posBtn = root.querySelector('[data-testid="btn-match-position"]') as HTMLElement | null;
      const audioBtn = root.querySelector('[data-testid="btn-match-audio"]') as HTMLElement | null;
      if (posBtn) {
        gsap.killTweensOf(posBtn);
        gsap.set(posBtn, { clearProps: 'transform,boxShadow' });
      }
      if (audioBtn) {
        gsap.killTweensOf(audioBtn);
        gsap.set(audioBtn, { clearProps: 'transform,boxShadow' });
      }

      const pulse = (el: HTMLElement, glowColor: string) => {
        pulsedElements.push(el);
        const tween = animator.pulse(el, glowColor);
        tweens.push(tween);
      };

      if (posIncorrect && posBtn) {
        pulse(posBtn, 'rgba(51,126,169,0.25)');
      }
      if (audioIncorrect && audioBtn) {
        pulse(audioBtn, 'rgba(66,138,109,0.25)');
      }

      return () => {
        for (let i = 0; i < tweens.length; i++) {
          const el = pulsedElements[i];
          const tween = tweens[i];
          if (el && tween) {
            animator.clearPulse(el, tween);
          }
        }
      };
    },
    {
      scope: containerRef,
      dependencies: [
        awaitingResponse,
        isAssessment,
        currentStep?.expectedMatch?.position,
        currentStep?.expectedMatch?.audio,
        userResponse.match?.position,
        userResponse.match?.audio,
      ],
    },
  );

  useGSAP(
    () => {
      // Defensive cleanup: ensure we never carry GSAP pulses between steps.
      if (awaitingResponse || !containerRef.current) return;
      const root = containerRef.current;
      const posBtn = root.querySelector('[data-testid="btn-match-position"]') as HTMLElement | null;
      const audioBtn = root.querySelector('[data-testid="btn-match-audio"]') as HTMLElement | null;
      if (posBtn) {
        gsap.killTweensOf(posBtn);
        gsap.set(posBtn, { clearProps: 'transform,boxShadow' });
      }
      if (audioBtn) {
        gsap.killTweensOf(audioBtn);
        gsap.set(audioBtn, { clearProps: 'transform,boxShadow' });
      }
    },
    {
      scope: containerRef,
      dependencies: [awaitingResponse, stepIndex],
    },
  );

  useGSAP(
    () => {
      if (!isReorganizing) return;

      // Assessment segment: keep rhythm tight (no timeline animations).
      if (isAssessment) {
        send({ type: 'REORG_COMPLETE' });
        return;
      }

      const timeline = timelineRef.current;
      const stepTimeScale = currentStep?.timeScale ?? 1;
      const effectiveTimeScale = stepTimeScale * BASE_SPEED * TIMELINE_SLOW;
      if (timeline) {
        timeline.hideCompare(() => {
          timeline.reorganize(() => {
            send({ type: 'REORG_COMPLETE' });
          }, effectiveTimeScale);
        }, effectiveTimeScale);
      } else {
        send({ type: 'REORG_COMPLETE' });
      }
    },
    {
      scope: gameZoneRef,
      dependencies: [isReorganizing, isAssessment, currentStep?.timeScale, send],
    },
  );

  const handleResponse = useCallback(
    (type: 'position' | 'audio' | 'sound', value?: string) => {
      const canRespondNow =
        isResponse || (isAssessment && (isStimulus || isTraveling || isComparing));
      if (!canRespondNow) return;

      setDidActThisStep(true);
      setAnnotationPreReveal(false);

      const flashError = (key: 'position' | 'audio') => {
        const prev = pressErrorTimeoutsRef.current[key];
        if (prev !== null) window.clearTimeout(prev);

        // If already in error state, toggle off/on to retrigger CSS animation.
        setPressError((p) => ({ ...p, [key]: false }));
        window.requestAnimationFrame(() => {
          setPressError((p) => ({ ...p, [key]: true }));
          pressErrorTimeoutsRef.current[key] = window.setTimeout(() => {
            setPressError((p) => ({ ...p, [key]: false }));
            pressErrorTimeoutsRef.current[key] = null;
          }, BUTTON_ERROR_FLASH_MS);
        });
      };

      // Mouse/touch press flash is handled by GameControls (nd-flash-active).
      // We only keep tutorial-specific feedback here (error flash, guided gating).
      if (!isDualPick && !isAssessment && (type === 'position' || type === 'audio')) {
        const key = type;
        const expected = currentStep?.expectedMatch;
        const expects = key === 'position' ? !!expected?.position : !!expected?.audio;
        if (!expects) {
          flashError(key);
          return;
        }
        // Idempotent: ignore repeat presses on already-selected channels.
        if (userResponse.match?.[key]) {
          return;
        }
      }

      const channel = isDualPick && type === 'audio' ? 'sound' : type;
      send({ type: 'RESPOND', channel: channel as 'position' | 'audio' | 'sound', value });
    },
    [
      isResponse,
      isDualPick,
      isAssessment,
      isStimulus,
      isTraveling,
      isComparing,
      currentStep?.expectedMatch?.position,
      currentStep?.expectedMatch?.audio,
      userResponse.match?.position,
      userResponse.match?.audio,
      send,
      setDidActThisStep,
    ],
  );

  const handleStart = useCallback(() => send({ type: 'START' }), [send]);
  const handleTapToContinue = useCallback(() => {
    if (showTapToContinue) {
      setDidActThisStep(true);
      setAnnotationPreReveal(false);
      send({ type: 'ADVANCE' });
    }
  }, [showTapToContinue, send, setDidActThisStep]);
  const handleHomeClick = useCallback(() => setShowExitConfirm(true), []);
  const handleExitCancel = useCallback(() => setShowExitConfirm(false), []);
  const handleExitConfirm = useCallback(() => {
    setShowExitConfirm(false);
    send({ type: 'STOP' });
  }, [send]);
  const handlePause = useCallback(() => send({ type: 'PAUSE' }), [send]);
  const handleResume = useCallback(() => send({ type: 'RESUME' }), [send]);

  const targetRefMap = useMemo(
    () =>
      ({
        hud: hudRef,
        timeline: timelineWrapperRef,
        grid: gridWrapperRef,
        controls: controlsWrapperRef,
        letter: letterRef,
        annotation: null,
        // Place tutorial targets (not yet implemented)
        cardPool: null,
        // Memo tutorial targets (not yet implemented)
        recallZone: null,
        validateButton: null,
      }) as const satisfies Record<SpotlightTarget, React.RefObject<HTMLElement | null> | null>,
    [],
  );

  const spotlightSteps = useMemo((): SpotlightStep[] => {
    const spotlightConfig = spec.spotlight;
    if (!spotlightConfig?.steps) return [];
    const steps: SpotlightStep[] = [];
    for (const stepSpec of spotlightConfig.steps) {
      const ref = targetRefMap[stepSpec.target];
      if (ref) {
        steps.push({
          id: stepSpec.id,
          target: ref,
          content: t(stepSpec.contentKey),
          position: stepSpec.position ?? 'bottom',
        });
      }
    }
    return steps;
  }, [spec.spotlight, targetRefMap, t]);

  const gameControls = useMemo(
    () => [
      {
        id: 'position' as const,
        label: t('game.controls.position'),
        shortcut: 'A' as const,
        color: 'visual' as const,
        // Let GameControls handle the mouse/touch flash (`nd-flash-active`) like in the game page.
        // Keep `active` for keyboard/claimed-press semantics only.
        active: false,
        error: pressError.position,
        onClick: () => handleResponse('position'),
        highlighted:
          awaitingResponse &&
          !!currentStep?.expectedMatch?.position !== !!userResponse.match?.position,
      },
      {
        id: 'audio' as const,
        label: t('game.controls.audio'),
        shortcut: 'L' as const,
        color: 'audio' as const,
        // Let GameControls handle the mouse/touch flash (`nd-flash-active`) like in the game page.
        // Keep `active` for keyboard/claimed-press semantics only.
        active: false,
        error: pressError.audio,
        onClick: () => handleResponse('audio'),
        highlighted:
          awaitingResponse && !!currentStep?.expectedMatch?.audio !== !!userResponse.match?.audio,
      },
    ],
    [
      t,
      pressError.position,
      pressError.audio,
      awaitingResponse,
      currentStep?.expectedMatch?.position,
      currentStep?.expectedMatch?.audio,
      handleResponse,
    ],
  );

  const handleSpotlightComplete = useCallback(() => {
    setSpotlightComplete(true);
    // Small delay to let the interface settle before the first stimulus audio.
    window.setTimeout(() => {
      send({ type: 'START' });
    }, 350);
  }, [send]);

  // CRITICAL for iOS: Resume audio context during user gesture, before animation delays.
  // Without this, the "outro" button click → animation delay → audio.init() fails on iOS
  // because the user gesture context is lost during the animation.
  const handleImmediateAudioResume = useCallback(() => {
    void audioAdapter.resume();
  }, [audioAdapter]);

  const showSpotlight = isWaiting && !spotlightComplete && startAtStep === undefined;

  const gridStyle = {
    display: 'grid' as const,
    gridTemplateRows: isAssessment
      ? `${layout.hudHeight}px 1fr 0px ${ASSESSMENT_CONTROLS_HEIGHT}px`
      : layout.gridTemplateRows,
    gridTemplateAreas: layout.gridTemplateAreas,
    gap: isAssessment ? '16px' : `${layout.gap}px`,
    alignContent: layout.isMobile ? ('stretch' as const) : ('start' as const),
    // Use parent height from MainLayout (already safe-area aware via pt-safe).
    // Subtracting safe-top again here can compress the tutorial on some Android WebViews.
    height: '100%',
    padding: '12px',
    paddingTop: '8px',
    // In assessment, rely on controls pb-safe like the real game.
    paddingBottom: isAssessment ? '12px' : 'max(12px, env(safe-area-inset-bottom, 12px))',
  };

  return (
    <div ref={containerRef} className="relative bg-woven-bg overflow-hidden" style={gridStyle}>
      <CanvasWeave lineCount={8} className="opacity-[0.25]" />

      {/* HUD always visible so the Home button is never blocked */}
      <div ref={hudRef} style={{ gridArea: 'hud' }} className="relative z-[2600]">
        <TutorialHUD
          nLevel={nLevel}
          stepNumber={hudStepNumber}
          totalSteps={hudTotalSteps}
          isPaused={isPaused}
          isPlaying={isPlaying}
          onPause={handlePause}
          onResume={handleResume}
          onHome={handleHomeClick}
        />
      </div>

      {showInterface && (
        <>
          <div
            ref={gameZoneRef}
            style={{ gridArea: 'gameZone' }}
            className={cn(
              'relative flex flex-col items-center z-10 min-h-0 overflow-hidden',
              isAssessment
                ? 'justify-center pt-0'
                : layout.isMobile
                  ? 'justify-start pt-1'
                  : 'justify-start pt-0',
            )}
          >
            <div
              ref={timelineWrapperRef}
              className={cn(
                'w-full max-w-md overflow-hidden transition-all duration-300 ease-out',
                isAssessment
                  ? 'max-h-0 opacity-0 pointer-events-none'
                  : 'max-h-[320px] opacity-100',
              )}
            >
              <GsapTimeline ref={timelineRef} className="w-full" opacity={1} t={t} />
            </div>

            {/* Pause / status row */}
            {isAssessment ? (
              // Match classic game behavior: reserve space to avoid layout shift on pause.
              <div className="h-6 flex items-center justify-center mb-2">
                {isPaused && (
                  <p className="text-sm text-woven-text-muted">
                    {t('game.status.paused', 'En pause')}
                  </p>
                )}
              </div>
            ) : (
              // Guided tutorial: don't reserve vertical space.
              isPaused && (
                <div className="flex items-center justify-center mt-1">
                  <p className="text-sm text-woven-text-muted">
                    {t('game.status.paused', 'En pause')}
                  </p>
                </div>
              )
            )}

            <div
              ref={gridWrapperRef}
              className={cn('relative', !isAssessment && !layout.isMobile ? 'mt-4' : 'mt-0')}
            >
              <TutorialGrid
                activePosition={stimulus?.position ?? null}
                gridRef={gridRef}
                cellRefs={cellRefs}
                showPlayButton={false}
                onPlay={handleStart}
                gridSize={isAssessment ? assessmentGridSize : layout.gridSize}
                showCenterMarker
              />
              {!isAssessment && (
                <div
                  ref={letterRef}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                >
                  <div
                    ref={letterSpanRef}
                    className={cn(
                      'w-14 h-14 rounded-xl bg-white shadow-lg flex items-center justify-center',
                      stimulus ? 'opacity-100 scale-100' : 'opacity-0 scale-90',
                    )}
                    style={{ willChange: 'transform, opacity' }}
                  >
                    <span className="text-3xl font-bold text-audio">{stimulus?.letter ?? ''}</span>
                  </div>
                </div>
              )}
              {showTapToContinue && (
                <button
                  type="button"
                  onClick={handleTapToContinue}
                  className="absolute inset-0 z-30 flex items-center justify-center cursor-pointer"
                >
                  <span className="text-woven-text font-medium text-sm sm:text-base px-4 py-2 rounded-full bg-woven-surface/90 border border-woven-border shadow-sm">
                    {t('tutorial.tapToContinue', 'Appuyez pour continuer')}
                  </span>
                </button>
              )}
              {/* Pause overlay - at gridWrapper level for proper z-index stacking */}
              {isPaused && (
                <div className="absolute inset-0 z-40 backdrop-blur-[2px] bg-woven-bg/25 rounded-2xl flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleResume}
                    className="w-16 h-16 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-all hover:scale-105 active:brightness-90 backdrop-blur-md backdrop-saturate-150 shadow-lg shadow-amber-500/25"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-8 h-8 text-white ml-1"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <div
              ref={posTravelerRef}
              className="absolute pointer-events-none flex items-center justify-center z-[200] opacity-0 left-0 top-0"
            >
              <WovenMiniGrid position={travelerContentRef.current.position} />
            </div>
            <div
              ref={audioTravelerRef}
              className="absolute pointer-events-none flex items-center justify-center z-[200] opacity-0 left-0 top-0"
            >
              <WovenMiniLetter letter={travelerContentRef.current.letter} />
            </div>
          </div>

          <div
            style={{ gridArea: 'annotation' }}
            className={cn(
              'flex justify-center',
              layout.isMobile ? 'items-center' : 'items-start pt-2',
            )}
          >
            {!isAssessment && (
              <AnnotationZone
                // For ACTION steps, do not show text during stimulus/travel/compare; show only when responding,
                // and clear immediately on the first action (keep the card visible).
                annotationKey={
                  isWaiting
                    ? ''
                    : currentStep?.intent === 'DEMO'
                      ? currentStep?.annotationKey || ''
                      : (isResponse || annotationPreReveal) && !didActThisStep
                        ? currentStep?.annotationKey || ''
                        : ''
                }
                className="w-full max-w-md mx-auto"
              />
            )}
          </div>

          <div
            ref={controlsWrapperRef}
            style={{ gridArea: 'controls' }}
            className={cn(
              'flex items-center justify-center',
              // Match classic game safe-bottom behavior
              isAssessment ? 'pb-safe' : '',
            )}
          >
            {/* NeuroDual Lite: Only classic (dualnback-classic) controls */}
            <div
              className={cn(
                'w-full flex justify-center',
                // Classic page doesn't add extra horizontal padding here.
                isAssessment ? '' : 'px-4',
              )}
            >
              <GameControls
                disabled={isWaiting || (!isResponse && !isAssessment)}
                scale={isAssessment ? 1.0 : Math.min(1, layout.buttonScale)}
                controls={gameControls}
                width={isAssessment ? assessmentGridSize : layout.gridSize}
              />
            </div>
          </div>

          {showAssessmentGate && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-woven-bg/70 backdrop-blur-[2px]" />
              <div className="relative w-full max-w-md bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border border-woven-border/60 shadow-sm rounded-2xl shadow-lg overflow-hidden">
                <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--woven-border)/0.25),transparent_55%)]" />
                </div>
                <div className="relative p-5 sm:p-6">
                  <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">
                    {t('tutorial.assessment.title', 'Assessment phase')}
                  </div>
                  <div className="text-woven-text text-base sm:text-lg font-semibold leading-snug mb-3">
                    {t(
                      'tutorial.assessment.subtitle',
                      "À partir de maintenant, c'est une mini-partie classique.",
                    )}
                  </div>
                  <div className="text-woven-text-muted text-sm sm:text-base leading-relaxed mb-5">
                    {t(
                      'tutorial.assessment.body',
                      "Le rythme est continu et il n'y aura plus de consignes. Jouez comme en session.",
                    )}
                    {spec.assessment?.minAccuracy !== undefined &&
                      assessmentStartStepIndex !== undefined && (
                        <div className="mt-3">
                          {t(
                            'tutorial.assessment.goal',
                            'Objectif: au moins {{min}}% de réussite sur {{count}} tours.',
                            {
                              min: Math.round(spec.assessment.minAccuracy * 100),
                              count: Math.max(0, totalSteps - assessmentStartStepIndex),
                            },
                          )}
                        </div>
                      )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAssessmentGateContinue}
                    className="w-full rounded-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold py-3 transition-all"
                  >
                    {t('tutorial.assessment.cta', "C'est parti")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSpotlight && (
            <SpotlightOverlay
              steps={spotlightSteps}
              onComplete={handleSpotlightComplete}
              onImmediateComplete={handleImmediateAudioResume}
              introMessage={
                spec.spotlight?.introMessageKey ? t(spec.spotlight.introMessageKey) : undefined
              }
              introButtonText={
                spec.spotlight?.introButtonKey
                  ? t(spec.spotlight.introButtonKey)
                  : t('tutorial.spotlight.continue', 'Continuer')
              }
              outroMessage={
                spec.spotlight?.outroMessageKey ? t(spec.spotlight.outroMessageKey) : undefined
              }
              outroButtonText={
                spec.spotlight?.outroButtonKey
                  ? t(spec.spotlight.outroButtonKey)
                  : t('tutorial.spotlight.start', 'Commencer')
              }
              gridRef={gridWrapperRef}
            />
          )}

          <div
            className={cn(
              'fixed inset-0 pointer-events-none z-[5] transition-opacity duration-200',
              feedbackActive ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              background:
                'radial-gradient(circle at center, hsl(var(--woven-correct) / 0.06) 0%, transparent 60%)',
            }}
          />
        </>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-[2700] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('common.close', 'Close')}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
            onClick={handleExitCancel}
            onKeyDown={(e) => e.key === 'Escape' && handleExitCancel()}
          />
          <div className="relative bg-woven-surface/80 backdrop-blur-lg backdrop-saturate-150 border border-woven-border/60 shadow-sm rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold text-woven-text mb-2">
              {t('tutorial.exit.title', 'Quit the tutorial?')}
            </h2>
            <p className="text-sm text-woven-text-muted mb-6">
              {t('tutorial.exit.message', 'Your progress will be saved. You can resume later.')}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={handleExitCancel}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <button
                type="button"
                onClick={handleExitConfirm}
                className="px-4 py-2 bg-woven-incorrect hover:opacity-90 text-white font-medium rounded-lg transition-opacity"
              >
                {t('tutorial.exit.confirm', 'Quit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
