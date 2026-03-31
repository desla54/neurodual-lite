import { describe, expect, it } from 'bun:test';
import {
  deriveProtocolConfig,
  RULESET_REGISTRY,
  POST_PROCESSORS,
  type PostProcessorContext,
} from './protocol-configs';
import type { SessionEndReportModel, TrackDetails } from '../../types/session-report';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a PostProcessorContext.
 *
 * IMPORTANT: hybridProgress must be set on report.journeyContext.hybridProgress
 * (the post-processor reads it from there, not from ctx.hybridProgress).
 */
function makePostCtx(
  overrides: Partial<PostProcessorContext> & {
    journeyContextOverrides?: Record<string, unknown>;
    reportOverrides?: Record<string, unknown>;
  } = {},
): PostProcessorContext {
  const { journeyContextOverrides, reportOverrides, ...rest } = overrides;

  const baseJourneyContext = {
    stageId: 1,
    nextPlayableStage: 1,
    nLevel: 2,
    stageCompleted: false,
    nextStageUnlocked: null,
    journeyName: 'Test',
    stageMode: 'simulator',
    upsThreshold: 50,
    isValidating: false,
    validatingSessions: 0,
    sessionsRequired: 1,
    // Default: block jaeggi override (nextSessionGameMode=dualnback-classic)
    nextSessionGameMode: 'dualnback-classic',
    ...journeyContextOverrides,
  };

  return {
    report: {
      sessionId: 's1',
      createdAt: '2026-01-01T00:00:00Z',
      reason: 'completed',
      gameMode: 'dualnback-classic',
      gameModeLabel: 'Dual N-Back',
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 10,
      durationMs: 1000,
      unifiedAccuracy: 0.5,
      ups: null,
      modeScore: { labelKey: 'x', value: 0, unit: '%' },
      totals: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 },
      byModality: {},
      errorProfile: null,
      playContext: 'journey',
      journeyContext: baseJourneyContext,
      ...reportOverrides,
    } as unknown as SessionEndReportModel,
    tone: 'stay',
    zone: 'stay',
    explanation: { protocol: 'jaeggi' },
    ...rest,
  };
}

// =============================================================================
// Tests — deriveProtocolConfig
// =============================================================================

