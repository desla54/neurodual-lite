/**
 * Replay Projector
 *
 * Projects events to snapshots at any given time for replay.
 * Enables reusing game UI components with historical sessions.
 */

import type { BlockConfig, ModalityId, Sound, Trial } from '../types/core';
import type { SkipReason } from '../types/replay-interactif';
import type { ModeSpec } from '../specs/types';
import type {
  GameEvent,
  SessionStartedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
  SessionSummary,
  PlaceSessionStartedEvent,
  PlaceStimulusShownEvent,
  PlacePlacementStartedEvent,
  PlaceDropAttemptedEvent,
  PlaceTurnCompletedEvent,
  MemoSessionStartedEvent,
  MemoStimulusShownEvent,
  RecallWindowOpenedEvent,
  RecallPickedEvent,
  RecallWindowCommittedEvent,
  MotSessionStartedEvent,
  MotTrialDefinedEvent,
  MotTrialCompletedEvent,
  MotSessionEndedEvent,
} from './events';
import type { SessionPhase, SessionSnapshot } from '../session/game-session-types';
import type { PlaceSessionMachineSnapshot as PlaceSessionSnapshot } from '../session/machine/place-session-types';
import type {
  PlaceSessionConfig,
  PlacePhase,
  PlaceProposal,
  PlaceRunningStats,
} from '../types/place';
import type {
  MemoSessionConfig,
  MemoRunningStats,
  ModalityPick,
  WindowPicks,
  FillCell,
  MemoTrend,
} from '../types/memo';
import { getWindowDepthForTrial } from '../types/memo';
import type { MemoSessionSnapshot, MemoPhase } from '../session/machine/memo-session-types';
import { SDTCalculator } from '../domain/scoring/helpers/sdt-calculator';
import { getIsTarget } from '../domain/modality';
import type { CompactTrajectory } from '../types/trajectory';
import {
  decodeTrajectory,
  interpolateTrajectory,
  getTrajectoryDuration,
} from '../types/trajectory';
import {
  REPLAY_LANDING_BUFFER_MS,
  REPLAY_FALLBACK_PLACEMENT_MS,
  REPLAY_FALLBACK_RECALL_MS,
  TIMING_SESSION_PREP_MS,
} from '../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

/** Timeline segment representing a phase in the replay */
interface TimelineSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly phase: SessionPhase;
  readonly trialIndex: number;
  readonly trial: Trial | null;
  readonly isiMs: number;
  readonly stimulusDurationMs: number;
}

