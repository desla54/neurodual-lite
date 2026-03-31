import { describe, it, expect } from 'bun:test';
import { calculateTraceTimingsFromIsi } from './trace-timing-utils';

describe('calculateTraceTimingsFromIsi', () => {
  // =========================================================================
  // ISI clamping
  // =========================================================================

  describe('ISI clamping', () => {
    it('clamps ISI below minimum (1500ms) to 1500', () => {
      const low = calculateTraceTimingsFromIsi(500);
      const atMin = calculateTraceTimingsFromIsi(1500);

      // All session timings should match when both resolve to 1500
      expect(low.stimulusDurationMs).toBe(atMin.stimulusDurationMs);
      expect(low.responseWindowMs).toBe(atMin.responseWindowMs);
      expect(low.feedbackDurationMs).toBe(atMin.feedbackDurationMs);
      expect(low.intervalMs).toBe(atMin.intervalMs);
    });

    it('clamps ISI above maximum (10000ms) to 10000', () => {
      const high = calculateTraceTimingsFromIsi(20000);
      const atMax = calculateTraceTimingsFromIsi(10000);

      expect(high.stimulusDurationMs).toBe(atMax.stimulusDurationMs);
      expect(high.responseWindowMs).toBe(atMax.responseWindowMs);
      expect(high.feedbackDurationMs).toBe(atMax.feedbackDurationMs);
      expect(high.intervalMs).toBe(atMax.intervalMs);
    });

    it('does not clamp ISI within valid range', () => {
      const t = calculateTraceTimingsFromIsi(4000);
      // 4000 * 0.2 = 800 -> within [300, 2500]
      expect(t.stimulusDurationMs).toBe(800);
    });
  });

  // =========================================================================
  // ISI breakdown percentages (20/30/25/25)
  // =========================================================================

  describe('percentage allocation', () => {
    const isi = 4000;
    const t = calculateTraceTimingsFromIsi(isi);

    it('allocates 20% to stimulus duration', () => {
      // 4000 * 0.2 = 800, within [300, 2500]
      expect(t.stimulusDurationMs).toBe(800);
    });

    it('allocates 30% to response window', () => {
      // 4000 * 0.3 = 1200, within [500, 4000]
      expect(t.responseWindowMs).toBe(1200);
    });

    it('allocates 25% to feedback duration', () => {
      // 4000 * 0.25 = 1000, within [400, 3000]
      expect(t.feedbackDurationMs).toBe(1000);
    });

    it('allocates 25% to interval', () => {
      // 4000 * 0.25 = 1000, within [400, 3000]
      expect(t.intervalMs).toBe(1000);
    });

    it('session timings sum to ISI (when no clamping)', () => {
      const sum = t.stimulusDurationMs + t.responseWindowMs + t.feedbackDurationMs + t.intervalMs;
      expect(sum).toBe(isi);
    });
  });

  // =========================================================================
  // Visual timing derivations
  // =========================================================================

  describe('visual timings', () => {
    it('computes extinction as 65% of stimulus duration (isi * 0.2 * 0.65)', () => {
      const t = calculateTraceTimingsFromIsi(4000);
      // 4000 * 0.2 * 0.65 = 520, within [200, 1500]
      expect(t.extinctionMs).toBe(520);
    });

    it('computes cellsReturnDelay as 5% of ISI', () => {
      const t = calculateTraceTimingsFromIsi(4000);
      // 4000 * 0.05 = 200, within [100, 500]
      expect(t.cellsReturnDelayMs).toBe(200);
    });

    it('flashOff is constant 80ms', () => {
      expect(calculateTraceTimingsFromIsi(1500).flashOffMs).toBe(80);
      expect(calculateTraceTimingsFromIsi(6000).flashOffMs).toBe(80);
      expect(calculateTraceTimingsFromIsi(10000).flashOffMs).toBe(80);
    });

    it('warmupStimulusDuration equals 30% of ISI (same as response window)', () => {
      const t = calculateTraceTimingsFromIsi(4000);
      expect(t.warmupStimulusDurationMs).toBe(t.responseWindowMs);
    });
  });

  // =========================================================================
  // Per-field clamping
  // =========================================================================

  describe('per-field clamping bounds', () => {
    it('clamps stimulusDurationMs to [300, 2500]', () => {
      // At min ISI 1500: 1500 * 0.2 = 300 (exactly at lower bound)
      expect(calculateTraceTimingsFromIsi(1500).stimulusDurationMs).toBe(300);
      // At max ISI 10000: 10000 * 0.2 = 2000 (within range)
      expect(calculateTraceTimingsFromIsi(10000).stimulusDurationMs).toBe(2000);
    });

    it('clamps responseWindowMs to [500, 4000]', () => {
      // At min ISI 1500: 1500 * 0.3 = 450 -> clamped to 500
      expect(calculateTraceTimingsFromIsi(1500).responseWindowMs).toBe(500);
      // At max ISI 10000: 10000 * 0.3 = 3000 (within range)
      expect(calculateTraceTimingsFromIsi(10000).responseWindowMs).toBe(3000);
    });

    it('clamps feedbackDurationMs to [400, 3000]', () => {
      // At min ISI 1500: 1500 * 0.25 = 375 -> clamped to 400
      expect(calculateTraceTimingsFromIsi(1500).feedbackDurationMs).toBe(400);
      // At max ISI 10000: 10000 * 0.25 = 2500 (within range)
      expect(calculateTraceTimingsFromIsi(10000).feedbackDurationMs).toBe(2500);
    });

    it('clamps intervalMs to [400, 3000]', () => {
      expect(calculateTraceTimingsFromIsi(1500).intervalMs).toBe(400);
      expect(calculateTraceTimingsFromIsi(10000).intervalMs).toBe(2500);
    });

    it('clamps extinctionMs to [200, 1500]', () => {
      // At min ISI 1500: 1500 * 0.2 * 0.65 = 195 -> clamped to 200
      expect(calculateTraceTimingsFromIsi(1500).extinctionMs).toBe(200);
      // At max ISI 10000: 10000 * 0.2 * 0.65 = 1300 (within range)
      expect(calculateTraceTimingsFromIsi(10000).extinctionMs).toBe(1300);
    });

    it('clamps cellsReturnDelayMs to [100, 500]', () => {
      // At min ISI 1500: 1500 * 0.05 = 75 -> clamped to 100
      expect(calculateTraceTimingsFromIsi(1500).cellsReturnDelayMs).toBe(100);
      // At max ISI 10000: 10000 * 0.05 = 500 (exactly at upper bound)
      expect(calculateTraceTimingsFromIsi(10000).cellsReturnDelayMs).toBe(500);
    });

    it('clamps warmupStimulusDurationMs to [500, 4000]', () => {
      expect(calculateTraceTimingsFromIsi(1500).warmupStimulusDurationMs).toBe(500);
      expect(calculateTraceTimingsFromIsi(10000).warmupStimulusDurationMs).toBe(3000);
    });
  });

  // =========================================================================
  // Edge values
  // =========================================================================

  describe('edge values', () => {
    it('handles ISI of 0 (clamps to 1500)', () => {
      const t = calculateTraceTimingsFromIsi(0);
      expect(t.stimulusDurationMs).toBe(calculateTraceTimingsFromIsi(1500).stimulusDurationMs);
    });

    it('handles negative ISI (clamps to 1500)', () => {
      const t = calculateTraceTimingsFromIsi(-1000);
      expect(t.stimulusDurationMs).toBe(calculateTraceTimingsFromIsi(1500).stimulusDurationMs);
    });

    it('all timing values are positive', () => {
      for (const isi of [1500, 3000, 5000, 7500, 10000]) {
        const t = calculateTraceTimingsFromIsi(isi);
        expect(t.stimulusDurationMs).toBeGreaterThan(0);
        expect(t.responseWindowMs).toBeGreaterThan(0);
        expect(t.feedbackDurationMs).toBeGreaterThan(0);
        expect(t.intervalMs).toBeGreaterThan(0);
        expect(t.extinctionMs).toBeGreaterThan(0);
        expect(t.cellsReturnDelayMs).toBeGreaterThan(0);
        expect(t.flashOffMs).toBeGreaterThan(0);
        expect(t.warmupStimulusDurationMs).toBeGreaterThan(0);
      }
    });
  });
});
