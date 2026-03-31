/**
 * StringArtPlus - Geometric string art pattern for stimulus display
 *
 * Supports two sizing modes:
 * - Fixed: size={80} gives 80x80px
 * - Responsive: size="full" fills container (use with w-full h-full on parent)
 */

import type { ReactNode } from 'react';

interface StringArtPlusProps {
  /** Size in pixels, or "full" to fill container */
  readonly size?: number | 'full';
  readonly numPoints?: number;
  readonly color?: string;
  readonly className?: string;
}

// Internal viewBox size for calculations (when responsive)
const VIEWBOX_SIZE = 100;

export function StringArtPlus({
  size = 80,
  numPoints = 10,
  color = 'currentColor',
  className,
}: StringArtPlusProps): ReactNode {
  // Use viewBox size for calculations when responsive, otherwise use actual size
  const calcSize = size === 'full' ? VIEWBOX_SIZE : size;
  const cx = calcSize / 2;
  const cy = calcSize / 2;
  const segmentLength = calcSize * 0.44;

  const top = { x: cx, y: cy - segmentLength };
  const bottom = { x: cx, y: cy + segmentLength };
  const left = { x: cx - segmentLength, y: cy };
  const right = { x: cx + segmentLength, y: cy };

  const generatePoints = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      points.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
    return points;
  };

  const toTop = generatePoints({ x: cx, y: cy }, top);
  const toBottom = generatePoints({ x: cx, y: cy }, bottom);
  const toLeft = generatePoints({ x: cx, y: cy }, left);
  const toRight = generatePoints({ x: cx, y: cy }, right);

  const strings: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // Top-Left quadrant
  for (let i = 1; i <= numPoints; i++) {
    const topPoint = toTop[i];
    const leftPoint = toLeft[numPoints - i + 1];
    if (topPoint && leftPoint) {
      strings.push({ x1: topPoint.x, y1: topPoint.y, x2: leftPoint.x, y2: leftPoint.y });
    }
  }
  // Top-Right quadrant
  for (let i = 1; i <= numPoints; i++) {
    const topPoint = toTop[i];
    const rightPoint = toRight[numPoints - i + 1];
    if (topPoint && rightPoint) {
      strings.push({ x1: topPoint.x, y1: topPoint.y, x2: rightPoint.x, y2: rightPoint.y });
    }
  }
  // Bottom-Left quadrant
  for (let i = 1; i <= numPoints; i++) {
    const bottomPoint = toBottom[i];
    const leftPoint = toLeft[numPoints - i + 1];
    if (bottomPoint && leftPoint) {
      strings.push({ x1: bottomPoint.x, y1: bottomPoint.y, x2: leftPoint.x, y2: leftPoint.y });
    }
  }
  // Bottom-Right quadrant
  for (let i = 1; i <= numPoints; i++) {
    const bottomPoint = toBottom[i];
    const rightPoint = toRight[numPoints - i + 1];
    if (bottomPoint && rightPoint) {
      strings.push({ x1: bottomPoint.x, y1: bottomPoint.y, x2: rightPoint.x, y2: rightPoint.y });
    }
  }

  // SVG attributes depend on sizing mode
  const isResponsive = size === 'full';
  const svgProps = isResponsive
    ? { width: '100%', height: '100%', viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}` }
    : { width: size, height: size };

  // Scale stroke widths relative to the calculation size
  const mainStroke = calcSize * 0.02;
  const lineStroke = calcSize * 0.01;
  const dotRadius = calcSize * 0.025;

  return (
    <svg {...svgProps} className={className} aria-hidden="true">
      {/* Main cross */}
      <line
        x1={top.x}
        y1={top.y}
        x2={bottom.x}
        y2={bottom.y}
        stroke={color}
        strokeWidth={mainStroke}
      />
      <line
        x1={left.x}
        y1={left.y}
        x2={right.x}
        y2={right.y}
        stroke={color}
        strokeWidth={mainStroke}
      />
      {/* String art lines */}
      {strings.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={color}
          strokeWidth={lineStroke}
          opacity="0.75"
        />
      ))}
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={dotRadius} fill={color} />
    </svg>
  );
}
