import type { EntitySpec } from '@neurodual/logic';
import {
  SIZE_SCALES,
  RAVENS_COLOR_VALUES,
  ANGLE_DEGREES,
  COLOR_FILL_PATTERNS,
  type FillPatternId,
} from '@neurodual/logic';

interface RavensEntitySvgProps {
  entity: EntitySpec;
  cx: number;
  cy: number;
  maxRadius: number;
}

function regularPolygonPoints(cx: number, cy: number, radius: number, sides: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(' ');
}

// ─── SVG Fill Patterns ──────────────────────────────────────────────────────

/** Unique pattern ID counter to avoid SVG id collisions */
let patternCounter = 0;

function nextPatternId(patternType: FillPatternId): string {
  // Use a stable-ish ID based on counter (no hooks needed — pure render)
  return `rp-${patternType}-${++patternCounter}`;
}

function PatternDefs({
  patternId,
  patternType,
  strokeColor,
}: {
  patternId: string;
  patternType: FillPatternId;
  strokeColor: string;
}) {
  const sw = 1.2;

  switch (patternType) {
    case 'horizontal':
      return (
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <line x1={0} y1={3} x2={6} y2={3} stroke={strokeColor} strokeWidth={sw} />
        </pattern>
      );
    case 'vertical':
      return (
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <line x1={3} y1={0} x2={3} y2={6} stroke={strokeColor} strokeWidth={sw} />
        </pattern>
      );
    case 'diagonal':
      return (
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <line x1={0} y1={6} x2={6} y2={0} stroke={strokeColor} strokeWidth={sw} />
        </pattern>
      );
    case 'crosshatch':
      return (
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <line x1={0} y1={3} x2={6} y2={3} stroke={strokeColor} strokeWidth={sw} />
          <line x1={3} y1={0} x2={3} y2={6} stroke={strokeColor} strokeWidth={sw} />
        </pattern>
      );
    case 'dots':
      return (
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <circle cx={3} cy={3} r={1} fill={strokeColor} />
        </pattern>
      );
    default:
      return null;
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RavensEntitySvg({ entity, cx, cy, maxRadius }: RavensEntitySvgProps) {
  const scale = SIZE_SCALES[entity.size] ?? 0.56;
  const radius = maxRadius * scale;
  const grayVal = RAVENS_COLOR_VALUES[entity.color] ?? 128;
  const patternType = COLOR_FILL_PATTERNS[entity.color] ?? 'solid';

  // I-RAVEN convention: color=255 (index 0) → outline only (no fill).
  // All other values → solid fill with that gray level.
  const isOutlineOnly = grayVal === 255;
  const baseFill = isOutlineOnly ? 'none' : `rgb(${grayVal},${grayVal},${grayVal})`;

  // Stroke: always visible. Outline-only shapes use a prominent dark stroke.
  // Filled shapes use contrast-based stroke.
  let strokeVal: number;
  if (isOutlineOnly) {
    strokeVal = 60; // dark outline on any background
  } else if (grayVal < 80) {
    strokeVal = Math.min(255, grayVal + 120);
  } else if (grayVal > 180) {
    strokeVal = Math.max(0, grayVal - 120);
  } else {
    strokeVal = grayVal > 128 ? Math.max(0, grayVal - 90) : Math.min(255, grayVal + 90);
  }
  const stroke = `rgb(${strokeVal},${strokeVal},${strokeVal})`;
  const strokeWidth = isOutlineOnly ? Math.max(1.5, radius * 0.1) : Math.max(1, radius * 0.08);

  const angle = ANGLE_DEGREES[entity.angle] ?? 0;
  const transform = angle !== 0 ? `rotate(${angle} ${cx} ${cy})` : undefined;

  // Shape 0 = "none" (invisible entity — I-RAVEN convention)
  if (entity.shape === 0) return null;

  // Map shape index to polygon sides (1=tri, 2=sq, 3=pent, 4=hex, 5=circle)
  const sides = [0, 3, 4, 5, 6, 0][entity.shape] ?? 0;

  // Pattern fill (disabled for outline-only shapes)
  const hasPattern = !isOutlineOnly && patternType !== 'solid';
  const patternId = hasPattern ? nextPatternId(patternType) : '';
  const patternStrokeColor =
    grayVal > 128
      ? `rgb(${Math.max(0, grayVal - 80)},${Math.max(0, grayVal - 80)},${Math.max(0, grayVal - 80)})`
      : `rgb(${Math.min(255, grayVal + 80)},${Math.min(255, grayVal + 80)},${Math.min(255, grayVal + 80)})`;
  const fill = hasPattern ? `url(#${patternId})` : baseFill;

  if (sides === 0) {
    // Circle
    return (
      <g transform={transform}>
        {hasPattern && (
          <PatternDefs
            patternId={patternId}
            patternType={patternType}
            strokeColor={patternStrokeColor}
          />
        )}
        {/* Base fill underneath the pattern */}
        {hasPattern && <circle cx={cx} cy={cy} r={radius} fill={baseFill} stroke="none" />}
        <circle cx={cx} cy={cy} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  const points = regularPolygonPoints(cx, cy, radius, sides);

  return (
    <g transform={transform}>
      {hasPattern && (
        <PatternDefs
          patternId={patternId}
          patternType={patternType}
          strokeColor={patternStrokeColor}
        />
      )}
      {/* Base fill underneath the pattern */}
      {hasPattern && <polygon points={points} fill={baseFill} stroke="none" />}
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}
