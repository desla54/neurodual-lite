/**
 * Soroban SVG Widget — Shared interactive Japanese abacus component
 *
 * Extracted from soroban-training.tsx for reuse across:
 * - Free-play recognition mode (soroban-training.tsx)
 * - Soroban learning journey (soroban-journey.tsx)
 *
 * Each rod: 1 heaven bead (value 5) + 4 earth beads (value 1 each)
 * Supports tap and drag interaction with GSAP animations.
 */

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@neurodual/ui';
import gsap from 'gsap';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Constants
// =============================================================================

export const BEAD_RADIUS = 12;
const BEAD_DIAMETER = BEAD_RADIUS * 2;
export const ROD_SPACING = 44;
const HEAVEN_SLOTS = 2;
const EARTH_SLOTS = 5;
const BEAD_GAP = 2;
const FRAME_PAD_X = 20;
const FRAME_PAD_TOP = 12;
const BEAM_Y = FRAME_PAD_TOP + HEAVEN_SLOTS * (BEAD_DIAMETER + BEAD_GAP) + 6;
const BEAM_HEIGHT = 4;
const EARTH_START_Y = BEAM_Y + BEAM_HEIGHT + 6;
const SVG_HEIGHT = EARTH_START_Y + EARTH_SLOTS * (BEAD_DIAMETER + BEAD_GAP) + FRAME_PAD_TOP;

const DRAG_THRESHOLD = 4;

// =============================================================================
// Soroban Logic (exported for reuse)
// =============================================================================

export function digitToBeads(digit: number): { heaven: boolean; earth: number } {
  return { heaven: digit >= 5, earth: digit % 5 };
}

export function beadsToDigit(heaven: boolean, earth: number): number {
  return (heaven ? 5 : 0) + Math.min(4, Math.max(0, earth));
}

export function numberToDigits(value: number, rodCount: number): number[] {
  const digits: number[] = [];
  let remaining = Math.max(0, Math.min(value, 10 ** rodCount - 1));
  for (let i = 0; i < rodCount; i++) {
    digits.unshift(remaining % 10);
    remaining = Math.floor(remaining / 10);
  }
  return digits;
}

export function digitsToNumber(digits: number[]): number {
  return digits.reduce((acc, digit) => acc * 10 + digit, 0);
}

// =============================================================================
// SVG Soroban Component
// =============================================================================

export interface SorobanWidgetProps {
  rodCount: number;
  value: number[];
  interactive: boolean;
  onChange: (rodIndex: number, newDigit: number) => void;
  className?: string;
}

function getHeavenBeadY(active: boolean): number {
  if (active) return BEAM_Y - BEAD_RADIUS - 2;
  return FRAME_PAD_TOP + BEAD_RADIUS;
}

function getEarthBeadY(beadIndex: number, earthCount: number): number {
  const isTouchingBeam = beadIndex < earthCount;
  if (isTouchingBeam) {
    return EARTH_START_Y + beadIndex * (BEAD_DIAMETER + BEAD_GAP) + BEAD_RADIUS;
  }
  const restOffset = 4 - earthCount > 0 ? beadIndex - earthCount : 0;
  const baseY = EARTH_START_Y + (EARTH_SLOTS - (4 - earthCount)) * (BEAD_DIAMETER + BEAD_GAP);
  return baseY + restOffset * (BEAD_DIAMETER + BEAD_GAP) + BEAD_RADIUS;
}

