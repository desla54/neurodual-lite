import { describe, expect, it } from 'bun:test';
import { generateContextualMessageData } from './contextual-message';
import type { SessionEndReportModel } from '../../types/session-report';

describe('ContextualMessageGenerator (i18n)', () => {
  const baseReport: SessionEndReportModel = {
    sessionId: 'test-session',
    userId: 'test-user',
    nLevel: 2,
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    activeModalities: ['position', 'audio'],
    trialsCount: 20,
    durationMs: 60000,
    unifiedAccuracy: 0.9,
    reason: 'completed',
    createdAt: new Date().toISOString(),
    ups: {
      score: 90,
      tier: 'elite',
      journeyEligible: true,
      components: { accuracy: 90, confidence: 90 },
    },
    modeScore: { labelKey: 'report.modeScore.accuracy', value: 90, unit: '%' },
    totals: {
      hits: 18,
      misses: 2,
      falseAlarms: 0,
      correctRejections: 20,
    },
    byModality: {
      position: {
        hits: 9,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.5,
        avgRT: 400,
      },
      audio: {
        hits: 9,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.5,
        avgRT: 450,
      },
    },
    errorProfile: {
      errorRate: 0.1,
      missShare: 1.0,
      faShare: 0,
    },
    nextStep: {
      direction: 'same',
      nextLevel: 2,
      reason: 'Good job',
    },
  };

  describe('Performance Levels', () => {
    it('should return excellent level for high accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.98 };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('excellent');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
      expect(data.subline.key).toContain('stats.contextual.sublines.');
    });

    it('should return good level for good accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.88 };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('good');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });

    it('should return average level for average accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.75 };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('average');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });

    it('should return below-average level for below average accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.6 };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('below-average');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });

    it('should return struggling level for low accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.4 };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('struggling');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });
  });

  describe('i18n Keys', () => {
    it('should return proper headline key with params for accuracy', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.95 };
      const data = generateContextualMessageData(report);
      // Headline key should be from stats.contextual.headlines namespace
      expect(data.headline.key).toMatch(/^stats\.contextual\.headlines\./);
      // Params should include accuracy as a number
      if (data.headline.params?.accuracy !== undefined) {
        expect(typeof data.headline.params.accuracy).toBe('number');
      }
    });

    it('should return proper subline key', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.88 };
      const data = generateContextualMessageData(report);
      expect(data.subline.key).toMatch(/^stats\.contextual\.sublines\./);
    });

    it('should optionally include insight key', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.95 };
      const data = generateContextualMessageData(report);
      // Insight is optional
      if (data.insight) {
        expect(data.insight.key).toMatch(/^stats\.contextual\.insights\./);
      }
    });
  });

  describe('Special Cases', () => {
    it('should handle excellent performance with level up', () => {
      const report = {
        ...baseReport,
        unifiedAccuracy: 0.98,
        nextStep: { direction: 'up' as const, nextLevel: 3, reason: 'Level up' },
      };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('excellent');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });

    it('should handle modality gap', () => {
      const report: SessionEndReportModel = {
        ...baseReport,
        unifiedAccuracy: 0.88,
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 2.8,
            avgRT: 400,
          },
          audio: {
            hits: 7,
            misses: 3,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 1.2,
            avgRT: 480,
          },
        },
      };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('good');
      expect(data.subline.key).toContain('stats.contextual.sublines.');
    });

    it('should handle no responses at all', () => {
      const report: SessionEndReportModel = {
        ...baseReport,
        unifiedAccuracy: 0.0,
        totals: { hits: 0, misses: 8, falseAlarms: 0, correctRejections: 0 },
      };
      const data = generateContextualMessageData(report);
      // Should return a special no-response headline
      expect(data.headline.key).toContain('stats.contextual.headlines.');
      expect(data.subline.key).toContain('stats.contextual.sublines.');
      // Should include the target count in params
      if (data.subline.params?.targets !== undefined) {
        expect(data.subline.params.targets).toBe(8);
      }
    });

    it('should handle abandoned session', () => {
      const report: SessionEndReportModel = {
        ...baseReport,
        reason: 'abandoned',
        trialsCount: 20,
        unifiedAccuracy: 0.5,
        totals: { hits: 3, misses: 2, falseAlarms: 1, correctRejections: 2 },
      };
      const data = generateContextualMessageData(report);
      // Should return an abandoned headline key
      expect(data.headline.key).toContain('stats.contextual.headlines.');
      expect(data.subline.key).toContain('stats.contextual.sublines.');
    });

    it('should handle impulsive behavior', () => {
      const report: SessionEndReportModel = {
        ...baseReport,
        unifiedAccuracy: 0.5,
        totals: { hits: 10, misses: 5, falseAlarms: 15, correctRejections: 10 },
        speedStats: { labelKey: 'report.speed.avg', valueMs: 250 },
      };
      const data = generateContextualMessageData(report);
      // Should detect impulsive: high FA + fast RT
      expect(data.subline.key).toContain('stats.contextual.sublines.');
    });

    it('should handle struggling with modality imbalance', () => {
      const report: SessionEndReportModel = {
        ...baseReport,
        unifiedAccuracy: 0.4,
        byModality: {
          position: {
            hits: 8,
            misses: 2,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 2.0,
            avgRT: 400,
          },
          audio: {
            hits: 2,
            misses: 8,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 0.5,
            avgRT: 500,
          },
        },
        totals: { hits: 10, misses: 10, falseAlarms: 0, correctRejections: 20 },
      };
      const data = generateContextualMessageData(report);
      expect(data.level).toBe('struggling');
      expect(data.headline.key).toContain('stats.contextual.headlines.');
    });
  });

  describe('Message Structure', () => {
    it('should always return required fields', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.75 };
      const data = generateContextualMessageData(report);

      expect(data).toHaveProperty('level');
      expect(data).toHaveProperty('headline');
      expect(data).toHaveProperty('subline');

      expect(data.headline).toHaveProperty('key');
      expect(data.subline).toHaveProperty('key');

      expect(typeof data.level).toBe('string');
      expect(typeof data.headline.key).toBe('string');
      expect(typeof data.subline.key).toBe('string');
    });

    it('headline params should be optional and correct types', () => {
      const report = { ...baseReport, unifiedAccuracy: 0.85 };
      const data = generateContextualMessageData(report);

      // If params exist, they should be string or number
      if (data.headline.params) {
        for (const [_key, value] of Object.entries(data.headline.params)) {
          expect(['string', 'number']).toContain(typeof value);
        }
      }
    });
  });
});

