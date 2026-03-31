/**
 * PlaceTimelineHorizontal.tsx - Timeline horizontale avec miroir intégré
 *
 * Layout : [N-2][N-1] [N|N] [N-1][N-2]
 *          ←─ Normal ─→ ←─ Miroir ─→
 *                 Centre partagé
 *
 * Les slots Présent (N) sont deux demi-slots côte à côte au centre,
 * visuellement distincts pour indiquer le normal vs miroir.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceDropZone, getTrialBorderColorForNLevel } from '@neurodual/ui';
import { usePlaceGameStore } from '../../stores/place-game-store';
import { useTimelineAutoScroll } from '../../hooks/use-timeline-auto-scroll';
import type { PlaceSessionSnapshot, PlaceProposal } from '@neurodual/logic';

// =============================================================================
// TYPES
// =============================================================================

interface PlaceTimelineHorizontalProps {
  /** Current session snapshot */
  snapshot: PlaceSessionSnapshot;
  /** Modality to display */
  modality: 'position' | 'audio';
  /** Enable trial color coding */
  trialColorCoding?: boolean;
  /** Render function for filled slot content */
  renderFilledContent: (
    slot: number,
    type: 'position' | 'audio',
    proposal: PlaceProposal | null,
    mirror: boolean,
  ) => ReactNode;
  /** Trigger to force re-center (increment to trigger) */
  centerTrigger?: number;
  /** When true, all filled slots fade out together */
  isClearing?: boolean;
  /** Show modality labels (Position/Audio) */
  showModalityLabels?: boolean;
  /** Show time labels (Présent/Passé) */
  showTimeLabels?: boolean;
  /** Callback when scroll state changes (true = has horizontal scroll) */
  onHasScrollChange?: (hasScroll: boolean) => void;
  /** Mirror only mode: display only mirror timeline (no normal) */
  mirrorOnly?: boolean;
}

// =============================================================================
// HELPER: Get filled proposal for a slot
// =============================================================================

function getFilledProposalHelper(
  snapshot: PlaceSessionSnapshot,
  modality: 'position' | 'audio',
  slot: number,
  mirror: boolean,
  mirrorPlacements: Map<string, number>,
  pendingNormalPlacements: Map<string, { slot: number }>,
): PlaceProposal | null {
  if (snapshot.phase === 'stimulus') return null;

  if (mirror) {
    // Check mirror placements first (for normal mirror mode)
    for (const [proposalId, placedSlot] of mirrorPlacements) {
      if (placedSlot === slot) {
        const proposal = snapshot.proposals.find((p) => p.id === proposalId && p.type === modality);
        if (proposal) return proposal;
      }
    }
    // Also check session placements (for mirrorOnly mode where placements go directly to session)
    for (const [proposalId, placedSlot] of snapshot.placedProposals) {
      if (placedSlot === slot) {
        const proposal = snapshot.proposals.find((p) => p.id === proposalId && p.type === modality);
        if (proposal) return proposal;
      }
    }
  } else {
    // Check session placements first
    for (const [proposalId, placedSlot] of snapshot.placedProposals) {
      if (placedSlot === slot) {
        const proposal = snapshot.proposals.find((p) => p.id === proposalId && p.type === modality);
        if (proposal) return proposal;
      }
    }
    // Check pending placements
    for (const [proposalId, placement] of pendingNormalPlacements) {
      if (placement.slot === slot) {
        const proposal = snapshot.proposals.find((p) => p.id === proposalId && p.type === modality);
        if (proposal) return proposal;
      }
    }
  }
  return null;
}

// =============================================================================
// PRESENT DROP ZONE (for center slots - same height as normal, slightly narrower)
// =============================================================================

interface PresentDropZoneProps {
  slot: number;
  type: 'position' | 'audio';
  label: string;
  filled: boolean;
  filledContent: ReactNode;
  highlight: boolean;
  mirror: boolean;
  borderColorClass?: string;
  isClearing?: boolean;
}

