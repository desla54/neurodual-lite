/**
 * DualPickTimeline.tsx - Composant Timeline pour Dual Label
 *
 * La différence avec Dual Flow :
 * - Dual Flow : Drop zones vides → on y drop les valeurs (position/lettre)
 * - Dual Label : Drop zones pré-remplies avec les valeurs → on y drop les labels (N, N-1, N-2)
 *
 * Les stimuli auto-fill la timeline, l'utilisateur doit étiqueter chaque stimulus
 * avec le bon label temporel.
 *
 * IMPORTANT: Contrairement à Flow, l'ordre d'affichage des slots est MÉLANGÉ
 * pour que l'utilisateur doive retrouver la position temporelle de chaque stimulus.
 * Il n'y a pas de séparation "présent/passé" qui révèlerait l'ordre.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DualPickDropZone,
  getTrialBorderColorForNLevel,
  MiniGrid,
  MiniLetter,
} from '@neurodual/ui';
import { useDualPickGameStore } from '../../stores/dual-pick-game-store';
import type { DualPickSessionSnapshot, DualPickId, DualPickTimelineCard } from '@neurodual/logic';

// =============================================================================
// SHUFFLE UTILITY
// =============================================================================

/**
 * Seeded shuffle using xorshift32 algorithm.
 * Better distribution than LCG for close seeds.
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];

  // xorshift32 - better randomness than LCG
  let s = seed >>> 0 || 1; // Ensure non-zero
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };

  // Warm up the generator
  for (let i = 0; i < 10; i++) next();

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const temp = result[i];
    const swap = result[j];
    if (temp !== undefined && swap !== undefined) {
      result[i] = swap;
      result[j] = temp;
    }
  }

  return result;
}

// =============================================================================
// TYPES
// =============================================================================

interface DualPickTimelineProps {
  /** Current session snapshot */
  snapshot: DualPickSessionSnapshot;
  /** Modality to display */
  modality: 'position' | 'audio';
  /** Is this the mirror timeline? */
  mirror?: boolean;
  /** Enable trial color coding */
  trialColorCoding?: boolean;
  /** Show modality labels (Position/Audio) */
  showModalityLabels?: boolean;
  /** Show time labels (Présent/Passé) */
  showTimeLabels?: boolean;
}

/** Unified card type for rendering (both normal slots and distractors) */
interface RenderableCard {
  slot: number;
  type: 'position' | 'audio';
  position?: number;
  sound?: string;
  isDistractor?: boolean;
  distractorId?: string;
}

