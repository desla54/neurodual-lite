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

// =============================================================================
// Dual Place Tutorial Spec
// =============================================================================

/**
 * Place Spotlight Configuration.
 * Introduces the drag-and-drop UI before the tutorial begins.
 */
const PlaceSpotlightConfig: TutorialSpotlightConfig = {
  steps: [
    {
      id: 'hud',
      target: 'hud',
      contentKey: 'tutorial.place.spotlight.hud',
      position: 'bottom',
    },
    {
      id: 'grid',
      target: 'grid',
      contentKey: 'tutorial.place.spotlight.grid',
      position: 'bottom',
    },
    {
      id: 'timeline',
      target: 'timeline',
      contentKey: 'tutorial.place.spotlight.timeline',
      position: 'top',
    },
    {
      id: 'cardPool',
      target: 'cardPool',
      contentKey: 'tutorial.place.spotlight.cardPool',
      position: 'top',
    },
  ],
  introMessageKey: 'tutorial.place.spotlight.intro',
  introButtonKey: 'tutorial.spotlight.continue',
  outroMessageKey: 'tutorial.place.spotlight.outro',
  outroButtonKey: 'tutorial.spotlight.start',
};

/**
 * Dual Place Tutorial Specification.
 *
 * This tutorial teaches:
 * - Observing stimuli (position + audio)
 * - Understanding the card pool (draggable cards)
 * - Drag-and-drop mechanics with magnetic snap
 * - Timeline temporal order (N-2 = oldest, N = present)
 * - Dual modality placement (position + audio)
 *
 * 16 steps total, designed to be completed in 4-5 minutes.
 */
