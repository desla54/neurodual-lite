/**
 * Property-Based Tests for Trial Judge Module
 *
 * Uses fast-check to verify invariants and properties of the judge system.
 * Tests all judge implementations: SDTJudge, AccuracyJudge, BrainWorkshopJudge.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type { ModalityId, Position, Sound, Color, ImageShape, Trial } from '../types/core';
import { SDTJudge } from './sdt-judge';
import { AccuracyJudge } from './accuracy-judge';
import { BrainWorkshopJudge } from './brainworkshop-judge';
import type { EvaluationContext, TrialResponse, ModalityResponse } from './trial-judge';
import type { TrialResultType, TrialVerdict } from './verdict';

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

const modalityIdArb: fc.Arbitrary<ModalityId> = fc.constantFrom(
  'position',
  'audio',
  'color',
  'image',
);

const positionArb: fc.Arbitrary<Position> = fc.integer({
  min: 0,
  max: 7,
}) as fc.Arbitrary<Position>;

const soundArb: fc.Arbitrary<Sound> = fc.constantFrom('C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T');

const colorArb: fc.Arbitrary<Color> = fc.constantFrom(
  'ink-black',
  'ink-navy',
  'ink-burgundy',
  'ink-forest',
  'ink-burnt',
  'ink-plum',
  'ink-teal',
  'ink-mustard',
);

// @ts-expect-error test override
const imageArb: fc.Arbitrary<ImageShape> = fc.constantFrom(
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'heart',
);

const reactionTimeArb: fc.Arbitrary<number> = fc.integer({ min: 100, max: 2000 });

const trialArb: fc.Arbitrary<Trial> = fc
  .record({
    index: fc.nat({ max: 100 }),
    isBuffer: fc.boolean(),
    position: positionArb,
    sound: soundArb,
    color: colorArb,
    image: imageArb,
    isPositionTarget: fc.boolean(),
    isSoundTarget: fc.boolean(),
    isColorTarget: fc.boolean(),
    isImageTarget: fc.boolean(),
    isPositionLure: fc.option(fc.boolean(), { nil: undefined }),
    isSoundLure: fc.option(fc.boolean(), { nil: undefined }),
    isColorLure: fc.option(fc.boolean(), { nil: undefined }),
    isImageLure: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map((props) => ({
    ...props,
    trialType: deriveTrialType(props.isPositionTarget, props.isSoundTarget),
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
  })) as fc.Arbitrary<Trial>;

const nonBufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((trial) => ({
  ...trial,
  isBuffer: false,
}));

const bufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((trial) => ({
  ...trial,
  isBuffer: true,
}));

// Generate trial with specific target configuration
function targetTrialArb(positionTarget: boolean, audioTarget: boolean): fc.Arbitrary<Trial> {
  return trialArb.map((trial) => ({
    ...trial,
    isBuffer: false,
    isPositionTarget: positionTarget,
    isSoundTarget: audioTarget,
    trialType: deriveTrialType(positionTarget, audioTarget),
  }));
}

// Generate array of modalities (1-4 modalities)
const activeModalitiesArb: fc.Arbitrary<ModalityId[]> = fc
  .subarray(['position', 'audio', 'color', 'image'] as ModalityId[], { minLength: 1, maxLength: 4 })
  .filter((arr) => arr.length > 0);

// Generate context with random modalities
const contextArb: fc.Arbitrary<EvaluationContext> = fc
  .record({
    activeModalities: activeModalitiesArb,
    passThreshold: fc.double({ min: 0.5, max: 4.0, noNaN: true }),
    downThreshold: fc.option(fc.double({ min: 0.0, max: 2.0, noNaN: true }), { nil: undefined }),
    strategy: fc.constantFrom('sdt', 'dualnback-classic', 'brainworkshop', 'accuracy'),
  })
  .map((ctx) => ({
    ...ctx,
    activeModalities: ctx.activeModalities as readonly ModalityId[],
  }));

// Generate response for specific modalities
function responseArb(
  trialIndex: number,
  modalities: readonly ModalityId[],
): fc.Arbitrary<TrialResponse> {
  return fc
    .record({
      responses: fc.tuple(
        ...modalities.map((modalityId) =>
          fc.record({
            modalityId: fc.constant(modalityId),
            pressed: fc.boolean(),
            reactionTimeMs: fc.option(reactionTimeArb, { nil: undefined }),
          }),
        ),
      ),
    })
    .map(({ responses }) => {
      const map = new Map<ModalityId, ModalityResponse>();
      for (const r of responses) {
        map.set(r.modalityId, r);
      }
      return {
        trialIndex,
        responses: map,
        timestamp: new Date(),
      };
    });
}

// Generate response that matches trial targets (for hit scenarios)
function matchingResponseArb(
  trial: Trial,
  modalities: readonly ModalityId[],
): fc.Arbitrary<TrialResponse> {
  return fc
    .record({
      responses: fc.tuple(
        ...modalities.map((modalityId) => {
          const isTarget = getIsTargetForModality(trial, modalityId);
          return fc.record({
            modalityId: fc.constant(modalityId),
            pressed: fc.constant(isTarget), // Press only if target
            reactionTimeMs: isTarget
              ? fc.option(reactionTimeArb, { nil: undefined })
              : fc.constant(undefined),
          });
        }),
      ),
    })
    .map(({ responses }) => {
      const map = new Map<ModalityId, ModalityResponse>();
      for (const r of responses) {
        map.set(r.modalityId, r);
      }
      return {
        trialIndex: trial.index,
        responses: map,
        timestamp: new Date(),
      };
    });
}

// =============================================================================
// Helpers
// =============================================================================

function deriveTrialType(
  positionTarget: boolean,
  audioTarget: boolean,
): 'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible' | 'Tampon' {
  if (positionTarget && audioTarget) return 'Dual';
  if (positionTarget) return 'V-Seul';
  if (audioTarget) return 'A-Seul';
  return 'Non-Cible';
}

function getIsTargetForModality(trial: Trial, modalityId: ModalityId): boolean {
  switch (modalityId) {
    case 'position':
      return trial.isPositionTarget;
    case 'audio':
      return trial.isSoundTarget;
    case 'color':
      return trial.isColorTarget;
    case 'image':
      return trial.isImageTarget;
    default:
      return false;
  }
}

function createBasicContext(
  modalities: readonly ModalityId[] = ['position', 'audio'],
): EvaluationContext {
  return {
    activeModalities: modalities,
    passThreshold: 2.0,
    strategy: 'sdt',
  };
}

function createResponse(
  trialIndex: number,
  modalityResponses: Array<{ modalityId: ModalityId; pressed: boolean; reactionTimeMs?: number }>,
): TrialResponse {
  const map = new Map<ModalityId, ModalityResponse>();
  for (const r of modalityResponses) {
    map.set(r.modalityId, r);
  }
  return {
    trialIndex,
    responses: map,
    timestamp: new Date(),
  };
}

// =============================================================================
// 1. JUDGMENT CORRECTNESS (20 tests)
// =============================================================================

describe('Judgment Correctness Properties', () => {
  // --------------------------------------------------------------------------
  // Hit Detection
  // --------------------------------------------------------------------------

  it('1.1 Hit: SDTJudge produces hit when target AND response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('position')?.wasTarget).toBe(true);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.2 Hit: AccuracyJudge produces hit when response', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, reactionTimeArb, (trial, rt) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.3 Hit: BrainWorkshopJudge produces hit when target AND response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), reactionTimeArb, (trial, rt) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.4 Hit: Multi-modality hits correctly tracked', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
        }),
        reactionTimeArb,
        reactionTimeArb,
        ({ posTarget, audioTarget }, rt1, rt2) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: deriveTrialType(posTarget, audioTarget),
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

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(trial.index, [
            {
              modalityId: 'position',
              pressed: posTarget,
              reactionTimeMs: posTarget ? rt1 : undefined,
            },
            {
              modalityId: 'audio',
              pressed: audioTarget,
              reactionTimeMs: audioTarget ? rt2 : undefined,
            },
          ]);

          const verdict = judge.evaluate(trial, response, ctx);

          if (posTarget) {
            expect(verdict.byModality.get('position')?.result).toBe('hit');
          }
          if (audioTarget) {
            expect(verdict.byModality.get('audio')?.result).toBe('hit');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('1.5 Hit: Reaction time tracked only for responses', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt);
        expect(verdict.minReactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // Miss Detection
  // --------------------------------------------------------------------------

  it('1.6 Miss: SDTJudge produces miss when target but NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('miss');
        expect(verdict.byModality.get('position')?.wasTarget).toBe(true);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('1.7 Miss: BrainWorkshopJudge produces miss when target but NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('1.8 Miss: AccuracyJudge produces miss when NO response', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('1.9 Miss: Multi-modality misses correctly tracked', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('miss');
        expect(verdict.byModality.get('audio')?.result).toBe('miss');
        expect(verdict.isCorrect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('1.10 Miss: Partial miss (one hit, one miss) detected', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
          { modalityId: 'audio', pressed: false },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('miss');
        expect(verdict.overall).toBe('miss'); // Miss takes priority
        expect(verdict.isCorrect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // False Alarm Detection
  // --------------------------------------------------------------------------

  it('1.11 False Alarm: SDTJudge produces FA when NO target but response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
        expect(verdict.byModality.get('position')?.wasTarget).toBe(false);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.12 False Alarm: BrainWorkshopJudge produces FA when NO target but response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  it('1.13 False Alarm: Multi-modality FA correctly tracked', () => {
    fc.assert(
      fc.property(
        targetTrialArb(false, false),
        reactionTimeArb,
        reactionTimeArb,
        (trial, rt1, rt2) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
            { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
          ]);

          const verdict = judge.evaluate(trial, response, ctx);

          expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
          expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
          expect(verdict.isCorrect).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('1.14 False Alarm: Overall FA when one FA and one CR', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
          { modalityId: 'audio', pressed: false },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
        expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
        expect(verdict.overall).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // Correct Rejection Detection
  // --------------------------------------------------------------------------

  it('1.15 Correct Rejection: SDTJudge produces CR when NO target and NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
        expect(verdict.byModality.get('position')?.wasTarget).toBe(false);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(false);
        expect(verdict.isCorrect).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.16 Correct Rejection: BrainWorkshopJudge produces CR when NO target and NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
      }),
      { numRuns: 100 },
    );
  });

  it('1.17 Correct Rejection: Multi-modality CR correctly tracked', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
        expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
        expect(verdict.overall).toBe('correct-rejection');
        expect(verdict.isCorrect).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.18 All four outcomes possible for different inputs', () => {
    // For each possible (isTarget, hadResponse) combination
    const cases: Array<{ isTarget: boolean; hadResponse: boolean; expected: TrialResultType }> = [
      { isTarget: true, hadResponse: true, expected: 'hit' },
      { isTarget: true, hadResponse: false, expected: 'miss' },
      { isTarget: false, hadResponse: true, expected: 'false-alarm' },
      { isTarget: false, hadResponse: false, expected: 'correct-rejection' },
    ];

    for (const { isTarget, hadResponse, expected } of cases) {
      const trial: Trial = {
        index: 0,
        isBuffer: false,
        position: 0 as Position,
        sound: 'C' as Sound,
        color: 'ink-black' as Color,
        image: 'circle' as ImageShape,
        trialType: isTarget ? 'V-Seul' : 'Non-Cible',
        isPositionTarget: isTarget,
        isSoundTarget: false,
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

      const judge = new SDTJudge();
      const ctx = createBasicContext(['position']);
      const response = createResponse(trial.index, [
        { modalityId: 'position', pressed: hadResponse },
      ]);

      const verdict = judge.evaluate(trial, response, ctx);

      expect(verdict.byModality.get('position')?.result).toBe(expected);
    }
  });

  it('1.19 Overall isCorrect true only when all modalities correct', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
          posResponse: fc.boolean(),
          audioResponse: fc.boolean(),
        }),
        ({ posTarget, audioTarget, posResponse, audioResponse }) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: deriveTrialType(posTarget, audioTarget),
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

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: posResponse },
            { modalityId: 'audio', pressed: audioResponse },
          ]);

          const verdict = judge.evaluate(trial, response, ctx);

          // isCorrect = all modalities have hit or correct-rejection
          const posCorrect = posTarget === posResponse;
          const audioCorrect = audioTarget === audioResponse;
          const expectedCorrect = posCorrect && audioCorrect;

          expect(verdict.isCorrect).toBe(expectedCorrect);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('1.20 isTarget true if ANY modality is target', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
        }),
        ({ posTarget, audioTarget }) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: deriveTrialType(posTarget, audioTarget),
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

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: false },
            { modalityId: 'audio', pressed: false },
          ]);

          const verdict = judge.evaluate(trial, response, ctx);

          expect(verdict.isTarget).toBe(posTarget || audioTarget);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 2. JUDGMENT CONSISTENCY (10 tests)
// =============================================================================

describe('Judgment Consistency Properties', () => {
  it('2.1 Determinism: Same input produces same judgment (SDTJudge)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge1 = new SDTJudge();
        const judge2 = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);

        const verdict1 = judge1.evaluate(trial, response, ctx);
        const verdict2 = judge2.evaluate(trial, response, ctx);

        expect(verdict1.overall).toBe(verdict2.overall);
        expect(verdict1.isCorrect).toBe(verdict2.isCorrect);
        expect(verdict1.isTarget).toBe(verdict2.isTarget);
        expect(verdict1.byModality.get('position')?.result).toBe(
          verdict2.byModality.get('position')?.result,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('2.2 Determinism: Same input produces same judgment (AccuracyJudge)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge1 = new AccuracyJudge();
        const judge2 = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);

        const verdict1 = judge1.evaluate(trial, response, ctx);
        const verdict2 = judge2.evaluate(trial, response, ctx);

        expect(verdict1.overall).toBe(verdict2.overall);
        expect(verdict1.isCorrect).toBe(verdict2.isCorrect);
      }),
      { numRuns: 100 },
    );
  });

  it('2.3 Determinism: Same input produces same judgment (BrainWorkshopJudge)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge1 = new BrainWorkshopJudge();
        const judge2 = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);

        const verdict1 = judge1.evaluate(trial, response, ctx);
        const verdict2 = judge2.evaluate(trial, response, ctx);

        expect(verdict1.overall).toBe(verdict2.overall);
        expect(verdict1.isCorrect).toBe(verdict2.isCorrect);
      }),
      { numRuns: 100 },
    );
  });

  it('2.4 Mutual Exclusivity: Each modality has exactly one result type', () => {
    fc.assert(
      fc.property(
        nonBufferTrialArb,
        fc.boolean(),
        activeModalitiesArb,
        (trial, allPressed, modalities) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(modalities);
          const response = createResponse(
            trial.index,
            modalities.map((m) => ({ modalityId: m, pressed: allPressed })),
          );

          const verdict = judge.evaluate(trial, response, ctx);

          for (const modalityId of modalities) {
            const mv = verdict.byModality.get(modalityId);
            expect(mv).toBeDefined();
            // @ts-expect-error test override
            expect(['hit', 'miss', 'false-alarm', 'correct-rejection']).toContain(mv?.result);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('2.5 Completeness: All active modalities get a verdict', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, activeModalitiesArb, (trial, modalities) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(modalities);
        const response = createResponse(
          trial.index,
          modalities.map((m) => ({ modalityId: m, pressed: false })),
        );

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.size).toBe(modalities.length);
        for (const modalityId of modalities) {
          expect(verdict.byModality.has(modalityId)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('2.6 Overall result priority: miss > false-alarm > hit > correct-rejection', () => {
    fc.assert(
      fc.property(
        fc.record({
          posResult: fc.constantFrom(
            'hit',
            'miss',
            'false-alarm',
            'correct-rejection',
          ) as fc.Arbitrary<TrialResultType>,
          audioResult: fc.constantFrom(
            'hit',
            'miss',
            'false-alarm',
            'correct-rejection',
          ) as fc.Arbitrary<TrialResultType>,
        }),
        ({ posResult, audioResult }) => {
          // Determine expected overall based on priority
          let expectedOverall: TrialResultType;
          if (posResult === 'miss' || audioResult === 'miss') {
            expectedOverall = 'miss';
          } else if (posResult === 'false-alarm' || audioResult === 'false-alarm') {
            expectedOverall = 'false-alarm';
          } else if (posResult === 'hit' || audioResult === 'hit') {
            expectedOverall = 'hit';
          } else {
            expectedOverall = 'correct-rejection';
          }

          // Create trial and response to produce these results
          const posTarget = posResult === 'hit' || posResult === 'miss';
          const posPressed = posResult === 'hit' || posResult === 'false-alarm';
          const audioTarget = audioResult === 'hit' || audioResult === 'miss';
          const audioPressed = audioResult === 'hit' || audioResult === 'false-alarm';

          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: deriveTrialType(posTarget, audioTarget),
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

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: audioPressed },
          ]);

          const verdict = judge.evaluate(trial, response, ctx);

          expect(verdict.overall).toBe(expectedOverall);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('2.7 Record and retrieve: Recorded verdicts retrievable', () => {
    fc.assert(
      fc.property(fc.array(nonBufferTrialArb, { minLength: 1, maxLength: 10 }), (trials) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const verdicts: TrialVerdict[] = [];

        for (const trial of trials) {
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: false },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
          verdicts.push(verdict);
        }

        const retrieved = judge.getVerdicts();
        expect(retrieved.length).toBe(verdicts.length);
        for (let i = 0; i < verdicts.length; i++) {
          expect(retrieved[i]!.trialIndex).toBe(verdicts[i]!.trialIndex);
          expect(retrieved[i]!.overall).toBe(verdicts[i]!.overall);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('2.8 Reset clears all verdicts', () => {
    fc.assert(
      fc.property(fc.array(nonBufferTrialArb, { minLength: 1, maxLength: 10 }), (trials) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (const trial of trials) {
          const response = createResponse(trial.index, [
            { modalityId: 'position', pressed: false },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
        }

        expect(judge.getVerdicts().length).toBe(trials.length);

        judge.reset();

        expect(judge.getVerdicts().length).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  it('2.9 Summary counts match recorded verdicts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            isTarget: fc.boolean(),
            pressed: fc.boolean(),
          }),
          { minLength: 5, maxLength: 20 },
        ),
        (trialConfigs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          let expectedHits = 0;
          let expectedMisses = 0;
          let expectedFA = 0;
          let expectedCR = 0;

          for (let i = 0; i < trialConfigs.length; i++) {
            // @ts-expect-error test override
            const { isTarget, pressed } = trialConfigs[i];
            const trial: Trial = {
              index: i,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: isTarget ? 'V-Seul' : 'Non-Cible',
              isPositionTarget: isTarget,
              isSoundTarget: false,
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

            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            const verdict = judge.evaluate(trial, response, ctx);
            judge.record(verdict);

            if (isTarget && pressed) expectedHits++;
            else if (isTarget && !pressed) expectedMisses++;
            else if (!isTarget && pressed) expectedFA++;
            else expectedCR++;
          }

          const summary = judge.summarize(ctx);
          const posStats = summary.byModality.get('position');

          expect(posStats?.counts.hits).toBe(expectedHits);
          expect(posStats?.counts.misses).toBe(expectedMisses);
          expect(posStats?.counts.falseAlarms).toBe(expectedFA);
          expect(posStats?.counts.correctRejections).toBe(expectedCR);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('2.10 Judgment independent of trial index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.boolean(),
        fc.boolean(),
        (index1, index2, isTarget, pressed) => {
          const makeTrial = (index: number): Trial => ({
            index,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: isTarget ? 'V-Seul' : 'Non-Cible',
            isPositionTarget: isTarget,
            isSoundTarget: false,
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
          });

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          const trial1 = makeTrial(index1);
          const trial2 = makeTrial(index2);

          const response1 = createResponse(index1, [{ modalityId: 'position', pressed }]);
          const response2 = createResponse(index2, [{ modalityId: 'position', pressed }]);

          const verdict1 = judge.evaluate(trial1, response1, ctx);
          const verdict2 = judge.evaluate(trial2, response2, ctx);

          // Same isTarget + same pressed = same result
          expect(verdict1.byModality.get('position')?.result).toBe(
            verdict2.byModality.get('position')?.result,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 3. EDGE CASES (10 tests)
// =============================================================================

describe('Edge Cases Properties', () => {
  it('3.1 Buffer trials: Judge still evaluates buffer trials (no special handling)', () => {
    fc.assert(
      fc.property(bufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);

        // Should not throw
        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict).toBeDefined();
        expect(verdict.byModality.get('position')).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('3.2 Empty modalities: Context with single modality works', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, modalityIdArb, fc.boolean(), (trial, modalityId, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext([modalityId]);
        const response = createResponse(trial.index, [{ modalityId, pressed }]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.size).toBe(1);
        expect(verdict.byModality.has(modalityId)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('3.3 Multiple modalities: All 4 modalities can be evaluated together', () => {
    fc.assert(
      fc.property(
        nonBufferTrialArb,
        fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
        (trial, pressed) => {
          const judge = new SDTJudge();
          const modalities: ModalityId[] = ['position', 'audio', 'color', 'image'];
          const ctx = createBasicContext(modalities);
          const response = createResponse(
            trial.index,
            // @ts-expect-error test override
            modalities.map((m, i) => ({ modalityId: m, pressed: pressed[i] })),
          );

          const verdict = judge.evaluate(trial, response, ctx);

          expect(verdict.byModality.size).toBe(4);
          for (const m of modalities) {
            expect(verdict.byModality.has(m)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('3.4 Reaction time edge: Zero reaction time handled', () => {
    const trial = {
      index: 0,
      isBuffer: false,
      position: 0 as Position,
      sound: 'C' as Sound,
      color: 'ink-black' as Color,
      image: 'circle' as ImageShape,
      trialType: 'V-Seul' as const,
      isPositionTarget: true,
      isSoundTarget: false,
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

    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(trial.index, [
      { modalityId: 'position', pressed: true, reactionTimeMs: 0 },
    ]);

    const verdict = judge.evaluate(trial, response, ctx);

    expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(0);
    expect(verdict.minReactionTimeMs).toBe(0);
  });

  it('3.5 Reaction time edge: Very large reaction time handled', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 100000 }), (rt) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0 as Position,
          sound: 'C' as Sound,
          color: 'ink-black' as Color,
          image: 'circle' as ImageShape,
          trialType: 'V-Seul',
          isPositionTarget: true,
          isSoundTarget: false,
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

        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('3.6 Min reaction time: Tracks minimum across modalities', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        const trial: Trial = {
          index: 0,
          isBuffer: false,
          position: 0 as Position,
          sound: 'C' as Sound,
          color: 'ink-black' as Color,
          image: 'circle' as ImageShape,
          trialType: 'Dual',
          isPositionTarget: true,
          isSoundTarget: true,
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

        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
          { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
        ]);

        const verdict = judge.evaluate(trial, response, ctx);

        expect(verdict.minReactionTimeMs).toBe(Math.min(rt1, rt2));
      }),
      { numRuns: 100 },
    );
  });

  it('3.7 Missing response in map: No response treated as not pressed', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        // Only provide position response, audio missing from map
        const response: TrialResponse = {
          trialIndex: trial.index,
          responses: new Map([['position', { modalityId: 'position', pressed: true }]]),
          timestamp: new Date(),
        };

        const verdict = judge.evaluate(trial, response, ctx);

        // Position has response, audio does not (treated as not pressed)
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
        expect(verdict.byModality.get('audio')?.hadResponse).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('3.8 BrainWorkshop score: 0 when no hits', () => {
    const judge = new BrainWorkshopJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 0.8,
      strategy: 'brainworkshop',
    };

    // All misses
    for (let i = 0; i < 10; i++) {
      const trial: Trial = {
        index: i,
        isBuffer: false,
        position: 0 as Position,
        sound: 'C' as Sound,
        color: 'ink-black' as Color,
        image: 'circle' as ImageShape,
        trialType: 'V-Seul',
        isPositionTarget: true,
        isSoundTarget: false,
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

      const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
      const verdict = judge.evaluate(trial, response, ctx);
      judge.record(verdict);
    }

    const summary = judge.summarize(ctx);

    // BW score = hits / (hits + misses + FA) = 0 / (0 + 10 + 0) = 0
    expect(summary.score).toBe(0);
    expect(summary.passed).toBe(false);
  });

  it('3.9 SDT d-prime: Returns 0 for degenerate cases', () => {
    fc.assert(
      fc.property(fc.constantFrom('all-cr', 'all-hits-no-noise', 'all-fa'), (scenario) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        // Generate degenerate scenario
        for (let i = 0; i < 10; i++) {
          let isTarget: boolean;
          let pressed: boolean;

          switch (scenario) {
            case 'all-cr':
              isTarget = false;
              pressed = false;
              break;
            case 'all-hits-no-noise':
              isTarget = true;
              pressed = true;
              break;
            case 'all-fa':
              isTarget = false;
              pressed = true;
              break;
          }

          const trial: Trial = {
            index: i,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: isTarget ? 'V-Seul' : 'Non-Cible',
            isPositionTarget: isTarget,
            isSoundTarget: false,
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

          const response = createResponse(i, [{ modalityId: 'position', pressed }]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
        }

        const summary = judge.summarize(ctx);

        // d' should be 0 for degenerate cases (no signal trials, no noise trials, or no CR)
        expect(summary.aggregateDPrime).toBe(0);
      }),
      { numRuns: 10 },
    );
  });

  it('3.10 Feedback actions: Generated based on overall result', () => {
    fc.assert(
      fc.property(
        fc.record({
          isTarget: fc.boolean(),
          pressed: fc.boolean(),
        }),
        ({ isTarget, pressed }) => {
          const trial: Trial = {
            index: 0,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: isTarget ? 'V-Seul' : 'Non-Cible',
            isPositionTarget: isTarget,
            isSoundTarget: false,
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

          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);

          const verdict = judge.evaluate(trial, response, ctx);

          // Feedback should match result type based on DEFAULT_SDT_FEEDBACK
          if (verdict.overall === 'hit') {
            expect(verdict.feedbackActions.length).toBeGreaterThan(0);
            // @ts-expect-error test: nullable access
            expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
          } else if (verdict.overall === 'false-alarm') {
            expect(verdict.feedbackActions.length).toBeGreaterThan(0);
            // @ts-expect-error test: nullable access
            expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
          } else {
            // miss and correct-rejection have no feedback by default
            expect(verdict.feedbackActions.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// ADDITIONAL PROPERTY TESTS
// =============================================================================

describe('Summary and Scoring Properties', () => {
  it('Hit rate is in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ isTarget: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 50,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { isTarget, pressed } = configs[i];
            const trial: Trial = {
              index: i,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: isTarget ? 'V-Seul' : 'Non-Cible',
              isPositionTarget: isTarget,
              isSoundTarget: false,
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

            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            const verdict = judge.evaluate(trial, response, ctx);
            judge.record(verdict);
          }

          const summary = judge.summarize(ctx);
          const posStats = summary.byModality.get('position');

          if (posStats) {
            expect(posStats.hitRate).toBeGreaterThanOrEqual(0);
            expect(posStats.hitRate).toBeLessThanOrEqual(1);
            expect(posStats.falseAlarmRate).toBeGreaterThanOrEqual(0);
            expect(posStats.falseAlarmRate).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('Total counts equal number of recorded verdicts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < n; i++) {
          const trial: Trial = {
            index: i,
            isBuffer: false,
            position: 0 as Position,
            sound: 'C' as Sound,
            color: 'ink-black' as Color,
            image: 'circle' as ImageShape,
            trialType: 'Non-Cible',
            isPositionTarget: false,
            isSoundTarget: false,
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

          const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
        }

        const summary = judge.summarize(ctx);
        const posStats = summary.byModality.get('position');

        expect(posStats?.counts.total).toBe(n);
        expect(summary.verdicts.length).toBe(n);
      }),
      { numRuns: 50 },
    );
  });

  it('Dualnback-classic: Pass based on error count per modality', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        (errors, passThreshold) => {
          const judge = new SDTJudge();
          const ctx: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold,
            strategy: 'dualnback-classic',
          };

          // Create trials with exactly `errors` misses
          const totalTrials = 20;
          for (let i = 0; i < totalTrials; i++) {
            const isTarget = i < 10;
            const shouldMiss = isTarget && i < errors;

            const trial: Trial = {
              index: i,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: isTarget ? 'V-Seul' : 'Non-Cible',
              isPositionTarget: isTarget,
              isSoundTarget: false,
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

            const response = createResponse(i, [
              { modalityId: 'position', pressed: isTarget && !shouldMiss },
            ]);
            const verdict = judge.evaluate(trial, response, ctx);
            judge.record(verdict);
          }

          const summary = judge.summarize(ctx);

          // Dualnback-classic: passed = errors < passThreshold for all modalities
          // Jaeggi 2008: "fewer than X errors" means < X
          const expectedPassed = errors < passThreshold;
          expect(summary.passed).toBe(expectedPassed);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('BrainWorkshop score formula: hits / (hits + misses + FA)', () => {
    fc.assert(
      fc.property(
        fc.record({
          hits: fc.integer({ min: 0, max: 10 }),
          misses: fc.integer({ min: 0, max: 10 }),
          falseAlarms: fc.integer({ min: 0, max: 10 }),
          correctRejections: fc.integer({ min: 0, max: 10 }),
        }),
        ({ hits, misses, falseAlarms, correctRejections }) => {
          const judge = new BrainWorkshopJudge();
          const ctx: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold: 0.8,
            strategy: 'brainworkshop',
          };

          let trialIndex = 0;

          // Generate hits
          for (let i = 0; i < hits; i++) {
            const trial: Trial = {
              index: trialIndex++,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'V-Seul',
              isPositionTarget: true,
              isSoundTarget: false,
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
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: true },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          // Generate misses
          for (let i = 0; i < misses; i++) {
            const trial: Trial = {
              index: trialIndex++,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'V-Seul',
              isPositionTarget: true,
              isSoundTarget: false,
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
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: false },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          // Generate false alarms
          for (let i = 0; i < falseAlarms; i++) {
            const trial: Trial = {
              index: trialIndex++,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'Non-Cible',
              isPositionTarget: false,
              isSoundTarget: false,
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
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: true },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          // Generate correct rejections
          for (let i = 0; i < correctRejections; i++) {
            const trial: Trial = {
              index: trialIndex++,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'Non-Cible',
              isPositionTarget: false,
              isSoundTarget: false,
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
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: false },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);

          const denominator = hits + misses + falseAlarms;
          const expectedScore = denominator === 0 ? 0 : hits / denominator;

          expect(summary.score).toBeCloseTo(expectedScore, 5);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('N-level recommendation: up when passed, down when below downThreshold', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (achievedDPrime, passThreshold, downThreshold) => {
          // Skip invalid configurations
          if (downThreshold >= passThreshold) return;

          const judge = new SDTJudge();
          const ctx: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold,
            downThreshold,
            strategy: 'sdt',
          };

          // Create trials that will produce a specific d' (approximate)
          // Use perfect performance (high d') or poor performance (low d')
          const totalSignal = 10;
          const totalNoise = 10;

          // Calculate how many hits/FA we need for approximate d'
          // This is a simplified approach - actual d' depends on log-linear correction
          const hitRate = Math.max(0.1, Math.min(0.9, achievedDPrime > 2 ? 0.9 : 0.5));
          const faRate = Math.max(0.1, Math.min(0.9, achievedDPrime > 2 ? 0.1 : 0.5));

          const hits = Math.round(hitRate * totalSignal);
          const fa = Math.round(faRate * totalNoise);

          for (let i = 0; i < totalSignal; i++) {
            const trial: Trial = {
              index: i,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'V-Seul',
              isPositionTarget: true,
              isSoundTarget: false,
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
            const response = createResponse(i, [{ modalityId: 'position', pressed: i < hits }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          for (let i = 0; i < totalNoise; i++) {
            const trial: Trial = {
              index: totalSignal + i,
              isBuffer: false,
              position: 0 as Position,
              sound: 'C' as Sound,
              color: 'ink-black' as Color,
              image: 'circle' as ImageShape,
              trialType: 'Non-Cible',
              isPositionTarget: false,
              isSoundTarget: false,
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
            const response = createResponse(totalSignal + i, [
              { modalityId: 'position', pressed: i < fa },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);

          // Verify recommendation follows the rules
          if (summary.passed) {
            expect(summary.nLevelRecommendation).toBe('up');
          } else if (summary.aggregateDPrime < downThreshold) {
            expect(summary.nLevelRecommendation).toBe('down');
          } else {
            expect(summary.nLevelRecommendation).toBe('maintain');
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
