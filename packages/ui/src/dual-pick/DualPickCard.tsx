// packages/ui/src/dual-pick/DualPickCard.tsx
/**
 * DualPickCard - A draggable label card (N, N-1, N-2)
 *
 * SAME visual design and behavior as DraggableCard:
 * - Same sizes, animations, drag handling
 * - Same trajectory tracking
 *
 * Difference: displays a label instead of position/letter
 */

import type { DualPickProposal, CompactTrajectory, RawTrajectoryPoint } from '@neurodual/logic';
import { encodeTrajectory, TRAJECTORY_SAMPLE_INTERVAL_MS } from '@neurodual/logic';
import { useRef, useState, useCallback, useEffect } from 'react';
import gsap from 'gsap';

// =============================================================================
// Trajectory Types (SAME as DraggableCard)
// =============================================================================

export interface DualPickSlotEnter {
  slot: number;
  type: 'position' | 'audio' | 'unified';
  atMs: number;
}

export interface DualPickTrajectoryData {
  dragStartedAtMs: number;
  totalDistancePx: number;
  directDistancePx: number;
  slotEnters: DualPickSlotEnter[];
  trajectory?: CompactTrajectory;
  /** Input method used for this drag (mouse or touch) */
  inputMethod?: 'mouse' | 'touch';
}

// =============================================================================
// LabelCard - Same style as DraggableCard with colored border for modality
// =============================================================================

function LabelCard({
  label,
  type,
  variant = 'normal',
}: {
  label: string;
  type: 'position' | 'audio' | 'unified';
  variant?: 'normal' | 'mirror';
}) {
  // INVERTED COLORS: Cards match their TARGET timeline color
  // Normal cards → drop on mirror timeline → use mirror colors (amber/orange)
  // Mirror cards → drop on normal timeline → use normal colors (blue/green)
  // Unified cards use purple to indicate binding
  let borderClass: string;
  let textClass: string;
  if (type === 'unified') {
    // Unified mode: purple for binding (position + audio together)
    borderClass = 'border-purple-600';
    textClass = 'text-purple-600';
  } else if (variant === 'normal') {
    // Normal card uses mirror colors (amber/orange) - drops on mirror timeline
    borderClass = type === 'position' ? 'border-amber-700' : 'border-orange-500';
    textClass = type === 'position' ? 'text-amber-700' : 'text-orange-500';
  } else {
    // Mirror card uses normal colors (blue/green) - drops on normal timeline
    borderClass = type === 'position' ? 'border-visual' : 'border-audio';
    textClass = type === 'position' ? 'text-visual' : 'text-audio';
  }

  return (
    <div
      className={`bg-woven-surface/60 backdrop-blur-lg rounded-xl border-2 ${borderClass} w-11 h-11 [@media(max-height:700px)]:w-10 [@media(max-height:700px)]:h-10 lg:w-14 lg:h-14 flex items-center justify-center`}
    >
      <span className={`font-bold ${textClass} text-lg lg:text-xl`}>{label}</span>
    </div>
  );
}

// =============================================================================
// DualPickCard (SAME structure as DraggableCard)
// =============================================================================

/** Magnetic zone info passed to onDragEnd for landing animation */
export interface MagneticTarget {
  key: string;
  centerX: number;
  centerY: number;
}

interface DualPickCardProps {
  proposal: DualPickProposal;
  onDragStart: (proposalId: string) => void;
  onDragEnd: (
    proposalId: string,
    x: number,
    y: number,
    trajectory: DualPickTrajectoryData,
    magneticTarget?: MagneticTarget,
  ) => void;
  /** Called on every pointer move during drag - for magnetic zone detection */
  onDragMove?: (proposalId: string, x: number, y: number) => MagneticTarget | null;
  disabled?: boolean;
  isActive?: boolean;
  /** Mirror mode: amber colors and scaleX(-1) */
  mirror?: boolean;
  /** Custom data attributes for the card wrapper */
  dataAttr?: Record<string, string>;
}

