/**
 * Mental Rotation — 3D shape data & transform utilities.
 *
 * Provides Shepard & Metzler-type 3D shapes and functions to rotate
 * and mirror them in 3D space for the mental rotation cognitive task.
 */

export { SHEPARD_METZLER_SHAPES } from './shapes';
export type { Shape3D } from './shapes';

// ---------------------------------------------------------------------------
// 3D transform helpers
// ---------------------------------------------------------------------------

/**
 * Rotate a set of 3D cube positions around the Y axis by the given angle.
 * Y-axis rotation keeps the vertical dimension stable, matching the classic
 * Shepard & Metzler paradigm where objects rotate "on a turntable".
 */
export function rotateShape3D(
  cubes: readonly (readonly [number, number, number])[],
  angleDeg: number,
): [number, number, number][] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return cubes.map(([x, y, z]) => [x * cos + z * sin, y, -x * sin + z * cos]);
}

/**
 * Mirror a shape by negating the X axis, producing its enantiomer.
 * This is the standard way to create "different" stimuli in the
 * Shepard & Metzler task — mirror images cannot be matched by rotation.
 */
export function mirrorShape3D(
  cubes: readonly (readonly [number, number, number])[],
): [number, number, number][] {
  return cubes.map(([x, y, z]) => [-x, y, z]);
}

/**
 * Re-center a shape around its centroid (mean of all cube positions).
 * Call after rotation or mirroring to keep the shape visually centered.
 */
export function centerShape3D(cubes: [number, number, number][]): [number, number, number][] {
  const n = cubes.length;
  const cx = cubes.reduce((s, c) => s + c[0], 0) / n;
  const cy = cubes.reduce((s, c) => s + c[1], 0) / n;
  const cz = cubes.reduce((s, c) => s + c[2], 0) / n;
  return cubes.map(([x, y, z]) => [x - cx, y - cy, z - cz]);
}
