import { describe, expect, test } from 'bun:test';
import {
  createInitialSwmSessionState,
  transitionSwmSessionMachine,
  buildSwmSessionSummary,
  type SwmSessionMachineConfig,
  type SwmSessionMachineState,
  type SwmSessionMachineAction,
  type SwmSessionMachineTransition,
} from './swm-session-machine';

const baseConfig: SwmSessionMachineConfig = {
  startBoxes: 4,
  maxBoxes: 12,
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
  state: SwmSessionMachineState,
  actions: SwmSessionMachineAction[],
  config = baseConfig,
): SwmSessionMachineTransition {
  let transition: SwmSessionMachineTransition = { state, eventDrafts: [] };
  for (const action of actions) {
    transition = transitionSwmSessionMachine(transition.state, action, config);
  }
  return transition;
}

describe('swm-session-machine', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  test('creates correct initial state', () => {
    const s = createInitialSwmSessionState();
    expect(s.sessionPhase).toBe('playing');
    expect(s.roundPhase).toBe('idle');
    expect(s.currentSpan).toBe(0);
    expect(s.sessionStarted).toBe(false);
    expect(s.results).toHaveLength(0);
    expect(s.foundPositions).toEqual([]);
    expect(s.openedThisRound).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // BEGIN_ROUND
  // ---------------------------------------------------------------------------

  test('BEGIN_ROUND starts session and emits started event on first round', () => {
    const s = createInitialSwmSessionState();
    const t = transitionSwmSessionMachine(
      s,
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );

    expect(t.state.sessionStarted).toBe(true);
    expect(t.state.roundPhase).toBe('searching');
    expect(t.state.currentSpan).toBe(baseConfig.startBoxes);
    expect(t.state.tokenPosition).toBe(2);
    expect(t.state.startedAtMs).toBe(1000);
    expect(t.state.roundStartedAtMs).toBe(1000);
    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('SWM_SESSION_STARTED');
  });

  test('BEGIN_ROUND is ignored if not idle', () => {
    const s = createInitialSwmSessionState();
    const t = transitionSwmSessionMachine(
      s,
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    // Already searching
    const again = transitionSwmSessionMachine(
      t.state,
      { type: 'BEGIN_ROUND', tokenPosition: 3, timestamp: 1100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(again.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // OPEN_BOX — find token (no errors)
  // ---------------------------------------------------------------------------

  test('opening token position completes round correctly', () => {
    const s = createInitialSwmSessionState();
    const t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 2, timestamp: 1500 },
    ]);

    expect(t.state.roundPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);

    const result = t.state.results[0]!;
    expect(result.correct).toBe(true);
    expect(result.withinSearchErrors).toBe(0);
    expect(result.betweenSearchErrors).toBe(0);
    expect(result.totalErrors).toBe(0);
    expect(result.searchesUsed).toBe(1);
    expect(result.roundTimeMs).toBe(500);
    expect(result.span).toBe(4);

    expect(t.state.foundPositions).toContain(2);
    expect(t.state.consecutiveCorrect).toBe(1);
    expect(t.state.consecutiveFailures).toBe(0);

    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('SWM_ROUND_COMPLETED');
  });

  // ---------------------------------------------------------------------------
  // Within-search error
  // ---------------------------------------------------------------------------

  test('reopening same box in current round counts as within-search error', () => {
    const s = createInitialSwmSessionState();
    const t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 0, timestamp: 1200 }, // wrong box
      { type: 'OPEN_BOX', position: 0, timestamp: 1400 }, // within-search error (reopened)
    ]);

    expect(t.state.roundPhase).toBe('searching'); // still searching
    expect(t.state.withinSearchErrors).toBe(1);
    expect(t.state.betweenSearchErrors).toBe(0);
    expect(t.state.searchesUsed).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Between-search error
  // ---------------------------------------------------------------------------

  test('opening a found-token box counts as between-search error', () => {
    const s = createInitialSwmSessionState();
    // Round 1: find token at position 2
    let t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 2, timestamp: 1500 },
    ]);

    // NEXT_ROUND with token at position 1
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
      baseConfig,
    );

    // Open found position 2 → between-search error
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'OPEN_BOX', position: 2, timestamp: 2200 },
      baseConfig,
    );

    expect(t.state.betweenSearchErrors).toBe(1);
    expect(t.state.withinSearchErrors).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // MAX_ERRORS auto-fail
  // ---------------------------------------------------------------------------

  test('4 errors in a round auto-fails the round', () => {
    const s = createInitialSwmSessionState();
    // Token at position 3, keep reopening wrong boxes
    const t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 3, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 0, timestamp: 1100 }, // wrong
      { type: 'OPEN_BOX', position: 0, timestamp: 1200 }, // within error 1
      { type: 'OPEN_BOX', position: 0, timestamp: 1300 }, // within error 2
      { type: 'OPEN_BOX', position: 0, timestamp: 1400 }, // within error 3
      { type: 'OPEN_BOX', position: 0, timestamp: 1500 }, // within error 4 → auto fail
    ]);

    expect(t.state.roundPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);
    expect(t.state.results[0]!.correct).toBe(false);
    expect(t.state.results[0]!.totalErrors).toBe(4);
    expect(t.state.consecutiveFailures).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Finding token with errors → round not correct
  // ---------------------------------------------------------------------------

  test('finding token after errors marks round as incorrect', () => {
    const s = createInitialSwmSessionState();
    const t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 0, timestamp: 1100 }, // wrong
      { type: 'OPEN_BOX', position: 0, timestamp: 1200 }, // within error
      { type: 'OPEN_BOX', position: 2, timestamp: 1300 }, // found!
    ]);

    expect(t.state.roundPhase).toBe('feedback');
    expect(t.state.results[0]!.correct).toBe(false);
    expect(t.state.results[0]!.withinSearchErrors).toBe(1);
    expect(t.state.results[0]!.totalErrors).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // NEXT_ROUND — span progression (every 2 correct)
  // ---------------------------------------------------------------------------

  test('span increases after 2 consecutive correct rounds', () => {
    const s = createInitialSwmSessionState();

    // Round 1: correct
    let t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 0, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
    ]);
    expect(t.state.consecutiveCorrect).toBe(1);

    // NEXT_ROUND
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
      baseConfig,
    );
    expect(t.state.currentSpan).toBe(4); // no increase yet (1 correct)

    // Round 2: correct
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'OPEN_BOX', position: 1, timestamp: 2500 },
      baseConfig,
    );
    expect(t.state.consecutiveCorrect).toBe(2);

    // NEXT_ROUND — should increase span
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 0, timestamp: 3000 },
      baseConfig,
    );
    expect(t.state.currentSpan).toBe(5); // 4→5
    expect(t.state.foundPositions).toEqual([]); // reset on span increase
  });

  test('span does not increase on failure', () => {
    const s = createInitialSwmSessionState();

    // Round 1: correct
    let t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 0, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
    ]);

    // Round 2: has errors
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
      baseConfig,
    );
    t = apply(t.state, [
      { type: 'OPEN_BOX', position: 3, timestamp: 2100 }, // wrong
      { type: 'OPEN_BOX', position: 3, timestamp: 2200 }, // within error
      { type: 'OPEN_BOX', position: 1, timestamp: 2300 }, // found with error
    ]);
    expect(t.state.consecutiveCorrect).toBe(0);

    // NEXT_ROUND — no span increase
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 2, timestamp: 3000 },
      baseConfig,
    );
    expect(t.state.currentSpan).toBe(4); // stays
  });

  test('span is capped at maxBoxes', () => {
    const config: SwmSessionMachineConfig = {
      ...baseConfig,
      startBoxes: 11,
      maxBoxes: 12,
    };

    const s = createInitialSwmSessionState();
    // Round 1: correct
    let t = apply(
      s,
      [
        {
          type: 'BEGIN_ROUND',
          tokenPosition: 0,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
      ],
      config,
    );
    // Round 2: correct → span increase to 12
    t = apply(
      t.state,
      [
        { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
        { type: 'OPEN_BOX', position: 1, timestamp: 2500 },
      ],
      config,
    );
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 0, timestamp: 3000 },
      config,
    );
    expect(t.state.currentSpan).toBe(12);

    // Round 3+4: correct → would be 13, capped at 12
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'OPEN_BOX', position: 0, timestamp: 3500 },
      config,
    );
    t = apply(
      t.state,
      [
        { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 4000 },
        { type: 'OPEN_BOX', position: 1, timestamp: 4500 },
      ],
      config,
    );
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 2, timestamp: 5000 },
      config,
    );
    expect(t.state.currentSpan).toBe(12); // capped
  });

  // ---------------------------------------------------------------------------
  // Found positions reset when all boxes found
  // ---------------------------------------------------------------------------

  test('foundPositions reset when all boxes at current span are found', () => {
    const config: SwmSessionMachineConfig = {
      ...baseConfig,
      startBoxes: 2,
      maxBoxes: 12,
    };

    const s = createInitialSwmSessionState();
    // Round 1: find at 0
    let t = apply(
      s,
      [
        {
          type: 'BEGIN_ROUND',
          tokenPosition: 0,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
      ],
      config,
    );
    expect(t.state.foundPositions).toEqual([0]);

    // NEXT_ROUND — span stays 2, foundPositions=[0], only 1 box left
    // With error so consecutiveCorrect won't trigger span increase
    t = apply(
      t.state,
      [
        { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
        { type: 'OPEN_BOX', position: 0, timestamp: 2100 }, // between error (already found)
        { type: 'OPEN_BOX', position: 1, timestamp: 2200 }, // found!
      ],
      config,
    );

    // foundPositions=[0,1], which equals span=2
    // NEXT_ROUND should reset foundPositions since all boxes found
    t = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 0, timestamp: 3000 },
      config,
    );
    expect(t.state.foundPositions).toEqual([]); // reset
  });

  // ---------------------------------------------------------------------------
  // Consecutive failures → session end
  // ---------------------------------------------------------------------------

  test('maxConsecutiveFailures ends session', () => {
    const config: SwmSessionMachineConfig = {
      ...baseConfig,
      maxConsecutiveFailures: 2,
    };

    const s = createInitialSwmSessionState();
    // Fail round 1 (find with error)
    let t = apply(
      s,
      [
        {
          type: 'BEGIN_ROUND',
          tokenPosition: 2,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'OPEN_BOX', position: 0, timestamp: 1100 },
        { type: 'OPEN_BOX', position: 0, timestamp: 1200 }, // within error
        { type: 'OPEN_BOX', position: 2, timestamp: 1300 }, // found with error
      ],
      config,
    );

    // Fail round 2
    t = apply(
      t.state,
      [
        { type: 'NEXT_ROUND', tokenPosition: 3, timestamp: 2000 },
        { type: 'OPEN_BOX', position: 1, timestamp: 2100 },
        { type: 'OPEN_BOX', position: 1, timestamp: 2200 }, // within error
        { type: 'OPEN_BOX', position: 3, timestamp: 2300 }, // found with error
      ],
      config,
    );

    // NEXT_ROUND should end session
    const end = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 0, timestamp: 3000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('completed');
    expect(end.completionDraft).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // maxTrials limit
  // ---------------------------------------------------------------------------

  test('reaching maxTrials ends session', () => {
    const config: SwmSessionMachineConfig = {
      ...baseConfig,
      maxTrials: 1,
    };

    const s = createInitialSwmSessionState();
    const t = apply(
      s,
      [
        {
          type: 'BEGIN_ROUND',
          tokenPosition: 0,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
      ],
      config,
    );

    const end = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.completionDraft).toBeDefined();
    expect(end.completionDraft!.correctRounds).toBe(1);
    expect(end.completionDraft!.totalRounds).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // ABANDON
  // ---------------------------------------------------------------------------

  test('ABANDON ends session immediately', () => {
    const s = createInitialSwmSessionState();
    const t = transitionSwmSessionMachine(
      s,
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const abandoned = transitionSwmSessionMachine(
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
    const s = createInitialSwmSessionState();
    const t = transitionSwmSessionMachine(
      s,
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const restarted = transitionSwmSessionMachine(t.state, { type: 'RESTART' }, baseConfig);
    expect(restarted.state).toEqual(createInitialSwmSessionState());
  });

  // ---------------------------------------------------------------------------
  // Guards — finished session ignores actions
  // ---------------------------------------------------------------------------

  test('actions are ignored when session is finished', () => {
    const s = createInitialSwmSessionState();
    const t = apply(s, [
      { type: 'BEGIN_ROUND', tokenPosition: 2, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'ABANDON', timestamp: 2000 },
    ]);
    const noop = transitionSwmSessionMachine(
      t.state,
      { type: 'BEGIN_ROUND', tokenPosition: 0, timestamp: 3000, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(noop.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // buildSwmSessionSummary
  // ---------------------------------------------------------------------------

  test('buildSwmSessionSummary computes correct stats', () => {
    const summary = buildSwmSessionSummary([
      {
        span: 4,
        tokensToFind: 1,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 1,
        correct: true,
        roundTimeMs: 500,
      },
      {
        span: 4,
        tokensToFind: 1,
        withinSearchErrors: 2,
        betweenSearchErrors: 1,
        totalErrors: 3,
        searchesUsed: 4,
        correct: false,
        roundTimeMs: 1200,
      },
    ]);

    expect(summary.correctRounds).toBe(1);
    expect(summary.totalRounds).toBe(2);
    expect(summary.accuracy).toBe(50);
    expect(summary.maxSpanReached).toBe(4);
    expect(summary.totalWithinErrors).toBe(2);
    expect(summary.totalBetweenErrors).toBe(1);
    expect(summary.totalErrors).toBe(3);
    expect(summary.avgRoundTimeMs).toBe(850); // (500+1200)/2
  });

  test('buildSwmSessionSummary handles empty results', () => {
    const summary = buildSwmSessionSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.maxSpanReached).toBe(0);
    expect(summary.totalErrors).toBe(0);
    expect(summary.avgRoundTimeMs).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Session end event content
  // ---------------------------------------------------------------------------

  test('session end event has correct structure', () => {
    const config: SwmSessionMachineConfig = { ...baseConfig, maxTrials: 1 };
    const s = createInitialSwmSessionState();
    const t = apply(
      s,
      [
        {
          type: 'BEGIN_ROUND',
          tokenPosition: 0,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'OPEN_BOX', position: 0, timestamp: 1500 },
      ],
      config,
    );

    const end = transitionSwmSessionMachine(
      t.state,
      { type: 'NEXT_ROUND', tokenPosition: 1, timestamp: 2000 },
      config,
    );

    const endEvent = end.eventDrafts.find((e) => e.type === 'SWM_SESSION_ENDED');
    expect(endEvent).toBeDefined();
    const ev = endEvent as { type: string; reason: string; durationMs: number };
    expect(ev.reason).toBe('completed');
    expect(ev.durationMs).toBe(1000); // 2000 - 1000
  });
});
