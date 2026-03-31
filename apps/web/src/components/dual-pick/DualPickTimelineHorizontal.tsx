/**
 * DualPickTimelineHorizontal.tsx - Timeline horizontale avec miroir intégré
 *
 * Dual Label version: Les slots affichent les stimuli (position/lettre)
 * et l'utilisateur y drop les labels temporels (N, N-1, N-2).
 *
 * IMPORTANT: Contrairement à Flow, TOUS les slots sont mélangés ensemble
 * (y compris le slot N). L'ordre d'affichage ne révèle pas la position temporelle.
 * L'utilisateur doit retrouver quelle carte correspond à N, N-1, N-2.
 *
 * Layout : [Slots mélangés Normal] | [Slots mélangés Miroir]
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DualPickDropZone, getTrialBorderColorForNLevel } from '@neurodual/ui';
import { useDualPickGameStore } from '../../stores/dual-pick-game-store';
import { useTimelineAutoScroll } from '../../hooks/use-timeline-auto-scroll';
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

interface DualPickTimelineHorizontalProps {
  /** Current session snapshot */
  snapshot: DualPickSessionSnapshot;
  /** Modality to display */
  modality: 'position' | 'audio';
  /** Enable trial color coding */
  trialColorCoding?: boolean;
  /** Trigger to force re-center (increment to trigger) */
  centerTrigger?: number;
  /** Show modality labels (Position/Audio) */
  showModalityLabels?: boolean;
  /** Show time labels (Présent/Passé) */
  showTimeLabels?: boolean;
  /** Callback when scroll state changes (true = has horizontal scroll) */
  onHasScrollChange?: (hasScroll: boolean) => void;
  /** Mirror only mode: display only mirror timeline (no normal) */
  mirrorOnly?: boolean;
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

// =============================================================================
// HELPER: Get placed label for a slot
// =============================================================================

