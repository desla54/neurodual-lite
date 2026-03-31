import type {
  CSSProperties,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasWeave, cn } from '@neurodual/ui';
import { ArrowClockwise, Check, Warning, X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  BALL_DIAMETER,
  BALL_IDS,
  getTrackIdentityColor,
  type Phase,
  type SelectionControlId,
  type SelectionControlOffset,
  type TrackFeedbackState,
  type TrackIdentityColor,
  type TrackIdentityColorId,
  type TrackIdentityVisualColorId,
} from '../../lib/dual-track-runtime';
import {
  getTrackIdentityPromptSvgHtml,
  TrackIdentityPromptIcon,
  type TrackVisualIdentityPrompt,
} from './dual-track-identity-display';
import { DualTrackIdleState } from './dual-track-idle-state';
import { DualTrackSelectionOverlay } from './dual-track-selection-overlay';
import { getStimulusDisplayLabel } from './dual-track-stimulus-display';
import { DualTrack3dArena } from './dual-track-3d-arena';
import { DualTrackWebglArena } from './dual-track-webgl-arena';

/** Returns raw SVG HTML string for a shape (used by GSAP traveler animation). */
export function getShapeSvgHtml(
  shape: TrackVisualIdentityPrompt,
  size: number,
  color: string,
): string {
  return getTrackIdentityPromptSvgHtml(shape, size, color);
}