// =============================================================================
// Deterministic Subline Archetype Tests
// =============================================================================

describe('Deterministic Subline Archetypes (analyst style)', () => {
  // Base report — override only what each test needs.
  const base: SessionEndReportModel = {
    sessionId: 'arch-test',
    userId: 'u1',
    nLevel: 2,
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    activeModalities: ['position', 'audio'],
    trialsCount: 30,
    durationMs: 120000,
    unifiedAccuracy: 0.9,
    reason: 'completed',
    createdAt: new Date().toISOString(),
    ups: {
      score: 85,
      tier: 'intermediate',
      journeyEligible: false,
      components: { accuracy: 85, confidence: 85 },
    },
    modeScore: { labelKey: 'report.modeScore.accuracy', value: 90, unit: '%' },
    totals: { hits: 18, misses: 2, falseAlarms: 0, correctRejections: 20 },
    byModality: {
      position: {
        hits: 9,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.5,
        avgRT: 400,
      },
      audio: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10, dPrime: 2.5, avgRT: 450 },
    },
    errorProfile: { errorRate: 0.1, missShare: 1.0, faShare: 0 },
    nextStep: { direction: 'same', nextLevel: 2, reason: 'ok' },
  };

  // Test 1 — FA_WEAK : 2 FA, 15 essais, volume trop faible pour être affirmatif
  it('selects analystFaWeak when FA dominant and volume too small', () => {
    // missRatio = 0/(0+2) = 0 < 0.3 → FA dominant; nonTargets=7 < 20 → FA_WEAK
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 15,
      unifiedAccuracy: 0.86,
      activeModalities: ['position'],
      totals: { hits: 10, misses: 0, falseAlarms: 2, correctRejections: 5 },
      byModality: {
        position: {
          hits: 10,
          misses: 0,
          falseAlarms: 2,
          correctRejections: 5,
          dPrime: 2.0,
          avgRT: 400,
        },
      },
      errorProfile: { errorRate: 0.12, missShare: 0, faShare: 1 },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystFaWeak');
    expect(data.subline.params?.fa).toBe(2);
  });

  // Test 2 — MISS_STRONG : 35% miss, 40 essais, volume suffisant
  it('selects analystMissStrong when miss dominant and volume sufficient', () => {
    // missRatio = 7/7 = 1.0 > 0.7 → miss dominant; trialsCount=40 ≥ 30 → MISS_STRONG
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 40,
      unifiedAccuracy: 0.65,
      activeModalities: ['position'],
      totals: { hits: 13, misses: 7, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 13,
          misses: 7,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 1.0,
          avgRT: 500,
        },
      },
      errorProfile: { errorRate: 0.35, missShare: 1.0, faShare: 0 },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystMissStrong');
    expect(data.subline.params?.pct).toBe(35);
    expect(data.subline.params?.misses).toBe(7);
  });

  // Test 3 — MISS_WEAK : 28% miss, 15 essais, volume trop faible
  it('selects analystMissWeak when miss dominant and volume too small', () => {
    // missRatio = 2/2 = 1.0 → miss dominant; trialsCount=15 < 30 → MISS_WEAK
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 15,
      unifiedAccuracy: 0.72,
      activeModalities: ['position'],
      totals: { hits: 5, misses: 2, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 5,
          misses: 2,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 1.2,
          avgRT: 480,
        },
      },
      errorProfile: { errorRate: 0.28, missShare: 1.0, faShare: 0 },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystMissWeak');
    expect(data.subline.params?.misses).toBe(2);
  });

  // Test 4 — MODALITY_GAP_STRONG : gap 40%, position 9/10 vs audio 5/10
  it('selects analystModalityGapStrong when gap >= 0.25 and multiple modalities', () => {
    // position accuracy=(9+0)/10=0.9; audio accuracy=(5+0)/10=0.5; gap=0.4 ≥ 0.25
    // MODALITY_GAP_STRONG fires at priority #2, before miss checks
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 30,
      unifiedAccuracy: 0.7,
      activeModalities: ['position', 'audio'],
      totals: { hits: 14, misses: 6, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 9,
          misses: 1,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 2.5,
          avgRT: 380,
        },
        audio: {
          hits: 5,
          misses: 5,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 0.8,
          avgRT: 550,
        },
      },
      errorProfile: { errorRate: 0.3, missShare: 1.0, faShare: 0 },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystModalityGapStrong');
    expect(data.subline.params?.best).toBe('position');
    expect(data.subline.params?.worst).toBe('audio');
  });

  // Test 5 — VARIABLE_RT : aucun autre signal fort, RT très variable
  it('selects analystVariableRt when RT is variable and no stronger signal', () => {
    // Perfect accuracy → no errors, no gap (single modality), no focus lost
    // cv = (1100-150)/400 = 2.375 ≥ 0.5 → variable
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 30,
      unifiedAccuracy: 0.92,
      activeModalities: ['position'],
      totals: { hits: 18, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 18,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 3.0,
          avgRT: 400,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: 0 },
      speedStats: {
        labelKey: 'report.speed.avg',
        valueMs: 400,
        distribution: { min: 150, median: 400, max: 1100 },
      },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystVariableRt');
  });

  // Test 6 — FOCUS_LOST : 1 interruption, 20s — priorité maximale
  it('selects analystFocusLost when focus was lost at least once', () => {
    const report: SessionEndReportModel = {
      ...base,
      focusStats: { focusLostCount: 1, focusLostTotalMs: 20000 },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystFocusLost');
    expect(data.subline.params?.count).toBe(1);
    expect(data.subline.params?.duration).toBe('20s');
  });

  // Test 7 — LEVEL_UP : excellent + isImproving, sans aucun autre signal
  it('selects analystLevelUp when excellent and improving with no errors', () => {
    // level='excellent' (accuracy=1.0); direction='up' → isImproving=true
    // No errors → dominantErrorType='none'; no gap (single modality); no focus lost; unknown RT
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 30,
      unifiedAccuracy: 1.0,
      activeModalities: ['position'],
      totals: { hits: 20, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 20,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 3.5,
          avgRT: 350,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: 0 },
      nextStep: { direction: 'up', nextLevel: 3, reason: 'excellent' },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystLevelUp');
    expect(data.subline.params?.level).toBe(3);
  });

  // Test 8 — CONSOLIDATE : accuracy 60%, erreurs équilibrées (ni miss ni FA dominant)
  it('selects analystConsolidate when accuracy < 0.70 and no dominant error type', () => {
    // missRatio = 2/4 = 0.5 → entre 0.3 et 0.7 → 'balanced' (hasFalseAlarms=true)
    // balanced → skip miss checks, skip FA checks; accuracy 0.6 < 0.70 → CONSOLIDATE
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 20,
      unifiedAccuracy: 0.6,
      activeModalities: ['position'],
      totals: { hits: 6, misses: 2, falseAlarms: 2, correctRejections: 6 },
      byModality: {
        position: {
          hits: 6,
          misses: 2,
          falseAlarms: 2,
          correctRejections: 6,
          dPrime: 0.8,
          avgRT: 480,
        },
      },
      errorProfile: { errorRate: 0.25, missShare: 0.5, faShare: 0.5 },
      nextStep: { direction: 'down', nextLevel: 1, reason: 'errors' },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystConsolidate');
    expect(data.subline.params?.level).toBe(2);
  });

  // Test 9 — STABLE_RT : aucun signal plus fort, RT stable
  it('selects analystStableRt when RT is stable and no stronger signal', () => {
    // No errors, single modality, stable RT (cv=80/400=0.2 < 0.5), not improving, accuracy ≥ 0.70
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 30,
      unifiedAccuracy: 0.88,
      activeModalities: ['position'],
      totals: { hits: 18, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 18,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 2.8,
          avgRT: 400,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: 0 },
      speedStats: {
        labelKey: 'report.speed.avg',
        valueMs: 400,
        distribution: { min: 360, median: 400, max: 440 },
      },
      nextStep: { direction: 'same', nextLevel: 2, reason: 'good' },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystStableRt');
    expect(data.subline.params?.rt).toBe(400);
  });

  // Test 10 — FALLBACK : aucun signal (session parfaite, RT inconnu, niveau stable)
  it('selects analystFallback when no archetype condition matches', () => {
    // No errors, single modality, no speedStats (rtConsistency='unknown'), not improving, accuracy ≥ 0.70
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 30,
      unifiedAccuracy: 0.88,
      activeModalities: ['position'],
      totals: { hits: 20, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 20,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 3.0,
          avgRT: null,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: 0 },
      nextStep: { direction: 'same', nextLevel: 2, reason: 'good' },
    };
    const data = generateContextualMessageData(report, { style: 'analyst' });
    expect(data.subline.key).toBe('stats.contextual.sublines.analystFallback');
    expect(data.subline.params?.correct).toBe(20);
    expect(data.subline.params?.errors).toBe(0);
  });
});

