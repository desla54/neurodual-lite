/**
 * Metamorphic Property Tests for Judge (Response Evaluation)
 *
 * Tests the TrialVO.evaluate() method and related evaluation logic.
 * Uses fast-check to generate trial/response pairs and verify metamorphic relations.
 *
 * Metamorphic testing validates that certain relationships hold between
 * different inputs and their outputs, rather than testing specific values.
 */

import { describe, it } from 'bun:test';
import * as fc from 'fast-check';
import { TrialVO, type ModalityVerdict, type TrialVerdict } from './trial-vo';
import type { LureType, ModalityId, Trial, TrialInput, TrialResult, TrialType } from './types';
import { POSITIONS, SOUNDS, COLORS } from './types';
import { IMAGE_MODALITY_SHAPES } from '../specs/thresholds';

// =============================================================================
// Arbitraries (Test Data Generators)
// =============================================================================

const positionArb = fc.constantFrom(...POSITIONS);
const soundArb = fc.constantFrom(...SOUNDS);
const colorArb = fc.constantFrom(...COLORS);
const imageArb = fc.constantFrom(...IMAGE_MODALITY_SHAPES);
const trialTypeArb = fc.constantFrom<TrialType>('V-Seul', 'A-Seul', 'Dual', 'Non-Cible', 'Tampon');
const lureTypeArb = fc.constantFrom<LureType>('n-1', 'n+1', 'sequence');
const reactionTimeArb = fc.integer({ min: 100, max: 3000 });
const trialIndexArb = fc.integer({ min: 0, max: 100 });

/** Generate a valid Trial object */
const trialArb: fc.Arbitrary<Trial> = fc.record({
  index: trialIndexArb,
  isBuffer: fc.boolean(),
  position: positionArb,
  sound: soundArb,
  color: colorArb,
  image: imageArb,
  trialType: trialTypeArb,
  isPositionTarget: fc.boolean(),
  isSoundTarget: fc.boolean(),
  isColorTarget: fc.boolean(),
  isImageTarget: fc.boolean(),
  isPositionLure: fc.option(fc.boolean(), { nil: undefined }),
  isSoundLure: fc.option(fc.boolean(), { nil: undefined }),
  isColorLure: fc.option(fc.boolean(), { nil: undefined }),
  isImageLure: fc.option(fc.boolean(), { nil: undefined }),
  positionLureType: fc.option(lureTypeArb, { nil: undefined }),
  soundLureType: fc.option(lureTypeArb, { nil: undefined }),
  colorLureType: fc.option(lureTypeArb, { nil: undefined }),
  imageLureType: fc.option(lureTypeArb, { nil: undefined }),
});

/** Generate a valid TrialInput object */
const trialInputArb: fc.Arbitrary<TrialInput> = fc.record({
  position: fc.option(fc.boolean(), { nil: undefined }),
  positionRT: fc.option(reactionTimeArb, { nil: undefined }),
  audio: fc.option(fc.boolean(), { nil: undefined }),
  audioRT: fc.option(reactionTimeArb, { nil: undefined }),
  color: fc.option(fc.boolean(), { nil: undefined }),
  colorRT: fc.option(reactionTimeArb, { nil: undefined }),
});

/** Generate trial with guaranteed target for a specific modality */
const trialWithTarget = (modality: ModalityId): fc.Arbitrary<Trial> =>
  trialArb.map((t) => {
    switch (modality) {
      case 'position':
        return { ...t, isPositionTarget: true };
      case 'audio':
        return { ...t, isSoundTarget: true };
      case 'color':
        return { ...t, isColorTarget: true };
      default:
        return t;
    }
  });

/** Generate trial with guaranteed non-target for a specific modality */
const trialWithNonTarget = (modality: ModalityId): fc.Arbitrary<Trial> =>
  trialArb.map((t) => {
    switch (modality) {
      case 'position':
        return { ...t, isPositionTarget: false };
      case 'audio':
        return { ...t, isSoundTarget: false };
      case 'color':
        return { ...t, isColorTarget: false };
      default:
        return t;
    }
  });