export const PlaceTutorialSpec: TutorialSpec = {
  id: 'place',
  nLevel: 2,
  controlLayout: 'place',

  steps: [
    // === BUFFER PHASE (Steps 0-2) ===
    {
      id: 'place-step-00',
      trial: { position: 0, sound: 'C' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.observe',
      timeScale: 0.8,
    },
    {
      id: 'place-step-01',
      trial: { position: 4, sound: 'H' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.buffer',
    },
    {
      id: 'place-step-02',
      trial: { position: 7, sound: 'K' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.cardsAppear',
    },

    // === FIRST DRAG PHASE (Steps 3-6) ===
    {
      id: 'place-step-03',
      trial: { position: -1, sound: '' }, // No new stimulus, placement phase
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.firstDrag',
      expectedPlacement: { modality: 'position', slot: 'N-2', value: 0 },
    },
    {
      id: 'place-step-04',
      trial: { position: 1, sound: 'L' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.timelineExplain',
      highlightSlots: ['n-2', 'n-1', 'n'],
    },
    {
      id: 'place-step-05',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.positionN1',
      expectedPlacement: { modality: 'position', slot: 'N-1', value: 4 },
    },
    {
      id: 'place-step-06',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.positionN',
      expectedPlacement: { modality: 'position', slot: 'N', value: 7 },
    },

    // === AUDIO PHASE (Steps 7-10) ===
    {
      id: 'place-step-07',
      trial: { position: 5, sound: 'R' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.audioIntro',
    },
    {
      id: 'place-step-08',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.audioN2',
      expectedPlacement: { modality: 'audio', slot: 'N-2', value: 'C' },
    },
    {
      id: 'place-step-09',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.audioN1',
      expectedPlacement: { modality: 'audio', slot: 'N-1', value: 'H' },
    },
    {
      id: 'place-step-10',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.audioN',
      expectedPlacement: { modality: 'audio', slot: 'N', value: 'K' },
    },

    // === DUAL PHASE (Steps 11-14) ===
    {
      id: 'place-step-11',
      trial: { position: 2, sound: 'S' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.dualIntro',
    },
    {
      id: 'place-step-12',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.dualPractice',
      expectedPlacements: [
        { modality: 'position', slot: 'N-2', value: 1 },
        { modality: 'position', slot: 'N-1', value: 5 },
        { modality: 'position', slot: 'N', value: 2 },
        { modality: 'audio', slot: 'N-2', value: 'L' },
        { modality: 'audio', slot: 'N-1', value: 'R' },
        { modality: 'audio', slot: 'N', value: 'S' },
      ],
    },
    {
      id: 'place-step-13',
      trial: { position: 6, sound: 'T' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.rhythmExplain',
    },
    {
      id: 'place-step-14',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.place.autonomy',
      expectedPlacements: [
        { modality: 'position', slot: 'N-2', value: 5 },
        { modality: 'position', slot: 'N-1', value: 2 },
        { modality: 'position', slot: 'N', value: 6 },
        { modality: 'audio', slot: 'N-2', value: 'R' },
        { modality: 'audio', slot: 'N-1', value: 'S' },
        { modality: 'audio', slot: 'N', value: 'T' },
      ],
    },

    // === CONCLUSION (Step 15) ===
    {
      id: 'place-step-15',
      trial: { position: 3, sound: 'Q' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.place.conclusion',
    },
  ],

  // Hub Metadata
  associatedModeId: 'dual-place',
  titleKey: 'tutorial.hub.place.title',
  descriptionKey: 'tutorial.hub.place.description',
  iconName: 'MapPin',

  // Timing Configuration
  timing: {
    feedbackDelayMs: TIMING_TUTORIAL_FEEDBACK_MS,
    autoAdvanceDelayMs: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    stimulusDurationMs: TIMING_TUTORIAL_STIMULUS_MS,
  },

  // Spotlight/Onboarding
  spotlight: PlaceSpotlightConfig,
};

/**
 * Dual Pick Spotlight Configuration.
 * Introduces the classification UI before the tutorial begins.
 */
const PickSpotlightConfig: TutorialSpotlightConfig = {
  steps: [
    {
      id: 'hud',
      target: 'hud',
      contentKey: 'tutorial.pick.spotlight.hud',
      position: 'bottom',
    },
    {
      id: 'grid',
      target: 'grid',
      contentKey: 'tutorial.pick.spotlight.grid',
      position: 'bottom',
    },
    {
      id: 'controls',
      target: 'controls',
      contentKey: 'tutorial.pick.spotlight.controls',
      position: 'top',
    },
  ],
  introMessageKey: 'tutorial.pick.spotlight.intro',
  introButtonKey: 'tutorial.spotlight.continue',
  outroMessageKey: 'tutorial.pick.spotlight.outro',
  outroButtonKey: 'tutorial.spotlight.start',
};

/**
 * Dual Pick (Classification) Tutorial Spec
 *
 * Teaches: Dual classification (position: HAUT/MILIEU/BAS + sound: VOYELLE/CONSONNE)
 *
 * Position mapping for classification:
 * - HAUT (Top): positions 0, 1, 2
 * - MILIEU (Middle): positions 3, 4
 * - BAS (Bottom): positions 5, 6, 7
 *
 * Sound classification:
 * - VOYELLE (Vowel): A, E, I, O, U
 * - CONSONNE (Consonant): B, C, D, F, G, H, K, L, etc.
 *
 * 18 steps total:
 * - Phase 1 (0-1): Introduction
 * - Phase 2 (2-6): Position classification
 * - Phase 3 (7-11): Sound classification
 * - Phase 4 (12-15): Dual classification
 * - Phase 5 (16-17): Rhythm and conclusion
 */
export const PickTutorialSpec: TutorialSpec = {
  id: 'pick',
  nLevel: 1, // No N-back, just classification
  controlLayout: 'dual-pick',

  steps: [
    // ==========================================================================
    // PHASE 1: INTRODUCTION (Steps 0-1)
    // ==========================================================================
    {
      id: 'pick-step-00',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.intro',
      trial: { position: 4, sound: 'A' },
      timeScale: 0.8,
    },
    {
      id: 'pick-step-01',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.gridExplain',
      trial: { position: 1, sound: 'K' },
    },

    // ==========================================================================
    // PHASE 2: POSITION CLASSIFICATION (Steps 2-6)
    // ==========================================================================
    {
      id: 'pick-step-02',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.positionHaut',
      trial: { position: 0, sound: 'B' }, // Position 0 = HAUT
      expectedClassification: { position: 'HAUT' },
      timeScale: 0.7,
    },
    {
      id: 'pick-step-03',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.positionMilieu',
      trial: { position: 3, sound: 'C' }, // Position 3 = MILIEU
      expectedClassification: { position: 'MILIEU' },
    },
    {
      id: 'pick-step-04',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.positionBas',
      trial: { position: 6, sound: 'D' }, // Position 6 = BAS
      expectedClassification: { position: 'BAS' },
    },
    {
      id: 'pick-step-05',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.positionRecap',
      trial: { position: 2, sound: 'F' },
    },
    {
      id: 'pick-step-06',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.positionPractice',
      trial: { position: 5, sound: 'G' }, // Position 5 = BAS
      expectedClassification: { position: 'BAS' },
    },

    // ==========================================================================
    // PHASE 3: SOUND CLASSIFICATION (Steps 7-11)
    // ==========================================================================
    {
      id: 'pick-step-07',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.soundIntro',
      trial: { position: 4, sound: 'E' }, // E = VOYELLE
    },
    {
      id: 'pick-step-08',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.soundVoyelle',
      trial: { position: 1, sound: 'A' }, // A = VOYELLE
      expectedClassification: { sound: 'VOYELLE' },
      timeScale: 0.7,
    },
    {
      id: 'pick-step-09',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.soundConsonne',
      trial: { position: 7, sound: 'T' }, // T = CONSONNE
      expectedClassification: { sound: 'CONSONNE' },
    },
    {
      id: 'pick-step-10',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.soundRecap',
      trial: { position: 3, sound: 'I' }, // I = VOYELLE
    },
    {
      id: 'pick-step-11',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.soundPractice',
      trial: { position: 0, sound: 'O' }, // O = VOYELLE
      expectedClassification: { sound: 'VOYELLE' },
    },

    // ==========================================================================
    // PHASE 4: DUAL CLASSIFICATION (Steps 12-15)
    // ==========================================================================
    {
      id: 'pick-step-12',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.dualIntro',
      trial: { position: 4, sound: 'U' },
    },
    {
      id: 'pick-step-13',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.dualFirst',
      trial: { position: 2, sound: 'E' }, // HAUT + VOYELLE
      expectedClassification: { position: 'HAUT', sound: 'VOYELLE' },
      timeScale: 0.7,
    },
    {
      id: 'pick-step-14',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.dualSecond',
      trial: { position: 7, sound: 'R' }, // BAS + CONSONNE
      expectedClassification: { position: 'BAS', sound: 'CONSONNE' },
    },
    {
      id: 'pick-step-15',
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.pick.dualThird',
      trial: { position: 4, sound: 'I' }, // MILIEU + VOYELLE
      expectedClassification: { position: 'MILIEU', sound: 'VOYELLE' },
    },

    // ==========================================================================
    // PHASE 5: RHYTHM AND CONCLUSION (Steps 16-17)
    // ==========================================================================
    {
      id: 'pick-step-16',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.rhythm',
      trial: { position: 5, sound: 'S' },
    },
    {
      id: 'pick-step-17',
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.pick.conclusion',
      trial: { position: 1, sound: 'A' },
    },
  ],

  // Hub Metadata
  associatedModeId: 'dual-pick',
  titleKey: 'tutorial.hub.label.title',
  descriptionKey: 'tutorial.hub.label.description',
  iconName: 'Tag',

  // Timing Configuration
  timing: {
    feedbackDelayMs: TIMING_TUTORIAL_FEEDBACK_MS,
    autoAdvanceDelayMs: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    stimulusDurationMs: TIMING_TUTORIAL_STIMULUS_MS,
  },

  // Spotlight/Onboarding
  spotlight: PickSpotlightConfig,
};

// =============================================================================
// Dual Trace Tutorial Spec
// =============================================================================

/**
 * Raw trial data for the Trace tutorial sequence.
 * Format: [position, sound, nBackPosition, isAudioMatch]
 *
 * N-1 for simplicity (easier to learn the swipe concept).
 * Teaches:
 * 1. Position recall via swipe (active recall)
 * 2. Audio matches via double-tap
 * 3. Combined position + audio
 *
 * Designed for progressive learning:
 * - Steps 0-1: Demo (buffer building, just observe)
 * - Steps 2-5: Position-only swipes (learn the gesture)
 * - Steps 6-8: Audio matches introduced (learn double-tap)
 * - Steps 9-13: Mixed position + audio
 */
const TRACE_RAW_TRIALS: readonly [number, string, number | null, boolean][] = [
  // === DEMO PHASE (buffer building) ===
  [0, 'C', null, false], // Step 0: Demo - first stimulus, no N-back yet
  [3, 'H', null, false], // Step 1: Demo - second stimulus, buffer fills

  // === POSITION SWIPE PHASE ===
  [5, 'K', 3, false], // Step 2: First swipe! Target = position 3 (from step 1)
  [7, 'L', 5, false], // Step 3: Swipe to position 5
  [2, 'R', 7, false], // Step 4: Swipe to position 7
  [2, 'S', 2, false], // Step 5: Same position! Swipe to position 2

  // === AUDIO MATCH PHASE ===
  [4, 'S', 2, true], // Step 6: First audio match! S = S (step 5). Swipe + double-tap
  [1, 'T', 4, false], // Step 7: No audio match, just swipe
  [6, 'T', 1, true], // Step 8: Audio match! T = T (step 7). Swipe + double-tap

  // === MIXED PRACTICE ===
  [0, 'Q', 6, false], // Step 9: Just swipe
  [3, 'Q', 0, true], // Step 10: Audio match! Q = Q (step 9)
  [5, 'H', 3, false], // Step 11: Just swipe
  [7, 'H', 5, true], // Step 12: Audio match! H = H (step 11)
  [7, 'K', 7, false], // Step 13: Same position (7), just swipe
];

/**
 * Get annotation key for a Trace tutorial step.
 */
function getTraceAnnotationKey(
  index: number,
  _nBackPosition: number | null,
  isAudioMatch: boolean,
): string {
  // Demo phase
  if (index === 0) return 'tutorial.trace.intro';
  if (index === 1) return 'tutorial.trace.observe';

  // First swipe
  if (index === 2) return 'tutorial.trace.firstSwipe';

  // First audio match
  if (index === 6) return 'tutorial.trace.firstAudioMatch';

  // Generic patterns
  if (isAudioMatch) return 'tutorial.trace.audioMatch';

  // Varied swipe annotations
  const swipeAnnotations = [
    'tutorial.trace.swipe1',
    'tutorial.trace.swipe2',
    'tutorial.trace.swipe3',
    'tutorial.trace.swipe4',
    'tutorial.trace.swipe5',
  ];
  return swipeAnnotations[(index - 3) % swipeAnnotations.length] as string;
}

/**
 * Build Trace tutorial steps from raw data.
 */
function buildTraceStep(
  index: number,
  [position, sound, nBackPosition, isAudioMatch]: readonly [number, string, number | null, boolean],
): TutorialStepSpec {
  const isDemo = nBackPosition === null;
  const intent: TutorialStepSpec['intent'] = isDemo ? 'DEMO' : 'ACTION';
  const exitCondition: TutorialStepSpec['exitCondition'] = isDemo ? 'AUTO' : 'RESPONSE';
  const annotationKey = getTraceAnnotationKey(index, nBackPosition, isAudioMatch);

  // Slow down first swipe and first audio match for pedagogical effect
  const isFirstAction = index === 2 || index === 6;
  const timeScale = isFirstAction ? 0.7 : undefined;

  // Build expected swipe for ACTION steps
  const expectedSwipe =
    nBackPosition !== null
      ? {
          targetPosition: nBackPosition,
          audioMatch: isAudioMatch || undefined,
        }
      : undefined;

  return {
    id: `trace-step-${String(index).padStart(2, '0')}`,
    trial: { position, sound },
    intent,
    annotationKey,
    exitCondition,
    ...(timeScale !== undefined && { timeScale }),
    ...(expectedSwipe !== undefined && { expectedSwipe }),
  };
}

/**
 * Trace Spotlight Configuration.
 * Introduces the swipe-based UI before the tutorial begins.
 */
const TraceSpotlightConfig: TutorialSpotlightConfig = {
  steps: [
    {
      id: 'hud',
      target: 'hud',
      contentKey: 'tutorial.trace.spotlight.hud',
      position: 'bottom',
    },
    {
      id: 'grid',
      target: 'grid',
      contentKey: 'tutorial.trace.spotlight.grid',
      position: 'bottom',
    },
  ],
  introMessageKey: 'tutorial.trace.spotlight.intro',
  introButtonKey: 'tutorial.spotlight.continue',
  outroMessageKey: 'tutorial.trace.spotlight.outro',
  outroButtonKey: 'tutorial.spotlight.start',
};

/**
 * Dual Trace Tutorial Specification.
 *
 * This tutorial teaches:
 * - Active recall via swipe gestures (swipe towards N-back position)
 * - Audio match detection via double-tap
 * - Combined position + audio response
 *
 * Uses N-1 for simplicity (easier to learn the concept).
 * 14 steps total, designed to be completed in 2-3 minutes.
 */
export const TraceTutorialSpec: TutorialSpec = {
  id: 'trace',
  nLevel: 1, // N-1 for simplicity
  controlLayout: 'trace',
  steps: TRACE_RAW_TRIALS.map((trial, index) => buildTraceStep(index, trial)),

  // Hub Metadata
  associatedModeId: 'dual-trace',
  titleKey: 'tutorial.hub.trace.title',
  descriptionKey: 'tutorial.hub.trace.description',
  iconName: 'Fingerprint',

  // Timing Configuration
  timing: {
    feedbackDelayMs: TIMING_TUTORIAL_FEEDBACK_MS,
    autoAdvanceDelayMs: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    stimulusDurationMs: TIMING_TUTORIAL_STIMULUS_MS,
  },

  // Spotlight/Onboarding
  spotlight: TraceSpotlightConfig,
};

// =============================================================================
// Dual Memo Tutorial Spec
// =============================================================================

/**
 * Memo Spotlight Configuration.
 * Introduces the click-to-pick recall UI before the tutorial begins.
 */
const MemoSpotlightConfig: TutorialSpotlightConfig = {
  steps: [
    {
      id: 'hud',
      target: 'hud',
      contentKey: 'tutorial.memo.spotlight.hud',
      position: 'bottom',
    },
    {
      id: 'grid',
      target: 'grid',
      contentKey: 'tutorial.memo.spotlight.grid',
      position: 'bottom',
    },
    {
      id: 'recallZone',
      target: 'recallZone',
      contentKey: 'tutorial.memo.spotlight.recallZone',
      position: 'top',
    },
    {
      id: 'validateButton',
      target: 'validateButton',
      contentKey: 'tutorial.memo.spotlight.validateButton',
      position: 'top',
    },
  ],
  introMessageKey: 'tutorial.memo.spotlight.intro',
  introButtonKey: 'tutorial.spotlight.continue',
  outroMessageKey: 'tutorial.memo.spotlight.outro',
  outroButtonKey: 'tutorial.spotlight.start',
};

/**
 * Dual Memo Tutorial Specification.
 *
 * This tutorial teaches:
 * - Conscious observation of stimuli (knowing recall is coming)
 * - Understanding the recall window (N, N-1, N-2)
 * - Click-to-pick mechanics for position and audio
 * - Window shift concept (timeline moves with each stimulus)
 * - Correction system (up to 3 per cell)
 * - Validation workflow (commit all picks)
 *
 * Uses vowels (A, E, I, O, U) for easier memorization.
 * 18 steps total, designed to be completed in 5-6 minutes.
 */
export const MemoTutorialSpec: TutorialSpec = {
  id: 'memo',
  nLevel: 2,
  controlLayout: 'memo',

  steps: [
    // === BUFFER PHASE (Steps 0-2): Conscious observation ===
    {
      id: 'memo-step-00',
      trial: { position: 0, sound: 'A' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.observeFirst',
      timeScale: 0.7,
    },
    {
      id: 'memo-step-01',
      trial: { position: 4, sound: 'E' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.observeSecond',
    },
    {
      id: 'memo-step-02',
      trial: { position: 7, sound: 'I' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.observeThird',
    },

    // === INTRO RECALL (Step 3) ===
    {
      id: 'memo-step-03',
      trial: { position: -1, sound: '' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.recallIntro',
    },

    // === FIRST RECALL (Steps 4-6) ===
    {
      id: 'memo-step-04',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.firstRecall',
      expectedRecall: { slot: 'N-2', modality: 'position', value: 0 },
    },
    {
      id: 'memo-step-05',
      trial: { position: -1, sound: '' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.feedbackExplain',
    },
    {
      id: 'memo-step-06',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.multiSlot',
      expectedRecalls: [
        { slot: 'N-1', modality: 'position', value: 4 },
        { slot: 'N', modality: 'position', value: 7 },
      ],
    },

    // === NEW STIMULUS + WINDOW SHIFT (Steps 7-9) ===
    {
      id: 'memo-step-07',
      trial: { position: 2, sound: 'O' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.newStimulus',
    },
    {
      id: 'memo-step-08',
      trial: { position: -1, sound: '' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.windowShift',
    },
    {
      id: 'memo-step-09',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.fullPosition',
      expectedRecalls: [
        { slot: 'N-2', modality: 'position', value: 4 },
        { slot: 'N-1', modality: 'position', value: 7 },
        { slot: 'N', modality: 'position', value: 2 },
      ],
    },

    // === AUDIO RECALL (Steps 10-12) ===
    {
      id: 'memo-step-10',
      trial: { position: 5, sound: 'U' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.audioIntro',
    },
    {
      id: 'memo-step-11',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.firstAudioRecall',
      expectedRecall: { slot: 'N-2', modality: 'audio', value: 'E' },
    },
    {
      id: 'memo-step-12',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.fullAudio',
      expectedRecalls: [
        { slot: 'N-1', modality: 'audio', value: 'I' },
        { slot: 'N', modality: 'audio', value: 'O' },
      ],
    },

    // === DUAL RECALL (Steps 13-14) ===
    {
      id: 'memo-step-13',
      trial: { position: 1, sound: 'A' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.dualIntro',
    },
    {
      id: 'memo-step-14',
      trial: { position: -1, sound: '' },
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.dualPractice',
      expectedRecalls: [
        // Window after step 13: positions 2, 5, 1 | audio O, U, A
        { slot: 'N-2', modality: 'position', value: 2 },
        { slot: 'N-1', modality: 'position', value: 5 },
        { slot: 'N', modality: 'position', value: 1 },
        { slot: 'N-2', modality: 'audio', value: 'O' },
        { slot: 'N-1', modality: 'audio', value: 'U' },
        { slot: 'N', modality: 'audio', value: 'A' },
      ],
    },

    // === CORRECTION SYSTEM (Steps 15-16) ===
    {
      id: 'memo-step-15',
      trial: { position: -1, sound: '' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.correctionExplain',
    },
    {
      id: 'memo-step-16',
      trial: { position: 8, sound: 'E' }, // New stimulus for correction practice
      intent: 'ACTION',
      exitCondition: 'RESPONSE',
      annotationKey: 'tutorial.memo.withCorrection',
      expectedRecalls: [
        // Window: positions 5, 1, 8 | audio U, A, E
        { slot: 'N-2', modality: 'position', value: 5 },
        { slot: 'N-1', modality: 'position', value: 1 },
        { slot: 'N', modality: 'position', value: 8 },
        { slot: 'N-2', modality: 'audio', value: 'U' },
        { slot: 'N-1', modality: 'audio', value: 'A' },
        { slot: 'N', modality: 'audio', value: 'E' },
      ],
    },

    // === CONCLUSION (Step 17) ===
    {
      id: 'memo-step-17',
      trial: { position: -1, sound: '' },
      intent: 'DEMO',
      exitCondition: 'AUTO',
      annotationKey: 'tutorial.memo.conclusion',
    },
  ],

  // Hub Metadata
  associatedModeId: 'dual-memo',
  titleKey: 'tutorial.hub.memo.title',
  descriptionKey: 'tutorial.hub.memo.description',
  iconName: 'Brain',

  // Timing Configuration
  timing: {
    feedbackDelayMs: 1000, // Longer for recall feedback
    autoAdvanceDelayMs: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    stimulusDurationMs: 700, // Longer for intentional memorization
  },

  // Spotlight/Onboarding
  spotlight: MemoSpotlightConfig,
};

// =============================================================================
// Tutorial Specs Registry
// =============================================================================

/**
 * All tutorial specs indexed by ID.
 * This is the single source of truth for available tutorials.
 */
export const TutorialSpecs = {
  basics: ClassicTutorialSpec,
  place: PlaceTutorialSpec,
  pick: PickTutorialSpec,
  trace: TraceTutorialSpec,
  memo: MemoTutorialSpec,
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
  'place',
  'pick',
  'trace',
  'memo',
];
