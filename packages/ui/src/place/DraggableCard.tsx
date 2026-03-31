// packages/ui/src/place/DraggableCard.tsx
/**
 * DraggableCard - A card that can be dragged to timeline slots
 *
 * Tracks trajectory data during drag for confidence scoring:
 * - Total distance traveled (pixels)
 * - Slot entries (which slots were hovered, with timestamps)
 */

import type { PlaceProposal, CompactTrajectory, RawTrajectoryPoint } from '@neurodual/logic';
import { encodeTrajectory, TRAJECTORY_SAMPLE_INTERVAL_MS } from '@neurodual/logic';
import { useRef, useState, useCallback, useEffect } from 'react';
import gsap from 'gsap';

// =============================================================================
// Trajectory Types
// =============================================================================

/** Raw slot entry during drag - matches FlowSlotEnter in logic/types/events.ts */
export interface DragSlotEnter {
  slot: number;
  type: 'position' | 'audio';
  mirror: boolean;
  atMs: number; // monotonic timestamp (performance.now)
}

/** Trajectory data collected during drag */
export interface DragTrajectoryData {
  dragStartedAtMs: number;
  totalDistancePx: number;
  directDistancePx: number;
  slotEnters: DragSlotEnter[];
  /** Full XY trajectory for replay (20Hz sampling) */
  trajectory?: CompactTrajectory;
  /** Input method used for this drag (mouse or touch) */
  inputMethod?: 'mouse' | 'touch';
}

// =============================================================================
// Mini Components (same as tutorial)
// =============================================================================

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7];

