/**
 * PlaceTutorialControls - Simplified placement controls for Place tutorial
 *
 * For the tutorial, we simplify the drag-and-drop to a click-based selection:
 * 1. User clicks a card in the pool to select it
 * 2. User clicks a slot in the timeline to place it
 *
 * This teaches the CONCEPT of temporal ordering without the gesture complexity.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Check, X } from '@phosphor-icons/react';
import type { ExpectedPlacement, TutorialSlot } from '@neurodual/logic';

// Grid mapping for mini position display
const POSITION_GRID = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

interface Card {
  id: string;
  modality: 'position' | 'audio';
  value: number | string;
  placed: boolean;
}

interface Slot {
  id: TutorialSlot;
  modality: 'position' | 'audio';
  value?: number | string;
  correct?: boolean;
}

interface PlaceTutorialControlsProps {
  /** Expected placement for single-card mode */
  expectedPlacement?: ExpectedPlacement;
  /** Expected placements for batch mode */
  expectedPlacements?: readonly ExpectedPlacement[];
  /** Cards available in the pool */
  cards: Card[];
  /** Position timeline slots */
  positionSlots: Slot[];
  /** Audio timeline slots */
  audioSlots: Slot[];
  /** Callback when a card is placed */
  onCardPlaced: (cardId: string, slotId: TutorialSlot, modality: 'position' | 'audio') => void;
  /** Card to highlight (guided mode) */
  highlightedCard?: string;
  /** Slot to highlight (guided mode) */
  highlightedSlot?: string;
  /** Disable interactions */
  disabled?: boolean;
}

/**
 * Mini position display (3x3 grid showing which position is highlighted)
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
 * Draggable card component (simplified to click-select)
 */
function PlaceCard({
  card,
  isSelected,
  isHighlighted,
  onClick,
  disabled,
}: {
  card: Card;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  if (card.placed) return null;

  const isPosition = card.modality === 'position';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center p-2 rounded-lg transition-all',
        'border-2 min-w-[48px] min-h-[48px]',
        // Base
        isPosition ? 'bg-visual/10' : 'bg-audio/10',
        // Selected
        isSelected &&
          (isPosition
            ? 'border-visual ring-2 ring-visual/30'
            : 'border-audio ring-2 ring-audio/30'),
        // Highlighted (guided mode)
        isHighlighted && !isSelected && 'animate-pulse border-amber-400',
        // Default border
        !isSelected && !isHighlighted && 'border-woven-border',
        // Disabled
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      aria-label={isPosition ? `Position ${card.value}` : `Lettre ${card.value}`}
    >
      {isPosition ? (
        <MiniPositionGrid position={card.value as number} size="md" />
      ) : (
        <span className="text-lg font-bold text-audio">{card.value}</span>
      )}
    </button>
  );
}

/**
 * Timeline slot component
 */
function TimelineSlot({
  slot,
  isHighlighted,
  isTarget,
  onClick,
  disabled,
}: {
  slot: Slot;
  isHighlighted: boolean;
  isTarget: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const isPosition = slot.modality === 'position';
  const isFilled = slot.value !== undefined;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-woven-text-muted font-medium">{slot.id}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isFilled}
        className={cn(
          'flex items-center justify-center rounded-lg transition-all',
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
          // Target (card selected, can drop here)
          isTarget && !isFilled && 'ring-2 ring-offset-2 ring-amber-400',
          // Disabled
          (disabled || isFilled) && 'cursor-not-allowed',
        )}
        aria-label={`${t('tutorial.place.slot', 'Slot')} ${slot.id} ${slot.modality}`}
      >
        {isFilled ? (
          <>
            {isPosition ? (
              <MiniPositionGrid position={slot.value as number} size="md" />
            ) : (
              <span className="text-lg font-bold text-audio">{slot.value}</span>
            )}
            {slot.correct !== undefined && (
              <div className="absolute -top-1 -right-1">
                {slot.correct ? (
                  <Check size={16} weight="bold" className="text-emerald-500" />
                ) : (
                  <X size={16} weight="bold" className="text-red-500" />
                )}
              </div>
            )}
          </>
        ) : (
          <span className="text-woven-text-muted/30 text-2xl">?</span>
        )}
      </button>
    </div>
  );
}

