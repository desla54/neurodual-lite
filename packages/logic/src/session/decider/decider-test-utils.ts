/**
 * DeciderTestHarness — Ergonomic test helper for SessionDecider implementations.
 *
 * Usage:
 *   const h = givenDecider(myDecider, myConfig);
 *   const t1 = h.when(someAction);
 *   expect(t1.state.phase).toBe('playing');
 *   expect(t1.eventDrafts).toHaveLength(1);
 *
 *   // Sequence of actions:
 *   const t2 = h.whenAll([action1, action2, action3]);
 *   expect(t2.state.phase).toBe('finished');
 *
 *   // Collect all event drafts from a sequence:
 *   const drafts = h.collectEvents([action1, action2]);
 *   expect(drafts).toHaveLength(3);
 */

import type {
  DeciderTransition,
  SessionCompletionDraft,
  SessionDecider,
  SessionEventDraft,
} from './session-decider';

// =============================================================================
// Harness
// =============================================================================

export interface DeciderTestHarness<
  TState,
  TAction,
  TConfig,
  TEventDraft extends SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft,
> {
  /** Current state (starts at initialState, advances after each `when`/`whenAll`). */
  readonly state: TState;

  /** Override current state (for setting up specific scenarios). */
  given(state: TState): DeciderTestHarness<TState, TAction, TConfig, TEventDraft, TCompletionDraft>;

  /** Apply a single action. Returns the transition and advances internal state. */
  when(action: TAction): DeciderTransition<TState, TEventDraft, TCompletionDraft>;

  /** Apply a sequence of actions. Returns the LAST transition. Advances internal state through all. */
  whenAll(actions: readonly TAction[]): DeciderTransition<TState, TEventDraft, TCompletionDraft>;

  /** Apply a sequence and collect ALL event drafts produced across all transitions. */
  collectEvents(actions: readonly TAction[]): readonly TEventDraft[];
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a test harness for a SessionDecider.
 */
export function givenDecider<
  TState,
  TAction,
  TConfig,
  TEventDraft extends SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft,
>(
  decider: SessionDecider<TState, TAction, TConfig, TEventDraft, TCompletionDraft>,
  config: TConfig,
): DeciderTestHarness<TState, TAction, TConfig, TEventDraft, TCompletionDraft> {
  let currentState = decider.initialState();

  const harness: DeciderTestHarness<TState, TAction, TConfig, TEventDraft, TCompletionDraft> = {
    get state() {
      return currentState;
    },

    given(state) {
      currentState = state;
      return harness;
    },

    when(action) {
      const transition = decider.decide(currentState, action, config);
      currentState = transition.state;
      return transition;
    },

    whenAll(actions) {
      let last: DeciderTransition<TState, TEventDraft, TCompletionDraft> = {
        state: currentState,
        eventDrafts: [],
      };
      for (const action of actions) {
        last = harness.when(action);
      }
      return last;
    },

    collectEvents(actions) {
      const allDrafts: TEventDraft[] = [];
      for (const action of actions) {
        const transition = harness.when(action);
        allDrafts.push(...transition.eventDrafts);
      }
      return allDrafts;
    },
  };

  return harness;
}
