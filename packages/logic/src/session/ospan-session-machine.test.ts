import { describe, expect, test } from 'bun:test';
import {
  createInitialOspanSessionState,
  transitionOspanSessionMachine,
  buildOspanSessionSummary,
  type OspanSessionMachineConfig,
  type OspanSessionMachineState,
  type OspanSessionMachineAction,
  type OspanSessionMachineTransition,
} from './ospan-session-machine';

const baseConfig: OspanSessionMachineConfig = {
  setSequence: [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 3, 3, 4, 4, 5],
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
  state: OspanSessionMachineState,
  actions: OspanSessionMachineAction[],
  config = baseConfig,
): OspanSessionMachineTransition {
  let transition: OspanSessionMachineTransition = { state, eventDrafts: [] };
  for (const action of actions) {
    transition = transitionOspanSessionMachine(transition.state, action, config);
  }
  return transition;
}

/** Run a full set: equation+item pairs, then recall */
function runFullSet(
  state: OspanSessionMachineState,
  letters: string[],
  recalledLetters: string[],
  startTs: number,
  config = baseConfig,
): OspanSessionMachineTransition {
  let s = state;
  let ts = startTs;

  // BEGIN_SET (only first time needs userId/device/context, but always required)
  const begun = transitionOspanSessionMachine(
    s,
    { type: 'BEGIN_SET', timestamp: ts, userId: 'user-1', device, context },
    config,
  );
  s = begun.state;

  for (let i = 0; i < letters.length; i++) {
    ts += 100;
    // SHOW_EQUATION
    const eq = transitionOspanSessionMachine(
      s,
      { type: 'SHOW_EQUATION', equation: `${i}+1`, correctAnswer: true, timestamp: ts },
      config,
    );
    s = eq.state;

    ts += 500;
    // ANSWER_EQUATION
    const ans = transitionOspanSessionMachine(
      s,
      {
        type: 'ANSWER_EQUATION',
        equation: `${i}+1`,
        correctAnswer: true,
        answer: true,
        timestamp: ts,
      },
      config,
    );
    s = ans.state;

    ts += 100;
    // SHOW_ITEM
    const item = transitionOspanSessionMachine(
      s,
      { type: 'SHOW_ITEM', letter: letters[i]!, timestamp: ts },
      config,
    );
    s = item.state;
  }

  ts += 100;
  // BEGIN_RECALL
  const recall = transitionOspanSessionMachine(s, { type: 'BEGIN_RECALL', timestamp: ts }, config);
  s = recall.state;

  ts += 1000;
  // SUBMIT_RECALL
  const submit = transitionOspanSessionMachine(
    s,
    { type: 'SUBMIT_RECALL', recalled: recalledLetters, timestamp: ts },
    config,
  );

  return submit;
}

