/**
 * PlaceGameArea.tsx - Zone centrale de jeu pour Dual Flow
 *
 * Contient : Grille 3x3 + Pool de cartes draggables
 * Gère les modes normal et miroir
 */

import type { ReactNode } from 'react';
import {
  Grid,
  PlaceProposalPool,
  DraggableCard,
  getTrialBorderColorForNLevel,
} from '@neurodual/ui';
import type { PlaceSessionSnapshot } from '@neurodual/logic';
import { usePlaceGameStore } from '../../stores/place-game-store';
import type { DragTrajectoryData, MagneticTarget } from '@neurodual/ui';

// =============================================================================
// TYPES
// =============================================================================

interface PlaceGameAreaProps {
  snapshot: PlaceSessionSnapshot;
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
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  onUnifiedDragEnd: (
    unifiedId: string,
    x: number,
    y: number,
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PlaceGameArea({
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
}: PlaceGameAreaProps): ReactNode {
  const unifiedPlacedIds = usePlaceGameStore((s) => s.unifiedPlacedIds);
  const unifiedPlacementOrder = usePlaceGameStore((s) => s.unifiedPlacementOrder);
  const unifiedPlacementIndex = usePlaceGameStore((s) => s.unifiedPlacementIndex);
  const pendingNormalPlacements = usePlaceGameStore((s) => s.pendingNormalPlacements);

  const showStimulus = snapshot.phase === 'stimulus';
  const nLevel = snapshot.nLevel;

  // Calculate placed IDs for the pool (session + pending)
  const placedIds = new Set([
    ...snapshot.placedProposals.keys(),
    ...pendingNormalPlacements.keys(),
  ]);

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
            borderColor={
              trialColorCoding
                ? getTrialBorderColorForNLevel(snapshot.trialIndex, nLevel)
                : undefined
            }
          />

          {/* Blur overlay during placement - inside scaled container */}
          {(snapshot.phase === 'placement' ||
            snapshot.phase === 'awaitingAdvance' ||
            (!activeModalities.includes('position') &&
              snapshot.phase !== 'idle' &&
              snapshot.phase !== 'finished')) &&
            !isPaused && (
              <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-md rounded-2xl pointer-events-none" />
            )}
        </div>

        {/* Draggable cards pool - OUTSIDE scaled container to avoid drag offset */}
        {(snapshot.phase === 'placement' || snapshot.phase === 'awaitingAdvance') && !isPaused && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-4">
            {mirrorEnabled ? (
              /* Unified pool: mirror cards only if mirrorOnly, otherwise both normal + mirror */
              <div className="flex flex-wrap justify-center gap-3 items-center p-4 max-w-[280px]">
                {snapshot.proposals
                  .flatMap((proposal) => {
                    // In mirrorOnly mode, only generate mirror cards
                    if (mirrorOnly) {
                      return [
                        {
                          id: `${proposal.id}-mirror`,
                          originalId: proposal.id,
                          type: proposal.type,
                          target: 'mirror' as const,
                        },
                      ];
                    }
                    // Normal mirror mode: both normal and mirror cards
                    return [
                      {
                        id: `${proposal.id}-normal`,
                        originalId: proposal.id,
                        type: proposal.type,
                        target: 'normal' as const,
                      },
                      {
                        id: `${proposal.id}-mirror`,
                        originalId: proposal.id,
                        type: proposal.type,
                        target: 'mirror' as const,
                      },
                    ];
                  })
                  .filter((up) => !unifiedPlacedIds.has(up.id))
                  .map((up) => {
                    const proposal = snapshot.proposals.find((p) => p.id === up.originalId);
                    if (!proposal) return null;
                    const isActive =
                      guidedPlacement &&
                      unifiedPlacementOrder.length > 0 &&
                      unifiedPlacementOrder[unifiedPlacementIndex] === up.id;
                    const hasActiveTarget = guidedPlacement && unifiedPlacementOrder.length > 0;
                    return (
                      <DraggableCard
                        key={up.id}
                        proposal={proposal}
                        customId={up.id}
                        dataAttrName="data-unified-proposal-id"
                        onDragStart={onDragStart}
                        onDragMove={onDragMove}
                        onDragEnd={onUnifiedDragEnd}
                        isActive={hasActiveTarget ? isActive : undefined}
                        variant={up.target === 'mirror' ? 'mirror' : 'normal'}
                      />
                    );
                  })}
              </div>
            ) : (
              /* Normal pool: only normal timeline cards */
              <PlaceProposalPool
                proposals={snapshot.proposals}
                placedIds={placedIds}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                activeProposalId={snapshot.currentTarget?.proposalId}
              />
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
