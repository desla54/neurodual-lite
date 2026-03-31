import { describe, it, expect } from 'bun:test';
import {
  generateTmtALabels,
  generateTmtBLabels,
  generatePositions,
  generateTmtACircles,
  generateTmtBCircles,
  isCorrectTap,
  computeBMinusA,
  computeSummary,
  TMT_A_COUNT,
  TMT_B_COUNT,
  DEFAULT_MIN_DISTANCE,
  type TrailResult,
} from './trail-making';

// =============================================================================
// TMT-A Sequence
// =============================================================================

describe('generateTmtALabels', () => {
  it('generates sequential numbers 1 through 12', () => {
    const labels = generateTmtALabels();
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('supports custom count', () => {
    const labels = generateTmtALabels(5);
    expect(labels).toEqual(['1', '2', '3', '4', '5']);
  });

  it('returns empty array for count 0', () => {
    expect(generateTmtALabels(0)).toEqual([]);
  });
});

// =============================================================================
// TMT-B Sequence
// =============================================================================

describe('generateTmtBLabels', () => {
  it('generates alternating number-letter sequence', () => {
    const labels = generateTmtBLabels();
    expect(labels).toEqual(['1', 'A', '2', 'B', '3', 'C', '4', 'D', '5', 'E', '6', 'F']);
  });

  it('alternates correctly: odd indices are letters, even are numbers', () => {
    const labels = generateTmtBLabels();
    for (let i = 0; i < labels.length; i++) {
      if (i % 2 === 0) {
        // Number
        expect(Number.parseInt(labels[i] as string, 10)).not.toBeNaN();
      } else {
        // Letter
        expect((labels[i] as string).match(/^[A-Z]$/)).not.toBeNull();
      }
    }
  });

  it('supports custom count (must be even)', () => {
    const labels = generateTmtBLabels(4);
    expect(labels).toEqual(['1', 'A', '2', 'B']);
  });

  it('numbers increment and letters increment', () => {
    const labels = generateTmtBLabels(12);
    const numbers = labels.filter((_, i) => i % 2 === 0);
    const letters = labels.filter((_, i) => i % 2 === 1);
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(letters).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

// =============================================================================
// Position Generation
// =============================================================================

describe('generatePositions', () => {
  it('generates the requested number of positions', () => {
    const positions = generatePositions(8, 400, 500);
    expect(positions.length).toBe(8);
  });

  it('all positions are within bounds (margin respected)', () => {
    const width = 400;
    const height = 500;
    const circleRadius = 22;
    const margin = circleRadius + 10;
    const positions = generatePositions(8, width, height, undefined, circleRadius);

    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(margin);
      expect(p.x).toBeLessThanOrEqual(width - margin);
      expect(p.y).toBeGreaterThanOrEqual(margin);
      expect(p.y).toBeLessThanOrEqual(height - margin);
    }
  });

  it('maintains minimum distance between positions', () => {
    const positions = generatePositions(6, 600, 600, DEFAULT_MIN_DISTANCE);

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]!;
        const b = positions[j]!;
        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        expect(dist).toBeGreaterThanOrEqual(DEFAULT_MIN_DISTANCE);
      }
    }
  });

  it('falls back to grid placement when area is too small', () => {
    // Very small area, 20 items — will fail random placement and use grid fallback
    const positions = generatePositions(20, 100, 100, 50, 5);
    expect(positions.length).toBe(20);
  });

  it('uses deterministic rng when provided', () => {
    let counter = 0;
    const rng = () => {
      counter++;
      return (counter * 0.1337) % 1;
    };
    const pos1 = generatePositions(4, 400, 400, 30, 10, rng);

    counter = 0;
    const pos2 = generatePositions(4, 400, 400, 30, 10, rng);

    expect(pos1).toEqual(pos2);
  });
});

// =============================================================================
// Circle Generation
// =============================================================================

describe('generateTmtACircles', () => {
  it('generates exactly TMT_A_COUNT circles', () => {
    const circles = generateTmtACircles(400, 500);
    expect(circles.length).toBe(TMT_A_COUNT);
  });

  it('labels are 1 through 12', () => {
    const circles = generateTmtACircles(400, 500);
    const labels = circles.map((c) => c.label);
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('orders are 0-based sequential', () => {
    const circles = generateTmtACircles(400, 500);
    const orders = circles.map((c) => c.order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('ids are prefixed with a-', () => {
    const circles = generateTmtACircles(400, 500);
    for (const c of circles) {
      expect(c.id.startsWith('a-')).toBe(true);
    }
  });
});

describe('generateTmtBCircles', () => {
  it('generates exactly TMT_B_COUNT circles', () => {
    const circles = generateTmtBCircles(400, 500);
    expect(circles.length).toBe(TMT_B_COUNT);
  });

  it('labels alternate numbers and letters', () => {
    const circles = generateTmtBCircles(400, 500);
    const labels = circles.map((c) => c.label);
    expect(labels).toEqual(['1', 'A', '2', 'B', '3', 'C', '4', 'D', '5', 'E', '6', 'F']);
  });

  it('ids are prefixed with b-', () => {
    const circles = generateTmtBCircles(400, 500);
    for (const c of circles) {
      expect(c.id.startsWith('b-')).toBe(true);
    }
  });
});

// =============================================================================
// Tap Validation
// =============================================================================

describe('isCorrectTap', () => {
  it('returns true when tapped order matches current target', () => {
    expect(isCorrectTap(0, 0)).toBe(true);
    expect(isCorrectTap(3, 3)).toBe(true);
    expect(isCorrectTap(7, 7)).toBe(true);
  });

  it('returns false when tapped order does not match', () => {
    expect(isCorrectTap(1, 0)).toBe(false);
    expect(isCorrectTap(0, 1)).toBe(false);
    expect(isCorrectTap(5, 3)).toBe(false);
  });

  it('handles edge case: last item', () => {
    expect(isCorrectTap(TMT_A_COUNT - 1, TMT_A_COUNT - 1)).toBe(true);
    expect(isCorrectTap(TMT_A_COUNT - 2, TMT_A_COUNT - 1)).toBe(false);
  });
});

// =============================================================================
// B-A Difference
// =============================================================================

describe('computeBMinusA', () => {
  it('computes positive difference when B is slower than A', () => {
    expect(computeBMinusA(5000, 8000)).toBe(3000);
  });

  it('computes zero when times are equal', () => {
    expect(computeBMinusA(5000, 5000)).toBe(0);
  });

  it('computes negative difference when A is slower (unusual)', () => {
    expect(computeBMinusA(8000, 5000)).toBe(-3000);
  });
});

// =============================================================================
// Summary
// =============================================================================

describe('computeSummary', () => {
  it('computes full summary from both phases', () => {
    const results: TrailResult[] = [
      { phase: 'tmt-a', completionTimeMs: 12000, errors: 2, items: TMT_A_COUNT },
      { phase: 'tmt-b', completionTimeMs: 18000, errors: 3, items: TMT_B_COUNT },
    ];
    const summary = computeSummary(results);
    expect(summary.tmtATimeMs).toBe(12000);
    expect(summary.tmtBTimeMs).toBe(18000);
    expect(summary.bMinusAMs).toBe(6000);
    expect(summary.tmtAErrors).toBe(2);
    expect(summary.tmtBErrors).toBe(3);
    expect(summary.totalErrors).toBe(5);
  });

  it('handles missing TMT-B (abandoned early)', () => {
    const results: TrailResult[] = [
      { phase: 'tmt-a', completionTimeMs: 10000, errors: 1, items: TMT_A_COUNT },
    ];
    const summary = computeSummary(results);
    expect(summary.tmtATimeMs).toBe(10000);
    expect(summary.tmtBTimeMs).toBe(0);
    expect(summary.bMinusAMs).toBe(-10000);
    expect(summary.tmtBErrors).toBe(0);
    expect(summary.totalErrors).toBe(1);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.tmtATimeMs).toBe(0);
    expect(summary.tmtBTimeMs).toBe(0);
    expect(summary.bMinusAMs).toBe(0);
    expect(summary.totalErrors).toBe(0);
  });

  it('handles zero errors in both phases', () => {
    const results: TrailResult[] = [
      { phase: 'tmt-a', completionTimeMs: 8000, errors: 0, items: TMT_A_COUNT },
      { phase: 'tmt-b', completionTimeMs: 12000, errors: 0, items: TMT_B_COUNT },
    ];
    const summary = computeSummary(results);
    expect(summary.totalErrors).toBe(0);
    expect(summary.bMinusAMs).toBe(4000);
  });
});