export function DualPickCard({
  proposal,
  onDragStart,
  onDragEnd,
  onDragMove,
  disabled,
  isActive,
  mirror = false,
  dataAttr,
}: DualPickCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const magneticTargetRef = useRef<MagneticTarget | null>(null);

  // === Trajectory tracking (SAME as DraggableCard) ===
  const trajectoryRef = useRef<{
    startTime: number;
    totalDistance: number;
    lastPos: { x: number; y: number };
    slotEnters: DualPickSlotEnter[];
    lastSlotKey: string | null;
    xyPoints: RawTrajectoryPoint[];
    lastSampleTime: number;
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
      onDragStart(proposal.id);

      startPos.current = { x: e.clientX, y: e.clientY };
      currentPos.current = { x: 0, y: 0 };

      const containerRect = {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };

      const now = performance.now();

      // Detect input method from pointerType ('pen' treated as 'touch')
      const inputMethod: 'mouse' | 'touch' = e.pointerType === 'mouse' ? 'mouse' : 'touch';

      trajectoryRef.current = {
        startTime: now,
        totalDistance: 0,
        lastPos: { x: e.clientX, y: e.clientY },
        slotEnters: [],
        lastSlotKey: null,
        xyPoints: [{ x: e.clientX, y: e.clientY, t: now }],
        lastSampleTime: now,
        containerRect,
        inputMethod,
      };

      // SAME animation as DraggableCard, preserve scaleX for mirror
      gsap.to(card, {
        scaleX: mirror ? -1.1 : 1.1,
        scaleY: 1.1,
        duration: 0.15,
      });
    },
    [disabled, onDragStart, proposal.id, mirror],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const card = cardRef.current;
      if (!card) return;

      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      currentPos.current = { x: dx, y: dy };

      // Slight inertia for smoother feel (20ms lag)
      gsap.to(card, { x: dx, y: dy, duration: 0.08, ease: 'power2.out', overwrite: true });

      // === Track trajectory (SAME as DraggableCard) ===
      const traj = trajectoryRef.current;
      const now = performance.now();

      const distDelta = Math.sqrt(
        (e.clientX - traj.lastPos.x) ** 2 + (e.clientY - traj.lastPos.y) ** 2,
      );
      traj.totalDistance += distDelta;
      traj.lastPos = { x: e.clientX, y: e.clientY };

      if (now - traj.lastSampleTime >= TRAJECTORY_SAMPLE_INTERVAL_MS) {
        traj.xyPoints.push({ x: e.clientX, y: e.clientY, t: now });
        traj.lastSampleTime = now;
      }

      // Call onDragMove for magnetic zone detection
      if (onDragMove) {
        const newTarget = onDragMove(proposal.id, e.clientX, e.clientY);
        magneticTargetRef.current = newTarget;
      }

      // Detect slot under cursor (dual-pick specific attributes) for trajectory tracking
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of elements) {
        const slotAttr = el.getAttribute('data-dual-pick-slot');
        const typeAttr = el.getAttribute('data-dual-pick-type');
        if (slotAttr !== null && typeAttr !== null) {
          const slot = parseInt(slotAttr, 10);
          const type = typeAttr as 'position' | 'audio' | 'unified';
          const slotKey = `${type}-${slot}`;
          if (slotKey !== traj.lastSlotKey) {
            traj.lastSlotKey = slotKey;
            traj.slotEnters.push({
              slot,
              type,
              atMs: performance.now(),
            });
          }
          break;
        }
      }
    },
    [isDragging, onDragMove, proposal.id],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const card = cardRef.current;
      if (!card) return;

      card.releasePointerCapture(e.pointerId);
      setIsDragging(false);

      const directDistancePx = Math.sqrt(
        (e.clientX - startPos.current.x) ** 2 + (e.clientY - startPos.current.y) ** 2,
      );

      const traj = trajectoryRef.current;
      traj.xyPoints.push({ x: e.clientX, y: e.clientY, t: performance.now() });

      const compactTrajectory =
        traj.containerRect && traj.xyPoints.length > 1
          ? encodeTrajectory(traj.xyPoints, traj.containerRect)
          : undefined;

      const trajectoryData: DualPickTrajectoryData = {
        dragStartedAtMs: traj.startTime,
        totalDistancePx: traj.totalDistance,
        directDistancePx,
        slotEnters: traj.slotEnters,
        trajectory: compactTrajectory,
        inputMethod: traj.inputMethod ?? undefined,
      };

      // Pass magnetic target for landing animation
      const magneticTarget = magneticTargetRef.current;
      magneticTargetRef.current = null;

      onDragEnd(proposal.id, e.clientX, e.clientY, trajectoryData, magneticTarget ?? undefined);
    },
    [isDragging, onDragEnd, proposal.id],
  );

  useEffect(() => {
    if (cardRef.current) {
      // Set initial scale, preserving scaleX for mirror mode
      gsap.set(cardRef.current, { scaleX: mirror ? -1 : 1, scaleY: 1 });
    }
  }, [mirror]);

  const variant = mirror ? 'mirror' : 'normal';

  // Ring color based on variant (inverted: normal uses mirror colors, mirror uses normal colors)
  const ringClass = mirror ? 'ring-primary' : 'ring-amber-500';

  return (
    <div
      ref={cardRef}
      data-label-proposal-id={proposal.id}
      data-label-proposal-type={proposal.type}
      {...dataAttr}
      // SAME classes as DraggableCard
      className={`touch-none select-none cursor-grab rounded-xl overflow-visible
        ${isDragging ? 'cursor-grabbing z-50' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isActive ? `ring-2 ${ringClass} ring-offset-2` : ''}
        ${!isActive && isActive !== undefined ? 'opacity-40' : ''}
      `}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <LabelCard label={proposal.label} type={proposal.type} variant={variant} />
    </div>
  );
}
