/**
 * Trail Making Test — pure game logic.
 *
 * Reitan (1958):
 * - TMT-A: Connect numbers in order (1-2-3-...-8)
 * - TMT-B: Alternate numbers and letters (1-A-2-B-3-C-4-D)
 * - B-A difference = executive switching cost
 * - Measures processing speed and cognitive flexibility
 */

// =============================================================================
// Constants
// =============================================================================

export const TMT_A_COUNT = 12;
export const TMT_B_COUNT = 12; // 6 numbers + 6 letters = 12 items
export const DEFAULT_CIRCLE_RADIUS = 22;
export const DEFAULT_MIN_DISTANCE = 70;

// =============================================================================
// Types
// =============================================================================

export type TrailPhase = 'tmt-a' | 'tmt-b';

export interface CircleItem {
  id: string;
  label: string;
  x: number;
  y: number;
  order: number; // 0-based tap order
}

export interface TrailResult {
  phase: TrailPhase;
  completionTimeMs: number;
  errors: number;
  items: number;
}

export interface TrailSummary {
  tmtATimeMs: number;
  tmtBTimeMs: number;
  bMinusAMs: number;
  tmtAErrors: number;
  tmtBErrors: number;
  totalErrors: number;
}

// =============================================================================
// Sequence Generation
// =============================================================================

/**
 * Generate the TMT-A sequence labels: ["1", "2", ..., "12"]
 */
export function generateTmtALabels(count: number = TMT_A_COUNT): string[] {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

/**
 * Generate the TMT-B alternating sequence: ["1", "A", "2", "B", ...]
 */
export function generateTmtBLabels(count: number = TMT_B_COUNT): string[] {
  const labels: string[] = [];
  const pairs = count / 2;
  for (let i = 0; i < pairs; i++) {
    labels.push(String(i + 1));
    labels.push(String.fromCharCode(65 + i)); // A=65
  }
  return labels;
}

// =============================================================================
// Position Generation
// =============================================================================

/**
 * Generate non-overlapping positions within the given area.
 * @param count Number of positions
 * @param width Area width in pixels
 * @param height Area height in pixels
 * @param minDistance Minimum distance between any two positions
 * @param circleRadius Circle radius (used for margin)
 * @param rng Random number generator
 */
export function generatePositions(
  count: number,
  width: number,
  height: number,
  minDistance: number = DEFAULT_MIN_DISTANCE,
  circleRadius: number = DEFAULT_CIRCLE_RADIUS,
  rng: () => number = Math.random,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const margin = circleRadius + 10;
  const maxAttempts = 500;

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = margin + rng() * (width - 2 * margin);
      const y = margin + rng() * (height - 2 * margin);

      const tooClose = positions.some(
        (p) => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < minDistance,
      );

      if (!tooClose) {
        positions.push({ x, y });
        placed = true;
        break;
      }
    }
    // Fallback: place in grid if random fails
    if (!placed) {
      const cols = Math.ceil(Math.sqrt(count));
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cellW = (width - 2 * margin) / cols;
      const cellH = (height - 2 * margin) / Math.ceil(count / cols);
      positions.push({
        x: margin + col * cellW + cellW / 2,
        y: margin + row * cellH + cellH / 2,
      });
    }
  }
  return positions;
}

/**
 * Generate circle items for TMT-A.
 */
export function generateTmtACircles(
  width: number,
  height: number,
  rng?: () => number,
): CircleItem[] {
  const labels = generateTmtALabels();
  const positions = generatePositions(TMT_A_COUNT, width, height, undefined, undefined, rng);
  return positions.map((p, i) => ({
    id: `a-${i}`,
    label: labels[i] as string,
    x: p.x,
    y: p.y,
    order: i,
  }));
}

/**
 * Generate circle items for TMT-B.
 */
export function generateTmtBCircles(
  width: number,
  height: number,
  rng?: () => number,
): CircleItem[] {
  const labels = generateTmtBLabels();
  const positions = generatePositions(TMT_B_COUNT, width, height, undefined, undefined, rng);
  return positions.map((p, i) => ({
    id: `b-${i}`,
    label: labels[i] as string,
    x: p.x,
    y: p.y,
    order: i,
  }));
}

// =============================================================================
// Tap Validation
// =============================================================================

/**
 * Check if the tapped circle is the correct next target.
 * @param tappedOrder The order value of the tapped circle
 * @param currentTarget The expected next target (0-based)
 * @returns true if correct
 */
export function isCorrectTap(tappedOrder: number, currentTarget: number): boolean {
  return tappedOrder === currentTarget;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute B-A time difference (executive switching cost).
 */
export function computeBMinusA(tmtATimeMs: number, tmtBTimeMs: number): number {
  return tmtBTimeMs - tmtATimeMs;
}

/**
 * Compute full summary from trail results.
 */
export function computeSummary(results: TrailResult[]): TrailSummary {
  const tmtA = results.find((r) => r.phase === 'tmt-a');
  const tmtB = results.find((r) => r.phase === 'tmt-b');
  const tmtATimeMs = tmtA?.completionTimeMs ?? 0;
  const tmtBTimeMs = tmtB?.completionTimeMs ?? 0;
  const tmtAErrors = tmtA?.errors ?? 0;
  const tmtBErrors = tmtB?.errors ?? 0;

  return {
    tmtATimeMs,
    tmtBTimeMs,
    bMinusAMs: computeBMinusA(tmtATimeMs, tmtBTimeMs),
    tmtAErrors,
    tmtBErrors,
    totalErrors: tmtAErrors + tmtBErrors,
  };
}