describe('Deterministic Subline Archetypes (simple style)', () => {
  const base: SessionEndReportModel = {
    sessionId: 'simple-arch-test',
    userId: 'u1',
    nLevel: 2,
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual Catch',
    activeModalities: ['position', 'audio'],
    trialsCount: 30,
    durationMs: 120000,
    unifiedAccuracy: 0.9,
    reason: 'completed',
    createdAt: new Date().toISOString(),
    ups: {
      score: 85,
      tier: 'intermediate',
      journeyEligible: false,
      components: { accuracy: 85, confidence: 85 },
    },
    modeScore: { labelKey: 'report.modeScore.accuracy', value: 90, unit: '%' },
    totals: { hits: 18, misses: 2, falseAlarms: 0, correctRejections: 20 },
    byModality: {
      position: {
        hits: 9,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 10,
        dPrime: 2.5,
        avgRT: 400,
      },
      audio: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10, dPrime: 2.5, avgRT: 450 },
    },
    errorProfile: { errorRate: 0.1, missShare: 1.0, faShare: 0 },
    nextStep: { direction: 'same', nextLevel: 2, reason: 'ok' },
  };

  // Test 11 — simpleModalityGap : gap fort (style simple)
  it('selects simpleModalityGap when gap >= 0.25 in simple style', () => {
    const report: SessionEndReportModel = {
      ...base,
      activeModalities: ['position', 'audio'],
      totals: { hits: 14, misses: 6, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 9,
          misses: 1,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 2.5,
          avgRT: 380,
        },
        audio: {
          hits: 5,
          misses: 5,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 0.8,
          avgRT: 550,
        },
      },
      errorProfile: { errorRate: 0.3, missShare: 1.0, faShare: 0 },
    };
    const data = generateContextualMessageData(report, { style: 'simple' });
    expect(data.subline.key).toBe('stats.contextual.sublines.simpleModalityGap');
    expect(data.subline.params?.gap).toBe(40);
  });

  it('does not select simpleModalityWeak when worst modality is perfect (e.g. 6/6)', () => {
    const report: SessionEndReportModel = {
      ...base,
      trialsCount: 6,
      unifiedAccuracy: 1.0,
      activeModalities: ['position', 'audio'],
      totals: { hits: 6, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 3,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: null,
          avgRT: 420,
        },
        audio: {
          hits: 3,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: null,
          avgRT: 430,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: null },
    };

    const data = generateContextualMessageData(report, { style: 'simple', variant: 'stable' });
    expect(data.subline.key).not.toBe('stats.contextual.sublines.simpleModalityWeak');
  });

  // Test 12 — simpleDetection : aucun signal plus fort → taux de détection (last resort normal)
  // DETECTION (priority #10) fires for all sessions with targets; simpleFallback is for 0-target edge cases.
  it('selects simpleDetection as last resort when no stronger signal matches in simple style', () => {
    // No errors, single modality (no gap), no RT data, not improving, accuracy ≥ 0.70
    // totalTargets = hits + misses = 20 > 0 → DETECTION fires (last normal-session archetype)
    const report: SessionEndReportModel = {
      ...base,
      activeModalities: ['position'],
      totals: { hits: 20, misses: 0, falseAlarms: null, correctRejections: null },
      byModality: {
        position: {
          hits: 20,
          misses: 0,
          falseAlarms: null,
          correctRejections: null,
          dPrime: 3.0,
          avgRT: null,
        },
      },
      errorProfile: { errorRate: 0, missShare: 0, faShare: 0 },
      nextStep: { direction: 'same', nextLevel: 2, reason: 'ok' },
    };
    const data = generateContextualMessageData(report, { style: 'simple' });
    expect(data.subline.key).toBe('stats.contextual.sublines.simpleDetection');
    expect(data.subline.params?.hits).toBe(20);
    expect(data.subline.params?.total).toBe(20);
    expect(data.subline.params?.pct).toBe(100);
  });
});
