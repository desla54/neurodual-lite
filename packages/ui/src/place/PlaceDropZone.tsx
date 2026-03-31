// packages/ui/src/place/PlaceDropZone.tsx
/**
 * PlaceDropZone - A slot in the timeline that accepts dropped cards
 */

import { useRef } from 'react';

interface PlaceDropZoneProps {
  slot: number;
  type: 'position' | 'audio';
  label: string;
  filled: boolean;
  filledContent?: React.ReactNode;
  onDrop?: (slot: number, type: 'position' | 'audio') => void;
  highlight?: boolean;
  /** Optional border color class for trial color coding (e.g., 'border-red-500') */
  borderColorClass?: string;
  /** If true, zone is display-only (no drop target) */
  disabled?: boolean;
  /** Optional override for label color (e.g., 'text-amber-700' for mirror timeline) */
  labelColorClass?: string;
  /** If true, uses mirror drop attributes (data-mirror-drop-*) */
  mirror?: boolean;
  /** When true, filled content fades out (synchronized clearing) */
  isClearing?: boolean;
  /** Click handler for tap-to-correct in interactive replay */
  onClick?: () => void;
}

export function PlaceDropZone({
  slot,
  type,
  label,
  filled,
  filledContent,
  highlight,
  borderColorClass,
  disabled,
  labelColorClass,
  mirror,
  isClearing,
  onClick,
}: PlaceDropZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null);

  const defaultColorClass = type === 'position' ? 'text-visual' : 'text-audio';
  const colorClass = labelColorClass ?? defaultColorClass;
  const defaultBorderClass = type === 'position' ? 'border-visual/50' : 'border-audio/50';
  const borderClass = filled ? defaultBorderClass : 'border-slate-200';
  const bgClass = filled ? 'bg-slate-100' : 'bg-slate-50';

  // Convert border-xxx-500 to bg-xxx-500 for the color indicator
  const indicatorBgClass = borderColorClass?.replace('border-', 'bg-');

  const isClickable = !disabled && onClick && !filled;

  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xs font-bold ${colorClass} uppercase mb-1`}>{label}</div>
      <div
        ref={zoneRef}
        {...(!disabled &&
          (mirror
            ? { 'data-mirror-drop-slot': slot, 'data-mirror-drop-type': type }
            : { 'data-drop-slot': slot, 'data-drop-type': type }))}
        {...(isClickable
          ? {
              onClick,
              onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onClick?.(),
              role: 'button' as const,
              tabIndex: 0,
            }
          : {})}
        className={`relative w-12 h-12 [@media(max-height:700px)]:w-11 [@media(max-height:700px)]:h-11 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center transition-all
          ${bgClass}
          ${filled ? `border-2 ${borderClass} shadow-sm` : 'border-2 border-dashed border-slate-200'}
          ${highlight ? 'ring-2 ring-primary/50 ring-offset-2' : ''}
          ${disabled ? 'opacity-70' : ''}
          ${isClickable ? 'cursor-pointer hover:bg-primary/10' : ''}
        `}
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
