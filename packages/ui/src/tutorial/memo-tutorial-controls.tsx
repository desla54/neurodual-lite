/**
 * MemoTutorialControls - Click-to-pick recall controls for Memo tutorial
 *
 * The user clicks on a slot to open a picker modal:
 * - Position picker: 3x3 grid
 * - Audio picker: Letter grid (vowels for tutorial)
 *
 * Features:
 * - Guided slot highlighting
 * - Correction system (up to 3 per slot)
 * - Validation button
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Check, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Button } from '../primitives/button';
import type { ExpectedRecall, TutorialSlot } from '@neurodual/logic';

// Grid mapping for position picker
const POSITION_GRID = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

// Vowels for audio picker (easier to memorize)
const AUDIO_OPTIONS = ['A', 'E', 'I', 'O', 'U'] as const;

interface MemoSlot {
  id: TutorialSlot;
  modality: 'position' | 'audio';
  value?: number | string;
  correct?: boolean;
  corrections: number;
  locked: boolean;
}

interface MemoTutorialControlsProps {
  /** Expected recall for single-slot mode */
  expectedRecall?: ExpectedRecall;
  /** Expected recalls for batch mode */
  expectedRecalls?: readonly ExpectedRecall[];
  /** Position recall slots */
  positionSlots: MemoSlot[];
  /** Audio recall slots */
  audioSlots: MemoSlot[];
  /** Callback when a value is selected for a slot */
  onSlotFilled: (
    slotId: TutorialSlot,
    modality: 'position' | 'audio',
    value: number | string,
  ) => void;
  /** Callback when validation is clicked */
  onValidate: () => void;
  /** Slot to highlight (guided mode) */
  highlightedSlot?: string;
  /** Whether all slots are filled */
  allFilled: boolean;
  /** Disable interactions */
  disabled?: boolean;
}

/**
 * Mini position display
 */
function MiniPositionGrid({ position, size = 'sm' }: { position: number; size?: 'sm' | 'md' }) {
  const cellSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1';

  return (
    <div className={cn('grid grid-cols-3', gap)}>
      {POSITION_GRID.map((pos, idx) => {
        if (pos === null) {
          return <div key="center" className={cn(cellSize, 'rounded-sm bg-transparent')} />;
        }
        const isActive = pos === position;
        return (
          <div
            key={idx}
            className={cn(
              cellSize,
              'rounded-sm transition-colors',
              isActive ? 'bg-visual' : 'bg-woven-text-muted/20',
            )}
          />
        );
      })}
    </div>
  );
}

/**
 * Position picker modal
 */
