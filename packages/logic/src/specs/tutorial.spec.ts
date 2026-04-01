/**
 * Tutorial Specification (Classic N-2 Tutorial)
 *
 * SINGLE SOURCE OF TRUTH for tutorial sequences.
 *
 * This spec defines the 22-step classic tutorial that teaches:
 * 1. Basic stimulus observation (DEMO)
 * 2. Match comparison visualization (COMPARE)
 * 3. User response practice (ACTION)
 */

import type { TutorialSpec, TutorialSpotlightConfig, TutorialStepSpec } from './types';
import {
  TIMING_TUTORIAL_AUTO_ADVANCE_MS,
  TIMING_TUTORIAL_FEEDBACK_MS,
  TIMING_TUTORIAL_STIMULUS_MS,
} from './thresholds';

// =============================================================================
// Step Definitions
// =============================================================================

/**
 * Generate step ID for a given index.
 */
function stepId(index: number): string {
  return `step-${String(index).padStart(2, '0')}`;
}

/**
 * Raw trial data for the tutorial sequence.
 * Format: [position, sound, matchPosition, matchAudio]
 *
 * Designed for early engagement:
 * - First position match at step 2 (immediately after buffer fills)
 * - First audio match at step 3
 * - First dual match at step 7
 */
const RAW_TRIALS: readonly [number, string, boolean, boolean][] = [
  [0, 'C', false, false], // Step 0: Demo - buffer
  [3, 'H', false, false], // Step 1: Demo - buffer
  [0, 'K', true, false], // Step 2: First position match! (pos 0 = step 0)
  [5, 'H', false, true], // Step 3: First audio match! (H = step 1)
  [7, 'L', false, false], // Step 4: No match
  [5, 'R', true, false], // Step 5: Position match (pos 5 = step 3)
  [2, 'L', false, true], // Step 6: Audio match (L = step 4)
  [5, 'R', true, true], // Step 7: First dual match! (pos+R repeat from step 5 = N-2)
  [1, 'S', false, false], // Step 8: No match
  [4, 'T', false, false], // Step 9: No match
  [1, 'Q', true, false], // Step 10: Position match
  [0, 'T', false, true], // Step 11: Audio match
  [6, 'C', false, false], // Step 12: No match (auto-advance from here)
  [3, 'H', false, false], // Step 13: No match
  [6, 'R', true, false], // Step 14: Position match
  [3, 'H', true, true], // Step 15: Dual match
  [2, 'L', false, false], // Step 16: No match
  [7, 'K', false, false], // Step 17: No match
  [2, 'S', true, false], // Step 18: Position match
  [5, 'K', false, true], // Step 19: Audio match
  [0, 'Q', false, false], // Step 20: No match
  [5, 'K', true, true], // Step 21: Dual match (finale, repeats step 19 = N-2)
];

/**
 * Determine the intent for a step based on its index and match status.
 */
function getIntent(
  index: number,
  matchPosition: boolean,
  matchAudio: boolean,
): TutorialStepSpec['intent'] {
  // First 2 steps are pure demo (building memory buffer)
  if (index < 2) return 'DEMO';

  // Steps with matches show comparison first, then require action
  if (matchPosition || matchAudio) return 'ACTION';

  // Non-match steps after buffer is filled are also ACTION (user should not press)
  return 'ACTION';
}

/**
 * Determine the exit condition for a step.
 *
 * For the first ~10 scorable steps (index 2-11), we require manual advance
 * even on no-match steps. This helps users understand the rhythm and gives
 * them time to compare stimuli on the timeline before moving forward.
 *
 * After step 11, no-match steps auto-advance to maintain flow.
 */
function getExitCondition(
  index: number,
  matchPosition: boolean,
  matchAudio: boolean,
): TutorialStepSpec['exitCondition'] {
  // Demo steps proceed automatically (buffer building)
  if (index < 2) return 'AUTO';

  // First 10 scorable steps (index 2-11): always require user interaction
  // This includes both match and no-match steps for pedagogical purposes
  if (index < 12) return 'RESPONSE';

  // After step 11: match steps still wait for response
  if (matchPosition || matchAudio) return 'RESPONSE';

  // Late no-match steps auto-advance to maintain rhythm
  return 'AUTO';
}

/**
 * NoMatch step indices for varied annotations.
 * New indices: 4, 8, 9, 12, 13, 16, 17, 20
 */
const NO_MATCH_ANNOTATION_MAP: Record<number, string> = {
  4: 'tutorial.annotations.noMatch1',
  8: 'tutorial.annotations.noMatch2',
  9: 'tutorial.annotations.noMatch3',
  12: 'tutorial.annotations.noMatch4',
  13: 'tutorial.annotations.noMatch5',
  16: 'tutorial.annotations.noMatch6',
  17: 'tutorial.annotations.noMatch7',
  20: 'tutorial.annotations.noMatch8',
};

function getAnnotationKey(index: number, matchPosition: boolean, matchAudio: boolean): string {
  if (index === 0) return 'tutorial.annotations.intro';
  if (index === 1) return 'tutorial.annotations.observe';

  // Step 2: First position match (pos 0 repeats from step 0)
  if (index === 2 && matchPosition) return 'tutorial.annotations.firstPositionMatch';

  // Step 3: First audio match (H repeats from step 1)
  if (index === 3 && matchAudio) return 'tutorial.annotations.firstAudioMatch';

  // Step 7: First dual match
  if (index === 7 && matchPosition && matchAudio) return 'tutorial.annotations.firstDualMatch';

  // Generic match annotations
  if (matchPosition && matchAudio) return 'tutorial.annotations.dualMatch';
  if (matchPosition) return 'tutorial.annotations.positionMatch';
  if (matchAudio) return 'tutorial.annotations.audioMatch';

  // Non-match: varied annotations based on step index
  return NO_MATCH_ANNOTATION_MAP[index] ?? 'tutorial.annotations.noMatch1';
}

