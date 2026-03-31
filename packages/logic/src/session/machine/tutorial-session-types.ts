/**
 * TutorialSession XState Machine Types
 *
 * Type definitions for the XState-based tutorial session machine.
 */
import type { TutorialSpec, TutorialStepSpec } from '../../specs/types';
import type { AudioPort } from '../../ports';

// =============================================================================
// Input (for machine creation)
// =============================================================================

export interface TutorialSessionInput {
  /** The tutorial specification to run */
  readonly spec: TutorialSpec;
  /** Audio adapter for playing sounds */
  readonly audio: AudioPort;
  /** Callback when tutorial completes successfully */
  readonly onComplete: (report?: TutorialCompletionReport) => void;
  /** Callback when user exits (back/home) */
  readonly onExit: () => void;
  /** Optional: step index to start at (for recovery) */
  readonly startAtStep?: number;
}

// =============================================================================
// Completion / Assessment
// =============================================================================

export interface TutorialAssessmentResult {
  readonly startStepIndex: number;
  readonly correctSteps: number;
  readonly totalSteps: number;
  /** 0..1 */
  readonly accuracy: number;
  /** Minimum accuracy required to pass (0..1). */
  readonly minAccuracy: number;
  readonly passed: boolean;
}

export interface TutorialCompletionReport {
  readonly assessment?: TutorialAssessmentResult;
}

// =============================================================================
// Context (Extended State)
// =============================================================================

export interface TutorialSessionContext extends TutorialSessionInput {
  /** Current step index (-1 = welcome screen) */
  stepIndex: number;
  /** Current stimulus being shown */
  currentStimulus: TutorialStimulus | null;
  /** User's current response */
  userResponse: TutorialUserResponse;
  /** Whether we're awaiting user response */
  awaitingResponse: boolean;
  /** Whether feedback animation is active */
  feedbackActive: boolean;
  /** State to return to after resuming from pause */
  pausedFromState: TutorialSessionStateValue | null;

  /** Assessment progress counters (optional). */
  assessmentProgress: {
    startStepIndex: number;
    warmupSteps: number;
    minAccuracy: number;
    correctSteps: number;
    totalSteps: number;
  } | null;
}

/**
 * Stimulus data for a tutorial step.
 */
export interface TutorialStimulus {
  readonly id: string;
  readonly turn: number;
  readonly position: number;
  readonly letter: string;
}

/**
 * User response state.
 * Supports both classic (match buttons) and dual-pick (classification) modes.
 */
export interface TutorialUserResponse {
  /** For classic mode: which matches are selected */
  match?: { position: boolean; audio: boolean };
  /** For dual-pick mode: classification selections */
  classification?: { position?: string; sound?: string };
}

// =============================================================================
// Events
// =============================================================================

export type TutorialSessionEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STIMULUS_SHOWN' } // UI signals stimulus is visible, audio played
  | { type: 'TRAVEL_COMPLETE' } // GSAP signals travel animation done
  | { type: 'COMPARE_COMPLETE' } // GSAP signals compare animation done
  | { type: 'REORG_COMPLETE' } // GSAP signals reorganization done
  | { type: 'RESPOND'; channel: 'position' | 'audio' | 'sound'; value?: string }
  | { type: 'ADVANCE' }; // Manual advance for ACTION steps without match

// =============================================================================
// State Value Types
// =============================================================================

export type TutorialSessionStateValue =
  | 'welcome'
  | 'starting'
  | 'idle'
  | 'stimulus'
  | 'traveling'
  | 'comparing'
  | 'response'
  | 'feedbackDelay'
  | 'reorganizing'
  | 'paused'
  | 'finished';

// =============================================================================
// Snapshot Type (for UI subscription)
// =============================================================================

export interface TutorialSessionSnapshot {
  readonly state: TutorialSessionStateValue;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly currentStimulus: TutorialStimulus | null;
  readonly currentStep: TutorialStepSpec | null;
  readonly userResponse: TutorialUserResponse;
  readonly awaitingResponse: boolean;
  readonly feedbackActive: boolean;
  readonly nLevel: number;
  readonly isDualPick: boolean;
}