/** Generate trial with lure for a specific modality */
const trialWithLure = (modality: ModalityId, lureType: LureType): fc.Arbitrary<Trial> =>
  trialArb.map((t) => {
    switch (modality) {
      case 'position':
        return {
          ...t,
          isPositionTarget: false,
          isPositionLure: true,
          positionLureType: lureType,
        };
      case 'audio':
        return { ...t, isSoundTarget: false, isSoundLure: true, soundLureType: lureType };
      case 'color':
        return { ...t, isColorTarget: false, isColorLure: true, colorLureType: lureType };
      default:
        return t;
    }
  });

/** Generate input with response for a specific modality */
const inputWithResponse = (modality: ModalityId): fc.Arbitrary<TrialInput> =>
  fc.record({
    position: fc.constant(modality === 'position' ? true : undefined),
    positionRT: modality === 'position' ? reactionTimeArb : fc.constant(undefined),
    audio: fc.constant(modality === 'audio' ? true : undefined),
    audioRT: modality === 'audio' ? reactionTimeArb : fc.constant(undefined),
    color: fc.constant(modality === 'color' ? true : undefined),
    colorRT: modality === 'color' ? reactionTimeArb : fc.constant(undefined),
  });

/** Generate input without response for a specific modality */
const inputWithoutResponse = (modality: ModalityId): fc.Arbitrary<TrialInput> =>
  fc.record({
    position: fc.constant(modality === 'position' ? false : undefined),
    positionRT: fc.constant(undefined),
    audio: fc.constant(modality === 'audio' ? false : undefined),
    audioRT: fc.constant(undefined),
    color: fc.constant(modality === 'color' ? false : undefined),
    colorRT: fc.constant(undefined),
  });

// =============================================================================
// Helper Functions
// =============================================================================

const getModality = (verdict: TrialVerdict, modality: ModalityId): ModalityVerdict => {
  switch (modality) {
    case 'position':
      return verdict.position;
    case 'audio':
      return verdict.audio;
    case 'color':
      return verdict.color ?? verdict.position; // fallback for tests
    default:
      return verdict.position;
  }
};

const countResults = (verdicts: ModalityVerdict[], result: TrialResult): number =>
  verdicts.filter((v) => v.result === result).length;

// =============================================================================
// 1. Response Correctness Symmetry
// =============================================================================

describe('Judge Metamorphic Tests - Response Correctness Symmetry', () => {
  describe('Target trial + response = hit', () => {
    it('position: target + response yields hit', () => {
      fc.assert(
        fc.property(trialWithTarget('position'), inputWithResponse('position'), (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.position.result === 'hit';
        }),
      );
    });

    it('audio: target + response yields hit', () => {
      fc.assert(
        fc.property(trialWithTarget('audio'), inputWithResponse('audio'), (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.audio.result === 'hit';
        }),
      );
    });

    it('color: target + response yields hit (when color modality active)', () => {
      fc.assert(
        fc.property(
          trialWithTarget('color').map((t) => ({ ...t, isColorTarget: true })),
          inputWithResponse('color'),
          (trial, input) => {
            const verdict = new TrialVO(trial).evaluate(input);
            // Color verdict exists when isColorTarget is defined
            if (verdict.color) {
              return verdict.color.result === 'hit';
            }
            return true;
          },
        ),
      );
    });
  });

  describe('Target trial + no response = miss', () => {
    it('position: target + no response yields miss', () => {
      fc.assert(
        fc.property(
          trialWithTarget('position'),
          inputWithoutResponse('position'),
          (trial, input) => {
            const verdict = new TrialVO(trial).evaluate(input);
            return verdict.position.result === 'miss';
          },
        ),
      );
    });

    it('audio: target + no response yields miss', () => {
      fc.assert(
        fc.property(trialWithTarget('audio'), inputWithoutResponse('audio'), (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.audio.result === 'miss';
        }),
      );
    });

    it('target + undefined input yields miss', () => {
      fc.assert(
        fc.property(trialWithTarget('position'), (trial) => {
          const verdict = new TrialVO(trial).evaluate(undefined);
          return verdict.position.result === 'miss';
        }),
      );
    });
  });

  describe('Non-target trial + response = false alarm', () => {
    it('position: non-target + response yields falseAlarm', () => {
      fc.assert(
        fc.property(
          trialWithNonTarget('position'),
          inputWithResponse('position'),
          (trial, input) => {
            const verdict = new TrialVO(trial).evaluate(input);
            return verdict.position.result === 'falseAlarm';
          },
        ),
      );
    });

    it('audio: non-target + response yields falseAlarm', () => {
      fc.assert(
        fc.property(trialWithNonTarget('audio'), inputWithResponse('audio'), (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.audio.result === 'falseAlarm';
        }),
      );
    });
  });

  describe('Non-target trial + no response = correct rejection', () => {
    it('position: non-target + no response yields correctRejection', () => {
      fc.assert(
        fc.property(
          trialWithNonTarget('position'),
          inputWithoutResponse('position'),
          (trial, input) => {
            const verdict = new TrialVO(trial).evaluate(input);
            return verdict.position.result === 'correctRejection';
          },
        ),
      );
    });

    it('audio: non-target + no response yields correctRejection', () => {
      fc.assert(
        fc.property(trialWithNonTarget('audio'), inputWithoutResponse('audio'), (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.audio.result === 'correctRejection';
        }),
      );
    });

    it('non-target + undefined input yields correctRejection', () => {
      fc.assert(
        fc.property(trialWithNonTarget('position'), (trial) => {
          const verdict = new TrialVO(trial).evaluate(undefined);
          return verdict.position.result === 'correctRejection';
        }),
      );
    });
  });
});

