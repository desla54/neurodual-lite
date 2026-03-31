import { describe, expect, test } from 'bun:test';
import {
  createInitialRunningSpanSessionState,
  transitionRunningSpanSessionMachine,
  buildRunningSpanSessionSummary,
  type RunningSpanSessionMachineConfig,
  type RunningSpanSessionMachineState,
  type RunningSpanSessionMachineAction,
  type RunningSpanSessionMachineTransition,
} from './running-span-session-machine';

const baseConfig: RunningSpanSessionMachineConfig = {
  startSpan: 3,
  maxSpan: 7,
  maxConsecutiveFailures: 3,
  maxTrials: 20,
  playContext: 'free',
};

const device = {
  platform: 'web' as const,
  screenWidth: 1440,
  screenHeight: 900,
  userAgent: 'test',
  touchCapable: true,
};

const context = {
  timeOfDay: 'morning' as const,
  localHour: 9,
  dayOfWeek: 1,
  timezone: 'Europe/Paris',
};

function apply(
  state: RunningSpanSessionMachineState,
  actions: RunningSpanSessionMachineAction[],
  config = baseConfig,
): RunningSpanSessionMachineTransition {
  let transition: RunningSpanSessionMachineTransition = { state, eventDrafts: [] };
  for (const action of actions) {
    transition = transitionRunningSpanSessionMachine(transition.state, action, config);
  }
  return transition;
}

/** Stream letters, end stream, then submit recall */
function runFullTrial(
  state: RunningSpanSessionMachineState,
  streamLetters: string[],
  recalledLetters: string[],
  startTs: number,
  config = baseConfig,
): RunningSpanSessionMachineTransition {
  const actions: RunningSpanSessionMachineAction[] = [
    { type: 'BEGIN_TRIAL', timestamp: startTs, userId: 'user-1', device, context },
  ];

  let ts = startTs;
  for (const letter of streamLetters) {
    ts += 500;
    actions.push({ type: 'SHOW_ITEM', letter, timestamp: ts });
  }

  ts += 200;
  actions.push({ type: 'END_STREAM', timestamp: ts });

  ts += 1000;
  actions.push({ type: 'SUBMIT_RECALL', recalled: recalledLetters, timestamp: ts });

  return apply(state, actions, config);
}

