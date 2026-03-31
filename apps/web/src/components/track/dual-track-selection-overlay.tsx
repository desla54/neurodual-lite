import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { CanvasWeave } from '@neurodual/ui';
import { HandPalm } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type {
  SelectionControlId,
  SelectionControlOffset,
  TrackIdentityColor,
} from '../../lib/dual-track-runtime';
import {
  TrackIdentityPromptIcon,
  type TrackVisualIdentityPrompt,
} from './dual-track-identity-display';
import { getStimulusDisplayLabel } from './dual-track-stimulus-display';

interface DualTrackSelectionOverlayProps {
  readonly visible: boolean;
  readonly canConfirmSelection: boolean;
  readonly displayedTargetCount: number;
  readonly selectedCount: number;
  readonly currentPromptColor: TrackIdentityColor | null;
  readonly currentPromptColorLabel: string | null;
  readonly currentPromptLetter?: string;
  readonly currentPromptTone?: string;
  readonly currentPromptShape?: TrackVisualIdentityPrompt;
  readonly instructionOffset: SelectionControlOffset;
  readonly confirmOffset: SelectionControlOffset;
  readonly is3d?: boolean;
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

const DRAGGABLE_HANDLE_CLASS =
  'pointer-events-auto relative flex min-w-12 shrink-0 items-center justify-center self-stretch px-3 text-woven-text-muted leading-none touch-none cursor-grab active:cursor-grabbing active:text-woven-text after:absolute after:right-0 after:top-1/2 after:h-6 after:w-px after:-translate-y-1/2 after:rounded-full after:bg-woven-border/60';

function dragStyle(offset: SelectionControlOffset): CSSProperties {
  return {
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  };
}

export function DualTrackSelectionOverlay({
  visible,
  canConfirmSelection,
  displayedTargetCount,
  selectedCount,
  currentPromptColor,
  currentPromptColorLabel,
  currentPromptLetter,
  currentPromptTone,
  currentPromptShape,
  instructionOffset,
  confirmOffset,
  is3d = false,
  onInstructionRef,
  onConfirmRef,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  onConfirmSelection,
}: DualTrackSelectionOverlayProps): ReactNode {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-x-0 top-3 flex justify-center px-4">
        <div
          ref={onInstructionRef}
          className="pointer-events-none relative"
          style={dragStyle(instructionOffset)}
        >
          <div
            className={
              is3d
                ? 'relative overflow-hidden rounded-full border border-white/20 bg-white/90 text-gray-900 shadow-lg backdrop-blur-md'
                : 'relative overflow-hidden rounded-full border border-woven-border bg-woven-surface/78 text-woven-text shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.2),0_10px_24px_hsl(var(--woven-border)/0.12)] backdrop-blur-md'
            }
          >
            {!is3d && <CanvasWeave lineCount={6} rounded="full" />}
            <div className="relative z-10 inline-flex items-stretch">
              <button
                type="button"
                aria-label={t('game.dualTrack.moveInstruction', 'Move instruction')}
                className={DRAGGABLE_HANDLE_CLASS}
                onPointerDown={(event) => onStartDrag('instruction', event)}
                onPointerMove={onMoveDrag}
                onPointerUp={onEndDrag}
                onPointerCancel={onEndDrag}
              >
                <HandPalm size={20} weight="regular" className="relative z-10 block shrink-0" />
              </button>
              <div className="pointer-events-none flex min-h-12 items-center gap-2 p-2 pr-3">
                {!is3d &&
                !currentPromptColor &&
                !currentPromptLetter &&
                !currentPromptTone &&
                !currentPromptShape ? (
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-500/12 px-2 text-[13px] font-black text-cyan-700 dark:text-cyan-300">
                    {displayedTargetCount}
                  </span>
                ) : null}
                <span className="text-sm font-medium">
                  {canConfirmSelection
                    ? t('game.dualTrack.appuyezConfirmer', 'Press Confirm')
                    : currentPromptColor ||
                        currentPromptLetter ||
                        currentPromptTone ||
                        currentPromptShape
                      ? t('game.dualTrack.tapezLaCible', 'Tap the target')
                      : t('game.dualTrack.tapezLesCibles', 'Tap the targets')}
                </span>
                {currentPromptColor && currentPromptColorLabel ? (
                  <span
                    className="inline-flex h-10 items-center justify-center rounded-full border-2 px-4 text-lg font-black"
                    style={{
                      backgroundColor: currentPromptColor.fill,
                      borderColor: currentPromptColor.border,
                      color: currentPromptColor.text,
                    }}
                  >
                    {currentPromptColorLabel}
                  </span>
                ) : null}
                {currentPromptLetter ? (
                  <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-cyan-300/35 bg-slate-900/88 px-4 text-lg font-black tracking-[0.14em] text-slate-50">
                    {currentPromptLetter}
                  </span>
                ) : null}
                {currentPromptTone ? (
                  <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-emerald-300/35 bg-slate-900/88 px-4 text-lg font-black text-emerald-100">
                    {getStimulusDisplayLabel(currentPromptTone)}
                  </span>
                ) : null}
                {currentPromptShape ? (
                  <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-cyan-300/35 bg-slate-900/88 px-3">
                    <TrackIdentityPromptIcon
                      prompt={currentPromptShape}
                      size={22}
                      color="#e2e8f0"
                      inactiveColor="rgba(226, 232, 240, 0.24)"
                      centerColor="#f59e0b"
                    />
                  </span>
                ) : null}
                <span
                  className={
                    is3d
                      ? 'rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700'
                      : 'rounded-full bg-woven-cell-rest px-2.5 py-1 text-xs font-semibold text-woven-text-muted'
                  }
                >
                  {selectedCount}/{displayedTargetCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {canConfirmSelection ? (
        <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
          <div
            ref={onConfirmRef}
            className="pointer-events-none relative"
            style={dragStyle(confirmOffset)}
          >
            <div
              className={
                is3d
                  ? 'relative overflow-hidden rounded-full border border-white/20 bg-white/90 shadow-lg backdrop-blur-md'
                  : 'relative overflow-hidden rounded-full border border-woven-border bg-woven-surface/78 shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25),0_10px_24px_hsl(var(--woven-border)/0.12)] backdrop-blur-md'
              }
            >
              {!is3d && <CanvasWeave lineCount={6} rounded="full" />}
              <div className="relative z-10 inline-flex items-stretch">
                <button
                  type="button"
                  aria-label={t('game.dualTrack.moveConfirmBtn', 'Move confirm button')}
                  className={DRAGGABLE_HANDLE_CLASS}
                  onPointerDown={(event) => onStartDrag('confirm', event)}
                  onPointerMove={onMoveDrag}
                  onPointerUp={onEndDrag}
                  onPointerCancel={onEndDrag}
                >
                  <HandPalm size={20} weight="regular" className="relative z-10 block shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={onConfirmSelection}
                  className="pointer-events-auto m-1.5 inline-flex min-w-[12rem] items-center justify-center gap-3 rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(8,145,178,0.28)] transition-all duration-200 active:scale-[0.985]"
                >
                  <span>{t('game.dualTrack.confirmer', 'Confirm')}</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                    {selectedCount}/{displayedTargetCount}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