// =============================================================================
// 2. Timing Relationships
// =============================================================================

describe('Judge Metamorphic Tests - Timing Relationships', () => {
  it('reaction time is captured when response is given', () => {
    fc.assert(
      fc.property(trialArb, reactionTimeArb, (trial, rt) => {
        const input: TrialInput = { position: true, positionRT: rt };
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.reactionTimeMs === rt;
      }),
    );
  });

  it('reaction time is null when no response', () => {
    fc.assert(
      fc.property(trialArb, (trial) => {
        const input: TrialInput = { position: false };
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.reactionTimeMs === null;
      }),
    );
  });

  it('reaction time is null when input is undefined', () => {
    fc.assert(
      fc.property(trialArb, (trial) => {
        const verdict = new TrialVO(trial).evaluate(undefined);
        return verdict.position.reactionTimeMs === null && verdict.audio.reactionTimeMs === null;
      }),
    );
  });

  it('different modalities can have different reaction times', () => {
    fc.assert(
      fc.property(trialArb, reactionTimeArb, reactionTimeArb, (trial, posRT, audioRT) => {
        const input: TrialInput = {
          position: true,
          positionRT: posRT,
          audio: true,
          audioRT: audioRT,
        };
        const verdict = new TrialVO(trial).evaluate(input);
        return (
          verdict.position.reactionTimeMs === posRT && verdict.audio.reactionTimeMs === audioRT
        );
      }),
    );
  });

  it('reaction time bounds: any positive RT is valid', () => {
    fc.assert(
      fc.property(trialArb, fc.integer({ min: 1, max: 100000 }), (trial, rt) => {
        const input: TrialInput = { position: true, positionRT: rt };
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.reactionTimeMs === rt;
      }),
    );
  });
});

// =============================================================================
// 3. Modality Independence
// =============================================================================

