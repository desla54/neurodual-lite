import { describe, expect, test } from 'bun:test';
import {
  createInitialCorsiSessionState,
  transitionCorsiSessionMachine,
  type CorsiSessionMachineConfig,
} from './corsi-session-machine';

const baseConfig: CorsiSessionMachineConfig = {
  startSpan: 2,
  maxSpan: 9,
  maxConsecutiveFailures: 2,
  direction: 'forward',
  maxTrials: 20,
  playContext: 'free',
};

describe('corsi-session-machine', () => {
  test('replays the current trial without emitting events', () => {
    const initialState = createInitialCorsiSessionState();
    const started = transitionCorsiSessionMachine(
      initialState,
      {
        type: 'BEGIN_TRIAL',
        sequence: [0, 4, 8],
        timestamp: 1000,
        userId: 'user-1',
        device: {
          platform: 'web',
          screenWidth: 1440,
          screenHeight: 900,
          userAgent: 'test',
          touchCapable: true,
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      },
      baseConfig,
    );

    const recalling = transitionCorsiSessionMachine(
      started.state,
      { type: 'BEGIN_RECALL', timestamp: 2000 },
      baseConfig,
    );

    const tappedOnce = transitionCorsiSessionMachine(
      recalling.state,
      { type: 'TAP_BLOCK', position: 0, timestamp: 2200 },
      baseConfig,
    );

    const replayed = transitionCorsiSessionMachine(
      tappedOnce.state,
      { type: 'REPLAY_CURRENT_TRIAL' },
      baseConfig,
    );

    expect(replayed.eventDrafts).toHaveLength(0);
    expect(replayed.state.trialPhase).toBe('presenting');
    expect(replayed.state.currentSequence).toEqual([0, 4, 8]);
    expect(replayed.state.playerInput).toEqual([]);
    expect(replayed.state.trialIndex).toBe(0);
    expect(replayed.state.results).toHaveLength(0);
  });
});