describe('running-span-session-machine', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  test('creates correct initial state', () => {
    const s = createInitialRunningSpanSessionState();
    expect(s.sessionPhase).toBe('playing');
    expect(s.trialPhase).toBe('idle');
    expect(s.currentSpan).toBe(0);
    expect(s.sessionStarted).toBe(false);
    expect(s.results).toHaveLength(0);
    expect(s.streamItems).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // BEGIN_TRIAL
  // ---------------------------------------------------------------------------

  test('BEGIN_TRIAL starts session and emits started event on first trial', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );

    expect(t.state.sessionStarted).toBe(true);
    expect(t.state.trialPhase).toBe('streaming');
    expect(t.state.currentSpan).toBe(baseConfig.startSpan);
    expect(t.state.startedAtMs).toBe(1000);
    expect(t.state.streamItems).toEqual([]);
    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('RUNNING_SPAN_SESSION_STARTED');
  });

  test('BEGIN_TRIAL on second trial does not emit started event', () => {
    const s = createInitialRunningSpanSessionState();
    // Complete a full trial first
    const afterTrial = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'E'], 1000);
    const next = transitionRunningSpanSessionMachine(
      afterTrial.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      baseConfig,
    );
    const t = transitionRunningSpanSessionMachine(
      next.state,
      { type: 'BEGIN_TRIAL', timestamp: 5100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(t.eventDrafts).toHaveLength(0);
  });

  test('BEGIN_TRIAL is ignored if not idle', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const again = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'BEGIN_TRIAL', timestamp: 1100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(again.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // SHOW_ITEM — streaming
  // ---------------------------------------------------------------------------

  test('SHOW_ITEM accumulates letters during streaming', () => {
    const s = createInitialRunningSpanSessionState();
    const t = apply(s, [
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1500 },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 2000 },
      { type: 'SHOW_ITEM', letter: 'C', timestamp: 2500 },
    ]);

    expect(t.state.streamItems).toEqual(['A', 'B', 'C']);
    expect(t.state.trialPhase).toBe('streaming');
  });

  test('SHOW_ITEM is ignored when not streaming', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'SHOW_ITEM', letter: 'X', timestamp: 1000 },
      baseConfig,
    );
    expect(t.state.streamItems).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // END_STREAM → recalling
  // ---------------------------------------------------------------------------

  test('END_STREAM transitions from streaming to recalling', () => {
    const s = createInitialRunningSpanSessionState();
    const t = apply(s, [
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1500 },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 2000 },
      { type: 'END_STREAM', timestamp: 2500 },
    ]);

    expect(t.state.trialPhase).toBe('recalling');
    expect(t.state.recallStartMs).toBe(2500);
  });

  test('END_STREAM is ignored when not streaming', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'END_STREAM', timestamp: 1000 },
      baseConfig,
    );
    expect(t.state.trialPhase).toBe('idle');
  });

  // ---------------------------------------------------------------------------
  // SUBMIT_RECALL — target extraction and correctness
  // ---------------------------------------------------------------------------

  test('correct recall of last N items (target = slice(-currentSpan))', () => {
    const s = createInitialRunningSpanSessionState();
    // Stream 5 letters, span=3, target = last 3 = ['C', 'D', 'E']
    const t = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'E'], 1000);

    expect(t.state.trialPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);

    const result = t.state.results[0]!;
    expect(result.correct).toBe(true);
    expect(result.targetLetters).toEqual(['C', 'D', 'E']);
    expect(result.recalled).toEqual(['C', 'D', 'E']);
    expect(result.span).toBe(3);
    expect(result.streamLength).toBe(5);
    expect(result.responseTimeMs).toBeGreaterThan(0);

    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('RUNNING_SPAN_TRIAL_COMPLETED');
  });

  test('incorrect recall order is wrong', () => {
    const s = createInitialRunningSpanSessionState();
    const t = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['E', 'D', 'C'], 1000);
    expect(t.state.results[0]!.correct).toBe(false);
  });

  test('partial recall is incorrect', () => {
    const s = createInitialRunningSpanSessionState();
    const t = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['D', 'E'], 1000);
    expect(t.state.results[0]!.correct).toBe(false);
  });

  test('target is exactly the stream when streamLength equals span', () => {
    const s = createInitialRunningSpanSessionState();
    // Stream exactly 3 letters with span=3
    const t = runFullTrial(s, ['X', 'Y', 'Z'], ['X', 'Y', 'Z'], 1000);
    expect(t.state.results[0]!.correct).toBe(true);
    expect(t.state.results[0]!.targetLetters).toEqual(['X', 'Y', 'Z']);
  });

  test('SUBMIT_RECALL is ignored when not recalling', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'SUBMIT_RECALL', recalled: ['A'], timestamp: 1000 },
      baseConfig,
    );
    expect(t.state.results).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // maxSpanReached tracking
  // ---------------------------------------------------------------------------

  test('maxSpanReached updates only on correct recall', () => {
    const s = createInitialRunningSpanSessionState();
    // Correct at span 3
    const t1 = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'E'], 1000);
    expect(t1.state.maxSpanReached).toBe(3);

    // NEXT_TRIAL → span=4
    const next = transitionRunningSpanSessionMachine(
      t1.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      baseConfig,
    );

    // Wrong at span 4
    const begun = transitionRunningSpanSessionMachine(
      next.state,
      { type: 'BEGIN_TRIAL', timestamp: 5100, userId: 'user-1', device, context },
      baseConfig,
    );
    const t2 = apply(begun.state, [
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 5200 },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 5300 },
      { type: 'SHOW_ITEM', letter: 'C', timestamp: 5400 },
      { type: 'SHOW_ITEM', letter: 'D', timestamp: 5500 },
      { type: 'SHOW_ITEM', letter: 'E', timestamp: 5600 },
      { type: 'SHOW_ITEM', letter: 'F', timestamp: 5700 },
      { type: 'END_STREAM', timestamp: 5800 },
      { type: 'SUBMIT_RECALL', recalled: ['X', 'X', 'X', 'X'], timestamp: 6000 },
    ]);
    expect(t2.state.maxSpanReached).toBe(3); // stays 3
  });

  // ---------------------------------------------------------------------------
  // NEXT_TRIAL — span progression
  // ---------------------------------------------------------------------------

  test('correct trial increases span by 1', () => {
    const s = createInitialRunningSpanSessionState();
    const afterTrial = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['C', 'D', 'E'], 1000);
    const next = transitionRunningSpanSessionMachine(
      afterTrial.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      baseConfig,
    );

    expect(next.state.currentSpan).toBe(4); // 3 → 4
    expect(next.state.trialPhase).toBe('idle');
    expect(next.state.trialIndex).toBe(1);
    expect(next.state.consecutiveFailures).toBe(0);
    expect(next.state.streamItems).toEqual([]);
  });

  test('incorrect trial keeps span the same', () => {
    const s = createInitialRunningSpanSessionState();
    const afterTrial = runFullTrial(s, ['A', 'B', 'C', 'D', 'E'], ['X', 'Y', 'Z'], 1000);
    const next = transitionRunningSpanSessionMachine(
      afterTrial.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      baseConfig,
    );

    expect(next.state.currentSpan).toBe(3); // stays
    expect(next.state.consecutiveFailures).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Consecutive failures → session end
  // ---------------------------------------------------------------------------

  test('maxConsecutiveFailures ends session', () => {
    const config: RunningSpanSessionMachineConfig = {
      ...baseConfig,
      maxConsecutiveFailures: 2,
    };

    let s = createInitialRunningSpanSessionState();

    // Fail trial 1
    let t = runFullTrial(s, ['A', 'B', 'C', 'D'], ['X', 'Y', 'Z'], 1000, config);
    t = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      config,
    );
    s = t.state;

    // Fail trial 2
    t = transitionRunningSpanSessionMachine(
      s,
      { type: 'BEGIN_TRIAL', timestamp: 5100, userId: 'user-1', device, context },
      config,
    );
    const t2 = apply(
      t.state,
      [
        { type: 'SHOW_ITEM', letter: 'X', timestamp: 5200 },
        { type: 'SHOW_ITEM', letter: 'Y', timestamp: 5300 },
        { type: 'SHOW_ITEM', letter: 'Z', timestamp: 5400 },
        { type: 'SHOW_ITEM', letter: 'W', timestamp: 5500 },
        { type: 'END_STREAM', timestamp: 5600 },
        { type: 'SUBMIT_RECALL', recalled: ['A', 'B', 'C'], timestamp: 6000 },
      ],
      config,
    );

    const end = transitionRunningSpanSessionMachine(
      t2.state,
      { type: 'NEXT_TRIAL', timestamp: 7000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('completed');
    expect(end.completionDraft).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Span limit
  // ---------------------------------------------------------------------------

  test('exceeding maxSpan ends session with span-limit', () => {
    const config: RunningSpanSessionMachineConfig = {
      ...baseConfig,
      startSpan: 6,
      maxSpan: 7,
    };

    const s = createInitialRunningSpanSessionState();
    // span=6, correct → next=7
    let t = runFullTrial(
      s,
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      ['C', 'D', 'E', 'F', 'G', 'H'],
      1000,
      config,
    );
    t = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      config,
    );
    expect(t.state.currentSpan).toBe(7);

    // span=7, correct → next=8 > maxSpan → end
    t = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'BEGIN_TRIAL', timestamp: 5100, userId: 'user-1', device, context },
      config,
    );
    const t2 = apply(
      t.state,
      [
        { type: 'SHOW_ITEM', letter: 'A', timestamp: 5200 },
        { type: 'SHOW_ITEM', letter: 'B', timestamp: 5300 },
        { type: 'SHOW_ITEM', letter: 'C', timestamp: 5400 },
        { type: 'SHOW_ITEM', letter: 'D', timestamp: 5500 },
        { type: 'SHOW_ITEM', letter: 'E', timestamp: 5600 },
        { type: 'SHOW_ITEM', letter: 'F', timestamp: 5700 },
        { type: 'SHOW_ITEM', letter: 'G', timestamp: 5800 },
        { type: 'SHOW_ITEM', letter: 'H', timestamp: 5900 },
        { type: 'SHOW_ITEM', letter: 'I', timestamp: 6000 },
        { type: 'END_STREAM', timestamp: 6100 },
        { type: 'SUBMIT_RECALL', recalled: ['C', 'D', 'E', 'F', 'G', 'H', 'I'], timestamp: 7000 },
      ],
      config,
    );

    const end = transitionRunningSpanSessionMachine(
      t2.state,
      { type: 'NEXT_TRIAL', timestamp: 8000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('span-limit');
  });

  // ---------------------------------------------------------------------------
  // maxTrials limit
  // ---------------------------------------------------------------------------

  test('reaching maxTrials ends session', () => {
    const config: RunningSpanSessionMachineConfig = {
      ...baseConfig,
      maxTrials: 1,
    };

    const s = createInitialRunningSpanSessionState();
    const t = runFullTrial(s, ['A', 'B', 'C', 'D'], ['B', 'C', 'D'], 1000, config);

    const end = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('completed');
    expect(end.completionDraft).toBeDefined();
    expect(end.completionDraft!.correctTrials).toBe(1);
    expect(end.completionDraft!.totalTrials).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // ABANDON
  // ---------------------------------------------------------------------------

  test('ABANDON ends session immediately', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const abandoned = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'ABANDON', timestamp: 2000 },
      baseConfig,
    );

    expect(abandoned.state.sessionPhase).toBe('finished');
    expect(abandoned.state.endReason).toBe('abandoned');
    expect(abandoned.completionDraft).toBeDefined();
    expect(abandoned.completionDraft!.reason).toBe('abandoned');
  });

  // ---------------------------------------------------------------------------
  // RESTART
  // ---------------------------------------------------------------------------

  test('RESTART resets to initial state', () => {
    const s = createInitialRunningSpanSessionState();
    const t = transitionRunningSpanSessionMachine(
      s,
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const restarted = transitionRunningSpanSessionMachine(t.state, { type: 'RESTART' }, baseConfig);
    expect(restarted.state).toEqual(createInitialRunningSpanSessionState());
  });

  // ---------------------------------------------------------------------------
  // Guards — finished session ignores actions
  // ---------------------------------------------------------------------------

  test('actions are ignored when session is finished', () => {
    const s = createInitialRunningSpanSessionState();
    const t = apply(s, [
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'ABANDON', timestamp: 2000 },
    ]);
    const noop = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'BEGIN_TRIAL', timestamp: 3000, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(noop.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // buildRunningSpanSessionSummary
  // ---------------------------------------------------------------------------

  test('buildRunningSpanSessionSummary computes correct stats', () => {
    const summary = buildRunningSpanSessionSummary([
      {
        span: 3,
        streamLength: 5,
        targetLetters: ['C', 'D', 'E'],
        recalled: ['C', 'D', 'E'],
        correct: true,
        responseTimeMs: 800,
      },
      {
        span: 4,
        streamLength: 6,
        targetLetters: ['C', 'D', 'E', 'F'],
        recalled: ['X', 'X', 'X', 'X'],
        correct: false,
        responseTimeMs: 1200,
      },
    ]);

    expect(summary.correctTrials).toBe(1);
    expect(summary.totalTrials).toBe(2);
    expect(summary.accuracy).toBe(50);
    expect(summary.maxSpanReached).toBe(3); // only correct trials count
  });

  test('buildRunningSpanSessionSummary handles empty results', () => {
    const summary = buildRunningSpanSessionSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.maxSpanReached).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // responseTimeMs calculation
  // ---------------------------------------------------------------------------

  test('responseTimeMs is calculated from recallStartMs', () => {
    const s = createInitialRunningSpanSessionState();
    const t = apply(s, [
      { type: 'BEGIN_TRIAL', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1500 },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 2000 },
      { type: 'SHOW_ITEM', letter: 'C', timestamp: 2500 },
      { type: 'END_STREAM', timestamp: 3000 },
      { type: 'SUBMIT_RECALL', recalled: ['A', 'B', 'C'], timestamp: 4500 },
    ]);
    expect(t.state.results[0]!.responseTimeMs).toBe(1500); // 4500 - 3000
  });

  // ---------------------------------------------------------------------------
  // Session end event content
  // ---------------------------------------------------------------------------

  test('session end event has correct structure', () => {
    const config: RunningSpanSessionMachineConfig = { ...baseConfig, maxTrials: 1 };
    const s = createInitialRunningSpanSessionState();
    const t = runFullTrial(s, ['A', 'B', 'C', 'D'], ['B', 'C', 'D'], 1000, config);

    const end = transitionRunningSpanSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', timestamp: 5000 },
      config,
    );

    const endEvent = end.eventDrafts.find((e) => e.type === 'RUNNING_SPAN_SESSION_ENDED');
    expect(endEvent).toBeDefined();
    const ev = endEvent as { type: string; reason: string; durationMs: number; score: number };
    expect(ev.reason).toBe('completed');
    expect(ev.durationMs).toBeGreaterThan(0);
    expect(ev.score).toBeGreaterThanOrEqual(0);
  });
});