describe('Judge Metamorphic Tests - Modality Independence', () => {
  it('position response only affects position verdict', () => {
    fc.assert(
      fc.property(trialArb, fc.boolean(), (trial, responded) => {
        const inputWithPos: TrialInput = { position: responded };
        const inputWithoutPos: TrialInput = { position: !responded };

        const verdict1 = new TrialVO(trial).evaluate(inputWithPos);
        const verdict2 = new TrialVO(trial).evaluate(inputWithoutPos);

        // Position verdict should differ
        const posDiffers = verdict1.position.responded !== verdict2.position.responded;
        // Audio verdict should be the same (both have no audio input)
        const audioSame = verdict1.audio.responded === verdict2.audio.responded;

        return posDiffers && audioSame;
      }),
    );
  });

  it('audio response only affects audio verdict', () => {
    fc.assert(
      fc.property(trialArb, fc.boolean(), (trial, responded) => {
        const inputWithAudio: TrialInput = { audio: responded };
        const inputWithoutAudio: TrialInput = { audio: !responded };

        const verdict1 = new TrialVO(trial).evaluate(inputWithAudio);
        const verdict2 = new TrialVO(trial).evaluate(inputWithoutAudio);

        // Audio verdict should differ
        const audioDiffers = verdict1.audio.responded !== verdict2.audio.responded;
        // Position verdict should be the same
        const posSame = verdict1.position.responded === verdict2.position.responded;

        return audioDiffers && posSame;
      }),
    );
  });

  it('changing position target does not affect audio result', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (baseTrial, input) => {
        const trialPosTarget = { ...baseTrial, isPositionTarget: true };
        const trialPosNonTarget = { ...baseTrial, isPositionTarget: false };

        const verdict1 = new TrialVO(trialPosTarget).evaluate(input);
        const verdict2 = new TrialVO(trialPosNonTarget).evaluate(input);

        // Audio result should be the same regardless of position target status
        return verdict1.audio.result === verdict2.audio.result;
      }),
    );
  });

  it('changing audio target does not affect position result', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (baseTrial, input) => {
        const trialAudioTarget = { ...baseTrial, isSoundTarget: true };
        const trialAudioNonTarget = { ...baseTrial, isSoundTarget: false };

        const verdict1 = new TrialVO(trialAudioTarget).evaluate(input);
        const verdict2 = new TrialVO(trialAudioNonTarget).evaluate(input);

        // Position result should be the same regardless of audio target status
        return verdict1.position.result === verdict2.position.result;
      }),
    );
  });

  it('modality results are computed independently', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (posTarget, audioTarget, posResponse, audioResponse) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0,
            sound: 'C',
            color: 'ink-black',
            image: 'circle',
            trialType: 'Non-Cible',
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            isColorTarget: false,
            isImageTarget: false,
            isPositionLure: undefined,
            isSoundLure: undefined,
            isColorLure: undefined,
            isImageLure: undefined,
            positionLureType: undefined,
            soundLureType: undefined,
            colorLureType: undefined,
            imageLureType: undefined,
          };

          const input: TrialInput = {
            position: posResponse,
            audio: audioResponse,
          };

          const verdict = new TrialVO(trial).evaluate(input);

          // Position verdict depends only on posTarget and posResponse
          const expectedPosResult =
            posTarget && posResponse
              ? 'hit'
              : posTarget && !posResponse
                ? 'miss'
                : !posTarget && posResponse
                  ? 'falseAlarm'
                  : 'correctRejection';

          // Audio verdict depends only on audioTarget and audioResponse
          const expectedAudioResult =
            audioTarget && audioResponse
              ? 'hit'
              : audioTarget && !audioResponse
                ? 'miss'
                : !audioTarget && audioResponse
                  ? 'falseAlarm'
                  : 'correctRejection';

          return (
            verdict.position.result === expectedPosResult &&
            verdict.audio.result === expectedAudioResult
          );
        },
      ),
    );
  });
});

// =============================================================================
// 4. Dual Response Consistency
// =============================================================================

describe('Judge Metamorphic Tests - Dual Response Consistency', () => {
  it('both modalities correct = isFullyCorrect true', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posTarget, audioTarget) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0,
          sound: 'C',
          color: 'ink-black',
          image: 'circle',
          trialType: 'Non-Cible',
          isPositionTarget: posTarget,
          isSoundTarget: audioTarget,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: undefined,
          isSoundLure: undefined,
          isColorLure: undefined,
          isImageLure: undefined,
          positionLureType: undefined,
          soundLureType: undefined,
          colorLureType: undefined,
          imageLureType: undefined,
        };

        // Respond correctly: respond if target, don't respond if non-target
        const input: TrialInput = {
          position: posTarget,
          audio: audioTarget,
        };

        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.isFullyCorrect === true;
      }),
    );
  });

  it('one modality wrong = isFullyCorrect false', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posTarget, audioTarget) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0,
          sound: 'C',
          color: 'ink-black',
          image: 'circle',
          trialType: 'Non-Cible',
          isPositionTarget: posTarget,
          isSoundTarget: audioTarget,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: undefined,
          isSoundLure: undefined,
          isColorLure: undefined,
          isImageLure: undefined,
          positionLureType: undefined,
          soundLureType: undefined,
          colorLureType: undefined,
          imageLureType: undefined,
        };

        // Respond incorrectly for position, correctly for audio
        const input: TrialInput = {
          position: !posTarget, // Wrong
          audio: audioTarget, // Correct
        };

        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.isFullyCorrect === false;
      }),
    );
  });

  it('both modalities wrong = isFullyCorrect false', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posTarget, audioTarget) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0,
          sound: 'C',
          color: 'ink-black',
          image: 'circle',
          trialType: 'Non-Cible',
          isPositionTarget: posTarget,
          isSoundTarget: audioTarget,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: undefined,
          isSoundLure: undefined,
          isColorLure: undefined,
          isImageLure: undefined,
          positionLureType: undefined,
          soundLureType: undefined,
          colorLureType: undefined,
          imageLureType: undefined,
        };

        // Respond incorrectly for both
        const input: TrialInput = {
          position: !posTarget,
          audio: !audioTarget,
        };

        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.isFullyCorrect === false;
      }),
    );
  });

  it('isFullyCorrect = all modalities are hit or correctRejection', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);

        const posCorrect =
          verdict.position.result === 'hit' || verdict.position.result === 'correctRejection';
        const audioCorrect =
          verdict.audio.result === 'hit' || verdict.audio.result === 'correctRejection';
        const colorCorrect =
          verdict.color === null ||
          verdict.color.result === 'hit' ||
          verdict.color.result === 'correctRejection';

        const expected = posCorrect && audioCorrect && colorCorrect;
        return verdict.isFullyCorrect === expected;
      }),
    );
  });
});