describe('ospan-session-machine', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  test('creates correct initial state', () => {
    const s = createInitialOspanSessionState();
    expect(s.sessionPhase).toBe('playing');
    expect(s.trialPhase).toBe('idle');
    expect(s.currentSpan).toBe(0);
    expect(s.sessionStarted).toBe(false);
    expect(s.results).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // BEGIN_SET
  // ---------------------------------------------------------------------------

  test('BEGIN_SET starts session and emits started event on first set', () => {
    const s = createInitialOspanSessionState();
    const t = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );

    expect(t.state.sessionStarted).toBe(true);
    expect(t.state.trialPhase).toBe('showing_equation');
    expect(t.state.currentSpan).toBe(baseConfig.setSequence[0]);
    expect(t.state.startedAtMs).toBe(1000);
    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('OSPAN_SESSION_STARTED');
  });

  test('BEGIN_SET on second set does not emit started event', () => {
    const s = createInitialOspanSessionState();
    // Complete a full set first
    const afterSet = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000);
    // NEXT_SET
    const next = transitionOspanSessionMachine(
      afterSet.state,
      { type: 'NEXT_SET', timestamp: 5000 },
      baseConfig,
    );
    // BEGIN second set
    const t = transitionOspanSessionMachine(
      next.state,
      { type: 'BEGIN_SET', timestamp: 5100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(t.eventDrafts).toHaveLength(0);
    expect(t.state.trialPhase).toBe('showing_equation');
  });

  test('BEGIN_SET is ignored if not idle', () => {
    const s = createInitialOspanSessionState();
    const begun = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    // Already in showing_equation, not idle
    const again = transitionOspanSessionMachine(
      begun.state,
      { type: 'BEGIN_SET', timestamp: 1100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(again.state).toBe(begun.state);
  });

  // ---------------------------------------------------------------------------
  // SHOW_EQUATION / ANSWER_EQUATION / SHOW_ITEM flow
  // ---------------------------------------------------------------------------

  test('equation → answer → item cycle transitions correctly', () => {
    const s = createInitialOspanSessionState();
    const begun = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );

    // SHOW_EQUATION records timestamp
    const eq = transitionOspanSessionMachine(
      begun.state,
      { type: 'SHOW_EQUATION', equation: '3+4', correctAnswer: true, timestamp: 1100 },
      baseConfig,
    );
    expect(eq.state.equationStartMs).toBe(1100);
    expect(eq.state.trialPhase).toBe('showing_equation');

    // ANSWER_EQUATION transitions to showing_item
    const ans = transitionOspanSessionMachine(
      eq.state,
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1500,
      },
      baseConfig,
    );
    expect(ans.state.trialPhase).toBe('showing_item');

    // SHOW_ITEM adds letter and goes back to showing_equation (more items left)
    const item = transitionOspanSessionMachine(
      ans.state,
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1600 },
      baseConfig,
    );
    expect(item.state.currentLetters).toEqual(['A']);
    expect(item.state.itemIndex).toBe(1);
    // span=3, index=1 < 3 → back to showing_equation
    expect(item.state.trialPhase).toBe('showing_equation');
  });

  test('last SHOW_ITEM stays in showing_item (ready for recall)', () => {
    const s = createInitialOspanSessionState();
    // Run through all 3 equation+item pairs
    const t = apply(s, [
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_EQUATION', equation: '1+1', correctAnswer: true, timestamp: 1100 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1200,
      },
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1300 },
      { type: 'SHOW_EQUATION', equation: '2+2', correctAnswer: true, timestamp: 1400 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1500,
      },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 1600 },
      { type: 'SHOW_EQUATION', equation: '3+3', correctAnswer: true, timestamp: 1700 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1800,
      },
      { type: 'SHOW_ITEM', letter: 'C', timestamp: 1900 },
    ]);

    expect(t.state.currentLetters).toEqual(['A', 'B', 'C']);
    expect(t.state.itemIndex).toBe(3); // equals span=3
    expect(t.state.trialPhase).toBe('showing_item'); // stays, waiting for BEGIN_RECALL
  });

  // ---------------------------------------------------------------------------
  // BEGIN_RECALL / SUBMIT_RECALL
  // ---------------------------------------------------------------------------

  test('BEGIN_RECALL transitions to recalling from showing_item', () => {
    const s = createInitialOspanSessionState();
    const afterItems = apply(s, [
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_EQUATION', equation: '1+1', correctAnswer: true, timestamp: 1100 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1200,
      },
      { type: 'SHOW_ITEM', letter: 'A', timestamp: 1300 },
      { type: 'SHOW_EQUATION', equation: '2+2', correctAnswer: true, timestamp: 1400 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1500,
      },
      { type: 'SHOW_ITEM', letter: 'B', timestamp: 1600 },
      { type: 'SHOW_EQUATION', equation: '3+3', correctAnswer: true, timestamp: 1700 },
      {
        type: 'ANSWER_EQUATION',
        equation: 'test',
        correctAnswer: true,
        answer: true,
        timestamp: 1800,
      },
      { type: 'SHOW_ITEM', letter: 'C', timestamp: 1900 },
      { type: 'BEGIN_RECALL', timestamp: 2000 },
    ]);

    expect(afterItems.state.trialPhase).toBe('recalling');
    expect(afterItems.state.recallStartMs).toBe(2000);
  });

  test('correct recall produces correct set result and event', () => {
    const s = createInitialOspanSessionState();
    const t = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000);

    expect(t.state.trialPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);

    const result = t.state.results[0]!;
    expect(result.recallCorrect).toBe(true);
    expect(result.span).toBe(3);
    expect(result.letters).toEqual(['A', 'B', 'C']);
    expect(result.recalled).toEqual(['A', 'B', 'C']);
    expect(result.responseTimeMs).toBeGreaterThan(0);

    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('OSPAN_SET_COMPLETED');
  });

  test('incorrect recall produces incorrect set result', () => {
    const s = createInitialOspanSessionState();
    const t = runFullSet(s, ['A', 'B', 'C'], ['C', 'B', 'A'], 1000);

    const result = t.state.results[0]!;
    expect(result.recallCorrect).toBe(false);
  });

  test('partial recall is incorrect', () => {
    const s = createInitialOspanSessionState();
    const t = runFullSet(s, ['A', 'B', 'C'], ['A', 'B'], 1000);
    expect(t.state.results[0]!.recallCorrect).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // NEXT_SET — sequence-based progression
  // ---------------------------------------------------------------------------

  test('NEXT_SET advances to the next set in the sequence', () => {
    const s = createInitialOspanSessionState();
    const afterSet = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000);
    const next = transitionOspanSessionMachine(
      afterSet.state,
      { type: 'NEXT_SET', timestamp: 5000 },
      baseConfig,
    );

    expect(next.state.trialPhase).toBe('idle');
    expect(next.state.setIndex).toBe(1);
    expect(next.state.currentSpan).toBe(baseConfig.setSequence[1]);
  });

  test('completing all sets in the sequence ends the session', () => {
    const shortConfig: OspanSessionMachineConfig = {
      setSequence: [3],
      playContext: 'free',
    };

    const s = createInitialOspanSessionState();
    const afterSet = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000, shortConfig);
    const end = transitionOspanSessionMachine(
      afterSet.state,
      { type: 'NEXT_SET', timestamp: 5000 },
      shortConfig,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('completed');
    expect(end.completionDraft).toBeDefined();
    expect(end.completionDraft!.correctSets).toBe(1);
    expect(end.completionDraft!.totalSets).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // maxSpanReached tracking
  // ---------------------------------------------------------------------------

  test('maxSpanReached only updates on correct recall', () => {
    const s = createInitialOspanSessionState();
    // Correct at span 3
    const t1 = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000);
    expect(t1.state.maxSpanReached).toBe(3);

    // NEXT_SET → second set (also span 3 per sequence)
    const next = transitionOspanSessionMachine(
      t1.state,
      { type: 'NEXT_SET', timestamp: 5000 },
      baseConfig,
    );

    // Wrong at second set
    const t2 = runFullSet(next.state, ['D', 'E', 'F'], ['X', 'X', 'X'], 5200, baseConfig);
    expect(t2.state.maxSpanReached).toBe(3); // stays 3
  });

  // ---------------------------------------------------------------------------
  // ABANDON
  // ---------------------------------------------------------------------------

  test('ABANDON ends session immediately', () => {
    const s = createInitialOspanSessionState();
    const begun = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const abandoned = transitionOspanSessionMachine(
      begun.state,
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
    const s = createInitialOspanSessionState();
    const begun = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const restarted = transitionOspanSessionMachine(begun.state, { type: 'RESTART' }, baseConfig);

    expect(restarted.state).toEqual(createInitialOspanSessionState());
    expect(restarted.eventDrafts).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Guard: finished state ignores actions
  // ---------------------------------------------------------------------------

  test('actions are ignored when session is finished', () => {
    const s = createInitialOspanSessionState();
    const begun = transitionOspanSessionMachine(
      s,
      { type: 'BEGIN_SET', timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const abandoned = transitionOspanSessionMachine(
      begun.state,
      { type: 'ABANDON', timestamp: 2000 },
      baseConfig,
    );

    const noop = transitionOspanSessionMachine(
      abandoned.state,
      { type: 'BEGIN_SET', timestamp: 3000, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(noop.state).toBe(abandoned.state);
    expect(noop.eventDrafts).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // equationAccuracy in set result
  // ---------------------------------------------------------------------------

  test('equationAccuracy is 100 when no equations tracked', () => {
    const s = createInitialOspanSessionState();
    const t = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000);
    expect(t.state.results[0]!.equationAccuracy).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // buildOspanSessionSummary
  // ---------------------------------------------------------------------------

  test('buildOspanSessionSummary computes correct stats', () => {
    const summary = buildOspanSessionSummary([
      {
        span: 3,
        letters: ['A', 'B', 'C'],
        recalled: ['A', 'B', 'C'],
        recallCorrect: true,
        equationResults: [],
        equationAccuracy: 100,
        responseTimeMs: 500,
      },
      {
        span: 4,
        letters: ['D', 'E', 'F', 'G'],
        recalled: ['D', 'X', 'F', 'G'],
        recallCorrect: false,
        equationResults: [],
        equationAccuracy: 100,
        responseTimeMs: 700,
      },
    ]);

    expect(summary.correctSets).toBe(1);
    expect(summary.totalSets).toBe(2);
    expect(summary.accuracy).toBe(50);
    expect(summary.maxSpanReached).toBe(3); // only correct sets count
    expect(summary.processingAccuracy).toBe(0); // 0 equations total → 0 (edge: actually 0/0)
  });

  test('buildOspanSessionSummary handles empty results', () => {
    const summary = buildOspanSessionSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.maxSpanReached).toBe(0);
    expect(summary.processingAccuracy).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Session end event content
  // ---------------------------------------------------------------------------

  test('session end event has correct structure', () => {
    const config: OspanSessionMachineConfig = { setSequence: [3], playContext: 'free' };
    const s = createInitialOspanSessionState();
    const afterSet = runFullSet(s, ['A', 'B', 'C'], ['A', 'B', 'C'], 1000, config);
    const end = transitionOspanSessionMachine(
      afterSet.state,
      { type: 'NEXT_SET', timestamp: 5000 },
      config,
    );

    const endEvent = end.eventDrafts.find((e) => e.type === 'OSPAN_SESSION_ENDED');
    expect(endEvent).toBeDefined();
    const ev = endEvent as { type: string; reason: string; durationMs: number; score: number };
    expect(ev.reason).toBe('completed');
    expect(ev.durationMs).toBeGreaterThan(0);
    expect(ev.score).toBeGreaterThanOrEqual(0);
  });
});
