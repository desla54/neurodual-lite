import { describe, expect, it } from 'bun:test';
import {
  convertTempoSession,
  convertMemoSession,
  convertPlaceSession,
  convertDualPickSession,
  convertTraceSession,
  convertGenericSession,
  type TempoSessionInput,
  type MemoSessionInput,
  type PlaceSessionInput,
  type DualPickSessionInput,
  type TraceSessionInput,
  type GenericSessionInput,
} from './converters';
import type { SessionSummary } from '../../types/events';
import type { MemoSessionSummary } from '../../types/memo';
import type { PlaceSessionSummary } from '../../types/place';
import type { DualPickSessionSummary } from '../../types/dual-pick';
import type { TraceSessionSummary } from '../../types/trace';
import type { JourneyContext } from '../../types/session-report';

// =============================================================================
// Test Data Factories
// =============================================================================

function createTempoSummary(overrides?: Partial<SessionSummary>): SessionSummary {
  return {
    sessionId: 's1',
    nLevel: 2,
    totalTrials: 20,
    completedTrials: 20,
    durationMs: 60000,
    globalDPrime: 2.5,
    // @ts-expect-error test override
    isiStats: { avg: 2500, min: 2000, max: 3000 },
    // @ts-expect-error test override
    stimulusDurationStats: { avg: 500, min: 500, max: 500 },
    finalStats: {
      // @ts-expect-error test override
      trialsCount: 20,
      globalDPrime: 2.5,
      byModality: {
        position: {
          hits: 8,
          misses: 2,
          falseAlarms: 1,
          correctRejections: 9,
          dPrime: 2.3,
          avgRT: 450,
        },
        audio: {
          hits: 7,
          misses: 3,
          falseAlarms: 2,
          correctRejections: 8,
          dPrime: 2.1,
          avgRT: 480,
        },
      },
    },
    ...overrides,
  };
}

function createRecallSummary(overrides?: Partial<MemoSessionSummary>): MemoSessionSummary {
  return {
    sessionId: 's1',
    nLevel: 2,
    totalTrials: 10,
    durationMs: 45000,
    // @ts-expect-error test override
    finalStats: {
      accuracy: 0.85,
      totalPicks: 40,
      correctPicks: 34,
      recentAccuracies: [0.8, 0.85, 0.9],
      trend: 'improving' as const,
      byModality: {
        position: { totalPicks: 20, correctPicks: 17, accuracy: 0.85 },
        audio: { totalPicks: 20, correctPicks: 17, accuracy: 0.85 },
      },
      bySlotIndex: {
        0: { totalPicks: 10, correctPicks: 9, accuracy: 0.9 },
        1: { totalPicks: 10, correctPicks: 8, accuracy: 0.8 },
      },
    },
    avgRecallTimeMs: 1500,
    completed: true,
    ...overrides,
  };
}

function createPlaceSummary(overrides?: Partial<PlaceSessionSummary>): PlaceSessionSummary {
  return {
    sessionId: 's1',
    nLevel: 2,
    totalTrials: 15,
    durationMs: 50000,
    finalStats: {
      totalDrops: 30,
      correctDrops: 27,
      errorCount: 3,
      accuracy: 0.9,
      turnsCompleted: 15,
    },
    completed: true,
    score: 90,
    ...overrides,
  };
}

function createDualPickSummary(
  overrides?: Partial<DualPickSessionSummary>,
): DualPickSessionSummary {
  return {
    sessionId: 's1',
    nLevel: 2,
    totalTrials: 12,
    durationMs: 40000,
    finalStats: {
      totalDrops: 24,
      correctDrops: 22,
      errorCount: 2,
      accuracy: 0.917,
      turnsCompleted: 12,
    },
    completed: true,
    score: 92,
    ...overrides,
  };
}