// =============================================================================
// 5. Verdict Aggregation (SDT Counts)
// =============================================================================

describe('Judge Metamorphic Tests - Verdict Aggregation', () => {
  it('all hits + all CR = perfect performance (isFullyCorrect on all trials)', () => {
    fc.assert(
      fc.property(fc.array(trialArb, { minLength: 1, maxLength: 20 }), (trials) => {
        const verdicts = trials.map((trial) => {
          // Always respond correctly for all modalities (including color if active)
          const input: TrialInput = {
            position: trial.isPositionTarget,
            audio: trial.isSoundTarget,
            color: trial.isColorTarget,
          };
          return new TrialVO(trial).evaluate(input);
        });

        return verdicts.every((v) => v.isFullyCorrect);
      }),
    );
  });

  it('all misses + all FA = worst performance (no isFullyCorrect)', () => {
    fc.assert(
      fc.property(fc.array(trialArb, { minLength: 1, maxLength: 20 }), (trials) => {
        const verdicts = trials.map((trial) => {
          // Always respond incorrectly for all modalities
          const input: TrialInput = {
            position: !trial.isPositionTarget,
            audio: !trial.isSoundTarget,
            color: !trial.isColorTarget,
          };
          return new TrialVO(trial).evaluate(input);
        });

        return verdicts.every((v) => !v.isFullyCorrect);
      }),
    );
  });

  it('total correct = hits + correctRejections', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          // Match arrays length
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const hits = countResults(posVerdicts, 'hit');
          const cr = countResults(posVerdicts, 'correctRejection');
          const misses = countResults(posVerdicts, 'miss');
          const fa = countResults(posVerdicts, 'falseAlarm');

          const totalCorrect = hits + cr;
          const totalIncorrect = misses + fa;

          return totalCorrect + totalIncorrect === length;
        },
      ),
    );
  });
});

// =============================================================================
// 6. Count Preservation (SDT Invariants)
// =============================================================================

describe('Judge Metamorphic Tests - Count Preservation', () => {
  it('hits + misses = total targets', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const hits = countResults(posVerdicts, 'hit');
          const misses = countResults(posVerdicts, 'miss');
          const totalTargets = posVerdicts.filter((v) => v.isTarget).length;

          return hits + misses === totalTargets;
        },
      ),
    );
  });

  it('FA + CR = total non-targets', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const fa = countResults(posVerdicts, 'falseAlarm');
          const cr = countResults(posVerdicts, 'correctRejection');
          const totalNonTargets = posVerdicts.filter((v) => !v.isTarget).length;

          return fa + cr === totalNonTargets;
        },
      ),
    );
  });

  it('total responses = hits + FA', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const hits = countResults(posVerdicts, 'hit');
          const fa = countResults(posVerdicts, 'falseAlarm');
          const totalResponses = posVerdicts.filter((v) => v.responded).length;

          return hits + fa === totalResponses;
        },
      ),
    );
  });

  it('total non-responses = misses + CR', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const misses = countResults(posVerdicts, 'miss');
          const cr = countResults(posVerdicts, 'correctRejection');
          const totalNonResponses = posVerdicts.filter((v) => !v.responded).length;

          return misses + cr === totalNonResponses;
        },
      ),
    );
  });

  it('hits + misses + FA + CR = total trials', () => {
    fc.assert(
      fc.property(
        fc.array(trialArb, { minLength: 1, maxLength: 30 }),
        fc.array(trialInputArb, { minLength: 1, maxLength: 30 }),
        (trials, inputs) => {
          const length = Math.min(trials.length, inputs.length);
          const posVerdicts = trials.slice(0, length).map((trial, i) => {
            return new TrialVO(trial).evaluate(inputs[i]).position;
          });

          const hits = countResults(posVerdicts, 'hit');
          const misses = countResults(posVerdicts, 'miss');
          const fa = countResults(posVerdicts, 'falseAlarm');
          const cr = countResults(posVerdicts, 'correctRejection');

          return hits + misses + fa + cr === length;
        },
      ),
    );
  });

  it('SDT count invariant: hits + CR = correct decisions', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        const posResult = verdict.position.result;

        const isCorrectDecision = posResult === 'hit' || posResult === 'correctRejection';
        const matchesTarget = verdict.position.isTarget === verdict.position.responded;

        return isCorrectDecision === matchesTarget;
      }),
    );
  });
});

