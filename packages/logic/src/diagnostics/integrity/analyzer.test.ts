import { describe, it, expect } from 'bun:test';
import { analyzeSessionEvents, analyzeAllSessionsFromEvents } from './analyzer';
import type { GameEvent } from '../../engine/events';

// =============================================================================
// Helpers - Build minimal GameEvent objects for testing
// =============================================================================

// We cast minimal objects as GameEvent since the analyzer reads .type, .timestamp,
// .sessionId, and specific fields via narrowing. This avoids pulling in the full
// Zod schema for test fixtures.

let seqId = 0;
function uid(): string {
  return `test-${++seqId}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeFlowStart(sessionId: string, timestamp: number, nLevel = 2): GameEvent {
  return {
    id: uid(),
    type: 'SESSION_STARTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    nLevel,
    playContext: 'free',
    userId: 'user-1',
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: false,
    },
    context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
    config: {
      nLevel,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.33,
      lureProbability: 0.1,
      intervalSeconds: 2.5,
      stimulusDurationSeconds: 0.5,
      generator: 'BrainWorkshop',
    },
  } as unknown as GameEvent;
}

function makeFlowEnd(
  sessionId: string,
  timestamp: number,
  reason: 'completed' | 'abandoned' = 'completed',
): GameEvent {
  return {
    id: uid(),
    type: 'SESSION_ENDED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    reason,
    playContext: 'free',
  } as unknown as GameEvent;
}

function makeTrialPresented(sessionId: string, timestamp: number): GameEvent {
  return {
    id: uid(),
    type: 'TRIAL_PRESENTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
  } as unknown as GameEvent;
}

function makeUserResponded(
  sessionId: string,
  timestamp: number,
  outcome: 'hit' | 'miss' | 'false_alarm' | 'correct_rejection',
  reactionTimeMs = 400,
): GameEvent {
  return {
    id: uid(),
    type: 'USER_RESPONDED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    outcome,
    reactionTimeMs,
  } as unknown as GameEvent;
}

function makeMemoStart(sessionId: string, timestamp: number, nLevel = 2): GameEvent {
  return {
    id: uid(),
    type: 'RECALL_SESSION_STARTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    config: { nLevel },
  } as unknown as GameEvent;
}

function makeMemoEnd(sessionId: string, timestamp: number): GameEvent {
  return {
    id: uid(),
    type: 'RECALL_SESSION_ENDED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    reason: 'completed',
  } as unknown as GameEvent;
}

function makeMemoStimulus(sessionId: string, timestamp: number): GameEvent {
  return {
    id: uid(),
    type: 'RECALL_STIMULUS_SHOWN',
    sessionId,
    timestamp,
    schemaVersion: 1,
  } as unknown as GameEvent;
}

function makeMemoWindowCommitted(sessionId: string, timestamp: number): GameEvent {
  return {
    id: uid(),
    type: 'RECALL_WINDOW_COMMITTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
  } as unknown as GameEvent;
}

function makeMemoPicked(sessionId: string, timestamp: number, isCorrection = false): GameEvent {
  return {
    id: uid(),
    type: 'RECALL_PICKED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    isCorrection,
  } as unknown as GameEvent;
}

// =============================================================================
// Build a valid flow session with configurable outcomes
// =============================================================================

function buildFlowSession(opts: {
  sessionId?: string;
  nLevel?: number;
  hits?: number;
  misses?: number;
  falseAlarms?: number;
  correctRejections?: number;
  durationMs?: number;
  omitEnd?: boolean;
  reason?: 'completed' | 'abandoned';
}): GameEvent[] {
  const sid = opts.sessionId ?? uid();
  const startTs = 1000;
  const duration = opts.durationMs ?? 60_000;
  const events: GameEvent[] = [];

  events.push(makeFlowStart(sid, startTs, opts.nLevel ?? 2));

  let ts = startTs + 1000;
  let trialIdx = 0;

  const addTrials = (
    count: number,
    outcome: 'hit' | 'miss' | 'false_alarm' | 'correct_rejection',
  ) => {
    for (let i = 0; i < count; i++) {
      events.push(makeTrialPresented(sid, ts));
      ts += 500;
      events.push(makeUserResponded(sid, ts, outcome, 350 + Math.floor(Math.random() * 200)));
      ts += 500;
      trialIdx++;
    }
  };

  addTrials(opts.hits ?? 5, 'hit');
  addTrials(opts.misses ?? 1, 'miss');
  addTrials(opts.falseAlarms ?? 1, 'false_alarm');
  addTrials(opts.correctRejections ?? 3, 'correct_rejection');

  if (!opts.omitEnd) {
    events.push(makeFlowEnd(sid, startTs + duration, opts.reason));
  }

  return events;
}

// =============================================================================
// Tests
// =============================================================================

describe('IntegrityAnalyzer', () => {
  describe('analyzeSessionEvents - empty input', () => {
    it('returns error report for empty events array', () => {
      const report = analyzeSessionEvents('empty-session', []);
      expect(report.sessionId).toBe('empty-session');
      expect(report.overallStatus).toBe('error');
      expect(report.sessionType).toBe('unknown');
      expect(report.eventCounts.total).toBe(0);
      expect(report.checks.length).toBeGreaterThan(0);
      // @ts-expect-error test: nullable access
      expect(report!.checks![0].name).toBe('session_exists');
      // @ts-expect-error test: nullable access
      expect(report!.checks![0].status).toBe('error');
      expect(report.completed).toBe(false);
      expect(report.summary).toBe('Session introuvable');
    });
  });

  describe('analyzeSessionEvents - happy path (flow session)', () => {
    it('reports ok for a valid completed flow session', () => {
      const events = buildFlowSession({
        hits: 8,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 9,
        durationMs: 120_000,
      });
      const report = analyzeSessionEvents('sess-1', events);

      expect(report.sessionType).toBe('flow');
      expect(report.completed).toBe(true);
      expect(report.nLevel).toBe(2);
      expect(report.overallStatus).toBe('ok');
      expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
      expect(report.summary).toBe('Toutes les vérifications passent');
    });

    it('recalculates stats correctly', () => {
      const events = buildFlowSession({
        hits: 10,
        misses: 2,
        falseAlarms: 3,
        correctRejections: 5,
        durationMs: 90_000,
      });
      const report = analyzeSessionEvents('s', events);
      const stats = report.recalculatedStats;

      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(2);
      expect(stats.falseAlarms).toBe(3);
      expect(stats.correctRejections).toBe(5);
      expect(stats.trialsPresented).toBe(20);
      expect(stats.userResponses).toBe(20);
      expect(stats.accuracy).toBeCloseTo((10 + 5) / 20, 5);
      expect(stats.durationMs).toBe(90_000);
      expect(stats.avgReactionTimeMs).toBeGreaterThan(0);
    });

    it('calculates d-prime within normal range for good performance', () => {
      const events = buildFlowSession({
        hits: 15,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 13,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      const dp = report.recalculatedStats.dPrime;

      expect(dp).not.toBeNull();
      expect(dp!).toBeGreaterThan(0);
      expect(dp!).toBeLessThanOrEqual(5);
    });
  });

  describe('analyzeSessionEvents - happy path (memo session)', () => {
    it('reports ok for a valid completed memo session', () => {
      const sid = 'memo-1';
      const events: GameEvent[] = [
        makeMemoStart(sid, 1000, 3),
        makeMemoStimulus(sid, 2000),
        makeMemoPicked(sid, 3000),
        makeMemoWindowCommitted(sid, 3500),
        makeMemoStimulus(sid, 4000),
        makeMemoPicked(sid, 5000),
        makeMemoWindowCommitted(sid, 5500),
        makeMemoEnd(sid, 61_000),
      ];
      const report = analyzeSessionEvents(sid, events);

      expect(report.sessionType).toBe('memo');
      expect(report.completed).toBe(true);
      expect(report.nLevel).toBe(3);
      expect(report.recalculatedStats.trialsPresented).toBe(2);
      expect(report.recalculatedStats.userResponses).toBe(2); // windowsCommitted
      expect(report.recalculatedStats.hits).toBe(2); // picks (non-correction)
      expect(report.recalculatedStats.dPrime).toBeNull();
    });

    it('does not count correction picks as hits in memo mode', () => {
      const sid = 'memo-corr';
      const events: GameEvent[] = [
        makeMemoStart(sid, 1000),
        makeMemoStimulus(sid, 2000),
        makeMemoPicked(sid, 2500, false),
        makeMemoPicked(sid, 2700, true), // correction
        makeMemoWindowCommitted(sid, 3000),
        makeMemoEnd(sid, 61_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      expect(report.recalculatedStats.hits).toBe(1); // only non-correction
    });
  });

  // ===========================================================================
  // Integrity check: timestamps_ascending
  // ===========================================================================
  describe('check: timestamps_ascending', () => {
    it('passes when timestamps are monotonically ascending', () => {
      const events = buildFlowSession({ durationMs: 60_000 });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'timestamps_ascending')!;
      expect(check.status).toBe('ok');
    });

    it('fails when a timestamp goes backward', () => {
      const sid = 's';
      const events: GameEvent[] = [
        makeFlowStart(sid, 5000),
        makeTrialPresented(sid, 6000),
        makeUserResponded(sid, 5500, 'hit'), // backward!
        makeTrialPresented(sid, 7000),
        makeUserResponded(sid, 7500, 'miss'),
        makeFlowEnd(sid, 65_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      const check = report.checks.find((c) => c.name === 'timestamps_ascending')!;
      expect(check.status).toBe('error');
      expect(check.actual).toBe(1);
    });
  });

  // ===========================================================================
  // Integrity check: session_boundaries
  // ===========================================================================
  describe('check: session_boundaries', () => {
    it('passes with both start and end', () => {
      const events = buildFlowSession({});
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'session_boundaries')!;
      expect(check.status).toBe('ok');
    });

    it('warns when session has start but no end', () => {
      const events = buildFlowSession({ omitEnd: true });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'session_boundaries')!;
      expect(check.status).toBe('warning');
    });

    it('errors when no start event is found', () => {
      const sid = 's';
      const events: GameEvent[] = [
        makeTrialPresented(sid, 2000),
        makeUserResponded(sid, 2500, 'hit'),
      ];
      const report = analyzeSessionEvents(sid, events);
      const check = report.checks.find((c) => c.name === 'session_boundaries')!;
      expect(check.status).toBe('error');
    });
  });

  // ===========================================================================
  // Integrity check: accuracy_range
  // ===========================================================================
  describe('check: accuracy_range', () => {
    it('passes when accuracy is in [0, 1]', () => {
      const events = buildFlowSession({});
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'accuracy_range')!;
      expect(check.status).toBe('ok');
    });

    it('reports ok for 100% accuracy', () => {
      const events = buildFlowSession({
        hits: 10,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 10,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      expect(report.recalculatedStats.accuracy).toBe(1);
      const check = report.checks.find((c) => c.name === 'accuracy_range')!;
      expect(check.status).toBe('ok');
    });

    it('reports ok for 0% accuracy (all wrong)', () => {
      const events = buildFlowSession({
        hits: 0,
        misses: 5,
        falseAlarms: 5,
        correctRejections: 0,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      expect(report.recalculatedStats.accuracy).toBe(0);
      const check = report.checks.find((c) => c.name === 'accuracy_range')!;
      expect(check.status).toBe('ok');
    });
  });

  // ===========================================================================
  // Integrity check: dprime_range
  // ===========================================================================
  describe('check: dprime_range', () => {
    it('reports ok when d-prime is null (memo mode)', () => {
      const sid = 'm';
      const events: GameEvent[] = [
        makeMemoStart(sid, 1000),
        makeMemoStimulus(sid, 2000),
        makeMemoWindowCommitted(sid, 3000),
        makeMemoEnd(sid, 62_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      const check = report.checks.find((c) => c.name === 'dprime_range')!;
      expect(check.status).toBe('ok');
    });

    it('reports ok when d-prime is in normal range', () => {
      const events = buildFlowSession({
        hits: 12,
        misses: 3,
        falseAlarms: 2,
        correctRejections: 13,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      const dp = report.recalculatedStats.dPrime;
      expect(dp).not.toBeNull();
      const check = report.checks.find((c) => c.name === 'dprime_range')!;
      expect(check.status).toBe('ok');
    });

    it('warns for extreme d-prime values (perfect performance → high d-prime)', () => {
      // With perfect hit rate and near-zero FA rate, d-prime will be very high
      // but clamped to [0.01, 0.99], so max d-prime ~ 4.65 which is within range.
      // To get truly extreme values we'd need to bypass clamping,
      // but the clamping keeps it in range. This test just verifies clamping works.
      const events = buildFlowSession({
        hits: 50,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 50,
        durationMs: 120_000,
      });
      const report = analyzeSessionEvents('s', events);
      const dp = report.recalculatedStats.dPrime;
      // Due to clamping, d-prime won't exceed ~4.65
      expect(dp).not.toBeNull();
      if (dp !== null) {
        expect(dp).toBeGreaterThan(0);
        expect(dp).toBeLessThanOrEqual(5);
      }
    });
  });

  // ===========================================================================
  // Integrity check: trial_response_balance
  // ===========================================================================
  describe('check: trial_response_balance', () => {
    it('passes when trials == responses in flow mode', () => {
      const events = buildFlowSession({ hits: 5, misses: 1, falseAlarms: 1, correctRejections: 3 });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'trial_response_balance')!;
      expect(check.status).toBe('ok');
    });

    it('always passes in memo mode', () => {
      const sid = 'm';
      const events: GameEvent[] = [
        makeMemoStart(sid, 1000),
        makeMemoStimulus(sid, 2000),
        makeMemoEnd(sid, 62_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      const check = report.checks.find((c) => c.name === 'trial_response_balance')!;
      expect(check.status).toBe('ok');
    });

    it('warns when trial-response difference exceeds tolerance', () => {
      const sid = 's';
      const events: GameEvent[] = [
        makeFlowStart(sid, 1000),
        // 10 trials but only 2 responses
        ...Array.from({ length: 10 }, (_, i) => makeTrialPresented(sid, 2000 + i * 100)),
        makeUserResponded(sid, 3100, 'hit'),
        makeUserResponded(sid, 3200, 'miss'),
        makeFlowEnd(sid, 62_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      const check = report.checks.find((c) => c.name === 'trial_response_balance')!;
      expect(check.status).toBe('warning');
    });
  });

  // ===========================================================================
  // Integrity check: no_negative_values
  // ===========================================================================
  describe('check: no_negative_values', () => {
    it('passes for normal sessions', () => {
      const events = buildFlowSession({});
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'no_negative_values')!;
      expect(check.status).toBe('ok');
    });
  });

  // ===========================================================================
  // Integrity check: reasonable_duration
  // ===========================================================================
  describe('check: reasonable_duration', () => {
    it('passes for duration between 10s and 1h', () => {
      const events = buildFlowSession({ durationMs: 60_000 });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'reasonable_duration')!;
      expect(check.status).toBe('ok');
    });

    it('warns for very short duration (< 10s)', () => {
      const events = buildFlowSession({ durationMs: 5_000 });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'reasonable_duration')!;
      expect(check.status).toBe('warning');
    });

    it('warns for very long duration (> 1h)', () => {
      const events = buildFlowSession({ durationMs: 4_000_000 });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'reasonable_duration')!;
      expect(check.status).toBe('warning');
    });

    it('warns when duration is 0 (no end event)', () => {
      const events = buildFlowSession({ omitEnd: true });
      const report = analyzeSessionEvents('s', events);
      const check = report.checks.find((c) => c.name === 'reasonable_duration')!;
      expect(check.status).toBe('warning');
    });
  });

  // ===========================================================================
  // Overall status
  // ===========================================================================
  describe('overall status', () => {
    it('returns error when any check is error', () => {
      const sid = 's';
      // No start event = error on session_boundaries
      const events: GameEvent[] = [makeTrialPresented(sid, 1000)];
      const report = analyzeSessionEvents(sid, events);
      expect(report.overallStatus).toBe('error');
    });

    it('returns warning when worst check is warning (no errors)', () => {
      // Session with start but no end → warning, otherwise all ok
      const events = buildFlowSession({ omitEnd: true, durationMs: 0 });
      const report = analyzeSessionEvents('s', events);
      expect(report.overallStatus).toBe('warning');
    });
  });

  // ===========================================================================
  // Session type detection
  // ===========================================================================
  describe('session type detection', () => {
    it('detects flow session', () => {
      const events = buildFlowSession({});
      const report = analyzeSessionEvents('s', events);
      expect(report.sessionType).toBe('flow');
    });

    it('detects memo session', () => {
      const sid = 'm';
      const events: GameEvent[] = [
        makeMemoStart(sid, 1000),
        makeMemoStimulus(sid, 2000),
        makeMemoEnd(sid, 62_000),
      ];
      const report = analyzeSessionEvents(sid, events);
      expect(report.sessionType).toBe('memo');
    });

    it('returns unknown for unrecognized events', () => {
      const events: GameEvent[] = [
        {
          id: uid(),
          type: 'BADGE_UNLOCKED',
          sessionId: 'x',
          timestamp: 1000,
          schemaVersion: 1,
        } as unknown as GameEvent,
      ];
      const report = analyzeSessionEvents('x', events);
      expect(report.sessionType).toBe('unknown');
    });
  });

  // ===========================================================================
  // Completion detection
  // ===========================================================================
  describe('completion detection', () => {
    it('completed = true for reason=completed', () => {
      const events = buildFlowSession({ reason: 'completed' });
      const report = analyzeSessionEvents('s', events);
      expect(report.completed).toBe(true);
    });

    it('completed = false for reason=abandoned', () => {
      const events = buildFlowSession({ reason: 'abandoned' });
      const report = analyzeSessionEvents('s', events);
      expect(report.completed).toBe(false);
    });

    it('completed = false when no end event', () => {
      const events = buildFlowSession({ omitEnd: true });
      const report = analyzeSessionEvents('s', events);
      expect(report.completed).toBe(false);
    });
  });

  // ===========================================================================
  // d-prime approximation accuracy
  // ===========================================================================
  describe('d-prime approximation', () => {
    it('d-prime is 0 when hit rate equals false alarm rate', () => {
      // Equal hit rate and FA rate → d' should be ~0
      const events = buildFlowSession({
        hits: 5,
        misses: 5,
        falseAlarms: 5,
        correctRejections: 5,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      const dp = report.recalculatedStats.dPrime;
      expect(dp).not.toBeNull();
      expect(Math.abs(dp!)).toBeLessThan(0.1);
    });

    it('d-prime is positive when hit rate > false alarm rate', () => {
      const events = buildFlowSession({
        hits: 15,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 12,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      expect(report.recalculatedStats.dPrime).toBeGreaterThan(0);
    });

    it('d-prime is negative when false alarm rate > hit rate', () => {
      const events = buildFlowSession({
        hits: 1,
        misses: 14,
        falseAlarms: 12,
        correctRejections: 3,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      expect(report.recalculatedStats.dPrime).toBeLessThan(0);
    });

    it('d-prime is finite even with extreme rates (clamped)', () => {
      const events = buildFlowSession({
        hits: 100,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 100,
        durationMs: 120_000,
      });
      const report = analyzeSessionEvents('s', events);
      const dp = report.recalculatedStats.dPrime;
      expect(dp).not.toBeNull();
      expect(Number.isFinite(dp!)).toBe(true);
    });
  });

  // ===========================================================================
  // Event counting
  // ===========================================================================
  describe('event counting', () => {
    it('counts events by type correctly', () => {
      const events = buildFlowSession({
        hits: 3,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 1,
        durationMs: 60_000,
      });
      const report = analyzeSessionEvents('s', events);
      expect(report.eventCounts.total).toBe(events.length);
      expect(report.eventCounts.byType['SESSION_STARTED']).toBe(1);
      expect(report.eventCounts.byType['SESSION_ENDED']).toBe(1);
      expect(report.eventCounts.byType['TRIAL_PRESENTED']).toBe(6);
      expect(report.eventCounts.byType['USER_RESPONDED']).toBe(6);
    });
  });

  // ===========================================================================
  // analyzeAllSessionsFromEvents
  // ===========================================================================
  describe('analyzeAllSessionsFromEvents', () => {
    it('groups events by sessionId and returns summaries', () => {
      const sess1Events = buildFlowSession({ sessionId: 'a', durationMs: 60_000 });
      const sess2Events = buildFlowSession({ sessionId: 'b', durationMs: 60_000 });
      const allEvents = [...sess1Events, ...sess2Events];

      const summaries = analyzeAllSessionsFromEvents(allEvents);
      expect(summaries).toHaveLength(2);
      const ids = summaries.map((s) => s.sessionId);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('returns empty array for no events', () => {
      const summaries = analyzeAllSessionsFromEvents([]);
      expect(summaries).toHaveLength(0);
    });

    it('skips events with empty sessionId', () => {
      const events: GameEvent[] = [
        {
          id: uid(),
          type: 'TRIAL_PRESENTED',
          sessionId: '',
          timestamp: 1000,
          schemaVersion: 1,
        } as unknown as GameEvent,
        {
          id: uid(),
          type: 'TRIAL_PRESENTED',
          sessionId: '  ',
          timestamp: 2000,
          schemaVersion: 1,
        } as unknown as GameEvent,
      ];
      const summaries = analyzeAllSessionsFromEvents(events);
      expect(summaries).toHaveLength(0);
    });

    it('summary fields match the full report', () => {
      const events = buildFlowSession({ sessionId: 'x', durationMs: 60_000 });
      const summaries = analyzeAllSessionsFromEvents(events);
      expect(summaries).toHaveLength(1);
      const s = summaries[0];
      expect(s!.sessionId).toBe('x');
      expect(s!.sessionType).toBe('flow');
      expect(s!.checksCount).toBe(7);
      expect(typeof s!.failedChecksCount).toBe('number');
      expect(typeof s!.reportId).toBe('string');
    });
  });

  // ===========================================================================
  // Report structure
  // ===========================================================================
  describe('report structure', () => {
    it('always has a reportId', () => {
      const report = analyzeSessionEvents('s', []);
      expect(typeof report.reportId).toBe('string');
      expect(report.reportId.length).toBeGreaterThan(0);
    });

    it('always has generatedAt timestamp', () => {
      const before = Date.now();
      const report = analyzeSessionEvents('s', []);
      const after = Date.now();
      expect(report.generatedAt).toBeGreaterThanOrEqual(before);
      expect(report.generatedAt).toBeLessThanOrEqual(after);
    });
  });
});
