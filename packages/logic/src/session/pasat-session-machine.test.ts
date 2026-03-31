import { describe, expect, test } from 'bun:test';
import {
  createInitialPasatSessionState,
  transitionPasatSessionMachine,
  buildPasatSessionSummary,
  type PasatSessionMachineConfig,
  type PasatSessionMachineState,
  type PasatSessionMachineAction,
  type PasatSessionMachineTransition,
} from './pasat-session-machine';

const baseConfig: PasatSessionMachineConfig = {
  defaultIsiMs: 3000,
  minIsiMs: 1000,
  isiStepMs: 200,
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
  state: PasatSessionMachineState,
  actions: PasatSessionMachineAction[],
  config = baseConfig,
): PasatSessionMachineTransition {
  let transition: PasatSessionMachineTransition = { state, eventDrafts: [] };
  for (const action of actions) {
    transition = transitionPasatSessionMachine(transition.state, action, config);
  }
  return transition;
}

describe('pasat-session-machine', () => {
  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  test('creates correct initial state', () => {
    const s = createInitialPasatSessionState();
    expect(s.sessionPhase).toBe('playing');
    expect(s.trialPhase).toBe('idle');
    expect(s.previousNumber).toBeNull();
    expect(s.currentNumber).toBeNull();
    expect(s.sessionStarted).toBe(false);
    expect(s.results).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // BEGIN_SESSION
  // ---------------------------------------------------------------------------

  test('BEGIN_SESSION starts session and emits started event', () => {
    const s = createInitialPasatSessionState();
    const t = transitionPasatSessionMachine(
      s,
      {
        type: 'BEGIN_SESSION',
        firstNumber: 5,
        timestamp: 1000,
        userId: 'user-1',
        device,
        context,
      },
      baseConfig,
    );

    expect(t.state.sessionStarted).toBe(true);
    expect(t.state.trialPhase).toBe('showing_first');
    expect(t.state.currentNumber).toBe(5);
    expect(t.state.previousNumber).toBeNull();
    expect(t.state.currentIsiMs).toBe(baseConfig.defaultIsiMs);
    expect(t.state.startedAtMs).toBe(1000);
    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('PASAT_SESSION_STARTED');
  });

  test('BEGIN_SESSION is ignored if not idle', () => {
    const s = createInitialPasatSessionState();
    const t = transitionPasatSessionMachine(
      s,
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      baseConfig,
    );
    const again = transitionPasatSessionMachine(
      t.state,
      { type: 'BEGIN_SESSION', firstNumber: 7, timestamp: 1100, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(again.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // SHOW_NUMBER — first → awaiting_response
  // ---------------------------------------------------------------------------

  test('SHOW_NUMBER after showing_first transitions to awaiting_response', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
    ]);

    expect(t.state.trialPhase).toBe('awaiting_response');
    expect(t.state.previousNumber).toBe(5);
    expect(t.state.currentNumber).toBe(3);
    expect(t.state.stimulusShownAtMs).toBe(2000);
  });

  test('SHOW_NUMBER is ignored in awaiting_response', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
    ]);
    const again = transitionPasatSessionMachine(
      t.state,
      { type: 'SHOW_NUMBER', number: 9, timestamp: 2500 },
      baseConfig,
    );
    expect(again.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // RESPOND — correct answer
  // ---------------------------------------------------------------------------

  test('correct RESPOND creates trial result and transitions to feedback', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'RESPOND', answer: 8, timestamp: 2500 }, // 5+3=8
    ]);

    expect(t.state.trialPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);

    const result = t.state.results[0]!;
    expect(result.correct).toBe(true);
    expect(result.correctAnswer).toBe(8);
    expect(result.playerAnswer).toBe(8);
    expect(result.responseTimeMs).toBe(500); // 2500 - 2000

    expect(t.state.consecutiveCorrect).toBe(1);
    expect(t.state.consecutiveFailures).toBe(0);

    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]!.type).toBe('PASAT_TRIAL_COMPLETED');
  });

  test('incorrect RESPOND records failure', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'RESPOND', answer: 7, timestamp: 2500 }, // wrong, 5+3=8
    ]);

    expect(t.state.results[0]!.correct).toBe(false);
    expect(t.state.consecutiveCorrect).toBe(0);
    expect(t.state.consecutiveFailures).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // TIMEOUT — missed response
  // ---------------------------------------------------------------------------

  test('TIMEOUT records null answer and increments failures', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'TIMEOUT', timestamp: 5000 },
    ]);

    expect(t.state.trialPhase).toBe('feedback');
    expect(t.state.results).toHaveLength(1);

    const result = t.state.results[0]!;
    expect(result.playerAnswer).toBeNull();
    expect(result.correct).toBe(false);
    expect(result.responseTimeMs).toBe(3000); // 5000 - 2000
    expect(t.state.consecutiveCorrect).toBe(0);
    expect(t.state.consecutiveFailures).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // ISI adjustment — speedup every 3 consecutive correct
  // ---------------------------------------------------------------------------

  test('ISI decreases after 3 consecutive correct responses', () => {
    const s = createInitialPasatSessionState();
    // Trial 1: correct
    let t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 1, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 2, timestamp: 2000 },
      { type: 'RESPOND', answer: 3, timestamp: 2500 }, // 1+2=3
    ]);
    expect(t.state.currentIsiMs).toBe(3000); // no change after 1 correct

    // Trial 2: correct
    t = apply(t.state, [
      { type: 'NEXT_TRIAL', number: 4, timestamp: 3000 },
      { type: 'RESPOND', answer: 6, timestamp: 3500 }, // 2+4=6
    ]);
    expect(t.state.currentIsiMs).toBe(3000); // no change after 2 correct

    // Trial 3: correct — triggers speedup
    t = apply(t.state, [
      { type: 'NEXT_TRIAL', number: 5, timestamp: 4000 },
      { type: 'RESPOND', answer: 9, timestamp: 4500 }, // 4+5=9
    ]);
    expect(t.state.currentIsiMs).toBe(2800); // 3000 - 200
    expect(t.state.consecutiveCorrect).toBe(3);
  });

  test('ISI does not go below minIsiMs', () => {
    const config: PasatSessionMachineConfig = {
      ...baseConfig,
      defaultIsiMs: 1100,
      minIsiMs: 1000,
      isiStepMs: 200,
    };

    const s = createInitialPasatSessionState();
    // 3 correct answers should try to reduce from 1100 to 900, but clamp at 1000
    let t = apply(
      s,
      [
        {
          type: 'BEGIN_SESSION',
          firstNumber: 1,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'SHOW_NUMBER', number: 2, timestamp: 2000 },
        { type: 'RESPOND', answer: 3, timestamp: 2500 },
      ],
      config,
    );
    t = apply(
      t.state,
      [
        { type: 'NEXT_TRIAL', number: 3, timestamp: 3000 },
        { type: 'RESPOND', answer: 5, timestamp: 3500 },
      ],
      config,
    );
    t = apply(
      t.state,
      [
        { type: 'NEXT_TRIAL', number: 4, timestamp: 4000 },
        { type: 'RESPOND', answer: 7, timestamp: 4500 },
      ],
      config,
    );

    expect(t.state.currentIsiMs).toBe(1000); // clamped
  });

  test('incorrect response resets consecutive correct streak', () => {
    const s = createInitialPasatSessionState();
    // 2 correct then 1 wrong
    let t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 1, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 2, timestamp: 2000 },
      { type: 'RESPOND', answer: 3, timestamp: 2500 },
    ]);
    t = apply(t.state, [
      { type: 'NEXT_TRIAL', number: 3, timestamp: 3000 },
      { type: 'RESPOND', answer: 5, timestamp: 3500 },
    ]);
    expect(t.state.consecutiveCorrect).toBe(2);

    t = apply(t.state, [
      { type: 'NEXT_TRIAL', number: 4, timestamp: 4000 },
      { type: 'RESPOND', answer: 999, timestamp: 4500 }, // wrong
    ]);
    expect(t.state.consecutiveCorrect).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // NEXT_TRIAL
  // ---------------------------------------------------------------------------

  test('NEXT_TRIAL advances to next trial with new number', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'RESPOND', answer: 8, timestamp: 2500 },
      { type: 'NEXT_TRIAL', number: 7, timestamp: 3000 },
    ]);

    expect(t.state.trialPhase).toBe('awaiting_response');
    expect(t.state.previousNumber).toBe(3);
    expect(t.state.currentNumber).toBe(7);
    expect(t.state.trialIndex).toBe(1);
    expect(t.state.stimulusShownAtMs).toBe(3000);
  });

  // ---------------------------------------------------------------------------
  // Consecutive failures → session end
  // ---------------------------------------------------------------------------

  test('maxConsecutiveFailures ends session on NEXT_TRIAL', () => {
    const config: PasatSessionMachineConfig = {
      ...baseConfig,
      maxConsecutiveFailures: 2,
    };

    const s = createInitialPasatSessionState();
    // Fail trial 1
    let t = apply(
      s,
      [
        {
          type: 'BEGIN_SESSION',
          firstNumber: 1,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'SHOW_NUMBER', number: 2, timestamp: 2000 },
        { type: 'RESPOND', answer: 999, timestamp: 2500 },
      ],
      config,
    );
    // Fail trial 2
    t = apply(
      t.state,
      [
        { type: 'NEXT_TRIAL', number: 3, timestamp: 3000 },
        { type: 'RESPOND', answer: 999, timestamp: 3500 },
      ],
      config,
    );

    // NEXT_TRIAL should finalize
    const end = transitionPasatSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', number: 4, timestamp: 4000 },
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
    const config: PasatSessionMachineConfig = {
      ...baseConfig,
      maxTrials: 1,
    };

    const s = createInitialPasatSessionState();
    const t = apply(
      s,
      [
        {
          type: 'BEGIN_SESSION',
          firstNumber: 1,
          timestamp: 1000,
          userId: 'user-1',
          device,
          context,
        },
        { type: 'SHOW_NUMBER', number: 2, timestamp: 2000 },
        { type: 'RESPOND', answer: 3, timestamp: 2500 },
      ],
      config,
    );

    const end = transitionPasatSessionMachine(
      t.state,
      { type: 'NEXT_TRIAL', number: 4, timestamp: 3000 },
      config,
    );

    expect(end.state.sessionPhase).toBe('finished');
    expect(end.state.endReason).toBe('completed');
    expect(end.completionDraft).toBeDefined();
    expect(end.completionDraft!.correctTrials).toBe(1);
    expect(end.completionDraft!.totalTrials).toBe(1);
    expect(end.completionDraft!.accuracy).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // ABANDON
  // ---------------------------------------------------------------------------

  test('ABANDON ends session immediately', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
    ]);

    const abandoned = transitionPasatSessionMachine(
      t.state,
      { type: 'ABANDON', timestamp: 3000 },
      baseConfig,
    );

    expect(abandoned.state.sessionPhase).toBe('finished');
    expect(abandoned.state.endReason).toBe('abandoned');
    expect(abandoned.completionDraft).toBeDefined();
    expect(abandoned.completionDraft!.reason).toBe('abandoned');
    expect(abandoned.completionDraft!.durationMs).toBe(2000); // 3000 - 1000
  });

  // ---------------------------------------------------------------------------
  // RESTART
  // ---------------------------------------------------------------------------

  test('RESTART resets to initial state', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
    ]);
    const restarted = transitionPasatSessionMachine(t.state, { type: 'RESTART' }, baseConfig);

    expect(restarted.state).toEqual(createInitialPasatSessionState());
  });

  // ---------------------------------------------------------------------------
  // Guards — finished session ignores actions
  // ---------------------------------------------------------------------------

  test('actions are ignored when session is finished', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'ABANDON', timestamp: 2000 },
    ]);

    const noop = transitionPasatSessionMachine(
      t.state,
      { type: 'BEGIN_SESSION', firstNumber: 1, timestamp: 3000, userId: 'user-1', device, context },
      baseConfig,
    );
    expect(noop.state).toBe(t.state);
  });

  // ---------------------------------------------------------------------------
  // buildPasatSessionSummary
  // ---------------------------------------------------------------------------

  test('buildPasatSessionSummary computes correct stats', () => {
    const summary = buildPasatSessionSummary([
      {
        previousNumber: 5,
        currentNumber: 3,
        correctAnswer: 8,
        playerAnswer: 8,
        correct: true,
        responseTimeMs: 500,
        isiMs: 3000,
      },
      {
        previousNumber: 3,
        currentNumber: 7,
        correctAnswer: 10,
        playerAnswer: 11,
        correct: false,
        responseTimeMs: 600,
        isiMs: 3000,
      },
      {
        previousNumber: 7,
        currentNumber: 2,
        correctAnswer: 9,
        playerAnswer: null,
        correct: false,
        responseTimeMs: 3000,
        isiMs: 2800,
      },
    ]);

    expect(summary.correctTrials).toBe(1);
    expect(summary.totalTrials).toBe(3);
    expect(summary.accuracy).toBe(33);
    expect(summary.fastestIsiMs).toBe(2800);
    // avgResponseTimeMs only counts non-null answers: (500 + 600) / 2 = 550
    expect(summary.avgResponseTimeMs).toBe(550);
  });

  test('buildPasatSessionSummary handles empty results', () => {
    const summary = buildPasatSessionSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.fastestIsiMs).toBe(0);
    expect(summary.avgResponseTimeMs).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // responseTimeMs calculation
  // ---------------------------------------------------------------------------

  test('responseTimeMs is calculated from stimulus shown time', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'RESPOND', answer: 8, timestamp: 2750 },
    ]);
    expect(t.state.results[0]!.responseTimeMs).toBe(750);
  });

  test('timeout responseTimeMs is calculated from stimulus shown time', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'TIMEOUT', timestamp: 5000 },
    ]);
    expect(t.state.results[0]!.responseTimeMs).toBe(3000);
  });

  // ---------------------------------------------------------------------------
  // TIMEOUT event draft has playerAnswer=-1
  // ---------------------------------------------------------------------------

  test('TIMEOUT event draft uses -1 for playerAnswer', () => {
    const s = createInitialPasatSessionState();
    const t = apply(s, [
      { type: 'BEGIN_SESSION', firstNumber: 5, timestamp: 1000, userId: 'user-1', device, context },
      { type: 'SHOW_NUMBER', number: 3, timestamp: 2000 },
      { type: 'TIMEOUT', timestamp: 5000 },
    ]);
    const trialEvent = t.eventDrafts.find((e) => e.type === 'PASAT_TRIAL_COMPLETED') as {
      type: string;
      playerAnswer: number;
    };
    expect(trialEvent).toBeDefined();
    expect(trialEvent.playerAnswer).toBe(-1);
  });
});