function getPlacedLabel(
  snapshot: DualPickSessionSnapshot,
  modality: 'position' | 'audio',
  slot: number,
  mirror: boolean,
): DualPickId | null {
  // Check timeline cards from snapshot
  const card = snapshot.timelineCards.find(
    (c: DualPickTimelineCard) => c.slot === slot && c.type === modality,
  );

  if (card?.placedLabel) return card.placedLabel;

  if (mirror) {
    const mirrorPlacements = useDualPickGameStore.getState().mirrorPlacements;
    for (const [_proposalId, placement] of mirrorPlacements) {
      if (placement.slot === slot && placement.type === modality) {
        return placement.label;
      }
    }
  } else {
    const pendingPlacements = useDualPickGameStore.getState().pendingNormalPlacements;
    for (const [_proposalId, placement] of pendingPlacements) {
      if (placement.slot === slot && placement.type === modality) {
        return placement.label;
      }
    }
  }

  return null;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DualPickTimelineHorizontal({
  snapshot,
  modality,
  trialColorCoding = false,
  centerTrigger,
  showModalityLabels = true,
  showTimeLabels: _showTimeLabels = true, // Not used - would reveal temporal order
  onHasScrollChange,
  mirrorOnly = false,
}: DualPickTimelineHorizontalProps) {
  const { t } = useTranslation();
  const magneticZoneKey = useDualPickGameStore((s) => s.magneticZoneKey);
  const nLevel = snapshot.nLevel;

  // Scroll behavior: auto-center on present slot + detect overflow
  const { scrollContainerRef, presentRef } = useTimelineAutoScroll({
    trialIndex: snapshot.trialIndex,
    centerTrigger,
    onHasScrollChange,
  });

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

  // Shuffle cards for normal timeline
  // Add base offset to avoid seed=0 which produces predictable patterns
  const shuffledNormalCards = useMemo(() => {
    const modalitySeed = modality === 'position' ? 0 : 1000000;
    const baseSeed = 12345;
    const seed = (snapshot.trialIndex + 1) * 7919 + modalitySeed + baseSeed;
    return seededShuffle(allCards, seed);
  }, [allCards, snapshot.trialIndex, modality]);

  // Shuffle cards for mirror timeline (different seed)
  const shuffledMirrorCards = useMemo(() => {
    const modalitySeed = modality === 'position' ? 0 : 1000000;
    const baseSeed = 12345;
    const mirrorSeed = (snapshot.trialIndex + 1) * 104729 + modalitySeed + 77777777 + baseSeed;
    return seededShuffle(allCards, mirrorSeed);
  }, [allCards, snapshot.trialIndex, modality]);

  // Label and colors
  const label =
    modality === 'position' ? t('dualPick.position', 'Position') : t('dualPick.audio', 'Audio');
  const normalLabelColor = modality === 'position' ? 'text-visual' : 'text-audio';
  const normalBgColor = modality === 'position' ? 'bg-sky-100/30' : 'bg-emerald-100/30';
  const mirrorLabelColor = modality === 'position' ? 'text-stone-600' : 'text-rose-500';
  const mirrorBgColor = modality === 'position' ? 'bg-stone-200/25' : 'bg-rose-100/25';

  // Build magnetic key (handles both normal slots and distractors)
  const buildMagneticKey = (card: RenderableCard, mirror: boolean): string => {
    if (card.isDistractor) {
      return mirror ? `mirror-distractor-${card.distractorId}` : `distractor-${card.distractorId}`;
    }
    if (mirror) {
      return `mirror-${modality}-${card.slot}`;
    }
    return `${modality}-${card.slot}`;
  };

  return (
    <div
      ref={scrollContainerRef}
      className="overflow-x-auto scroll-smooth scrollbar-none pb-[clamp(0.1rem,0.5vh,0.3rem)]"
    >
      <div className="flex items-end justify-center gap-1 [@media(max-height:700px)]:gap-0.5 lg:gap-2 min-w-max px-4">
        {/* === LEFT SIDE: Normal timeline label (hidden in mirror-only mode) === */}
        {!mirrorOnly && showModalityLabels && (
          <span
            className={`text-xxs lg:text-3xs font-bold ${normalLabelColor} uppercase tracking-wide whitespace-nowrap self-center mr-1`}
          >
            {label}
          </span>
        )}

        {/* === LEFT: Normal Cards - hidden in mirror-only mode === */}
        {!mirrorOnly && shuffledNormalCards.length > 0 && (
          <div ref={!mirrorOnly ? presentRef : undefined} className="flex flex-col items-center">
            <div
              className={`flex items-end gap-1 [@media(max-height:700px)]:gap-0.5 lg:gap-2 ${normalBgColor} rounded-2xl px-1.5 py-1 lg:px-2 lg:py-1.5`}
            >
              {shuffledNormalCards.map((card) => {
                const slotTrialIndex = card.isDistractor ? -1 : snapshot.trialIndex - card.slot;
                const placedLabel = card.isDistractor
                  ? null
                  : getPlacedLabel(snapshot, modality, card.slot, false);
                const highlight = magneticZoneKey === buildMagneticKey(card, false);
                const cardKey = card.isDistractor
                  ? `normal-distractor-${card.distractorId}`
                  : `normal-${card.slot}`;

                return (
                  <DualPickDropZone
                    key={cardKey}
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
                    mirror={false}
                    isDistractor={card.isDistractor}
                    distractorId={card.distractorId}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* === CENTER: Separator between Normal and Mirror (hidden in mirror-only mode) === */}
        {!mirrorOnly && <div className="w-px self-stretch my-1 bg-slate-300/50 mx-2" />}

        {/* === RIGHT: Mirror Cards (ALL shuffled together, no present/past separation) === */}
        {shuffledMirrorCards.length > 0 && (
          <div ref={mirrorOnly ? presentRef : undefined} className="flex flex-col items-center">
            <div
              className={`flex items-end gap-1 [@media(max-height:700px)]:gap-0.5 lg:gap-2 ${mirrorBgColor} rounded-2xl px-1.5 py-1 lg:px-2 lg:py-1.5`}
            >
              {shuffledMirrorCards.map((card) => {
                const slotTrialIndex = card.isDistractor ? -1 : snapshot.trialIndex - card.slot;
                const placedLabel = card.isDistractor
                  ? null
                  : getPlacedLabel(snapshot, modality, card.slot, true);
                const highlight = magneticZoneKey === buildMagneticKey(card, true);
                const cardKey = card.isDistractor
                  ? `mirror-distractor-${card.distractorId}`
                  : `mirror-${card.slot}`;

                return (
                  <div
                    key={cardKey}
                    style={{ transform: 'scaleX(-1)' }}
                    data-mirror-container="true"
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
                      mirror={true}
                      isDistractor={card.isDistractor}
                      distractorId={card.distractorId}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === RIGHT SIDE: Mirror timeline label === */}
        {showModalityLabels && (
          <span
            className={`text-xxs lg:text-3xs font-bold ${mirrorLabelColor} uppercase tracking-wide whitespace-nowrap self-center ml-1`}
            style={{ transform: 'scaleX(-1)' }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
