import type { AttributeDomain, AttributeId } from './types';

/**
 * Attribute domains following the RAVEN paper (Zhang et al., CVPR 2019).
 * Each domain defines the range of integer indices for that attribute.
 */

const SHAPE_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5], // 0=none, 1=triangle, 2=square, 3=pentagon, 4=hexagon, 5=circle
  min: 0,
  max: 5,
  cardinality: 6,
};

const SIZE_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5], // 0.4, 0.5, 0.6, 0.7, 0.8, 0.9
  min: 0,
  max: 5,
  cardinality: 6,
};

const COLOR_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], // 255..0 grayscale (10 levels)
  min: 0,
  max: 9,
  cardinality: 10,
};

const ANGLE_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5, 6, 7], // -135, -90, -45, 0, 45, 90, 135, 180
  min: 0,
  max: 7,
  cardinality: 8,
};

const NUMBER_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8], // 1..9 entities
  min: 0,
  max: 8,
  cardinality: 9,
};

// =============================================================================
// S5: Mesh attribute domains
// =============================================================================

const LINE_COUNT_DOMAIN: AttributeDomain = {
  values: [1, 2, 3, 4, 5],
  min: 1,
  max: 5,
  cardinality: 5,
};

const LINE_ORIENTATION_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3, 4, 5, 6, 7], // same as angle: -135°..180°
  min: 0,
  max: 7,
  cardinality: 8,
};

const LINE_SPACING_DOMAIN: AttributeDomain = {
  values: [0, 1, 2, 3], // tight, medium, wide, very wide
  min: 0,
  max: 3,
  cardinality: 4,
};

export const MESH_DOMAINS = {
  lineCount: LINE_COUNT_DOMAIN,
  lineOrientation: LINE_ORIENTATION_DOMAIN,
  lineSpacing: LINE_SPACING_DOMAIN,
} as const;

export const ATTRIBUTE_DOMAINS: Record<AttributeId, AttributeDomain> = {
  shape: SHAPE_DOMAIN,
  size: SIZE_DOMAIN,
  color: COLOR_DOMAIN,
  angle: ANGLE_DOMAIN,
  number: NUMBER_DOMAIN,
  position: NUMBER_DOMAIN, // position shares the same index space as number
};

/**
 * Maps shape index to a human-readable name.
 */
export const SHAPE_NAMES = ['none', 'triangle', 'square', 'pentagon', 'hexagon', 'circle'] as const;

/**
 * Maps size index to a scale factor for rendering.
 * Range widened (0.3→0.95) for better visual differentiation on small screens.
 */
export const SIZE_SCALES = [0.3, 0.43, 0.56, 0.69, 0.82, 0.95] as const;

/**
 * Maps color index to a grayscale value (255 = white, 0 = black).
 */
export const COLOR_VALUES = [255, 224, 196, 168, 140, 112, 84, 56, 28, 0] as const;

/**
 * Fill pattern type for each color index.
 * Provides visual variety beyond pure grayscale, inspired by real SPM hatching.
 *
 * 0 = white (solid)
 * 1 = light gray + horizontal lines
 * 2 = light gray (solid)
 * 3 = medium gray + dots
 * 4 = medium gray (solid)
 * 5 = medium gray + diagonal lines
 * 6 = dark gray + crosshatch
 * 7 = dark gray (solid)
 * 8 = very dark + vertical lines
 * 9 = black (solid)
 */
export type FillPatternId =
  | 'solid'
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'crosshatch'
  | 'dots';

export const COLOR_FILL_PATTERNS: readonly FillPatternId[] = [
  'solid', // 0: white
  'horizontal', // 1: light + horizontal lines
  'solid', // 2: light gray solid
  'dots', // 3: medium + dots
  'solid', // 4: medium gray solid
  'diagonal', // 5: medium + diagonal lines
  'crosshatch', // 6: dark + crosshatch
  'solid', // 7: dark solid
  'vertical', // 8: very dark + vertical lines
  'solid', // 9: black solid
] as const;

/**
 * Maps angle index to degrees.
 */
export const ANGLE_DEGREES = [-135, -90, -45, 0, 45, 90, 135, 180] as const;