// Re-export MiniGrid and MiniLetter for convenience
export { MiniGrid, MiniLetter };

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DualPickTimeline({
  snapshot,
  modality,
  mirror = false,
  trialColorCoding = false,
  showModalityLabels = false,
  showTimeLabels: _showTimeLabels = false, // Not used - would reveal temporal order
}: DualPickTimelineProps) {
  const { t } = useTranslation();
  const magneticZoneKey = useDualPickGameStore((s) => s.magneticZoneKey);

  const nLevel = snapshot.nLevel;

  // Build cards array from snapshot (includes both normal slots and distractors)
  // IMPORTANT: Always show ALL slots to keep the layout stable. Content visibility is controlled separately.
  const allCards: RenderableCard[] = useMemo(() => {
    const cards: RenderableCard[] = [];

    // Always show slots 0 to nLevel with their content
    for (let slot = 0; slot <= nLevel; slot++) {
      const historyIndex = snapshot.history.length - 1 - slot;
      const item = historyIndex >= 0 ? snapshot.history[historyIndex] : undefined;

      if (modality === 'position') {
        cards.push({
          slot,
          type: 'position',
          position: item?.position,
        });
      } else {
        cards.push({
          slot,
          type: 'audio',
          sound: item?.sound,
        });
      }
    }

    // Add distractor cards from snapshot
    for (const card of snapshot.timelineCards) {
      if (card.isDistractor && card.type === modality) {
        cards.push({
          slot: card.slot,
          type: card.type,
          position: card.position,
          sound: card.sound,
          isDistractor: true,
          distractorId: card.distractorId,
        });
      }
    }

    return cards;
  }, [snapshot.history, snapshot.timelineCards, snapshot.phase, nLevel, modality]);

  // DUAL LABEL: Shuffle ALL cards together (including slot 0 = N and distractors)
  // This is different from Flow where slot 0 is always in the center.
  // In Dual Label, the user must FIND the temporal position, so the order must be hidden.
  const shuffledCards = useMemo(() => {
    // Seed combines trialIndex with modality hash for different shuffle per modality
    // Add base offset (12345) to avoid seed=0 which produces predictable patterns
    const modalitySeed = modality === 'position' ? 0 : 1000000;
    const baseSeed = 12345;
    const seed = mirror
      ? (snapshot.trialIndex + 1) * 104729 + modalitySeed + 77777777 + baseSeed
      : (snapshot.trialIndex + 1) * 7919 + modalitySeed + baseSeed;
    return seededShuffle(allCards, seed);
  }, [allCards, snapshot.trialIndex, modality, mirror]);

  // Get placed label for a slot
  const getPlacedLabel = (slot: number): DualPickId | null => {
    // Check timeline cards from snapshot
    const card = snapshot.timelineCards.find(
      (c: DualPickTimelineCard) => c.slot === slot && c.type === modality,
    );

    if (card?.placedLabel) return card.placedLabel;

    if (mirror) {
      // Check mirror placements from store
      const mirrorPlacements = useDualPickGameStore.getState().mirrorPlacements;
      for (const [_proposalId, placement] of mirrorPlacements) {
        if (placement.slot === slot && placement.type === modality) {
          return placement.label;
        }
      }
    } else {
      // Check pending placements from store
      const pendingPlacements = useDualPickGameStore.getState().pendingNormalPlacements;
      for (const [_proposalId, placement] of pendingPlacements) {
        if (placement.slot === slot && placement.type === modality) {
          return placement.label;
        }
      }
    }

    return null;
  };

  // Build magnetic highlight key (handles both normal slots and distractors)
  const buildMagneticKey = (card: RenderableCard): string => {
    if (card.isDistractor) {
      return mirror ? `mirror-distractor-${card.distractorId}` : `distractor-${card.distractorId}`;
    }
    if (mirror) {
      return `mirror-${modality}-${card.slot}`;
    }
    return `${modality}-${card.slot}`;
  };

  // Label and color for modality
  const label =
    modality === 'position' ? t('dualPick.position', 'Position') : t('dualPick.audio', 'Audio');
  const labelColorClass = mirror
    ? modality === 'position'
      ? 'text-amber-700'
      : 'text-orange-500'
    : modality === 'position'
      ? 'text-visual'
      : 'text-audio';

  // Background color for timeline containers
  const bgColor = mirror
    ? modality === 'position'
      ? 'bg-stone-200/25'
      : 'bg-rose-100/25'
    : modality === 'position'
      ? 'bg-sky-100/30'
      : 'bg-emerald-100/30';

  // Transform style for mirror mode
  const mirrorStyle = mirror ? { transform: 'scaleX(-1)' } : undefined;

  return (
    <div className="flex items-end justify-center pb-[clamp(0.1rem,0.8vh,0.4rem)]">
      {/* Modality label */}
      {showModalityLabels && (
        <span
          className={`text-3xs lg:text-xs font-bold ${labelColorClass} uppercase tracking-wide whitespace-nowrap mr-2 lg:mr-4 mb-4`}
          style={mirrorStyle}
        >
          {label}
        </span>
      )}

      {/* All cards in a single row (shuffled order - no present/past separation) */}
      {shuffledCards.length > 0 && (
        <div
          className={`flex items-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-3 ${bgColor} rounded-2xl px-2 py-1 lg:px-3 lg:py-2`}
        >
          {shuffledCards.map((card) => {
            const slotTrialIndex = card.isDistractor ? -1 : snapshot.trialIndex - card.slot;
            const placedLabel = card.isDistractor ? null : getPlacedLabel(card.slot);
            const highlight = magneticZoneKey === buildMagneticKey(card);
            const cardKey = card.isDistractor
              ? `distractor-${card.distractorId}`
              : `${modality}-${mirror ? 'mirror-' : ''}${card.slot}`;

            return (
              <div
                key={cardKey}
                style={mirrorStyle}
                data-mirror-container={mirror ? 'true' : undefined}
              >
                <DualPickDropZone
                  slot={card.slot}
                  type={modality}
                  position={card.position}
                  sound={card.sound}
                  placedLabel={placedLabel}
                  highlight={highlight}
                  borderColorClass={
                    trialColorCoding && slotTrialIndex >= 0
                      ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                      : undefined
                  }
                  mirror={mirror}
                  isDistractor={card.isDistractor}
                  distractorId={card.distractorId}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