// =============================================================================
// 7. Lure Detection
// =============================================================================

describe('Judge Metamorphic Tests - Lure Detection', () => {
  it('response to lure = false alarm (lure is non-target)', () => {
    fc.assert(
      fc.property(
        trialWithLure('position', 'n-1'),
        inputWithResponse('position'),
        (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          // Lure is a non-target, so response = false alarm
          return verdict.position.result === 'falseAlarm';
        },
      ),
    );
  });

  it('lure information is preserved in verdict', () => {
    fc.assert(
      fc.property(fc.constantFrom<LureType>('n-1', 'n+1', 'sequence'), (lureType) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0,
          sound: 'C',
          color: 'ink-black',
          image: 'circle',
          trialType: 'Non-Cible',
          isPositionTarget: false,
          isSoundTarget: false,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: true,
          positionLureType: lureType,
          isSoundLure: undefined,
          isColorLure: undefined,
          isImageLure: undefined,
          soundLureType: undefined,
          colorLureType: undefined,
          imageLureType: undefined,
        };

        const verdict = new TrialVO(trial).evaluate({ position: true });

        return verdict.position.isLure === true && verdict.position.lureType === lureType;
      }),
    );
  });

  it('non-lure trials have isLure = false', () => {
    fc.assert(
      fc.property(
        trialArb.map((t) => ({
          ...t,
          isPositionLure: false,
          positionLureType: undefined,
        })),
        trialInputArb,
        (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.position.isLure === false && verdict.position.lureType === null;
        },
      ),
    );
  });

  it('n-1 lure detection is preserved', () => {
    fc.assert(
      fc.property(trialWithLure('position', 'n-1'), trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.isLure === true && verdict.position.lureType === 'n-1';
      }),
    );
  });

  it('n+1 lure detection is preserved', () => {
    fc.assert(
      fc.property(trialWithLure('position', 'n+1'), trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.isLure === true && verdict.position.lureType === 'n+1';
      }),
    );
  });

  it('sequence lure detection is preserved', () => {
    fc.assert(
      fc.property(trialWithLure('position', 'sequence'), trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position.isLure === true && verdict.position.lureType === 'sequence';
      }),
    );
  });

  it('lure false alarms can be distinguished from regular false alarms', () => {
    fc.assert(
      fc.property(
        trialWithLure('position', 'n-1'),
        trialWithNonTarget('position').map((t) => ({ ...t, isPositionLure: false })),
        (lureTrial, regularTrial) => {
          const lureInput: TrialInput = { position: true };
          const lureVerdict = new TrialVO(lureTrial).evaluate(lureInput);
          const regularVerdict = new TrialVO(regularTrial).evaluate(lureInput);

          // Both are false alarms
          const bothFA =
            lureVerdict.position.result === 'falseAlarm' &&
            regularVerdict.position.result === 'falseAlarm';

          // But lure has lure info
          const lureHasInfo = lureVerdict.position.isLure === true;
          const regularNoInfo = regularVerdict.position.isLure === false;

          return bothFA && lureHasInfo && regularNoInfo;
        },
      ),
    );
  });

  it('audio lure detection is independent from position', () => {
    fc.assert(
      fc.property(trialWithLure('audio', 'n-1'), trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.audio.isLure === true && verdict.audio.lureType === 'n-1';
      }),
    );
  });
});