function createTraceSummary(overrides?: Partial<TraceSessionSummary>): TraceSessionSummary {
  return {
    sessionId: 's1',
    nLevel: 2,
    totalTrials: 20,
    durationMs: 55000,
    finalStats: {
      // @ts-expect-error test override
      totalResponses: 18,
      correctResponses: 15,
      incorrectResponses: 2,
      timeouts: 1,
      skipped: 0,
      accuracy: 0.833,
    },
    completed: true,
    score: 83,
    rhythmMode: 'self-paced' as const,
    responses: [
      // @ts-expect-error test override
      {
        trialIndex: 0,
        isWarmup: false,
        responseType: 'swipe' as const,
        responseTimeMs: 800,
        isCorrect: true,
      },
      // @ts-expect-error test override
      {
        trialIndex: 1,
        isWarmup: false,
        responseType: 'double-tap' as const,
        responseTimeMs: 750,
        isCorrect: true,
      },
    ],
    ...overrides,
  };
}

// =============================================================================
// Tempo Converter Tests
// =============================================================================

describe('convertTempoSession', () => {
  it('should convert a tempo session to unified report format', () => {
    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 3,
    };

    const result = convertTempoSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-catch');
    expect(result.nLevel).toBe(2);
    expect(result.trialsCount).toBe(20);
    expect(result.passed).toBe(true);
    expect(result.modeScore.value).toBe(2.5);
    expect(result.modeScore.unit).toBe("d'");
  });

  it('should report BrainWorkshop mode score as BW percent (0-100)', () => {
    const summary = createTempoSummary({
      globalDPrime: 1.6,
      finalStats: {
        // @ts-expect-error test override
        trialsCount: 20,
        globalDPrime: 1.6,
        byModality: {
          position: {
            hits: 5,
            misses: 1,
            falseAlarms: 1,
            correctRejections: 13,
            dPrime: 0.2,
            avgRT: 450,
          },
          audio: {
            hits: 5,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 13,
            dPrime: 0.2,
            avgRT: 480,
          },
        },
      },
    });

    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary,
      gameMode: 'sim-brainworkshop',
      gameModeLabel: 'Simulateur Brain Workshop',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
    };

    const result = convertTempoSession(input);

    // BW score = floor(H / (H + M + FA) * 100) = floor(10 / 13 * 100) = 76
    expect(result.modeScore.unit).toBe('%');
    expect(result.modeScore.value).toBe(76);
  });

  it('should omit nextStep when journeyContext is provided', () => {
    const journeyContext: JourneyContext = {
      stageId: 1,
      stageMode: 'simulator',
      nLevel: 2,
      journeyName: 'Parcours',
      journeyGameMode: 'sim-brainworkshop',
      upsThreshold: 60,
      isValidating: true,
      validatingSessions: 1,
      sessionsRequired: 2,
      stageCompleted: false,
      nextStageUnlocked: null,
      consecutiveStrikes: 0,
    };

    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 3,
      journeyContext,
    };

    const result = convertTempoSession(input);

    expect(result.journeyContext).toEqual(journeyContext);
    expect(result.nextStep).toBeUndefined();
  });

  it('should compute unified accuracy using balanced accuracy', () => {
    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
    };

    const result = convertTempoSession(input);

    expect(result.unifiedAccuracy).toBeGreaterThan(0);
    expect(result.unifiedAccuracy).toBeLessThanOrEqual(1);
  });

  it('should include modality stats', () => {
    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
    };

    const result = convertTempoSession(input);

    expect(result.byModality.position).toBeDefined();
    expect(result.byModality.audio).toBeDefined();
    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.hits).toBe(8);
    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.avgRT).toBe(450);
  });

  it('should compute next step direction correctly', () => {
    const inputUp: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 3,
    };

    const inputDown: TempoSessionInput = {
      ...inputUp,
      nextLevel: 1,
    };

    const inputSame: TempoSessionInput = {
      ...inputUp,
      nextLevel: 2,
    };

    expect(convertTempoSession(inputUp).nextStep?.direction).toBe('up');
    expect(convertTempoSession(inputDown).nextStep?.direction).toBe('down');
    expect(convertTempoSession(inputSame).nextStep?.direction).toBe('same');
  });

  it('should include tempo details', () => {
    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
    };

    const result = convertTempoSession(input);

    expect(result.modeDetails?.kind).toBe('tempo');
    if (result.modeDetails?.kind === 'tempo') {
      expect(result.modeDetails.avgIsiMs).toBe(2500);
      expect(result.modeDetails.avgStimulusDurationMs).toBe(500);
    }
  });

  it('should use provided UPS if available', () => {
    const customUps = {
      score: 85,
      components: { accuracy: 90, confidence: 80 },
      journeyEligible: true,
      tier: 'gold' as const,
    };

    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
      // @ts-expect-error test override
      ups: customUps,
    };

    const result = convertTempoSession(input);

    expect(result.ups.score).toBe(85);
    // @ts-expect-error test override
    expect(result.ups.tier).toBe('gold');
  });
});

