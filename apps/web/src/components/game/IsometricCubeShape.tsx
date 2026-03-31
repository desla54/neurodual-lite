/**
 * IsometricCubeShape — Renders 3D cube coordinates as an isometric SVG.
 *
 * Each cube is drawn with 3 visible faces (top, left, right) using the
 * woven theme CSS variables for automatic dark/light mode support.
 * Cubes are depth-sorted with the painter's algorithm.
 */

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Isometric projection constants
// ---------------------------------------------------------------------------

const COS30 = Math.cos(Math.PI / 6); // ~0.866
const SIN30 = 0.5;

/** Project a 3D point to 2D isometric screen coordinates. */
function project(x: number, y: number, z: number, scale: number): [number, number] {
  return [(x - z) * COS30 * scale, ((x + z) * SIN30 - y) * scale];
}

function rotateOffsetY(dx: number, dz: number, cosY: number, sinY: number): [number, number] {
  return [dx * cosY + dz * sinY, -dx * sinY + dz * cosY];
}

// ---------------------------------------------------------------------------
// Cube face vertices (unit cube at origin, 8 corners)
// ---------------------------------------------------------------------------

// Corner offsets for a unit cube: [x, y, z]
//   0: (0,0,0)  1: (1,0,0)  2: (1,0,1)  3: (0,0,1)
//   4: (0,1,0)  5: (1,1,0)  6: (1,1,1)  7: (0,1,1)

type Corner = [number, number, number];

