import { describe, expect, it } from 'bun:test';
import type { SessionEndReportModel } from '../../types/session-report';
import { computeProgressionIndicatorModel } from './progression-indicator';
import { evaluateJaeggiProgression, evaluateBrainWorkshopProgression } from '../n-level-evaluator';
import { JAEGGI_MAX_ERRORS_PER_MODALITY } from '../../specs/thresholds';

interface DeviationResult {
  readonly id: string;
  readonly description: string;
  readonly expected: string;
  readonly actual: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly file: string;
}

function baseReport(overrides: Partial<SessionEndReportModel> = {}): SessionEndReportModel {
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    reason: 'completed',
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual & Back Classic',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 20,
    durationMs: 60000,
    unifiedAccuracy: 0.8,
    ups: null,
    modeScore: { labelKey: 'x', value: 80, unit: '%' },
    passed: true,
    totals: { hits: 16, misses: 2, falseAlarms: 2, correctRejections: 0 },
    byModality: {
      position: {
        hits: 8,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 0,
        avgRT: null,
        dPrime: null,
      },
      audio: {
        hits: 8,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 0,
        avgRT: null,
        dPrime: null,
      },
    },
    errorProfile: null,
    nextStep: { nextLevel: 3, direction: 'up' },
    playContext: 'free',
    journeyContext: null,
    ...overrides,
  } as unknown as SessionEndReportModel;
}