interface DualTrackArenaProps {
  readonly arenaRef: RefObject<HTMLDivElement | null>;
  readonly shapeTravelerRef: RefObject<HTMLDivElement | null>;
  readonly phase: Phase;
  readonly countdown: number;
  readonly isPaused: boolean;
  readonly calibrationPending: boolean;
  readonly totalRounds: number;
  readonly displayedTargetCount: number;
  readonly displayedDistractorCount: number;
  readonly showJourneyTierSummary: boolean;
  readonly currentJourneyTierValue: number | null;
  readonly currentJourneyTierCount: number;
  readonly journeyTierHelpText: string;
  readonly adaptivePathEnabled: boolean;
  readonly pathLoaded: boolean;
  readonly isLaunching: boolean;
  readonly launchHint?: string | null;
  readonly showBalls: boolean;
  readonly showWebglRenderer: boolean;
  readonly show3dRenderer: boolean;
  readonly usingWebglArena: boolean;
  readonly using3dArena: boolean;
  readonly usingWebglVisuals: boolean;
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly currentRoundTotalObjects: number;
  readonly ballPositionsRef: MutableRefObject<readonly { x: number; y: number }[]>;
  readonly selectedIndices: readonly number[];
  readonly targetIndices: readonly number[];
  readonly selectedIndexSet: ReadonlySet<number>;
  readonly targetIndexSet: ReadonlySet<number>;
  readonly focusCrossRef: RefObject<HTMLDivElement | null>;
  readonly colorIdentityEnabled: boolean;
  readonly activeTrackingLetterAudioEnabled: boolean;
  readonly targetColorByBall: Partial<Record<number, TrackIdentityColorId>>;
  readonly feedbackState: TrackFeedbackState;
  readonly feedbackCorrectSet: ReadonlySet<number>;
  readonly feedbackWrongIdentitySet: ReadonlySet<number>;
  readonly feedbackWrongDistractorSet: ReadonlySet<number>;
  readonly feedbackMissedSet: ReadonlySet<number>;
  readonly activeSequentialHighlightTargetId?: number;
  readonly activeSequentialHighlightColor?: TrackIdentityColor | null;
  readonly activeSequentialHighlightLetter?: string;
  readonly activeSequentialHighlightTone?: string;
  readonly activeSequentialHighlightPromptIndex?: number | null;
  readonly selectionPass: 'letters' | 'colors' | null;
  readonly letterPassSelections: readonly number[];
  readonly selectionPromptOrder: readonly number[];
  readonly identityPromptLetters: readonly string[];
  readonly selectionColorByBall: Partial<Record<number, TrackIdentityVisualColorId>>;
  readonly phaseLabel: string;
  readonly canConfirmSelection: boolean;
  readonly currentPromptColor: TrackIdentityColor | null;
  readonly currentPromptColorLabel: string | null;
  readonly currentPromptLetter?: string;
  readonly currentPromptTone?: string;
  readonly currentPromptShape?: TrackVisualIdentityPrompt;
  readonly identityPromptShapes?: readonly TrackVisualIdentityPrompt[];
  readonly identityPromptTones?: readonly string[];
  readonly selectionControlOffsets: Record<SelectionControlId, SelectionControlOffset>;
  readonly onStart: () => void;
  readonly onRestart: () => void;
  readonly onBallTap: (id: number) => void;
  readonly bindBallElement: (id: number, element: HTMLDivElement | null) => void;
  readonly onWebglReadyChange: (ready: boolean) => void;
  readonly getBallScreenPositionRef?: {
    current: ((id: number) => { x: number; y: number; size: number } | null) | null;
  };
  readonly onInstructionRef: (element: HTMLDivElement | null) => void;
  readonly onConfirmRef: (element: HTMLDivElement | null) => void;
  readonly onStartDrag: (
    controlId: SelectionControlId,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly onMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onEndDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onConfirmSelection: () => void;
}

/** Projects HTML overlays (identities, selection labels, feedback icons) onto 3D ball positions. */
function DualTrack3dBallOverlay({
  ballCount,
  phase,
  getBallScreenPositionRef,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  activeSequentialHighlightLetter,
  activeSequentialHighlightTone,
  revealedShapeByBall,
  selectedBallLabel,
  selectedBallShape,
  feedbackCorrectSet,
  feedbackWrongIdentitySet,
  feedbackWrongDistractorSet,
  feedbackMissedSet,
}: {
  readonly ballCount: number;
  readonly phase: Phase;
  readonly getBallScreenPositionRef?: {
    current: ((id: number) => { x: number; y: number; size: number } | null) | null;
  };
  readonly activeSequentialHighlightTargetId?: number;
  readonly activeSequentialHighlightColor?: TrackIdentityColor | null;
  readonly activeSequentialHighlightLetter?: string;
  readonly activeSequentialHighlightTone?: string;
  readonly revealedShapeByBall: Partial<Record<number, TrackVisualIdentityPrompt>>;
  readonly selectedBallLabel: Partial<Record<number, string>>;
  readonly selectedBallShape: Partial<Record<number, TrackVisualIdentityPrompt>>;
  readonly feedbackCorrectSet: ReadonlySet<number>;
  readonly feedbackWrongIdentitySet: ReadonlySet<number>;
  readonly feedbackWrongDistractorSet: ReadonlySet<number>;
  readonly feedbackMissedSet: ReadonlySet<number>;
}): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayElsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let active = true;
    let rafId: number;
    const update = () => {
      if (!active) return;
      const getPos = getBallScreenPositionRef?.current;
      const container = containerRef.current;
      if (getPos && container) {
        const rect = container.getBoundingClientRect();
        for (let i = 0; i < ballCount; i++) {
          const el = overlayElsRef.current[i];
          if (!el) continue;
          const pos = getPos(i);
          if (!pos) {
            el.style.opacity = '0';
            continue;
          }
          el.style.opacity = '1';
          el.style.left = `${pos.x - rect.left}px`;
          el.style.top = `${pos.y - rect.top}px`;
          el.style.transform = `translate(-50%, -50%) scale(${pos.size / BALL_DIAMETER})`;
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [ballCount, getBallScreenPositionRef]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-[5]">
      {Array.from({ length: ballCount }, (_, id) => (
        <div
          key={id}
          ref={(el) => {
            overlayElsRef.current[id] = el;
          }}
          className="absolute flex items-center justify-center rounded-full opacity-0"
          style={{ width: BALL_DIAMETER, height: BALL_DIAMETER }}
        >
          {phase === 'highlight' &&
          activeSequentialHighlightTargetId === id &&
          (activeSequentialHighlightLetter || activeSequentialHighlightTone) ? (
            <span
              className="flex h-full w-full items-center justify-center text-sm font-black tracking-[0.08em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
              style={{ color: activeSequentialHighlightColor?.text ?? '#fff' }}
            >
              {activeSequentialHighlightLetter ??
                getStimulusDisplayLabel(activeSequentialHighlightTone ?? '')}
            </span>
          ) : phase === 'highlight' && revealedShapeByBall[id] ? (
            <span className="flex h-full w-full items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
              <TrackIdentityPromptIcon prompt={revealedShapeByBall[id]} size={20} color="#1a1a1a" />
            </span>
          ) : null}

          {phase === 'selection' && selectedBallLabel[id] ? (
            <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              {selectedBallLabel[id]}
            </span>
          ) : phase === 'selection' && selectedBallShape[id] ? (
            <span className="flex h-full w-full items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <TrackIdentityPromptIcon prompt={selectedBallShape[id]} size={18} color="#e2e8f0" />
            </span>
          ) : null}

          {phase === 'feedback' && feedbackCorrectSet.has(id) ? (
            <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <Check size={18} weight="bold" />
            </span>
          ) : phase === 'feedback' && feedbackWrongDistractorSet.has(id) ? (
            <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <X size={18} weight="bold" />
            </span>
          ) : phase === 'feedback' && feedbackWrongIdentitySet.has(id) ? (
            <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <Warning size={18} weight="bold" />
            </span>
          ) : phase === 'feedback' && feedbackMissedSet.has(id) ? (
            <span className="flex h-full w-full items-center justify-center text-amber-300/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <X size={16} weight="bold" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DualTrackArena({
  arenaRef,
  shapeTravelerRef,
  phase,
  countdown,
  isPaused,
  calibrationPending,
  totalRounds,
  displayedTargetCount,
  displayedDistractorCount,
  showJourneyTierSummary,
  currentJourneyTierValue,
  currentJourneyTierCount,
  journeyTierHelpText,
  adaptivePathEnabled,
  pathLoaded,
  isLaunching,
  launchHint,
  showBalls,
  showWebglRenderer,
  show3dRenderer,
  usingWebglArena,
  using3dArena,
  usingWebglVisuals,
  arenaWidth,
  arenaHeight,
  currentRoundTotalObjects,
  ballPositionsRef,
  selectedIndices,
  targetIndices,
  selectedIndexSet,
  targetIndexSet,
  focusCrossRef,
  colorIdentityEnabled,
  activeTrackingLetterAudioEnabled,
  targetColorByBall,
  feedbackState,
  feedbackCorrectSet,
  feedbackWrongIdentitySet,
  feedbackWrongDistractorSet,
  feedbackMissedSet,
  activeSequentialHighlightTargetId,
  activeSequentialHighlightColor,
  activeSequentialHighlightLetter,
  activeSequentialHighlightTone,
  activeSequentialHighlightPromptIndex,
  selectionPass,
  letterPassSelections,
  selectionPromptOrder,
  identityPromptLetters,
  selectionColorByBall,
  phaseLabel,
  canConfirmSelection,
  currentPromptColor,
  currentPromptColorLabel,
  currentPromptLetter,
  currentPromptTone,
  currentPromptShape,
  identityPromptShapes,
  identityPromptTones,
  selectionControlOffsets,
  onStart,
  onRestart,
  onBallTap,
  bindBallElement,
  onWebglReadyChange,
  getBallScreenPositionRef,
  onInstructionRef,
  onConfirmRef,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  onConfirmSelection,
}: DualTrackArenaProps): ReactNode {
  const { t } = useTranslation();
  const selectedBallLabel = useMemo(() => {
    const labels: Partial<Record<number, string>> = {};

    if (selectionPass === 'colors') {
      const colorPassSet = new Set(selectedIndices);
      for (let index = 0; index < letterPassSelections.length; index += 1) {
        const ballId = letterPassSelections[index];
        if (ballId === undefined || colorPassSet.has(ballId)) continue;
        const promptIndex = selectionPromptOrder[index];
        const promptLetter = promptIndex !== undefined ? identityPromptLetters[promptIndex] : null;
        const promptTone = promptIndex !== undefined ? identityPromptTones?.[promptIndex] : null;
        if (promptLetter) {
          labels[ballId] = promptLetter;
        } else if (promptTone) {
          labels[ballId] = getStimulusDisplayLabel(promptTone);
        }
      }
      return labels;
    }

    if (selectionPass === 'letters' || selectionPass === null) {
      for (let index = 0; index < selectedIndices.length; index += 1) {
        const ballId = selectedIndices[index];
        if (ballId === undefined) continue;
        const promptIndex = selectionPromptOrder[index];
        const promptLetter = promptIndex !== undefined ? identityPromptLetters[promptIndex] : null;
        const promptTone = promptIndex !== undefined ? identityPromptTones?.[promptIndex] : null;
        if (promptLetter) {
          labels[ballId] = promptLetter;
        } else if (promptTone) {
          labels[ballId] = getStimulusDisplayLabel(promptTone);
        }
      }
    }

    return labels;
  }, [
    identityPromptLetters,
    identityPromptTones,
    letterPassSelections,
    selectedIndices,
    selectionPass,
    selectionPromptOrder,
  ]);

  const selectedBallShape = useMemo(() => {
    const shapes: Partial<Record<number, TrackVisualIdentityPrompt>> = {};
    if (!identityPromptShapes || identityPromptShapes.length === 0) return shapes;

    if (selectionPass === 'letters' || selectionPass === null) {
      for (let index = 0; index < selectedIndices.length; index += 1) {
        const ballId = selectedIndices[index];
        if (ballId === undefined) continue;
        const promptIndex = selectionPromptOrder[index];
        const promptShape = promptIndex !== undefined ? identityPromptShapes[promptIndex] : null;
        if (promptShape) {
          shapes[ballId] = promptShape;
        }
      }
    }

    return shapes;
  }, [identityPromptShapes, selectedIndices, selectionPass, selectionPromptOrder]);

  // Map ball id → shape for targets already revealed during highlight (stays visible after animation)
  const revealedShapeByBall = useMemo(() => {
    const map: Partial<Record<number, TrackVisualIdentityPrompt>> = {};
    if (
      !identityPromptShapes ||
      identityPromptShapes.length === 0 ||
      activeSequentialHighlightPromptIndex == null
    )
      return map;
    for (let i = 0; i <= activeSequentialHighlightPromptIndex; i++) {
      const ballId = targetIndices[i];
      const shape = identityPromptShapes[i];
      if (ballId !== undefined && shape) {
        map[ballId] = shape;
      }
    }
    return map;
  }, [activeSequentialHighlightPromptIndex, identityPromptShapes, targetIndices]);

  const colorPassBallStyles = useMemo(() => {
    const styles: Partial<Record<number, CSSProperties>> = {};
    if (!colorIdentityEnabled) return styles;

    if (selectionPass === 'colors' || selectionPass === null) {
      for (let index = 0; index < selectedIndices.length; index += 1) {
        const ballId = selectedIndices[index];
        if (ballId === undefined) continue;
        const colorId = selectionColorByBall[ballId];
        if (!colorId) continue;
        const color = getTrackIdentityColor(colorId);
        styles[ballId] = {
          backgroundColor: color.fill,
          borderColor: color.border,
          boxShadow: `0 0 18px 4px ${color.glow}`,
        };
      }
    }

    return styles;
  }, [colorIdentityEnabled, selectedIndices, selectionColorByBall, selectionPass]);

  const sequentialIdentityPreviewActive =
    phase === 'highlight' &&
    (activeTrackingLetterAudioEnabled ||
      activeSequentialHighlightTone !== undefined ||
      activeSequentialHighlightTargetId !== undefined);

  const selectedBallClass =
    'bg-emerald-500 border border-emerald-100/90 shadow-[0_0_14px_3px_rgba(16,185,129,0.35)] ring-2 ring-emerald-300/60 dark:bg-emerald-400/90 dark:border-emerald-100/55 dark:shadow-[0_0_16px_4px_rgba(74,222,128,0.3)] dark:ring-emerald-200/40';
  const feedbackCorrectClass =
    'bg-[hsl(var(--woven-correct))] border border-[hsl(var(--woven-correct)/0.6)] shadow-[0_0_14px_3px_hsl(var(--woven-correct)/0.35)]';
  const feedbackIncorrectClass =
    'bg-[hsl(var(--woven-incorrect))] border border-[hsl(var(--woven-incorrect)/0.6)] shadow-[0_0_14px_3px_hsl(var(--woven-incorrect)/0.35)]';
  const feedbackWrongIdentityClass =
    'bg-amber-500 border border-amber-300/60 shadow-[0_0_14px_3px_rgba(245,158,11,0.35)]';

  const ballClass = (id: number): string => {
    const neutral =
      'bg-woven-cell-active border border-woven-border/80 shadow-[0_6px_16px_hsl(var(--woven-border)/0.28),inset_0_0_0_1px_hsl(var(--woven-border)/0.28)]';
    if (colorIdentityEnabled) {
      if (sequentialIdentityPreviewActive) {
        return activeSequentialHighlightTargetId === id
          ? 'border border-white/40 shadow-[0_8px_20px_rgba(15,23,42,0.18)]'
          : neutral;
      }

      const hasIdentityVisual =
        (phase === 'highlight' && targetColorByBall[id]) ||
        (phase === 'feedback' &&
          (feedbackCorrectSet.has(id) ||
            feedbackWrongIdentitySet.has(id) ||
            feedbackWrongDistractorSet.has(id) ||
            feedbackMissedSet.has(id)));

      if (phase === 'tracking') return neutral;
      if (phase === 'selection') {
        return selectedIndexSet.has(id) ? selectedBallClass : neutral;
      }
      if (phase === 'feedback') {
        if (feedbackCorrectSet.has(id)) return feedbackCorrectClass;
        if (feedbackWrongIdentitySet.has(id)) return feedbackWrongIdentityClass;
        if (feedbackWrongDistractorSet.has(id)) return feedbackIncorrectClass;
        if (feedbackMissedSet.has(id)) return `${neutral} ring-2 ring-amber-300/60`;
        return 'bg-woven-cell-rest border border-woven-border/60 opacity-70';
      }
      return hasIdentityVisual
        ? 'border border-white/40 shadow-[0_8px_20px_rgba(15,23,42,0.18)]'
        : neutral;
    }

    if (sequentialIdentityPreviewActive) {
      return activeSequentialHighlightTargetId === id
        ? 'bg-emerald-400 border border-emerald-200/80 shadow-[0_0_18px_4px_rgba(52,211,153,0.5)]'
        : neutral;
    }

    const isTarget = targetIndexSet.has(id);
    const isSelected = selectedIndexSet.has(id);
    if (phase === 'highlight') {
      return isTarget
        ? 'bg-emerald-400 border border-emerald-200/80 shadow-[0_0_18px_4px_rgba(52,211,153,0.5)]'
        : neutral;
    }
    if (phase === 'tracking') return neutral;
    if (phase === 'selection') return isSelected ? selectedBallClass : neutral;
    if (phase === 'feedback') {
      if (isTarget && isSelected) return feedbackCorrectClass;
      if (!isTarget && isSelected) return feedbackIncorrectClass;
      if (isTarget && !isSelected) return `${neutral} ring-2 ring-amber-300/60`;
      return 'bg-woven-cell-rest border border-woven-border/60 opacity-70';
    }
    return neutral;
  };

  const ballStyle = (id: number): CSSProperties | undefined => {
    if (!colorIdentityEnabled) return undefined;

    if (sequentialIdentityPreviewActive) {
      if (activeSequentialHighlightTargetId !== id || !activeSequentialHighlightColor) {
        return undefined;
      }
      return {
        backgroundColor: activeSequentialHighlightColor.fill,
        borderColor: activeSequentialHighlightColor.border,
        boxShadow: `0 0 18px 4px ${activeSequentialHighlightColor.glow}`,
      };
    }

    if (phase === 'highlight') {
      const colorId = targetColorByBall[id];
      if (!colorId) return undefined;
      const color = getTrackIdentityColor(colorId);
      return {
        backgroundColor: color.fill,
        borderColor: color.border,
        boxShadow: `0 0 18px 4px ${color.glow}`,
      };
    }

    if (phase === 'selection') {
      return colorPassBallStyles[id] ?? undefined;
    }

    return undefined;
  };

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden px-2 page-inset-bottom-sm pt-1 sm:p-3">
      <div
        ref={arenaRef}
        className={cn(
          'relative isolate h-full w-full overflow-hidden rounded-[1.25rem] border border-woven-border/60 bg-woven-surface/30 sm:rounded-2xl',
          show3dRenderer && 'dark',
        )}
      >
        {phase === 'idle' ? (
          <div className="relative z-10 h-full">
            <DualTrackIdleState
              calibrationPending={calibrationPending}
              totalRounds={totalRounds}
              targetCount={displayedTargetCount}
              distractorCount={displayedDistractorCount}
              showJourneyTierSummary={showJourneyTierSummary}
              currentJourneyTierValue={currentJourneyTierValue}
              currentJourneyTierCount={currentJourneyTierCount}
              journeyTierHelpText={journeyTierHelpText}
              adaptivePathEnabled={adaptivePathEnabled}
              pathLoaded={pathLoaded}
              isLaunching={isLaunching}
              statusNote={launchHint}
              onStart={onStart}
            />
          </div>
        ) : null}

        {phase === 'countdown' ? (
          <div className="relative z-10 flex h-full items-center justify-center">
            <span className="text-7xl font-bold tabular-nums text-cyan-400 animate-pulse">
              {countdown}
            </span>
          </div>
        ) : null}

        <DualTrackWebglArena
          show={showWebglRenderer}
          active={usingWebglArena}
          ballCount={currentRoundTotalObjects}
          ballDiameter={BALL_DIAMETER}
          arenaWidth={arenaWidth}
          arenaHeight={arenaHeight}
          positionsRef={ballPositionsRef}
          phase={phase}
          selectedIndices={selectedIndices}
          targetIndices={targetIndices}
          colorIdentityEnabled={colorIdentityEnabled}
          targetColorByBall={targetColorByBall}
          feedbackState={feedbackState}
          activeSequentialHighlightTargetId={activeSequentialHighlightTargetId}
          activeSequentialHighlightColor={activeSequentialHighlightColor}
          selectionColorByBall={selectionColorByBall}
          onReadyChange={onWebglReadyChange}
        />

        <DualTrack3dArena
          show={show3dRenderer}
          active={using3dArena}
          ballCount={currentRoundTotalObjects}
          phase={phase}
          selectedIndices={selectedIndices}
          targetIndices={targetIndices}
          colorIdentityEnabled={colorIdentityEnabled}
          targetColorByBall={targetColorByBall}
          feedbackState={feedbackState}
          activeSequentialHighlightTargetId={activeSequentialHighlightTargetId}
          activeSequentialHighlightColor={activeSequentialHighlightColor}
          selectionColorByBall={selectionColorByBall}
          isPaused={isPaused}
          onReadyChange={onWebglReadyChange}
          onBallTap={onBallTap}
          getBallScreenPositionRef={getBallScreenPositionRef}
        />

        {BALL_IDS.map((id) => (
          <div
            key={id}
            ref={(element) => bindBallElement(id, element)}
            role="button"
            aria-pressed={phase === 'selection' ? selectedIndexSet.has(id) : undefined}
            tabIndex={phase === 'selection' ? 0 : -1}
            onClick={() => onBallTap(id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onBallTap(id);
              }
            }}
            className={cn(
              'absolute rounded-full opacity-0 will-change-transform transition-[background-color,box-shadow,border-color,color,opacity] duration-300',
              show3dRenderer ? 'hidden' : showBalls ? ballClass(id) : '',
              !show3dRenderer &&
                usingWebglVisuals &&
                'bg-transparent border-transparent shadow-none ring-0 transition-none',
              !show3dRenderer && phase === 'selection' && 'cursor-pointer',
            )}
            style={{
              width: BALL_DIAMETER,
              height: BALL_DIAMETER,
              ...(usingWebglVisuals
                ? {
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    boxShadow: 'none',
                    backgroundImage: 'none',
                    filter: 'none',
                  }
                : ballStyle(id)),
            }}
          >
            {phase === 'highlight' &&
            activeSequentialHighlightTargetId === id &&
            (activeSequentialHighlightLetter || activeSequentialHighlightTone) ? (
              <span
                className="flex h-full w-full items-center justify-center text-sm font-black tracking-[0.08em]"
                style={{ color: activeSequentialHighlightColor?.text ?? '#062b12' }}
              >
                {activeSequentialHighlightLetter ??
                  getStimulusDisplayLabel(activeSequentialHighlightTone ?? '')}
              </span>
            ) : phase === 'highlight' && revealedShapeByBall[id] ? (
              <span className="flex h-full w-full items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                <TrackIdentityPromptIcon
                  prompt={revealedShapeByBall[id]}
                  size={20}
                  color="#1a1a1a"
                />
              </span>
            ) : null}

            {phase === 'selection' && selectedBallLabel[id] ? (
              <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                {selectedBallLabel[id]}
              </span>
            ) : phase === 'selection' && selectedBallShape[id] ? (
              <span className="flex h-full w-full items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <TrackIdentityPromptIcon prompt={selectedBallShape[id]} size={18} color="#1a1a1a" />
              </span>
            ) : null}

            {phase === 'feedback' && feedbackCorrectSet.has(id) ? (
              <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <Check size={18} weight="bold" />
              </span>
            ) : phase === 'feedback' && feedbackWrongDistractorSet.has(id) ? (
              <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <X size={18} weight="bold" />
              </span>
            ) : phase === 'feedback' && feedbackWrongIdentitySet.has(id) ? (
              <span className="flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <Warning size={18} weight="bold" />
              </span>
            ) : phase === 'feedback' && feedbackMissedSet.has(id) ? (
              <span className="flex h-full w-full items-center justify-center text-amber-300/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <X size={16} weight="bold" />
              </span>
            ) : null}
          </div>
        ))}

        {show3dRenderer && showBalls ? (
          <DualTrack3dBallOverlay
            ballCount={currentRoundTotalObjects}
            phase={phase}
            getBallScreenPositionRef={getBallScreenPositionRef}
            activeSequentialHighlightTargetId={activeSequentialHighlightTargetId}
            activeSequentialHighlightColor={activeSequentialHighlightColor}
            activeSequentialHighlightLetter={activeSequentialHighlightLetter}
            activeSequentialHighlightTone={activeSequentialHighlightTone}
            revealedShapeByBall={revealedShapeByBall}
            selectedBallLabel={selectedBallLabel}
            selectedBallShape={selectedBallShape}
            feedbackCorrectSet={feedbackCorrectSet}
            feedbackWrongIdentitySet={feedbackWrongIdentitySet}
            feedbackWrongDistractorSet={feedbackWrongDistractorSet}
            feedbackMissedSet={feedbackMissedSet}
          />
        ) : null}

        {/* Focus cross – amber crosshair that moves independently during tracking */}
        <div
          ref={focusCrossRef}
          aria-hidden
          className="pointer-events-none absolute opacity-0 will-change-transform"
          style={{ width: 28, height: 28, zIndex: 9999 }}
        >
          <svg
            viewBox="0 0 28 28"
            width={28}
            height={28}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Horizontal bar */}
            <rect x={2} y={12} width={24} height={4} rx={2} fill="#f59e0b" fillOpacity={0.85} />
            {/* Vertical bar */}
            <rect x={12} y={2} width={4} height={24} rx={2} fill="#f59e0b" fillOpacity={0.85} />
          </svg>
        </div>

        {/* Shape traveler – fixed-position element animated by GSAP during highlight.
            Uses position:fixed so it can overflow the arena's overflow:hidden container. */}
        <div
          ref={shapeTravelerRef}
          aria-hidden
          className="pointer-events-none fixed flex items-center justify-center opacity-0 will-change-transform drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]"
          style={{ width: BALL_DIAMETER * 2, height: BALL_DIAMETER * 2, zIndex: 99999 }}
        />

        {phase === 'feedback' ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center">
            <span className="inline-block rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm bg-woven-surface/80 text-woven-text border border-woven-border/50">
              {phaseLabel}
            </span>
          </div>
        ) : null}

        <DualTrackSelectionOverlay
          visible={phase === 'selection'}
          canConfirmSelection={canConfirmSelection}
          displayedTargetCount={displayedTargetCount}
          selectedCount={selectedIndices.length}
          currentPromptColor={currentPromptColor}
          currentPromptColorLabel={currentPromptColorLabel}
          currentPromptLetter={currentPromptLetter}
          currentPromptTone={currentPromptTone}
          currentPromptShape={currentPromptShape}
          instructionOffset={selectionControlOffsets.instruction}
          confirmOffset={selectionControlOffsets.confirm}
          is3d={show3dRenderer}
          onInstructionRef={onInstructionRef}
          onConfirmRef={onConfirmRef}
          onStartDrag={onStartDrag}
          onMoveDrag={onMoveDrag}
          onEndDrag={onEndDrag}
          onConfirmSelection={onConfirmSelection}
        />

        {isPaused ? (
          <div
            className={cn(
              'absolute inset-0 z-30 backdrop-blur-[2px]',
              show3dRenderer ? 'bg-black/60' : 'bg-woven-bg/75',
            )}
          >
            <div className="absolute inset-x-0 top-4 z-10 flex justify-center px-4">
              <button
                type="button"
                onClick={onRestart}
                className={cn(
                  'relative overflow-hidden rounded-full p-1.5 transition-colors active:scale-[0.985]',
                  show3dRenderer
                    ? 'border border-white/20 bg-white/90 shadow-lg'
                    : 'border border-woven-border bg-woven-surface shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25),0_10px_24px_hsl(var(--woven-border)/0.12)] hover:bg-woven-cell-rest',
                )}
              >
                {!show3dRenderer && <CanvasWeave lineCount={6} rounded="full" />}
                <span
                  className={cn(
                    'relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold',
                    show3dRenderer ? 'text-gray-900' : 'bg-woven-cell-rest text-woven-text',
                  )}
                >
                  <ArrowClockwise size={16} />
                  <span>{t('game.cogTask.restart')}</span>
                </span>
              </button>
            </div>

            <div className="flex h-full items-center justify-center">
              <div
                className={cn(
                  'rounded-2xl border px-5 py-4 text-center shadow-lg',
                  show3dRenderer
                    ? 'border-white/20 bg-white/90'
                    : 'border-woven-border bg-woven-surface',
                )}
              >
                <p
                  className={cn(
                    'text-sm font-semibold',
                    show3dRenderer ? 'text-gray-900' : 'text-woven-text',
                  )}
                >
                  {t('game.dualTrack.sessionEnPause', 'Session paused')}
                </p>
                <p
                  className={cn(
                    'mt-1 text-xs',
                    show3dRenderer ? 'text-gray-500' : 'text-woven-text-muted',
                  )}
                >
                  {t('game.dualTrack.reprenezPourContinuer', 'Resume to continue.')}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
