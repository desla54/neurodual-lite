/**
 * ReplayRecoveryProjector - Extract recoverable replay state from events
 *
 * Pure function that projects replay events into a RecoveredReplayState object.
 * Used when resuming an interrupted interactive replay after page refresh.
 *
 * Returns null if:
 * - Run status is 'completed'
 * - No events found
 */

import type { ReplayRun, ReplayEvent } from '../types/replay-interactif';
import type { RecoveredReplayState } from '../types/recovery';

// =============================================================================
// Constants
// =============================================================================

/** Consider stale if snapshot is older than 30 minutes */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

// =============================================================================
// Projector
// =============================================================================

export class ReplayRecoveryProjector {
  /**
   * Project a run and its events into recoverable state.
   * Returns null if the run is not recoverable.
   *
   * @param run - The replay run to recover
   * @param events - Events already emitted in this run
   * @param snapshotTimestamp - When the snapshot was created (for staleness check)
   */
  static project(
    run: ReplayRun,
    events: readonly ReplayEvent[],
    snapshotTimestamp?: number,
  ): RecoveredReplayState | null {
    // Completed runs are not recoverable
    if (run.status === 'completed') {
      return null;
    }

    // Empty runs with no events aren't worth recovering
    if (events.length === 0) {
      return null;
    }

    // Find the last timestamp and trial index from events
    const lastTimeMs = ReplayRecoveryProjector.getLastTimeMs(events);
    const lastTrialIndex = ReplayRecoveryProjector.getLastTrialIndex(events);

    // Check staleness if snapshot timestamp provided
    const isStale = snapshotTimestamp ? Date.now() - snapshotTimestamp > STALE_THRESHOLD_MS : false;

    return {
      run,
      emittedEvents: events,
      lastTimeMs,
      lastTrialIndex,
      isStale,
    };
  }

  /**
   * Get the last timestamp from events.
   * Uses the highest timestamp found.
   */
  static getLastTimeMs(events: readonly ReplayEvent[]): number {
    if (events.length === 0) return 0;

    return events.reduce((max, event) => Math.max(max, event.timestamp), 0);
  }

  /**
   * Get the last trial index from events.
   * Looks for TRIAL_PRESENTED or similar events and extracts trial.index.
   */
  static getLastTrialIndex(events: readonly ReplayEvent[]): number {
    const trialEvents = events.filter(
      (e) =>
        e.type === 'TRIAL_PRESENTED' ||
        e.type === 'FLOW_STIMULUS_SHOWN' ||
        e.type === 'RECALL_STIMULUS_SHOWN' ||
        e.type === 'DUAL_PICK_STIMULUS_SHOWN',
    );

    if (trialEvents.length === 0) return -1;

    // Extract trial index from payload
    const lastTrialEvent = trialEvents[trialEvents.length - 1];
    const payload = lastTrialEvent?.payload as { trial?: { index?: number } } | undefined;

    return payload?.trial?.index ?? trialEvents.length - 1;
  }

  /**
   * Count active (non-skipped) events.
   */
  static countActiveEvents(events: readonly ReplayEvent[]): number {
    return events.filter((e) => !e.skipped).length;
  }

  /**
   * Check if a run has meaningful progress worth recovering.
   * A run with only structure events (no user responses) may not be worth recovering.
   */
  static hasUserProgress(events: readonly ReplayEvent[]): boolean {
    return events.some((e) => e.actor === 'user');
  }
}
