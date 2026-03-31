/**
 * TutorialSession XState Machine
 *
 * State machine for tutorial sessions (step-by-step guided learning).
 * Replaces the manual useState-based implementation in ActiveTutorialEngine.
 *
 * State diagram:
 *
 *   welcome ──START──► starting ──INIT_DONE──► idle
 *                                               │
 *           ┌───────────────────────────────────┤
 *           ▼                                   │
 *       stimulus ──STIMULUS_SHOWN──► traveling ─┼─► comparing ──► response
 *           ▲                           │       │       │            │
 *           │                           │       │       ▼            │
 *           │                           │       │   feedbackDelay    │
 *           │                           │       │       │            │
 *           │                           ▼       ▼       ▼            │
 *           └────────────────────── reorganizing ◄──────────────────┘
 *                                       │
 *                                       ▼
 *                                   finished
 *
 * UI INTEGRATION:
 * - UI renders based on machine state
 * - GSAP animations trigger events (TRAVEL_COMPLETE, COMPARE_COMPLETE, etc.)
 * - Machine handles all state transitions
 */
import { setup, assign, fromPromise } from 'xstate';
import type {
  TutorialSessionContext,
  TutorialSessionInput,
  TutorialSessionEvent,
  TutorialSessionStateValue,
  TutorialStimulus,
  TutorialCompletionReport,
  TutorialAssessmentResult,
} from './tutorial-session-types';
import type { TutorialSpec } from '../../specs/types';
import {
  TIMING_TUTORIAL_FEEDBACK_MS,
  TIMING_TUTORIAL_AUTO_ADVANCE_MS,
} from '../../specs/thresholds';

function computeNeedsUserResponse(spec: TutorialSpec, stepIndex: number): boolean {
  const step = spec.steps[stepIndex];
  if (!step) return false;

  // If exitCondition is RESPONSE, we need user interaction (match or tap-to-continue)
  if (step.exitCondition === 'RESPONSE') return true;

  const isDualPick = spec.controlLayout === 'dual-pick';
  if (isDualPick) {
    const expected = step.expectedClassification;
    return !!(expected?.position || expected?.sound);
  }

  return !!(step.expectedMatch?.position || step.expectedMatch?.audio);
}

// =============================================================================
// Default Timing (used when spec.timing is not provided)
// @see thresholds.ts (SSOT)
// =============================================================================

const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
const DEFAULT_FEEDBACK_DELAY_MS = IS_TEST_ENV ? 1 : TIMING_TUTORIAL_FEEDBACK_MS;
const DEFAULT_AUTO_ADVANCE_DELAY_MS = IS_TEST_ENV ? 1 : TIMING_TUTORIAL_AUTO_ADVANCE_MS;
const DEFAULT_ASSESSMENT_RESPONSE_WINDOW_MS = IS_TEST_ENV ? 1 : 1200;
const DEFAULT_ASSESSMENT_MIN_ACCURACY = 0.7;

// =============================================================================
// Initial Context Factory
// =============================================================================

function createInitialContext(input: TutorialSessionInput): TutorialSessionContext {
  // For recovery: if startAtStep is provided, start one step before
  // because advanceStep will increment it
  const initialStepIndex = input.startAtStep !== undefined ? input.startAtStep - 1 : -1;

  return {
    ...input,
    stepIndex: initialStepIndex,
    currentStimulus: null,
    userResponse: {},
    awaitingResponse: false,
    feedbackActive: false,
    pausedFromState: null,
    assessmentProgress: input.spec.assessment
      ? {
          startStepIndex: input.spec.assessment.startStepIndex,
          warmupSteps: input.spec.assessment.warmupSteps ?? 0,
          minAccuracy: input.spec.assessment.minAccuracy ?? DEFAULT_ASSESSMENT_MIN_ACCURACY,
          correctSteps: 0,
          totalSteps: 0,
        }
      : null,
  };
}

// =============================================================================
// Machine Definition
// =============================================================================

