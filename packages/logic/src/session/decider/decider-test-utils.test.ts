import { describe, expect, it } from 'vitest';
import { givenDecider } from './decider-test-utils';
import type { SessionDecider, SessionEventDraft } from './session-decider';

// =============================================================================
// Trivial inline decider for testing the harness
// =============================================================================

interface CounterState {
  count: number;
  finished: boolean;
}

type CounterAction = { type: 'INCREMENT' } | { type: 'DECREMENT' } | { type: 'FINISH' };

interface CounterConfig {
  maxCount: number;
}

interface CounterEventDraft extends SessionEventDraft {
  type: 'COUNTER_STARTED' | 'COUNTER_CHANGED' | 'COUNTER_ENDED';
}

interface CounterCompletionDraft {
  finalCount: number;
}

const counterDecider: SessionDecider<
  CounterState,
  CounterAction,
  CounterConfig,
  CounterEventDraft,
  CounterCompletionDraft
> = {
  modeId: 'counter',
  completionMode: 'counter',

  initialState: () => ({ count: 0, finished: false }),

  decide(state, action, config) {
    if (state.finished) return { state, eventDrafts: [] };

    switch (action.type) {
      case 'INCREMENT': {
        const newCount = Math.min(state.count + 1, config.maxCount);
        const eventDrafts: CounterEventDraft[] = [{ type: 'COUNTER_CHANGED' }];

        if (newCount >= config.maxCount) {
          return {
            state: { count: newCount, finished: true },
            eventDrafts: [...eventDrafts, { type: 'COUNTER_ENDED' }],
            completionDraft: { finalCount: newCount },
          };
        }

        return {
          state: { count: newCount, finished: false },
          eventDrafts,
        };
      }
      case 'DECREMENT':
        return {
          state: { count: Math.max(0, state.count - 1), finished: false },
          eventDrafts: [{ type: 'COUNTER_CHANGED' }],
        };
      case 'FINISH':
        return {
          state: { ...state, finished: true },
          eventDrafts: [{ type: 'COUNTER_ENDED' }],
          completionDraft: { finalCount: state.count },
        };
      default:
        return { state, eventDrafts: [] };
    }
  },
};

// =============================================================================
// Tests
// =============================================================================

describe('givenDecider', () => {
  it('starts at initialState', () => {
    const h = givenDecider(counterDecider, { maxCount: 5 });
    expect(h.state).toEqual({ count: 0, finished: false });
  });

  it('when() applies a single action and advances state', () => {
    const h = givenDecider(counterDecider, { maxCount: 5 });
    const t = h.when({ type: 'INCREMENT' });

    expect(t.state.count).toBe(1);
    expect(t.eventDrafts).toHaveLength(1);
    expect(t.eventDrafts[0]?.type).toBe('COUNTER_CHANGED');
    // Harness state is also updated
    expect(h.state.count).toBe(1);
  });

  it('given() overrides the current state', () => {
    const h = givenDecider(counterDecider, { maxCount: 5 });
    h.given({ count: 3, finished: false });

    expect(h.state.count).toBe(3);

    const t = h.when({ type: 'INCREMENT' });
    expect(t.state.count).toBe(4);
  });

  it('whenAll() applies a sequence and returns the last transition', () => {
    const h = givenDecider(counterDecider, { maxCount: 10 });
    const t = h.whenAll([{ type: 'INCREMENT' }, { type: 'INCREMENT' }, { type: 'INCREMENT' }]);

    expect(h.state.count).toBe(3);
    // Last transition only has the last action's drafts
    expect(t.eventDrafts).toHaveLength(1);
  });

  it('collectEvents() gathers all drafts from a sequence', () => {
    const h = givenDecider(counterDecider, { maxCount: 10 });
    const drafts = h.collectEvents([
      { type: 'INCREMENT' },
      { type: 'INCREMENT' },
      { type: 'DECREMENT' },
    ]);

    // 3 actions × 1 COUNTER_CHANGED each = 3 drafts
    expect(drafts).toHaveLength(3);
    expect(drafts.every((d) => d.type === 'COUNTER_CHANGED')).toBe(true);
  });

  it('produces completionDraft when session ends via maxCount', () => {
    const h = givenDecider(counterDecider, { maxCount: 2 });

    h.when({ type: 'INCREMENT' });
    const t = h.when({ type: 'INCREMENT' });

    expect(t.state.finished).toBe(true);
    expect(t.completionDraft).toEqual({ finalCount: 2 });
    // COUNTER_CHANGED + COUNTER_ENDED
    expect(t.eventDrafts).toHaveLength(2);
  });

  it('produces completionDraft when session ends via FINISH action', () => {
    const h = givenDecider(counterDecider, { maxCount: 10 });
    h.given({ count: 7, finished: false });

    const t = h.when({ type: 'FINISH' });

    expect(t.state.finished).toBe(true);
    expect(t.completionDraft).toEqual({ finalCount: 7 });
  });

  it('ignores actions after session is finished', () => {
    const h = givenDecider(counterDecider, { maxCount: 10 });
    h.given({ count: 5, finished: true });

    const t = h.when({ type: 'INCREMENT' });

    expect(t.state.count).toBe(5);
    expect(t.eventDrafts).toHaveLength(0);
  });
});