// =============================================================================
// Recall Converter Tests
// =============================================================================

describe('convertMemoSession', () => {
  it('should convert a recall session to unified report format', () => {
    const input: MemoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createRecallSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Memo',
      passed: true,
      nextLevel: 3,
    };

    const result = convertMemoSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-memo');
    expect(result.nLevel).toBe(2);
    expect(result.modeScore.unit).toBe('%');
  });

  it('should set FA/CR to null (not applicable in recall)', () => {
    const input: MemoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createRecallSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Memo',
      passed: true,
      nextLevel: 2,
    };

    const result = convertMemoSession(input);

    expect(result.totals.falseAlarms).toBeNull();
    expect(result.totals.correctRejections).toBeNull();
    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.falseAlarms).toBeNull();
  });

  it('should include memo details with trend', () => {
    const input: MemoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createRecallSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Memo',
      passed: true,
      nextLevel: 2,
      confidenceScore: 85,
      fluencyScore: 90,
      correctionsCount: 2,
    };

    const result = convertMemoSession(input);

    expect(result.modeDetails?.kind).toBe('memo');
    if (result.modeDetails?.kind === 'memo') {
      expect(result.modeDetails.trend).toBe('improving');
      expect(result.modeDetails.avgRecallTimeMs).toBe(1500);
      expect(result.modeDetails.confidenceScore).toBe(85);
      expect(result.modeDetails.fluencyScore).toBe(90);
    }
  });
});

// =============================================================================
// Flow Converter Tests
// =============================================================================

describe('convertPlaceSession', () => {
  it('should convert a flow session to unified report format', () => {
    const input: PlaceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createPlaceSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Place',
      passed: true,
      nextLevel: 3,
    };

    const result = convertPlaceSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-place');
    expect(result.totals.hits).toBe(27);
    expect(result.totals.misses).toBe(3);
  });

  it('should include flow details with confidence metrics', () => {
    const input: PlaceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createPlaceSummary(),
      activeModalities: ['position', 'audio'],
      avgPlacementTimeMs: 1200,
      confidenceScore: 88,
      directnessRatio: 0.85,
      wrongSlotDwellMs: 150,
      gameModeLabel: 'Dual Place',
      passed: true,
      nextLevel: 2,
    };

    const result = convertPlaceSession(input);

    expect(result.modeDetails?.kind).toBe('flow');
    if (result.modeDetails?.kind === 'flow') {
      expect(result.modeDetails.correctDrops).toBe(27);
      expect(result.modeDetails.confidenceScore).toBe(88);
      expect(result.modeDetails.directnessRatio).toBe(0.85);
    }
  });

  it('should use byModalityStats when provided', () => {
    const input: PlaceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createPlaceSummary(),
      activeModalities: ['position', 'audio'],
      byModalityStats: {
        position: {
          totalDrops: 15,
          correctDrops: 14,
          errorCount: 1,
          accuracy: 0.93,
          avgPlacementTimeMs: 1100,
        },
        audio: {
          totalDrops: 15,
          correctDrops: 13,
          errorCount: 2,
          accuracy: 0.87,
          avgPlacementTimeMs: 1300,
        },
      },
      gameModeLabel: 'Dual Place',
      passed: true,
      nextLevel: 2,
    };

    const result = convertPlaceSession(input);

    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.hits).toBe(14);
    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.avgRT).toBe(1100);
    // @ts-expect-error test: nullable access
    expect(result!.byModality.audio.hits).toBe(13);
    // @ts-expect-error test: nullable access
    expect(result!.byModality.audio.avgRT).toBe(1300);
  });
});