function PresentDropZone({
  slot,
  type,
  label,
  filled,
  filledContent,
  highlight,
  mirror,
  borderColorClass,
  isClearing,
}: PresentDropZoneProps) {
  const defaultColorClass = type === 'position' ? 'text-visual' : 'text-audio';
  const mirrorColorClass = type === 'position' ? 'text-stone-600' : 'text-rose-500';
  const colorClass = mirror ? mirrorColorClass : defaultColorClass;

  // Border color: always default based on type/mirror
  const borderClass = filled
    ? mirror
      ? type === 'position'
        ? 'border-stone-400/50'
        : 'border-rose-500/50'
      : type === 'position'
        ? 'border-visual/50'
        : 'border-audio/50'
    : 'border-slate-200';

  const bgClass = filled ? 'bg-slate-100' : 'bg-slate-50';

  // Convert border-xxx-500 to bg-xxx-500 for the color indicator
  const indicatorBgClass = borderColorClass?.replace('border-', 'bg-');

  // MATCHING HEIGHTS with PlaceDropZone for proper alignment
  // PlaceDropZone: h-12 (base), h-11 (small), h-16 (lg)
  // We use same heights here. Widths are slightly reduced (w-10/w-9/w-14) to fit pair.

  return (
    <div className="flex flex-col items-center">
      <div
        className={`text-3xs font-bold ${colorClass} uppercase mb-1`}
        style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      >
        {label}
      </div>
      <div
        {...(mirror
          ? { 'data-mirror-drop-slot': slot, 'data-mirror-drop-type': type }
          : { 'data-drop-slot': slot, 'data-drop-type': type })}
        className={`relative w-10 h-12 [@media(max-height:700px)]:w-9 [@media(max-height:700px)]:h-11 lg:w-14 lg:h-16 rounded-xl flex items-center justify-center transition-all
          ${bgClass}
          ${filled ? `border-2 ${borderClass} shadow-sm` : 'border-2 border-dashed border-slate-200'}
          ${highlight ? 'ring-2 ring-primary/50 ring-offset-1' : ''}
        `}
        style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      >
        {filled && (
          <div
            className={`transition-opacity duration-300 ${isClearing ? 'opacity-0' : 'opacity-100'}`}
            style={mirror ? { transform: 'scaleX(-1)' } : undefined}
          >
            {filledContent}
          </div>
        )}
      </div>
      {/* Color indicator bar under the slot - always reserve space for alignment */}
      <div className={`w-8 h-1 rounded-full mt-1.5 ${indicatorBgClass ?? 'bg-transparent'}`} />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PlaceTimelineHorizontal({
  snapshot,
  modality,
  trialColorCoding = false,
  renderFilledContent,
  centerTrigger,
  isClearing = false,
  showModalityLabels = true,
  showTimeLabels = true,
  onHasScrollChange,
  mirrorOnly = false,
}: PlaceTimelineHorizontalProps) {
  const { t } = useTranslation();
  const magneticZoneKey = usePlaceGameStore((s) => s.magneticZoneKey);
  // Use proper Zustand selectors instead of getState() during render
  const mirrorPlacements = usePlaceGameStore((s) => s.mirrorPlacements);
  const pendingNormalPlacements = usePlaceGameStore((s) => s.pendingNormalPlacements);
  const nLevel = snapshot.nLevel;

  // Helper wrapper that uses the subscribed state
  const getFilledProposal = (slot: number, mirror: boolean) =>
    getFilledProposalHelper(
      snapshot,
      modality,
      slot,
      mirror,
      mirrorPlacements,
      pendingNormalPlacements,
    );

  // Scroll behavior: auto-center on present slot + detect overflow
  const { scrollContainerRef, presentRef } = useTimelineAutoScroll({
    trialIndex: snapshot.trialIndex,
    centerTrigger,
    onHasScrollChange,
  });

  // Build slots array: [1, 2, ...] (past slots only, 0 is Present handled separately)
  const slots = Array.from({ length: nLevel }, (_, i) => i + 1);
  // Normal past slots: N-2, N-1 (farthest to closest, left side)
  const normalPastSlots = [...slots].sort((a, b) => b - a);
  // Mirror past slots: N-1, N-2 (closest to farthest, right side)
  const mirrorPastSlots = [...slots].sort((a, b) => a - b);

  // Label and colors
  const label = modality === 'position' ? t('flow.position', 'Position') : t('flow.audio', 'Audio');
  const normalLabelColor = modality === 'position' ? 'text-visual' : 'text-audio';
  const mirrorLabelColor = modality === 'position' ? 'text-stone-600' : 'text-rose-500';

  // Background colors for each direction (pastel, very subtle)
  // Normal: sky (position) / emerald (audio)
  // Mirror: stone (position) / rose (audio) - distinct hues, subtle opacity
  const normalBgColor = modality === 'position' ? 'bg-sky-100/30' : 'bg-emerald-100/30';
  const mirrorBgColor = modality === 'position' ? 'bg-stone-200/25' : 'bg-rose-100/25';

  // Helper to check if slot is filled
  const isSlotFilled = (slot: number, mirror: boolean): boolean => {
    return getFilledProposal(slot, mirror) !== null;
  };

  // Helper to check visibility
  const isSlotVisible = (slot: number): boolean => {
    return snapshot.trialIndex - slot >= 0;
  };

  // Build magnetic key
  const buildMagneticKey = (slot: number, mirror: boolean): string => {
    if (mirror) {
      return `mirror-${modality}-${slot}`;
    }
    return `${modality}-${slot}`;
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

        {/* === LEFT: Normal Past Slots (N-2, N-1) - hidden in mirror-only mode === */}
        {!mirrorOnly && normalPastSlots.filter(isSlotVisible).length > 0 && (
          <div className="flex flex-col items-center">
            {showTimeLabels && (
              <div className="text-2xs lg:text-xxs font-bold text-muted-foreground/70 uppercase mb-1">
                {t('flow.past', 'Past')}
              </div>
            )}
            <div
              className={`flex items-end gap-1 [@media(max-height:700px)]:gap-0.5 lg:gap-2 ${normalBgColor} rounded-2xl px-1.5 py-1 lg:px-2 lg:py-1.5`}
            >
              {normalPastSlots.filter(isSlotVisible).map((slot) => {
                const slotTrialIndex = snapshot.trialIndex - slot;
                const proposal = getFilledProposal(slot, false);
                const filled = isSlotFilled(slot, false);
                const highlight = magneticZoneKey === buildMagneticKey(slot, false);

                return (
                  <PlaceDropZone
                    key={`normal-${slot}`}
                    slot={slot}
                    type={modality}
                    label={`N-${slot}`}
                    filled={filled}
                    filledContent={
                      filled ? renderFilledContent(slot, modality, proposal, false) : null
                    }
                    highlight={highlight}
                    borderColorClass={
                      trialColorCoding && slotTrialIndex >= 0
                        ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                        : undefined
                    }
                    mirror={false}
                    isClearing={isClearing}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* === CENTER: Present Slots === */}
        <div ref={presentRef} className="flex flex-col items-center mx-2 lg:mx-3">
          {showTimeLabels && (
            <div className="text-2xs lg:text-xxs font-bold text-muted-foreground/70 uppercase mb-1">
              {t('flow.present', 'Present')}
            </div>
          )}
          <div className="flex items-end">
            {/* Normal Present half (hidden in mirror-only mode) */}
            {!mirrorOnly && (
              <>
                <div className={`${normalBgColor} rounded-l-2xl px-1.5 py-1 lg:px-2 lg:py-1.5`}>
                  <PresentDropZone
                    slot={0}
                    type={modality}
                    label="N"
                    filled={isSlotFilled(0, false)}
                    filledContent={
                      isSlotFilled(0, false)
                        ? renderFilledContent(0, modality, getFilledProposal(0, false), false)
                        : null
                    }
                    highlight={magneticZoneKey === buildMagneticKey(0, false)}
                    mirror={false}
                    borderColorClass={
                      trialColorCoding
                        ? getTrialBorderColorForNLevel(snapshot.trialIndex, nLevel)
                        : undefined
                    }
                    isClearing={isClearing}
                  />
                </div>
                {/* Center separator line */}
                <div className="w-px self-stretch my-1 bg-slate-300/50" />
              </>
            )}
            {/* Mirror Present half (full rounded when mirrorOnly) */}
            <div
              className={`${mirrorBgColor} ${mirrorOnly ? 'rounded-2xl' : 'rounded-r-2xl'} px-1.5 py-1 lg:px-2 lg:py-1.5`}
            >
              <PresentDropZone
                slot={0}
                type={modality}
                label="N"
                filled={isSlotFilled(0, true)}
                filledContent={
                  isSlotFilled(0, true)
                    ? renderFilledContent(0, modality, getFilledProposal(0, true), true)
                    : null
                }
                highlight={magneticZoneKey === buildMagneticKey(0, true)}
                mirror={true}
                borderColorClass={
                  trialColorCoding
                    ? getTrialBorderColorForNLevel(snapshot.trialIndex, nLevel)
                    : undefined
                }
                isClearing={isClearing}
              />
            </div>
          </div>
        </div>

        {/* === RIGHT: Mirror Past Slots (N-1, N-2) === */}
        {mirrorPastSlots.filter(isSlotVisible).length > 0 && (
          <div className="flex flex-col items-center">
            {showTimeLabels && (
              <div
                className="text-2xs lg:text-xxs font-bold text-muted-foreground/70 uppercase mb-1"
                style={{ transform: 'scaleX(-1)' }}
              >
                {t('flow.past', 'Past')}
              </div>
            )}
            <div
              className={`flex items-end gap-1 [@media(max-height:700px)]:gap-0.5 lg:gap-2 ${mirrorBgColor} rounded-2xl px-1.5 py-1 lg:px-2 lg:py-1.5`}
            >
              {mirrorPastSlots.filter(isSlotVisible).map((slot) => {
                const slotTrialIndex = snapshot.trialIndex - slot;
                const proposal = getFilledProposal(slot, true);
                const filled = isSlotFilled(slot, true);
                const highlight = magneticZoneKey === buildMagneticKey(slot, true);

                return (
                  <div key={`mirror-${slot}`} style={{ transform: 'scaleX(-1)' }}>
                    <PlaceDropZone
                      slot={slot}
                      type={modality}
                      label={`N-${slot}`}
                      filled={filled}
                      filledContent={
                        filled ? renderFilledContent(slot, modality, proposal, true) : null
                      }
                      highlight={highlight}
                      borderColorClass={
                        trialColorCoding && slotTrialIndex >= 0
                          ? getTrialBorderColorForNLevel(slotTrialIndex, nLevel)
                          : undefined
                      }
                      labelColorClass={modality === 'position' ? 'text-stone-600' : 'text-rose-500'}
                      mirror={true}
                      isClearing={isClearing}
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
