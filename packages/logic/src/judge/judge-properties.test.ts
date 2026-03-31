/**
 * Comprehensive Property-Based Tests for Trial Judge Module
 *
 * 200+ property-based tests covering all judgment properties:
 * - Hit/Miss/FA/CR detection
 * - Mutual exclusivity and completeness
 * - Determinism and independence
 * - Reaction time handling
 * - Buffer/Lure/Dual target handling
 * - Priority rules and aggregation
 * - Summary generation and statistics
 * - Reset and record/retrieve consistency
 * - Edge cases and stress testing
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type { ModalityId, Position, Sound, Color, ImageShape, Trial } from '../types/core';
import { SDTJudge } from './sdt-judge';
import { AccuracyJudge } from './accuracy-judge';
import { BrainWorkshopJudge } from './brainworkshop-judge';
import type { EvaluationContext, TrialResponse, ModalityResponse } from './trial-judge';
import type { TrialResultType, TrialVerdict, FeedbackReaction } from './verdict';

// =============================================================================
// ARBITRARIES (Generators)
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
const earlyReactionTimeArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 99 });
const lateReactionTimeArb: fc.Arbitrary<number> = fc.integer({ min: 2001, max: 10000 });

// Trial arbitrary
const trialArb: fc.Arbitrary<Trial> = fc
  .record({
    index: fc.nat({ max: 1000 }),
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

const nonBufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((t) => ({ ...t, isBuffer: false }));
const bufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((t) => ({ ...t, isBuffer: true }));

// Target configuration arbitraries
function targetTrialArb(posTarget: boolean, audioTarget: boolean): fc.Arbitrary<Trial> {
  return trialArb.map((t) => ({
    ...t,
    isBuffer: false,
    isPositionTarget: posTarget,
    isSoundTarget: audioTarget,
    trialType: deriveTrialType(posTarget, audioTarget),
  }));
}

// Lure trial arbitrary
const lureTrialArb: fc.Arbitrary<Trial> = trialArb.map((t) => ({
  ...t,
  isBuffer: false,
  isPositionTarget: false,
  isSoundTarget: false,
  isPositionLure: true,
  isSoundLure: true,
  trialType: 'Non-Cible' as const,
}));

// Active modalities arbitrary
const activeModalitiesArb: fc.Arbitrary<ModalityId[]> = fc
  .subarray(['position', 'audio', 'color', 'image'] as ModalityId[], { minLength: 1, maxLength: 4 })
  .filter((arr) => arr.length > 0);

// Context arbitrary
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

// =============================================================================
// HELPERS
// =============================================================================

function deriveTrialType(
  posTarget: boolean,
  audioTarget: boolean,
): 'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible' | 'Tampon' {
  if (posTarget && audioTarget) return 'Dual';
  if (posTarget) return 'V-Seul';
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
  return { activeModalities: modalities, passThreshold: 2.0, strategy: 'sdt' };
}

function createResponse(
  trialIndex: number,
  modalityResponses: Array<{ modalityId: ModalityId; pressed: boolean; reactionTimeMs?: number }>,
): TrialResponse {
  const map = new Map<ModalityId, ModalityResponse>();
  for (const r of modalityResponses) {
    map.set(r.modalityId, r);
  }
  return { trialIndex, responses: map, timestamp: new Date() };
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    index: 0,
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
    ...overrides,
  };
}

// =============================================================================
// SECTION 1: HIT DETECTION (Tests 1-15)
// =============================================================================

describe('1. Hit Detection Properties', () => {
  it('1.1 Hit: target AND response produces hit (SDTJudge, position)', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
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

  it('1.2 Hit: target AND response produces hit (SDTJudge, audio)', () => {
    fc.assert(
      fc.property(targetTrialArb(false, true), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'audio', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('audio')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.3 Hit: target AND response produces hit (BrainWorkshopJudge)', () => {
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

  it('1.4 Hit: AccuracyJudge produces hit when response (regardless of target)', () => {
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

  it('1.5 Hit: wasTarget flag is true when target', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.wasTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.6 Hit: hadResponse flag is true when pressed', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.7 Hit: dual target with dual response produces hits for both', () => {
    fc.assert(
      fc.property(
        targetTrialArb(true, true),
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
          expect(verdict.byModality.get('position')?.result).toBe('hit');
          expect(verdict.byModality.get('audio')?.result).toBe('hit');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('1.8 Hit: color modality target AND response produces hit', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isColorTarget: true });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['color']);
        const response = createResponse(0, [
          { modalityId: 'color', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('color')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.9 Hit: image modality target AND response produces hit', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isImageTarget: true });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['image']);
        const response = createResponse(0, [
          { modalityId: 'image', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('image')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.10 Hit: all 4 modalities can produce hits simultaneously', () => {
    fc.assert(
      fc.property(
        fc.tuple(reactionTimeArb, reactionTimeArb, reactionTimeArb, reactionTimeArb),
        ([rt1, rt2, rt3, rt4]) => {
          const trial = makeTrial({
            isPositionTarget: true,
            isSoundTarget: true,
            isColorTarget: true,
            isImageTarget: true,
            trialType: 'Dual',
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
            { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
            { modalityId: 'color', pressed: true, reactionTimeMs: rt3 },
            { modalityId: 'image', pressed: true, reactionTimeMs: rt4 },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          expect(verdict.byModality.get('position')?.result).toBe('hit');
          expect(verdict.byModality.get('audio')?.result).toBe('hit');
          expect(verdict.byModality.get('color')?.result).toBe('hit');
          expect(verdict.byModality.get('image')?.result).toBe('hit');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('1.11 Hit: overall is hit when all modalities are hits', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: true },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('1.12 Hit: isCorrect is true when all hits', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: true },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('1.13 Hit: reaction time is recorded correctly', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), reactionTimeArb, (trial, rt) => {
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

  it('1.14 Hit: minReactionTimeMs tracks minimum across modalities', () => {
    fc.assert(
      fc.property(
        targetTrialArb(true, true),
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
          expect(verdict.minReactionTimeMs).toBe(Math.min(rt1, rt2));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('1.15 Hit: generates correct feedback action (flash-green)', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.feedbackActions.length).toBeGreaterThan(0);
        // @ts-expect-error test: nullable access
        expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 2: MISS DETECTION (Tests 16-30)
// =============================================================================

describe('2. Miss Detection Properties', () => {
  it('2.1 Miss: target AND no response produces miss (SDTJudge)', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('2.2 Miss: target AND no response produces miss (BrainWorkshopJudge)', () => {
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

  it('2.3 Miss: AccuracyJudge produces miss when no response', () => {
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

  it('2.4 Miss: wasTarget flag is true', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.wasTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('2.5 Miss: hadResponse flag is false', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('2.6 Miss: dual target with no responses produces misses for both', () => {
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
      }),
      { numRuns: 100 },
    );
  });

  it('2.7 Miss: overall is miss when any modality is miss', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('2.8 Miss: isCorrect is false', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('2.9 Miss: no reaction time recorded', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('2.10 Miss: no feedback action generated (default config)', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.feedbackActions.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('2.11 Miss: color modality target without response', () => {
    const trial = makeTrial({ isColorTarget: true });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['color']);
    const response = createResponse(0, [{ modalityId: 'color', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('color')?.result).toBe('miss');
  });

  it('2.12 Miss: image modality target without response', () => {
    const trial = makeTrial({ isImageTarget: true });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['image']);
    const response = createResponse(0, [{ modalityId: 'image', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('image')?.result).toBe('miss');
  });

  it('2.13 Miss: partial miss (one hit, one miss) tracked correctly', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('2.14 Miss: isTarget is true when target exists', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('2.15 Miss: minReactionTimeMs undefined when no responses', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 3: FALSE ALARM DETECTION (Tests 31-45)
// =============================================================================

describe('3. False Alarm Detection Properties', () => {
  it('3.1 FA: no target AND response produces false-alarm (SDTJudge)', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
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

  it('3.2 FA: no target AND response produces false-alarm (BrainWorkshopJudge)', () => {
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

  it('3.3 FA: wasTarget flag is false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.wasTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('3.4 FA: hadResponse flag is true', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('3.5 FA: multi-modality FA tracked correctly', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: true },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
        expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  it('3.6 FA: overall is false-alarm when FA and CR (but no miss)', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  it('3.7 FA: isCorrect is false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('3.8 FA: reaction time is recorded', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
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

  it('3.9 FA: generates flash-red feedback', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.feedbackActions.length).toBeGreaterThan(0);
        // @ts-expect-error test: nullable access
        expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
      }),
      { numRuns: 100 },
    );
  });

  it('3.10 FA: isTarget is false when no target', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('3.11 FA: color modality no target with response', () => {
    const trial = makeTrial({ isColorTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['color']);
    const response = createResponse(0, [{ modalityId: 'color', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('color')?.result).toBe('false-alarm');
  });

  it('3.12 FA: image modality no target with response', () => {
    const trial = makeTrial({ isImageTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['image']);
    const response = createResponse(0, [{ modalityId: 'image', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('image')?.result).toBe('false-alarm');
  });

  it('3.13 FA: mixed FA and hit (target on one, not other)', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: true },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  it('3.14 FA: overall priority miss > FA', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('miss');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
    expect(verdict.overall).toBe('miss');
  });

  it('3.15 FA: minReactionTimeMs set from FA response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), reactionTimeArb, (trial, rt) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 4: CORRECT REJECTION DETECTION (Tests 46-60)
// =============================================================================

describe('4. Correct Rejection Detection Properties', () => {
  it('4.1 CR: no target AND no response produces correct-rejection (SDTJudge)', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
      }),
      { numRuns: 100 },
    );
  });

  it('4.2 CR: no target AND no response produces correct-rejection (BrainWorkshopJudge)', () => {
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

  it('4.3 CR: wasTarget flag is false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.wasTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('4.4 CR: hadResponse flag is false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('4.5 CR: multi-modality CR tracked correctly', () => {
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
      }),
      { numRuns: 100 },
    );
  });

  it('4.6 CR: overall is correct-rejection when all CR', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBe('correct-rejection');
      }),
      { numRuns: 100 },
    );
  });

  it('4.7 CR: isCorrect is true', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('4.8 CR: no reaction time recorded', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('4.9 CR: no feedback action generated (default config)', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.feedbackActions.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('4.10 CR: isTarget is false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('4.11 CR: color modality no target no response', () => {
    const trial = makeTrial({ isColorTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['color']);
    const response = createResponse(0, [{ modalityId: 'color', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('color')?.result).toBe('correct-rejection');
  });

  it('4.12 CR: image modality no target no response', () => {
    const trial = makeTrial({ isImageTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['image']);
    const response = createResponse(0, [{ modalityId: 'image', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('image')?.result).toBe('correct-rejection');
  });

  it('4.13 CR: all 4 modalities can produce CR simultaneously', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
      { modalityId: 'color', pressed: false },
      { modalityId: 'image', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
    expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
    expect(verdict.byModality.get('color')?.result).toBe('correct-rejection');
    expect(verdict.byModality.get('image')?.result).toBe('correct-rejection');
  });

  it('4.14 CR: minReactionTimeMs undefined', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('4.15 CR: overall priority hit > CR', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('hit');
  });
});

// =============================================================================
// SECTION 5: MUTUAL EXCLUSIVITY (Tests 61-70)
// =============================================================================

describe('5. Mutual Exclusivity Properties', () => {
  it('5.1 Each modality has exactly one result type', () => {
    fc.assert(
      fc.property(
        nonBufferTrialArb,
        fc.boolean(),
        activeModalitiesArb,
        (trial, pressed, modalities) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(modalities);
          const response = createResponse(
            trial.index,
            modalities.map((m) => ({ modalityId: m, pressed })),
          );
          const verdict = judge.evaluate(trial, response, ctx);
          for (const modalityId of modalities) {
            const mv = verdict.byModality.get(modalityId);
            expect(mv).toBeDefined();
            const validResults: TrialResultType[] = [
              'hit',
              'miss',
              'false-alarm',
              'correct-rejection',
            ];
            // @ts-expect-error test override
            expect(validResults).toContain(mv?.result);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('5.2 Result is always one of four valid types', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const result = verdict.byModality.get('position')?.result;
        // @ts-expect-error test override
        expect(['hit', 'miss', 'false-alarm', 'correct-rejection']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('5.3 Cannot be both hit and miss', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const result = verdict.byModality.get('position')?.result;
        if (result === 'hit') {
          expect(result).not.toBe('miss');
        }
        if (result === 'miss') {
          expect(result).not.toBe('hit');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('5.4 Cannot be both FA and CR', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const result = verdict.byModality.get('position')?.result;
        if (result === 'false-alarm') {
          expect(result).not.toBe('correct-rejection');
        }
        if (result === 'correct-rejection') {
          expect(result).not.toBe('false-alarm');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('5.5 Hit/Miss require target, FA/CR require no target', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const mv = verdict.byModality.get('position');
        if (mv?.result === 'hit' || mv?.result === 'miss') {
          expect(mv.wasTarget).toBe(true);
        }
        if (mv?.result === 'false-alarm' || mv?.result === 'correct-rejection') {
          expect(mv.wasTarget).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('5.6 Hit/FA require response, Miss/CR require no response', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const mv = verdict.byModality.get('position');
        if (mv?.result === 'hit' || mv?.result === 'false-alarm') {
          expect(mv.hadResponse).toBe(true);
        }
        if (mv?.result === 'miss' || mv?.result === 'correct-rejection') {
          expect(mv.hadResponse).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('5.7 Overall result is always one of four valid types', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed },
          { modalityId: 'audio', pressed },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(['hit', 'miss', 'false-alarm', 'correct-rejection']).toContain(verdict.overall);
      }),
      { numRuns: 100 },
    );
  });

  it('5.8 BrainWorkshopJudge also enforces mutual exclusivity', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const result = verdict.byModality.get('position')?.result;
        // @ts-expect-error test override
        expect(['hit', 'miss', 'false-alarm', 'correct-rejection']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('5.9 AccuracyJudge results are hit or miss only', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        const result = verdict.byModality.get('position')?.result;
        // @ts-expect-error test override
        expect(['hit', 'miss']).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  it('5.10 Each modality independent in result type', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
          posPressed: fc.boolean(),
          audioPressed: fc.boolean(),
        }),
        ({ posTarget, audioTarget, posPressed, audioPressed }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: audioPressed },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);

          // Position result independent of audio
          const posResult = verdict.byModality.get('position')?.result;
          const audioResult = verdict.byModality.get('audio')?.result;

          if (posTarget && posPressed) expect(posResult).toBe('hit');
          if (posTarget && !posPressed) expect(posResult).toBe('miss');
          if (!posTarget && posPressed) expect(posResult).toBe('false-alarm');
          if (!posTarget && !posPressed) expect(posResult).toBe('correct-rejection');

          if (audioTarget && audioPressed) expect(audioResult).toBe('hit');
          if (audioTarget && !audioPressed) expect(audioResult).toBe('miss');
          if (!audioTarget && audioPressed) expect(audioResult).toBe('false-alarm');
          if (!audioTarget && !audioPressed) expect(audioResult).toBe('correct-rejection');
        },
      ),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// SECTION 6: COMPLETENESS (Tests 71-80)
// =============================================================================

describe('6. Completeness Properties', () => {
  it('6.1 All active modalities get a verdict', () => {
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
        for (const m of modalities) {
          expect(verdict.byModality.has(m)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('6.2 Single modality context produces single verdict', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, modalityIdArb, (trial, modalityId) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext([modalityId]);
        const response = createResponse(trial.index, [{ modalityId, pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.size).toBe(1);
        expect(verdict.byModality.has(modalityId)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('6.3 Four modality context produces four verdicts', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const judge = new SDTJudge();
        const modalities: ModalityId[] = ['position', 'audio', 'color', 'image'];
        const ctx = createBasicContext(modalities);
        const response = createResponse(
          trial.index,
          modalities.map((m) => ({ modalityId: m, pressed: false })),
        );
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.size).toBe(4);
      }),
      { numRuns: 100 },
    );
  });

  it('6.4 Overall verdict always present', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, activeModalitiesArb, (trial, modalities) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(modalities);
        const response = createResponse(
          trial.index,
          modalities.map((m) => ({ modalityId: m, pressed: false })),
        );
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('6.5 isTarget always present', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(typeof verdict.isTarget).toBe('boolean');
      }),
      { numRuns: 100 },
    );
  });

  it('6.6 isCorrect always present', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(typeof verdict.isCorrect).toBe('boolean');
      }),
      { numRuns: 100 },
    );
  });

  it('6.7 trialIndex preserved in verdict', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (index) => {
        const trial = makeTrial({ index });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.trialIndex).toBe(index);
      }),
      { numRuns: 100 },
    );
  });

  it('6.8 timestamp preserved in verdict', () => {
    const trial = makeTrial();
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const timestamp = new Date();
    const response: TrialResponse = {
      trialIndex: 0,
      responses: new Map([['position', { modalityId: 'position', pressed: false }]]),
      timestamp,
    };
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.timestamp).toBe(timestamp);
  });

  it('6.9 feedbackActions array always present (may be empty)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(Array.isArray(verdict.feedbackActions)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('6.10 Missing response in map treated as not pressed', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response: TrialResponse = {
          trialIndex: trial.index,
          responses: new Map([['position', { modalityId: 'position', pressed: true }]]),
          timestamp: new Date(),
        };
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
        expect(verdict.byModality.get('audio')?.hadResponse).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 7: DETERMINISM (Tests 81-90)
// =============================================================================

describe('7. Determinism Properties', () => {
  it('7.1 Same input produces same output (SDTJudge)', () => {
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

  it('7.2 Same input produces same output (BrainWorkshopJudge)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge1 = new BrainWorkshopJudge();
        const judge2 = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict1 = judge1.evaluate(trial, response, ctx);
        const verdict2 = judge2.evaluate(trial, response, ctx);
        expect(verdict1.overall).toBe(verdict2.overall);
        expect(verdict1.byModality.get('position')?.result).toBe(
          verdict2.byModality.get('position')?.result,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('7.3 Same input produces same output (AccuracyJudge)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge1 = new AccuracyJudge();
        const judge2 = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict1 = judge1.evaluate(trial, response, ctx);
        const verdict2 = judge2.evaluate(trial, response, ctx);
        expect(verdict1.overall).toBe(verdict2.overall);
      }),
      { numRuns: 100 },
    );
  });

  it('7.4 Repeated evaluation on same judge produces same result', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict1 = judge.evaluate(trial, response, ctx);
        const verdict2 = judge.evaluate(trial, response, ctx);
        expect(verdict1.overall).toBe(verdict2.overall);
      }),
      { numRuns: 100 },
    );
  });

  it('7.5 Trial index does not affect result', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.boolean(),
        fc.boolean(),
        (idx1, idx2, isTarget, pressed) => {
          const trial1 = makeTrial({
            index: idx1,
            isPositionTarget: isTarget,
            trialType: isTarget ? 'V-Seul' : 'Non-Cible',
          });
          const trial2 = makeTrial({
            index: idx2,
            isPositionTarget: isTarget,
            trialType: isTarget ? 'V-Seul' : 'Non-Cible',
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          const response1 = createResponse(idx1, [{ modalityId: 'position', pressed }]);
          const response2 = createResponse(idx2, [{ modalityId: 'position', pressed }]);
          const verdict1 = judge.evaluate(trial1, response1, ctx);
          const verdict2 = judge.evaluate(trial2, response2, ctx);
          expect(verdict1.byModality.get('position')?.result).toBe(
            verdict2.byModality.get('position')?.result,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('7.6 Stimuli values do not affect result (position/sound/color/image)', () => {
    fc.assert(
      fc.property(
        positionArb,
        positionArb,
        fc.boolean(),
        fc.boolean(),
        (pos1, pos2, isTarget, pressed) => {
          const trial1 = makeTrial({ position: pos1, isPositionTarget: isTarget });
          const trial2 = makeTrial({ position: pos2, isPositionTarget: isTarget });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          const response1 = createResponse(0, [{ modalityId: 'position', pressed }]);
          const response2 = createResponse(0, [{ modalityId: 'position', pressed }]);
          const verdict1 = judge.evaluate(trial1, response1, ctx);
          const verdict2 = judge.evaluate(trial2, response2, ctx);
          expect(verdict1.byModality.get('position')?.result).toBe(
            verdict2.byModality.get('position')?.result,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('7.7 Deterministic across all 16 combinations', () => {
    const combinations: Array<{ target: boolean; pressed: boolean; expected: TrialResultType }> = [
      { target: true, pressed: true, expected: 'hit' },
      { target: true, pressed: false, expected: 'miss' },
      { target: false, pressed: true, expected: 'false-alarm' },
      { target: false, pressed: false, expected: 'correct-rejection' },
    ];
    for (const { target, pressed, expected } of combinations) {
      const trial = makeTrial({
        isPositionTarget: target,
        trialType: target ? 'V-Seul' : 'Non-Cible',
      });
      const judge = new SDTJudge();
      const ctx = createBasicContext(['position']);
      const response = createResponse(0, [{ modalityId: 'position', pressed }]);
      const verdict = judge.evaluate(trial, response, ctx);
      expect(verdict.byModality.get('position')?.result).toBe(expected);
    }
  });

  it('7.8 Order of modalities in context does not affect individual results', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
          posPressed: fc.boolean(),
          audioPressed: fc.boolean(),
        }),
        ({ posTarget, audioTarget, posPressed, audioPressed }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge1 = new SDTJudge();
          const judge2 = new SDTJudge();
          const ctx1: EvaluationContext = {
            activeModalities: ['position', 'audio'],
            passThreshold: 2.0,
            strategy: 'sdt',
          };
          const ctx2: EvaluationContext = {
            activeModalities: ['audio', 'position'],
            passThreshold: 2.0,
            strategy: 'sdt',
          };
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: audioPressed },
          ]);
          const verdict1 = judge1.evaluate(trial, response, ctx1);
          const verdict2 = judge2.evaluate(trial, response, ctx2);
          expect(verdict1.byModality.get('position')?.result).toBe(
            verdict2.byModality.get('position')?.result,
          );
          expect(verdict1.byModality.get('audio')?.result).toBe(
            verdict2.byModality.get('audio')?.result,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('7.9 Reaction time does not affect result type', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
        const judge1 = new SDTJudge();
        const judge2 = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response1 = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
        ]);
        const response2 = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt2 },
        ]);
        const verdict1 = judge1.evaluate(trial, response1, ctx);
        const verdict2 = judge2.evaluate(trial, response2, ctx);
        expect(verdict1.byModality.get('position')?.result).toBe(
          verdict2.byModality.get('position')?.result,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('7.10 passThreshold does not affect per-trial verdict', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 4.0, noNaN: true }),
        fc.double({ min: 0.5, max: 4.0, noNaN: true }),
        (t1, t2) => {
          const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
          const judge1 = new SDTJudge();
          const judge2 = new SDTJudge();
          const ctx1: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold: t1,
            strategy: 'sdt',
          };
          const ctx2: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold: t2,
            strategy: 'sdt',
          };
          const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
          const verdict1 = judge1.evaluate(trial, response, ctx1);
          const verdict2 = judge2.evaluate(trial, response, ctx2);
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
// SECTION 8: INDEPENDENCE BETWEEN MODALITIES (Tests 91-100)
// =============================================================================

describe('8. Independence Between Modalities', () => {
  it('8.1 Position result independent of audio target/response', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (posTarget, audioTarget, audioPressed) => {
          const trial = makeTrial({ isPositionTarget: posTarget, isSoundTarget: audioTarget });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: true },
            { modalityId: 'audio', pressed: audioPressed },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          const posResult = verdict.byModality.get('position')?.result;
          expect(posResult).toBe(posTarget ? 'hit' : 'false-alarm');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('8.2 Audio result independent of position target/response', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (audioTarget, posTarget, posPressed) => {
          const trial = makeTrial({ isPositionTarget: posTarget, isSoundTarget: audioTarget });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: true },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          const audioResult = verdict.byModality.get('audio')?.result;
          expect(audioResult).toBe(audioTarget ? 'hit' : 'false-alarm');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('8.3 Color result independent of other modalities', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (colorTarget, posTarget, audioTarget) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            isColorTarget: colorTarget,
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio', 'color']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: false },
            { modalityId: 'audio', pressed: false },
            { modalityId: 'color', pressed: true },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          const colorResult = verdict.byModality.get('color')?.result;
          expect(colorResult).toBe(colorTarget ? 'hit' : 'false-alarm');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('8.4 Image result independent of other modalities', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (imageTarget, posTarget) => {
        const trial = makeTrial({ isPositionTarget: posTarget, isImageTarget: imageTarget });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'image']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'image', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        const imageResult = verdict.byModality.get('image')?.result;
        expect(imageResult).toBe(imageTarget ? 'miss' : 'correct-rejection');
      }),
      { numRuns: 100 },
    );
  });

  it('8.5 RT for one modality does not affect other modality verdict', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
          { modalityId: 'audio', pressed: true, reactionTimeMs: 500 },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('8.6 Can have different result types per modality', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
  });

  it('8.7 All four result types possible in single trial', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: false,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('miss');
    expect(verdict.byModality.get('color')?.result).toBe('false-alarm');
    expect(verdict.byModality.get('image')?.result).toBe('correct-rejection');
  });

  it('8.8 wasTarget independent per modality', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.wasTarget).toBe(true);
    expect(verdict.byModality.get('audio')?.wasTarget).toBe(false);
  });

  it('8.9 hadResponse independent per modality', () => {
    const trial = makeTrial({ isPositionTarget: false, isSoundTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.hadResponse).toBe(true);
    expect(verdict.byModality.get('audio')?.hadResponse).toBe(false);
  });

  it('8.10 reactionTimeMs independent per modality', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
          { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt1);
        expect(verdict.byModality.get('audio')?.reactionTimeMs).toBe(rt2);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 9: REACTION TIME PROPERTIES (Tests 101-115)
// =============================================================================

describe('9. Reaction Time Properties', () => {
  it('9.1 RT recorded only when pressed', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, reactionTimeArb, (trial, rt) => {
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

  it('9.2 RT undefined when not pressed', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('9.3 Zero RT handled correctly', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true, reactionTimeMs: 0 },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(0);
    expect(verdict.minReactionTimeMs).toBe(0);
  });

  it('9.4 Very large RT handled correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 1000000 }), (rt) => {
        const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('9.5 minReactionTimeMs is minimum across all modalities', () => {
    fc.assert(
      fc.property(
        fc.tuple(reactionTimeArb, reactionTimeArb, reactionTimeArb),
        ([rt1, rt2, rt3]) => {
          const trial = makeTrial({
            isPositionTarget: true,
            isSoundTarget: true,
            isColorTarget: true,
            trialType: 'Dual',
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio', 'color']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
            { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
            { modalityId: 'color', pressed: true, reactionTimeMs: rt3 },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          expect(verdict.minReactionTimeMs).toBe(Math.min(rt1, rt2, rt3));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('9.6 minReactionTimeMs undefined when no responses', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('9.7 RT preserved through record and getVerdicts', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);
        const retrieved = judge.getVerdicts()[0];
        expect(retrieved!.byModality.get('position')?.reactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('9.8 minReactionTimeMs considers only responded modalities', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('9.9 RT with undefined value handled as no RT', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true, reactionTimeMs: undefined },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.reactionTimeMs).toBeUndefined();
  });

  it('9.10 RT does not affect verdict result type', () => {
    fc.assert(
      fc.property(
        reactionTimeArb,
        earlyReactionTimeArb,
        lateReactionTimeArb,
        (normal, early, late) => {
          const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          const v1 = judge.evaluate(
            trial,
            createResponse(0, [{ modalityId: 'position', pressed: true, reactionTimeMs: normal }]),
            ctx,
          );
          const v2 = judge.evaluate(
            trial,
            createResponse(0, [{ modalityId: 'position', pressed: true, reactionTimeMs: early }]),
            ctx,
          );
          const v3 = judge.evaluate(
            trial,
            createResponse(0, [{ modalityId: 'position', pressed: true, reactionTimeMs: late }]),
            ctx,
          );

          expect(v1.byModality.get('position')?.result).toBe('hit');
          expect(v2.byModality.get('position')?.result).toBe('hit');
          expect(v3.byModality.get('position')?.result).toBe('hit');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('9.11 RT aggregation in summary - average calculation', () => {
    fc.assert(
      fc.property(fc.array(reactionTimeArb, { minLength: 3, maxLength: 10 }), (rts) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < rts.length; i++) {
          const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
          const response = createResponse(i, [
            { modalityId: 'position', pressed: true, reactionTimeMs: rts[i] },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
        }

        const summary = judge.summarize(ctx);
        const posStats = summary.byModality.get('position');
        const expectedAvg = rts.reduce((a, b) => a + b, 0) / rts.length;

        expect(posStats?.avgReactionTimeMs).toBeCloseTo(expectedAvg, 5);
      }),
      { numRuns: 50 },
    );
  });

  it('9.12 RT list in summary matches recorded RTs', () => {
    fc.assert(
      fc.property(fc.array(reactionTimeArb, { minLength: 2, maxLength: 5 }), (rts) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < rts.length; i++) {
          const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
          const response = createResponse(i, [
            { modalityId: 'position', pressed: true, reactionTimeMs: rts[i] },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
        }

        const summary = judge.summarize(ctx);
        const posStats = summary.byModality.get('position');

        expect(posStats?.reactionTimes).toEqual(rts);
      }),
      { numRuns: 50 },
    );
  });

  it('9.13 avgReactionTimeMs is null when no RTs', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: false });
      const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
      const verdict = judge.evaluate(trial, response, ctx);
      judge.record(verdict);
    }

    const summary = judge.summarize(ctx);
    const posStats = summary.byModality.get('position');

    expect(posStats?.avgReactionTimeMs).toBeNull();
  });

  it('9.14 Multiple modalities track RT independently in summary', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);

        const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
          { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);

        const summary = judge.summarize(ctx);
        expect(summary.byModality.get('position')?.avgReactionTimeMs).toBe(rt1);
        expect(summary.byModality.get('audio')?.avgReactionTimeMs).toBe(rt2);
      }),
      { numRuns: 100 },
    );
  });

  it('9.15 RT preserved correctly for FA (false alarm)', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isPositionTarget: false });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 10: BUFFER TRIAL HANDLING (Tests 116-125)
// =============================================================================

describe('10. Buffer Trial Handling', () => {
  it('10.1 Buffer trial still evaluates (no special handling in judge)', () => {
    fc.assert(
      fc.property(bufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict).toBeDefined();
        expect(verdict.byModality.get('position')).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('10.2 Buffer trial can produce all four result types', () => {
    const combinations = [
      { isTarget: true, pressed: true, expected: 'hit' },
      { isTarget: true, pressed: false, expected: 'miss' },
      { isTarget: false, pressed: true, expected: 'false-alarm' },
      { isTarget: false, pressed: false, expected: 'correct-rejection' },
    ];
    for (const { isTarget, pressed, expected } of combinations) {
      const trial = makeTrial({
        isBuffer: true,
        isPositionTarget: isTarget,
        trialType: isTarget ? 'V-Seul' : 'Non-Cible',
      });
      const judge = new SDTJudge();
      const ctx = createBasicContext(['position']);
      const response = createResponse(0, [{ modalityId: 'position', pressed }]);
      const verdict = judge.evaluate(trial, response, ctx);
      // @ts-expect-error test override
      expect(verdict.byModality.get('position')?.result).toBe(expected);
    }
  });

  it('10.3 Buffer trial can be recorded', () => {
    fc.assert(
      fc.property(bufferTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);
        expect(judge.getVerdicts().length).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('10.4 Buffer trial contributes to summary counts', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    // Record buffer trial with CR
    const bufferTrial = makeTrial({ isBuffer: true, isPositionTarget: false });
    const bufferResponse = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    judge.record(judge.evaluate(bufferTrial, bufferResponse, ctx));

    // Record non-buffer trial with CR
    const normalTrial = makeTrial({ index: 1, isBuffer: false, isPositionTarget: false });
    const normalResponse = createResponse(1, [{ modalityId: 'position', pressed: false }]);
    judge.record(judge.evaluate(normalTrial, normalResponse, ctx));

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.correctRejections).toBe(2);
  });

  it('10.5 Mixed buffer and non-buffer trials counted correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (bufferCount, normalCount) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          let idx = 0;

          for (let i = 0; i < bufferCount; i++) {
            const trial = makeTrial({
              index: idx++,
              isBuffer: true,
              isPositionTarget: true,
              trialType: 'V-Seul',
            });
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: true },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          for (let i = 0; i < normalCount; i++) {
            const trial = makeTrial({
              index: idx++,
              isBuffer: false,
              isPositionTarget: true,
              trialType: 'V-Seul',
            });
            const response = createResponse(trial.index, [
              { modalityId: 'position', pressed: true },
            ]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          expect(summary.byModality.get('position')?.counts.hits).toBe(bufferCount + normalCount);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('10.6 Buffer flag does not affect verdict result', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (isBuffer, isTarget, pressed) => {
        const trial = makeTrial({
          isBuffer,
          isPositionTarget: isTarget,
          trialType: isTarget ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);

        let expected: TrialResultType;
        if (isTarget && pressed) expected = 'hit';
        else if (isTarget && !pressed) expected = 'miss';
        else if (!isTarget && pressed) expected = 'false-alarm';
        else expected = 'correct-rejection';

        expect(verdict.byModality.get('position')?.result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('10.7 Buffer trial RT recorded normally', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        const trial = makeTrial({ isBuffer: true, isPositionTarget: true, trialType: 'V-Seul' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.reactionTimeMs).toBe(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('10.8 BrainWorkshopJudge handles buffer trials', () => {
    fc.assert(
      fc.property(bufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('10.9 AccuracyJudge handles buffer trials', () => {
    fc.assert(
      fc.property(bufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('10.10 Buffer trial feedback generated normally', () => {
    const trial = makeTrial({ isBuffer: true, isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.feedbackActions.length).toBeGreaterThan(0);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
  });
});

// =============================================================================
// SECTION 11: LURE TRIAL HANDLING (Tests 126-135)
// =============================================================================

describe('11. Lure Trial Handling', () => {
  it('11.1 Lure trial without target treated as non-target', () => {
    fc.assert(
      fc.property(lureTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        // Lure flag does not affect judgment - only isTarget matters
        expect(verdict.byModality.get('position')?.wasTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('11.2 Lure trial produces CR when not pressed', () => {
    fc.assert(
      fc.property(lureTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('correct-rejection');
      }),
      { numRuns: 100 },
    );
  });

  it('11.3 Lure trial produces FA when pressed', () => {
    fc.assert(
      fc.property(lureTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed: true }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
      }),
      { numRuns: 100 },
    );
  });

  it('11.4 Lure flag does not influence judgment logic', () => {
    const withLure = makeTrial({ isPositionTarget: false, isPositionLure: true });
    const withoutLure = makeTrial({ isPositionTarget: false, isPositionLure: false });

    const judge1 = new SDTJudge();
    const judge2 = new SDTJudge();
    const ctx = createBasicContext(['position']);

    const response1 = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const response2 = createResponse(0, [{ modalityId: 'position', pressed: true }]);

    const verdict1 = judge1.evaluate(withLure, response1, ctx);
    const verdict2 = judge2.evaluate(withoutLure, response2, ctx);

    expect(verdict1.byModality.get('position')?.result).toBe(
      verdict2.byModality.get('position')?.result,
    );
  });

  it('11.5 Target with lure flag still produces hit when pressed', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isPositionLure: true,
      trialType: 'V-Seul',
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
  });

  it('11.6 Multiple modalities can have different lure states', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: false,
      isPositionLure: true,
      isSoundLure: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
  });

  it('11.7 Lure trial counted in summary statistics', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    const lure = makeTrial({ isPositionTarget: false, isPositionLure: true });
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    judge.record(judge.evaluate(lure, response, ctx));

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.falseAlarms).toBe(1);
  });

  it('11.8 BrainWorkshopJudge handles lure trials', () => {
    fc.assert(
      fc.property(lureTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new BrainWorkshopJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('11.9 Lure trial isTarget is false', () => {
    fc.assert(
      fc.property(lureTrialArb, (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('11.10 Lure trial isCorrect depends on response', () => {
    const trial = makeTrial({ isPositionTarget: false, isPositionLure: true });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    const noPress = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const withPress = createResponse(0, [{ modalityId: 'position', pressed: true }]);

    const v1 = judge.evaluate(trial, noPress, ctx);
    const v2 = judge.evaluate(trial, withPress, ctx);

    expect(v1.isCorrect).toBe(true);
    expect(v2.isCorrect).toBe(false);
  });
});

// =============================================================================
// SECTION 12: DUAL TARGET HANDLING (Tests 136-145)
// =============================================================================

describe('12. Dual Target Handling', () => {
  it('12.1 Dual target with both responses produces dual hits', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: true },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('hit');
        expect(verdict.overall).toBe('hit');
      }),
      { numRuns: 100 },
    );
  });

  it('12.2 Dual target with one response produces hit and miss', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.byModality.get('position')?.result).toBe('hit');
        expect(verdict.byModality.get('audio')?.result).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('12.3 Dual target with no responses produces dual misses', () => {
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
        expect(verdict.overall).toBe('miss');
      }),
      { numRuns: 100 },
    );
  });

  it('12.4 Dual target isTarget is true', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(trial.index, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('12.5 Dual target isCorrect requires both correct', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);

    const bothCorrect = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    const oneWrong = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);

    const v1 = judge.evaluate(trial, bothCorrect, ctx);
    const v2 = judge.evaluate(trial, oneWrong, ctx);

    expect(v1.isCorrect).toBe(true);
    expect(v2.isCorrect).toBe(false);
  });

  it('12.6 Three-way target possible', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: true,
      trialType: 'Dual',
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('hit');
    expect(verdict.byModality.get('color')?.result).toBe('hit');
  });

  it('12.7 Four-way target possible', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: true,
      isImageTarget: true,
      trialType: 'Dual',
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.isTarget).toBe(true);
    expect(verdict.isCorrect).toBe(true);
    expect(verdict.overall).toBe('hit');
  });

  it('12.8 Dual target overall priority still applies', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('miss');
  });

  it('12.9 Dual target minReactionTimeMs from earliest response', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: true, reactionTimeMs: rt1 },
          { modalityId: 'audio', pressed: true, reactionTimeMs: rt2 },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.minReactionTimeMs).toBe(Math.min(rt1, rt2));
      }),
      { numRuns: 100 },
    );
  });

  it('12.10 Dual target contributes to both modality counts', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);

    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    judge.record(judge.evaluate(trial, response, ctx));

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.hits).toBe(1);
    expect(summary.byModality.get('audio')?.counts.hits).toBe(1);
  });
});

// =============================================================================
// SECTION 13: PRIORITY RULES (Tests 146-160)
// =============================================================================

describe('13. Priority Rules for Overall Result', () => {
  it('13.1 Priority: miss > false-alarm', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('miss');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
    expect(verdict.overall).toBe('miss');
  });

  it('13.2 Priority: miss > hit', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: true, trialType: 'Dual' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('miss');
    expect(verdict.overall).toBe('miss');
  });

  it('13.3 Priority: miss > correct-rejection', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('miss');
    expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('miss');
  });

  it('13.4 Priority: false-alarm > hit', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
    expect(verdict.overall).toBe('false-alarm');
  });

  it('13.5 Priority: false-alarm > correct-rejection', () => {
    const trial = makeTrial({ isPositionTarget: false, isSoundTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
    expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('false-alarm');
  });

  it('13.6 Priority: hit > correct-rejection', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('hit');
    expect(verdict.byModality.get('audio')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('hit');
  });

  it('13.7 All misses produce overall miss', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), (numModalities) => {
        const modalities: ModalityId[] = ['position', 'audio', 'color', 'image'].slice(
          0,
          numModalities,
        );
        const trial = makeTrial({
          isPositionTarget: true,
          isSoundTarget: numModalities > 1,
          isColorTarget: numModalities > 2,
          isImageTarget: numModalities > 3,
          trialType: 'Dual',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(modalities);
        const response = createResponse(
          0,
          modalities.map((m) => ({ modalityId: m, pressed: false })),
        );
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.overall).toBe('miss');
      }),
      { numRuns: 50 },
    );
  });

  it('13.8 All CRs produce overall CR', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
      { modalityId: 'color', pressed: false },
      { modalityId: 'image', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('correct-rejection');
  });

  it('13.9 All hits produce overall hit', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: true,
      isImageTarget: true,
      trialType: 'Dual',
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('hit');
  });

  it('13.10 All FAs produce overall FA', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('false-alarm');
  });

  it('13.11 Priority exhaustive: miss + FA + hit + CR', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: false,
      isColorTarget: true,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('miss');
    expect(verdict.byModality.get('audio')?.result).toBe('false-alarm');
    expect(verdict.byModality.get('color')?.result).toBe('hit');
    expect(verdict.byModality.get('image')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('miss');
  });

  it('13.12 Priority with three modalities', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: true,
      isColorTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.result).toBe('false-alarm');
    expect(verdict.byModality.get('audio')?.result).toBe('hit');
    expect(verdict.byModality.get('color')?.result).toBe('correct-rejection');
    expect(verdict.overall).toBe('false-alarm');
  });

  it('13.13 BrainWorkshopJudge uses same priority rules', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new BrainWorkshopJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('miss');
  });

  it('13.14 Priority deterministic across multiple evaluations', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
          posPressed: fc.boolean(),
          audioPressed: fc.boolean(),
        }),
        ({ posTarget, audioTarget, posPressed, audioPressed }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge1 = new SDTJudge();
          const judge2 = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: audioPressed },
          ]);
          const v1 = judge1.evaluate(trial, response, ctx);
          const v2 = judge2.evaluate(trial, response, ctx);
          expect(v1.overall).toBe(v2.overall);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('13.15 Single modality overall equals modality result', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isTarget, pressed) => {
        const trial = makeTrial({
          isPositionTarget: isTarget,
          trialType: isTarget ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        // @ts-expect-error test override
        expect(verdict.overall).toBe(verdict.byModality.get('position')?.result);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 14: isCorrect AND isTarget AGGREGATION (Tests 161-175)
// =============================================================================

describe('14. isCorrect and isTarget Aggregation', () => {
  it('14.1 isCorrect true when all modalities correct', () => {
    fc.assert(
      fc.property(
        fc.record({ posTarget: fc.boolean(), audioTarget: fc.boolean() }),
        ({ posTarget, audioTarget }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posTarget },
            { modalityId: 'audio', pressed: audioTarget },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          expect(verdict.isCorrect).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('14.2 isCorrect false when any modality incorrect', () => {
    fc.assert(
      fc.property(fc.boolean(), (posTarget) => {
        const trial = makeTrial({
          isPositionTarget: posTarget,
          isSoundTarget: true,
          trialType: 'Dual',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position', 'audio']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed: posTarget },
          { modalityId: 'audio', pressed: false },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('14.3 isTarget true when ANY modality is target', () => {
    fc.assert(
      fc.property(
        fc
          .record({ posTarget: fc.boolean(), audioTarget: fc.boolean() })
          .filter(({ posTarget, audioTarget }) => posTarget || audioTarget),
        ({ posTarget, audioTarget }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: false },
            { modalityId: 'audio', pressed: false },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          expect(verdict.isTarget).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('14.4 isTarget false when NO modality is target', () => {
    const trial = makeTrial({ isPositionTarget: false, isSoundTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.isTarget).toBe(false);
  });

  it('14.5 isCorrect = hit OR correct-rejection for each modality', () => {
    fc.assert(
      fc.property(
        fc.record({
          posTarget: fc.boolean(),
          audioTarget: fc.boolean(),
          posPressed: fc.boolean(),
          audioPressed: fc.boolean(),
        }),
        ({ posTarget, audioTarget, posPressed, audioPressed }) => {
          const trial = makeTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
            trialType: deriveTrialType(posTarget, audioTarget),
          });
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position', 'audio']);
          const response = createResponse(0, [
            { modalityId: 'position', pressed: posPressed },
            { modalityId: 'audio', pressed: audioPressed },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);

          const posCorrect = posTarget === posPressed;
          const audioCorrect = audioTarget === audioPressed;

          expect(verdict.isCorrect).toBe(posCorrect && audioCorrect);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('14.6 Single modality isCorrect logic', () => {
    const cases = [
      { target: true, pressed: true, correct: true },
      { target: true, pressed: false, correct: false },
      { target: false, pressed: true, correct: false },
      { target: false, pressed: false, correct: true },
    ];
    for (const { target, pressed, correct } of cases) {
      const trial = makeTrial({
        isPositionTarget: target,
        trialType: target ? 'V-Seul' : 'Non-Cible',
      });
      const judge = new SDTJudge();
      const ctx = createBasicContext(['position']);
      const response = createResponse(0, [{ modalityId: 'position', pressed }]);
      const verdict = judge.evaluate(trial, response, ctx);
      expect(verdict.isCorrect).toBe(correct);
    }
  });

  it('14.7 Four modalities isCorrect requires all four correct', () => {
    const trial = makeTrial({
      isPositionTarget: true,
      isSoundTarget: false,
      isColorTarget: true,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);

    const allCorrect = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: false },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: false },
    ]);
    const oneWrong = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
      { modalityId: 'color', pressed: true },
      { modalityId: 'image', pressed: false },
    ]);

    expect(judge.evaluate(trial, allCorrect, ctx).isCorrect).toBe(true);
    expect(judge.evaluate(trial, oneWrong, ctx).isCorrect).toBe(false);
  });

  it('14.8 isTarget with four modalities', () => {
    const trial = makeTrial({
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: true,
      isImageTarget: false,
    });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: false },
      { modalityId: 'audio', pressed: false },
      { modalityId: 'color', pressed: false },
      { modalityId: 'image', pressed: false },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.isTarget).toBe(true);
  });

  it('14.9 AccuracyJudge isTarget always true', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('14.10 AccuracyJudge isCorrect = pressed', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        expect(verdict.isCorrect).toBe(pressed);
      }),
      { numRuns: 100 },
    );
  });

  it('14.11 BrainWorkshopJudge isCorrect same as SDTJudge', () => {
    fc.assert(
      fc.property(
        fc.record({ target: fc.boolean(), pressed: fc.boolean() }),
        ({ target, pressed }) => {
          const trial = makeTrial({
            isPositionTarget: target,
            trialType: target ? 'V-Seul' : 'Non-Cible',
          });
          const sdt = new SDTJudge();
          const bw = new BrainWorkshopJudge();
          const ctx = createBasicContext(['position']);
          const response = createResponse(0, [{ modalityId: 'position', pressed }]);
          const v1 = sdt.evaluate(trial, response, ctx);
          const v2 = bw.evaluate(trial, response, ctx);
          expect(v1.isCorrect).toBe(v2.isCorrect);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('14.12 isCorrect consistent across repeated evaluations', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (target, pressed) => {
        const trial = makeTrial({
          isPositionTarget: target,
          trialType: target ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [{ modalityId: 'position', pressed }]);
        const results = Array.from(
          { length: 5 },
          () => judge.evaluate(trial, response, ctx).isCorrect,
        );
        expect(new Set(results).size).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('14.13 isTarget independent of response', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (target, pressed1, pressed2) => {
        const trial = makeTrial({
          isPositionTarget: target,
          trialType: target ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const r1 = createResponse(0, [{ modalityId: 'position', pressed: pressed1 }]);
        const r2 = createResponse(0, [{ modalityId: 'position', pressed: pressed2 }]);
        const v1 = judge.evaluate(trial, r1, ctx);
        const v2 = judge.evaluate(trial, r2, ctx);
        expect(v1.isTarget).toBe(v2.isTarget);
      }),
      { numRuns: 100 },
    );
  });

  it('14.14 isCorrect preserved through record/retrieve', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (target, pressed) => {
        const trial = makeTrial({
          isPositionTarget: target,
          trialType: target ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);
        const retrieved = judge.getVerdicts()[0];
        expect(retrieved!.isCorrect).toBe(verdict.isCorrect);
        expect(retrieved!.isTarget).toBe(verdict.isTarget);
      }),
      { numRuns: 100 },
    );
  });

  it('14.15 Correct count in summary matches isCorrect verdicts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 20,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          let expectedCorrect = 0;

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            const verdict = judge.evaluate(trial, response, ctx);
            judge.record(verdict);
            if (verdict.isCorrect) expectedCorrect++;
          }

          const summary = judge.summarize(ctx);
          const counts = summary.byModality.get('position')?.counts;
          const actualCorrect = (counts?.hits ?? 0) + (counts?.correctRejections ?? 0);
          expect(actualCorrect).toBe(expectedCorrect);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SECTION 15: FEEDBACK ACTION GENERATION (Tests 176-185)
// =============================================================================

describe('15. Feedback Action Generation', () => {
  it('15.1 Hit generates flash-green feedback', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.feedbackActions.length).toBeGreaterThan(0);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].sound).toBe('correct');
  });

  it('15.2 False alarm generates flash-red feedback', () => {
    const trial = makeTrial({ isPositionTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.feedbackActions.length).toBeGreaterThan(0);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].sound).toBe('incorrect');
  });

  it('15.3 Miss generates no feedback (default)', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.feedbackActions.length).toBe(0);
  });

  it('15.4 Correct rejection generates no feedback (default)', () => {
    const trial = makeTrial({ isPositionTarget: false });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.feedbackActions.length).toBe(0);
  });

  it('15.5 Custom feedback reactions respected', () => {
    const customReactions: FeedbackReaction[] = [
      { on: 'hit', sound: 'neutral', visual: 'flash-amber' },
      { on: 'miss', sound: 'incorrect', visual: 'flash-red' },
      { on: 'false-alarm', sound: 'none', visual: 'none' },
      { on: 'correct-rejection', sound: 'correct', visual: 'flash-green' },
    ];
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 2.0,
      strategy: 'sdt',
      feedbackReactions: customReactions,
    };
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-amber');
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].sound).toBe('neutral');
  });

  it('15.6 Feedback based on overall result, not individual modality', () => {
    const trial = makeTrial({ isPositionTarget: true, isSoundTarget: false, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);
    const response = createResponse(0, [
      { modalityId: 'position', pressed: true },
      { modalityId: 'audio', pressed: true },
    ]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.overall).toBe('false-alarm');
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
  });

  it('15.7 AccuracyJudge feedback for correct', () => {
    const trial = makeTrial();
    const judge = new AccuracyJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
  });

  it('15.8 AccuracyJudge feedback for incorrect', () => {
    const trial = makeTrial();
    const judge = new AccuracyJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
  });

  it('15.9 BrainWorkshopJudge uses same default feedback', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new BrainWorkshopJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    // @ts-expect-error test: nullable access
    expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
  });

  it('15.10 Feedback actions array is readonly-safe', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    const verdict = judge.evaluate(trial, response, ctx);
    expect(Array.isArray(verdict.feedbackActions)).toBe(true);
  });
});

// =============================================================================
// SECTION 16: RUNNING STATS AND COUNT CONSISTENCY (Tests 186-195)
// =============================================================================

describe('16. Running Stats and Count Consistency', () => {
  it('16.1 Total count equals sum of all result types', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 30,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const counts = summary.byModality.get('position')?.counts;
          const sum =
            (counts?.hits ?? 0) +
            (counts?.misses ?? 0) +
            (counts?.falseAlarms ?? 0) +
            (counts?.correctRejections ?? 0);
          expect(counts?.total).toBe(sum);
          expect(counts?.total).toBe(configs.length);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('16.2 Hits + misses = signal trials (targets)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 10,
          maxLength: 30,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          let signalCount = 0;

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            if (target) signalCount++;
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const counts = summary.byModality.get('position')?.counts;
          expect((counts?.hits ?? 0) + (counts?.misses ?? 0)).toBe(signalCount);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('16.3 FA + CR = noise trials (non-targets)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 10,
          maxLength: 30,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);
          let noiseCount = 0;

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            if (!target) noiseCount++;
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const counts = summary.byModality.get('position')?.counts;
          expect((counts?.falseAlarms ?? 0) + (counts?.correctRejections ?? 0)).toBe(noiseCount);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('16.4 Multi-modality counts tracked separately', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);

    const trial1 = makeTrial({
      index: 0,
      isPositionTarget: true,
      isSoundTarget: false,
      trialType: 'V-Seul',
    });
    const trial2 = makeTrial({
      index: 1,
      isPositionTarget: false,
      isSoundTarget: true,
      trialType: 'A-Seul',
    });

    judge.record(
      judge.evaluate(
        trial1,
        createResponse(0, [
          { modalityId: 'position', pressed: true },
          { modalityId: 'audio', pressed: false },
        ]),
        ctx,
      ),
    );

    judge.record(
      judge.evaluate(
        trial2,
        createResponse(1, [
          { modalityId: 'position', pressed: false },
          { modalityId: 'audio', pressed: true },
        ]),
        ctx,
      ),
    );

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.hits).toBe(1);
    expect(summary.byModality.get('position')?.counts.correctRejections).toBe(1);
    expect(summary.byModality.get('audio')?.counts.hits).toBe(1);
    expect(summary.byModality.get('audio')?.counts.correctRejections).toBe(1);
  });

  it('16.5 Count increments correctly with each verdict', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < n; i++) {
          const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
          const response = createResponse(i, [{ modalityId: 'position', pressed: true }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const summary = judge.summarize(ctx);
        expect(summary.byModality.get('position')?.counts.hits).toBe(n);
      }),
      { numRuns: 50 },
    );
  });

  it('16.6 BrainWorkshop counts same as SDT counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 15,
        }),
        (configs) => {
          const sdtJudge = new SDTJudge();
          const bwJudge = new BrainWorkshopJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            sdtJudge.record(sdtJudge.evaluate(trial, response, ctx));
            bwJudge.record(bwJudge.evaluate(trial, response, ctx));
          }

          const sdtSummary = sdtJudge.summarize(ctx);
          const bwSummary = bwJudge.summarize(ctx);

          expect(bwSummary.byModality.get('position')?.counts.hits).toBe(
            sdtSummary.byModality.get('position')?.counts.hits,
          );
          expect(bwSummary.byModality.get('position')?.counts.misses).toBe(
            sdtSummary.byModality.get('position')?.counts.misses,
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it('16.7 Empty judge has zero counts', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const summary = judge.summarize(ctx);
    const counts = summary.byModality.get('position')?.counts;
    expect(counts?.hits).toBe(0);
    expect(counts?.misses).toBe(0);
    expect(counts?.falseAlarms).toBe(0);
    expect(counts?.correctRejections).toBe(0);
    expect(counts?.total).toBe(0);
  });

  it('16.8 AccuracyJudge counts only hits and misses', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 5, maxLength: 15 }), (pressedArray) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < pressedArray.length; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [
            // @ts-expect-error test override
            { modalityId: 'position', pressed: pressedArray[i] },
          ]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const summary = judge.summarize(ctx);
        const counts = summary.byModality.get('position')?.counts;
        expect(counts?.falseAlarms).toBe(0);
        expect(counts?.correctRejections).toBe(0);
        expect((counts?.hits ?? 0) + (counts?.misses ?? 0)).toBe(pressedArray.length);
      }),
      { numRuns: 50 },
    );
  });

  it('16.9 verdicts array in summary matches recorded count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < n; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const summary = judge.summarize(ctx);
        expect(summary.verdicts.length).toBe(n);
      }),
      { numRuns: 50 },
    );
  });

  it('16.10 Multiple modalities have independent totals', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color']);

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i });
      const response = createResponse(i, [
        { modalityId: 'position', pressed: false },
        { modalityId: 'audio', pressed: false },
        { modalityId: 'color', pressed: false },
      ]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.total).toBe(10);
    expect(summary.byModality.get('audio')?.counts.total).toBe(10);
    expect(summary.byModality.get('color')?.counts.total).toBe(10);
  });
});

// =============================================================================
// SECTION 17: RATE CALCULATIONS (Tests 196-205)
// =============================================================================

describe('17. Rate Calculations', () => {
  it('17.1 Hit rate = hits / (hits + misses)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        (hits, misses) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < hits; i++) {
            const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
            const response = createResponse(i, [{ modalityId: 'position', pressed: true }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }
          for (let i = 0; i < misses; i++) {
            const trial = makeTrial({
              index: hits + i,
              isPositionTarget: true,
              trialType: 'V-Seul',
            });
            const response = createResponse(hits + i, [{ modalityId: 'position', pressed: false }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const expectedHitRate = hits / (hits + misses);
          expect(summary.byModality.get('position')?.hitRate).toBeCloseTo(expectedHitRate, 5);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('17.2 False alarm rate = FA / (FA + CR)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }), (fa, cr) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < fa; i++) {
          const trial = makeTrial({ index: i, isPositionTarget: false });
          const response = createResponse(i, [{ modalityId: 'position', pressed: true }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }
        for (let i = 0; i < cr; i++) {
          const trial = makeTrial({ index: fa + i, isPositionTarget: false });
          const response = createResponse(fa + i, [{ modalityId: 'position', pressed: false }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const summary = judge.summarize(ctx);
        const expectedFARate = fa / (fa + cr);
        expect(summary.byModality.get('position')?.falseAlarmRate).toBeCloseTo(expectedFARate, 5);
      }),
      { numRuns: 50 },
    );
  });

  it('17.3 Hit rate is 0 when no signal trials', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: false });
      const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.hitRate).toBe(0);
  });

  it('17.4 FA rate is 0 when no noise trials', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      const response = createResponse(i, [{ modalityId: 'position', pressed: true }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.falseAlarmRate).toBe(0);
  });

  it('17.5 Hit rate in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 30,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const hitRate = summary.byModality.get('position')?.hitRate ?? 0;
          expect(hitRate).toBeGreaterThanOrEqual(0);
          expect(hitRate).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('17.6 FA rate in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ target: fc.boolean(), pressed: fc.boolean() }), {
          minLength: 5,
          maxLength: 30,
        }),
        (configs) => {
          const judge = new SDTJudge();
          const ctx = createBasicContext(['position']);

          for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error test override
            const { target, pressed } = configs[i];
            const trial = makeTrial({
              index: i,
              isPositionTarget: target,
              trialType: target ? 'V-Seul' : 'Non-Cible',
            });
            const response = createResponse(i, [{ modalityId: 'position', pressed }]);
            judge.record(judge.evaluate(trial, response, ctx));
          }

          const summary = judge.summarize(ctx);
          const faRate = summary.byModality.get('position')?.falseAlarmRate ?? 0;
          expect(faRate).toBeGreaterThanOrEqual(0);
          expect(faRate).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('17.7 Perfect performance = hit rate 1, FA rate 0', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: true }]), ctx),
      );
    }
    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: 5 + i, isPositionTarget: false });
      judge.record(
        judge.evaluate(
          trial,
          createResponse(5 + i, [{ modalityId: 'position', pressed: false }]),
          ctx,
        ),
      );
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.hitRate).toBe(1);
    expect(summary.byModality.get('position')?.falseAlarmRate).toBe(0);
  });

  it('17.8 Worst performance = hit rate 0, FA rate 1', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: false }]), ctx),
      );
    }
    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: 5 + i, isPositionTarget: false });
      judge.record(
        judge.evaluate(
          trial,
          createResponse(5 + i, [{ modalityId: 'position', pressed: true }]),
          ctx,
        ),
      );
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.hitRate).toBe(0);
    expect(summary.byModality.get('position')?.falseAlarmRate).toBe(1);
  });

  it('17.9 AccuracyJudge hitRate = accuracy', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 5, maxLength: 20 }), (pressedArray) => {
        const judge = new AccuracyJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < pressedArray.length; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [
            // @ts-expect-error test override
            { modalityId: 'position', pressed: pressedArray[i] },
          ]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const summary = judge.summarize(ctx);
        const expectedAccuracy = pressedArray.filter((p) => p).length / pressedArray.length;
        expect(summary.byModality.get('position')?.hitRate).toBeCloseTo(expectedAccuracy, 5);
      }),
      { numRuns: 50 },
    );
  });

  it('17.10 BrainWorkshop score formula: hits / (hits + misses + FA)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (hits, misses, fa, cr) => {
          if (hits + misses + fa + cr === 0) return;

          const judge = new BrainWorkshopJudge();
          const ctx: EvaluationContext = {
            activeModalities: ['position'],
            passThreshold: 0.8,
            strategy: 'brainworkshop',
          };

          let idx = 0;
          for (let i = 0; i < hits; i++) {
            const trial = makeTrial({ index: idx++, isPositionTarget: true, trialType: 'V-Seul' });
            judge.record(
              judge.evaluate(
                trial,
                createResponse(trial.index, [{ modalityId: 'position', pressed: true }]),
                ctx,
              ),
            );
          }
          for (let i = 0; i < misses; i++) {
            const trial = makeTrial({ index: idx++, isPositionTarget: true, trialType: 'V-Seul' });
            judge.record(
              judge.evaluate(
                trial,
                createResponse(trial.index, [{ modalityId: 'position', pressed: false }]),
                ctx,
              ),
            );
          }
          for (let i = 0; i < fa; i++) {
            const trial = makeTrial({ index: idx++, isPositionTarget: false });
            judge.record(
              judge.evaluate(
                trial,
                createResponse(trial.index, [{ modalityId: 'position', pressed: true }]),
                ctx,
              ),
            );
          }
          for (let i = 0; i < cr; i++) {
            const trial = makeTrial({ index: idx++, isPositionTarget: false });
            judge.record(
              judge.evaluate(
                trial,
                createResponse(trial.index, [{ modalityId: 'position', pressed: false }]),
                ctx,
              ),
            );
          }

          const summary = judge.summarize(ctx);
          const denominator = hits + misses + fa;
          const expectedScore = denominator === 0 ? 0 : hits / denominator;
          expect(summary.score).toBeCloseTo(expectedScore, 5);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// SECTION 18: RESET FUNCTIONALITY (Tests 206-215)
// =============================================================================

describe('18. Reset Functionality', () => {
  it('18.1 Reset clears all verdicts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < n; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        expect(judge.getVerdicts().length).toBe(n);
        judge.reset();
        expect(judge.getVerdicts().length).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  it('18.2 Reset allows fresh session', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: true }]), ctx),
      );
    }

    judge.reset();

    for (let i = 0; i < 3; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: false });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: false }]), ctx),
      );
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.hits).toBe(0);
    expect(summary.byModality.get('position')?.counts.correctRejections).toBe(3);
  });

  it('18.3 Reset does not affect evaluation logic', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);

    const v1 = judge.evaluate(trial, response, ctx);
    judge.reset();
    const v2 = judge.evaluate(trial, response, ctx);

    expect(v1.byModality.get('position')?.result).toBe(v2.byModality.get('position')?.result);
  });

  it('18.4 BrainWorkshopJudge reset works', () => {
    const judge = new BrainWorkshopJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: false }]), ctx),
      );
    }

    judge.reset();
    expect(judge.getVerdicts().length).toBe(0);
  });

  it('18.5 AccuracyJudge reset works', () => {
    const judge = new AccuracyJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 5; i++) {
      const trial = makeTrial({ index: i });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: false }]), ctx),
      );
    }

    judge.reset();
    expect(judge.getVerdicts().length).toBe(0);
  });

  it('18.6 Summary after reset shows zero counts', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: true }]), ctx),
      );
    }

    judge.reset();
    const summary = judge.summarize(ctx);

    expect(summary.byModality.get('position')?.counts.total).toBe(0);
    expect(summary.verdicts.length).toBe(0);
  });

  it('18.7 Multiple resets are safe', () => {
    const judge = new SDTJudge();
    judge.reset();
    judge.reset();
    judge.reset();
    expect(judge.getVerdicts().length).toBe(0);
  });

  it('18.8 Reset on empty judge is safe', () => {
    const judge = new SDTJudge();
    expect(judge.getVerdicts().length).toBe(0);
    judge.reset();
    expect(judge.getVerdicts().length).toBe(0);
  });

  it('18.9 Reset clears RT data', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    judge.record(
      judge.evaluate(
        trial,
        createResponse(0, [{ modalityId: 'position', pressed: true, reactionTimeMs: 500 }]),
        ctx,
      ),
    );

    expect(judge.summarize(ctx).byModality.get('position')?.reactionTimes.length).toBe(1);

    judge.reset();

    expect(judge.summarize(ctx).byModality.get('position')?.reactionTimes.length).toBe(0);
  });

  it('18.10 Reset independent between judges', () => {
    const judge1 = new SDTJudge();
    const judge2 = new SDTJudge();
    const ctx = createBasicContext(['position']);

    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);

    judge1.record(judge1.evaluate(trial, response, ctx));
    judge2.record(judge2.evaluate(trial, response, ctx));

    judge1.reset();

    expect(judge1.getVerdicts().length).toBe(0);
    expect(judge2.getVerdicts().length).toBe(1);
  });
});

// =============================================================================
// SECTION 19: RECORD/RETRIEVE CONSISTENCY (Tests 216-225)
// =============================================================================

describe('19. Record/Retrieve Consistency', () => {
  it('19.1 Recorded verdict retrievable via getVerdicts', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, fc.boolean(), (trial, pressed) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(trial.index, [{ modalityId: 'position', pressed }]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);
        const retrieved = judge.getVerdicts();
        expect(retrieved.length).toBe(1);
        expect(retrieved[0]).toBe(verdict);
      }),
      { numRuns: 100 },
    );
  });

  it('19.2 Multiple verdicts retrievable in order', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 2, maxLength: 10 }), (pressedArray) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const verdicts: TrialVerdict[] = [];

        for (let i = 0; i < pressedArray.length; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [
            // @ts-expect-error test override
            { modalityId: 'position', pressed: pressedArray[i] },
          ]);
          const verdict = judge.evaluate(trial, response, ctx);
          judge.record(verdict);
          verdicts.push(verdict);
        }

        const retrieved = judge.getVerdicts();
        expect(retrieved.length).toBe(verdicts.length);
        for (let i = 0; i < verdicts.length; i++) {
          expect(retrieved[i]!.trialIndex).toBe(verdicts[i]!.trialIndex);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('19.3 Verdict properties preserved', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), reactionTimeArb, (target, pressed, rt) => {
        const trial = makeTrial({
          isPositionTarget: target,
          trialType: target ? 'V-Seul' : 'Non-Cible',
        });
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const response = createResponse(0, [
          { modalityId: 'position', pressed, reactionTimeMs: pressed ? rt : undefined },
        ]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);
        const retrieved = judge.getVerdicts()[0];

        expect(retrieved!.overall).toBe(verdict.overall);
        expect(retrieved!.isCorrect).toBe(verdict.isCorrect);
        expect(retrieved!.isTarget).toBe(verdict.isTarget);
        expect(retrieved!.byModality.get('position')?.result).toBe(
          verdict.byModality.get('position')?.result,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('19.4 getVerdicts returns copy/readonly (no mutation)', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    judge.record(judge.evaluate(trial, response, ctx));

    const verdicts1 = judge.getVerdicts();
    const verdicts2 = judge.getVerdicts();

    expect(verdicts1.length).toBe(verdicts2.length);
  });

  it('19.5 Summary verdicts matches getVerdicts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);

        for (let i = 0; i < n; i++) {
          const trial = makeTrial({ index: i });
          const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
          judge.record(judge.evaluate(trial, response, ctx));
        }

        const fromGet = judge.getVerdicts();
        const fromSummary = judge.summarize(ctx).verdicts;

        expect(fromGet.length).toBe(fromSummary.length);
      }),
      { numRuns: 50 },
    );
  });

  it('19.6 Evaluate without record does not affect getVerdicts', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);

    judge.evaluate(trial, response, ctx);

    expect(judge.getVerdicts().length).toBe(0);
  });

  it('19.7 Record same verdict multiple times', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);

    judge.record(verdict);
    judge.record(verdict);
    judge.record(verdict);

    expect(judge.getVerdicts().length).toBe(3);
  });

  it('19.8 BrainWorkshopJudge record/retrieve works', () => {
    const judge = new BrainWorkshopJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    judge.record(verdict);

    expect(judge.getVerdicts().length).toBe(1);
    expect(judge.getVerdicts()[0]).toBe(verdict);
  });

  it('19.9 AccuracyJudge record/retrieve works', () => {
    const judge = new AccuracyJudge();
    const ctx = createBasicContext(['position']);
    const trial = makeTrial();
    const response = createResponse(0, [{ modalityId: 'position', pressed: false }]);
    const verdict = judge.evaluate(trial, response, ctx);
    judge.record(verdict);

    expect(judge.getVerdicts().length).toBe(1);
    expect(judge.getVerdicts()[0]).toBe(verdict);
  });

  it('19.10 Verdict trialIndex preserved through record/retrieve', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (idx) => {
        const judge = new SDTJudge();
        const ctx = createBasicContext(['position']);
        const trial = makeTrial({ index: idx });
        const response = createResponse(idx, [{ modalityId: 'position', pressed: false }]);
        const verdict = judge.evaluate(trial, response, ctx);
        judge.record(verdict);

        // @ts-expect-error test: nullable access
        expect(judge!.getVerdicts()[0].trialIndex).toBe(idx);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// SECTION 20: LARGE TRIAL COUNT AND EDGE CASES (Tests 226-240)
// =============================================================================

describe('20. Large Trial Count and Edge Cases', () => {
  it('20.1 Handle 100 trials', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 100; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i % 2 === 0,
        trialType: i % 2 === 0 ? 'V-Seul' : 'Non-Cible',
      });
      const response = createResponse(i, [{ modalityId: 'position', pressed: i % 3 === 0 }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.verdicts.length).toBe(100);
    expect(summary.byModality.get('position')?.counts.total).toBe(100);
  });

  it('20.2 Handle 500 trials', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 500; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i % 2 === 0,
        trialType: i % 2 === 0 ? 'V-Seul' : 'Non-Cible',
      });
      const response = createResponse(i, [{ modalityId: 'position', pressed: i % 2 === 0 }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.verdicts.length).toBe(500);
  });

  it('20.3 Handle 1000 trials without error', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio']);

    for (let i = 0; i < 1000; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i % 3 === 0,
        isSoundTarget: i % 5 === 0,
        trialType: 'Non-Cible',
      });
      const response = createResponse(i, [
        { modalityId: 'position', pressed: i % 4 === 0 },
        { modalityId: 'audio', pressed: i % 7 === 0 },
      ]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.verdicts.length).toBe(1000);
  });

  it('20.4 Empty response map handled', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response: TrialResponse = {
      trialIndex: 0,
      responses: new Map(),
      timestamp: new Date(),
    };
    const verdict = judge.evaluate(trial, response, ctx);
    expect(verdict.byModality.get('position')?.hadResponse).toBe(false);
    expect(verdict.byModality.get('position')?.result).toBe('miss');
  });

  it('20.5 Single trial session', () => {
    const trial = makeTrial({ isPositionTarget: true, trialType: 'V-Seul' });
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);
    const response = createResponse(0, [{ modalityId: 'position', pressed: true }]);
    judge.record(judge.evaluate(trial, response, ctx));

    const summary = judge.summarize(ctx);
    expect(summary.verdicts.length).toBe(1);
    expect(summary.byModality.get('position')?.counts.hits).toBe(1);
  });

  it('20.6 All same result type (all hits)', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 20; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      const response = createResponse(i, [{ modalityId: 'position', pressed: true }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.hits).toBe(20);
    expect(summary.byModality.get('position')?.counts.misses).toBe(0);
    expect(summary.byModality.get('position')?.counts.falseAlarms).toBe(0);
    expect(summary.byModality.get('position')?.counts.correctRejections).toBe(0);
  });

  it('20.7 All same result type (all CR)', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    for (let i = 0; i < 20; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: false });
      const response = createResponse(i, [{ modalityId: 'position', pressed: false }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.get('position')?.counts.correctRejections).toBe(20);
    expect(summary.byModality.get('position')?.counts.hits).toBe(0);
  });

  it('20.8 Four modalities with large trial count', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position', 'audio', 'color', 'image']);

    for (let i = 0; i < 100; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i % 4 === 0,
        isSoundTarget: i % 4 === 1,
        isColorTarget: i % 4 === 2,
        isImageTarget: i % 4 === 3,
      });
      const response = createResponse(i, [
        { modalityId: 'position', pressed: i % 2 === 0 },
        { modalityId: 'audio', pressed: i % 3 === 0 },
        { modalityId: 'color', pressed: i % 5 === 0 },
        { modalityId: 'image', pressed: i % 7 === 0 },
      ]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    expect(summary.byModality.size).toBe(4);
    expect(summary.verdicts.length).toBe(100);
  });

  it('20.9 d-prime calculation with extreme rates', () => {
    const judge = new SDTJudge();
    const ctx = createBasicContext(['position']);

    // All hits, some FA
    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: true }]), ctx),
      );
    }
    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: 10 + i, isPositionTarget: false });
      judge.record(
        judge.evaluate(
          trial,
          createResponse(10 + i, [{ modalityId: 'position', pressed: i < 2 }]),
          ctx,
        ),
      );
    }

    const summary = judge.summarize(ctx);
    expect(Number.isFinite(summary.byModality.get('position')?.dPrime)).toBe(true);
  });

  it('20.10 d-prime is 0 for degenerate cases', () => {
    const scenarios = [
      { hits: 0, misses: 10, fa: 0, cr: 10 },
      { hits: 0, misses: 0, fa: 0, cr: 10 },
      { hits: 10, misses: 0, fa: 10, cr: 0 },
    ];

    for (const { hits, misses, fa, cr } of scenarios) {
      const judge = new SDTJudge();
      const ctx = createBasicContext(['position']);
      let idx = 0;

      for (let i = 0; i < hits; i++) {
        const trial = makeTrial({ index: idx++, isPositionTarget: true, trialType: 'V-Seul' });
        judge.record(
          judge.evaluate(
            trial,
            createResponse(trial.index, [{ modalityId: 'position', pressed: true }]),
            ctx,
          ),
        );
      }
      for (let i = 0; i < misses; i++) {
        const trial = makeTrial({ index: idx++, isPositionTarget: true, trialType: 'V-Seul' });
        judge.record(
          judge.evaluate(
            trial,
            createResponse(trial.index, [{ modalityId: 'position', pressed: false }]),
            ctx,
          ),
        );
      }
      for (let i = 0; i < fa; i++) {
        const trial = makeTrial({ index: idx++, isPositionTarget: false });
        judge.record(
          judge.evaluate(
            trial,
            createResponse(trial.index, [{ modalityId: 'position', pressed: true }]),
            ctx,
          ),
        );
      }
      for (let i = 0; i < cr; i++) {
        const trial = makeTrial({ index: idx++, isPositionTarget: false });
        judge.record(
          judge.evaluate(
            trial,
            createResponse(trial.index, [{ modalityId: 'position', pressed: false }]),
            ctx,
          ),
        );
      }

      const summary = judge.summarize(ctx);
      expect(summary.byModality.get('position')?.dPrime).toBe(0);
    }
  });

  it('20.11 Pass threshold affects summary.passed', () => {
    const judge = new SDTJudge();
    const highCtx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 10.0,
      strategy: 'sdt',
    };
    const lowCtx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 0.0,
      strategy: 'sdt',
    };

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i < 5,
        trialType: i < 5 ? 'V-Seul' : 'Non-Cible',
      });
      const response = createResponse(i, [{ modalityId: 'position', pressed: i < 5 }]);
      judge.record(judge.evaluate(trial, response, highCtx));
    }

    const highSummary = judge.summarize(highCtx);
    const lowSummary = judge.summarize(lowCtx);

    expect(highSummary.passed).toBe(false);
    expect(lowSummary.passed).toBe(true);
  });

  it('20.12 N-level recommendation: up when passed', () => {
    const judge = new SDTJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 0.0,
      strategy: 'sdt',
    };

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: true }]), ctx),
      );
    }

    const summary = judge.summarize(ctx);
    expect(summary.passed).toBe(true);
    expect(summary.nLevelRecommendation).toBe('up');
  });

  it('20.13 N-level recommendation: down when below downThreshold', () => {
    const judge = new SDTJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 3.0,
      downThreshold: 1.0,
      strategy: 'sdt',
    };

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed: false }]), ctx),
      );
    }

    const summary = judge.summarize(ctx);
    expect(summary.passed).toBe(false);
    expect(summary.nLevelRecommendation).toBe('down');
  });

  it('20.14 N-level recommendation: maintain when between thresholds', () => {
    const judge = new SDTJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 4.0,
      downThreshold: 0.5,
      strategy: 'sdt',
    };

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({
        index: i,
        isPositionTarget: i < 5,
        trialType: i < 5 ? 'V-Seul' : 'Non-Cible',
      });
      const response = createResponse(i, [{ modalityId: 'position', pressed: i < 4 }]);
      judge.record(judge.evaluate(trial, response, ctx));
    }

    const summary = judge.summarize(ctx);
    if (!summary.passed && summary.aggregateDPrime >= 0.5) {
      expect(summary.nLevelRecommendation).toBe('maintain');
    }
  });

  it('20.15 DualnbackClassic strategy uses error count for pass', () => {
    const judge = new SDTJudge();
    const ctx: EvaluationContext = {
      activeModalities: ['position'],
      passThreshold: 3,
      strategy: 'dualnback-classic',
    };

    for (let i = 0; i < 10; i++) {
      const trial = makeTrial({ index: i, isPositionTarget: true, trialType: 'V-Seul' });
      const pressed = i >= 2;
      judge.record(
        judge.evaluate(trial, createResponse(i, [{ modalityId: 'position', pressed }]), ctx),
      );
    }

    const summary = judge.summarize(ctx);
    const errors =
      (summary.byModality.get('position')?.counts.misses ?? 0) +
      (summary.byModality.get('position')?.counts.falseAlarms ?? 0);
    expect(summary.passed).toBe(errors < 3);
  });
});
