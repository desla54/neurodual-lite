/**
 * DualPickSession Plugin Types
 *
 * Type definitions for the plugin architecture.
 * Follows the same pattern as GameSessionPlugins, TraceSessionPlugins, and MemoSessionPlugins.
 *
 * PRINCIPLES:
 * - Data in / Data out: Plugins receive explicit inputs, return pure data
 * - Machine = orchestrator: Only the machine calls services (audio.play, timer.wait)
 * - No mutation: Plugins return results, machine does assign()
 * - No coupling: Plugins don't call each other, pass through explicit inputs
 */

import type { PickSpec } from '../../../specs';
import type {
  DualPickTimelineCard,
  DualPickProposal,
  DualPickPlacementTarget,
  DualPickPhase,
  DualPickRunningStats,
  DualPickExtendedSummary,
  DualPickSnapshot,
} from '../../../types/dual-pick';
import type { AudioPort } from '../../../ports/audio-port';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';

// Use DualPickSnapshot from types (aliased as DualPickSessionSnapshot for consistency)
type DualPickSessionSnapshot = DualPickSnapshot;

// =============================================================================
// DeviceContextCollector
// =============================================================================

/**
 * Device information for session events.
 */
export interface DeviceInfo {
  readonly platform: 'web' | 'android' | 'ios';
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly userAgent: string;
  readonly touchCapable: boolean;
  readonly volumeLevel: number | null;
  readonly appVersion: string;
}

/**
 * Temporal context for session events.
 */
export interface TemporalContext {
  readonly timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  readonly localHour: number;
  readonly dayOfWeek: number;
  readonly timezone: string;
}

/**
 * DeviceContextCollector collects device and session context info.
 */
export interface DeviceContextCollector {
  /**
   * Get device information.
   */
  getDeviceInfo(audio?: AudioPort): DeviceInfo;

  /**
   * Get temporal context.
   */
  getTemporalContext(): TemporalContext;
}

// =============================================================================
// TimelineGenerator
// =============================================================================

/**
 * History item representing a past stimulus.
 */
export interface HistoryItem {
  readonly position: number;
  readonly sound: string;
}

/**
 * Input for timeline generation.
 */
export interface TimelineGeneratorInput {
  readonly history: readonly HistoryItem[];
  readonly trialIndex: number;
  readonly nLevel: number;
  readonly activeModalities: readonly string[];
  readonly timelineMode: 'unified' | 'separated';
  readonly distractorCount: number;
  readonly distractorSource: 'random' | 'proactive';
  readonly rng: () => number;
  readonly generateId: () => string;
}

/**
 * Result of timeline generation.
 */
export interface TimelineGeneratorResult {
  readonly timelineCards: DualPickTimelineCard[];
  readonly proposals: DualPickProposal[];
}

/**
 * Input for placement order generation.
 */
export interface PlacementOrderInput {
  readonly proposals: readonly DualPickProposal[];
  readonly placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  readonly rng: () => number;
}

/**
 * TimelineGenerator generates timeline cards and proposals.
 */
export interface TimelineGenerator {
  /**
   * Generate timeline cards and proposals for a trial.
   */
  generate(input: TimelineGeneratorInput): TimelineGeneratorResult;

  /**
   * Generate placement order based on mode.
   */
  generatePlacementOrder(input: PlacementOrderInput): DualPickPlacementTarget[];
}

// =============================================================================
// DropValidator
// =============================================================================

/**
 * Input for drop validation.
 */
export interface DropValidatorInput {
  readonly proposalId: string;
  readonly targetSlot: number;
  readonly targetType: 'position' | 'audio' | 'unified';
  readonly proposals: readonly DualPickProposal[];
  readonly timelineCards: readonly DualPickTimelineCard[];
  readonly history: readonly HistoryItem[];
  readonly placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  readonly placementOrder: readonly DualPickPlacementTarget[];
  readonly placementOrderIndex: number;
}

/**
 * Result of drop validation.
 */
export interface DropValidatorResult {
  /** Whether the drop is accepted (not rejected for structural reasons) */
  readonly isAccepted: boolean;
  /** Whether the drop is correct (matches the right content) */
  readonly isCorrect: boolean;
  /** Reason for rejection if not accepted */
  readonly rejectionReason?:
    | 'proposal_not_found'
    | 'already_placed'
    | 'wrong_target'
    | 'type_mismatch'
    | 'distractor'
    | 'wrong_active_card';
  /** The proposal that was dropped */
  readonly proposal?: DualPickProposal;
  /** The target card */
  readonly targetCard?: DualPickTimelineCard;
}

/**
 * DropValidator validates drop attempts against history.
 */
export interface DropValidator {
  /**
   * Validate a drop attempt.
   */
  validate(input: DropValidatorInput): DropValidatorResult;
}

// =============================================================================
// PlacementOrchestrator
// =============================================================================

/**
 * Input for getting current target.
 */
export interface CurrentTargetInput {
  readonly placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  readonly placementOrder: readonly DualPickPlacementTarget[];
  readonly placementOrderIndex: number;
}

/**
 * Input for checking if all labels are placed.
 */
export interface PlacementCompleteInput {
  readonly timelineCards: readonly DualPickTimelineCard[];
}

/**
 * PlacementOrchestrator manages guided placement mode progression.
 */
export interface PlacementOrchestrator {
  /**
   * Get the current target in guided mode.
   * Returns null in free mode or when no more targets.
   */
  getCurrentTarget(input: CurrentTargetInput): DualPickPlacementTarget | null;

  /**
   * Check if all labels have been placed (turn complete).
   */
  isAllLabelsPlaced(input: PlacementCompleteInput): boolean;
}

// =============================================================================
// SnapshotBuilder
// =============================================================================

/**
 * Input for snapshot building.
 */
export interface SnapshotBuilderInput {
  readonly phase: DualPickPhase;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly DualPickProposal[];
  readonly timelineCards: readonly DualPickTimelineCard[];
  readonly stats: DualPickRunningStats;
  readonly nLevel: number;
  readonly summary: DualPickExtendedSummary | null;
  readonly history: readonly HistoryItem[];
  readonly activeModalities: readonly string[];
  readonly currentTarget: DualPickPlacementTarget | null;
}

/**
 * SnapshotBuilder builds UI snapshots.
 */
export interface SnapshotBuilder {
  /**
   * Build snapshot for UI.
   */
  build(input: SnapshotBuilderInput): DualPickSessionSnapshot;
}

// =============================================================================
// AudioPolicy
// =============================================================================

/**
 * AudioPolicy decides when to play audio.
 */
export interface AudioPolicy {
  /**
   * Check if audio should be played for stimulus.
   */
  shouldPlayStimulus(activeModalities: readonly string[]): boolean;
}

// =============================================================================
// Plugin Container
// =============================================================================

/**
 * Container for all DualPickSession plugins.
 * Created once via createDefaultDualPickPlugins(), readonly during session.
 */
export interface DualPickSessionPlugins {
  readonly deviceContext: DeviceContextCollector;
  readonly timeline: TimelineGenerator;
  readonly drop: DropValidator;
  readonly placement: PlacementOrchestrator;
  readonly snapshot: SnapshotBuilder;
  readonly audio: AudioPolicy;
}

/**
 * Configuration for creating default plugins.
 */
export interface CreateDefaultPluginsConfig {
  readonly spec?: PickSpec;
  readonly platformInfo?: PlatformInfoPort;
}
