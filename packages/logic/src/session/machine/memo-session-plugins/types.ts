/**
 * MemoSession Plugin Types
 *
 * Type definitions for the plugin architecture.
 * Follows the same pattern as GameSessionPlugins and TraceSessionPlugins.
 *
 * PRINCIPLES:
 * - Data in / Data out: Plugins receive explicit inputs, return pure data
 * - Machine = orchestrator: Only the machine calls services (audio.play, timer.wait)
 * - No mutation: Plugins return results, machine does assign()
 * - No coupling: Plugins don't call each other, pass through explicit inputs
 */

import type { MemoSpec } from '../../../specs';
import type { Trial } from '../../../types/core';
import type {
  FillCell,
  ModalityPick,
  SlotPicks,
  WindowPicks,
  MemoRunningStats,
} from '../../../types/memo';
import type { MemoExtendedSummary } from '../../../engine/memo-projector';
import type { TrialFeedback } from '../../../types/adaptive';
import type { AudioPort } from '../../../ports/audio-port';
import type { AlgorithmStatePort } from '../../../ports/algorithm-state-port';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';
import type { TrialGenerator } from '../../../coach/trial-generator';
import type { AlgorithmState } from '../../../sequence';

// =============================================================================
// MemoPhase & MemoSessionSnapshot (defined here to avoid cycle with parent)
// =============================================================================

/**
 * Phase of the recall session machine.
 */
export type MemoPhase = 'idle' | 'stimulus' | 'recall' | 'feedback' | 'finished';

/**
 * Snapshot type for UI subscription.
 * Mirrors MemoSessionSnapshot from memo-session-types.ts.
 */
export interface MemoSessionSnapshot {
  readonly phase: MemoPhase;
  readonly phaseEnteredAt: number;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly stimulus: {
    readonly position: number;
    readonly sound: string;
    readonly color: string;
  } | null;
  readonly recallPrompt: {
    readonly requiredWindowDepth: number;
    readonly currentPicks: WindowPicks;
    readonly isComplete: boolean;
    readonly fillOrder: readonly FillCell[];
    readonly activeCell: FillCell | null;
    readonly correctionCounts: ReadonlyMap<string, number>;
  } | null;
  readonly stats: MemoRunningStats;
  readonly nLevel: number;
  readonly activeModalities: readonly string[];
  readonly message: string | null;
  readonly summary: MemoExtendedSummary | null;
  readonly adaptiveZone: number | null;
}

// =============================================================================
// PickProcessor
// =============================================================================

/**
 * Input for processing a pick.
 */
export interface PickInput {
  readonly slotIndex: number;
  readonly pick: ModalityPick;
  readonly currentPicks: Map<number, SlotPicks>;
  readonly correctionCounts: Map<string, number>;
  readonly fillOrder: readonly FillCell[];
  readonly fillOrderIndex: number;
  readonly trialIndex: number;
}

/**
 * Result of processing a pick.
 */
export interface PickResult {
  readonly isAccepted: boolean;
  readonly isCorrection: boolean;
  readonly newPicks: Map<number, SlotPicks>;
  readonly newCorrectionCounts: Map<string, number>;
  readonly newFillOrderIndex: number;
}

/**
 * PickProcessor validates user picks.
 * Checks correction limits, validates active cell.
 */
export interface PickProcessor {
  /**
   * Process a pick attempt.
   */
  process(input: PickInput): PickResult;

  /**
   * Get maximum corrections per cell.
   */
  getMaxCorrections(): number;
}

// =============================================================================
// WindowEvaluator
// =============================================================================

/**
 * Input for window evaluation.
 * Pure data - no generator reference to avoid side-effects.
 */
export interface WindowEvalInput {
  readonly trialIndex: number;
  readonly trials: readonly Trial[];
  readonly recallDurationMs: number;
  readonly windowAccuracy: number;
}

