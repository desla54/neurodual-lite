import { describe, expect, it } from 'bun:test';
import type { SessionEndReportModel } from '../../types/session-report';
import { runIndicatorPipeline } from './indicator-pipeline';

// =============================================================================
// Helpers
// =============================================================================

function baseDualClassic(overrides: Partial<SessionEndReportModel> = {}): SessionEndReportModel {
  return {
    sessionId: 's1',
    createdAt: '2026-02-27T00:00:00.000Z',
    reason: 'completed',
    gameMode: 'dualnback-classic',
    gameModeLabel: 'Dual & Back classique',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 10,
    durationMs: 1000,
    unifiedAccuracy: 0.5,
    ups: null,
    modeScore: { labelKey: 'x', value: 0, unit: '%' },
    passed: true,
    totals: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
    byModality: {
      position: {
        hits: 5,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 5,
        avgRT: null,
        dPrime: null,
      },
      audio: {
        hits: 5,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 5,
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

function baseBrainWorkshop(overrides: Partial<SessionEndReportModel> = {}): SessionEndReportModel {
  return baseDualClassic({
    gameMode: 'sim-brainworkshop' as any,
    gameModeLabel: 'Brain Workshop',
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
    } as any,
    ...overrides,
  });
}

function baseJourneyContext(overrides: Record<string, unknown> = {}) {
  return {
    stageId: 1,
    nextPlayableStage: 1,
    nLevel: 2,
    stageCompleted: false,
    nextStageUnlocked: null,
    journeyName: 'Dual Classic',
    stageMode: 'dualnback-classic',
    upsThreshold: 50,
    isValidating: false,
    validatingSessions: 0,
    sessionsRequired: 1,
    ...overrides,
  } as any;
}

function hybridJourneyContext(overrides: Record<string, unknown> = {}) {
  return baseJourneyContext({
    journeyName: 'Dual Track + Dual N-Back',
    journeyNameShort: 'Hybride DNB + Track',
    journeyGameMode: 'dual-track-dnb-hybrid',
    journeyProtocol: 'hybrid-jaeggi',
    sessionRole: 'decision-half',
    journeyDecision: 'pending-pair',
    stageMode: 'simulator',
    ...overrides,
  });
}

// =============================================================================
// Tests — runIndicatorPipeline
// =============================================================================

describe('runIndicatorPipeline', () => {
  // ---------------------------------------------------------------------------
  // Null returns (unsupported / missing data)
  // ---------------------------------------------------------------------------

  describe('null returns', () => {
    it('returns null for unsupported game modes (no indicator spec)', () => {
      const report = baseDualClassic({ gameMode: 'dual-place' as any });
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('returns null for dual-catch (no indicator)', () => {
      const report = baseDualClassic({ gameMode: 'dual-catch' as any });
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('returns null for free mode without nextStep', () => {
      const report = baseDualClassic({ nextStep: undefined });
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('returns null for journey scope without journeyContext', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: undefined,
        journeyStageId: 4,
      });
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('returns null when journeyContext is null in journey scope', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: undefined,
      });
      expect(runIndicatorPipeline(report)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Scope derivation
  // ---------------------------------------------------------------------------

  describe('scope derivation', () => {
    it('derives scope=free from playContext=free', () => {
      const report = baseDualClassic({ playContext: 'free' });
      const model = runIndicatorPipeline(report)!;
      expect(model.scope).toBe('free');
    });

    it('derives scope=journey from playContext=journey', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext(),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.scope).toBe('journey');
    });

    it('derives scope=journey from journeyContext presence (no explicit playContext)', () => {
      const report = baseDualClassic({
        playContext: undefined,
        journeyContext: baseJourneyContext(),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.scope).toBe('journey');
    });

    it('derives scope=journey from journeyId string (no journeyContext)', () => {
      const report = baseDualClassic({
        playContext: undefined,
        journeyContext: undefined,
        journeyId: 'some-journey',
      } as any);
      // Journey scope but no journeyContext => null
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('derives scope=journey from journeyStageId number (no journeyContext)', () => {
      const report = baseDualClassic({
        playContext: undefined,
        journeyContext: undefined,
        journeyStageId: 3,
      } as any);
      expect(runIndicatorPipeline(report)).toBeNull();
    });

    it('derives scope=free when no journey markers present', () => {
      const report = baseDualClassic({
        playContext: undefined,
        journeyContext: undefined,
        journeyId: undefined,
        journeyStageId: undefined,
      } as any);
      const model = runIndicatorPipeline(report)!;
      expect(model.scope).toBe('free');
    });
  });

  // ---------------------------------------------------------------------------
  // Tone derivation — Free path
  // ---------------------------------------------------------------------------

  describe('tone derivation — free path', () => {
    it('tone=up when nextStep direction=up', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('up');
    });

    it('tone=stay when nextStep direction=same', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('tone=down when nextStep direction=down', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 2, direction: 'down' },
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('down');
    });
  });

  // ---------------------------------------------------------------------------
  // Tone derivation — Journey path (raw)
  // ---------------------------------------------------------------------------

  describe('tone derivation — journey path', () => {
    it('tone=up when journeyDecision=up', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'up',
          nextPlayableStage: 2,
          stageCompleted: true,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('up');
    });

    it('tone=down when journeyDecision=down', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        nLevel: 3,
        journeyContext: baseJourneyContext({
          stageId: 2,
          journeyDecision: 'down',
          nextPlayableStage: 1,
          nLevel: 3,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('down');
    });

    it('tone=stay when journeyDecision=stay', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'stay',
          nextPlayableStage: 1,
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('tone derived from nextPlayableStage when no journeyDecision', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 3,
          stageCompleted: true,
          nextStageUnlocked: 3,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('up');
    });

    it('tone=down from nextPlayableStage < stageId', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        nLevel: 3,
        journeyContext: baseJourneyContext({
          stageId: 3,
          nextPlayableStage: 2,
          nLevel: 3,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('down');
    });

    it('tone=stay from nextPlayableStage == stageId', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 2,
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('pending-pair decision falls through to nextPlayableStage comparison', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          nextPlayableStage: 1,
          journeyDecision: 'pending-pair',
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });
  });

  // ---------------------------------------------------------------------------
  // Floor regression
  // ---------------------------------------------------------------------------

  describe('floor regression', () => {
    it('triggers Jaeggi floor regression when stay + suggestedStartLevel < currentLevel + down zone', () => {
      const report = baseDualClassic({
        nLevel: 3,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 2,
          nLevel: 3,
          suggestedStartLevel: 1,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 4,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      // position has 7 errors => down zone => floor regression triggers
      expect(model.tone).toBe('down');
    });

    it('does not trigger floor regression when currentLevel=1', () => {
      const report = baseDualClassic({
        nLevel: 1,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          nextPlayableStage: 1,
          nLevel: 1,
          suggestedStartLevel: 1,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 4,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('does not trigger floor regression when suggestedStartLevel >= currentLevel', () => {
      const report = baseDualClassic({
        nLevel: 2,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          nextPlayableStage: 1,
          nLevel: 2,
          suggestedStartLevel: 2,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 4,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('does not trigger Jaeggi floor regression when no modality is in down zone', () => {
      // 4 errors on position => stay zone, not down (down is > 5)
      const report = baseDualClassic({
        nLevel: 3,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 2,
          nLevel: 3,
          suggestedStartLevel: 1,
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('stay');
    });

    it('triggers BW floor regression when strikesBefore=2, strikesAfter=0, score < downPercent', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          nextPlayableStage: 1,
          nLevel: 2,
          suggestedStartLevel: 1,
          stageMode: 'sim-brainworkshop',
          journeyName: 'Brain Workshop',
        }),
        brainWorkshop: { strikesBefore: 2, strikesAfter: 0, strikesToDown: 3 } as any,
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
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('down');
    });

    it('does not trigger floor regression when tone is already up', () => {
      const report = baseDualClassic({
        nLevel: 2,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          nextPlayableStage: 2,
          nLevel: 2,
          suggestedStartLevel: 1,
          journeyDecision: 'up',
          stageCompleted: true,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('up');
    });
  });

  // ---------------------------------------------------------------------------
  // Target level resolution
  // ---------------------------------------------------------------------------

  describe('target level resolution', () => {
    it('targetLevel = currentLevel + 1 when tone=up', () => {
      const report = baseDualClassic({
        nLevel: 2,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'up',
          stageCompleted: true,
          nextPlayableStage: 2,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.targetLevel).toBe(3);
    });

    it('targetLevel = currentLevel - 1 when tone=down (no floor regression)', () => {
      const report = baseDualClassic({
        nLevel: 3,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          journeyDecision: 'down',
          nextPlayableStage: 1,
          nLevel: 3,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.targetLevel).toBe(2);
    });

    it('targetLevel clamped to 1 when tone=down at level 1', () => {
      const report = baseDualClassic({
        nLevel: 1,
        nextStep: { nextLevel: 1, direction: 'down' },
        byModality: {
          position: {
            hits: 1,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 1,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.targetLevel).toBe(1);
      expect(model.currentLevel).toBe(1);
    });

    it('targetLevel = currentLevel when tone=stay (free)', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 3, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.targetLevel).toBe(3);
    });

    it('targetLevel uses suggestedStartLevel min when floor regression triggered', () => {
      const report = baseDualClassic({
        nLevel: 3,
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 2,
          nLevel: 3,
          suggestedStartLevel: 1,
        }),
        byModality: {
          position: {
            hits: 1,
            misses: 5,
            falseAlarms: 3,
            correctRejections: 1,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('down');
      // min(currentLevel - 1, suggestedStartLevel) = min(2, 1) = 1
      expect(model.targetLevel).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Headline resolution
  // ---------------------------------------------------------------------------

  describe('headline resolution', () => {
    it('headline=up when tone=up', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.headline).toBe('up');
    });

    it('headline=down when tone=down', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 2, direction: 'down' },
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.headline).toBe('down');
    });

    it('headline=strike when tone=stay and BW strike present', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 0, strikesAfter: 1, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 2,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.headline).toBe('strike');
      expect(model.strike).toEqual({ current: 1, total: 3 });
    });

    it('headline=stay when tone=stay and no strike', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 3, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.headline).toBe('stay');
    });
  });

  // ---------------------------------------------------------------------------
  // Strike extraction
  // ---------------------------------------------------------------------------

  describe('strike extraction', () => {
    it('no strike for Jaeggi protocol (strikes=null)', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 0, strikesAfter: 1, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.strike).toBeUndefined();
    });

    it('strike extracted for BW with strikesAfter > 0', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 1, strikesAfter: 2, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 2,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.strike).toEqual({ current: 2, total: 3 });
    });

    it('no strike when strikesAfter=0', () => {
      const report = baseBrainWorkshop({
        nLevel: 3,
        nextStep: { nextLevel: 2, direction: 'down' },
        brainWorkshop: { strikesBefore: 2, strikesAfter: 0, strikesToDown: 3 } as any,
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
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.strike).toBeUndefined();
    });

    it('no strike when brainWorkshop data is missing', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: undefined as any,
        byModality: {
          position: {
            hits: 3,
            misses: 1,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.strike).toBeUndefined();
    });

    it('strike current is clamped to max 2', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 2, strikesAfter: 5, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 2,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.strike!.current).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Message kind resolution
  // ---------------------------------------------------------------------------

  describe('message kind resolution', () => {
    it('free-up for free Jaeggi up', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('free-up');
    });

    it('free-stay for free Jaeggi stay', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 3, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('free-stay');
    });

    it('free-down for free Jaeggi down', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 2, direction: 'down' },
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('free-down');
    });

    it('bw-up for free BW up', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('bw-up');
    });

    it('bw-strike-1 for BW first strike', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 0, strikesAfter: 1, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 2,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('bw-strike-1');
    });

    it('bw-strike-2 for BW second strike', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'same' },
        brainWorkshop: { strikesBefore: 1, strikesAfter: 2, strikesToDown: 3 } as any,
        byModality: {
          position: {
            hits: 2,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 2,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 0,
            avgRT: null,
            dPrime: null,
          },
        } as any,
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('bw-strike-2');
    });

    it('journey-completed overrides all other message kinds', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 5,
          nextPlayableStage: null,
          nLevel: 5,
          stageCompleted: true,
          nextStageUnlocked: null,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('journey-completed');
    });

    it('jaeggi-up for journey Jaeggi up', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'up',
          stageCompleted: true,
          nextPlayableStage: 2,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('jaeggi-up');
    });

    it('jaeggi-stay for journey Jaeggi stay', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'stay',
          nextPlayableStage: 1,
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('jaeggi-stay');
    });

    it('jaeggi-down for journey Jaeggi down', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        nLevel: 3,
        journeyContext: baseJourneyContext({
          stageId: 2,
          journeyDecision: 'down',
          nextPlayableStage: 1,
          nLevel: 3,
        }),
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('jaeggi-down');
    });
  });

  // ---------------------------------------------------------------------------
  // Free actions
  // ---------------------------------------------------------------------------

  describe('free actions', () => {
    it('up: primary=play_at_level(next), secondary=[replay_current_level]', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'play_at_level', level: 3 });
      expect(model.secondaryActions).toHaveLength(1);
      expect(model.secondaryActions[0]).toEqual({ kind: 'replay_current_level', level: 2 });
    });

    it('down: primary=play_at_level(down), secondary=[replay_current_level]', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 2, direction: 'down' },
        byModality: {
          position: {
            hits: 2,
            misses: 3,
            falseAlarms: 3,
            correctRejections: 2,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'play_at_level', level: 2 });
      expect(model.secondaryActions).toHaveLength(1);
    });

    it('stay: primary=replay_current_level, secondary includes down and up', () => {
      const report = baseDualClassic({
        nLevel: 3,
        nextStep: { nextLevel: 3, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'replay_current_level', level: 3 });
      const totalActions = 1 + model.secondaryActions.length;
      expect(totalActions).toBe(3);
    });

    it('stay at level 1: no level-0 secondary action', () => {
      const report = baseDualClassic({
        nLevel: 1,
        nextStep: { nextLevel: 1, direction: 'same' },
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'replay_current_level', level: 1 });
      // Only replay(1) + play(2), no play(0)
      const totalActions = 1 + model.secondaryActions.length;
      expect(totalActions).toBe(2);
    });

    it('deduplicates actions when nextLevel == currentLevel', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 2, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      // play_at_level(2) would duplicate replay_current_level(2) => deduped
      const allLevels = [model.primaryAction, ...model.secondaryActions].map((a) =>
        a.kind === 'back_to_home' ? 'home' : `${a.kind}:${a.level}`,
      );
      const unique = new Set(allLevels);
      expect(unique.size).toBe(allLevels.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Journey actions
  // ---------------------------------------------------------------------------

  describe('journey actions', () => {
    it('journey up: primary=journey_go_to_stage(next)', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 1,
          journeyDecision: 'up',
          nextPlayableStage: 2,
          stageCompleted: true,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'journey_go_to_stage', stageId: 2, level: 3 });
      expect(model.secondaryActions).toHaveLength(0);
    });

    it('journey completed: primary=back_to_home', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 5,
          nextPlayableStage: null,
          nLevel: 5,
          stageCompleted: true,
          nextStageUnlocked: null,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({ kind: 'back_to_home' });
      expect(model.secondaryActions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Journey completion states
  // ---------------------------------------------------------------------------

  describe('journey completion states', () => {
    it('journey-completed when nextPlayableStage is null', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 5,
          nextPlayableStage: null,
          stageCompleted: true,
          nextStageUnlocked: null,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.journeyCompletion).toBe('journey-completed');
    });

    it('stage-completed when stageCompleted=true and nextPlayableStage exists', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 3,
          stageCompleted: true,
          nextStageUnlocked: 3,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.journeyCompletion).toBe('stage-completed');
    });

    it('in-progress when stage not completed', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 2,
          nextPlayableStage: 2,
          stageCompleted: false,
        }),
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 5,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 5,
            avgRT: null,
            dPrime: null,
          },
        },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.journeyCompletion).toBe('in-progress');
    });
  });

  // ---------------------------------------------------------------------------
  // Explanation building
  // ---------------------------------------------------------------------------

  describe('explanation building', () => {
    it('jaeggi explanation includes errorsByModality, maxErrors, thresholds', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.explanation.protocol).toBe('jaeggi');
      if (model.explanation.protocol === 'jaeggi') {
        expect(model.explanation.errorsByModality).toHaveLength(2);
        expect(model.explanation.thresholdUp).toBe(3);
        expect(model.explanation.thresholdDown).toBe(5);
      }
    });

    it('brainworkshop explanation includes scorePercent, thresholds, strikes', () => {
      const report = baseBrainWorkshop({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.explanation.protocol).toBe('brainworkshop');
      if (model.explanation.protocol === 'brainworkshop') {
        expect(model.explanation.upPercent).toBe(80);
        expect(model.explanation.downPercent).toBe(50);
        expect(typeof model.explanation.scorePercent).toBe('number');
      }
    });

    it('accuracy explanation for dual-trace (free)', () => {
      const report = baseDualClassic({
        gameMode: 'dual-trace' as any,
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
        byModality: {
          position: {
            hits: 8,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 1,
            avgRT: null,
            dPrime: null,
          },
        } as any,
        activeModalities: ['position'],
      });
      const model = runIndicatorPipeline(report)!;
      expect(model).not.toBeNull();
      expect(model.explanation.protocol).toBe('accuracy');
      if (model.explanation.protocol === 'accuracy') {
        expect(model.explanation.accuracyPercent).toBe(90);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Hybrid journey post-processing
  // ---------------------------------------------------------------------------

  describe('hybrid journey post-processing', () => {
    it('overrides journeyDecision from jaeggi errors when context is stale', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        byModality: {
          position: {
            hits: 6,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 6,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 1,
            falseAlarms: 1,
            correctRejections: 6,
            avgRT: null,
            dPrime: null,
          },
        } as any,
        journeyContext: hybridJourneyContext({
          stageId: 1,
          nextPlayableStage: 1,
          journeyDecision: 'stay',
          stageCompleted: false,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      // maxErrors = 2 (audio) which is < thresholdUp(3) => up override
      expect(model.journeyDecision).toBe('up');
      expect(model.tone).toBe('up');
    });

    it('validation-progress display when decisionZone=clean', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'clean',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.hybridJourneyDisplay).toEqual({
        kind: 'validation-progress',
        current: 1,
        total: 2,
      });
      expect(model.tone).toBe('up');
      expect(model.messageKind).toBe('hybrid-validation-progress');
    });

    it('failure-progress display when decisionZone=down', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        byModality: {
          position: {
            hits: 4,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 6,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 4,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 6,
            avgRT: null,
            dPrime: null,
          },
        } as any,
        journeyContext: hybridJourneyContext({
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'down',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.hybridJourneyDisplay).toEqual({
        kind: 'failure-progress',
        current: 1,
        total: 2,
      });
      expect(model.tone).toBe('down');
      expect(model.messageKind).toBe('hybrid-failure-progress');
    });

    it('track-progress display when loopPhase=track', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'track',
            trackSessionsCompleted: 0,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 3,
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.hybridJourneyDisplay).toEqual({
        kind: 'track-progress',
        current: 0,
        total: 1,
      });
      expect(model.messageKind).toBe('hybrid-track-progress');
    });

    it('stay-progress display when dnb loop continues with no decision zone', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 2,
            dnbSessionsRequired: 3,
            decisionZone: 'stay',
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.hybridJourneyDisplay).toEqual({
        kind: 'stay-progress',
        current: 2,
        total: 3,
      });
      expect(model.messageKind).toBe('hybrid-stay-progress');
    });

    it('pending-pair messageKind when track-half with no hybridProgress', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        byModality: {
          position: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
          audio: {
            hits: 3,
            misses: 2,
            falseAlarms: 2,
            correctRejections: 3,
            avgRT: null,
            dPrime: null,
          },
        },
        journeyContext: hybridJourneyContext({
          sessionRole: 'track-half',
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.messageKind).toBe('hybrid-track-progress');
    });

    it('hybrid progress phase keeps targetLevel=currentLevel', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'clean',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      // validation-progress => isHybridProgressPhase => targetLevel stays at currentLevel
      expect(model.targetLevel).toBe(model.currentLevel);
    });

    it('hybrid progress phase sets primary action to same stage', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          stageId: 3,
          journeyDecision: 'pending-pair',
          nextSessionGameMode: 'dualnback-classic',
          hybridProgress: {
            loopPhase: 'track',
            trackSessionsCompleted: 0,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 3,
          },
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.primaryAction).toEqual({
        kind: 'journey_go_to_stage',
        stageId: 3,
        level: 2,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Journey display name
  // ---------------------------------------------------------------------------

  describe('journey display name', () => {
    it('uses journeyNameShort when available', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: hybridJourneyContext({
          journeyDecision: 'up',
          stageCompleted: true,
          nextPlayableStage: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.journeyDisplayName).toBe('Hybride DNB + Track');
    });

    it('uses journeyName when journeyNameShort not present', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyName: 'Dual Classic',
          journeyDecision: 'up',
          stageCompleted: true,
          nextPlayableStage: 2,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.journeyDisplayName).toBe('Dual Classic');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases — clampInt
  // ---------------------------------------------------------------------------

  describe('clampInt edge cases', () => {
    it('handles NaN nLevel by falling back to 1', () => {
      const report = baseDualClassic({
        nLevel: NaN as any,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.currentLevel).toBe(1);
    });

    it('handles non-finite nLevel by falling back to 1', () => {
      const report = baseDualClassic({
        nLevel: Infinity as any,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.currentLevel).toBe(1);
    });

    it('rounds fractional nLevel', () => {
      const report = baseDualClassic({
        nLevel: 2.7,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.currentLevel).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Model shape
  // ---------------------------------------------------------------------------

  describe('model shape', () => {
    it('free model includes expected fields', () => {
      const report = baseDualClassic({
        nLevel: 2,
        nextStep: { nextLevel: 3, direction: 'up' },
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.kind).toBe('progression-indicator');
      expect(model.scope).toBe('free');
      expect(model.gameMode).toBe('dualnback-classic');
      expect(typeof model.currentLevel).toBe('number');
      expect(typeof model.tone).toBe('string');
      expect(typeof model.headline).toBe('string');
      expect(typeof model.messageKind).toBe('string');
      expect(model.explanation).toBeDefined();
      expect(typeof model.targetLevel).toBe('number');
      expect(model.primaryAction).toBeDefined();
      expect(Array.isArray(model.secondaryActions)).toBe(true);
    });

    it('journey model includes journey-specific fields', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          journeyDecision: 'up',
          stageCompleted: true,
          nextPlayableStage: 2,
          nextStageUnlocked: 2,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.scope).toBe('journey');
      expect(model.journeyCompletion).toBeDefined();
      expect(model.journeyDisplayName).toBeDefined();
    });

    it('journey completed model has tone=up and no hybrid displays', () => {
      const report = baseDualClassic({
        playContext: 'journey',
        journeyContext: baseJourneyContext({
          stageId: 5,
          nextPlayableStage: null,
          stageCompleted: true,
          nextStageUnlocked: null,
        }),
      });
      const model = runIndicatorPipeline(report)!;
      expect(model.tone).toBe('up');
      expect(model.headline).toBe('up');
      expect(model.journeyCompletion).toBe('journey-completed');
      expect(model.targetLevel).toBe(model.currentLevel);
    });
  });
});