/**
 * Get highlight slots for COMPARE-related steps.
 */
function getHighlightSlots(
  _index: number,
  matchPosition: boolean,
  matchAudio: boolean,
): TutorialStepSpec['highlightSlots'] | undefined {
  // Only highlight on match steps
  if (!matchPosition && !matchAudio) return undefined;

  // Highlight N and N-2 slots to show the comparison
  return ['n', 'n-2'];
}

/**
 * Build a TutorialStepSpec from raw trial data.
 */
function buildStep(
  index: number,
  [position, sound, matchPosition, matchAudio]: readonly [number, string, boolean, boolean],
): TutorialStepSpec {
  const intent = getIntent(index, matchPosition, matchAudio);
  const exitCondition = getExitCondition(index, matchPosition, matchAudio);
  const annotationKey = getAnnotationKey(index, matchPosition, matchAudio);
  const highlightSlots = getHighlightSlots(index, matchPosition, matchAudio);

  // Slow down first match steps for pedagogical effect (PRD: step 2 = first position, step 3 = first audio)
  const isFirstMatch = (index === 2 && matchPosition) || (index === 3 && matchAudio);
  const timeScale = isFirstMatch ? 0.7 : undefined;

  // Build expected match (only for ACTION steps after buffer is built)
  // This is the EXPLICIT contract - no guessing from annotation keys!
  const expectedMatch = index >= 2 ? { position: matchPosition, audio: matchAudio } : undefined;

  return {
    id: stepId(index),
    trial: { position, sound },
    intent,
    annotationKey,
    exitCondition,
    ...(timeScale !== undefined && { timeScale }),
    ...(highlightSlots !== undefined && { highlightSlots }),
    ...(expectedMatch !== undefined && { expectedMatch }),
  };
}

// =============================================================================
// Classic Tutorial Spec (Bases / Dual Catch)
// =============================================================================

/**
 * Classic N-Back Spotlight Configuration.
 * Introduces the UI elements before the tutorial begins.
 */
const ClassicSpotlightConfig: TutorialSpotlightConfig = {
  steps: [
    {
      id: 'hud',
      target: 'hud',
      contentKey: 'tutorial.spotlight.hud',
      position: 'bottom',
    },
    {
      id: 'timeline',
      target: 'timeline',
      contentKey: 'tutorial.spotlight.timeline',
      position: 'bottom',
    },
    {
      id: 'grid',
      target: 'grid',
      contentKey: 'tutorial.spotlight.grid',
      position: 'top',
    },
    {
      id: 'controls',
      target: 'controls',
      contentKey: 'tutorial.spotlight.controls',
      position: 'top',
    },
  ],
  introMessageKey: 'tutorial.spotlight.intro',
  introButtonKey: 'tutorial.spotlight.continue',
  outroMessageKey: 'tutorial.spotlight.outro',
  outroButtonKey: 'tutorial.spotlight.start',
};

/**
 * Classic N-2 Tutorial Specification.
 *
 * This is the standard onboarding tutorial that teaches:
 * - Position matching (visual memory)
 * - Audio matching (auditory memory)
 * - Dual matching (both modalities)
 *
 * 22 steps total, designed to be completed in 2-3 minutes.
 */
export const ClassicTutorialSpec: TutorialSpec = {
  id: 'basics',
  nLevel: 2,

  // Assessment segment: run with fixed response window on EVERY trial (including no-match)
  // to match classic pacing and avoid a "burst" on AUTO no-match steps.
  steps: (() => {
    const assessmentStartStepIndex = 12;
    return RAW_TRIALS.map((trial, index) => buildStep(index, trial)).map((step, index) =>
      index >= assessmentStartStepIndex ? { ...step, exitCondition: 'RESPONSE' } : step,
    );
  })(),

  // Hub Metadata
  associatedModeId: 'dual-catch',
  titleKey: 'tutorial.hub.basics.title',
  descriptionKey: 'tutorial.hub.basics.description',
  iconName: 'GraduationCap',

  // Timing Configuration (from thresholds.ts SSOT)
  timing: {
    feedbackDelayMs: TIMING_TUTORIAL_FEEDBACK_MS,
    autoAdvanceDelayMs: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    stimulusDurationMs: TIMING_TUTORIAL_STIMULUS_MS,
  },

  // Spotlight/Onboarding
  spotlight: ClassicSpotlightConfig,

  assessment: {
    // Start the "classic" segment 2 steps earlier so we can rebuild the N=2 buffer
    // with 2 warmup trials before scoring begins.
    startStepIndex: 12,
    warmupSteps: 2,
    minAccuracy: 0.7,
    // Classic Dual N-Back pacing: 3s ISI (response window), stimulus duration is overridden in UI for assessment.
    responseWindowMs: 3000,
  },
};


// Place, Pick, Trace, Memo tutorials removed (NeuroDual Lite)

// =============================================================================
// Tutorial Specs Registry
// =============================================================================

/**
 * All tutorial specs indexed by ID.
 * This is the single source of truth for available tutorials.
 */
export const TutorialSpecs = {
  basics: ClassicTutorialSpec,
} as const;

/**
 * Type-safe tutorial ID.
 */
export type TutorialSpecId = keyof typeof TutorialSpecs;

/**
 * Get a tutorial spec by ID.
 */
export function getTutorialSpec(id: TutorialSpecId): TutorialSpec {
  return TutorialSpecs[id];
}

/**
 * List of all tutorial IDs in display order for the Hub.
 */
export const TUTORIAL_HUB_ORDER: readonly TutorialSpecId[] = [
  'basics',
];
