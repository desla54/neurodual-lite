/**
 * SessionDecider — Shared contract for all pure session state machines.
 *
 * Formalizes the pattern already used by 6 pure reducers (Corsi, Time, OSPAN,
 * RunningSpan, PASAT, SWM): `(state, action, config) → { state, eventDrafts[], completionDraft? }`.
 *
 * Event drafts are PURE data — no id, timestamp, sessionId, seq, or schemaVersion.
 * The envelope is added downstream by EventEnvelopeFactory (in the hook or test harness).
 *
 * Phase 0: interface only — no game mode implements it yet.
 */

// =============================================================================
// Event Draft
// =============================================================================

/**
 * Minimal shape for a session event draft emitted by a decider.
 * Must have a `type` discriminant; everything else is mode-specific.
 */
export interface SessionEventDraft {
  readonly type: string;
  readonly [key: string]: unknown;
}

// =============================================================================
// Completion Draft
// =============================================================================

/**
 * Minimal shape for a session completion draft.
 * Carries the data needed by the session-end pipeline, minus fields
 * that the envelope factory provides (mode, sessionId, events, gameModeLabel).
 *
 * Uses Record<string, unknown> so concrete types (interfaces without index signatures)
 * are assignable without friction.
 */
export type SessionCompletionDraft = Record<string, unknown>;

// =============================================================================
// Decider Transition
// =============================================================================

/**
 * Result of a single `decide` call.
 * Mirrors the existing `*SessionMachineTransition` types (e.g. CorsiSessionMachineTransition).
 */
export interface DeciderTransition<
  TState,
  TEventDraft extends SessionEventDraft = SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft = SessionCompletionDraft,
> {
  readonly state: TState;
  readonly eventDrafts: readonly TEventDraft[];
  readonly completionDraft?: TCompletionDraft;
}

// =============================================================================
// SessionDecider
// =============================================================================

/**
 * A SessionDecider is a pure state machine that:
 * 1. Takes (state, action, config) and returns the next state + event drafts.
 * 2. Can produce a completionDraft when the session ends.
 * 3. Has no side effects — no I/O, no randomness, no timestamps.
 *
 * @template TState    — Machine state (e.g. CorsiSessionMachineState)
 * @template TAction   — Union of actions (e.g. CorsiSessionMachineAction)
 * @template TConfig   — Configuration (e.g. CorsiSessionMachineConfig)
 * @template TEventDraft      — Event draft type (e.g. CorsiSessionEventDraft)
 * @template TCompletionDraft — Completion draft (e.g. CorsiCompletionDraft)
 */
export interface SessionDecider<
  TState,
  TAction,
  TConfig,
  TEventDraft extends SessionEventDraft = SessionEventDraft,
  TCompletionDraft extends SessionCompletionDraft = SessionCompletionDraft,
> {
  /** Unique identifier for this game mode (e.g. 'corsi-block', 'time-estimation'). */
  readonly modeId: string;

  /**
   * Discriminant used by the session-end pipeline to route completion.
   * Matches the `mode` field in `SessionCompletionInput` (e.g. 'corsi', 'time').
   */
  readonly completionMode: string;

  /** Create a fresh initial state. */
  initialState(): TState;

  /**
   * Pure transition: given current state + action + config, produce next state
   * and zero or more event drafts. If the session ends, also produce a completionDraft.
   */
  decide(
    state: TState,
    action: TAction,
    config: TConfig,
  ): DeciderTransition<TState, TEventDraft, TCompletionDraft>;
}
