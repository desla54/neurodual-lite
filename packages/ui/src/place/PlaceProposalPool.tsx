// packages/ui/src/place/PlaceProposalPool.tsx
/**
 * PlaceProposalPool - Central area with all draggable proposals
 */

import type { PlaceProposal } from '@neurodual/logic';
import { DraggableCard, type DragTrajectoryData, type MagneticTarget } from './DraggableCard';

interface PlaceProposalPoolProps {
  proposals: readonly PlaceProposal[];
  placedIds: ReadonlySet<string>;
  onDragStart: (proposalId: string) => void;
  /** Called during drag for magnetic detection */
  onDragMove?: (proposalId: string, x: number, y: number) => MagneticTarget | null;
  onDragEnd: (
    proposalId: string,
    x: number,
    y: number,
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  blurred?: boolean;
  /** ID of the active proposal in guided mode (anti-chunking) */
  activeProposalId?: string | null;
  /** Visual variant: 'normal' (blue/green) or 'mirror' (brown/orange) */
  variant?: 'normal' | 'mirror';
}

export function PlaceProposalPool({
  proposals,
  placedIds,
  onDragStart,
  onDragMove,
  onDragEnd,
  blurred,
  activeProposalId,
  variant = 'normal',
}: PlaceProposalPoolProps) {
  const availableProposals = proposals.filter((p) => !placedIds.has(p.id));

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center transition-all duration-300 ${blurred ? 'backdrop-blur-sm' : ''}`}
    >
      <div className="flex flex-wrap gap-3 justify-center items-center p-4 max-w-[280px]">
        {availableProposals.map((proposal) => (
          <DraggableCard
            key={proposal.id}
            proposal={proposal}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            isActive={activeProposalId !== undefined ? proposal.id === activeProposalId : undefined}
            variant={variant}
            isMirror={variant === 'mirror'}
          />
        ))}
      </div>
    </div>
  );
}