function MiniGrid({
  position,
  variant = 'normal',
}: {
  position: number;
  variant?: 'normal' | 'mirror';
}) {
  // Blue for normal, stone/taupe for mirror
  const activeColor = variant === 'mirror' ? '#57534e' : '#3b82f6'; // stone-600 vs blue-500
  return (
    <div className="bg-woven-surface/60 backdrop-blur-lg rounded-xl border border-woven-border/50 p-1.5 lg:p-2 overflow-hidden">
      <div className="grid grid-cols-3 gap-[1px] w-8 h-8 [@media(max-height:700px)]:w-7 [@media(max-height:700px)]:h-7 lg:w-10 lg:h-10">
        {GRID_MAP.map((logicPos, idx) => {
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
          const isActive = logicPos === position;
          return (
            <div
              key={idx}
              className="rounded-sm"
              style={{ backgroundColor: isActive ? activeColor : '#f1f5f9' }}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniLetter({
  letter,
  variant = 'normal',
}: {
  letter: string;
  variant?: 'normal' | 'mirror';
}) {
  // Green (text-audio) for normal, rose for mirror
  const colorClass = variant === 'mirror' ? 'text-rose-500' : 'text-audio';
  return (
    <div className="bg-woven-surface/60 backdrop-blur-lg rounded-xl border border-woven-border/50 w-11 h-11 [@media(max-height:700px)]:w-10 [@media(max-height:700px)]:h-10 lg:w-14 lg:h-14 flex items-center justify-center overflow-hidden">
      <span className={`font-bold ${colorClass} text-lg lg:text-xl`}>{letter}</span>
    </div>
  );
}

function MiniUnified({
  position,
  letter,
  variant = 'normal',
}: {
  position: number;
  letter: string;
  variant?: 'normal' | 'mirror';
}) {
  // Combined position + audio card with purple theme for binding
  const gridActiveColor = variant === 'mirror' ? '#57534e' : '#7c3aed'; // stone-600 vs violet-600
  const letterColor = variant === 'mirror' ? 'text-stone-600' : 'text-violet-600';
  return (
    <div className="bg-woven-surface/60 backdrop-blur-lg rounded-xl border border-woven-border/50 p-1.5 lg:p-2 flex flex-col items-center gap-0.5 overflow-hidden">
      <div className="grid grid-cols-3 gap-[1px] w-6 h-6 lg:w-8 lg:h-8">
        {GRID_MAP.map((logicPos, idx) => {
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
          const isActive = logicPos === position;
          return (
            <div
              key={idx}
              className="rounded-sm"
              style={{ backgroundColor: isActive ? gridActiveColor : '#f1f5f9' }}
            />
          );
        })}
      </div>
      <span className={`font-bold ${letterColor} text-xs lg:text-sm`}>{letter}</span>
    </div>
  );
}

// =============================================================================
// DraggableCard
// =============================================================================

/** Magnetic target info returned by onDragMove */
export interface MagneticTarget {
  key: string;
  centerX: number;
  centerY: number;
}

interface DraggableCardProps {
  proposal: PlaceProposal;
  onDragStart: (proposalId: string) => void;
  /** Called during drag with current position. Returns magnetic target info if within range. */
  onDragMove?: (proposalId: string, x: number, y: number) => MagneticTarget | null;
  /** Called when drag ends with position, trajectory data, and optional magnetic target */
  onDragEnd: (
    proposalId: string,
    x: number,
    y: number,
    trajectory: DragTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  disabled?: boolean;
  /** Highlight this card as the active target in guided mode */
  isActive?: boolean;
  /** Visual variant: 'normal' (blue/green) or 'mirror' (brown/orange) */
  variant?: 'normal' | 'mirror';
  /** If true, uses data-mirror-proposal-id attribute */
  isMirror?: boolean;
  /** Custom ID to use instead of proposal.id (for unified proposals) */
  customId?: string;
  /** Custom data attribute name (for unified proposals) */
  dataAttrName?: string;
}

export function DraggableCard({
  proposal,
  onDragStart,
  onDragMove,
  onDragEnd,
  disabled,
  isActive,
  variant = 'normal',
  isMirror = false,
  customId,
  dataAttrName,
}: DraggableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const magneticTargetRef = useRef<MagneticTarget | null>(null);

  // Use custom ID if provided, otherwise use proposal.id
  const effectiveId = customId ?? proposal.id;

  // For mirror cards, we need to preserve scaleX: -1 during GSAP animations
  const baseScaleX = variant === 'mirror' ? -1 : 1;

  // === Trajectory tracking ===
  const trajectoryRef = useRef<{
    startTime: number;
    totalDistance: number;
    lastPos: { x: number; y: number };
    slotEnters: DragSlotEnter[];
    lastSlotKey: string | null; // To avoid duplicate entries
    // For replay: XY points sampled at 20Hz
    xyPoints: RawTrajectoryPoint[];
    lastSampleTime: number;
    lastSlotCheckTime: number; // Throttle slot detection
    containerRect: { left: number; top: number; width: number; height: number } | null;
    inputMethod: 'mouse' | 'touch' | null;
  }>({
    startTime: 0,
    totalDistance: 0,
    lastPos: { x: 0, y: 0 },
    slotEnters: [],
    lastSlotKey: null,
    xyPoints: [],
    lastSampleTime: 0,
    lastSlotCheckTime: 0,
    containerRect: null,
    inputMethod: null,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      const card = cardRef.current;
      if (!card) return;

      card.setPointerCapture(e.pointerId);
      setIsDragging(true);
      onDragStart(effectiveId);

      startPos.current = { x: e.clientX, y: e.clientY };
      currentPos.current = { x: 0, y: 0 };

      // Get container rect for coordinate normalization (use viewport as container)
      const containerRect = {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };

      const now = performance.now();

      // Detect input method from pointerType ('pen' treated as 'touch')
      const inputMethod: 'mouse' | 'touch' = e.pointerType === 'mouse' ? 'mouse' : 'touch';

      // Initialize trajectory tracking
      trajectoryRef.current = {
        startTime: now,
        totalDistance: 0,
        lastPos: { x: e.clientX, y: e.clientY },
        slotEnters: [],
        lastSlotKey: null,
        // Capture first point immediately
        xyPoints: [{ x: e.clientX, y: e.clientY, t: now }],
        lastSampleTime: now,
        lastSlotCheckTime: now,
        containerRect,
        inputMethod,
      };

      // Reset magnetic target
      magneticTargetRef.current = null;

      // Preserve scaleX for mirror cards while scaling up
      gsap.to(card, {
        scaleX: baseScaleX * 1.1,
        scaleY: 1.1,
        duration: 0.15,
        force3D: true, // Force GPU acceleration for smoother mobile touch
      });
    },
    [disabled, onDragStart, effectiveId, baseScaleX],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const card = cardRef.current;
      if (!card) return;

      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      currentPos.current = { x: dx, y: dy };

      gsap.set(card, { x: dx, y: dy });

      // === Track trajectory ===
      const traj = trajectoryRef.current;
      const now = performance.now();

      // Accumulate distance
      const distDelta = Math.sqrt(
        (e.clientX - traj.lastPos.x) ** 2 + (e.clientY - traj.lastPos.y) ** 2,
      );
      traj.totalDistance += distDelta;
      traj.lastPos = { x: e.clientX, y: e.clientY };

      // Sample XY at 20Hz for replay
      if (now - traj.lastSampleTime >= TRAJECTORY_SAMPLE_INTERVAL_MS) {
        traj.xyPoints.push({ x: e.clientX, y: e.clientY, t: now });
        traj.lastSampleTime = now;
      }

      // Throttle slot detection to ~20Hz (elementsFromPoint is expensive)
      // This is for trajectory analysis, not real-time feedback
      if (now - traj.lastSlotCheckTime >= TRAJECTORY_SAMPLE_INTERVAL_MS) {
        traj.lastSlotCheckTime = now;

        // Detect slot under cursor using elementsFromPoint
        // (the card itself is under cursor, so we check all elements)
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of elements) {
          // Check normal drop zone
          const normalSlot = el.getAttribute('data-drop-slot');
          const normalType = el.getAttribute('data-drop-type');
          if (normalSlot !== null && normalType !== null) {
            const slotKey = `normal-${normalType}-${normalSlot}`;
            if (slotKey !== traj.lastSlotKey) {
              traj.lastSlotKey = slotKey;
              traj.slotEnters.push({
                slot: parseInt(normalSlot, 10),
                type: normalType as 'position' | 'audio',
                mirror: false,
                atMs: now,
              });
            }
            break; // Found a slot, stop searching
          }

          // Check mirror drop zone
          const mirrorSlot = el.getAttribute('data-mirror-drop-slot');
          const mirrorType = el.getAttribute('data-mirror-drop-type');
          if (mirrorSlot !== null && mirrorType !== null) {
            const slotKey = `mirror-${mirrorType}-${mirrorSlot}`;
            if (slotKey !== traj.lastSlotKey) {
              traj.lastSlotKey = slotKey;
              traj.slotEnters.push({
                slot: parseInt(mirrorSlot, 10),
                type: mirrorType as 'position' | 'audio',
                mirror: true,
                atMs: now,
              });
            }
            break;
          }
        }
      }

      // Call onDragMove if provided (for magnetic detection)
      if (onDragMove) {
        magneticTargetRef.current = onDragMove(effectiveId, e.clientX, e.clientY);
      }
    },
    [isDragging, onDragMove, effectiveId],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const card = cardRef.current;
      if (!card) return;

      card.releasePointerCapture(e.pointerId);
      setIsDragging(false);

      // Calculate direct distance from start to end
      const directDistancePx = Math.sqrt(
        (e.clientX - startPos.current.x) ** 2 + (e.clientY - startPos.current.y) ** 2,
      );

      // Build trajectory data
      const traj = trajectoryRef.current;

      // Capture final point
      traj.xyPoints.push({ x: e.clientX, y: e.clientY, t: performance.now() });

      // Encode XY trajectory for storage
      const compactTrajectory =
        traj.containerRect && traj.xyPoints.length > 1
          ? encodeTrajectory(traj.xyPoints, traj.containerRect)
          : undefined;

      const trajectoryData: DragTrajectoryData = {
        dragStartedAtMs: traj.startTime,
        totalDistancePx: traj.totalDistance,
        directDistancePx,
        slotEnters: traj.slotEnters,
        trajectory: compactTrajectory,
        inputMethod: traj.inputMethod ?? undefined,
      };

      // Use event coordinates directly (more reliable with transforms)
      // The pointer position is where the user dropped the card
      // Pass magnetic target if available (from last onDragMove call)
      onDragEnd(
        effectiveId,
        e.clientX,
        e.clientY,
        trajectoryData,
        magneticTargetRef.current ?? undefined,
      );
    },
    [isDragging, onDragEnd, effectiveId],
  );

  /**
   * Animate card back to origin (called by parent on rejection)
   */
  const animateReject = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    // Shake animation
    gsap.to(card, {
      x: currentPos.current.x - 10,
      duration: 0.05,
      yoyo: true,
      repeat: 5,
      force3D: true,
      onComplete: () => {
        // Return to origin - preserve scaleX for mirror cards
        gsap.to(card, {
          x: 0,
          y: 0,
          scaleX: baseScaleX,
          scaleY: 1,
          duration: 0.3,
          ease: 'power2.out',
          force3D: true,
        });
      },
    });
  }, [baseScaleX]);

  // Expose animateReject via ref
  const imperativeRef = useRef({ animateReject });
  imperativeRef.current.animateReject = animateReject;

  // Initialize scaleX via GSAP on mount (avoids CSS/GSAP transform conflicts)
  useEffect(() => {
    if (cardRef.current) {
      gsap.set(cardRef.current, { scaleX: baseScaleX });
    }
  }, [baseScaleX]);

  // Determine data attribute: custom, mirror, or normal
  const dataAttr = dataAttrName
    ? { [dataAttrName]: effectiveId }
    : isMirror
      ? { 'data-mirror-proposal-id': proposal.id }
      : { 'data-proposal-id': proposal.id };

  return (
    <div
      ref={cardRef}
      {...dataAttr}
      className={`touch-none select-none cursor-grab rounded-xl overflow-hidden
        ${isDragging ? 'cursor-grabbing z-50 will-change-transform' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isActive ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${!isActive && isActive !== undefined ? 'opacity-40' : ''}
      `}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {proposal.type === 'position' ? (
        <MiniGrid position={proposal.value} variant={variant} />
      ) : proposal.type === 'audio' ? (
        <MiniLetter letter={proposal.value} variant={variant} />
      ) : (
        <MiniUnified position={proposal.position} letter={proposal.sound} variant={variant} />
      )}
    </div>
  );
}
