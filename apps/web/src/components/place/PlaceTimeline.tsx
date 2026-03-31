/**
 * PlaceTimeline.tsx - Composant Timeline pour Dual Flow
 *
 * Affiche les slots de la timeline (Passé → Présent) pour une modalité donnée.
 * Supporte les modes normal et miroir.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceDropZone, getTrialBorderColorForNLevel, MiniGrid, MiniLetter } from '@neurodual/ui';
import { usePlaceGameStore } from '../../stores/place-game-store';
import type { PlaceSessionSnapshot, PlaceProposal } from '@neurodual/logic';

// =============================================================================
// TYPES
// =============================================================================

interface PlaceTimelineProps {
  /** Current session snapshot */
  snapshot: PlaceSessionSnapshot;
  /** Modality to display */
  modality: 'position' | 'audio';
  /** Is this the mirror timeline? */
  mirror?: boolean;
  /** Enable trial color coding */
  trialColorCoding?: boolean;
  /** Enable hide filled cards mode */
  hideFilledCards?: boolean;
  /** Show modality labels (Position/Audio) */
  showModalityLabels?: boolean;
  /** Show time labels (Présent/Passé) */
  showTimeLabels?: boolean;
  /** Render function for filled slot content */
  renderFilledContent: (
    slot: number,
    type: 'position' | 'audio',
    proposal: PlaceProposal | null,
    mirror: boolean,
  ) => ReactNode;
}

