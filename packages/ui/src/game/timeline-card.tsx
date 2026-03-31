/**
 * TimelineCard - small card used for timelines (guided / recall).
 */

import { cn } from '../lib/utils';

const BORDER_CLASSES: Record<string, string> = {
  green: 'border-green-500',
  orange: 'border-orange-500',
  red: 'border-red-500',
  blue: 'border-blue-500',
  slate: 'border-slate-200',
  // Extended colors for trial color coding
  emerald: 'border-emerald-500',
  amber: 'border-amber-500',
  purple: 'border-purple-500',
  cyan: 'border-cyan-500',
  pink: 'border-pink-500',
  lime: 'border-lime-500',
  indigo: 'border-indigo-500',
  teal: 'border-teal-500',
  rose: 'border-rose-500',
};

const COLOR_CLASSES: Record<string, string> = {
  black: 'bg-foreground',
  gray: 'bg-slate-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  magenta: 'bg-fuchsia-500',
};

export interface TimelineCardProps {
  readonly label: string;
  readonly isCurrent?: boolean;
  /** Border color key (green, orange, red, blue, slate, emerald, amber, purple, cyan, pink, lime, indigo, teal, rose) */
  readonly borderColorKey?: keyof typeof BORDER_CLASSES;
  /** Direct Tailwind border class (overrides borderColorKey if provided) */
  readonly borderColorClass?: string;
  /** Use neutral styling (no color-coded border logic). */
  readonly neutralStyle?: boolean;
  /** Disable primary accent for current card label. */
  readonly disableCurrentAccent?: boolean;
  /** Keep dashed border for empty cards (default true). */
  readonly emptyDashed?: boolean;
  readonly sound?: string;
  readonly position?: number;
  readonly color?: string;
  readonly isEmpty?: boolean;
  readonly className?: string;
}

export function TimelineCard({
  label,
  isCurrent = false,
  borderColorKey = 'slate',
  borderColorClass,
  neutralStyle = false,
  disableCurrentAccent = false,
  emptyDashed = true,
  sound,
  position,
  color,
  isEmpty = false,
  className,
}: TimelineCardProps) {
  // Use direct class if provided, otherwise use key lookup
  const borderClass = borderColorClass ?? BORDER_CLASSES[borderColorKey] ?? BORDER_CLASSES['slate'];
  const empty = isEmpty || (sound === undefined && position === undefined);
  const cardSizeClass =
    'h-16 w-11 gap-1 min-[360px]:h-[4.75rem] min-[360px]:w-[3.35rem] min-[360px]:gap-1.5 xs:h-[5.25rem] xs:w-[3.75rem]';
  const audioSizeClass =
    'text-xs leading-none min-[360px]:text-sm min-[360px]:leading-none xs:text-[1.05rem] xs:leading-none';
  const labelOffsetClass = '-top-[1.1rem] min-[360px]:-top-[1.2rem] xs:-top-[1.3rem]';
  const labelColorClass = neutralStyle
    ? isCurrent
      ? 'text-woven-text'
      : 'text-woven-text-muted'
    : isCurrent && !disableCurrentAccent
      ? 'text-primary'
      : 'text-slate-400';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-500',
        cardSizeClass,
        neutralStyle ? 'border-woven-border/50 bg-woven-surface/60 backdrop-blur-lg' : 'bg-white',
        neutralStyle ? 'border-woven-border/50' : borderClass,
        empty ? 'opacity-30' : 'opacity-100',
        empty && emptyDashed && 'border-dashed',
        isCurrent && 'z-10',
        className,
      )}
    >
      {/* Audio */}
      <div
        className={cn(
          'font-bold transition-colors duration-300',
          audioSizeClass,
          empty ? 'text-transparent' : neutralStyle ? 'text-woven-text' : 'text-slate-700',
        )}
      >
        {sound ?? '-'}
      </div>

      {/* Mini Grid */}
      <div>
        <MiniGrid position={position ?? -1} color={color} isEmpty={empty} />
      </div>

      {/* Label */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 text-3xs font-black uppercase tracking-wider whitespace-nowrap',
          labelOffsetClass,
          labelColorClass,
        )}
      >
        {label}
      </div>
    </div>
  );
}

interface MiniGridProps {
  position: number;
  color?: string;
  isEmpty?: boolean;
}

function MiniGrid({ position, color, isEmpty }: MiniGridProps) {
  // Convertir position logique (0-7, sans centre) vers index grille (0-8)
  const gridIndex = position >= 4 ? position + 1 : position;
  const gridSizeClass = 'w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 xs:w-10 xs:h-10';
  const crossSizeClass =
    'w-1.5 h-1.5 min-[360px]:w-[0.45rem] min-[360px]:h-[0.45rem] xs:w-2 xs:h-2';

  return (
    <div className={cn('relative', gridSizeClass)}>
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 border border-woven-border/50 rounded-[3px] overflow-hidden bg-woven-surface/60 backdrop-blur-lg">
        {Array.from({ length: 9 }).map((_, i) => {
          const isActive = i === gridIndex;
          const bgClass =
            isActive && !isEmpty
              ? color
                ? (COLOR_CLASSES[color] ?? 'bg-woven-text')
                : 'bg-woven-text'
              : 'bg-woven-surface/60';
          return (
            <div
              key={i}
              className={cn(
                'w-full h-full transition-colors duration-200 border-woven-border',
                i % 3 !== 2 && 'border-r',
                i < 6 && 'border-b',
                bgClass,
                isEmpty && 'opacity-45',
              )}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={cn('relative', crossSizeClass, isEmpty ? 'opacity-25' : 'opacity-45')}>
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-woven-text-muted" />
          <div className="absolute top-1/2 left-0 w-full h-px -translate-y-1/2 bg-woven-text-muted" />
        </div>
      </div>
    </div>
  );
}
