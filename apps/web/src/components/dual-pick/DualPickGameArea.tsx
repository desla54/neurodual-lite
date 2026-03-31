/**
 * DualPickGameArea.tsx - Zone centrale de jeu pour Dual Label
 *
 * Différence avec Dual Flow :
 * - Dual Flow : Cartes draggables = valeurs (position/lettre) → on drop sur slots temporels
 * - Dual Label : Cartes draggables = labels (N, N-1, N-2) → on drop sur les valeurs affichées
 *
 * Contient : Grille 3x3 + Pool de label cards draggables
 * Gère les modes normal et miroir
 */

import type { ReactNode } from 'react';
import { Grid, DualPickCard } from '@neurodual/ui';
import type { DualPickSessionSnapshot, DualPickProposal } from '@neurodual/logic';
import { useDualPickGameStore } from '../../stores/dual-pick-game-store';
import type { DualPickTrajectoryData, MagneticTarget } from '@neurodual/ui';

// =============================================================================
// TYPES
// =============================================================================

interface DualPickGameAreaProps {
  snapshot: DualPickSessionSnapshot;
  activeModalities: readonly ('position' | 'audio')[];
  isPaused: boolean;
  trialColorCoding?: boolean;
  mirrorEnabled?: boolean;
  /** Mirror only mode: only show mirror cards (no normal cards) */
  mirrorOnly?: boolean;
  guidedPlacement?: boolean;
  /** Scale factor for the grid (0.7 to 1.3, default 1.0) */
  gridScale?: number;
  /** Hint message to display below the grid */
  hintMessage?: string;
  onStart: () => void;
  onDragStart: (proposalId: string) => void;
  onDragMove: (proposalId: string, x: number, y: number) => MagneticTarget | null;
  onDragEnd: (
    proposalId: string,
    x: number,
    y: number,
    trajectory: DualPickTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  onUnifiedDragEnd: (
    unifiedId: string,
    x: number,
    y: number,
    trajectory: DualPickTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DualPickGameArea({
  snapshot,
  activeModalities,
  isPaused,
  trialColorCoding = false,
  mirrorEnabled = false,
  mirrorOnly = false,
  guidedPlacement = false,
  gridScale = 1.0,
  hintMessage,
  onStart,
  onDragStart,
  onDragMove,
  onDragEnd,
  onUnifiedDragEnd,
}: DualPickGameAreaProps): ReactNode {
  const unifiedPlacedIds = useDualPickGameStore((s) => s.unifiedPlacedIds);
  const unifiedPlacementOrder = useDualPickGameStore((s) => s.unifiedPlacementOrder);
  const unifiedPlacementIndex = useDualPickGameStore((s) => s.unifiedPlacementIndex);
  const pendingNormalPlacements = useDualPickGameStore((s) => s.pendingNormalPlacements);

  const showStimulus = snapshot.phase === 'stimulus';

  // Calculate placed IDs for the pool (session + pending)
  // In Dual Label, we check timelineCards for placed labels
  const placedProposalIds = new Set<string>();

  // From snapshot (session state)
  for (const card of snapshot.timelineCards) {
    if (card.placedLabel !== null) {
      // Find the proposal that placed this label
      const proposal = snapshot.proposals.find(
        (p: DualPickProposal) => p.label === card.placedLabel && p.type === card.type,
      );
      if (proposal) {
        placedProposalIds.add(proposal.id);
      }
    }
  }

  // From pending placements
  for (const [proposalId] of pendingNormalPlacements) {
    placedProposalIds.add(proposalId);
  }

  // Border color helper
  const getTrialBorderColor = (trialIndex: number): string | undefined => {
    if (!trialColorCoding) return undefined;
    const colors = [
      'border-blue-500',
      'border-green-500',
      'border-purple-500',
      'border-orange-500',
      'border-pink-500',
    ];
    return colors[trialIndex % colors.length];
  };

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center min-h-0 p-2 overflow-visible relative ${
        snapshot.phase === 'placement' ? 'z-[160]' : 'z-30'
      }`}
      data-testid="game-area"
    >
      {/* Grid container with responsive sizes - scale applied only to Grid */}
      <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[440px] lg:max-w-[500px] overflow-visible">
        {/* Scaled Grid wrapper */}
        <div
          className="transition-transform duration-200"
          style={
            gridScale !== 1.0
              ? { transform: `scale(${gridScale})`, transformOrigin: 'center center' }
              : undefined
          }
        >
          <Grid
            activePosition={
              activeModalities.includes('position') ? (snapshot.stimulus?.position ?? null) : null
            }
            showStimulus={activeModalities.includes('position') && showStimulus && !isPaused}
            paused={isPaused}
            showPlayButton={snapshot.phase === 'idle'}
            onPlay={onStart}
            hideCross={snapshot.phase === 'placement'}
            className="rounded-2xl"
            borderColor={getTrialBorderColor(snapshot.trialIndex)}
          />

          {/* Blur overlay during placement - inside scaled container */}
          {(snapshot.phase === 'placement' ||
            (!activeModalities.includes('position') &&
              snapshot.phase !== 'idle' &&
              snapshot.phase !== 'finished')) &&
            !isPaused && (
              <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-md rounded-2xl pointer-events-none" />
            )}
        </div>

        {/* Draggable label cards pool - OUTSIDE scaled container to avoid drag offset */}
        {snapshot.phase === 'placement' && !isPaused && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-4">
            {mirrorEnabled ? (
              /* Unified pool: mirror cards only if mirrorOnly, otherwise both normal + mirror */
              <div className="flex flex-wrap justify-center gap-3 items-center p-4 max-w-[280px]">
                {snapshot.proposals
                  .flatMap((proposal: DualPickProposal) => {
                    // In mirrorOnly mode, only generate mirror cards
                    if (mirrorOnly) {
                      const mirrorProposal: DualPickProposal = {
                        ...proposal,
                        id: `${proposal.id}-mirror`,
                      };
                      return [{ proposal: mirrorProposal, mirror: true, originalId: proposal.id }];
                    }
                    // Normal mirror mode: both normal and mirror cards
                    const normalProposal: DualPickProposal = {
                      ...proposal,
                      id: `${proposal.id}-normal`,
                    };
                    const mirrorProposal: DualPickProposal = {
                      ...proposal,
                      id: `${proposal.id}-mirror`,
                    };
                    return [
                      { proposal: normalProposal, mirror: false, originalId: proposal.id },
                      { proposal: mirrorProposal, mirror: true, originalId: proposal.id },
                    ];
                  })
                  .filter(
                    (up: { proposal: DualPickProposal; mirror: boolean; originalId: string }) =>
                      !unifiedPlacedIds.has(up.proposal.id),
                  )
                  .map(
                    (up: { proposal: DualPickProposal; mirror: boolean; originalId: string }) => {
                      const isActive =
                        guidedPlacement &&
                        unifiedPlacementOrder.length > 0 &&
                        unifiedPlacementOrder[unifiedPlacementIndex] === up.proposal.id;
                      const hasActiveTarget = guidedPlacement && unifiedPlacementOrder.length > 0;
                      return (
                        <DualPickCard
                          key={up.proposal.id}
                          proposal={up.proposal}
                          onDragStart={onDragStart}
                          onDragMove={onDragMove}
                          onDragEnd={onUnifiedDragEnd}
                          isActive={hasActiveTarget ? isActive : undefined}
                          mirror={up.mirror}
                          dataAttr={{ 'data-unified-proposal-id': up.proposal.id }}
                        />
                      );
                    },
                  )}
              </div>
            ) : (
              /* Normal pool: only normal timeline label cards */
              <div className="flex flex-wrap justify-center gap-3 items-center p-4 max-w-[280px]">
                {snapshot.proposals
                  .filter((p: DualPickProposal) => !placedProposalIds.has(p.id))
                  .map((proposal: DualPickProposal) => {
                    const isActive = snapshot.currentTarget?.proposalId === proposal.id;
                    return (
                      <DualPickCard
                        key={proposal.id}
                        proposal={proposal}
                        onDragStart={onDragStart}
                        onDragMove={onDragMove}
                        onDragEnd={onDragEnd}
                        isActive={guidedPlacement ? isActive : undefined}
                        mirror={false}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hint message - just below the grid */}
      {hintMessage && (
        <p className="mt-3 text-xs text-muted-foreground text-center">{hintMessage}</p>
      )}
    </div>
  );
}