// Re-export MiniGrid and MiniLetter for backward compatibility
export { MiniGrid, MiniLetter };

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PlaceTimeline({
  snapshot,
  modality,
  mirror = false,
  trialColorCoding = false,
  showModalityLabels = false,
  showTimeLabels = false,
  renderFilledContent,
}: PlaceTimelineProps) {
  const { t } = useTranslation();
  const magneticZoneKey = usePlaceGameStore((s) => s.magneticZoneKey);
  // Use proper Zustand selectors instead of getState() during render
  const mirrorPlacements = usePlaceGameStore((s) => s.mirrorPlacements);
  const pendingNormalPlacements = usePlaceGameStore((s) => s.pendingNormalPlacements);

  const nLevel = snapshot.nLevel;

  // Build slots array: [0, 1, 2, ...] up to nLevel
  const slots = Array.from({ length: nLevel + 1 }, (_, i) => i);
  // Past slots in order: N-2, N-1 (farthest to closest from Present)
  const pastSlots = slots.filter((s) => s > 0).sort((a, b) => b - a);

  // Get proposal for a filled slot
  const getFilledProposal = (slot: number): PlaceProposal | null => {
    if (snapshot.phase === 'stimulus') return null;

    if (mirror) {
      for (const [proposalId, placedSlot] of mirrorPlacements) {
        if (placedSlot === slot) {
          const proposal = snapshot.proposals.find(
            (p) => p.id === proposalId && p.type === modality,
          );
          if (proposal) return proposal;
        }
      }
    } else {
      // Check session placements first
      for (const [proposalId, placedSlot] of snapshot.placedProposals) {
        if (placedSlot === slot) {
          const proposal = snapshot.proposals.find(
            (p) => p.id === proposalId && p.type === modality,
          );
          if (proposal) return proposal;
        }
      }
      // Check pending placements
      for (const [proposalId, placement] of pendingNormalPlacements) {
        if (placement.slot === slot) {
          const proposal = snapshot.proposals.find(
            (p) => p.id === proposalId && p.type === modality,
          );
          if (proposal) return proposal;
        }
      }
    }
    return null;
  };

  // Check if a slot is filled
  const isSlotFilled = (slot: number): boolean => {
    return getFilledProposal(slot) !== null;
  };

  // Build magnetic highlight key
  const buildMagneticKey = (slot: number): string => {
    if (mirror) {
      return `mirror-${modality}-${slot}`;
    }
    return `${modality}-${slot}`;
  };

  // Label and color for modality
  const label = modality === 'position' ? t('flow.position', 'Position') : t('flow.audio', 'Audio');
  const labelColorClass = mirror
    ? modality === 'position'
      ? 'text-amber-700'
      : 'text-orange-500'
    : modality === 'position'
      ? 'text-visual'
      : 'text-audio';
  const slotLabelColorClass = mirror
    ? modality === 'position'
      ? 'text-amber-700'
      : 'text-orange-500'
    : undefined;

  // Background color for timeline containers (matching PlaceTimelineHorizontal)
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
    <div className="grid grid-cols-[1fr_auto_1fr] items-end pb-[clamp(0.1rem,0.8vh,0.4rem)]">
      {/* Label + Past slots - left column, aligned right */}
      <div className="flex items-end gap-2 [@media(max-height:700px)]:gap-1 lg:gap-4 justify-self-end">
        {showModalityLabels && (
          <span
            className={`text-3xs lg:text-xs font-bold ${labelColorClass} uppercase tracking-wide whitespace-nowrap mb-4`}
            style={mirrorStyle}
          >
            {label}
          </span>
        )}
        {pastSlots.length > 0 && (
          <div className="flex flex-col items-center">
            {showTimeLabels && (
              <div
                className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none"
                style={mirrorStyle}
              >
                {t('flow.past', 'Past')}
              </div>
            )}
            <div
              className={`flex items-center gap-2 [@media(max-height:700px)]:gap-1 lg:gap-3 ${bgColor} rounded-2xl px-2 py-1 lg:px-3 lg:py-2`}
            >
              {pastSlots.map((slot) => {
                const slotTrialIndex = snapshot.trialIndex - slot;
                const isVisible = slotTrialIndex >= 0;
                const proposal = getFilledProposal(slot);
                const filled = isVisible && isSlotFilled(slot);
                const highlight = isVisible && magneticZoneKey === buildMagneticKey(slot);

                return (
                  <div
                    key={`${modality}-${mirror ? 'mirror-' : ''}${slot}`}
                    style={mirrorStyle}
                    className={isVisible ? '' : 'invisible pointer-events-none'}
                  >
                    <PlaceDropZone
                      slot={slot}
                      type={modality}
                      label={`N-${slot}`}
                      filled={filled}
                      filledContent={
                        filled ? renderFilledContent(slot, modality, proposal, mirror) : null
                      }
                      highlight={highlight}
                      borderColorClass={
                        trialColorCoding && slotTrialIndex >= 0
                          ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                          : undefined
                      }
                      labelColorClass={slotLabelColorClass}
                      mirror={mirror}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Present slot - center column */}
      <div className="flex flex-col items-center">
        {showTimeLabels && (
          <div
            className="h-3 lg:h-4 flex items-center justify-center text-xxs lg:text-4xs font-bold text-muted-foreground/70 mb-0.5 lg:mb-1 uppercase leading-none"
            style={mirrorStyle}
          >
            {t('flow.present', 'Present')}
          </div>
        )}
        <div
          className={`flex items-center justify-center ${bgColor} rounded-2xl px-2 py-1 lg:px-3 lg:py-2`}
        >
          <div style={mirrorStyle}>
            <PlaceDropZone
              slot={0}
              type={modality}
              label="N"
              filled={isSlotFilled(0)}
              filledContent={
                isSlotFilled(0)
                  ? renderFilledContent(0, modality, getFilledProposal(0), mirror)
                  : null
              }
              highlight={magneticZoneKey === buildMagneticKey(0)}
              borderColorClass={
                trialColorCoding
                  ? getTrialBorderColorForNLevel(snapshot.trialIndex, nLevel)
                  : undefined
              }
              labelColorClass={slotLabelColorClass}
              mirror={mirror}
            />
          </div>
        </div>
      </div>

      {/* Empty right column for centering */}
      <div />
    </div>
  );
}