// =============================================================================
// 8. Verdict Structure Invariants
// =============================================================================

describe('Judge Metamorphic Tests - Verdict Structure Invariants', () => {
  it('verdict always contains position and audio modalities', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.position !== undefined && verdict.audio !== undefined;
      }),
    );
  });

  it('verdict trialIndex matches trial index', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        return verdict.trialIndex === trial.index;
      }),
    );
  });

  it('modality verdict contains all required fields', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);

        const hasAllFields = (mv: ModalityVerdict): boolean =>
          mv.modality !== undefined &&
          typeof mv.isTarget === 'boolean' &&
          typeof mv.responded === 'boolean' &&
          ['hit', 'miss', 'falseAlarm', 'correctRejection'].includes(mv.result) &&
          (mv.reactionTimeMs === null || typeof mv.reactionTimeMs === 'number') &&
          typeof mv.isLure === 'boolean' &&
          (mv.lureType === null || ['n-1', 'n+1', 'sequence'].includes(mv.lureType));

        return hasAllFields(verdict.position) && hasAllFields(verdict.audio);
      }),
    );
  });

  it('verdict result is one of the four SDT outcomes', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const verdict = new TrialVO(trial).evaluate(input);
        const validResults: TrialResult[] = ['hit', 'miss', 'falseAlarm', 'correctRejection'];

        return (
          validResults.includes(verdict.position.result) &&
          validResults.includes(verdict.audio.result)
        );
      }),
    );
  });
});

// =============================================================================
// 9. TrialVO API Consistency
// =============================================================================

describe('Judge Metamorphic Tests - TrialVO API Consistency', () => {
  it('isTargetFor matches verdict.isTarget', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo = new TrialVO(trial);
        const verdict = vo.evaluate(input);

        return (
          vo.isTargetFor('position') === verdict.position.isTarget &&
          vo.isTargetFor('audio') === verdict.audio.isTarget
        );
      }),
    );
  });

  it('isLureFor matches verdict.isLure', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo = new TrialVO(trial);
        const verdict = vo.evaluate(input);

        return (
          vo.isLureFor('position') === verdict.position.isLure &&
          vo.isLureFor('audio') === verdict.audio.isLure
        );
      }),
    );
  });

  it('getLureType matches verdict.lureType', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo = new TrialVO(trial);
        const verdict = vo.evaluate(input);

        return (
          vo.getLureType('position') === verdict.position.lureType &&
          vo.getLureType('audio') === verdict.audio.lureType
        );
      }),
    );
  });

  it('TrialVO.from creates equivalent instance', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo1 = new TrialVO(trial);
        const vo2 = TrialVO.from(trial);

        const verdict1 = vo1.evaluate(input);
        const verdict2 = vo2.evaluate(input);

        return (
          verdict1.position.result === verdict2.position.result &&
          verdict1.audio.result === verdict2.audio.result &&
          verdict1.isFullyCorrect === verdict2.isFullyCorrect
        );
      }),
    );
  });

  it('toRaw returns original trial', () => {
    fc.assert(
      fc.property(trialArb, (trial) => {
        const vo = new TrialVO(trial);
        const raw = vo.toRaw();
        return raw === trial;
      }),
    );
  });
});

// =============================================================================
// 10. Edge Cases and Boundary Conditions
// =============================================================================

describe('Judge Metamorphic Tests - Edge Cases', () => {
  it('buffer trial evaluation still works', () => {
    fc.assert(
      fc.property(
        trialArb.map((t) => ({ ...t, isBuffer: true })),
        trialInputArb,
        (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          // Buffer trials can still be evaluated (even if typically excluded from scoring)
          return verdict.position !== undefined && verdict.audio !== undefined;
        },
      ),
    );
  });

  it('trial index 0 is handled', () => {
    fc.assert(
      fc.property(
        trialArb.map((t) => ({ ...t, index: 0 })),
        trialInputArb,
        (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.trialIndex === 0;
        },
      ),
    );
  });

  it('large trial index is handled', () => {
    fc.assert(
      fc.property(
        trialArb.map((t) => ({ ...t, index: 999999 })),
        trialInputArb,
        (trial, input) => {
          const verdict = new TrialVO(trial).evaluate(input);
          return verdict.trialIndex === 999999;
        },
      ),
    );
  });

  it('empty input object is handled', () => {
    fc.assert(
      fc.property(trialArb, (trial) => {
        const verdict = new TrialVO(trial).evaluate({});
        // Empty input = no responses
        return verdict.position.responded === false && verdict.audio.responded === false;
      }),
    );
  });

  it('input with only RT (no boolean) is handled as no response', () => {
    fc.assert(
      fc.property(trialArb, reactionTimeArb, (trial, rt) => {
        const input: TrialInput = { positionRT: rt };
        const verdict = new TrialVO(trial).evaluate(input);
        // RT without boolean response flag should be treated as no response
        return verdict.position.responded === false;
      }),
    );
  });
});