export function SorobanWidget({
  rodCount,
  value,
  interactive,
  onChange,
  className,
}: SorobanWidgetProps) {
  const { t } = useTranslation();
  const beadRefs = useRef<Map<string, SVGCircleElement>>(new Map());
  const prevValueRef = useRef<number[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const dragRef = useRef<{
    active: boolean;
    rod: number;
    type: 'heaven' | 'earth';
    beadIndex: number;
    startY: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);

  const svgWidth = FRAME_PAD_X * 2 + (rodCount - 1) * ROD_SPACING + BEAD_DIAMETER;

  // Animate beads when value changes
  useEffect(() => {
    const prev = prevValueRef.current;
    for (let rod = 0; rod < rodCount; rod++) {
      const digit = value[rod] ?? 0;
      const prevDigit = prev[rod] ?? -1;
      if (digit === prevDigit) continue;

      const { heaven, earth } = digitToBeads(digit);

      const heavenEl = beadRefs.current.get(`h-${rod}`);
      if (heavenEl) {
        gsap.to(heavenEl, {
          cy: getHeavenBeadY(heaven),
          duration: 0.15,
          ease: 'power2.out',
        });
      }

      for (let b = 0; b < 4; b++) {
        const earthEl = beadRefs.current.get(`e-${rod}-${b}`);
        if (earthEl) {
          gsap.to(earthEl, {
            cy: getEarthBeadY(b, earth),
            duration: 0.15,
            ease: 'power2.out',
          });
        }
      }
    }
    prevValueRef.current = [...value];
  }, [value, rodCount]);

  // ---- Drag handlers ----
  const getSvgY = useCallback((clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return clientY;
    const pt = svg.createSVGPoint();
    pt.x = 0;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return clientY;
    return pt.matrixTransform(ctm.inverse()).y;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, rod: number, type: 'heaven' | 'earth', beadIndex: number) => {
      if (!interactive) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);

      const el =
        type === 'heaven'
          ? beadRefs.current.get(`h-${rod}`)
          : beadRefs.current.get(`e-${rod}-${beadIndex}`);
      const startY = el ? Number.parseFloat(el.getAttribute('cy') ?? '0') : 0;

      dragRef.current = {
        active: true,
        rod,
        type,
        beadIndex,
        startY,
        startClientY: e.clientY,
        hasMoved: false,
      };
    },
    [interactive],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;

      const dy = e.clientY - drag.startClientY;
      if (Math.abs(dy) > DRAG_THRESHOLD) {
        drag.hasMoved = true;
      }

      if (!drag.hasMoved) return;

      const key = drag.type === 'heaven' ? `h-${drag.rod}` : `e-${drag.rod}-${drag.beadIndex}`;
      const el = beadRefs.current.get(key);
      if (!el) return;

      const svgDy = getSvgY(e.clientY) - getSvgY(drag.startClientY);
      let newY = drag.startY + svgDy;

      newY = Math.max(
        FRAME_PAD_TOP + BEAD_RADIUS,
        Math.min(SVG_HEIGHT - FRAME_PAD_TOP - BEAD_RADIUS, newY),
      );

      gsap.killTweensOf(el);
      gsap.set(el, { cy: newY });
    },
    [getSvgY],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      dragRef.current = null;
      (e.target as Element).releasePointerCapture(e.pointerId);

      const digit = value[drag.rod] ?? 0;
      const { heaven, earth } = digitToBeads(digit);

      if (!drag.hasMoved) {
        if (drag.type === 'heaven') {
          onChange(drag.rod, beadsToDigit(!heaven, earth));
        } else {
          const newEarth = drag.beadIndex < earth ? drag.beadIndex : drag.beadIndex + 1;
          onChange(drag.rod, beadsToDigit(heaven, newEarth));
        }
        return;
      }

      const svgDy = getSvgY(e.clientY) - getSvgY(drag.startClientY);

      if (drag.type === 'heaven') {
        const newHeaven = svgDy > 0 ? true : svgDy < 0 ? false : heaven;
        onChange(drag.rod, beadsToDigit(newHeaven, earth));
      } else {
        if (svgDy < -DRAG_THRESHOLD) {
          const newEarth = Math.max(earth, drag.beadIndex + 1);
          onChange(drag.rod, beadsToDigit(heaven, newEarth));
        } else if (svgDy > DRAG_THRESHOLD) {
          const newEarth = Math.min(earth, drag.beadIndex);
          onChange(drag.rod, beadsToDigit(heaven, newEarth));
        } else {
          onChange(drag.rod, digit);
        }
      }
    },
    [value, onChange, getSvgY],
  );

  const setBeadRef = useCallback((key: string, el: SVGCircleElement | null) => {
    if (el) beadRefs.current.set(key, el);
    else beadRefs.current.delete(key);
  }, []);

  const rodHeight = SVG_HEIGHT - FRAME_PAD_TOP * 2;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
      className={cn('w-full max-w-[340px] max-h-[40vh] select-none touch-none', className)}
      aria-label={t('settings.gameMode.soroban', 'Soroban')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Frame */}
      <rect
        x={4}
        y={4}
        width={svgWidth - 8}
        height={SVG_HEIGHT - 8}
        rx={12}
        ry={12}
        className="fill-woven-surface stroke-woven-border"
        strokeWidth={3}
      />

      {/* Beam */}
      <rect
        x={10}
        y={BEAM_Y}
        width={svgWidth - 20}
        height={BEAM_HEIGHT}
        rx={2}
        className="fill-woven-text/20"
      />

      {/* Rods and beads */}
      {Array.from({ length: rodCount }, (_, rodIdx) => {
        const cx = FRAME_PAD_X + rodIdx * ROD_SPACING + BEAD_RADIUS;
        const digit = value[rodIdx] ?? 0;
        const { heaven, earth } = digitToBeads(digit);

        return (
          <g key={rodIdx}>
            <line
              x1={cx}
              y1={FRAME_PAD_TOP}
              x2={cx}
              y2={FRAME_PAD_TOP + rodHeight}
              className="stroke-woven-text-muted/40"
              strokeWidth={2}
            />

            {/* Heaven bead */}
            <circle
              ref={(el) => setBeadRef(`h-${rodIdx}`, el)}
              cx={cx}
              cy={getHeavenBeadY(heaven)}
              r={BEAD_RADIUS}
              className={cn(
                interactive ? 'cursor-grab active:cursor-grabbing' : '',
                'transition-colors',
                heaven ? 'fill-amber-500 dark:fill-amber-400' : 'fill-woven-cell-rest',
              )}
              stroke="currentColor"
              strokeWidth={1.5}
              onPointerDown={(e) => handlePointerDown(e, rodIdx, 'heaven', 0)}
              role={interactive ? 'button' : undefined}
              aria-label={
                interactive
                  ? `${t('game.cogTask.soroban.rodLabel', { n: rodIdx + 1 })} – ${t('game.cogTask.soroban.heavenBead')}`
                  : undefined
              }
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
            />

            {/* Earth beads */}
            {Array.from({ length: 4 }, (_, beadIdx) => {
              const isActive = beadIdx < earth;
              return (
                <circle
                  key={beadIdx}
                  ref={(el) => setBeadRef(`e-${rodIdx}-${beadIdx}`, el)}
                  cx={cx}
                  cy={getEarthBeadY(beadIdx, earth)}
                  r={BEAD_RADIUS}
                  className={cn(
                    interactive ? 'cursor-grab active:cursor-grabbing' : '',
                    'transition-colors',
                    isActive ? 'fill-amber-500 dark:fill-amber-400' : 'fill-woven-cell-rest',
                  )}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  onPointerDown={(e) => handlePointerDown(e, rodIdx, 'earth', beadIdx)}
                  role={interactive ? 'button' : undefined}
                  aria-label={
                    interactive
                      ? `${t('game.cogTask.soroban.rodLabel', { n: rodIdx + 1 })} – ${t('game.cogTask.soroban.earthBead')} ${beadIdx + 1}`
                      : undefined
                  }
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