export function PlaceTutorialControls({
  expectedPlacement: _expectedPlacement,
  expectedPlacements: _expectedPlacements,
  cards,
  positionSlots,
  audioSlots,
  onCardPlaced,
  highlightedCard,
  highlightedSlot,
  disabled = false,
}: PlaceTutorialControlsProps) {
  const { t } = useTranslation();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Handle card selection
  const handleCardClick = useCallback(
    (card: Card) => {
      if (disabled || card.placed) return;
      setSelectedCard((prev) => (prev?.id === card.id ? null : card));
    },
    [disabled],
  );

  // Handle slot click (place card)
  const handleSlotClick = useCallback(
    (slot: Slot) => {
      if (disabled || !selectedCard || slot.value !== undefined) return;
      // Can only place matching modality
      if (selectedCard.modality !== slot.modality) return;

      onCardPlaced(selectedCard.id, slot.id, slot.modality);
      setSelectedCard(null);
    },
    [disabled, selectedCard, onCardPlaced],
  );

  // Determine which slots are valid targets for the selected card
  const getIsTarget = (slot: Slot) => {
    if (!selectedCard) return false;
    return selectedCard.modality === slot.modality && slot.value === undefined;
  };

  // Split cards by modality
  const positionCards = cards.filter((c) => c.modality === 'position');
  const audioCards = cards.filter((c) => c.modality === 'audio');

  return (
    <div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
      {/* Instruction */}
      <p className="text-sm text-woven-text-muted text-center">
        {selectedCard
          ? t('tutorial.place.clickSlot', 'Click the correct slot to place the card')
          : t('tutorial.place.selectCard', 'Select a card, then click its slot')}
      </p>

      {/* Position Timeline */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-visual uppercase tracking-wide">
            {t('tutorial.controls.position')}
          </span>
          <div className="flex-1 h-px bg-visual/20" />
        </div>
        <div className="flex justify-center gap-4">
          {positionSlots.map((slot) => (
            <TimelineSlot
              key={`${slot.modality}-${slot.id}`}
              slot={slot}
              isHighlighted={highlightedSlot === `${slot.modality}-${slot.id}`}
              isTarget={getIsTarget(slot)}
              onClick={() => handleSlotClick(slot)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Audio Timeline */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-audio uppercase tracking-wide">
            {t('tutorial.controls.audio')}
          </span>
          <div className="flex-1 h-px bg-audio/20" />
        </div>
        <div className="flex justify-center gap-4">
          {audioSlots.map((slot) => (
            <TimelineSlot
              key={`${slot.modality}-${slot.id}`}
              slot={slot}
              isHighlighted={highlightedSlot === `${slot.modality}-${slot.id}`}
              isTarget={getIsTarget(slot)}
              onClick={() => handleSlotClick(slot)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* Card Pool */}
      <div className="flex flex-col gap-2 pt-4 border-t border-woven-border">
        <span className="text-xs font-semibold text-woven-text-muted uppercase tracking-wide text-center">
          {t('tutorial.place.cardPool', 'Cartes disponibles')}
        </span>
        <div className="flex justify-center gap-3 flex-wrap">
          {positionCards.map((card) => (
            <PlaceCard
              key={card.id}
              card={card}
              isSelected={selectedCard?.id === card.id}
              isHighlighted={highlightedCard === card.id}
              onClick={() => handleCardClick(card)}
              disabled={disabled}
            />
          ))}
          {audioCards.map((card) => (
            <PlaceCard
              key={card.id}
              card={card}
              isSelected={selectedCard?.id === card.id}
              isHighlighted={highlightedCard === card.id}
              onClick={() => handleCardClick(card)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export type { Card as PlaceTutorialCard, Slot as PlaceTutorialSlot };
