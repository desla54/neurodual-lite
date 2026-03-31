/**
 * Decider module — Shared contract for pure session state machines.
 *
 * Phase 0: interfaces + envelope factory + test utilities.
 * No game mode implements SessionDecider yet (Phase 1+).
 */

// Core interface + types
export type {
  SessionDecider,
  SessionEventDraft,
  SessionCompletionDraft,
  DeciderTransition,
} from './session-decider';

// Envelope factory
export { createEnvelopeFactory } from './event-envelope-factory';
export type {
  EnvelopeFactoryConfig,
  EventEnvelopeFactory,
  MaterializedEvent,
} from './event-envelope-factory';

// Test utilities
export { givenDecider } from './decider-test-utils';
export type { DeciderTestHarness } from './decider-test-utils';