const TOP_FACE: Corner[] = [
  [0, 1, 0],
  [1, 1, 0],
  [1, 1, 1],
  [0, 1, 1],
];
const LEFT_FACE: Corner[] = [
  [0, 0, 1],
  [0, 1, 1],
  [0, 1, 0],
  [0, 0, 0],
];
const RIGHT_FACE: Corner[] = [
  [1, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
  [1, 0, 1],
];
const CUBE_OUTLINE: Corner[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [1, 1, 1],
  [0, 1, 1],
  [0, 0, 1],
];

function faceToPoints(
  face: Corner[],
  cx: number,
  cy: number,
  cz: number,
  scale: number,
  cosY: number,
  sinY: number,
): string {
  return face
    .map(([dx, dy, dz]) => {
      const [rx, rz] = rotateOffsetY(dx, dz, cosY, sinY);
      const [sx, sy] = project(cx + rx, cy + dy, cz + rz, scale);
      return `${sx},${sy}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IsometricCubeShapeProps {
  /** 3D positions of cubes (centered around centroid). */
  cubes: readonly (readonly [number, number, number])[];
  /** Pixels per cube edge. Default 24. */
  scale?: number;
  /**
   * Rotate cube orientation around Y in degrees.
   * Important when centers are pre-rotated: keeps cube faces aligned with object rotation.
   */
  orientationYDeg?: number;
  /** Stronger face contrast + heavier edges for better readability. */
  highContrast?: boolean;
  /** Render each cube as a single flat block (no faceted faces). */
  flatFaces?: boolean;
  /** Custom edge width in SVG units. */
  edgeWidth?: number;
  /** Hide faces that are internal (touching adjacent cubes) for cleaner silhouettes. */
  cullInternalFaces?: boolean;
  /** Accessibility label. */
  label: string;
  /** Additional CSS class. */
  className?: string;
}

export function IsometricCubeShape({
  cubes,
  scale = 24,
  orientationYDeg = 0,
  highContrast = false,
  flatFaces = false,
  edgeWidth,
  cullInternalFaces = true,
  label,
  className,
}: IsometricCubeShapeProps) {
  const orientationRad = (orientationYDeg * Math.PI) / 180;
  const cosY = Math.cos(orientationRad);
  const sinY = Math.sin(orientationRad);

  const { sortedCubes, viewBox } = useMemo(() => {
    // Depth sort: draw farthest cubes first (painter's algorithm).
    // In isometric with our projection, "farther" = higher x + z - y.
    const withDepth = [...cubes].map(([x, y, z]) => ({ x, y, z, depth: x + z - y }));

    const faceNormals = {
      top: [0, 1, 0] as const,
      right: [cosY, 0, -sinY] as const,
      left: [-cosY, 0, sinY] as const,
    };

    const hasNeighborAlong = (
      cube: (typeof withDepth)[number],
      normal: readonly [number, number, number],
    ): boolean => {
      // Unit-cube adjacency check in rotated space.
      // dot ~= 1 means one cube step in this face direction.
      const DOT_MIN = 0.9;
      const DOT_MAX = 1.1;
      const PERP2_MAX = 0.03;
      for (const other of withDepth) {
        if (other === cube) continue;
        const vx = other.x - cube.x;
        const vy = other.y - cube.y;
        const vz = other.z - cube.z;
        const dot = vx * normal[0] + vy * normal[1] + vz * normal[2];
        if (dot < DOT_MIN || dot > DOT_MAX) continue;
        const len2 = vx * vx + vy * vy + vz * vz;
        const perp2 = Math.max(0, len2 - dot * dot);
        if (perp2 <= PERP2_MAX) return true;
      }
      return false;
    };

    const sorted = withDepth
      .map((cube) => ({
        ...cube,
        showTop: !cullInternalFaces || !hasNeighborAlong(cube, faceNormals.top),
        showRight: !cullInternalFaces || !hasNeighborAlong(cube, faceNormals.right),
        showLeft: !cullInternalFaces || !hasNeighborAlong(cube, faceNormals.left),
      }))
      .sort((a, b) => b.depth - a.depth);

    // Compute bounding box of all projected corners.
    let minSx = Infinity;
    let maxSx = -Infinity;
    let minSy = Infinity;
    let maxSy = -Infinity;

    for (const { x, y, z } of sorted) {
      for (const [dx, dy, dz] of [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 0],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ] as const) {
        const [rx, rz] = rotateOffsetY(dx, dz, cosY, sinY);
        const [sx, sy] = project(x + rx, y + dy, z + rz, scale);
        if (sx < minSx) minSx = sx;
        if (sx > maxSx) maxSx = sx;
        if (sy < minSy) minSy = sy;
        if (sy > maxSy) maxSy = sy;
      }
    }

    const pad = scale * 0.5;
    const vbX = minSx - pad;
    const vbY = minSy - pad;
    const vbW = maxSx - minSx + 2 * pad;
    const vbH = maxSy - minSy + 2 * pad;

    return {
      sortedCubes: sorted,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    };
  }, [cubes, scale, cosY, sinY, cullInternalFaces]);

  // Use color-mix to create opaque shading from the woven-cell-active color.
  // Top = lightest (mixed with white), Right = base, Left = darkest (mixed with black).
  // High contrast between faces to make 3D structure clearly readable.
  const topFill = highContrast
    ? 'color-mix(in srgb, hsl(var(--woven-cell-active)), white 62%)'
    : 'color-mix(in srgb, hsl(var(--woven-cell-active)), white 50%)';
  const rightFill = highContrast
    ? 'color-mix(in srgb, hsl(var(--woven-cell-active)), white 10%)'
    : 'hsl(var(--woven-cell-active))';
  const leftFill = highContrast
    ? 'color-mix(in srgb, hsl(var(--woven-cell-active)), black 62%)'
    : 'color-mix(in srgb, hsl(var(--woven-cell-active)), black 50%)';
  const edgeStroke = highContrast
    ? 'color-mix(in srgb, hsl(var(--woven-cell-active)), black 85%)'
    : 'color-mix(in srgb, hsl(var(--woven-cell-active)), black 70%)';
  const strokeWidth = edgeWidth ?? (highContrast ? 2.2 : 1.5);
  const flatFill = highContrast
    ? 'color-mix(in srgb, hsl(var(--woven-cell-active)), white 8%)'
    : 'hsl(var(--woven-cell-active))';

  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
      className={className}
      shapeRendering="geometricPrecision"
      style={{
        width: '100%',
        height: '100%',
        filter: highContrast
          ? 'drop-shadow(0 1px 0 rgba(0,0,0,0.25)) drop-shadow(0 4px 8px rgba(0,0,0,0.18))'
          : undefined,
      }}
    >
      {sortedCubes.map(({ x, y, z, showTop, showRight, showLeft }, i) => (
        <g key={i}>
          {flatFaces ? (
            <polygon
              points={faceToPoints(CUBE_OUTLINE, x, y, z, scale, cosY, sinY)}
              fill={flatFill}
              stroke={edgeStroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          ) : (
            <>
              {/* Left face — darkest */}
              {showLeft && (
                <polygon
                  points={faceToPoints(LEFT_FACE, x, y, z, scale, cosY, sinY)}
                  fill={leftFill}
                  stroke={edgeStroke}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
              )}
              {/* Right face — medium */}
              {showRight && (
                <polygon
                  points={faceToPoints(RIGHT_FACE, x, y, z, scale, cosY, sinY)}
                  fill={rightFill}
                  stroke={edgeStroke}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
              )}
              {/* Top face — brightest */}
              {showTop && (
                <polygon
                  points={faceToPoints(TOP_FACE, x, y, z, scale, cosY, sinY)}
                  fill={topFill}
                  stroke={edgeStroke}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
              )}
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