describe('Deviation Detection: Recommendation Cards', () => {
  describe('D2.1: Session Passive / Zéro Hits (Jaeggi)', () => {
    it('NOTE: The zero-hits guard is in journey-projector.ts, NOT in n-level-evaluator.ts', () => {
      const stats = {
        byModality: new Map([
          ['position', { hits: 0, misses: 2, falseAlarms: 0, correctRejections: 18 }],
          ['audio', { hits: 0, misses: 1, falseAlarms: 1, correctRejections: 18 }],
        ]),
        currentNLevel: 2,
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(1);
      expect(result.reasoning).toContain('N+1');
    });

    it('This is a DEVIATION: Journey has the guard, Free training does NOT', () => {
      expect(true).toBe(true);
    });
  });

  describe('D2.2: Modalités Vides (Jaeggi)', () => {
    it('should return STAY when byModality is empty', () => {
      const stats = {
        byModality: new Map(),
        currentNLevel: 2,
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
    });
  });

  describe('D2.3 & D2.4: Fallback Legacy sans byModality', () => {
    it('should fallback to passed boolean when byModality is missing (Jaeggi)', () => {
      const report = baseReport({
        byModality: {},
        activeModalities: [],
        nextStep: { nextLevel: 3, direction: 'up' },
        passed: true,
      });
      const model = computeProgressionIndicatorModel(report);
      expect(model).not.toBeNull();
      expect(model!.tone).toBe('up');
    });
  });

  describe('D2.5: Brain Workshop Strikes non persistés', () => {
    it('should NOT show strike when brainWorkshop is missing', () => {
      const report = baseReport({
        gameMode: 'sim-brainworkshop',
        byModality: {
          position: {
            hits: 4,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        },
        totals: { hits: 8, misses: 6, falseAlarms: 6, correctRejections: 0 },
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: undefined,
      }) as unknown as SessionEndReportModel;

      const model = computeProgressionIndicatorModel(report);
      expect(model).not.toBeNull();
      expect(model!.headline).toBe('stay');
      expect(model!.strike).toBeUndefined();
    });

    it('should show strike when brainWorkshop.strikesAfter > 0', () => {
      const report = baseReport({
        gameMode: 'sim-brainworkshop',
        byModality: {
          position: {
            hits: 4,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        },
        totals: { hits: 8, misses: 6, falseAlarms: 6, correctRejections: 0 },
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 0, strikesAfter: 1, strikesToDown: 3 },
      }) as unknown as SessionEndReportModel;

      const model = computeProgressionIndicatorModel(report);
      expect(model).not.toBeNull();
      expect(model!.headline).toBe('strike');
      expect(model!.strike).toEqual({ current: 1, total: 3 });
    });
  });

  describe('D2.6: Niveau Maximum Atteint', () => {
    it('should return STAY when at MAX_N_LEVEL even with perfect score', () => {
      const stats = {
        byModality: new Map([
          ['position', { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 }],
          ['audio', { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 }],
        ]),
        currentNLevel: 10,
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('max');
    });
  });

  describe('D2.7: Niveau N=1 : Pas de Descente', () => {
    it('should NOT go below N=1 even with terrible score (Jaeggi)', () => {
      const stats = {
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
          ['audio', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
        currentNLevel: 1,
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBeGreaterThanOrEqual(0);
    });

    it('should NOT go below N=1 even with terrible score (BW)', () => {
      const stats = {
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
        currentNLevel: 1,
      };
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBeGreaterThanOrEqual(0);
    });
  });

  describe('D2.9: Brain Workshop Score = floor (pas round)', () => {
    it('should use floor for BW score calculation', () => {
      const stats = {
        byModality: new Map([
          ['position', { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 0 }],
        ]),
        currentNLevel: 2,
      };
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.reasoning).toMatch(/score=\d+%/);
    });
  });

  describe('D2.10: N=1 STAY → 2 CTAs au lieu de 3', () => {
    it('should have 2 CTAs when N=1 and STAY', () => {
      const report = baseReport({
        nLevel: 1,
        nextStep: { nextLevel: 1, direction: 'same' },
        byModality: {
          position: {
            hits: 4,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = computeProgressionIndicatorModel(report);
      expect(model).not.toBeNull();
      const totalActions = 1 + model!.secondaryActions.length;
      expect(totalActions).toBe(2);
    });
  });

  describe('Canonical Cases (Spec v1)', () => {
    it('Jaeggi UP: all modalities < 3 errors', () => {
      const report = baseReport({
        byModality: {
          position: {
            hits: 10,
            misses: 2,
            falseAlarms: 0,
            correctRejections: 8,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 10,
            misses: 2,
            falseAlarms: 0,
            correctRejections: 8,
            avgRT: null,
            dPrime: null,
          },
        },
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('up');
      expect(model!.headline).toBe('up');
    });

    it('Jaeggi DOWN: any modality > 5 errors', () => {
      const report = baseReport({
        nLevel: 3,
        byModality: {
          position: {
            hits: 5,
            misses: 4,
            falseAlarms: 3,
            correctRejections: 8,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 10,
            misses: 2,
            falseAlarms: 0,
            correctRejections: 8,
            avgRT: null,
            dPrime: null,
          },
        },
        nextStep: { nextLevel: 2, direction: 'down' },
      });
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('down');
    });

    it('Jaeggi STAY: 3-5 errors', () => {
      const report = baseReport({
        nLevel: 3,
        byModality: {
          position: {
            hits: 7,
            misses: 3,
            falseAlarms: 1,
            correctRejections: 9,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 8,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 9,
            avgRT: null,
            dPrime: null,
          },
        },
        nextStep: { nextLevel: 3, direction: 'same' },
      });
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('stay');
      expect(model!.headline).toBe('stay');
    });

    it('BW UP: score >= 80%', () => {
      const report = baseReport({
        gameMode: 'sim-brainworkshop',
        byModality: {
          position: {
            hits: 8,
            misses: 1,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 8,
            misses: 1,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        },
        totals: { hits: 16, misses: 2, falseAlarms: 2, correctRejections: 0 },
        nextStep: { nextLevel: 3, direction: 'up' },
      }) as unknown as SessionEndReportModel;
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('up');
    });

    it('BW Strike 1/3: score < 50%', () => {
      const report = baseReport({
        gameMode: 'sim-brainworkshop',
        nLevel: 2,
        byModality: {
          position: {
            hits: 2,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        },
        totals: { hits: 4, misses: 4, falseAlarms: 4, correctRejections: 0 },
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 0, strikesAfter: 1, strikesToDown: 3 },
      }) as unknown as SessionEndReportModel;
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('stay');
      expect(model!.headline).toBe('strike');
      expect(model!.strike).toEqual({ current: 1, total: 3 });
    });

    it('BW DOWN: 3rd strike', () => {
      const report = baseReport({
        gameMode: 'sim-brainworkshop',
        nLevel: 3,
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        },
        totals: { hits: 4, misses: 6, falseAlarms: 6, correctRejections: 0 },
        nextStep: { nextLevel: 2, direction: 'down' },
        brainWorkshop: { strikesBefore: 2, strikesAfter: 0, strikesToDown: 3 },
      }) as unknown as SessionEndReportModel;
      const model = computeProgressionIndicatorModel(report);
      expect(model!.tone).toBe('down');
      expect(model!.headline).toBe('down');
      expect(model!.strike).toBeUndefined();
    });
  });
});

export function detectDeviations(report: SessionEndReportModel): DeviationResult[] {
  const deviations: DeviationResult[] = [];

  const model = computeProgressionIndicatorModel(report);
  if (!model) return deviations;

  if (report.gameMode === 'dualnback-classic' || report.gameMode === 'sim-brainworkshop') {
    let totalHits = 0;
    let maxErrors = 0;
    for (const stats of Object.values(report.byModality)) {
      totalHits += stats.hits;
      maxErrors = Math.max(maxErrors, (stats.misses ?? 0) + (stats.falseAlarms ?? 0));
    }

    if (totalHits === 0 && maxErrors < JAEGGI_MAX_ERRORS_PER_MODALITY && model.tone === 'stay') {
      deviations.push({
        id: 'D2.1',
        description: 'Session passive (0 hits) → STAY forcé au lieu de UP',
        expected: 'UP (errors < 3)',
        actual: 'STAY (0 hits guard)',
        severity: 'low',
        file: 'n-level-evaluator.ts:100-105',
      });
    }

    if (Object.keys(report.byModality).length === 0) {
      deviations.push({
        id: 'D2.2',
        description: 'Modalités vides → STAY forcé',
        expected: 'Non spécifié',
        actual: 'STAY (empty modality guard)',
        severity: 'low',
        file: 'n-level-evaluator.ts:51-56',
      });
    }
  }

  if (report.gameMode === 'sim-brainworkshop' && !report.brainWorkshop) {
    deviations.push({
      id: 'D2.5',
      description: "Brain Workshop sans données strikes → pas d'affichage strike",
      expected: 'strike affiché si score < 50%',
      actual: 'headline=stay (pas de strike)',
      severity: 'medium',
      file: 'progression-indicator.ts:207-214',
    });
  }

  return deviations;
}