// =============================================================================
// Dual Label Converter Tests
// =============================================================================

describe('convertDualPickSession', () => {
  it('should convert a dual label session to unified report format', () => {
    const input: DualPickSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createDualPickSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Pick',
      passed: true,
      nextLevel: 3,
    };

    const result = convertDualPickSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-pick');
    expect(result.totals.hits).toBe(22);
    expect(result.totals.misses).toBe(2);
  });

  it('should include dual label details', () => {
    const input: DualPickSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createDualPickSummary(),
      activeModalities: ['position', 'audio'],
      avgPlacementTimeMs: 950,
      confidenceScore: 91,
      directnessRatio: 0.9,
      wrongSlotDwellMs: 80,
      gameModeLabel: 'Dual Pick',
      passed: true,
      nextLevel: 2,
    };

    const result = convertDualPickSession(input);

    expect(result.modeDetails?.kind).toBe('dual-pick');
    if (result.modeDetails?.kind === 'dual-pick') {
      expect(result.modeDetails.correctDrops).toBe(22);
      expect(result.modeDetails.confidenceScore).toBe(91);
      expect(result.modeDetails.avgPlacementTimeMs).toBe(950);
    }
  });
});

// =============================================================================
// Trace Converter Tests
// =============================================================================

describe('convertTraceSession', () => {
  it('should convert a trace session to unified report format', () => {
    const input: TraceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTraceSummary(),
      activeModalities: ['position'],
      gameModeLabel: 'Dual Trace',
      passed: true,
      nextLevel: 3,
    };

    const result = convertTraceSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-trace');
    expect(result.byModality.position).toBeDefined();
    // @ts-expect-error test: nullable access
    expect(result!.byModality.position.hits).toBe(15);
  });

  it('should include trace details with rhythm mode', () => {
    const input: TraceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTraceSummary(),
      activeModalities: ['position'],
      gameModeLabel: 'Dual Trace',
      passed: true,
      nextLevel: 2,
      confidenceScore: 78,
    };

    const result = convertTraceSession(input);

    expect(result.modeDetails?.kind).toBe('trace');
    if (result.modeDetails?.kind === 'trace') {
      expect(result.modeDetails.rhythmMode).toBe('self-paced');
      expect(result.modeDetails.correctPositions).toBe(15);
      expect(result.modeDetails.timeouts).toBe(1);
      expect(result.modeDetails.confidenceScore).toBe(78);
    }
  });

  it('should handle writing modality when enabled', () => {
    const summaryWithWriting = createTraceSummary({
      responses: [
        {
          trialIndex: 0,
          isWarmup: false,
          responseType: 'swipe' as const,
          responseTimeMs: 800,
          isCorrect: true,
          // @ts-expect-error test override
          writingResult: {
            isCorrect: true,
            writingTimeMs: 1200,
            recognizedLetter: 'K',
            expectedLetter: 'K',
          },
        },
        {
          trialIndex: 1,
          isWarmup: false,
          responseType: 'double-tap' as const,
          responseTimeMs: 750,
          isCorrect: true,
          // @ts-expect-error test override
          writingResult: {
            isCorrect: false,
            writingTimeMs: 1500,
            recognizedLetter: 'H',
            expectedLetter: 'L',
          },
        },
      ],
    });

    const input: TraceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: summaryWithWriting,
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Trace',
      passed: true,
      nextLevel: 2,
    };

    const result = convertTraceSession(input);

    expect(result.byModality.audio).toBeDefined();
    expect(result.modeDetails?.kind).toBe('trace');
    if (result.modeDetails?.kind === 'trace') {
      expect(result.modeDetails.writingEnabled).toBe(true);
      expect(result.modeDetails.totalWritings).toBe(2);
      expect(result.modeDetails.correctWritings).toBe(1);
    }
  });
});

// =============================================================================
// Generic Converter Tests
// =============================================================================