export const tutorialSessionMachine = setup({
  types: {
    context: {} as TutorialSessionContext,
    events: {} as TutorialSessionEvent,
    input: {} as TutorialSessionInput,
  },

  actions: {
    // =========================================================================
    // Step Management
    // =========================================================================

    advanceStep: assign(({ context }) => {
      const nextIdx = context.stepIndex + 1;
      const nextStep = context.spec.steps[nextIdx];

      if (!nextStep) {
        return { stepIndex: nextIdx };
      }

      const stimulus: TutorialStimulus = {
        id: `step-${nextIdx}`,
        turn: nextIdx,
        position: nextStep.trial.position,
        letter: nextStep.trial.sound,
      };

      return {
        stepIndex: nextIdx,
        currentStimulus: stimulus,
        userResponse: {},
        awaitingResponse: false,
        feedbackActive: false,
      };
    }),

    clearStimulus: assign(() => ({
      currentStimulus: null,
    })),

    setAwaitingResponse: assign(() => ({
      awaitingResponse: true,
    })),

    clearAwaitingResponse: assign(() => ({
      awaitingResponse: false,
    })),

    setFeedbackActive: assign(() => ({
      feedbackActive: true,
    })),

    clearFeedbackActive: assign(() => ({
      feedbackActive: false,
    })),

    // =========================================================================
    // Response Handling
    // =========================================================================

    processResponse: assign(({ context, event }) => {
      if (event.type !== 'RESPOND') return {};

      const isDualPick = context.spec.controlLayout === 'dual-pick';

      if (isDualPick) {
        return {
          userResponse: {
            ...context.userResponse,
            classification: {
              ...context.userResponse.classification,
              [event.channel]: event.value,
            },
          },
        };
      }

      // Classic mode: set match true (no toggle)
      const currentMatch = context.userResponse.match || { position: false, audio: false };
      return {
        userResponse: {
          ...context.userResponse,
          match: {
            ...currentMatch,
            [event.channel]: true,
          },
        },
      };
    }),

    scoreAssessmentStep: assign(({ context }) => {
      const progress = context.assessmentProgress;
      if (!progress) return {};
      if (context.stepIndex < progress.startStepIndex) return {};
      if (context.stepIndex < progress.startStepIndex + (progress.warmupSteps ?? 0)) return {};

      const step = context.spec.steps[context.stepIndex];
      if (!step) return {};

      const isDualPick = context.spec.controlLayout === 'dual-pick';
      if (isDualPick) {
        // Assessment scoring for dual-pick can be added later.
        return {};
      }

      const expected = step.expectedMatch;
      if (!expected) return {};

      const user = context.userResponse.match || { position: false, audio: false };
      const correct = !!expected.position === !!user.position && !!expected.audio === !!user.audio;

      return {
        assessmentProgress: {
          ...progress,
          totalSteps: progress.totalSteps + 1,
          correctSteps: progress.correctSteps + (correct ? 1 : 0),
        },
      };
    }),

    // =========================================================================
    // Callbacks
    // =========================================================================

    callOnComplete: ({ context }) => {
      const progress = context.assessmentProgress;

      let report: TutorialCompletionReport | undefined;
      if (progress && progress.totalSteps > 0) {
        const accuracy = progress.correctSteps / progress.totalSteps;
        const minAccuracy = progress.minAccuracy;
        const assessment: TutorialAssessmentResult = {
          startStepIndex: progress.startStepIndex + (progress.warmupSteps ?? 0),
          correctSteps: progress.correctSteps,
          totalSteps: progress.totalSteps,
          accuracy,
          minAccuracy,
          passed: accuracy >= minAccuracy,
        };
        report = { assessment };
      }

      context.onComplete(report);
    },

    callOnExit: ({ context }) => {
      context.onExit();
    },

    // =========================================================================
    // Pause Management
    // =========================================================================

    savePausedFromStimulus: assign({
      pausedFromState: () => 'stimulus' as TutorialSessionStateValue,
    }),
    savePausedFromTraveling: assign({
      pausedFromState: () => 'traveling' as TutorialSessionStateValue,
    }),
    savePausedFromComparing: assign({
      pausedFromState: () => 'comparing' as TutorialSessionStateValue,
    }),
    savePausedFromResponse: assign({
      pausedFromState: () => 'response' as TutorialSessionStateValue,
    }),
    savePausedFromFeedbackDelay: assign({
      pausedFromState: () => 'feedbackDelay' as TutorialSessionStateValue,
    }),
    savePausedFromReorganizing: assign({
      pausedFromState: () => 'reorganizing' as TutorialSessionStateValue,
    }),

    clearPausedState: assign({ pausedFromState: () => null }),
  },

  guards: {
    hasMoreSteps: ({ context }) => context.stepIndex + 1 < context.spec.steps.length,

    canCompare: ({ context }) => context.stepIndex >= context.spec.nLevel,

    needsUserResponse: ({ context }) => {
      return computeNeedsUserResponse(context.spec, context.stepIndex);
    },

    needsUserResponseAndNotAssessment: ({ context }) => {
      const progress = context.assessmentProgress;
      const isAssessment = !!progress && context.stepIndex >= progress.startStepIndex;
      return !isAssessment && computeNeedsUserResponse(context.spec, context.stepIndex);
    },

    needsUserResponseAndAssessment: ({ context }) => {
      const progress = context.assessmentProgress;
      const isAssessment = !!progress && context.stepIndex >= progress.startStepIndex;
      return isAssessment && computeNeedsUserResponse(context.spec, context.stepIndex);
    },

    isAssessmentStep: ({ context }) => {
      const progress = context.assessmentProgress;
      if (!progress) return false;
      return context.stepIndex >= progress.startStepIndex;
    },

    isNoMatchStepAndNotAssessment: ({ context }) => {
      const progress = context.assessmentProgress;
      if (progress && context.stepIndex >= progress.startStepIndex) return false;
      const step = context.spec.steps[context.stepIndex];
      if (!step) return false;
      return !step.expectedMatch?.position && !step.expectedMatch?.audio;
    },

    isResponseCorrect: ({ context, event }) => {
      const step = context.spec.steps[context.stepIndex];
      if (!step) return false;
      if (event.type !== 'RESPOND') return false;

      const isDualPick = context.spec.controlLayout === 'dual-pick';

      if (isDualPick) {
        const expected = step.expectedClassification;
        if (!expected) return false;

        // Calculate what the classification will be after this response
        const newClassification = {
          ...context.userResponse.classification,
          [event.channel]: event.value,
        };

        const posMatch = expected.position
          ? newClassification.position === expected.position
          : true;
        const sndMatch = expected.sound ? newClassification.sound === expected.sound : true;
        return posMatch && sndMatch;
      }

      // Classic mode
      const expected = step.expectedMatch;
      if (!expected) return false;

      // Calculate what the match will be after this toggle
      const currentMatch = context.userResponse.match || { position: false, audio: false };
      const newMatch = {
        ...currentMatch,
        [event.channel]: !currentMatch[event.channel as 'position' | 'audio'],
      };

      const posCorrect = !!expected.position === !!newMatch.position;
      const audioCorrect = !!expected.audio === !!newMatch.audio;
      return posCorrect && audioCorrect;
    },

    isAutoAdvanceStep: ({ context }) => {
      const step = context.spec.steps[context.stepIndex];
      if (!step) return false;
      return step.exitCondition === 'AUTO';
    },

    // Combined guard: current step is AUTO AND there are more steps
    isAutoWithMoreSteps: ({ context }) => {
      const step = context.spec.steps[context.stepIndex];
      if (!step) return false;
      return step.exitCondition === 'AUTO' && context.stepIndex + 1 < context.spec.steps.length;
    },

    nextStepIsAuto: ({ context }) => {
      const nextStep = context.spec.steps[context.stepIndex + 1];
      if (!nextStep) return true;
      return nextStep.exitCondition === 'AUTO';
    },

    isNotFirstStep: ({ context }) => context.stepIndex >= 0,

    isNoMatchStep: ({ context }) => {
      const step = context.spec.steps[context.stepIndex];
      if (!step) return false;
      return !step.expectedMatch?.position && !step.expectedMatch?.audio;
    },

    // Resume guards
    resumeToStimulus: ({ context }) => context.pausedFromState === 'stimulus',
    resumeToTraveling: ({ context }) => context.pausedFromState === 'traveling',
    resumeToComparing: ({ context }) => context.pausedFromState === 'comparing',
    resumeToResponse: ({ context }) => context.pausedFromState === 'response',
    resumeToFeedbackDelay: ({ context }) => context.pausedFromState === 'feedbackDelay',
    resumeToReorganizing: ({ context }) => context.pausedFromState === 'reorganizing',
  },

  actors: {
    initAudio: fromPromise(async ({ input }: { input: TutorialSessionInput }) => {
      await input.audio.init();
    }),
  },

  delays: {
    FEEDBACK_DELAY: ({ context }) =>
      context.spec.timing?.feedbackDelayMs ?? DEFAULT_FEEDBACK_DELAY_MS,
    AUTO_ADVANCE_DELAY: ({ context }) => {
      const base = context.spec.timing?.autoAdvanceDelayMs ?? DEFAULT_AUTO_ADVANCE_DELAY_MS;
      // Avoid a "burst" at the very start (buffer building steps).
      // These first AUTO steps are meant to be observed, not rushed.
      // In tests we keep the default 1ms delay to avoid timeouts.
      if (!IS_TEST_ENV && context.stepIndex >= 0 && context.stepIndex < 2) {
        return Math.max(base, 900);
      }
      return base;
    },

    ASSESSMENT_RESPONSE_WINDOW: ({ context }) =>
      context.spec.assessment?.responseWindowMs ?? DEFAULT_ASSESSMENT_RESPONSE_WINDOW_MS,
  },
}).createMachine({
  id: 'tutorialSession',
  initial: 'waiting',
  context: ({ input }) => createInitialContext(input),

  states: {
    // =========================================================================
    // WAITING - Waiting for user to press play (required for AudioContext)
    // =========================================================================

    waiting: {
      on: {
        START: 'starting',
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // STARTING - Initialize audio after user interaction
    // =========================================================================

    starting: {
      invoke: {
        id: 'initAudio',
        src: 'initAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'stimulus',
          actions: ['advanceStep'],
        },
        onError: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
      on: {
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // IDLE - Between steps (for auto-advance logic)
    // Only entered from AUTO steps (DEMO or late no-match) via reorganizing
    // =========================================================================

    idle: {
      after: {
        // Auto-advance after delay (we only enter idle from AUTO steps)
        AUTO_ADVANCE_DELAY: [
          {
            guard: 'hasMoreSteps',
            target: 'stimulus',
            actions: ['advanceStep'],
          },
          {
            target: 'finished',
            actions: ['callOnComplete'],
          },
        ],
      },
      on: {
        // Manual advance (used by tap-to-continue on no-match RESPONSE steps)
        ADVANCE: [
          {
            guard: 'hasMoreSteps',
            target: 'stimulus',
            actions: ['advanceStep'],
          },
          {
            target: 'finished',
            actions: ['callOnComplete'],
          },
        ],
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromResponse'], // Reuse response pause state
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // STIMULUS - Showing position + audio
    // =========================================================================

    stimulus: {
      // UI handles:
      // 1. Displaying the stimulus (position on grid + letter)
      // 2. Playing audio via audio.play()
      // 3. GSAP timing for stimulus duration
      // 4. Sending STIMULUS_SHOWN when ready to travel
      on: {
        RESPOND: {
          guard: 'isAssessmentStep',
          actions: ['processResponse'],
        },
        STIMULUS_SHOWN: 'traveling',
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromStimulus'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // TRAVELING - Stimulus traveling to timeline
    // =========================================================================

    traveling: {
      entry: ['clearStimulus'],
      // UI handles GSAP travel animation
      // Sends TRAVEL_COMPLETE when done
      on: {
        RESPOND: {
          guard: 'isAssessmentStep',
          actions: ['processResponse'],
        },
        TRAVEL_COMPLETE: [
          {
            guard: 'canCompare',
            target: 'comparing',
          },
          {
            target: 'reorganizing',
          },
        ],
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromTraveling'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // COMPARING - Cards sliding together
    // =========================================================================

    comparing: {
      // UI handles GSAP compare animation
      // Sends COMPARE_COMPLETE when done
      on: {
        RESPOND: {
          guard: 'isAssessmentStep',
          actions: ['processResponse'],
        },
        COMPARE_COMPLETE: [
          {
            guard: 'needsUserResponseAndNotAssessment',
            target: 'response',
            actions: ['setAwaitingResponse'],
          },
          {
            guard: 'needsUserResponseAndAssessment',
            target: 'response',
            actions: ['clearAwaitingResponse'],
          },
          {
            target: 'reorganizing',
          },
        ],
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromComparing'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // RESPONSE - Waiting for user input
    // =========================================================================

    response: {
      after: {
        ASSESSMENT_RESPONSE_WINDOW: {
          guard: 'isAssessmentStep',
          target: 'reorganizing',
          actions: ['scoreAssessmentStep', 'clearAwaitingResponse'],
        },
      },
      on: {
        RESPOND: [
          {
            guard: 'isAssessmentStep',
            actions: ['processResponse'],
          },
          {
            guard: 'isResponseCorrect',
            target: 'feedbackDelay',
            // Clear awaitingResponse immediately so pulse stops
            actions: ['processResponse', 'clearAwaitingResponse', 'setFeedbackActive'],
          },
          {
            actions: ['processResponse'],
          },
        ],
        ADVANCE: {
          guard: 'isNoMatchStepAndNotAssessment',
          target: 'reorganizing',
          actions: ['clearAwaitingResponse'],
        },
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromResponse'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // FEEDBACK_DELAY - Brief pause after correct response
    // =========================================================================

    feedbackDelay: {
      after: {
        FEEDBACK_DELAY: {
          target: 'reorganizing',
          actions: ['clearFeedbackActive'],
        },
      },
      on: {
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromFeedbackDelay'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // REORGANIZING - Timeline reorganizing
    // =========================================================================

    reorganizing: {
      on: {
        REORG_COMPLETE: [
          // AUTO steps (DEMO or late no-match): go through idle for delay before next step
          {
            guard: 'isAutoWithMoreSteps',
            target: 'idle',
          },
          // RESPONSE steps: go directly to next stimulus
          {
            guard: 'hasMoreSteps',
            target: 'stimulus',
            actions: ['advanceStep'],
          },
          {
            target: 'finished',
            actions: ['callOnComplete'],
          },
        ],
        PAUSE: {
          target: 'paused',
          actions: ['savePausedFromReorganizing'],
        },
        STOP: {
          target: 'finished',
          actions: ['callOnExit'],
        },
      },
    },

    // =========================================================================
    // PAUSED - Tutorial is paused
    // =========================================================================

    paused: {
      on: {
        RESUME: [
          { guard: 'resumeToStimulus', target: 'stimulus', actions: ['clearPausedState'] },
          { guard: 'resumeToTraveling', target: 'traveling', actions: ['clearPausedState'] },
          { guard: 'resumeToComparing', target: 'comparing', actions: ['clearPausedState'] },
          { guard: 'resumeToResponse', target: 'response', actions: ['clearPausedState'] },
          {
            guard: 'resumeToFeedbackDelay',
            target: 'feedbackDelay',
            actions: ['clearPausedState'],
          },
          { guard: 'resumeToReorganizing', target: 'reorganizing', actions: ['clearPausedState'] },
          // Fallback to stimulus if no saved state
          { target: 'stimulus', actions: ['clearPausedState'] },
        ],
        STOP: {
          target: 'finished',
          actions: ['clearPausedState', 'callOnExit'],
        },
      },
    },

    // =========================================================================
    // FINISHED - Terminal state
    // =========================================================================

    finished: {
      type: 'final',
    },
  },
});

export type TutorialSessionMachine = typeof tutorialSessionMachine;