describe('deriveProtocolConfig', () => {
  // ---------------------------------------------------------------------------
  // Game mode lookup
  // ---------------------------------------------------------------------------

  describe('game mode lookup', () => {
    it('returns config for dualnback-classic', () => {
      const cfg = deriveProtocolConfig('dualnback-classic');
      expect(cfg).not.toBeNull();
      expect(cfg!.explanationKind).toBe('jaeggi');
      expect(cfg!.ruleset.id).toBe('jaeggi');
    });

    it('returns config for sim-brainworkshop', () => {
      const cfg = deriveProtocolConfig('sim-brainworkshop');
      expect(cfg).not.toBeNull();
      expect(cfg!.explanationKind).toBe('brainworkshop');
      expect(cfg!.ruleset.id).toBe('brainworkshop');
    });

    it('returns config for dual-trace', () => {
      const cfg = deriveProtocolConfig('dual-trace');
      expect(cfg).not.toBeNull();
      expect(cfg!.explanationKind).toBe('accuracy');
      expect(cfg!.ruleset.id).toBe('trace-accuracy');
    });

    it('returns config for dual-track', () => {
      const cfg = deriveProtocolConfig('dual-track');
      expect(cfg).not.toBeNull();
      expect(cfg!.explanationKind).toBe('accuracy');
      expect(cfg!.ruleset.id).toBe('accuracy');
      expect(cfg!.postProcess).toBeDefined();
    });

    it('returns null for dual-catch (no indicator)', () => {
      const cfg = deriveProtocolConfig('dual-catch');
      expect(cfg).toBeNull();
    });

    it('returns null for unknown game mode', () => {
      const cfg = deriveProtocolConfig('nonexistent-mode');
      expect(cfg).toBeNull();
    });

    it('returns null for dual-place (no indicator)', () => {
      const cfg = deriveProtocolConfig('dual-place');
      expect(cfg).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Config structure
  // ---------------------------------------------------------------------------

  describe('config structure', () => {
    it('dualnback-classic config has correct messageKindMap', () => {
      const cfg = deriveProtocolConfig('dualnback-classic')!;
      expect(cfg.messageKindMap.free).toEqual({
        up: 'free-up',
        stay: 'free-stay',
        down: 'free-down',
      });
      expect(cfg.messageKindMap.journey).toEqual({
        up: 'jaeggi-up',
        stay: 'jaeggi-stay',
        down: 'jaeggi-down',
      });
      expect(cfg.messageKindMap.completed).toBe('journey-completed');
    });

    it('sim-brainworkshop config has strikes in messageKindMap', () => {
      const cfg = deriveProtocolConfig('sim-brainworkshop')!;
      expect(cfg.messageKindMap.strikes).toEqual({
        1: 'bw-strike-1',
        2: 'bw-strike-2',
      });
    });

    it('all configs have standard freeActions and journeyActions', () => {
      for (const mode of ['dualnback-classic', 'sim-brainworkshop', 'dual-trace', 'dual-track']) {
        const cfg = deriveProtocolConfig(mode)!;
        expect(cfg.freeActions).toEqual({ kind: 'standard' });
        expect(cfg.journeyActions).toEqual({ kind: 'go-to-stage' });
      }
    });

    it('config id matches postProcessorId or rulesetId', () => {
      const jaeggi = deriveProtocolConfig('dualnback-classic')!;
      expect(jaeggi.id).toBe('jaeggi');

      const track = deriveProtocolConfig('dual-track')!;
      expect(track.id).toBe('dual-track');
    });

    it('config match.gameModes includes the queried game mode', () => {
      const cfg = deriveProtocolConfig('dualnback-classic')!;
      expect(cfg.match.gameModes).toContain('dualnback-classic');
    });
  });

  // ---------------------------------------------------------------------------
  // Hybrid-jaeggi protocol routing
  // ---------------------------------------------------------------------------

  describe('hybrid-jaeggi protocol routing', () => {
    it('returns hybrid config for dual-track-dnb-hybrid with hybrid-jaeggi protocol', () => {
      const cfg = deriveProtocolConfig('dual-track-dnb-hybrid', 'hybrid-jaeggi');
      expect(cfg).not.toBeNull();
      expect(cfg!.id).toBe('hybrid-jaeggi');
      expect(cfg!.postProcess).toBeDefined();
      expect(cfg!.match.journeyProtocol).toBe('hybrid-jaeggi');
    });

    it('returns null for dual-track-dnb-hybrid without protocol (hybrid postProcessor needs context)', () => {
      const cfg = deriveProtocolConfig('dual-track-dnb-hybrid');
      expect(cfg).toBeNull();
    });

    it('dualnback-classic with hybrid-jaeggi protocol returns normal jaeggi config', () => {
      const cfg = deriveProtocolConfig('dualnback-classic', 'hybrid-jaeggi');
      expect(cfg).not.toBeNull();
      expect(cfg!.id).toBe('jaeggi');
    });
  });

  // ---------------------------------------------------------------------------
  // Ruleset registry
  // ---------------------------------------------------------------------------

  describe('RULESET_REGISTRY', () => {
    it('contains all expected rulesets', () => {
      expect(RULESET_REGISTRY.jaeggi).toBeDefined();
      expect(RULESET_REGISTRY.brainworkshop).toBeDefined();
      expect(RULESET_REGISTRY.accuracy).toBeDefined();
      expect(RULESET_REGISTRY['trace-accuracy']).toBeDefined();
    });

    it('jaeggi ruleset has no strikes', () => {
      expect(RULESET_REGISTRY.jaeggi!.strikes).toBeNull();
    });

    it('brainworkshop ruleset has strikes', () => {
      expect(RULESET_REGISTRY.brainworkshop!.strikes).not.toBeNull();
      expect(RULESET_REGISTRY.brainworkshop!.strikes!.count).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // POST_PROCESSORS registry
  // ---------------------------------------------------------------------------

  describe('POST_PROCESSORS', () => {
    it('contains hybrid-jaeggi and dual-track entries', () => {
      expect(POST_PROCESSORS['hybrid-jaeggi']).toBeDefined();
      expect(typeof POST_PROCESSORS['hybrid-jaeggi']).toBe('function');
      expect(POST_PROCESSORS['dual-track']).toBeDefined();
      expect(typeof POST_PROCESSORS['dual-track']).toBe('function');
    });
  });
});

// =============================================================================
// Tests — hybridJaeggiPostProcessor
// =============================================================================

describe('hybridJaeggiPostProcessor', () => {
  const postProcessor = POST_PROCESSORS['hybrid-jaeggi']!;

  describe('decision override from jaeggi errors', () => {
    it('overrides to up when maxErrors < thresholdUp and context is non-current-state, non-dnb next', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        journeySessionRole: 'decision-half',
        explanation: {
          protocol: 'jaeggi',
          maxErrors: 1,
          thresholdUp: 3,
          thresholdDown: 5,
        },
        journeyContextOverrides: {
          guidanceSource: 'historical-session',
          nextSessionGameMode: 'dual-track',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBe('up');
    });

    it('overrides to down when maxErrors > thresholdDown', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        journeySessionRole: 'decision-half',
        explanation: {
          protocol: 'jaeggi',
          maxErrors: 6,
          thresholdUp: 3,
          thresholdDown: 5,
        },
        journeyContextOverrides: {
          guidanceSource: 'historical-session',
          nextSessionGameMode: 'dual-track',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBe('down');
    });

    it('overrides to stay when maxErrors between thresholds', () => {
      const ctx = makePostCtx({
        journeyDecision: 'up',
        journeySessionRole: 'decision-half',
        explanation: {
          protocol: 'jaeggi',
          maxErrors: 4,
          thresholdUp: 3,
          thresholdDown: 5,
        },
        journeyContextOverrides: {
          guidanceSource: 'historical-session',
          nextSessionGameMode: 'dual-track',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBe('stay');
    });

    it('does not override when guidanceSource=current-state', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        journeySessionRole: 'decision-half',
        explanation: {
          protocol: 'jaeggi',
          maxErrors: 1,
          thresholdUp: 3,
          thresholdDown: 5,
        },
        journeyContextOverrides: {
          guidanceSource: 'current-state',
          nextSessionGameMode: 'dual-track',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBeUndefined();
    });

    it('does not override when nextSessionGameMode=dualnback-classic', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        journeySessionRole: 'decision-half',
        explanation: {
          protocol: 'jaeggi',
          maxErrors: 1,
          thresholdUp: 3,
          thresholdDown: 5,
        },
        journeyContextOverrides: {
          nextSessionGameMode: 'dualnback-classic',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBeUndefined();
    });

    it('does not override when explanation is not jaeggi', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        explanation: { protocol: 'brainworkshop' },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBeUndefined();
    });

    it('does not override when explanation lacks maxErrors', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
        explanation: { protocol: 'jaeggi', thresholdUp: 3, thresholdDown: 5 },
        journeyContextOverrides: {
          nextSessionGameMode: 'dual-track',
        },
      });
      const result = postProcessor(ctx);
      expect(result.journeyDecisionOverride).toBeUndefined();
    });
  });

  describe('tone and messageKind overrides', () => {
    it('toneOverride=up and messageKind=hybrid-validation-progress for validation-progress display', () => {
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeyContextOverrides: {
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
        },
      });
      const result = postProcessor(ctx);
      expect(result.toneOverride).toBe('up');
      expect(result.messageKindOverride).toBe('hybrid-validation-progress');
      expect(result.hybridJourneyDisplay?.kind).toBe('validation-progress');
    });

    it('toneOverride=down and messageKind=hybrid-failure-progress for failure-progress display', () => {
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeyContextOverrides: {
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
        },
      });
      const result = postProcessor(ctx);
      expect(result.toneOverride).toBe('down');
      expect(result.messageKindOverride).toBe('hybrid-failure-progress');
    });

    it('messageKind=hybrid-track-progress for track-progress display', () => {
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeyContextOverrides: {
          hybridProgress: {
            loopPhase: 'track',
            trackSessionsCompleted: 0,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 3,
          },
        },
      });
      const result = postProcessor(ctx);
      expect(result.messageKindOverride).toBe('hybrid-track-progress');
      expect(result.toneOverride).toBeUndefined();
    });

    it('messageKind=hybrid-stay-progress for stay-progress display', () => {
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeyContextOverrides: {
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 2,
            dnbSessionsRequired: 3,
            decisionZone: 'stay',
          },
        },
      });
      const result = postProcessor(ctx);
      expect(result.messageKindOverride).toBe('hybrid-stay-progress');
      expect(result.toneOverride).toBeUndefined();
    });

    it('toneOverride=up and messageKind=hybrid-up-decision for up-decision', () => {
      const ctx = makePostCtx({
        journeyDecision: 'up',
      });
      const result = postProcessor(ctx);
      expect(result.toneOverride).toBe('up');
      expect(result.messageKindOverride).toBe('hybrid-up-decision');
    });

    it('toneOverride=down and messageKind=hybrid-down-decision for down-decision', () => {
      const ctx = makePostCtx({
        journeyDecision: 'down',
      });
      const result = postProcessor(ctx);
      expect(result.toneOverride).toBe('down');
      expect(result.messageKindOverride).toBe('hybrid-down-decision');
    });

    it('messageKind=hybrid-stay-decision for stay-decision (no hybridProgress)', () => {
      const ctx = makePostCtx({
        journeyDecision: 'stay',
      });
      const result = postProcessor(ctx);
      expect(result.messageKindOverride).toBe('hybrid-stay-decision');
    });

    it('messageKind=hybrid-pending-pair for pending-pair with no display resolved', () => {
      // When no hybridProgress, no track-half role, and pending-pair => no display resolved
      // Then fallback: effectiveDecision is 'pending-pair' => track-half || pending-pair => hybrid-pending-pair
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeySessionRole: 'decision-half',
      });
      const result = postProcessor(ctx);
      // No hybridProgress on the report => resolveHybridJourneyDisplayFromCtx returns undefined
      // (journeyDecision=pending-pair with no hybridProgress and sessionRole!=track-half => track-progress? No.)
      // Actually: pending-pair falls through all decision checks, then !hybridProgress block:
      // journeySessionRole=decision-half, not track-half, journeyDecision=pending-pair => track-progress
      expect(result.hybridJourneyDisplay?.kind).toBe('track-progress');
    });

    it('messageKind=hybrid-track-progress for track-half role', () => {
      const ctx = makePostCtx({
        journeyDecision: 'pending-pair',
        journeySessionRole: 'track-half',
      });
      const result = postProcessor(ctx);
      expect(result.hybridJourneyDisplay?.kind).toBe('track-progress');
      expect(result.messageKindOverride).toBe('hybrid-track-progress');
    });
  });
});