describe('convertGenericSession', () => {
  it('should convert generic session input to report format', () => {
    const input: GenericSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      nLevel: 3,
      activeModalities: ['position', 'audio'],
      trialsCount: 25,
      durationMs: 70000,
      totals: {
        hits: 20,
        misses: 5,
        falseAlarms: 2,
        correctRejections: 18,
      },
      byModality: {
        position: {
          hits: 10,
          misses: 2,
          falseAlarms: 1,
          correctRejections: 9,
          avgRT: 400,
          dPrime: 2.2,
        },
        audio: {
          hits: 10,
          misses: 3,
          falseAlarms: 1,
          correctRejections: 9,
          avgRT: 420,
          dPrime: 2.0,
        },
      },
      unifiedAccuracy: 0.85,
      modeScoreValue: 2.1,
      modeScoreLabelKey: 'report.modeScore.dprime',
      modeScoreUnit: "d'",
      passed: true,
      nextLevel: 4,
      avgRT: 410,
    };

    const result = convertGenericSession(input);

    expect(result.sessionId).toBe('s1');
    expect(result.gameMode).toBe('dual-catch');
    expect(result.nLevel).toBe(3);
    expect(result.unifiedAccuracy).toBe(0.85);
    expect(result.modeScore.value).toBe(2.1);
    expect(result.speedStats?.valueMs).toBe(410);
  });

  it('should use appropriate speed label for different modes', () => {
    const baseInput: GenericSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      nLevel: 2,
      activeModalities: ['position'],
      trialsCount: 10,
      durationMs: 30000,
      totals: { hits: 8, misses: 2, falseAlarms: null, correctRejections: null },
      byModality: {},
      unifiedAccuracy: 0.8,
      modeScoreValue: 80,
      modeScoreLabelKey: 'report.modeScore.accuracy',
      modeScoreUnit: '%',
      avgRT: 1000,
    };

    const tempoResult = convertGenericSession(baseInput);
    // Speed label comes from spec - check it's the right i18n key
    expect(tempoResult.speedStats?.labelKey).toBe('report.speed.reactionTime');

    // Unknown modes fall back to default display spec
    const unknownResult = convertGenericSession({ ...baseInput, gameMode: 'unknown-mode' });
    expect(unknownResult.speedStats?.labelKey).toBe('report.speed.reactionTime');
  });
});

// =============================================================================
// Error Profile Tests
// =============================================================================

describe('Error Profile computation', () => {
  it('should compute error profile with miss and FA shares', () => {
    const input: TempoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createTempoSummary(),
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      activeModalities: ['position', 'audio'],
      passed: true,
      nextLevel: 2,
    };

    const result = convertTempoSession(input);

    expect(result.errorProfile.errorRate).toBeGreaterThanOrEqual(0);
    expect(result.errorProfile.errorRate).toBeLessThanOrEqual(1);
    expect(result.errorProfile.missShare).toBeGreaterThanOrEqual(0);
    expect(result.errorProfile.faShare).not.toBeNull();
  });

  it('should set faShare to null for modes without FA', () => {
    const input: MemoSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: createRecallSummary(),
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Memo',
      passed: true,
      nextLevel: 2,
    };

    const result = convertMemoSession(input);

    expect(result.errorProfile.faShare).toBeNull();
  });

  it('should handle zero errors correctly', () => {
    const perfectSummary = createPlaceSummary({
      finalStats: {
        totalDrops: 30,
        correctDrops: 30,
        errorCount: 0,
        accuracy: 1.0,
        turnsCompleted: 15,
      },
    });

    const input: PlaceSessionInput = {
      sessionId: 's1',
      createdAt: '2024-01-15T10:00:00Z',
      summary: perfectSummary,
      activeModalities: ['position', 'audio'],
      gameModeLabel: 'Dual Place',
      passed: true,
      nextLevel: 3,
    };

    const result = convertPlaceSession(input);

    expect(result.errorProfile.errorRate).toBe(0);
    expect(result.errorProfile.missShare).toBe(0);
  });
});