// =============================================================================
// 11. Determinism and Idempotence
// =============================================================================

describe('Judge Metamorphic Tests - Determinism', () => {
  it('evaluation is deterministic (same input = same output)', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo = new TrialVO(trial);
        const verdict1 = vo.evaluate(input);
        const verdict2 = vo.evaluate(input);

        return (
          verdict1.position.result === verdict2.position.result &&
          verdict1.audio.result === verdict2.audio.result &&
          verdict1.isFullyCorrect === verdict2.isFullyCorrect &&
          verdict1.trialIndex === verdict2.trialIndex
        );
      }),
    );
  });

  it('evaluation is pure (no side effects)', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo1 = new TrialVO(trial);
        const vo2 = new TrialVO(trial);

        // Evaluate vo1 multiple times
        vo1.evaluate(input);
        vo1.evaluate(input);
        vo1.evaluate(input);

        // vo2 should give same result without having been evaluated before
        const verdict1 = vo1.evaluate(input);
        const verdict2 = vo2.evaluate(input);

        return (
          verdict1.position.result === verdict2.position.result &&
          verdict1.audio.result === verdict2.audio.result
        );
      }),
    );
  });

  it('different TrialVO instances with same trial give same verdict', () => {
    fc.assert(
      fc.property(trialArb, trialInputArb, (trial, input) => {
        const vo1 = new TrialVO(trial);
        const vo2 = new TrialVO({ ...trial });

        const verdict1 = vo1.evaluate(input);
        const verdict2 = vo2.evaluate(input);

        return (
          verdict1.position.result === verdict2.position.result &&
          verdict1.audio.result === verdict2.audio.result &&
          verdict1.isFullyCorrect === verdict2.isFullyCorrect
        );
      }),
    );
  });
});

// =============================================================================
// 12. Triple Modality (Position + Audio + Color)
// =============================================================================

describe('Judge Metamorphic Tests - Triple Modality', () => {
  it('color modality is evaluated when isColorTarget is defined', () => {
    fc.assert(
      fc.property(
        trialArb.map((t) => ({ ...t, isColorTarget: true })),
        fc.boolean(),
        (trial, colorResponse) => {
          const input: TrialInput = { color: colorResponse };
          const verdict = new TrialVO(trial).evaluate(input);

          if (verdict.color === null) return true; // Color not active

          const expected = colorResponse ? 'hit' : 'miss';
          return verdict.color.result === expected;
        },
      ),
    );
  });

  it('isFullyCorrect requires all three modalities correct when color active', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (posTarget, audioTarget, colorTarget) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0,
            sound: 'C',
            color: 'ink-black',
            image: 'circle',
            trialType: 'Non-Cible',
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            isColorTarget: colorTarget,
            isImageTarget: false,
            isPositionLure: undefined,
            isSoundLure: undefined,
            isColorLure: undefined,
            isImageLure: undefined,
            positionLureType: undefined,
            soundLureType: undefined,
            colorLureType: undefined,
            imageLureType: undefined,
          };

          // Correct response for all
          const correctInput: TrialInput = {
            position: posTarget,
            audio: audioTarget,
            color: colorTarget,
          };

          // Wrong response for color only
          const wrongColorInput: TrialInput = {
            position: posTarget,
            audio: audioTarget,
            color: !colorTarget,
          };

          const correctVerdict = new TrialVO(trial).evaluate(correctInput);
          const wrongColorVerdict = new TrialVO(trial).evaluate(wrongColorInput);

          return (
            correctVerdict.isFullyCorrect === true && wrongColorVerdict.isFullyCorrect === false
          );
        },
      ),
    );
  });
});
