import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CanvasWeave, cn } from '@neurodual/ui';
import { listValidMoves, type GridlockBoard, type GridlockMove } from '@neurodual/logic';
import { BOARD_SIZE } from '../../lib/dual-mix-session';

interface DragState {
  readonly pieceId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly cellDelta: number;
  readonly orientation: 'H' | 'V';
  readonly minDelta: number;
  readonly maxDelta: number;
}

const PIECE_CSS_VARS: Record<string, string> = {
  A: '--woven-incorrect',
  B: '--woven-blue',
  C: '--woven-correct',
  D: '--woven-amber',
  E: '--woven-purple',
  F: '--woven-cyan',
  G: '--woven-magenta',
  H: '--woven-orange',
  I: '--woven-blue',
  J: '--woven-purple',
  K: '--woven-correct',
  L: '--woven-amber',
};

function getPieceColor(id: string): string {
  return `hsl(var(${PIECE_CSS_VARS[id] ?? '--woven-gray'}))`;
}

function getPieceBorderColor(id: string): string {
  return `hsl(var(${PIECE_CSS_VARS[id] ?? '--woven-gray'}) / 0.7)`;
}

function computeDeltaRange(board: GridlockBoard, pieceId: string) {
  const validMoves = listValidMoves(board);
  let minDelta = 0;
  let maxDelta = 0;

  for (const move of validMoves) {
    if (move.pieceId !== pieceId) continue;
    if (move.delta < minDelta) minDelta = move.delta;
    if (move.delta > maxDelta) maxDelta = move.delta;
  }

  return { minDelta, maxDelta };
}

export interface DualMixGridlockBoardProps {
  readonly board: GridlockBoard;
  readonly active: boolean;
  readonly onMove: (move: GridlockMove) => void;
  readonly onHaptic?: (durationMs: number) => void;
}

