/**
 * S7: Embretson perceptual complexity mapping.
 *
 * Three orthogonal visual difficulty features (Embretson, 1998):
 * - Overlay: entities share the same position (stacked with transparency)
 * - Fusion: shapes merged into composite forms (SVG clipPath)
 * - Distortion: skew/scale transforms on shapes
 *
 * These are independent of rule complexity — they add perceptual load
 * without changing the reasoning required.
 */

import type { PerceptualComplexity } from './types';

/**
 * Map a neurodual difficulty level to perceptual complexity parameters.
 * Levels below 26 have no perceptual complexity.
 */
export function getPerceptualComplexity(level: number): PerceptualComplexity | undefined {
  if (level < 26) return undefined;

  switch (level) {
    case 26:
      return { overlay: true, fusion: false, distortion: 0 };
    case 27:
      return { overlay: true, fusion: true, distortion: 0 };
    case 28:
      return { overlay: true, fusion: true, distortion: 2 };
    default:
      // Levels 29-30 (S8) keep full perceptual complexity
      return { overlay: true, fusion: true, distortion: 2 };
  }
}