/** Response at a specific trial for replay */
interface TrialResponse {
  readonly trialIndex: number;
  readonly modality: ModalityId;
  readonly reactionTimeMs: number;
  readonly timestampMs: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get whether a trial is a target for a given modality.
 */
function isTrialTarget(trial: Trial, modality: ModalityId): boolean {
  return getIsTarget(trial, modality);
}

// =============================================================================
// Interactive Replay - Skippable Event Detection
// =============================================================================

import type { ReplaySessionType } from '../ports/replay-port';

/**
 * Identifies which events should be skipped in interactive replay.
 *
 * For Tempo: A USER_RESPONDED is a "false alarm" if the response modality
 * was NOT a target for that trial.
 *
 * For Flow/DualPick: A drop is an "error" if the drop was incorrect.
 *
 * For Recall: A pick is an "error" if it doesn't match the expected value.
 *
 * @param events - Original session events
 * @param sessionType - Type of session for mode-specific handling
 * @returns Map of eventId → skipReason for events that should be skipped
 */
export function identifySkippableEvents(
  events: readonly GameEvent[],
  sessionType: ReplaySessionType = 'tempo',
): Map<string, SkipReason> {
  switch (sessionType) {
    case 'tempo':
      return identifyTempoSkippableEvents(events);
    case 'flow':
      return identifyPlaceSkippableEvents(events);
    case 'recall':
      return identifyRecallSkippableEvents(events);
    case 'dual-pick':
      return identifyDualPickSkippableEvents(events);
    case 'track':
      return new Map();
  }
}

/**
 * Identify skippable events for Tempo mode.
 * A USER_RESPONDED is a "false alarm" if the response modality was NOT a target.
 */
function identifyTempoSkippableEvents(events: readonly GameEvent[]): Map<string, SkipReason> {
  const skippable = new Map<string, SkipReason>();

  // Build trial map from TRIAL_PRESENTED events
  const trialMap = new Map<number, Trial>();
  for (const event of events) {
    if (event.type === 'TRIAL_PRESENTED') {
      const trialEvent = event as TrialPresentedEvent;
      trialMap.set(trialEvent.trial.index, trialEvent.trial);
    }
  }

  // Check each USER_RESPONDED for false alarms
  for (const event of events) {
    if (event.type === 'USER_RESPONDED') {
      const responseEvent = event as UserResponseEvent;
      // Arithmetic isn't a "target/non-target" match modality in BW; don't classify as false alarm.
      if (responseEvent.modality === 'arithmetic') continue;
      const trial = trialMap.get(responseEvent.trialIndex);

      if (trial) {
        const isTarget = isTrialTarget(trial, responseEvent.modality);
        if (!isTarget) {
          // This response was a false alarm - user pressed for a non-target
          skippable.set(responseEvent.id, 'false_alarm');
        }
      }
    }
  }

  return skippable;
}

/**
 * Identify skippable events for Place mode.
 * A FLOW_DROP_ATTEMPTED is an error if `correct` is false.
 */
function identifyPlaceSkippableEvents(events: readonly GameEvent[]): Map<string, SkipReason> {
  const skippable = new Map<string, SkipReason>();

  for (const event of events) {
    if (event.type === 'FLOW_DROP_ATTEMPTED') {
      const dropEvent = event as PlaceDropAttemptedEvent;
      if (!dropEvent.correct) {
        skippable.set(dropEvent.id, 'error');
      }
    }
  }

  return skippable;
}

/**
 * Identify skippable events for Memo mode.
 * A RECALL_PICKED where isCorrection is true indicates an error was made.
 */
function identifyRecallSkippableEvents(events: readonly GameEvent[]): Map<string, SkipReason> {
  const skippable = new Map<string, SkipReason>();

  // For recall, we skip correction picks (user had to fix a mistake)
  for (const event of events) {
    if (event.type === 'RECALL_PICKED') {
      const pickEvent = event as RecallPickedEvent;
      if (pickEvent.isCorrection) {
        skippable.set(pickEvent.id, 'error');
      }
    }
  }

  return skippable;
}

/**
 * Identify skippable events for DualPick mode.
 * A DUAL_PICK_DROP_ATTEMPTED is an error if `correct` is false.
 */
function identifyDualPickSkippableEvents(events: readonly GameEvent[]): Map<string, SkipReason> {
  const skippable = new Map<string, SkipReason>();

  for (const event of events) {
    if (event.type === 'DUAL_PICK_DROP_ATTEMPTED') {
      const dropEvent = event as import('./events').DualPickDropAttemptedEvent;
      if (!dropEvent.correct) {
        skippable.set(dropEvent.id, 'error');
      }
    }
  }

  return skippable;
}

// =============================================================================
// Tempo Replay Projector
// =============================================================================

export interface TempoReplayData {
  readonly sessionId: string;
  readonly config: BlockConfig;
  /**
   * Mode specification archived at session start.
   * Contains scoring thresholds for faithful replay analysis.
   */
  readonly spec: ModeSpec | null;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly timeline: readonly TimelineSegment[];
  readonly responses: readonly TrialResponse[];
  readonly sessionStartMs: number;
  readonly totalDurationMs: number;
  readonly summary: SessionSummary | null;
}

/**
 * Parse Tempo events and build replay data structure.
 * This is done once when loading the session.
 */
export function parseTempoEvents(events: readonly GameEvent[]): TempoReplayData | null {
  // Find session start event
  const startEvent = events.find((e) => e.type === 'SESSION_STARTED') as
    | SessionStartedEvent
    | undefined;
  if (!startEvent) return null;

  const sessionStartMs = startEvent.timestamp;
  const config = startEvent.config;
  const spec = startEvent.spec ?? null; // Extract archived spec
  const nLevel = startEvent.nLevel;
  const totalTrials = config.trialsCount + nLevel;

  // Build timeline from TRIAL_PRESENTED events
  const trialEvents = events.filter((e) => e.type === 'TRIAL_PRESENTED') as TrialPresentedEvent[];
  const timeline: TimelineSegment[] = [];

  // Add starting phase (before first trial)
  if (trialEvents.length > 0) {
    const firstEvent = trialEvents[0];
    if (firstEvent) {
      const firstTrialMs = firstEvent.timestamp - sessionStartMs;
      if (firstTrialMs > 0) {
        timeline.push({
          startMs: 0,
          endMs: firstTrialMs,
          phase: 'starting',
          trialIndex: 0,
          trial: null,
          isiMs: 0,
          stimulusDurationMs: 0,
        });
      }
    }
  }

  // Add stimulus and waiting phases for each trial
  for (let i = 0; i < trialEvents.length; i++) {
    const event = trialEvents[i];
    if (!event) continue;

    const trialStartMs = event.timestamp - sessionStartMs;
    const stimulusEndMs = trialStartMs + event.stimulusDurationMs;

    const nextEvent = trialEvents[i + 1];
    const nextTrialStartMs = nextEvent
      ? nextEvent.timestamp - sessionStartMs
      : stimulusEndMs + event.isiMs - event.stimulusDurationMs;

    // Stimulus phase
    timeline.push({
      startMs: trialStartMs,
      endMs: stimulusEndMs,
      phase: 'stimulus',
      trialIndex: event.trial.index,
      trial: event.trial,
      isiMs: event.isiMs,
      stimulusDurationMs: event.stimulusDurationMs,
    });

    // Waiting phase (after stimulus, before next trial)
    if (stimulusEndMs < nextTrialStartMs) {
      timeline.push({
        startMs: stimulusEndMs,
        endMs: nextTrialStartMs,
        phase: 'waiting',
        trialIndex: event.trial.index,
        trial: event.trial,
        isiMs: event.isiMs,
        stimulusDurationMs: event.stimulusDurationMs,
      });
    }
  }

  // Collect responses
  const responseEvents = events.filter((e) => e.type === 'USER_RESPONDED') as UserResponseEvent[];
  const responses: TrialResponse[] = responseEvents.map((e) => ({
    trialIndex: e.trialIndex,
    modality: e.modality,
    reactionTimeMs: e.reactionTimeMs,
    timestampMs: e.timestamp - sessionStartMs,
  }));

  // Find session end
  const endEvent = events.find((e) => e.type === 'SESSION_ENDED');
  const lastSegment = timeline[timeline.length - 1];
  const totalDurationMs = endEvent
    ? endEvent.timestamp - sessionStartMs
    : lastSegment
      ? lastSegment.endMs
      : 0;

  // Mark finished phase
  if (lastSegment && lastSegment.endMs < totalDurationMs) {
    timeline.push({
      startMs: lastSegment.endMs,
      endMs: totalDurationMs,
      phase: 'finished',
      trialIndex: lastSegment.trialIndex,
      trial: lastSegment.trial,
      isiMs: 0,
      stimulusDurationMs: 0,
    });
  }

  // Summary is computed on demand, not stored
  const summary: SessionSummary | null = null;

  return {
    sessionId: startEvent.sessionId,
    config,
    spec,
    nLevel,
    totalTrials,
    timeline,
    responses,
    sessionStartMs,
    totalDurationMs,
    summary,
  };
}

/**
 * Project a SessionSnapshot at a specific time.
 * Returns the snapshot as if the game was at that exact moment.
 */
export function projectTempoSnapshot(
  data: TempoReplayData,
  currentTimeMs: number,
): SessionSnapshot {
  // Find current segment
  const segment = data.timeline.find(
    (seg) => currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  // If past all segments, we're finished
  const isFinished = !segment && currentTimeMs >= data.totalDurationMs;

  // Determine phase and trial
  const phase: SessionPhase = isFinished ? 'finished' : (segment?.phase ?? 'idle');
  const trial = segment?.trial ?? null;
  const trialIndex = segment?.trialIndex ?? 0;
  const isi = segment?.isiMs ?? data.config.intervalSeconds * 1000;

  // Build trial history (all trials up to current time)
  const trialHistory: Trial[] = [];
  for (const seg of data.timeline) {
    if (seg.phase === 'stimulus' && seg.trial && seg.startMs <= currentTimeMs) {
      trialHistory.push(seg.trial);
    }
  }

  // Compute d' from responses up to current time
  const dPrime = computeDPrimeAtTime(data, currentTimeMs);

  return {
    phase,
    trial,
    trialIndex,
    totalTrials: data.totalTrials,
    isi,
    prepDelayMs: TIMING_SESSION_PREP_MS, // Default for replay
    message: null,
    dPrime,
    summary: isFinished ? data.summary : null,
    trialHistory,
    nLevel: data.nLevel,
    adaptiveZone: null,
    xpBreakdown: null, // Replay doesn't compute XP
    arithmeticInput: null,
    // Replay uses phase-based visibility (no live audio-visual sync needed)
    stimulusVisible: phase === 'stimulus',
  };
}

/**
 * Compute d' from responses up to a given time.
 */
function computeDPrimeAtTime(data: TempoReplayData, currentTimeMs: number): number {
  // Get all responses up to current time
  const responsesUpToNow = data.responses.filter((r) => r.timestampMs <= currentTimeMs);

  // Get trials that have been presented and completed (past stimulus phase)
  const completedTrialIndices = new Set<number>();
  for (const seg of data.timeline) {
    if (seg.phase === 'waiting' && seg.endMs <= currentTimeMs) {
      completedTrialIndices.add(seg.trialIndex);
    }
  }

  // Build response map
  const responsesByTrial = new Map<number, Set<ModalityId>>();
  for (const r of responsesUpToNow) {
    if (!responsesByTrial.has(r.trialIndex)) {
      responsesByTrial.set(r.trialIndex, new Set());
    }
    responsesByTrial.get(r.trialIndex)?.add(r.modality);
  }

  // Collect stats per modality
  const modalityStats = new Map<
    ModalityId,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >();

  // Exclude arithmetic: it's correctness-based (typed answer), not d' (hit/miss/FA/CR).
  for (const modality of data.config.activeModalities.filter((m) => m !== 'arithmetic')) {
    modalityStats.set(modality, { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 });
  }

  // Process completed trials
  for (const trialIdx of completedTrialIndices) {
    // Find the trial data
    const trialSeg = data.timeline.find(
      (seg) => seg.phase === 'stimulus' && seg.trialIndex === trialIdx,
    );
    if (!trialSeg?.trial) continue;

    const trial = trialSeg.trial;
    const responses = responsesByTrial.get(trialIdx) ?? new Set();

    for (const modality of data.config.activeModalities.filter((m) => m !== 'arithmetic')) {
      const isTarget = isTrialTarget(trial, modality);
      const responded = responses.has(modality);
      const stats = modalityStats.get(modality);
      if (!stats) continue;

      if (isTarget && responded) {
        stats.hits++;
      } else if (isTarget && !responded) {
        stats.misses++;
      } else if (!isTarget && responded) {
        stats.falseAlarms++;
      } else {
        stats.correctRejections++;
      }
    }
  }

  // Compute global d' (average across modalities)
  let totalDPrime = 0;
  let modalityCount = 0;

  for (const [, stats] of modalityStats) {
    const total = stats.hits + stats.misses + stats.falseAlarms + stats.correctRejections;
    if (total > 0) {
      const dPrime = SDTCalculator.calculateDPrime(
        stats.hits,
        stats.misses,
        stats.falseAlarms,
        stats.correctRejections,
      );
      totalDPrime += dPrime;
      modalityCount++;
    }
  }

  return modalityCount > 0 ? totalDPrime / modalityCount : 0;
}

// =============================================================================
// Response Highlighting
// =============================================================================

/**
 * Get which modalities have active responses at the current time.
 * Used to highlight P/A buttons during replay.
 */
export function getActiveResponsesAtTime(
  data: TempoReplayData,
  currentTimeMs: number,
): Set<ModalityId> {
  const active = new Set<ModalityId>();

  // Find current trial segment
  const currentSegment = data.timeline.find(
    (seg) =>
      (seg.phase === 'stimulus' || seg.phase === 'waiting') &&
      currentTimeMs >= seg.startMs &&
      currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return active;

  // Find the START of the trial (first segment with this trialIndex)
  // This ensures we catch responses from both stimulus and waiting phases
  const trialStart = data.timeline.find((seg) => seg.trialIndex === currentSegment.trialIndex);
  const trialStartMs = trialStart?.startMs ?? currentSegment.startMs;

  // Get responses for current trial that happened before current time
  // Use trial start, not segment start, to catch ISI responses
  const trialResponses = data.responses.filter(
    (r) =>
      r.trialIndex === currentSegment.trialIndex &&
      r.timestampMs <= currentTimeMs &&
      r.timestampMs >= trialStartMs,
  );

  for (const r of trialResponses) {
    active.add(r.modality);
  }

  return active;
}

// =============================================================================
// Flow Replay Projector
// =============================================================================

/** Timeline segment for Flow replay */
interface PlaceTimelineSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly phase: PlacePhase;
  readonly trialIndex: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly PlaceProposal[];
  readonly adaptiveZone: number | null;
}

/** Drop event data for Flow replay */
export interface PlaceDropData {
  readonly timestampMs: number;
  readonly trialIndex: number;
  readonly proposalId: string;
  readonly proposalType: 'position' | 'audio' | 'unified';
  readonly proposalValue: number | string;
  readonly targetSlot: number;
  readonly correct: boolean;
  /** When the drag started (relative to session start) */
  readonly dragStartedAtMs: number | null;
  /** Full trajectory for animation */
  readonly trajectory: CompactTrajectory | null;
}

/** In-flight drag data - a drag currently in progress during replay */
export interface InFlightDrag {
  readonly proposalId: string;
  readonly proposalType: 'position' | 'audio' | 'unified';
  readonly proposalValue: number | string;
  /** Current position (normalized 0-1) */
  readonly x: number;
  readonly y: number;
  /** Progress through the drag (0-1) */
  readonly progress: number;
}

export interface PlaceReplayData {
  readonly sessionId: string;
  readonly config: PlaceSessionConfig;
  /**
   * Mode specification archived at session start.
   * Contains scoring thresholds for faithful replay analysis.
   * Note: Flow sessions may not have spec if created before spec archiving.
   */
  readonly spec: ModeSpec | null;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly timeline: readonly PlaceTimelineSegment[];
  readonly drops: readonly PlaceDropData[];
  readonly sessionStartMs: number;
  readonly totalDurationMs: number;
  readonly history: readonly { position: number; sound: string }[];
}

/**
 * Parse Flow events and build replay data structure.
 */
export function parsePlaceEvents(events: readonly GameEvent[]): PlaceReplayData | null {
  // Find session start event
  const startEvent = events.find((e) => e.type === 'FLOW_SESSION_STARTED') as
    | PlaceSessionStartedEvent
    | undefined;
  if (!startEvent) return null;

  const sessionStartMs = startEvent.timestamp;
  const config: PlaceSessionConfig = {
    nLevel: startEvent.config.nLevel,
    activeModalities: startEvent.config.activeModalities,
    trialsCount: startEvent.config.trialsCount,
    stimulusDurationMs: startEvent.config.stimulusDurationMs,
    placementOrderMode: startEvent.config.placementOrderMode,
  };
  const nLevel = config.nLevel;
  const totalTrials = config.trialsCount + nLevel;

  // Build timeline
  const timeline: PlaceTimelineSegment[] = [];
  const history: { position: number; sound: string }[] = [];

  // Get all flow events
  const stimulusEvents = events.filter(
    (e) => e.type === 'FLOW_STIMULUS_SHOWN',
  ) as PlaceStimulusShownEvent[];
  const placementEvents = events.filter(
    (e) => e.type === 'FLOW_PLACEMENT_STARTED',
  ) as PlacePlacementStartedEvent[];
  const turnEvents = events.filter(
    (e) => e.type === 'FLOW_TURN_COMPLETED',
  ) as PlaceTurnCompletedEvent[];
  const dropEvents = events.filter(
    (e) => e.type === 'FLOW_DROP_ATTEMPTED',
  ) as PlaceDropAttemptedEvent[];

  // Build timeline for each trial
  for (let i = 0; i < stimulusEvents.length; i++) {
    const stimEvent = stimulusEvents[i];
    if (!stimEvent) continue;

    const stimulusStartMs = stimEvent.timestamp - sessionStartMs;
    const stimulusEndMs = stimulusStartMs + stimEvent.stimulusDurationMs;

    // Add to history
    history.push({ position: stimEvent.position, sound: stimEvent.sound });

    // Find corresponding placement and turn events
    const placementEvent = placementEvents.find((e) => e.trialIndex === stimEvent.trialIndex);
    const turnEvent = turnEvents.find((e) => e.trialIndex === stimEvent.trialIndex);

    // Stimulus phase
    timeline.push({
      startMs: stimulusStartMs,
      endMs: stimulusEndMs,
      phase: 'stimulus',
      trialIndex: stimEvent.trialIndex,
      stimulus: { position: stimEvent.position, sound: stimEvent.sound },
      proposals: [],
      adaptiveZone: stimEvent.adaptiveZone ?? null,
    });

    // Placement phase (immediately after stimulus)
    if (placementEvent) {
      const placementStartMs = placementEvent.timestamp - sessionStartMs;

      // Build ALL proposals from ALL drop events for this trial
      // (proposalIds are random UUIDs, so we get type/value from drop events)
      // This gives us the complete list regardless of when in the placement we are
      const proposals: PlaceProposal[] = [];
      const trialDrops = dropEvents.filter((d) => d.trialIndex === stimEvent.trialIndex);

      for (const drop of trialDrops) {
        // Avoid duplicates (same proposalId might appear if there were errors)
        if (!proposals.some((p) => p.id === drop.proposalId)) {
          // Create proposal with correct type discriminant
          if (drop.proposalType === 'position') {
            proposals.push({
              id: drop.proposalId,
              type: 'position',
              value: drop.proposalValue as number,
              correctSlot: drop.targetSlot,
            });
          } else {
            proposals.push({
              id: drop.proposalId,
              type: 'audio',
              value: drop.proposalValue as Sound,
              correctSlot: drop.targetSlot,
            });
          }
        }
      }

      // Placement phase
      const placementEndMs = turnEvent
        ? turnEvent.timestamp - sessionStartMs
        : placementStartMs + REPLAY_FALLBACK_PLACEMENT_MS; // Fallback if no turn event

      timeline.push({
        startMs: placementStartMs,
        endMs: placementEndMs,
        phase: 'placement',
        trialIndex: stimEvent.trialIndex,
        stimulus: { position: stimEvent.position, sound: stimEvent.sound },
        proposals,
        adaptiveZone: stimEvent.adaptiveZone ?? null,
      });
    }
  }

  // Collect drops with trajectory data
  const drops: PlaceDropData[] = dropEvents.map((e) => {
    const dropTimestampMs = e.timestamp - sessionStartMs;

    // Calculate when the drag started relative to session start
    // Use trajectory duration if available, otherwise estimate from placement time
    let dragStartedAtMs: number | null = null;
    if (e.trajectory && e.trajectory.points.length > 0) {
      const trajectoryDuration = getTrajectoryDuration(e.trajectory);
      dragStartedAtMs = dropTimestampMs - trajectoryDuration;
    }

    return {
      timestampMs: dropTimestampMs,
      trialIndex: e.trialIndex,
      proposalId: e.proposalId,
      proposalType: e.proposalType,
      proposalValue: e.proposalValue,
      targetSlot: e.targetSlot,
      correct: e.correct,
      dragStartedAtMs,
      trajectory: e.trajectory ?? null,
    };
  });

  // Find session end
  const endEvent = events.find((e) => e.type === 'FLOW_SESSION_ENDED');
  const lastSegment = timeline[timeline.length - 1];
  const totalDurationMs = endEvent
    ? endEvent.timestamp - sessionStartMs
    : lastSegment
      ? lastSegment.endMs
      : 0;

  // Mark finished phase
  if (lastSegment && lastSegment.endMs < totalDurationMs) {
    timeline.push({
      startMs: lastSegment.endMs,
      endMs: totalDurationMs,
      phase: 'finished',
      trialIndex: lastSegment.trialIndex,
      stimulus: null,
      proposals: [],
      adaptiveZone: null,
    });
  }

  return {
    sessionId: startEvent.sessionId,
    config,
    spec: null, // Flow sessions don't have spec in FLOW_SESSION_STARTED yet
    nLevel,
    totalTrials,
    timeline,
    drops,
    sessionStartMs,
    totalDurationMs,
    history,
  };
}

/**
 * Project a PlaceSessionSnapshot at a specific time.
 */
export function projectPlaceSnapshot(
  data: PlaceReplayData,
  currentTimeMs: number,
): PlaceSessionSnapshot {
  // Find current segment
  const segment = data.timeline.find(
    (seg) => currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  // If past all segments, we're finished
  const isFinished = !segment && currentTimeMs >= data.totalDurationMs;

  // Determine phase
  const phase: PlacePhase = isFinished ? 'finished' : (segment?.phase ?? 'idle');
  const trialIndex = segment?.trialIndex ?? 0;
  const stimulus = segment?.stimulus ?? null;
  const adaptiveZone = segment?.adaptiveZone ?? null;

  // Build placed proposals map from drops up to current time
  const placedProposals = new Map<string, number>();
  const dropsUpToNow = data.drops.filter(
    (d) => d.timestampMs <= currentTimeMs && d.trialIndex === trialIndex,
  );
  for (const drop of dropsUpToNow) {
    placedProposals.set(drop.proposalId, drop.targetSlot);
  }

  // Filter out placed proposals from available proposals
  const proposals = segment?.proposals.filter((p) => !placedProposals.has(p.id)) ?? [];

  // Compute stats up to current time
  const stats = computePlaceStatsAtTime(data, currentTimeMs);

  // Build history up to current trial
  const historyUpToNow = data.history.slice(0, trialIndex + 1);

  return {
    phase,
    trialIndex,
    totalTrials: data.totalTrials,
    stimulus,
    proposals,
    placedProposals,
    stats,
    nLevel: data.nLevel,
    summary: isFinished ? null : null, // Summary computed separately
    adaptiveZone,
    currentTarget: null, // Would need guided mode info
    history: historyUpToNow,
  };
}

/**
 * Compute Flow stats up to a given time.
 */
function computePlaceStatsAtTime(data: PlaceReplayData, currentTimeMs: number): PlaceRunningStats {
  const dropsUpToNow = data.drops.filter((d) => d.timestampMs <= currentTimeMs);

  // Count completed turns
  const completedTrials = new Set<number>();
  for (const seg of data.timeline) {
    if (seg.phase === 'placement' && seg.endMs <= currentTimeMs) {
      completedTrials.add(seg.trialIndex);
    }
  }

  const totalDrops = dropsUpToNow.length;
  const correctDrops = dropsUpToNow.filter((d) => d.correct).length;
  const errorCount = totalDrops - correctDrops;
  const accuracy = totalDrops > 0 ? correctDrops / totalDrops : 0;

  return {
    turnsCompleted: completedTrials.size,
    totalDrops,
    correctDrops,
    errorCount,
    accuracy,
  };
}

/**
 * Get drop events visible at a specific time for Flow replay.
 * Returns drops for the current trial that happened before current time.
 */
export function getPlaceDropsAtTime(
  data: PlaceReplayData,
  currentTimeMs: number,
): readonly PlaceDropData[] {
  // Find current segment
  const currentSegment = data.timeline.find(
    (seg) => seg.phase === 'placement' && currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return [];

  // Get drops for this trial up to current time
  return data.drops.filter(
    (d) => d.trialIndex === currentSegment.trialIndex && d.timestampMs <= currentTimeMs,
  );
}

/**
 * Get in-flight drags at a specific time for Flow replay animation.
 * Returns drags that are currently in progress (started but not yet completed).
 */
export function getPlaceInFlightDragsAtTime(
  data: PlaceReplayData,
  currentTimeMs: number,
): readonly InFlightDrag[] {
  // Find current segment
  const currentSegment = data.timeline.find(
    (seg) => seg.phase === 'placement' && currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return [];

  const inFlightDrags: InFlightDrag[] = [];

  // Find drops for this trial that have trajectory data
  const trialDrops = data.drops.filter(
    (d) => d.trialIndex === currentSegment.trialIndex && d.trajectory !== null,
  );

  // Landing animation buffer - show card at final position briefly after drop
  // (@see thresholds.ts SSOT)
  const LANDING_BUFFER_MS = REPLAY_LANDING_BUFFER_MS;

  for (const drop of trialDrops) {
    if (drop.dragStartedAtMs === null || drop.trajectory === null) continue;

    const dragEndMs = drop.timestampMs;
    const dragStartMs = drop.dragStartedAtMs;
    const trajectoryDuration = getTrajectoryDuration(drop.trajectory);
    const points = decodeTrajectory(drop.trajectory);

    // Check if current time is during drag or landing phase
    if (currentTimeMs >= dragStartMs && currentTimeMs < dragEndMs + LANDING_BUFFER_MS) {
      // Calculate time within the trajectory
      const timeInTrajectory = currentTimeMs - dragStartMs;

      // Determine position - use interpolation during drag, last point during landing
      let position: { x: number; y: number } | null = null;
      let progress: number;

      if (timeInTrajectory <= trajectoryDuration) {
        // During drag - interpolate along trajectory
        position = interpolateTrajectory(points, timeInTrajectory);
        progress = trajectoryDuration > 0 ? timeInTrajectory / trajectoryDuration : 0;
      } else {
        // Landing phase - use last point of trajectory
        const lastPoint = points[points.length - 1];
        if (lastPoint) {
          position = { x: lastPoint.x, y: lastPoint.y };
        }
        progress = 1;
      }

      if (position) {
        inFlightDrags.push({
          proposalId: drop.proposalId,
          proposalType: drop.proposalType,
          proposalValue: drop.proposalValue,
          x: position.x,
          y: position.y,
          progress: Math.min(1, Math.max(0, progress)),
        });
      }
    }
  }

  return inFlightDrags;
}

// =============================================================================
// Recall (Memo) Replay Projector
// =============================================================================

/** Timeline segment for Recall replay */
interface RecallTimelineSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly phase: MemoPhase;
  readonly trialIndex: number;
  readonly stimulus: { position: number; sound: string; color: string } | null;
  readonly trial: Trial | null;
  readonly requiredWindowDepth: number;
  readonly adaptiveZone: number | null;
}

/** Pick event data for Recall replay */
export interface MemoPickData {
  readonly timestampMs: number;
  readonly trialIndex: number;
  readonly slotIndex: number;
  readonly pick: ModalityPick;
  readonly isCorrection: boolean;
}

export interface MemoReplayData {
  readonly sessionId: string;
  readonly config: MemoSessionConfig;
  /**
   * Mode specification archived at session start.
   * Contains scoring thresholds for faithful replay analysis.
   * Note: Recall sessions may not have spec if created before spec archiving.
   */
  readonly spec: ModeSpec | null;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly timeline: readonly RecallTimelineSegment[];
  readonly picks: readonly MemoPickData[];
  readonly sessionStartMs: number;
  readonly totalDurationMs: number;
}

/**
 * Parse Recall events and build replay data structure.
 */
export function parseMemoEvents(events: readonly GameEvent[]): MemoReplayData | null {
  // Find session start event
  const startEvent = events.find((e) => e.type === 'RECALL_SESSION_STARTED') as
    | MemoSessionStartedEvent
    | undefined;
  if (!startEvent) return null;

  const sessionStartMs = startEvent.timestamp;
  const config = startEvent.config;
  const nLevel = config.nLevel;
  const totalTrials = config.trialsCount + nLevel;

  // Build timeline
  const timeline: RecallTimelineSegment[] = [];

  // Get all recall events
  const stimulusEvents = events.filter(
    (e) => e.type === 'RECALL_STIMULUS_SHOWN',
  ) as MemoStimulusShownEvent[];
  const windowEvents = events.filter(
    (e) => e.type === 'RECALL_WINDOW_OPENED',
  ) as RecallWindowOpenedEvent[];
  const commitEvents = events.filter(
    (e) => e.type === 'RECALL_WINDOW_COMMITTED',
  ) as RecallWindowCommittedEvent[];
  const pickEvents = events.filter((e) => e.type === 'RECALL_PICKED') as RecallPickedEvent[];

  // Build timeline for each trial
  for (let i = 0; i < stimulusEvents.length; i++) {
    const stimEvent = stimulusEvents[i];
    if (!stimEvent) continue;

    const stimulusStartMs = stimEvent.timestamp - sessionStartMs;
    const stimulusEndMs = stimulusStartMs + stimEvent.stimulusDurationMs;
    const trial = stimEvent.trial;
    const trialIndex = stimEvent.trialIndex;

    // Calculate required window depth for this trial
    const requiredWindowDepth = getWindowDepthForTrial(trialIndex, nLevel);

    // Stimulus phase
    timeline.push({
      startMs: stimulusStartMs,
      endMs: stimulusEndMs,
      phase: 'stimulus',
      trialIndex,
      stimulus: {
        position: trial.position,
        sound: trial.sound,
        color: trial.color,
      },
      trial,
      requiredWindowDepth,
      adaptiveZone: null,
    });

    // Find corresponding window and commit events
    const windowEvent = windowEvents.find((e) => e.trialIndex === trialIndex);
    const commitEvent = commitEvents.find((e) => e.trialIndex === trialIndex);

    // Recall phase
    if (windowEvent) {
      const recallStartMs = windowEvent.timestamp - sessionStartMs;
      const recallEndMs = commitEvent
        ? commitEvent.timestamp - sessionStartMs
        : recallStartMs + REPLAY_FALLBACK_RECALL_MS; // Fallback if no commit

      timeline.push({
        startMs: recallStartMs,
        endMs: recallEndMs,
        phase: 'recall',
        trialIndex,
        stimulus: null,
        trial,
        requiredWindowDepth,
        adaptiveZone: null,
      });
    }
  }

  // Collect picks
  const picks: MemoPickData[] = pickEvents.map((e) => ({
    timestampMs: e.timestamp - sessionStartMs,
    trialIndex: e.trialIndex,
    slotIndex: e.slotIndex,
    pick: e.pick,
    isCorrection: e.isCorrection ?? false,
  }));

  // Find session end
  const endEvent = events.find((e) => e.type === 'RECALL_SESSION_ENDED');
  const lastSegment = timeline[timeline.length - 1];
  const totalDurationMs = endEvent
    ? endEvent.timestamp - sessionStartMs
    : lastSegment
      ? lastSegment.endMs
      : 0;

  // Mark finished phase
  if (lastSegment && lastSegment.endMs < totalDurationMs) {
    timeline.push({
      startMs: lastSegment.endMs,
      endMs: totalDurationMs,
      phase: 'finished',
      trialIndex: lastSegment.trialIndex,
      stimulus: null,
      trial: null,
      requiredWindowDepth: 0,
      adaptiveZone: null,
    });
  }

  return {
    sessionId: startEvent.sessionId,
    config,
    spec: null, // Recall sessions don't have spec in RECALL_SESSION_STARTED yet
    nLevel,
    totalTrials,
    timeline,
    picks,
    sessionStartMs,
    totalDurationMs,
  };
}

/**
 * Project a MemoSessionSnapshot at a specific time.
 */
export function projectMemoSnapshot(
  data: MemoReplayData,
  currentTimeMs: number,
): MemoSessionSnapshot {
  // Find current segment
  const segment = data.timeline.find(
    (seg) => currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  // If past all segments, we're finished
  const isFinished = !segment && currentTimeMs >= data.totalDurationMs;

  // Determine phase
  const phase: MemoPhase = isFinished ? 'finished' : (segment?.phase ?? 'idle');
  const trialIndex = segment?.trialIndex ?? 0;
  const stimulus = segment?.stimulus ?? null;
  const requiredWindowDepth = segment?.requiredWindowDepth ?? 0;

  // Build current picks from picks up to current time
  const picksUpToNow = data.picks.filter(
    (p) => p.timestampMs <= currentTimeMs && p.trialIndex === trialIndex,
  );

  // Build WindowPicks structure (using mutable maps then converting)
  const mutablePicks = new Map<number, Map<string, ModalityPick>>();
  const correctionCounts = new Map<string, number>();

  for (const pick of picksUpToNow) {
    let slotPicks = mutablePicks.get(pick.slotIndex);
    if (!slotPicks) {
      slotPicks = new Map();
      mutablePicks.set(pick.slotIndex, slotPicks);
    }
    slotPicks.set(pick.pick.modality, pick.pick);

    if (pick.isCorrection) {
      const key = `${pick.slotIndex}:${pick.pick.modality}`;
      correctionCounts.set(key, (correctionCounts.get(key) ?? 0) + 1);
    }
  }

  // Convert to readonly WindowPicks
  const currentPicks: WindowPicks = mutablePicks as unknown as WindowPicks;

  // Compute stats up to current time
  const stats = computeRecallStatsAtTime(data, currentTimeMs);

  // Build fill order (simplified - would need more event data for accurate order)
  const fillOrder: FillCell[] = [];
  for (let slot = 0; slot < requiredWindowDepth; slot++) {
    for (const modality of data.config.activeModalities) {
      fillOrder.push({ slot, modality });
    }
  }

  // Determine if window is complete
  const isComplete = requiredWindowDepth > 0 && mutablePicks.size >= requiredWindowDepth;

  // Build recallPrompt for recall phase
  const recallPrompt =
    phase === 'recall'
      ? {
          requiredWindowDepth,
          currentPicks,
          isComplete,
          fillOrder,
          activeCell: null,
          correctionCounts,
        }
      : null;

  return {
    phase,
    phaseEnteredAt: segment?.startMs ?? 0,
    trialIndex,
    totalTrials: data.totalTrials,
    stimulus,
    recallPrompt,
    stats,
    nLevel: data.nLevel,
    activeModalities: data.config.activeModalities,
    message: null,
    summary: isFinished ? null : null, // Summary computed separately
    adaptiveZone: null,
  };
}

/**
 * Compute Recall stats up to a given time.
 */
function computeRecallStatsAtTime(data: MemoReplayData, currentTimeMs: number): MemoRunningStats {
  // Get completed trials (those with recall phase ended)
  const completedTrials = new Set<number>();
  for (const seg of data.timeline) {
    if (seg.phase === 'recall' && seg.endMs <= currentTimeMs) {
      completedTrials.add(seg.trialIndex);
    }
  }

  // Count picks for completed trials
  const picksInCompletedTrials = data.picks.filter(
    (p) => completedTrials.has(p.trialIndex) && p.timestampMs <= currentTimeMs,
  );

  // Simplified stats computation
  const totalPicks = picksInCompletedTrials.length;
  const correctPicks = picksInCompletedTrials.filter((p) => !p.isCorrection).length;

  return {
    windowsCompleted: completedTrials.size,
    totalPicks,
    correctPicks,
    accuracy: totalPicks > 0 ? correctPicks / totalPicks : 0,
    byModality: {},
    bySlotIndex: {},
    trend: 'stable' as MemoTrend,
    recentAccuracies: [],
  };
}

/**
 * Get picks visible at a specific time for Recall replay.
 * Returns picks for the current trial that happened before current time.
 */
export function getMemoPicksAtTime(
  data: MemoReplayData,
  currentTimeMs: number,
): readonly MemoPickData[] {
  // Find current segment
  const currentSegment = data.timeline.find(
    (seg) => seg.phase === 'recall' && currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return [];

  // Get picks for this trial up to current time
  return data.picks.filter(
    (p) => p.trialIndex === currentSegment.trialIndex && p.timestampMs <= currentTimeMs,
  );
}

// =============================================================================
// DualPick Replay Projector
// =============================================================================

import type { DualPickSessionSnapshot } from '../session/machine/dual-pick-session-types';
import type {
  DualPickSessionConfig,
  DualPickPhase,
  DualPickProposal,
  DualPickTimelineCard,
  DualPickRunningStats,
  DualPickId,
} from '../types/dual-pick';
import type {
  DualPickSessionStartedEvent,
  DualPickStimulusShownEvent,
  DualPickPlacementStartedEvent,
  DualPickDropAttemptedEvent,
  DualPickTurnCompletedEvent,
} from './events';

/** Timeline segment for DualPick replay */
interface DualPickTimelineSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly phase: DualPickPhase;
  readonly trialIndex: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly DualPickProposal[];
  readonly adaptiveZone: number | null;
}

/** Drop event data for DualPick replay */
export interface DualPickDropData {
  readonly timestampMs: number;
  readonly trialIndex: number;
  readonly proposalId: string;
  readonly proposalType: 'position' | 'audio' | 'unified';
  readonly proposalLabel: DualPickId;
  readonly targetSlot: number;
  readonly mirror: boolean;
  readonly correct: boolean;
  readonly dragStartedAtMs: number | null;
  readonly trajectory: CompactTrajectory | null;
}

export interface DualPickReplayData {
  readonly sessionId: string;
  readonly config: DualPickSessionConfig;
  readonly spec: ModeSpec | null;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly timeline: readonly DualPickTimelineSegment[];
  readonly drops: readonly DualPickDropData[];
  readonly sessionStartMs: number;
  readonly totalDurationMs: number;
  readonly history: readonly { position: number; sound: string }[];
}

export interface TrackReplayTrialData {
  readonly trialIndex: number;
  readonly startMs: number;
  readonly highlightEndMs: number;
  readonly trackingEndMs: number;
  readonly endMs: number;
  readonly trialSeed: string;
  readonly arenaWidthPx: number;
  readonly arenaHeightPx: number;
  readonly totalObjects: number;
  readonly targetCount: number;
  readonly initialObjects: readonly import('../domain/track/dual-track-replay').TrackReplayObjectState[];
  readonly targetIndices: readonly number[];
  readonly selectedIndices: readonly number[];
  readonly identityPromptColorIds?: readonly ('red' | 'green' | 'blue' | 'yellow' | 'purple')[];
  readonly identityPromptLetters?: readonly ('C' | 'H' | 'K' | 'L' | 'Q' | 'R' | 'S' | 'T')[];
  readonly identityPromptTones?: readonly ('C4' | 'D4' | 'E4' | 'F4' | 'G4' | 'A4' | 'B4' | 'C5')[];
  readonly correctCount: number;
  readonly crowdingEvents: number;
  readonly minInterObjectDistancePx: number;
  readonly responseTimeMs: number;
}

export interface TrackReplayData {
  readonly sessionId: string;
  readonly totalTrials: number;
  readonly sessionStartMs: number;
  readonly totalDurationMs: number;
  readonly config: {
    readonly targetCount: number;
    readonly totalObjects: number;
    readonly highlightDurationMs: number;
    readonly trackingDurationMs: number;
    readonly speedPxPerSec: number;
    readonly motionComplexity: 'smooth' | 'standard' | 'agile';
    readonly crowdingThresholdPx: number;
    readonly minSeparationPx: number;
  };
  readonly trials: readonly TrackReplayTrialData[];
}

export interface TrackReplayPlaybackSnapshot {
  readonly phase: 'idle' | 'highlight' | 'tracking' | 'selection' | 'finished';
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly currentTrial: TrackReplayTrialData | null;
  readonly localTimeMs: number;
  readonly trackingTimeMs: number;
  readonly completedTrials: number;
  readonly accuracy: number;
}

/**
 * Parse DualPick events and build replay data structure.
 */
export function parseDualPickEvents(events: readonly GameEvent[]): DualPickReplayData | null {
  // Find session start event
  const startEvent = events.find((e) => e.type === 'DUAL_PICK_SESSION_STARTED') as
    | DualPickSessionStartedEvent
    | undefined;
  if (!startEvent) return null;

  const sessionStartMs = startEvent.timestamp;
  const config: DualPickSessionConfig = {
    nLevel: startEvent.config.nLevel,
    activeModalities: startEvent.config.activeModalities as readonly ('position' | 'audio')[],
    trialsCount: startEvent.config.trialsCount,
    stimulusDurationMs: startEvent.config.stimulusDurationMs,
    placementOrderMode: startEvent.config.placementOrderMode,
    distractorCount: startEvent.config.distractorCount ?? 0,
  };
  const nLevel = config.nLevel;
  const totalTrials = config.trialsCount + nLevel;

  // Build timeline
  const timeline: DualPickTimelineSegment[] = [];
  const history: { position: number; sound: string }[] = [];

  // Get all DualPick events
  const stimulusEvents = events.filter(
    (e) => e.type === 'DUAL_PICK_STIMULUS_SHOWN',
  ) as DualPickStimulusShownEvent[];
  const placementEvents = events.filter(
    (e) => e.type === 'DUAL_PICK_PLACEMENT_STARTED',
  ) as DualPickPlacementStartedEvent[];
  const turnEvents = events.filter(
    (e) => e.type === 'DUAL_PICK_TURN_COMPLETED',
  ) as DualPickTurnCompletedEvent[];
  const dropEvents = events.filter(
    (e) => e.type === 'DUAL_PICK_DROP_ATTEMPTED',
  ) as DualPickDropAttemptedEvent[];

  // Build timeline for each trial
  for (let i = 0; i < stimulusEvents.length; i++) {
    const stimEvent = stimulusEvents[i];
    if (!stimEvent) continue;

    const stimulusStartMs = stimEvent.timestamp - sessionStartMs;
    const stimulusEndMs = stimulusStartMs + stimEvent.stimulusDurationMs;

    // Add to history
    history.push({ position: stimEvent.position, sound: stimEvent.sound });

    // Find corresponding placement and turn events
    const placementEvent = placementEvents.find((e) => e.trialIndex === stimEvent.trialIndex);
    const turnEvent = turnEvents.find((e) => e.trialIndex === stimEvent.trialIndex);

    // Stimulus phase
    timeline.push({
      startMs: stimulusStartMs,
      endMs: stimulusEndMs,
      phase: 'stimulus',
      trialIndex: stimEvent.trialIndex,
      stimulus: { position: stimEvent.position, sound: stimEvent.sound },
      proposals: [],
      adaptiveZone: stimEvent.adaptiveZone ?? null,
    });

    // Placement phase (immediately after stimulus)
    if (placementEvent) {
      const placementStartMs = placementEvent.timestamp - sessionStartMs;

      // Build proposals from DUAL_PICK_PLACEMENT_STARTED event
      // Note: correctSlot is not in the event, we'll get it from drop events later
      const proposals: DualPickProposal[] = placementEvent.proposals.map(
        (p: DualPickPlacementStartedEvent['proposals'][number]) => ({
          id: p.id,
          label: p.label as DualPickId,
          type: p.type,
          correctSlot: 0, // Will be determined when drop happens
        }),
      );

      // Placement phase
      const placementEndMs = turnEvent
        ? turnEvent.timestamp - sessionStartMs
        : placementStartMs + REPLAY_FALLBACK_PLACEMENT_MS;

      timeline.push({
        startMs: placementStartMs,
        endMs: placementEndMs,
        phase: 'placement',
        trialIndex: stimEvent.trialIndex,
        stimulus: { position: stimEvent.position, sound: stimEvent.sound },
        proposals,
        adaptiveZone: stimEvent.adaptiveZone ?? null,
      });
    }
  }

  // Collect drops with trajectory data
  const drops: DualPickDropData[] = dropEvents.map((e) => {
    const dropTimestampMs = e.timestamp - sessionStartMs;

    // Calculate when the drag started relative to session start
    let dragStartedAtMs: number | null = null;
    if (e.trajectory && e.trajectory.points.length > 0) {
      const trajectoryDuration = getTrajectoryDuration(e.trajectory);
      dragStartedAtMs = dropTimestampMs - trajectoryDuration;
    }

    return {
      timestampMs: dropTimestampMs,
      trialIndex: e.trialIndex,
      proposalId: e.proposalId,
      proposalType: e.proposalType,
      proposalLabel: e.proposalLabel as DualPickId,
      targetSlot: e.targetSlot,
      mirror: e.mirror ?? false,
      correct: e.correct,
      dragStartedAtMs,
      trajectory: e.trajectory ?? null,
    };
  });

  // Find session end
  const endEvent = events.find((e) => e.type === 'DUAL_PICK_SESSION_ENDED');
  const lastSegment = timeline[timeline.length - 1];
  const totalDurationMs = endEvent
    ? endEvent.timestamp - sessionStartMs
    : lastSegment
      ? lastSegment.endMs
      : 0;

  // Mark finished phase
  if (lastSegment && lastSegment.endMs < totalDurationMs) {
    timeline.push({
      startMs: lastSegment.endMs,
      endMs: totalDurationMs,
      phase: 'finished',
      trialIndex: lastSegment.trialIndex,
      stimulus: null,
      proposals: [],
      adaptiveZone: null,
    });
  }

  return {
    sessionId: startEvent.sessionId,
    config,
    spec: null, // DualPick sessions don't archive spec yet
    nLevel,
    totalTrials,
    timeline,
    drops,
    sessionStartMs,
    totalDurationMs,
    history,
  };
}

/**
 * Project a DualPickSessionSnapshot at a specific time.
 */
export function projectDualPickSnapshot(
  data: DualPickReplayData,
  currentTimeMs: number,
): DualPickSessionSnapshot {
  // Find current segment
  const segment = data.timeline.find(
    (seg) => currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  // If past all segments, we're finished
  const isFinished = !segment && currentTimeMs >= data.totalDurationMs;

  // Determine phase
  const phase: DualPickPhase = isFinished ? 'finished' : (segment?.phase ?? 'idle');
  const trialIndex = segment?.trialIndex ?? 0;
  const stimulus = segment?.stimulus ?? null;

  // Build placed proposals map from drops up to current time
  const placedProposalIds = new Set<string>();
  const dropsUpToNow = data.drops.filter(
    (d) => d.timestampMs <= currentTimeMs && d.trialIndex === trialIndex,
  );
  for (const drop of dropsUpToNow) {
    placedProposalIds.add(drop.proposalId);
  }

  // Filter out placed proposals from available proposals
  const proposals = segment?.proposals.filter((p) => !placedProposalIds.has(p.id)) ?? [];

  // Build timeline cards from drops
  const timelineCards: DualPickTimelineCard[] = dropsUpToNow.map((drop) => ({
    slot: drop.targetSlot,
    type: drop.proposalType,
    placedLabel: drop.proposalLabel,
  }));

  // Compute stats up to current time
  const stats = computeDualPickStatsAtTime(data, currentTimeMs);

  // Build history up to current trial
  const historyUpToNow = data.history.slice(0, trialIndex + 1);

  return {
    phase,
    trialIndex,
    totalTrials: data.totalTrials,
    stimulus,
    proposals,
    timelineCards,
    stats,
    nLevel: data.nLevel,
    summary: isFinished ? null : null, // Summary computed separately
    history: historyUpToNow,
    activeModalities: data.config.activeModalities as readonly ('position' | 'audio')[],
    currentTarget: null, // Would need guided mode info
  };
}

/**
 * Compute DualPick stats up to a given time.
 */
function computeDualPickStatsAtTime(
  data: DualPickReplayData,
  currentTimeMs: number,
): DualPickRunningStats {
  const dropsUpToNow = data.drops.filter((d) => d.timestampMs <= currentTimeMs);

  // Count completed turns
  const completedTrials = new Set<number>();
  for (const seg of data.timeline) {
    if (seg.phase === 'placement' && seg.endMs <= currentTimeMs) {
      completedTrials.add(seg.trialIndex);
    }
  }

  const totalDrops = dropsUpToNow.length;
  const correctDrops = dropsUpToNow.filter((d) => d.correct).length;
  const errorCount = totalDrops - correctDrops;
  const accuracy = totalDrops > 0 ? correctDrops / totalDrops : 0;

  return {
    turnsCompleted: completedTrials.size,
    totalDrops,
    correctDrops,
    errorCount,
    accuracy,
  };
}

/**
 * Get in-flight drags at a specific time for DualPick replay.
 * Returns drags currently in progress (after start, before drop).
 */
export function getDualPickInFlightDragsAtTime(
  data: DualPickReplayData,
  currentTimeMs: number,
): readonly InFlightDrag[] {
  const inFlight: InFlightDrag[] = [];

  // Find current segment
  const currentSegment = data.timeline.find(
    (seg) => seg.phase === 'placement' && currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return inFlight;

  // Find drags for current trial that are in progress
  const trialDrops = data.drops.filter((d) => d.trialIndex === currentSegment.trialIndex);

  for (const drop of trialDrops) {
    // Check if drag has started but not yet completed
    if (
      drop.dragStartedAtMs !== null &&
      drop.trajectory !== null &&
      currentTimeMs >= drop.dragStartedAtMs &&
      currentTimeMs < drop.timestampMs
    ) {
      // Calculate progress through the drag
      const dragDuration = drop.timestampMs - drop.dragStartedAtMs;
      const elapsedInDrag = currentTimeMs - drop.dragStartedAtMs;
      const progress = Math.min(1, elapsedInDrag / dragDuration);

      // Decode trajectory and interpolate position
      const decoded = decodeTrajectory(drop.trajectory);
      const point = interpolateTrajectory(decoded, elapsedInDrag);

      // Skip if no point available
      if (!point) continue;

      // Normalize position (trajectory is in container coordinates)
      const containerW = drop.trajectory.containerSize.w;
      const containerH = drop.trajectory.containerSize.h;

      inFlight.push({
        proposalId: drop.proposalId,
        proposalType: drop.proposalType,
        proposalValue: drop.proposalLabel,
        x: containerW > 0 ? point.x / containerW : 0.5,
        y: containerH > 0 ? point.y / containerH : 0.5,
        progress,
      });
    }
  }

  return inFlight;
}

/**
 * Get drop events visible at a specific time for DualPick replay.
 * Returns drops for the current trial that happened before current time.
 */
export function getDualPickDropsAtTime(
  data: DualPickReplayData,
  currentTimeMs: number,
): readonly DualPickDropData[] {
  // Find current segment
  const currentSegment = data.timeline.find(
    (seg) =>
      (seg.phase === 'placement' || seg.phase === 'finished') &&
      currentTimeMs >= seg.startMs &&
      currentTimeMs < seg.endMs,
  );

  if (!currentSegment) return [];

  // Get drops for this trial up to current time
  return data.drops.filter(
    (d) => d.trialIndex === currentSegment.trialIndex && d.timestampMs <= currentTimeMs,
  );
}

// =============================================================================
// Track Replay Projector
// =============================================================================

export function parseTrackEvents(events: readonly GameEvent[]): TrackReplayData | null {
  const startEvent = events.find((event): event is MotSessionStartedEvent => {
    return event.type === 'MOT_SESSION_STARTED';
  });
  if (!startEvent) return null;

  const sessionStartMs = startEvent.timestamp;
  const trialDefinitions = events
    .filter((event): event is MotTrialDefinedEvent => event.type === 'MOT_TRIAL_DEFINED')
    .sort((a, b) => a.trialIndex - b.trialIndex);
  const trialCompletions = new Map<number, MotTrialCompletedEvent>();
  for (const event of events) {
    if (event.type === 'MOT_TRIAL_COMPLETED') {
      trialCompletions.set(event.trialIndex, event);
    }
  }

  const trials: TrackReplayTrialData[] = trialDefinitions.map((definition, index) => {
    const completion = trialCompletions.get(definition.trialIndex);
    const startMs = definition.timestamp - sessionStartMs;
    const highlightEndMs = startMs + startEvent.config.highlightDurationMs;
    const trackingEndMs = highlightEndMs + startEvent.config.trackingDurationMs;
    const nextDefinition = trialDefinitions[index + 1];
    const fallbackEndMs = completion
      ? completion.timestamp - sessionStartMs
      : nextDefinition
        ? nextDefinition.timestamp - sessionStartMs
        : trackingEndMs + 2000;

    return {
      trialIndex: definition.trialIndex,
      startMs,
      highlightEndMs,
      trackingEndMs,
      endMs: Math.max(trackingEndMs, fallbackEndMs),
      trialSeed: definition.trialSeed,
      arenaWidthPx: definition.arenaWidthPx,
      arenaHeightPx: definition.arenaHeightPx,
      totalObjects: definition.totalObjects,
      targetCount: definition.targetCount,
      initialObjects: definition.initialObjects,
      targetIndices: completion?.targetIndices ?? [],
      selectedIndices: completion?.selectedIndices ?? [],
      identityPromptColorIds: completion?.identityPromptColorIds,
      identityPromptLetters: completion?.identityPromptLetters,
      identityPromptTones: completion?.identityPromptTones,
      correctCount: completion?.correctCount ?? 0,
      crowdingEvents: completion?.crowdingEvents ?? 0,
      minInterObjectDistancePx: completion?.minInterObjectDistancePx ?? 0,
      responseTimeMs: completion?.responseTimeMs ?? 0,
    };
  });

  const endEvent = events.find(
    (event): event is MotSessionEndedEvent => event.type === 'MOT_SESSION_ENDED',
  );
  const lastTrial = trials[trials.length - 1];
  const totalDurationMs = endEvent
    ? endEvent.timestamp - sessionStartMs
    : lastTrial
      ? lastTrial.endMs
      : 0;

  return {
    sessionId: startEvent.sessionId,
    totalTrials: startEvent.config.trialsCount,
    sessionStartMs,
    totalDurationMs,
    config: {
      targetCount: startEvent.config.targetCount,
      totalObjects: startEvent.config.totalObjects,
      highlightDurationMs: startEvent.config.highlightDurationMs,
      trackingDurationMs: startEvent.config.trackingDurationMs,
      speedPxPerSec: startEvent.config.speedPxPerSec,
      motionComplexity: startEvent.config.motionComplexity,
      crowdingThresholdPx: startEvent.config.crowdingThresholdPx,
      minSeparationPx: startEvent.config.minSeparationPx,
    },
    trials,
  };
}

export function projectTrackSnapshot(
  data: TrackReplayData,
  currentTimeMs: number,
): TrackReplayPlaybackSnapshot {
  const boundedTimeMs = Math.max(0, Math.min(currentTimeMs, data.totalDurationMs));
  const currentTrial =
    data.trials.find((trial) => boundedTimeMs >= trial.startMs && boundedTimeMs < trial.endMs) ??
    null;

  const completedTrials = data.trials.filter((trial) => trial.endMs <= boundedTimeMs).length;
  const totalCorrect = data.trials
    .filter((trial) => trial.endMs <= boundedTimeMs)
    .reduce((sum, trial) => sum + trial.correctCount, 0);
  const totalTargets = data.trials
    .filter((trial) => trial.endMs <= boundedTimeMs)
    .reduce((sum, trial) => sum + trial.targetCount, 0);
  const accuracy = totalTargets > 0 ? totalCorrect / totalTargets : 0;

  if (!currentTrial) {
    return {
      phase: boundedTimeMs >= data.totalDurationMs ? 'finished' : 'idle',
      trialIndex: Math.max(0, completedTrials - 1),
      totalTrials: data.totalTrials,
      currentTrial: null,
      localTimeMs: 0,
      trackingTimeMs: 0,
      completedTrials,
      accuracy,
    };
  }

  const localTimeMs = Math.max(0, boundedTimeMs - currentTrial.startMs);
  const trackingTimeMs = Math.max(
    0,
    Math.min(data.config.trackingDurationMs, boundedTimeMs - currentTrial.highlightEndMs),
  );
  const phase =
    boundedTimeMs < currentTrial.highlightEndMs
      ? 'highlight'
      : boundedTimeMs < currentTrial.trackingEndMs
        ? 'tracking'
        : boundedTimeMs < currentTrial.endMs
          ? 'selection'
          : 'finished';

  return {
    phase,
    trialIndex: currentTrial.trialIndex,
    totalTrials: data.totalTrials,
    currentTrial,
    localTimeMs,
    trackingTimeMs,
    completedTrials,
    accuracy,
  };
}