export function DualMixGridlockBoard({
  board,
  active,
  onMove,
  onHaptic,
}: DualMixGridlockBoardProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  const getCellSize = useCallback(() => {
    const container = boardContainerRef.current;
    if (!container) return 53;
    return container.clientWidth / BOARD_SIZE;
  }, []);

  const handlePiecePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, pieceId: string) => {
      if (!active || dragStateRef.current) return;

      const piece = board.pieces.find((candidate) => candidate.id === pieceId);
      if (!piece) return;

      event.preventDefault();
      event.stopPropagation();

      const { minDelta, maxDelta } = computeDeltaRange(board, pieceId);
      if (minDelta === 0 && maxDelta === 0) return;

      setDragState({
        pieceId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        cellDelta: 0,
        orientation: piece.orientation,
        minDelta,
        maxDelta,
      });
      onHaptic?.(10);
    },
    [active, board, onHaptic],
  );

  useEffect(() => {
    if (!dragState || !active) return;
    const activePointerId = dragState.pointerId;

    const updateDelta = (clientX: number, clientY: number) => {
      const current = dragStateRef.current;
      if (!current) return 0;
      const cellSize = getCellSize();
      const rawDelta =
        current.orientation === 'H'
          ? (clientX - current.startClientX) / cellSize
          : (clientY - current.startClientY) / cellSize;
      return Math.max(current.minDelta, Math.min(current.maxDelta, Math.round(rawDelta)));
    };

    const handleMove = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== activePointerId) return;
      const cellDelta = updateDelta(event.clientX, event.clientY);
      setDragState((state) => (state ? { ...state, cellDelta } : state));
    };

    const handleUp = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== activePointerId) return;
      const finalDelta = updateDelta(event.clientX, event.clientY);
      setDragState(null);
      if (finalDelta !== 0) {
        onMove({ pieceId: current.pieceId, delta: finalDelta });
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [active, dragState, getCellSize, onMove]);

  useEffect(() => {
    if (active) return;
    setDragState(null);
  }, [active]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative w-[85%] max-w-[320px] sm:max-w-[380px]">
        <div
          ref={boardContainerRef}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-woven-border bg-woven-surface"
          style={{ touchAction: 'none' }}
        >
          <CanvasWeave opacity={0.06} className="stroke-neutral-400" />

          <div className="absolute inset-0 z-[1]">
            {Array.from({ length: BOARD_SIZE - 1 }, (_, index) => (
              <div
                key={`h-${index}`}
                className="absolute left-0 right-0 border-t border-woven-border/30"
                style={{ top: `${((index + 1) / BOARD_SIZE) * 100}%` }}
              />
            ))}
            {Array.from({ length: BOARD_SIZE - 1 }, (_, index) => (
              <div
                key={`v-${index}`}
                className="absolute top-0 bottom-0 border-l border-woven-border/30"
                style={{ left: `${((index + 1) / BOARD_SIZE) * 100}%` }}
              />
            ))}
          </div>

          <div className="absolute inset-0 z-[3]">
            {Array.from(board.walls).map((wallIndex) => {
              const row = Math.floor(wallIndex / BOARD_SIZE);
              const col = wallIndex % BOARD_SIZE;
              const cellPercent = 100 / BOARD_SIZE;
              return (
                <div
                  key={wallIndex}
                  className="absolute rounded-sm bg-woven-text/10"
                  style={{
                    left: `calc(${col * cellPercent}% + 2px)`,
                    top: `calc(${row * cellPercent}% + 2px)`,
                    width: `calc(${cellPercent}% - 4px)`,
                    height: `calc(${cellPercent}% - 4px)`,
                  }}
                />
              );
            })}
          </div>

          <div className="absolute inset-0 z-[5]">
            {board.pieces.map((piece) => {
              const isDragging = dragState?.pieceId === piece.id;
              const cellPercent = 100 / BOARD_SIZE;
              let displayCol = piece.col;
              let displayRow = piece.row;

              if (isDragging && dragState) {
                if (piece.orientation === 'H') {
                  displayCol += dragState.cellDelta;
                } else {
                  displayRow += dragState.cellDelta;
                }
              }

              const widthCells = piece.orientation === 'H' ? piece.length : 1;
              const heightCells = piece.orientation === 'V' ? piece.length : 1;

              return (
                <div
                  key={piece.id}
                  role="button"
                  tabIndex={-1}
                  className={cn(
                    'absolute select-none',
                    active ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                    isDragging && 'z-20',
                  )}
                  style={{
                    left: `${displayCol * cellPercent}%`,
                    top: `${displayRow * cellPercent}%`,
                    width: `${widthCells * cellPercent}%`,
                    height: `${heightCells * cellPercent}%`,
                    padding: '3px',
                    transition: isDragging ? 'none' : 'left 0.15s ease-out, top 0.15s ease-out',
                  }}
                  onPointerDown={(event) => handlePiecePointerDown(event, piece.id)}
                >
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center rounded-lg border-2 shadow-sm',
                      isDragging && 'shadow-lg ring-2 ring-white/30',
                    )}
                    style={{
                      backgroundColor: getPieceColor(piece.id),
                      borderColor: getPieceBorderColor(piece.id),
                    }}
                  >
                    <div
                      className={cn(
                        'flex gap-[2px]',
                        piece.orientation === 'H' ? 'flex-col' : 'flex-row',
                      )}
                    >
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="rounded-full bg-white/25"
                          style={{
                            width: piece.orientation === 'H' ? 12 : 2,
                            height: piece.orientation === 'H' ? 2 : 12,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="absolute z-10 flex items-center"
          style={{
            top: `${(2 / BOARD_SIZE) * 100}%`,
            left: '100%',
            width: '16px',
            height: `${(1 / BOARD_SIZE) * 100}%`,
          }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-r-lg border-y-2 border-r-2"
            style={{
              backgroundColor: 'hsl(var(--woven-correct) / 0.18)',
              borderColor: 'hsl(var(--woven-correct) / 0.7)',
            }}
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
              <path
                d="M1 1L7 7L1 13"
                stroke="hsl(var(--woven-correct))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
