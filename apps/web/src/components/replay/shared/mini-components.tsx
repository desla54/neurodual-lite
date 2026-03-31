/**
 * Mini components for replay views
 * Used by Flow and DualPick replay modes
 */

import type { InFlightDrag } from '@neurodual/logic';

// Grid position mapping: logical position (0-7) to visual grid (3x3 with center cross)
const GRID_MAP_3 = [0, 1, 2, 3, null, 4, 5, 6, 7];
const GRID_MAP_4 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Mini grid showing a highlighted position (3x3 or 3x4)
 * Used in flow timeline slots and animated drag cards
 */
export function MiniGrid({ position, gridCols = 3 }: { position: number; gridCols?: number }) {
  const gridMap = gridCols === 4 ? GRID_MAP_4 : GRID_MAP_3;
  return (
    <div className="bg-white rounded-lg shadow-sm p-1 lg:p-1.5">
      <div
        className={
          gridCols === 4
            ? 'grid grid-cols-4 gap-[1px] w-9 h-7 lg:w-11 lg:h-9'
            : 'grid grid-cols-3 gap-[1px] w-7 h-7 lg:w-9 lg:h-9'
        }
      >
        {gridMap.map((logicPos, idx) => {
          if (logicPos === null) {
            return (
              <div
                key="center"
                className="relative flex items-center justify-center bg-transparent"
              >
                <div className="absolute w-1/2 h-[1px] bg-slate-400" />
                <div className="absolute h-1/2 w-[1px] bg-slate-400" />
              </div>
            );
          }
          return (
            <div
              key={idx}
              className="rounded-sm"
              style={{ backgroundColor: logicPos === position ? '#3b82f6' : '#f1f5f9' }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Mini letter display for audio modality
 * Used in flow timeline slots
 */
export function MiniLetter({ letter }: { letter: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm w-9 h-9 lg:w-12 lg:h-12 flex items-center justify-center">
      <span className="font-bold text-audio text-sm lg:text-base">{letter}</span>
    </div>
  );
}

/**
 * Animated card for in-flight drag visualization
 * Shows a card being dragged from proposals to timeline slot
 */
export function AnimatedCard({ drag }: { drag: InFlightDrag }) {
  // Use percentage-based positioning (no getBoundingClientRect needed)
  // The container has position: relative, so we can use % values
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${drag.x * 100}%`,
    top: `${drag.y * 100}%`,
    transform: `translate(-50%, -50%) scale(${1 + drag.progress * 0.1})`,
    zIndex: 200,
    pointerEvents: 'none',
  };

  return (
    <div
      style={style}
      className={`
        w-14 h-14 rounded-xl shadow-lg flex items-center justify-center
        ${drag.proposalType === 'position' ? 'bg-blue-50 border-2 border-visual' : 'bg-green-50 border-2 border-audio'}
      `}
    >
      {drag.proposalType === 'position' ? (
        <MiniGrid position={drag.proposalValue as number} />
      ) : (
        <span className="font-bold text-audio text-lg">{drag.proposalValue}</span>
      )}
    </div>
  );
}