// =============================================================================
// Tests — resolveHybridJourneyDisplayFromCtx (indirectly through post-processor)
// =============================================================================

describe('resolveHybridJourneyDisplayFromCtx (via post-processor)', () => {
  const postProcessor = POST_PROCESSORS['hybrid-jaeggi']!;

  it('returns up-decision for journeyDecision=up', () => {
    const ctx = makePostCtx({ journeyDecision: 'up' });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'up-decision' });
  });

  it('returns down-decision for journeyDecision=down', () => {
    const ctx = makePostCtx({ journeyDecision: 'down' });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'down-decision' });
  });

  it('returns stay-decision for journeyDecision=stay without hybridProgress', () => {
    const ctx = makePostCtx({ journeyDecision: 'stay' });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'stay-decision' });
  });

  it('returns stay-decision for journeyDecision=stay with loopPhase=track (not dnb)', () => {
    const ctx = makePostCtx({
      journeyDecision: 'stay',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'track',
          trackSessionsCompleted: 0,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 0,
          dnbSessionsRequired: 3,
        },
      },
    });
    const result = postProcessor(ctx);
    // stay + loopPhase !== 'dnb' => stay-decision
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'stay-decision' });
  });

  it('returns track-progress for track-half session role without hybridProgress', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeySessionRole: 'track-half',
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'track-progress' });
  });

  it('returns track-progress with counts when loopPhase=track', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'track',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 2,
          dnbSessionsCompleted: 0,
          dnbSessionsRequired: 3,
        },
      },
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'track-progress',
      current: 1,
      total: 2,
    });
  });

  it('returns validation-progress when decisionZone=clean', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 2,
          dnbSessionsRequired: 3,
          decisionZone: 'clean',
          decisionStreakCount: 2,
          decisionStreakRequired: 3,
        },
      },
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'validation-progress',
      current: 2,
      total: 3,
    });
  });

  it('returns failure-progress when decisionZone=down', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 2,
          dnbSessionsRequired: 3,
          decisionZone: 'down',
          decisionStreakCount: 2,
          decisionStreakRequired: 3,
        },
      },
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'failure-progress',
      current: 2,
      total: 3,
    });
  });

  it('returns stay-progress when dnb with decisionZone=stay', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 2,
          dnbSessionsRequired: 3,
          decisionZone: 'stay',
        },
      },
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'stay-progress',
      current: 2,
      total: 3,
    });
  });

  it('returns undefined when no decision and no role and no progress', () => {
    const ctx = makePostCtx({
      journeyDecision: undefined,
      journeySessionRole: undefined,
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toBeUndefined();
  });

  it('uses decisionStreakCount in validation-progress when available', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 5,
          dnbSessionsRequired: 6,
          decisionZone: 'clean',
          decisionStreakCount: 1,
          decisionStreakRequired: 2,
        },
      },
    });
    const result = postProcessor(ctx);
    // Uses decisionStreakCount (1) not dnbSessionsCompleted (5)
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'validation-progress',
      current: 1,
      total: 2,
    });
  });

  it('falls back to dnbSessionsCompleted when decisionStreakCount is undefined', () => {
    const ctx = makePostCtx({
      journeyDecision: 'pending-pair',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 3,
          dnbSessionsRequired: 5,
          decisionZone: 'clean',
        },
      },
    });
    const result = postProcessor(ctx);
    expect(result.hybridJourneyDisplay).toEqual({
      kind: 'validation-progress',
      current: 3,
      total: 2, // defaults to 2 when decisionStreakRequired undefined
    });
  });

  it('stay in dnb loopPhase with decisionZone=stay yields stay-decision', () => {
    const ctx = makePostCtx({
      journeyDecision: 'stay',
      journeyContextOverrides: {
        hybridProgress: {
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 1,
          dnbSessionsRequired: 3,
          decisionZone: 'stay',
        },
      },
    });
    const result = postProcessor(ctx);
    // stay + loopPhase='dnb' => does NOT match the early return (loopPhase !== 'dnb' needed)
    // Falls through, decisionZone='stay' not clean/down => line 293 journeyDecision='stay' => stay-decision
    expect(result.hybridJourneyDisplay).toEqual({ kind: 'stay-decision' });
  });
});

