import { describe, expect, it } from 'bun:test';
import { CognitiveProfiler } from './cognitive-profiler';
import type { GameEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';

describe('CognitiveProfiler - Deep Coverage', () => {
  describe('Flow Metrics', () => {
    it('should detect all trend types and compute flowScore correctly', () => {
      // Chaotic: high CV (> 0.4)
      const chaotic = [100, 1000, 200, 900, 300, 800].map((rt) =>
        createMockEvent('USER_RESPONDED', { reactionTimeMs: rt }),
      );
      const mChaotic = CognitiveProfiler.computeFlowMetrics(chaotic);
      expect(mChaotic.rtTrend).toBe('chaotic');
      expect(mChaotic.isInFlow).toBe(false);

      // Increasing RT (Fatigue): slope > 0.02
      // [500, 520, 540, 560, 580] -> Mean 540, Slope ~20. 20/540 = 0.037 (> 0.02)
      const fatigue = [500, 520, 540, 560, 580].map((rt) =>
        createMockEvent('USER_RESPONDED', { reactionTimeMs: rt }),
      );
      const mFatigue = CognitiveProfiler.computeFlowMetrics(fatigue);
      expect(mFatigue.rtTrend).toBe('increasing');
      expect(mFatigue.isInFlow).toBe(false);

      // Decreasing RT (Warmup): slope < -0.02
      // [600, 580, 560, 540, 520] -> Mean 560, Slope ~ -20. -20/560 = -0.035 (< -0.02)
      const warmup = [600, 580, 560, 540, 520].map((rt) =>
        createMockEvent('USER_RESPONDED', { reactionTimeMs: rt }),
      );
      const mWarmup = CognitiveProfiler.computeFlowMetrics(warmup);
      expect(mWarmup.rtTrend).toBe('decreasing');
      expect(mWarmup.isInFlow).toBe(false);

      // Stable: small slope and low CV
      const stable = [500, 505, 495, 500, 500].map((rt) =>
        createMockEvent('USER_RESPONDED', { reactionTimeMs: rt }),
      );
      const mStable = CognitiveProfiler.computeFlowMetrics(stable);
      expect(mStable.rtTrend).toBe('stable');
      // CV is very low, flowScore should be high (> 0.7)
      expect(mStable.flowScore).toBeGreaterThan(0.7);
      expect(mStable.isInFlow).toBe(true);
    });

    it('should handle small amount of data', () => {
      const small = [500, 510].map((rt) =>
        createMockEvent('USER_RESPONDED', { reactionTimeMs: rt }),
      );
      const metrics = CognitiveProfiler.computeFlowMetrics(small);
      expect(metrics.rtVariance).toBe(0);
      expect(metrics.flowScore).toBe(0.5);
    });
  });

  describe('Resilience Metrics', () => {
    const createResilienceEvents = (rts: number[], errors: number[]) => {
      const evs: GameEvent[] = [];
      for (let i = 0; i < rts.length; i++) {
        const isError = errors.includes(i);
        evs.push(
          createMockEvent('TRIAL_PRESENTED', {
            trial: {
              index: i,
              isBuffer: false,
              isPositionTarget: !isError, // simplificaton: target if not error
              position: 1,
              // @ts-expect-error test override
              sound: 'A',
              timestamp: 0,
            },
          }),
        );
        evs.push(
          createMockEvent('USER_RESPONDED', {
            trialIndex: i,
            modality: 'position',
            reactionTimeMs: rts[i],
            // @ts-expect-error test: nullable access
            timestamp: 1000 + i * 3000 + rts[i],
          }),
        );
      }
      return evs;
    };

    it('should detect resilient profile', () => {
      // Trial 0 is error. Trial 1 recovered immediately (RT 500 <= 500*1.1)
      const rts = [500, 500, 500, 500, 500, 500];
      const evs = createResilienceEvents(rts, [0]);
      const metrics = CognitiveProfiler.computeResilienceMetrics(evs);
      expect(metrics.profile).toBe('resilient');
      expect(metrics.resilienceScore).toBeGreaterThan(0.7);
    });

    it('should detect fragile profile with error cascade', () => {
      // Many consecutive errors + very slow recovery + very large slowdown
      // This should definitely result in a fragile profile (< 0.4)
      // RTs increasing by 300ms each time an error occurs
      const rts = [500, 800, 1100, 1400, 1700, 2000, 2300, 2600];
      const evs = createResilienceEvents(rts, [0, 1, 2, 3, 4, 5, 6]);
      const metrics = CognitiveProfiler.computeResilienceMetrics(evs);
      expect(metrics.errorCascadeRate).toBeGreaterThan(0.5);
      expect(metrics.profile).toBe('fragile');
      expect(metrics.resilienceScore).toBeLessThan(0.4);
    });

    it('should calculate slowdown score branches', () => {
      // Exact slowdown 100ms (within 50-150 range) -> slowdownScore = 1
      const evs100 = createResilienceEvents([500, 600, 500, 500, 500], [0]);
      expect(CognitiveProfiler.computeResilienceMetrics(evs100).resilienceScore).toBeGreaterThan(
        0.7,
      );

      // Small slowdown 20ms (< 50) -> slowdownScore = 0.7
      const evs20 = createResilienceEvents([500, 520, 500, 500, 500], [0]);
      const m20 = CognitiveProfiler.computeResilienceMetrics(evs20);
      // cascadeScore=1, recoveryScore=1, slowdownScore=0.7 -> 0.4 + 0.3 + 0.21 = 0.91
      expect(m20.resilienceScore).toBeCloseTo(0.91, 2);

      // Large slowdown 400ms (> 150) -> slowdownScore based on formula
      // slowdown=400 -> Math.max(0, 1 - (400-150)/300) = 1 - 250/300 = 1 - 0.833 = 0.166
      // resilienceScore = 1*0.4 + 1*0.3 + 0.166*0.3 = 0.4 + 0.3 + 0.05 = 0.75
      const evs400 = createResilienceEvents([500, 900, 500, 500, 500, 500], [0]);
      expect(CognitiveProfiler.computeResilienceMetrics(evs400).resilienceScore).toBeLessThan(0.8);
    });
  });

  describe('Fatigue Metrics', () => {
    const createFatigueEvents = (rts: number[], correctArr: boolean[]) => {
      const evs: GameEvent[] = [];
      for (let i = 0; i < rts.length; i++) {
        evs.push(
          createMockEvent('TRIAL_PRESENTED', {
            trial: {
              index: i,
              isBuffer: false,
              isPositionTarget: true,
              position: 1,
              // @ts-expect-error test override
              sound: 'A',
              timestamp: 0,
            },
          }),
        );
        if (correctArr[i]) {
          evs.push(
            createMockEvent('USER_RESPONDED', {
              trialIndex: i,
              modality: 'position',
              reactionTimeMs: rts[i],
              timestamp: 1000 + i * 3000,
            }),
          );
        }
      }
      return evs;
    };

    it('should detect fatigue via RT increase', () => {
      // First 5: 400ms. Last 5: 600ms (+50% > 20%)
      const rts = [...new Array(5).fill(400), ...new Array(5).fill(600)];
      const correct = new Array(10).fill(true);
      const evs = createFatigueEvents(rts, correct);
      const metrics = CognitiveProfiler.computeFatigueMetrics(evs);
      expect(metrics.isFatigued).toBe(true);
      expect(metrics.degradationPercent).toBe(50);
    });

    it('should detect fatigue via accuracy drop', () => {
      // RT same, but accuracy drops from 100% to 60% (drop 40% > 20%)
      const rts = new Array(10).fill(500);
      const correct = [...new Array(5).fill(true), true, true, true, false, false];
      const evs = createFatigueEvents(rts, correct);
      const metrics = CognitiveProfiler.computeFatigueMetrics(evs);
      expect(metrics.isFatigued).toBe(true);
      expect(metrics.lateAccuracy).toBe(0.6);
    });
  });

  describe('Rhythm Metrics', () => {
    it('should detect stable rhythm', () => {
      const responses = [
        createMockEvent('USER_RESPONDED', { timestamp: 1000 }),
        createMockEvent('USER_RESPONDED', { timestamp: 4000 }),
        createMockEvent('USER_RESPONDED', { timestamp: 7000 }),
        createMockEvent('USER_RESPONDED', { timestamp: 10000 }),
      ];
      const metrics = CognitiveProfiler.computeRhythmMetrics(responses);
      expect(metrics.hasStableRhythm).toBe(true);
      expect(metrics.responsesPerMinute).toBe(20); // 60000 / 3000
    });

    it('should detect unstable rhythm', () => {
      const responses = [
        createMockEvent('USER_RESPONDED', { timestamp: 1000 }),
        createMockEvent('USER_RESPONDED', { timestamp: 2000 }), // gap 1000
        createMockEvent('USER_RESPONDED', { timestamp: 6000 }), // gap 4000
        createMockEvent('USER_RESPONDED', { timestamp: 7000 }), // gap 1000
      ];
      const metrics = CognitiveProfiler.computeRhythmMetrics(responses);
      expect(metrics.hasStableRhythm).toBe(false);
    });
  });

  describe('Modality Insights', () => {
    // Ici on teste computeModalityInsights qui prend des objets typés (pas des Events)
    // On peut utiliser des partiels castés proprement ou créer un helper local si besoin
    // Mais le test initial utilisait 'as any' pour bypasser le type complet de ModalityProfile

    // Je vais laisser 'as any' ici car ce n'est pas un Event, c'est une structure interne complexe
    // Ou je peux définir un type partiel.

    // Pour rester dans l'esprit du nettoyage :
    const createProfile = (overrides: any) =>
      ({
        modality: 'position',
        dPrime: 0,
        avgRT: 0,
        flowScore: 0,
        ...overrides,
      }) as any;

    it('should detect dominance and calculate balance', () => {
      const profiles = {
        position: createProfile({ modality: 'position', dPrime: 3.5, avgRT: 400, flowScore: 0.9 }),
        audio: createProfile({ modality: 'audio', dPrime: 1.5, avgRT: 600, flowScore: 0.6 }),
      };
      const insights = CognitiveProfiler.computeModalityInsights(profiles);
      expect(insights.strongestModality).toBe('position');
      expect(insights.weakestModality).toBe('audio');
      expect(insights.detectedBias).toBe('position_dominant'); // Gap 2.0 > 1
      expect(insights.balanceScore).toBeLessThan(0.5);
    });

    it('should handle balanced performance', () => {
      const profiles = {
        position: createProfile({ modality: 'position', dPrime: 2.0, avgRT: 500, flowScore: 0.8 }),
        audio: createProfile({ modality: 'audio', dPrime: 2.2, avgRT: 510, flowScore: 0.8 }),
      };
      const insights = CognitiveProfiler.computeModalityInsights(profiles);
      expect(insights.detectedBias).toBe('balanced'); // Gap 0.2 < 1
      expect(insights.balanceScore).toBeGreaterThan(0.9);
    });
  });

  describe('Full Profile Compute', () => {
    it('should provide correct recommendations', () => {
      // 1. suggest_break: Fatigued
      const fatiguedRts = [...new Array(5).fill(400), ...new Array(5).fill(800)];
      const evsBreak = fatiguedRts.flatMap((rt, i) => [
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: i,
            isBuffer: false,
            isPositionTarget: true,
            position: 1,
            // @ts-expect-error test override
            sound: 'A',
            timestamp: 0,
          },
        }),
        createMockEvent('USER_RESPONDED', {
          trialIndex: i,
          modality: 'position',
          reactionTimeMs: rt,
          timestamp: 1000 + i * 3000,
        }),
      ]);
      expect(CognitiveProfiler.compute(evsBreak).recommendation).toBe('suggest_break');

      // 2. increase_difficulty: Flow + High score
      const flowRts = new Array(10).fill(500);
      const evsFlow = flowRts.flatMap((rt, i) => [
        createMockEvent('TRIAL_PRESENTED', {
          trial: {
            index: i,
            isBuffer: false,
            isPositionTarget: true,
            position: 1,
            // @ts-expect-error test override
            sound: 'A',
            timestamp: 0,
          },
        }),
        createMockEvent('USER_RESPONDED', {
          trialIndex: i,
          modality: 'position',
          reactionTimeMs: rt,
          timestamp: 1000 + i * 3000,
        }),
      ]);
      expect(CognitiveProfiler.compute(evsFlow).recommendation).toBe('increase_difficulty');
    });
  });
});
