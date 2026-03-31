/**
 * PlaceSession Plugin Types
 *
 * Type definitions for the plugin architecture.
 * Follows the same pattern as GameSessionPlugins, TraceSessionPlugins, MemoSessionPlugins, DualPickSessionPlugins.
 *
 * PRINCIPLES:
 * - Data in / Data out: Plugins receive explicit inputs, return pure data
 * - Machine = orchestrator: Only the machine calls services (audio.play, timer.wait)
 * - No mutation: Plugins return results, machine does assign()
 * - No coupling: Plugins don't call each other, pass through explicit inputs
 */

import type { PlaceSpec } from '../../../specs';
import type {
  PlaceProposal,
  PlacementTarget,
  PlaceRunningStats,
  PlacePhase,
} from '../../../types/place';
import type { PlaceExtendedSummary } from '../../../engine/place-projector';
import type { AudioPort } from '../../../ports/audio-port';
import type { AlgorithmStatePort } from '../../../ports/algorithm-state-port';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';

import type { TrialGenerator } from '../../../coach/trial-generator';
import type { AlgorithmState } from '../../../sequence';

// =============================================================================
// PlaceSessionMachineSnapshot (defined here to avoid cycle with parent types)
// =============================================================================

/**
 * Snapshot type for UI subscription.
 * Mirrors PlaceSessionMachineSnapshot from place-session-types.ts.
 */
export interface PlaceSessionMachineSnapshot {
  readonly phase: PlacePhase;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly nLevel: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly PlaceProposal[];
  readonly placedProposals: ReadonlyMap<string, number>;
  readonly currentTarget: PlacementTarget | null;
  readonly stats: PlaceRunningStats;
  readonly history: readonly { position: number; sound: string }[];
  readonly summary: PlaceExtendedSummary | null;
  readonly adaptiveZone: number | null;
}

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
// ProposalGenerator
// =============================================================================

/**
 * History item representing a past stimulus.
 */
export interface HistoryItem {
  readonly position: number;
  readonly sound: string;
}

/**
 * Input for proposal generation.
 */
export interface ProposalGeneratorInput {
  readonly history: readonly HistoryItem[];
  readonly trialIndex: number;
  readonly nLevel: number;
  readonly activeModalities: readonly string[];
  readonly timelineMode: 'unified' | 'separated';
  readonly rng: () => number;
  readonly generateId: () => string;
}

/**
 * Result of proposal generation.
 */
export interface ProposalGeneratorResult {
  readonly proposals: PlaceProposal[];
}

/**
 * Input for placement order generation.
 */
export interface PlacementOrderInput {
  readonly proposals: readonly PlaceProposal[];
  readonly placementOrderMode: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
  readonly rng: () => number;
}

/**
 * ProposalGenerator generates proposals and placement order.
 */
export interface ProposalGenerator {
  /**
   * Generate proposals for a trial.
   */
  generate(input: ProposalGeneratorInput): ProposalGeneratorResult;

  /**
   * Generate placement order based on mode.
   */
  generatePlacementOrder(input: PlacementOrderInput): PlacementTarget[];
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
  readonly proposals: readonly PlaceProposal[];
  readonly placedProposals: ReadonlyMap<string, number>;
  readonly history: readonly HistoryItem[];
}

/**
 * Result of drop validation.
 */
export interface DropValidatorResult {
  /** Whether the drop is accepted (proposal found and not already placed) */
  readonly isAccepted: boolean;
  /** Whether the drop is correct (matches the right content) */
  readonly isCorrect: boolean;
  /** The proposal that was dropped */
  readonly proposal?: PlaceProposal;
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
// TurnOrchestrator
// =============================================================================

/**
 * Input for checking turn completion.
 */
export interface TurnCompleteInput {
  readonly proposals: readonly PlaceProposal[];
  readonly placedProposals: ReadonlyMap<string, number>;
}

/**
 * TurnOrchestrator manages turn completion checks.
 */
export interface TurnOrchestrator {
  /**
   * Check if all valid proposals have been placed (turn complete).
   */
  isAllProposalsPlaced(input: TurnCompleteInput): boolean;
}

// =============================================================================
// SnapshotBuilder
// =============================================================================

/**
 * Input for snapshot building.
 */
export interface SnapshotBuilderInput {
  readonly phase: PlacePhase;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly nLevel: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly PlaceProposal[];
  readonly placedProposals: ReadonlyMap<string, number>;
  readonly currentTarget: PlacementTarget | null;
  readonly stats: PlaceRunningStats;
  readonly history: readonly HistoryItem[];
  readonly summary: PlaceExtendedSummary | null;
  readonly adaptiveZone: number | null;
}

/**
 * SnapshotBuilder builds UI snapshots.
 */
export interface SnapshotBuilder {
  /**
   * Build snapshot for UI.
   */
  build(input: SnapshotBuilderInput): PlaceSessionMachineSnapshot;
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
// AlgorithmStateManager
// =============================================================================

/**
 * AlgorithmStateManager handles algorithm state persistence for adaptive generators.
 */
export interface AlgorithmStateManager {
  /**
   * Check if algorithm state can be persisted.
   */
  canPersist(generator: TrialGenerator): boolean;

  /**
   * Get algorithm type from generator.
   */
  getAlgorithmType(generator: TrialGenerator): string | null;

  /**
   * Serialize algorithm state.
   */
  serializeState(generator: TrialGenerator): AlgorithmState | null;

  /**
   * Save algorithm state.
   */
  saveState(userId: string, generator: TrialGenerator, port: AlgorithmStatePort): Promise<void>;

  /**
   * Load and restore algorithm state.
   */
  loadAndRestoreState(
    userId: string,
    generator: TrialGenerator,
    port: AlgorithmStatePort,
  ): Promise<void>;
}

// =============================================================================
// Plugin Container
// =============================================================================

/**
 * Container for all PlaceSession plugins.
 * Created once via createDefaultPlacePlugins(), readonly during session.
 */
export interface PlaceSessionPlugins {
  readonly deviceContext: DeviceContextCollector;
  readonly proposal: ProposalGenerator;
  readonly drop: DropValidator;
  readonly turn: TurnOrchestrator;
  readonly snapshot: SnapshotBuilder;
  readonly audio: AudioPolicy;
  readonly algorithmState: AlgorithmStateManager;
}

/**
 * Configuration for creating default plugins.
 */
export interface CreateDefaultPluginsConfig {
  readonly spec?: PlaceSpec;
  readonly platformInfo?: PlatformInfoPort;
}
