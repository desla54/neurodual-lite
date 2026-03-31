import type { MeshComponent } from '@neurodual/logic';
import { ANGLE_DEGREES } from '@neurodual/logic';

interface RavensMeshSvgProps {
  mesh: MeshComponent;
  size: number;
}

/** Spacing in pixels per level (fraction of cell size) */
const SPACING_FACTORS = [0.08, 0.12, 0.18, 0.25] as const;

/**
 * SVG overlay rendering parallel lines across the cell.
 * Lines are semi-transparent so they don't mask the underlying shapes.
 */
export function RavensMeshSvg({ mesh, size }: RavensMeshSvgProps) {
  const { lineCount, lineOrientation, lineSpacing } = mesh;
  const angle = ANGLE_DEGREES[lineOrientation] ?? 0;
  const spacing = size * (SPACING_FACTORS[lineSpacing] ?? 0.12);
  const cx = size / 2;
  const cy = size / 2;

  // Generate parallel lines centered in the cell
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const totalSpan = (lineCount - 1) * spacing;
  const startOffset = -totalSpan / 2;

  for (let i = 0; i < lineCount; i++) {
    const offset = startOffset + i * spacing;
    // Line perpendicular to orientation: draw horizontal lines, then rotate
    lines.push({
      x1: 0,
      y1: cy + offset,
      x2: size,
      y2: cy + offset,
    });
  }

  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`} opacity={0.35} strokeLinecap="round">
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="var(--color-woven-text-muted, #888)"
          strokeWidth={Math.max(1, size * 0.015)}
        />
      ))}
    </g>
  );
}
