import { describe, expect, it } from 'bun:test';
import type { SessionEndReportModel } from '../../types/session-report';
import { computeProgressionIndicatorModel } from './progression-indicator';

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

// =============================================================================
// Tests
// =============================================================================

describe('computeProgressionIndicatorModel', () => {
  // -------------------------------------------------------------------------
  // Basic
  // -------------------------------------------------------------------------

  it('returns null for unsupported modes', () => {
    const report = baseDualClassic({ gameMode: 'dual-place' as any });
    expect(computeProgressionIndicatorModel(report)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Jaeggi Free
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // messageKind
  // -------------------------------------------------------------------------

  it('messageKind: free-up for free Jaeggi up', () => {
    const report = baseDualClassic({
      nLevel: 2,
      nextStep: { nextLevel: 3, direction: 'up' },
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('free-up');
  });

  it('messageKind: free-stay for free Jaeggi stay', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('free-stay');
  });

  it('messageKind: free-down for free Jaeggi down', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('free-down');
  });

  it('messageKind: bw-up for free BW up', () => {
    const report = baseBrainWorkshop({
      nLevel: 2,
      nextStep: { nextLevel: 3, direction: 'up' },
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('bw-up');
  });

  it('messageKind: bw-strike-1 for BW first strike', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('bw-strike-1');
  });

  it('messageKind: bw-strike-2 for BW second strike', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('bw-strike-2');
  });

  it('messageKind: bw-down for BW terminal down', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('bw-down');
  });

  it('messageKind: journey-completed for completed journey', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 5,
        nextPlayableStage: null,
        nLevel: 5,
        stageCompleted: true,
        nextStageUnlocked: null,
        journeyName: 'Dual Classic',
        stageMode: 'dualnback-classic',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('journey-completed');
  });

  it('messageKind: jaeggi-up for journey Jaeggi up', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 2,
        nLevel: 2,
        stageCompleted: true,
        nextStageUnlocked: 2,
        journeyName: 'Dual Classic',
        stageMode: 'dualnback-classic',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('jaeggi-up');
  });

  it('messageKind: hybrid-up-decision for hybrid journey up', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nLevel: 2,
        stageCompleted: true,
        nextStageUnlocked: 2,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'up',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('hybrid-up-decision');
  });

  it('messageKind: hybrid-validation-progress for hybrid validation phase', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 2,
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
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('hybrid-validation-progress');
  });

  it('messageKind: hybrid-track-progress for hybrid track-half waiting for DNB', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'track-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.messageKind).toBe('hybrid-track-progress');
  });

  // -------------------------------------------------------------------------

  it('Jaeggi up (0 errors): tone=up, explanation.protocol=jaeggi, zones=up, 2 CTAs', () => {
    const report = baseDualClassic({
      nLevel: 2,
      nextStep: { nextLevel: 3, direction: 'up' },
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
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('up');
    expect(model.headline).toBe('up');
    expect(model.scope).toBe('free');
    expect(model.explanation.protocol).toBe('jaeggi');
    if (model.explanation.protocol === 'jaeggi') {
      expect(model.explanation.errorsByModality).toHaveLength(2);
      for (const info of model.explanation.errorsByModality) {
        expect(info.errors).toBe(0);
        expect(info.zone).toBe('up');
      }
      expect(model.explanation.maxErrors).toBe(0);
      expect(model.explanation.thresholdUp).toBe(3);
      expect(model.explanation.thresholdDown).toBe(5);
    }
    expect(model.targetLevel).toBe(3);
    // 2 CTAs: primary (play_at_level 3) + secondary (replay_current_level 2)
    expect(model.secondaryActions).toHaveLength(1);
  });

  it('Jaeggi stay (4 errors on one modality): tone=stay, zone=stay, 3 CTAs', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('stay');
    expect(model.headline).toBe('stay');
    if (model.explanation.protocol === 'jaeggi') {
      const posInfo = model.explanation.errorsByModality.find((m) => m.modalityId === 'position')!;
      expect(posInfo.errors).toBe(4);
      expect(posInfo.zone).toBe('stay');
      const audInfo = model.explanation.errorsByModality.find((m) => m.modalityId === 'audio')!;
      expect(audInfo.errors).toBe(0);
      expect(audInfo.zone).toBe('up');
    }
    expect(model.targetLevel).toBe(3);
    // 3 CTAs: replay N-3, play N-2, play N-4
    const totalActions = 1 + model.secondaryActions.length;
    expect(totalActions).toBe(3);
  });

  it('Jaeggi stay (5 errors on one modality): zone=stay (not down)', () => {
    const report = baseDualClassic({
      nLevel: 3,
      nextStep: { nextLevel: 3, direction: 'same' },
      byModality: {
        position: {
          hits: 3,
          misses: 3,
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('stay');
    expect(model.headline).toBe('stay');
    if (model.explanation.protocol === 'jaeggi') {
      const posInfo = model.explanation.errorsByModality.find((m) => m.modalityId === 'position')!;
      expect(posInfo.errors).toBe(5);
      expect(posInfo.zone).toBe('stay');
      expect(model.explanation.maxErrors).toBe(5);
    }
  });

  it('Jaeggi down (6 errors): tone=down, zone=down, maxErrors=6, 2 CTAs', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('down');
    expect(model.headline).toBe('down');
    if (model.explanation.protocol === 'jaeggi') {
      const posInfo = model.explanation.errorsByModality.find((m) => m.modalityId === 'position')!;
      expect(posInfo.errors).toBe(6);
      expect(posInfo.zone).toBe('down');
      expect(model.explanation.maxErrors).toBe(6);
    }
    expect(model.targetLevel).toBe(2);
    // 2 CTAs: primary (play_at_level 2) + secondary (replay_current_level 3)
    expect(model.secondaryActions).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // BrainWorkshop Free
  // -------------------------------------------------------------------------

  it('BW up (score=80%): tone=up, scorePercent=80', () => {
    // 16 hits, 2 misses, 2 FA -> 16/(16+2+2) = 16/20 = 80%
    const report = baseBrainWorkshop({
      nLevel: 2,
      nextStep: { nextLevel: 3, direction: 'up' },
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
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('up');
    if (model.explanation.protocol === 'brainworkshop') {
      expect(model.explanation.scorePercent).toBe(80);
      expect(model.explanation.upPercent).toBe(80);
      expect(model.explanation.downPercent).toBe(50);
    }
  });

  it('BW strike 1/3: tone=stay, headline=strike, scorePercent<50, 3 CTAs', () => {
    // 4 hits, 3 misses, 3 FA -> 4/(4+3+3) = 4/10 = 40%
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('stay');
    expect(model.headline).toBe('strike');
    expect(model.strike).toEqual({ current: 1, total: 3 });
    if (model.explanation.protocol === 'brainworkshop') {
      expect(model.explanation.scorePercent).toBe(40);
      expect(model.explanation.strikesAfter).toBe(1);
      expect(model.explanation.strikesToDown).toBe(3);
    }
    const totalActions = 1 + model.secondaryActions.length;
    expect(totalActions).toBe(3);
  });

  it('BW terminal (3/3 -> down): tone=down, headline=down, 2 CTAs', () => {
    // strikesAfter is clamped to 2 max (3rd strike triggers down direction)
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('down');
    expect(model.headline).toBe('down');
    // No strike on the model (strikesAfter=0 after the terminal down)
    expect(model.strike).toBeUndefined();
    expect(model.targetLevel).toBe(2);
    expect(model.secondaryActions).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Journey Jaeggi
  // -------------------------------------------------------------------------

  it('Journey Jaeggi up: tone=up, journeyCompletion=stage-completed, 1 CTA', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 2,
        nLevel: 2,
        stageCompleted: true,
        nextStageUnlocked: 2,
        journeyName: 'Dual Classic',
        stageMode: 'dualnback-classic',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.scope).toBe('journey');
    expect(model.tone).toBe('up');
    expect(model.journeyCompletion).toBe('stage-completed');
    expect(model.explanation.protocol).toBe('jaeggi');
    expect(model.secondaryActions).toHaveLength(0);
    // Only 1 CTA (primary)
  });

  it('Journey hybrid DNB + Track uses the explicit hybrid decision for report guidance', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nLevel: 2,
        stageCompleted: true,
        nextStageUnlocked: 2,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'up',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.scope).toBe('journey');
    expect(model.tone).toBe('up');
    expect(model.headline).toBe('up');
    expect(model.targetLevel).toBe(3);
    expect(model.journeyProtocol).toBe('hybrid-jaeggi');
    expect(model.journeySessionRole).toBe('decision-half');
    expect(model.journeyDecision).toBe('up');
    expect(model.journeyDisplayName).toBe('Hybride DNB + Track');
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 2,
      level: 3,
    });
  });

  it('Journey hybrid DNB + Track can stay even if nextPlayableStage is noisy', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      byModality: {
        position: {
          hits: 5,
          misses: 2,
          falseAlarms: 2,
          correctRejections: 6,
          avgRT: null,
          dPrime: null,
        },
        audio: {
          hits: 5,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 6,
          avgRT: null,
          dPrime: null,
        },
      } as any,
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 2,
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'stay',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('stay');
    expect(model.headline).toBe('stay');
    expect(model.targetLevel).toBe(2);
    expect(model.journeyProtocol).toBe('hybrid-jaeggi');
    expect(model.journeyDecision).toBe('stay');
  });

  it('Journey hybrid DNB + Track keeps a pending-pair state while another DNB session is still required', () => {
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
          falseAlarms: 0,
          correctRejections: 6,
          avgRT: null,
          dPrime: null,
        },
      } as any,
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 2,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.tone).toBe('stay');
    expect(model.journeyDecision).toBe('pending-pair');
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 2,
    });
  });

  it('Journey hybrid DNB + Track exposes a green validation-progress state before the level-up decision', () => {
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
          falseAlarms: 0,
          correctRejections: 6,
          avgRT: null,
          dPrime: null,
        },
      } as any,
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 2,
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
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.tone).toBe('up');
    expect(model.hybridJourneyDisplay).toEqual({
      kind: 'validation-progress',
      current: 1,
      total: 2,
    });
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 2,
    });
  });

  it('Journey hybrid DNB + Track exposes a yellow stay-progress state while the DNB loop continues', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 2,
          dnbSessionsRequired: 3,
          decisionZone: 'stay',
        },
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.tone).toBe('stay');
    expect(model.hybridJourneyDisplay).toEqual({
      kind: 'stay-progress',
      current: 2,
      total: 3,
    });
  });

  it('Journey hybrid DNB + Track exposes a red failure-progress state before the level-down decision', () => {
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
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nextSessionGameMode: 'dualnback-classic',
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'pending-pair',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
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
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.tone).toBe('down');
    expect(model.hybridJourneyDisplay).toEqual({
      kind: 'failure-progress',
      current: 1,
      total: 2,
    });
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 2,
    });
  });

  it('Journey hybrid DNB + Track trusts visible Jaeggi errors over a stale context decision', () => {
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
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Dual Track + Dual N-Back',
        journeyNameShort: 'Hybride DNB + Track',
        journeyGameMode: 'dual-track-dnb-hybrid',
        journeyProtocol: 'hybrid-jaeggi',
        sessionRole: 'decision-half',
        journeyDecision: 'stay',
        stageMode: 'simulator',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model.tone).toBe('up');
    expect(model.journeyDecision).toBe('up');
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 2,
      level: 3,
    });
  });

  // -------------------------------------------------------------------------
  // Journey BW Strike
  // -------------------------------------------------------------------------

  it('Journey BW strike: headline=strike, strike={2,3}, 1 CTA', () => {
    const report = baseBrainWorkshop({
      playContext: 'journey',
      journeyContext: {
        stageId: 3,
        nextPlayableStage: 3,
        nLevel: 3,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Brain Workshop',
        stageMode: 'sim-brainworkshop',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
      } as any,
      brainWorkshop: { strikesBefore: 1, strikesAfter: 2, strikesToDown: 3 } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.scope).toBe('journey');
    expect(model.headline).toBe('strike');
    expect(model.strike).toEqual({ current: 2, total: 3 });
    expect(model.journeyCompletion).toBe('in-progress');
    expect(model.secondaryActions).toHaveLength(0);
  });

  it('Journey BW terminal down at startLevel floor: tone=down even when nextPlayableStage stays at stageId=1', () => {
    // This models the "3rd strike" regression below the configured startLevel, where the journey projector
    // clamps nextPlayableStage to 1 and exposes the expansion via suggestedStartLevel.
    const report = baseBrainWorkshop({
      nLevel: 2,
      playContext: 'journey',
      journeyContext: {
        stageId: 1,
        nextPlayableStage: 1,
        nLevel: 2,
        stageCompleted: false,
        nextStageUnlocked: null,
        journeyName: 'Brain Workshop',
        stageMode: 'sim-brainworkshop',
        upsThreshold: 50,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
        suggestedStartLevel: 1,
      } as any,
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.scope).toBe('journey');
    expect(model.tone).toBe('down');
    expect(model.headline).toBe('down');
    expect(model.targetLevel).toBe(1);
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 1,
    });
    expect(model.suggestedStartLevel).toBe(1);
  });

  it('Journey Dual Classic down below startLevel floor: tone=down when suggestedStartLevel exposes N=1', () => {
    const report = baseDualClassic({
      nLevel: 2,
      playContext: 'journey',
      journeyContext: {
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
        suggestedStartLevel: 1,
      } as any,
      byModality: {
        position: {
          hits: 3,
          misses: 4,
          falseAlarms: 3,
          correctRejections: 10,
          avgRT: null,
          dPrime: null,
        },
        audio: {
          hits: 4,
          misses: 3,
          falseAlarms: 3,
          correctRejections: 10,
          avgRT: null,
          dPrime: null,
        },
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.scope).toBe('journey');
    expect(model.tone).toBe('down');
    expect(model.headline).toBe('down');
    expect(model.targetLevel).toBe(1);
    expect(model.primaryAction).toEqual({
      kind: 'journey_go_to_stage',
      stageId: 1,
      level: 1,
    });
    expect(model.suggestedStartLevel).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Journey Completed
  // -------------------------------------------------------------------------

  it('Journey completed: journeyCompletion=journey-completed, tone=up', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: {
        stageId: 5,
        nextPlayableStage: null,
        nLevel: 5,
        stageCompleted: true,
        nextStageUnlocked: null,
        journeyName: 'Dual Classic',
        stageMode: 'dualnback-classic',
        upsThreshold: 50,
        isValidating: true,
        validatingSessions: 1,
        sessionsRequired: 1,
      } as any,
    });
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.journeyCompletion).toBe('journey-completed');
    expect(model.tone).toBe('up');
    expect(model.scope).toBe('journey');
  });

  it('Journey scope without journeyContext returns null (cannot determine decision)', () => {
    const report = baseDualClassic({
      playContext: 'journey',
      journeyContext: undefined,
      journeyStageId: 4,
    });
    const model = computeProgressionIndicatorModel(report);
    expect(model).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  it('Edge: N=1 down keeps targetLevel=1', () => {
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('down');
    expect(model.targetLevel).toBe(1);
    expect(model.currentLevel).toBe(1);
  });

  it('Edge: BW score=50 -> tone=stay (no strike)', () => {
    // 5 hits, 3 misses, 2 FA -> 5/(5+3+2) = 5/10 = 50%
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
    const model = computeProgressionIndicatorModel(report)!;
    expect(model).not.toBeNull();
    expect(model.tone).toBe('stay');
    // No brainWorkshop data means no strike
    expect(model.headline).toBe('stay');
    expect(model.strike).toBeUndefined();
    if (model.explanation.protocol === 'brainworkshop') {
      expect(model.explanation.scorePercent).toBe(50);
    }
  });
});
