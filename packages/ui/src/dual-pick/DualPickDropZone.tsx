// packages/ui/src/dual-pick/DualPickDropZone.tsx
/**
 * DualPickDropZone - A timeline slot showing stimulus content, waiting for a label
 *
 * Structure:
 * - Outer slot (dotted border) - ALWAYS visible, static
 * - Inner card (MiniGrid/MiniLetter) - shows content when available
 */

import type { DualPickId } from '@neurodual/logic';
import type { ReactNode } from 'react';
import { useRef } from 'react';

// =============================================================================
// Mini Components (EXACT copy from DraggableCard)
// =============================================================================

const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7];

function MiniGrid({
  position,
  variant = 'normal',
}: {
  position: number;
  variant?: 'normal' | 'mirror';
}) {
  // Blue for normal, amber/brown for mirror
  const activeColor = variant === 'mirror' ? '#b45309' : '#3b82f6'; // amber-700 vs blue-500
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
  // Green for normal, orange for mirror
  const colorClass = variant === 'mirror' ? 'text-orange-500' : 'text-audio';
  return (
    <div className="bg-woven-surface/60 backdrop-blur-lg rounded-xl border border-woven-border/50 w-11 h-11 [@media(max-height:700px)]:w-10 [@media(max-height:700px)]:h-10 lg:w-14 lg:h-14 flex items-center justify-center overflow-hidden">
      <span className={`font-bold ${colorClass} text-lg lg:text-xl`}>{letter}</span>
    </div>
  );
}

// =============================================================================
// Label Badge (shown when a label is placed)
// =============================================================================

function LabelBadge({
  label,
  type,
  variant = 'normal',
}: {
  label: DualPickId;
  type: 'position' | 'audio' | 'unified';
  variant?: 'normal' | 'mirror';
}) {
  let bgClass: string;
  if (type === 'unified') {
    bgClass = 'bg-purple-600';
  } else if (variant === 'mirror') {
    bgClass = type === 'position' ? 'bg-amber-700' : 'bg-orange-500';
  } else {
    bgClass = type === 'position' ? 'bg-visual' : 'bg-audio';
  }
  return (
    <div
      className={`absolute -top-2 -right-2 px-1.5 py-0.5 text-xxs lg:text-3xs font-bold text-white ${bgClass} rounded z-10`}
    >
      {label}
    </div>
  );
}

// =============================================================================
// MiniUnified - Shows both position grid and letter for unified mode
// =============================================================================

function MiniUnified({ position, letter }: { position: number; letter: string }) {
  return (
    <div className="bg-woven-surface/60 backdrop-blur-lg rounded-xl border border-woven-border/50 p-1 flex flex-col items-center gap-0.5">
      {/* Mini position grid */}
      <div className="grid grid-cols-3 gap-[1px] w-6 h-6">
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
              style={{ backgroundColor: isActive ? '#9333ea' : '#f1f5f9' }}
            />
          );
        })}
      </div>
      {/* Letter */}
      <span className="font-bold text-purple-600 text-xs">{letter}</span>
    </div>
  );
}

// =============================================================================
// DualPickDropZone
// =============================================================================

interface DualPickDropZoneProps {
  slot: number;
  type: 'position' | 'audio' | 'unified';
  position?: number;
  sound?: string;
  placedLabel: DualPickId | null;
  highlight?: boolean;
  borderColorClass?: string;
  showSlotLabel?: boolean;
  filledContent?: ReactNode;
  mirror?: boolean;
  isDistractor?: boolean;
  distractorId?: string;
}

export function DualPickDropZone({
  slot,
  type,
  position,
  sound,
  placedLabel,
  highlight,
  borderColorClass,
  showSlotLabel = true,
  filledContent,
  mirror = false,
  isDistractor = false,
  distractorId,
}: DualPickDropZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const variant = mirror ? 'mirror' : 'normal';

  const indicatorBgClass = borderColorClass?.replace('border-', 'bg-');

  const slotLabel = slot === 0 ? 'N' : `N-${slot}`;
  let labelColorClass: string;
  if (type === 'unified') {
    labelColorClass = 'text-purple-600/30';
  } else if (mirror) {
    labelColorClass = type === 'position' ? 'text-amber-700/30' : 'text-orange-500/30';
  } else {
    labelColorClass = type === 'position' ? 'text-visual/30' : 'text-audio/30';
  }

  const hasContent =
    type === 'unified'
      ? position !== undefined && sound !== undefined
      : (type === 'position' && position !== undefined) || (type === 'audio' && sound);

  const dataAttrs = isDistractor
    ? {
        'data-dual-pick-distractor': 'true',
        'data-dual-pick-type': type,
        'data-dual-pick-distractor-id': distractorId,
      }
    : mirror
      ? { 'data-dual-pick-mirror-slot': slot, 'data-dual-pick-mirror-type': type }
      : { 'data-dual-pick-slot': slot, 'data-dual-pick-type': type };

  return (
    <div className="flex flex-col items-center">
      {/* Outer slot - ALWAYS visible with dotted border */}
      <div
        ref={zoneRef}
        {...dataAttrs}
        className={`relative w-12 h-12 [@media(max-height:700px)]:w-11 [@media(max-height:700px)]:h-11 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center
          bg-slate-50 border-2 border-dashed border-slate-200
          ${highlight ? 'ring-2 ring-primary/50 ring-offset-2' : ''}
        `}
      >
        {/* Slot label in background (N, N-1, N-2) */}
        {showSlotLabel && hasContent && !isDistractor && (
          <span
            className={`absolute inset-0 flex items-center justify-center text-lg lg:text-xl font-bold ${labelColorClass} pointer-events-none`}
          >
            {slotLabel}
          </span>
        )}

        {/* Inner content card */}
        {hasContent && (
          <div className="relative z-10">
            {placedLabel && filledContent ? (
              filledContent
            ) : (
              <>
                {type === 'unified' && position !== undefined && sound && (
                  <MiniUnified position={position} letter={sound} />
                )}
                {type === 'position' && position !== undefined && (
                  <MiniGrid position={position} variant={variant} />
                )}
                {type === 'audio' && sound && <MiniLetter letter={sound} variant={variant} />}
              </>
            )}
          </div>
        )}

        {/* Label badge when placed */}
        {placedLabel && <LabelBadge label={placedLabel} type={type} variant={variant} />}
      </div>

      {/* Color indicator bar under the slot */}
      {indicatorBgClass && <div className={`w-8 h-1 rounded-full mt-1.5 ${indicatorBgClass}`} />}
    </div>
  );
}