/**
 * Result of window evaluation.
 * Pure data - feedback only, no trial generation (that's the machine's job).
 */
export interface WindowEvalResult {
  /** Feedback for adaptive generator (machine will pass this to generator.generateNext) */
  readonly feedback: TrialFeedback;
}

/**
 * WindowEvaluator evaluates window completion and syncs adaptive params.
 */
export interface WindowEvaluator {
  /**
   * Evaluate window and sync adaptive params.
   */
  evaluate(input: WindowEvalInput): WindowEvalResult;
}

// =============================================================================
// FillOrderGenerator
// =============================================================================

/**
 * Input for fill order generation.
 */
export interface FillOrderInput {
  readonly windowDepth: number;
  readonly activeModalities: readonly string[];
  readonly fillOrderMode: 'sequential' | 'random';
}

/**
 * FillOrderGenerator generates the fill order for recall phase.
 */
export interface FillOrderGenerator {
  /**
   * Generate fill order.
   * @param input Configuration
   * @param rng Random number generator (0-1)
   */
  generate(input: FillOrderInput, rng: () => number): FillCell[];
}

// =============================================================================
// SnapshotBuilder
// =============================================================================

/**
 * Input for snapshot building.
 */
export interface SnapshotBuilderInput {
  readonly phase: 'idle' | 'stimulus' | 'recall' | 'feedback' | 'finished';
  readonly phaseEnteredAt: number;
  readonly trialIndex: number;
  readonly currentTrial: Trial | null;
  readonly currentPicks: Map<number, SlotPicks>;
  readonly correctionCounts: Map<string, number>;
  readonly fillOrder: readonly FillCell[];
  readonly fillOrderIndex: number;
  readonly effectiveWindowDepth: number;
  readonly sessionEvents: readonly unknown[];
  readonly trials: readonly Trial[];
  readonly generator: TrialGenerator;
  readonly spec: MemoSpec;
  readonly message: string | null;
  readonly finalSummary: unknown | null;
}

/**
 * SnapshotBuilder builds UI snapshots.
 */
export interface SnapshotBuilder {
  /**
   * Build snapshot for UI.
   */
  build(input: SnapshotBuilderInput): MemoSessionSnapshot;
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

  /**
   * Get audio sync buffer in ms.
   */
  getAudioSyncBufferMs(): number;
}

// =============================================================================
// AlgorithmStateManager
// =============================================================================

/**
 * AlgorithmStateManager handles algorithm state persistence.
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
// DeviceContextCollector
// =============================================================================

/**
 * Device info for session start event.
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
 * Session context info.
 */
export interface SessionContextInfo {
  readonly timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  readonly localHour: number;
  readonly dayOfWeek: number;
  readonly timezone: string;
}

/**
 * DeviceContextCollector gathers device and session context.
 */
export interface DeviceContextCollector {
  /**
   * Get device info.
   */
  getDeviceInfo(audio: AudioPort): DeviceInfo;

  /**
   * Get session context info.
   */
  getSessionContextInfo(): SessionContextInfo;

  /**
   * Get time of day.
   */
  getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night';
}

// =============================================================================
// MemoSessionPlugins (Container)
// =============================================================================

/**
 * Container for all MemoSession plugins.
 * Created once via factory, readonly during session.
 */
export interface MemoSessionPlugins {
  readonly pick: PickProcessor;
  readonly windowEval: WindowEvaluator;
  readonly fillOrder: FillOrderGenerator;
  readonly snapshot: SnapshotBuilder;
  readonly audio: AudioPolicy;
  readonly algorithmState: AlgorithmStateManager;
  readonly deviceContext: DeviceContextCollector;
}

// =============================================================================
// Factory Config
// =============================================================================

/**
 * Configuration for creating default plugins.
 */
export interface CreateDefaultPluginsConfig {
  readonly spec: MemoSpec;
  readonly platformInfo?: PlatformInfoPort;
}