function PositionPicker({
  onSelect,
  onCancel,
  highlightValue,
}: {
  onSelect: (value: number) => void;
  onCancel: () => void;
  highlightValue?: number;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div
        role="presentation"
        className="bg-woven-surface p-6 rounded-2xl border border-woven-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-woven-text-muted text-center mb-4">
          {t('tutorial.memo.selectPosition', 'Select the position')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {POSITION_GRID.map((pos, idx) => {
            if (pos === null) {
              return (
                <div key="center" className="w-14 h-14 flex items-center justify-center">
                  <div className="w-6 h-0.5 bg-woven-text-muted/30" />
                </div>
              );
            }
            const isHighlighted = pos === highlightValue;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelect(pos)}
                className={cn(
                  'w-14 h-14 rounded-lg transition-all',
                  'border-2 bg-visual/10',
                  isHighlighted
                    ? 'border-amber-400 animate-pulse'
                    : 'border-visual/30 hover:border-visual',
                  'active:scale-95',
                )}
                aria-label={`Position ${pos}`}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-4 h-4 rounded bg-visual" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Audio picker modal
 */
function AudioPicker({
  onSelect,
  onCancel,
  highlightValue,
}: {
  onSelect: (value: string) => void;
  onCancel: () => void;
  highlightValue?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div
        role="presentation"
        className="bg-woven-surface p-6 rounded-2xl border border-woven-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-woven-text-muted text-center mb-4">
          {t('tutorial.memo.selectAudio', 'Select the letter')}
        </p>
        <div className="flex gap-2">
          {AUDIO_OPTIONS.map((letter) => {
            const isHighlighted = letter === highlightValue;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onSelect(letter)}
                className={cn(
                  'w-14 h-14 rounded-lg transition-all',
                  'border-2 bg-audio/10',
                  isHighlighted
                    ? 'border-amber-400 animate-pulse'
                    : 'border-audio/30 hover:border-audio',
                  'active:scale-95',
                  'flex items-center justify-center',
                  'text-2xl font-bold text-audio',
                )}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Recall slot component
 */
function RecallSlot({
  slot,
  isHighlighted,
  onClick,
  disabled,
}: {
  slot: MemoSlot;
  isHighlighted: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const isPosition = slot.modality === 'position';
  const isFilled = slot.value !== undefined;
  const canCorrect = isFilled && !slot.locked && slot.corrections < 3;

  return (
    <div className="flex flex-col items-center gap-1 relative">
      <span className="text-xs text-woven-text-muted font-medium">{slot.id}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || slot.locked}
        className={cn(
          'flex items-center justify-center rounded-lg transition-all relative',
          'border-2 w-14 h-14',
          // Empty slot
          !isFilled && 'border-dashed',
          !isFilled && isPosition && 'bg-visual/5 border-visual/30',
          !isFilled && !isPosition && 'bg-audio/5 border-audio/30',
          // Filled slot
          isFilled && slot.correct && 'bg-emerald-500/20 border-emerald-500',
          isFilled && slot.correct === false && 'bg-red-500/20 border-red-500',
          isFilled &&
            slot.correct === undefined &&
            (isPosition ? 'bg-visual/20 border-visual' : 'bg-audio/20 border-audio'),
          // Highlighted (guided mode)
          isHighlighted && !isFilled && 'animate-pulse border-amber-400 border-solid',
          // Can correct
          canCorrect && 'hover:ring-2 hover:ring-amber-400/50',
          // Locked
          slot.locked && 'opacity-60 cursor-not-allowed',
          // Disabled
          disabled && 'cursor-not-allowed',
        )}
        aria-label={`Slot ${slot.id} ${slot.modality}`}
      >
        {isFilled ? (
          isPosition ? (
            <MiniPositionGrid position={slot.value as number} size="md" />
          ) : (
            <span className="text-lg font-bold text-audio">{slot.value}</span>
          )
        ) : (
          <span className="text-woven-text-muted/30 text-2xl">?</span>
        )}
      </button>

      {/* Correction badge */}
      {isFilled && slot.corrections > 0 && (
        <div className="absolute -top-1 -right-1 flex items-center gap-0.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          <ArrowCounterClockwise size={10} weight="bold" />
          {slot.corrections}/3
        </div>
      )}

      {/* Correct/Incorrect indicator */}
      {isFilled && slot.correct !== undefined && (
        <div className="absolute -bottom-1 -right-1">
          {slot.correct ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check size={12} weight="bold" className="text-white" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
              <X size={12} weight="bold" className="text-white" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MemoTutorialControls({
  expectedRecall,
  expectedRecalls,
  positionSlots,
  audioSlots,
  onSlotFilled,
  onValidate,
  highlightedSlot,
  allFilled,
  disabled = false,
}: MemoTutorialControlsProps) {
  const { t } = useTranslation();
  const [openPicker, setOpenPicker] = useState<{
    slotId: TutorialSlot;
    modality: 'position' | 'audio';
  } | null>(null);

  // Handle slot click
  const handleSlotClick = useCallback(
    (slot: MemoSlot) => {
      if (disabled || slot.locked) return;
      // Allow clicking to fill or correct
      setOpenPicker({ slotId: slot.id, modality: slot.modality });
    },
    [disabled],
  );

  // Handle value selection from picker
  const handleValueSelect = useCallback(
    (value: number | string) => {
      if (!openPicker) return;
      onSlotFilled(openPicker.slotId, openPicker.modality, value);
      setOpenPicker(null);
    },
    [openPicker, onSlotFilled],
  );

  // Get highlight value for picker (guided mode)
  const getHighlightValue = () => {
    if (!openPicker) return undefined;
    // Find the expected value for this slot
    if (
      expectedRecall &&
      expectedRecall.slot === openPicker.slotId &&
      expectedRecall.modality === openPicker.modality
    ) {
      return expectedRecall.value;
    }
    if (expectedRecalls) {
      const match = expectedRecalls.find(
        (r) => r.slot === openPicker.slotId && r.modality === openPicker.modality,
      );
      return match?.value;
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
      {/* Instruction */}
      <p className="text-sm text-woven-text-muted text-center">
        {allFilled
          ? t('tutorial.memo.validateHint', 'Tous les slots sont remplis. Cliquez sur Valider !')
          : t('tutorial.memo.clickToRecall', 'Cliquez sur un slot pour rappeler la valeur')}
      </p>

      {/* Position Recall Zone */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-visual uppercase tracking-wide">
            {t('tutorial.controls.position')}
          </span>
          <div className="flex-1 h-px bg-visual/20" />
        </div>
        <div className="flex justify-center gap-4">
          {positionSlots.map((slot) => (
            <RecallSlot
              key={`${slot.modality}-${slot.id}`}
              slot={slot}
              isHighlighted={highlightedSlot === `${slot.modality}-${slot.id}`}
              onClick={() => handleSlotClick(slot)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Audio Recall Zone */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-audio uppercase tracking-wide">
            {t('tutorial.controls.audio')}
          </span>
          <div className="flex-1 h-px bg-audio/20" />
        </div>
        <div className="flex justify-center gap-4">
          {audioSlots.map((slot) => (
            <RecallSlot
              key={`${slot.modality}-${slot.id}`}
              slot={slot}
              isHighlighted={highlightedSlot === `${slot.modality}-${slot.id}`}
              onClick={() => handleSlotClick(slot)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Validate Button */}
      <div className="pt-4 border-t border-woven-border">
        <Button
          variant="primary"
          className="w-full"
          disabled={disabled || !allFilled}
          onClick={onValidate}
        >
          {t('tutorial.memo.validate', 'Valider')}
        </Button>
      </div>

      {/* Picker Modals */}
      {openPicker?.modality === 'position' && (
        <PositionPicker
          onSelect={handleValueSelect}
          onCancel={() => setOpenPicker(null)}
          highlightValue={getHighlightValue() as number | undefined}
        />
      )}
      {openPicker?.modality === 'audio' && (
        <AudioPicker
          onSelect={handleValueSelect}
          onCancel={() => setOpenPicker(null)}
          highlightValue={getHighlightValue() as string | undefined}
        />
      )}
    </div>
  );
}

export type { MemoSlot as MemoTutorialSlot };
