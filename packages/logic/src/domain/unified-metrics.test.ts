import { describe, expect, it } from 'bun:test';
import {
  computeUnifiedMetrics,
  computeTempoAccuracy,
  computeSpecDrivenTempoAccuracy,
  computeMemoAccuracy,
  computePlaceAccuracy,
  createEmptyUnifiedMetrics,
} from './unified-metrics';

describe('Unified Metrics', () => {
  describe('computeUnifiedMetrics', () => {
    it('should compute zone 1 for low N and low accuracy', () => {
      const metrics = computeUnifiedMetrics(0.4, 1);
      expect(metrics.zone).toBe(1);
      expect(metrics.zoneProgress).toBe(0);
    });

    it('should give 0 bonus when accuracy is exactly 0.5 (threshold)', () => {
      // 0.5 is MIN_ACCURACY_FOR_BONUS.
      // normalized = (0.5 - 0.5) / 0.5 = 0
      // fractionalBonus = 0 * 4 = 0
      // accuracyBonus = 0
      const metrics = computeUnifiedMetrics(0.5, 1);
      expect(metrics.zone).toBe(1);
      expect(metrics.zoneProgress).toBe(0);
    });

    it('should give small bonus when accuracy is slightly above 0.5', () => {
      // Accuracy 0.51 -> normalized = (0.51 - 0.5) / 0.5 = 0.01 / 0.5 = 0.02
      // fractionalBonus = 0.02 * 4 = 0.08
      // accuracyBonus = floor(0.08) = 0
      // progress = 0.08 * 100 = 8%
      const metrics = computeUnifiedMetrics(0.51, 1);
      expect(metrics.zone).toBe(1);
      expect(metrics.zoneProgress).toBe(8);
    });

    it('should compute base zone for N-level', () => {
      // N=2 -> Base Zone 4. Accuracy 0.5 -> Bonus 0. Total 4.
      const metrics = computeUnifiedMetrics(0.5, 2);
      expect(metrics.zone).toBe(4);
    });

    it('should add accuracy bonus', () => {
      // N=1 -> Base Zone 1. Accuracy 1.0 -> Bonus floor(1.0 * 4) = 4. Total 5.
      const metrics = computeUnifiedMetrics(1.0, 1);
      expect(metrics.zone).toBe(5);
      expect(metrics.zoneProgress).toBe(0); // Accuracy 1.0 is the start of Zone 5
    });

    it('should calculate zone progress correctly', () => {
      // Accuracy 0.75 is halfway between 0.5 and 1.0
      // normalized = (0.75 - 0.5) / 0.5 = 0.5
      // fractionalBonus = 0.5 * 4 = 2.0
      // accuracyBonus = floor(2.0) = 2
      // progress = (2.0 - 2) * 100 = 0
      const metrics = computeUnifiedMetrics(0.75, 1);
      expect(metrics.zone).toBe(3); // 1 + 2
      expect(metrics.zoneProgress).toBe(0);

      // Accuracy 0.8125
      // normalized = (0.8125 - 0.5) / 0.5 = 0.625
      // fractionalBonus = 0.625 * 4 = 2.5
      // accuracyBonus = 2
      // progress = (2.5 - 2) * 100 = 50
      const metricsProgress = computeUnifiedMetrics(0.8125, 1);
      expect(metricsProgress.zone).toBe(3);
      expect(metricsProgress.zoneProgress).toBe(50);

      // Accuracy 0.875
      // normalized = (0.875 - 0.5) / 0.5 = 0.75
      // fractionalBonus = 0.75 * 4 = 3.0
      // accuracyBonus = 3
      // progress = 0
      const metrics2 = computeUnifiedMetrics(0.875, 1);
      expect(metrics2.zone).toBe(4); // 1 + 3
      expect(metrics2.zoneProgress).toBe(0);

      // Accuracy 0.625
      // normalized = (0.625 - 0.5) / 0.5 = 0.25
      // fractionalBonus = 0.25 * 4 = 1.0
      // accuracyBonus = 1
      // progress = 0
      const metrics3 = computeUnifiedMetrics(0.625, 1);
      expect(metrics3.zone).toBe(2);
    });

    it('should clamp N-level to minimum 1', () => {
      const metrics = computeUnifiedMetrics(0.5, 0);
      expect(metrics.nLevel).toBe(1);
      expect(metrics.zone).toBe(1);
    });

    it('should clamp accuracy between 0 and 1', () => {
      const metricsHigh = computeUnifiedMetrics(1.5, 1);
      expect(metricsHigh.accuracy).toBe(1);

      const metricsLow = computeUnifiedMetrics(-0.5, 1);
      expect(metricsLow.accuracy).toBe(0);
    });

    it('should clamp base zone to MAX_ZONE - 1', () => {
      // N=10 -> 1 + (10-1)*3 = 28. Clamped to MAX_ZONE - 1 = 19.
      const metrics = computeUnifiedMetrics(0.5, 10);
      expect(metrics.zone).toBe(19);
    });

    it('should clamp zone to maximum 20', () => {
      const metrics = computeUnifiedMetrics(1.0, 10);
      // N=10 -> Base Zone = 1 + (10-1)*3 = 28. Clamped to 19.
      // Accuracy 1.0 -> Bonus 4. 19 + 4 = 23. Clamped to 20.
      expect(metrics.zone).toBe(20);
      expect(metrics.zoneProgress).toBe(100);
    });
  });

  describe('Accuracy Helpers', () => {
    it('computeTempoAccuracy should handle zero trials', () => {
      expect(computeTempoAccuracy(0, 0, 0, 0)).toBe(0);
    });

    it('computeTempoAccuracy should calculate Geometric Mean', () => {
      // hits=8, misses=2, FA=1, CR=19
      // hitRate = 8/10 = 0.8
      // crRate = 19/20 = 0.95
      // geometric = sqrt(0.8 * 0.95) ≈ 0.8718
      expect(computeTempoAccuracy(8, 2, 1, 19)).toBeCloseTo(0.8718, 3);
    });

    it('computeTempoAccuracy should return 0 when never clicking (all misses)', () => {
      // Never clicking = all targets missed, all non-targets correctly rejected
      // hitRate = 0/12 = 0, crRate = 28/28 = 1
      // geometric = sqrt(0 * 1) = 0
      expect(computeTempoAccuracy(0, 12, 0, 28)).toBe(0);
    });

    it('computeTempoAccuracy should return 0 when always clicking (all FA)', () => {
      // Always clicking = all targets hit, all non-targets false alarmed
      // hitRate = 12/12 = 1, crRate = 0/28 = 0
      // geometric = sqrt(1 * 0) = 0
      expect(computeTempoAccuracy(12, 0, 28, 0)).toBe(0);
    });

    it('computeMemoAccuracy should calculate correctly', () => {
      expect(computeMemoAccuracy(8, 10)).toBe(0.8);
      expect(computeMemoAccuracy(0, 0)).toBe(0);
    });

    it('computePlaceAccuracy should calculate correctly', () => {
      expect(computePlaceAccuracy(15, 20)).toBe(0.75);
      expect(computePlaceAccuracy(0, 0)).toBe(0);
    });
  });

  describe('createEmptyUnifiedMetrics', () => {
    it('should return default metrics', () => {
      const metrics = createEmptyUnifiedMetrics();
      expect(metrics.accuracy).toBe(0);
      expect(metrics.nLevel).toBe(2);
      expect(metrics.zone).toBe(1);
      expect(metrics.zoneProgress).toBe(0);
    });
  });

  describe('computeSpecDrivenTempoAccuracy', () => {
    // Test data: 0 hits, 12 misses (100% missed), 0 FA, 28 CR
    const neverClickData = { hits: 0, misses: 12, fa: 0, cr: 28 };
    // Test data: 8 hits, 2 misses, 1 FA, 19 CR (good performance)
    const goodPerfData = { hits: 8, misses: 2, fa: 1, cr: 19 };

    describe('SDT strategy (dual-catch)', () => {
      it('should use Geometric Mean formula', () => {
        // hits=8, misses=2, FA=1, CR=19
        // hitRate = 8/10 = 0.8
        // crRate = 19/20 = 0.95
        // geometric = sqrt(0.8 * 0.95) ≈ 0.8718
        const result = computeSpecDrivenTempoAccuracy(
          'dual-catch',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        expect(result).toBeCloseTo(0.8718, 3);
      });

      it('should return 0 when never clicking (all misses)', () => {
        // Never clicking: hitRate = 0, crRate = 1 → sqrt(0 * 1) = 0
        const result = computeSpecDrivenTempoAccuracy(
          'dual-catch',
          neverClickData.hits,
          neverClickData.misses,
          neverClickData.fa,
          neverClickData.cr,
        );
        expect(result).toBe(0);
      });
    });

    describe('Jaeggi strategy (dualnback-classic)', () => {
      it('should use error-based formula (1 - errorRate)', () => {
        // hits=8, misses=2, FA=1, CR=19
        // errors = 2 + 1 = 3
        // totalRelevant = 8 + 2 + 1 = 11
        // accuracy = 1 - 3/11 = 1 - 0.2727... ≈ 0.7273
        const result = computeSpecDrivenTempoAccuracy(
          'dualnback-classic',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        expect(result).toBeCloseTo(0.7273, 3);
      });

      it('should return 0 when 100% errors (all misses)', () => {
        // errors = 12 + 0 = 12, totalRelevant = 0 + 12 + 0 = 12
        // accuracy = 1 - 12/12 = 0
        const result = computeSpecDrivenTempoAccuracy(
          'dualnback-classic',
          neverClickData.hits,
          neverClickData.misses,
          neverClickData.fa,
          neverClickData.cr,
        );
        expect(result).toBe(0);
      });
    });

    describe('BrainWorkshop strategy (sim-brainworkshop)', () => {
      it('should use BW formula (H / (H + M + FA))', () => {
        // hits=8, misses=2, FA=1
        // denominator = 8 + 2 + 1 = 11
        // accuracy = 8/11 ≈ 0.7273
        const result = computeSpecDrivenTempoAccuracy(
          'sim-brainworkshop',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        expect(result).toBeCloseTo(0.7273, 3);
      });

      it('should return 0 when 100% missed (0 hits)', () => {
        // denominator = 0 + 12 + 0 = 12, accuracy = 0/12 = 0
        const result = computeSpecDrivenTempoAccuracy(
          'sim-brainworkshop',
          neverClickData.hits,
          neverClickData.misses,
          neverClickData.fa,
          neverClickData.cr,
        );
        expect(result).toBe(0);
      });
    });

    describe('Unknown mode fallback', () => {
      it('should fallback to SDT for unknown modes', () => {
        // Unknown mode should fallback to SDT (geometric mean)
        const result = computeSpecDrivenTempoAccuracy(
          'unknown-mode',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        // Same as SDT: sqrt(0.8 * 0.95) ≈ 0.8718
        expect(result).toBeCloseTo(0.8718, 3);
      });
    });

    describe('Spec-driven vs hardcoded comparison', () => {
      it('should match legacy computeTempoAccuracy for SDT modes', () => {
        const legacy = computeTempoAccuracy(
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        const specDriven = computeSpecDrivenTempoAccuracy(
          'dual-catch',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        expect(specDriven).toBe(legacy);
      });

      it('should differ from legacy for Jaeggi mode (spec-driven is error-based)', () => {
        const legacy = computeTempoAccuracy(
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        const specDriven = computeSpecDrivenTempoAccuracy(
          'dualnback-classic',
          goodPerfData.hits,
          goodPerfData.misses,
          goodPerfData.fa,
          goodPerfData.cr,
        );
        // Legacy (SDT) = 0.8718, Spec-driven (Jaeggi) = 0.7273
        expect(specDriven).not.toBe(legacy);
        expect(specDriven).toBeCloseTo(0.7273, 3);
      });
    });
  });
});