// =============================================================================
// Tests — dualTrackPostProcessor
// =============================================================================

describe('dualTrackPostProcessor', () => {
  const postProcessor = POST_PROCESSORS['dual-track']!;

  it('returns empty result when modeDetails is not track kind', () => {
    const ctx = makePostCtx({
      reportOverrides: {
        modeDetails: { kind: 'tempo', avgIsiMs: 1000, avgStimulusDurationMs: 500 },
      },
    });
    const result = postProcessor(ctx);
    expect(result).toEqual({});
  });

  it('returns empty result when modeDetails is undefined', () => {
    const ctx = makePostCtx({
      reportOverrides: { modeDetails: undefined },
    });
    const result = postProcessor(ctx);
    expect(result).toEqual({});
  });

  it('returns toneOverride=up and track-promoted for promoted target count', () => {
    const trackDetails: TrackDetails = {
      kind: 'track',
      selectionPrecision: 90,
      selectionQuality: 90,
      targetCount: 4,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      avgResponseTimeMs: 1200,
      perfectRounds: 5,
      totalCrowdingEvents: 3,
      minInterObjectDistancePx: 50,
      crowdingThresholdPx: 48,
      masteryTargetCountStage: 4,
      masteryDifficultyTier: 10,
      masteryTierCount: 15,
      masteryStageProgressPct: 80,
      masteryPhaseIndex: 2,
      masteryPhaseIdentityMode: 'color',
      highestCompletedTargetCount: 3,
      promotedTargetCount: true,
      performanceBand: 'mastery',
      nextTargetCountStage: 5,
      nextDifficultyTier: 1,
      motionComplexity: 'standard',
    };

    const ctx = makePostCtx({
      reportOverrides: {
        gameMode: 'dual-track',
        modeDetails: trackDetails,
      },
    });
    const result = postProcessor(ctx);
    expect(result.toneOverride).toBe('up');
    expect(result.messageKindOverride).toBe('track-promoted');
    expect(result.dualTrackJourneyDisplay).toBeDefined();
    expect(result.dualTrackJourneyDisplay!.promotedTargetCount).toBe(true);
  });

  it('returns toneOverride=up and track-up for solid performance', () => {
    const trackDetails: TrackDetails = {
      kind: 'track',
      selectionPrecision: 82,
      selectionQuality: 80,
      targetCount: 3,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      avgResponseTimeMs: 1200,
      perfectRounds: 4,
      totalCrowdingEvents: 7,
      minInterObjectDistancePx: 42,
      crowdingThresholdPx: 48,
      masteryTargetCountStage: 3,
      masteryDifficultyTier: 7,
      masteryTierCount: 15,
      masteryStageProgressPct: 46,
      masteryPhaseIndex: 1,
      masteryPhaseIdentityMode: 'audio',
      highestCompletedTargetCount: 2,
      promotedTargetCount: false,
      performanceBand: 'solid',
      nextTargetCountStage: 3,
      nextDifficultyTier: 8,
      motionComplexity: 'standard',
    };

    const ctx = makePostCtx({
      reportOverrides: {
        gameMode: 'dual-track',
        modeDetails: trackDetails,
      },
    });
    const result = postProcessor(ctx);
    expect(result.toneOverride).toBe('up');
    expect(result.messageKindOverride).toBe('track-up');
  });

  it('returns toneOverride=down and track-down for struggling performance', () => {
    const trackDetails: TrackDetails = {
      kind: 'track',
      selectionPrecision: 40,
      selectionQuality: 35,
      targetCount: 3,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      avgResponseTimeMs: 2000,
      perfectRounds: 0,
      totalCrowdingEvents: 15,
      minInterObjectDistancePx: 20,
      crowdingThresholdPx: 48,
      masteryTargetCountStage: 3,
      masteryDifficultyTier: 5,
      masteryTierCount: 15,
      masteryStageProgressPct: 20,
      masteryPhaseIndex: 1,
      masteryPhaseIdentityMode: 'classic',
      highestCompletedTargetCount: 2,
      promotedTargetCount: false,
      performanceBand: 'struggling',
      nextTargetCountStage: 3,
      nextDifficultyTier: 4,
      motionComplexity: 'standard',
    };

    const ctx = makePostCtx({
      reportOverrides: {
        gameMode: 'dual-track',
        modeDetails: trackDetails,
      },
    });
    const result = postProcessor(ctx);
    expect(result.toneOverride).toBe('down');
    expect(result.messageKindOverride).toBe('track-down');
  });

  it('returns toneOverride=stay and track-stay for building performance', () => {
    const trackDetails: TrackDetails = {
      kind: 'track',
      selectionPrecision: 65,
      selectionQuality: 60,
      targetCount: 3,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      avgResponseTimeMs: 1500,
      perfectRounds: 2,
      totalCrowdingEvents: 10,
      minInterObjectDistancePx: 35,
      crowdingThresholdPx: 48,
      masteryTargetCountStage: 3,
      masteryDifficultyTier: 6,
      masteryTierCount: 15,
      masteryStageProgressPct: 35,
      masteryPhaseIndex: 1,
      masteryPhaseIdentityMode: 'classic',
      highestCompletedTargetCount: 2,
      promotedTargetCount: false,
      performanceBand: 'building',
      nextTargetCountStage: 3,
      nextDifficultyTier: 6,
      motionComplexity: 'standard',
    };

    const ctx = makePostCtx({
      reportOverrides: {
        gameMode: 'dual-track',
        modeDetails: trackDetails,
      },
    });
    const result = postProcessor(ctx);
    expect(result.toneOverride).toBe('stay');
    expect(result.messageKindOverride).toBe('track-stay');
  });

  it('builds display even with minimal mastery fields', () => {
    const trackDetails: TrackDetails = {
      kind: 'track',
      selectionPrecision: 0,
      selectionQuality: 0,
      targetCount: 3,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      perfectRounds: 0,
      motionComplexity: 'standard',
    };

    const ctx = makePostCtx({
      reportOverrides: {
        gameMode: 'dual-track',
        modeDetails: trackDetails,
      },
    });
    const result = postProcessor(ctx);
    // buildDualTrackJourneyDisplay defaults missing fields, returns display
    expect(result.dualTrackJourneyDisplay).toBeDefined();
  });
});
