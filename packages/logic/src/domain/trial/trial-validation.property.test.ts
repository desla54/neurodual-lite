/**
 * Property-Based Tests for Trial Input Validation and Response Handling
 *
 * Uses fast-check to verify invariants across the trial validation system.
 * Tests cover input validation, response timing, correctness calculation,
 * SDT classification (hit/miss/FA/CR), edge cases, and modality-specific behavior.
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type {
  Color,
  ImageShape,
  LureType,
  ModalityId,
  Position,
  Sound,
  Trial,
  TrialInput,
  TrialResult,
} from '../types';
import { TrialVO } from '../trial-vo';
import { TIMING_MIN_VALID_RT_MS, TIMING_INTERVAL_DEFAULT_MS } from '../../specs/thresholds';

// =============================================================================
// ARBITRARIES (Generators)
// =============================================================================

// Primitive value generators
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
const imageArb: fc.Arbitrary<ImageShape> = fc.constantFrom(
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
);
const lureTypeArb: fc.Arbitrary<LureType> = fc.constantFrom('n-1', 'n+1', 'sequence');
const modalityIdArb: fc.Arbitrary<ModalityId> = fc.constantFrom('position', 'audio', 'color');

// Reaction time generators
const validReactionTimeArb: fc.Arbitrary<number> = fc.integer({
  min: TIMING_MIN_VALID_RT_MS,
  max: TIMING_INTERVAL_DEFAULT_MS,
});
const earlyReactionTimeArb: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: TIMING_MIN_VALID_RT_MS - 1,
});
const lateReactionTimeArb: fc.Arbitrary<number> = fc.integer({
  min: TIMING_INTERVAL_DEFAULT_MS + 1,
  max: 10000,
});
const anyReactionTimeArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 10000 });

// Trial type helper
function deriveTrialType(
  positionTarget: boolean,
  audioTarget: boolean,
): 'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible' {
  if (positionTarget && audioTarget) return 'Dual';
  if (positionTarget) return 'V-Seul';
  if (audioTarget) return 'A-Seul';
  return 'Non-Cible';
}

// Full Trial arbitrary
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
    isColorTarget: fc.option(fc.boolean(), { nil: undefined }),
    isImageTarget: fc.option(fc.boolean(), { nil: undefined }),
    isPositionLure: fc.option(fc.boolean(), { nil: undefined }),
    isSoundLure: fc.option(fc.boolean(), { nil: undefined }),
    isColorLure: fc.option(fc.boolean(), { nil: undefined }),
    isImageLure: fc.option(fc.boolean(), { nil: undefined }),
    positionLureType: fc.option(lureTypeArb, { nil: undefined }),
    soundLureType: fc.option(lureTypeArb, { nil: undefined }),
    colorLureType: fc.option(lureTypeArb, { nil: undefined }),
    imageLureType: fc.option(lureTypeArb, { nil: undefined }),
  })
  .map((props) => ({
    ...props,
    trialType: deriveTrialType(props.isPositionTarget, props.isSoundTarget),
  })) as fc.Arbitrary<Trial>;

// Non-buffer trial (for scoring)
const nonBufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((trial) => ({
  ...trial,
  isBuffer: false,
}));

// Buffer trial
const bufferTrialArb: fc.Arbitrary<Trial> = trialArb.map((trial) => ({
  ...trial,
  isBuffer: true,
}));

// Trial with specific target configuration
function targetTrialArb(posTarget: boolean, audioTarget: boolean): fc.Arbitrary<Trial> {
  return trialArb.map((trial) => ({
    ...trial,
    isBuffer: false,
    isPositionTarget: posTarget,
    isSoundTarget: audioTarget,
    trialType: deriveTrialType(posTarget, audioTarget),
  }));
}

// Trial with color target enabled
function colorTrialArb(colorTarget: boolean): fc.Arbitrary<Trial> {
  return trialArb.map((trial) => ({
    ...trial,
    isBuffer: false,
    isColorTarget: colorTarget,
  }));
}

// TrialInput arbitrary
const trialInputArb: fc.Arbitrary<TrialInput> = fc.record({
  position: fc.option(fc.boolean(), { nil: undefined }),
  positionRT: fc.option(validReactionTimeArb, { nil: undefined }),
  audio: fc.option(fc.boolean(), { nil: undefined }),
  audioRT: fc.option(validReactionTimeArb, { nil: undefined }),
  color: fc.option(fc.boolean(), { nil: undefined }),
  colorRT: fc.option(validReactionTimeArb, { nil: undefined }),
});

// TrialInput with specific response configuration
function responseInputArb(posResponse: boolean, audioResponse: boolean): fc.Arbitrary<TrialInput> {
  return fc.record({
    position: fc.constant(posResponse),
    positionRT: posResponse
      ? fc.option(validReactionTimeArb, { nil: undefined })
      : fc.constant(undefined),
    audio: fc.constant(audioResponse),
    audioRT: audioResponse
      ? fc.option(validReactionTimeArb, { nil: undefined })
      : fc.constant(undefined),
    color: fc.constant(false),
    colorRT: fc.constant(undefined),
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createTrial(overrides: Partial<Trial> = {}): Trial {
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

function createTrialInput(overrides: Partial<TrialInput> = {}): TrialInput {
  return {
    position: false,
    audio: false,
    color: false,
    positionRT: undefined,
    audioRT: undefined,
    colorRT: undefined,
    ...overrides,
  };
}

// =============================================================================
// 1. INPUT VALIDATION INVARIANTS (10 tests)
// =============================================================================

describe('1. Input Validation Invariants', () => {
  it('1.1 Valid trials always produce a verdict', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const vo = TrialVO.from(trial);
        const verdict = vo.evaluate(input);
        return verdict !== undefined && verdict !== null;
      }),
      { numRuns: 200 },
    );
  });

  it('1.2 Verdict always contains position and audio modality verdicts', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.position !== undefined && verdict.audio !== undefined;
      }),
      { numRuns: 200 },
    );
  });

  it('1.3 Undefined input is treated as no responses', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return (
          verdict.position.responded === false &&
          verdict.audio.responded === false &&
          verdict.position.reactionTimeMs === null &&
          verdict.audio.reactionTimeMs === null
        );
      }),
      { numRuns: 200 },
    );
  });

  it('1.4 Trial index is preserved in verdict', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (index) => {
        const trial = createTrial({ index });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.trialIndex === index;
      }),
      { numRuns: 200 },
    );
  });

  it('1.5 Modality verdict always contains modality identifier', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.position.modality === 'position' && verdict.audio.modality === 'audio';
      }),
      { numRuns: 200 },
    );
  });

  it('1.6 Result is always one of the four SDT categories', () => {
    const validResults: TrialResult[] = ['hit', 'miss', 'falseAlarm', 'correctRejection'];
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          validResults.includes(verdict.position.result) &&
          validResults.includes(verdict.audio.result)
        );
      }),
      { numRuns: 200 },
    );
  });

  it('1.7 Boolean isTarget matches trial target flag', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posTarget, audioTarget) => {
        const trial = createTrial({
          isPositionTarget: posTarget,
          isSoundTarget: audioTarget,
        });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.position.isTarget === posTarget && verdict.audio.isTarget === audioTarget;
      }),
      { numRuns: 200 },
    );
  });

  it('1.8 Boolean responded matches input response', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posResp, audioResp) => {
        const input = createTrialInput({
          position: posResp,
          audio: audioResp,
        });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        return verdict.position.responded === posResp && verdict.audio.responded === audioResp;
      }),
      { numRuns: 200 },
    );
  });

  it('1.9 Buffer trials still produce valid verdicts', () => {
    fc.assert(
      fc.property(bufferTrialArb, trialInputArb, (trial, input) => {
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          verdict !== undefined &&
          verdict.position !== undefined &&
          verdict.audio !== undefined &&
          typeof verdict.isFullyCorrect === 'boolean'
        );
      }),
      { numRuns: 100 },
    );
  });

  it('1.10 Verdict structure is deterministic (same input = same verdict)', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const vo = TrialVO.from(trial);
        const v1 = vo.evaluate(input);
        const v2 = vo.evaluate(input);
        return (
          v1.position.result === v2.position.result &&
          v1.audio.result === v2.audio.result &&
          v1.isFullyCorrect === v2.isFullyCorrect
        );
      }),
      { numRuns: 200 },
    );
  });
});

// =============================================================================
// 2. RESPONSE TIMING PROPERTIES (10 tests)
// =============================================================================

describe('2. Response Timing Properties', () => {
  it('2.1 RT is recorded when response is true', () => {
    fc.assert(
      fc.property(validReactionTimeArb, (rt) => {
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        return verdict.position.reactionTimeMs === rt;
      }),
      { numRuns: 200 },
    );
  });

  it('2.2 RT is null when no response', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const input = createTrialInput({ position: false, positionRT: undefined });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.position.reactionTimeMs === null;
      }),
      { numRuns: 200 },
    );
  });

  it('2.3 Zero RT is valid and recorded', () => {
    const input = createTrialInput({ position: true, positionRT: 0 });
    const verdict = TrialVO.from(createTrial()).evaluate(input);
    expect(verdict.position.reactionTimeMs).toBe(0);
  });

  it('2.4 Very fast RT (< MIN_VALID_RT) is still recorded', () => {
    fc.assert(
      fc.property(earlyReactionTimeArb, (rt) => {
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        // The system records all RTs - validation is done elsewhere
        return verdict.position.reactionTimeMs === rt;
      }),
      { numRuns: 100 },
    );
  });

  it('2.5 Very slow RT (> interval) is still recorded', () => {
    fc.assert(
      fc.property(lateReactionTimeArb, (rt) => {
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        // Late responses are still recorded
        return verdict.position.reactionTimeMs === rt;
      }),
      { numRuns: 100 },
    );
  });

  it('2.6 RT for each modality is independent', () => {
    fc.assert(
      fc.property(validReactionTimeArb, validReactionTimeArb, (rtPos, rtAudio) => {
        const input = createTrialInput({
          position: true,
          positionRT: rtPos,
          audio: true,
          audioRT: rtAudio,
        });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        return (
          verdict.position.reactionTimeMs === rtPos && verdict.audio.reactionTimeMs === rtAudio
        );
      }),
      { numRuns: 200 },
    );
  });

  it('2.7 Response true without RT results in null RT', () => {
    const input = createTrialInput({ position: true, positionRT: undefined });
    const verdict = TrialVO.from(createTrial()).evaluate(input);
    expect(verdict.position.reactionTimeMs).toBeNull();
  });

  it('2.8 RT is preserved regardless of target status', () => {
    fc.assert(
      fc.property(fc.boolean(), validReactionTimeArb, (isTarget, rt) => {
        const trial = createTrial({ isPositionTarget: isTarget });
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.position.reactionTimeMs === rt;
      }),
      { numRuns: 200 },
    );
  });

  it('2.9 Negative RT is recorded (edge case)', () => {
    const input = createTrialInput({ position: true, positionRT: -100 });
    const verdict = TrialVO.from(createTrial()).evaluate(input);
    // Negative RTs are unusual but recorded - validation elsewhere
    expect(verdict.position.reactionTimeMs).toBe(-100);
  });

  it('2.10 Maximum integer RT is handled', () => {
    const maxRT = Number.MAX_SAFE_INTEGER;
    const input = createTrialInput({ position: true, positionRT: maxRT });
    const verdict = TrialVO.from(createTrial()).evaluate(input);
    expect(verdict.position.reactionTimeMs).toBe(maxRT);
  });
});

// =============================================================================
// 3. RESPONSE CORRECTNESS CALCULATION (10 tests)
// =============================================================================

describe('3. Response Correctness Calculation', () => {
  it('3.1 isFullyCorrect is true only when all modalities are correct', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (posTarget, audioTarget, posResp, audioResp) => {
          const trial = createTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
          });
          const input = createTrialInput({
            position: posResp,
            audio: audioResp,
          });
          const verdict = TrialVO.from(trial).evaluate(input);

          const posCorrect = posTarget === posResp;
          const audioCorrect = audioTarget === audioResp;
          return verdict.isFullyCorrect === (posCorrect && audioCorrect);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('3.2 Any miss makes isFullyCorrect false', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        // Respond to only one target
        const input = createTrialInput({ position: true, audio: false });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === false;
      }),
      { numRuns: 100 },
    );
  });

  it('3.3 Any false alarm makes isFullyCorrect false', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        // Respond when no targets
        const input = createTrialInput({ position: true, audio: false });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === false;
      }),
      { numRuns: 100 },
    );
  });

  it('3.4 All hits = isFullyCorrect true', () => {
    fc.assert(
      fc.property(validReactionTimeArb, validReactionTimeArb, (rt1, rt2) => {
        // Create a trial with only position and audio targets (no color)
        const trial = createTrial({
          isPositionTarget: true,
          isSoundTarget: true,
          trialType: 'Dual',
          isColorTarget: undefined, // Explicitly no color modality
        });
        const input = createTrialInput({
          position: true,
          positionRT: rt1,
          audio: true,
          audioRT: rt2,
        });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === true;
      }),
      { numRuns: 100 },
    );
  });

  it('3.5 All correct rejections = isFullyCorrect true', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100 }), (index) => {
        // Create a trial with no targets and no color modality
        const trial = createTrial({
          index,
          isPositionTarget: false,
          isSoundTarget: false,
          trialType: 'Non-Cible',
          isColorTarget: undefined, // Explicitly no color modality
        });
        const input = createTrialInput({ position: false, audio: false });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === true;
      }),
      { numRuns: 100 },
    );
  });

  it('3.6 Mixed hit and CR = isFullyCorrect true', () => {
    fc.assert(
      fc.property(validReactionTimeArb, (rt) => {
        // Create a trial with position target but no audio target, and no color modality
        const trial = createTrial({
          isPositionTarget: true,
          isSoundTarget: false,
          trialType: 'V-Seul',
          isColorTarget: undefined, // Explicitly no color modality
        });
        const input = createTrialInput({
          position: true,
          positionRT: rt,
          audio: false,
        });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === true;
      }),
      { numRuns: 100 },
    );
  });

  it('3.7 Color modality included when isColorTarget is defined', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (colorTarget, colorResp) => {
        const trial = createTrial({ isColorTarget: colorTarget });
        const input = createTrialInput({ color: colorResp });
        const verdict = TrialVO.from(trial).evaluate(input);

        if (verdict.color === null) {
          // Color modality not active (isColorTarget undefined)
          return true;
        }

        // When color is active, check correctness
        const colorCorrect = colorTarget === colorResp;
        const othersCorrect =
          verdict.position.result === 'correctRejection' &&
          verdict.audio.result === 'correctRejection';
        return verdict.isFullyCorrect === (colorCorrect && othersCorrect);
      }),
      { numRuns: 100 },
    );
  });

  it('3.8 Correctness independent of RT value', () => {
    fc.assert(
      fc.property(anyReactionTimeArb, (rt) => {
        const trial = createTrial({ isPositionTarget: true });
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(trial).evaluate(input);
        // RT value does not affect correctness determination
        return verdict.position.result === 'hit';
      }),
      { numRuns: 100 },
    );
  });

  it('3.9 Correctness independent of trial index', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10000 }), fc.boolean(), (index, isTarget) => {
        const trial = createTrial({ index, isPositionTarget: isTarget });
        const input = createTrialInput({ position: isTarget });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.isFullyCorrect === true;
      }),
      { numRuns: 100 },
    );
  });

  it('3.10 Correctness symmetric for all (target, response) combinations', () => {
    const combinations: Array<{ target: boolean; response: boolean; expectedCorrect: boolean }> = [
      { target: true, response: true, expectedCorrect: true },
      { target: true, response: false, expectedCorrect: false },
      { target: false, response: true, expectedCorrect: false },
      { target: false, response: false, expectedCorrect: true },
    ];

    for (const { target, response, expectedCorrect } of combinations) {
      const trial = createTrial({
        isPositionTarget: target,
        isSoundTarget: target,
      });
      const input = createTrialInput({
        position: response,
        audio: response,
      });
      const verdict = TrialVO.from(trial).evaluate(input);
      expect(verdict.isFullyCorrect).toBe(expectedCorrect);
    }
  });
});

// =============================================================================
// 4. HIT/MISS/FA/CR CLASSIFICATION (10 tests)
// =============================================================================

describe('4. SDT Classification (Hit/Miss/FA/CR)', () => {
  it('4.1 Hit: target AND response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), validReactionTimeArb, (trial, rt) => {
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          verdict.position.result === 'hit' &&
          verdict.position.isTarget === true &&
          verdict.position.responded === true
        );
      }),
      { numRuns: 100 },
    );
  });

  it('4.2 Miss: target AND NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(true, false), (trial) => {
        const input = createTrialInput({ position: false });
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          verdict.position.result === 'miss' &&
          verdict.position.isTarget === true &&
          verdict.position.responded === false
        );
      }),
      { numRuns: 100 },
    );
  });

  it('4.3 False Alarm: NO target AND response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), validReactionTimeArb, (trial, rt) => {
        const input = createTrialInput({ position: true, positionRT: rt });
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          verdict.position.result === 'falseAlarm' &&
          verdict.position.isTarget === false &&
          verdict.position.responded === true
        );
      }),
      { numRuns: 100 },
    );
  });

  it('4.4 Correct Rejection: NO target AND NO response', () => {
    fc.assert(
      fc.property(targetTrialArb(false, false), (trial) => {
        const input = createTrialInput({ position: false });
        const verdict = TrialVO.from(trial).evaluate(input);
        return (
          verdict.position.result === 'correctRejection' &&
          verdict.position.isTarget === false &&
          verdict.position.responded === false
        );
      }),
      { numRuns: 100 },
    );
  });

  it('4.5 Classification is mutually exclusive', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const verdict = TrialVO.from(trial).evaluate(input);
        const results = [
          verdict.position.result === 'hit',
          verdict.position.result === 'miss',
          verdict.position.result === 'falseAlarm',
          verdict.position.result === 'correctRejection',
        ];
        // Exactly one should be true
        return results.filter(Boolean).length === 1;
      }),
      { numRuns: 200 },
    );
  });

  it('4.6 Classification is exhaustive (covers all cases)', () => {
    const allCases: Array<{ isTarget: boolean; responded: boolean; expected: TrialResult }> = [
      { isTarget: true, responded: true, expected: 'hit' },
      { isTarget: true, responded: false, expected: 'miss' },
      { isTarget: false, responded: true, expected: 'falseAlarm' },
      { isTarget: false, responded: false, expected: 'correctRejection' },
    ];

    for (const { isTarget, responded, expected } of allCases) {
      const trial = createTrial({ isPositionTarget: isTarget });
      const input = createTrialInput({ position: responded });
      const verdict = TrialVO.from(trial).evaluate(input);
      expect(verdict.position.result).toBe(expected);
    }
  });

  it('4.7 Multi-modality: each modality classified independently', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (posTarget, audioTarget, posResp, audioResp) => {
          const trial = createTrial({
            isPositionTarget: posTarget,
            isSoundTarget: audioTarget,
          });
          const input = createTrialInput({
            position: posResp,
            audio: audioResp,
          });
          const verdict = TrialVO.from(trial).evaluate(input);

          // Check position classification
          const expectedPosResult: TrialResult = posTarget
            ? posResp
              ? 'hit'
              : 'miss'
            : posResp
              ? 'falseAlarm'
              : 'correctRejection';

          // Check audio classification
          const expectedAudioResult: TrialResult = audioTarget
            ? audioResp
              ? 'hit'
              : 'miss'
            : audioResp
              ? 'falseAlarm'
              : 'correctRejection';

          return (
            verdict.position.result === expectedPosResult &&
            verdict.audio.result === expectedAudioResult
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('4.8 Hit requires both target flag and response', () => {
    // Without target, pressing = FA
    const trial1 = createTrial({ isPositionTarget: false });
    const verdict1 = TrialVO.from(trial1).evaluate(createTrialInput({ position: true }));
    expect(verdict1.position.result).not.toBe('hit');

    // Without response, target = miss
    const trial2 = createTrial({ isPositionTarget: true });
    const verdict2 = TrialVO.from(trial2).evaluate(createTrialInput({ position: false }));
    expect(verdict2.position.result).not.toBe('hit');
  });

  it('4.9 Miss requires target flag without response', () => {
    // With response, target = hit
    const trial1 = createTrial({ isPositionTarget: true });
    const verdict1 = TrialVO.from(trial1).evaluate(createTrialInput({ position: true }));
    expect(verdict1.position.result).not.toBe('miss');

    // Without target, no response = CR
    const trial2 = createTrial({ isPositionTarget: false });
    const verdict2 = TrialVO.from(trial2).evaluate(createTrialInput({ position: false }));
    expect(verdict2.position.result).not.toBe('miss');
  });

  it('4.10 Classification deterministic across multiple evaluations', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, trialInputArb, (trial, input) => {
        const vo = TrialVO.from(trial);
        const results = Array.from({ length: 10 }, () => vo.evaluate(input));
        const firstResult = results[0]!.position.result;
        return results.every((r) => r.position.result === firstResult);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 5. EDGE CASES (10 tests)
// =============================================================================

describe('5. Edge Cases', () => {
  it('5.1 Timeout (no response on target) = miss', () => {
    fc.assert(
      fc.property(targetTrialArb(true, true), (trial) => {
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.position.result === 'miss' && verdict.audio.result === 'miss';
      }),
      { numRuns: 100 },
    );
  });

  it('5.2 Early response (RT = 0) is recorded', () => {
    const input = createTrialInput({ position: true, positionRT: 0 });
    const trial = createTrial({ isPositionTarget: true });
    const verdict = TrialVO.from(trial).evaluate(input);
    expect(verdict.position.result).toBe('hit');
    expect(verdict.position.reactionTimeMs).toBe(0);
  });

  it('5.3 Very late response still counts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 100000 }), (lateRT) => {
        const input = createTrialInput({ position: true, positionRT: lateRT });
        const trial = createTrial({ isPositionTarget: true });
        const verdict = TrialVO.from(trial).evaluate(input);
        return verdict.position.result === 'hit' && verdict.position.reactionTimeMs === lateRT;
      }),
      { numRuns: 50 },
    );
  });

  it('5.4 Trial index = 0 (first trial) handled correctly', () => {
    const trial = createTrial({ index: 0, isPositionTarget: true });
    const input = createTrialInput({ position: true, positionRT: 500 });
    const verdict = TrialVO.from(trial).evaluate(input);
    expect(verdict.trialIndex).toBe(0);
    expect(verdict.position.result).toBe('hit');
  });

  it('5.5 Very high trial index handled correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 1000000 }), (index) => {
        const trial = createTrial({ index });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.trialIndex === index;
      }),
      { numRuns: 50 },
    );
  });

  it('5.6 All positions (0-7) are valid', () => {
    for (let pos = 0; pos <= 7; pos++) {
      const trial = createTrial({ position: pos as Position });
      const verdict = TrialVO.from(trial).evaluate(undefined);
      expect(verdict).toBeDefined();
    }
  });

  it('5.7 All sounds are valid', () => {
    const sounds: Sound[] = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
    for (const sound of sounds) {
      const trial = createTrial({ sound });
      const verdict = TrialVO.from(trial).evaluate(undefined);
      expect(verdict).toBeDefined();
    }
  });

  it('5.8 All colors are valid', () => {
    const colors: Color[] = [
      'ink-black',
      'ink-navy',
      'ink-burgundy',
      'ink-forest',
      'ink-burnt',
      'ink-plum',
      'ink-teal',
      'ink-mustard',
    ];
    for (const color of colors) {
      const trial = createTrial({ color });
      const verdict = TrialVO.from(trial).evaluate(undefined);
      expect(verdict).toBeDefined();
    }
  });

  it('5.9 Response without RT (RT undefined) is valid', () => {
    const input = createTrialInput({ position: true, positionRT: undefined });
    const trial = createTrial({ isPositionTarget: true });
    const verdict = TrialVO.from(trial).evaluate(input);
    expect(verdict.position.result).toBe('hit');
    expect(verdict.position.reactionTimeMs).toBeNull();
  });

  it('5.10 Empty input object treated as no responses', () => {
    const input: TrialInput = {};
    const trial = createTrial({ isPositionTarget: true });
    const verdict = TrialVO.from(trial).evaluate(input);
    expect(verdict.position.result).toBe('miss');
    expect(verdict.position.responded).toBe(false);
  });
});

// =============================================================================
// 6. MODALITY-SPECIFIC VALIDATION (10 tests)
// =============================================================================

describe('6. Modality-Specific Validation', () => {
  it('6.1 Position modality: isPositionTarget controls target flag', () => {
    fc.assert(
      fc.property(fc.boolean(), (isTarget) => {
        const trial = createTrial({ isPositionTarget: isTarget });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.position.isTarget === isTarget;
      }),
      { numRuns: 100 },
    );
  });

  it('6.2 Audio modality: isSoundTarget controls target flag', () => {
    fc.assert(
      fc.property(fc.boolean(), (isTarget) => {
        const trial = createTrial({ isSoundTarget: isTarget });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.audio.isTarget === isTarget;
      }),
      { numRuns: 100 },
    );
  });

  it('6.3 Color modality: included only when isColorTarget is defined', () => {
    const trialWithColor = createTrial({ isColorTarget: true });
    const trialWithoutColor = createTrial({ isColorTarget: undefined });

    const verdictWith = TrialVO.from(trialWithColor).evaluate(undefined);
    const verdictWithout = TrialVO.from(trialWithoutColor).evaluate(undefined);

    expect(verdictWith.color).not.toBeNull();
    expect(verdictWithout.color).toBeNull();
  });

  it('6.4 Lure flag propagated to verdict', () => {
    fc.assert(
      fc.property(fc.boolean(), (isLure) => {
        const trial = createTrial({ isPositionLure: isLure });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.position.isLure === (isLure ?? false);
      }),
      { numRuns: 100 },
    );
  });

  it('6.5 Lure type propagated to verdict', () => {
    fc.assert(
      fc.property(lureTypeArb, (lureType) => {
        const trial = createTrial({ positionLureType: lureType, isPositionLure: true });
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return verdict.position.lureType === lureType;
      }),
      { numRuns: 100 },
    );
  });

  it('6.6 Lure type is null when no lure', () => {
    const trial = createTrial({ isPositionLure: false, positionLureType: undefined });
    const verdict = TrialVO.from(trial).evaluate(undefined);
    expect(verdict.position.lureType).toBeNull();
  });

  it('6.7 Position and audio modalities are always evaluated', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const verdict = TrialVO.from(trial).evaluate(undefined);
        return (
          verdict.position !== undefined &&
          verdict.audio !== undefined &&
          verdict.position.modality === 'position' &&
          verdict.audio.modality === 'audio'
        );
      }),
      { numRuns: 100 },
    );
  });

  it('6.8 Color modality correctness independent of position/audio', () => {
    const trial = createTrial({
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: true,
    });
    const input = createTrialInput({
      position: true,
      audio: true,
      color: false, // Miss on color
    });
    const verdict = TrialVO.from(trial).evaluate(input);

    expect(verdict.position.result).toBe('hit');
    expect(verdict.audio.result).toBe('hit');
    expect(verdict.color?.result).toBe('miss');
    expect(verdict.isFullyCorrect).toBe(false);
  });

  it('6.9 Each modality RT tracked separately', () => {
    fc.assert(
      fc.property(validReactionTimeArb, validReactionTimeArb, (rtPos, rtAudio) => {
        fc.pre(rtPos !== rtAudio); // Ensure different RTs
        const input = createTrialInput({
          position: true,
          positionRT: rtPos,
          audio: true,
          audioRT: rtAudio,
        });
        const verdict = TrialVO.from(createTrial()).evaluate(input);
        return (
          verdict.position.reactionTimeMs === rtPos && verdict.audio.reactionTimeMs === rtAudio
        );
      }),
      { numRuns: 100 },
    );
  });

  it('6.10 Modality response independent of stimulus value', () => {
    fc.assert(
      fc.property(positionArb, soundArb, (pos, sound) => {
        const trial = createTrial({
          position: pos,
          sound: sound,
          isPositionTarget: true,
          isSoundTarget: true,
        });
        const input = createTrialInput({
          position: true,
          audio: true,
        });
        const verdict = TrialVO.from(trial).evaluate(input);
        // Result depends on target/response, not stimulus value
        return verdict.position.result === 'hit' && verdict.audio.result === 'hit';
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 7. ADDITIONAL PROPERTY TESTS (bonus 10 tests for comprehensive coverage)
// =============================================================================

describe('7. Additional Property Tests', () => {
  it('7.1 TrialVO.from() creates valid instance', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const vo = TrialVO.from(trial);
        return vo instanceof TrialVO;
      }),
      { numRuns: 100 },
    );
  });

  it('7.2 TrialVO.toRaw() returns original trial', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const vo = TrialVO.from(trial);
        const raw = vo.toRaw();
        return (
          raw.index === trial.index && raw.position === trial.position && raw.sound === trial.sound
        );
      }),
      { numRuns: 100 },
    );
  });

  it('7.3 isTargetFor returns correct value for all modalities', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (posT, audioT, colorT) => {
        const trial = createTrial({
          isPositionTarget: posT,
          isSoundTarget: audioT,
          isColorTarget: colorT,
        });
        const vo = TrialVO.from(trial);
        return (
          vo.isTargetFor('position') === posT &&
          vo.isTargetFor('audio') === audioT &&
          vo.isTargetFor('color') === colorT
        );
      }),
      { numRuns: 100 },
    );
  });

  it('7.4 isDualTarget correct for all combinations', () => {
    const combinations: Array<{ pos: boolean; audio: boolean; expected: boolean }> = [
      { pos: true, audio: true, expected: true },
      { pos: true, audio: false, expected: false },
      { pos: false, audio: true, expected: false },
      { pos: false, audio: false, expected: false },
    ];

    for (const { pos, audio, expected } of combinations) {
      const trial = createTrial({ isPositionTarget: pos, isSoundTarget: audio });
      const vo = TrialVO.from(trial);
      expect(vo.isDualTarget()).toBe(expected);
    }
  });

  it('7.5 targetCount is accurate', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (posT, audioT, colorT) => {
        const trial = createTrial({
          isPositionTarget: posT,
          isSoundTarget: audioT,
          isColorTarget: colorT,
        });
        const vo = TrialVO.from(trial);
        const expected = [posT, audioT, colorT].filter(Boolean).length;
        return vo.targetCount === expected;
      }),
      { numRuns: 100 },
    );
  });

  it('7.6 isNoTarget correct', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (posT, audioT, colorT) => {
        const trial = createTrial({
          isPositionTarget: posT,
          isSoundTarget: audioT,
          isColorTarget: colorT,
        });
        const vo = TrialVO.from(trial);
        const expected = !posT && !audioT && !colorT;
        return vo.isNoTarget() === expected;
      }),
      { numRuns: 100 },
    );
  });

  it('7.7 isSingleTarget correct', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (posT, audioT, colorT) => {
        const trial = createTrial({
          isPositionTarget: posT,
          isSoundTarget: audioT,
          isColorTarget: colorT,
        });
        const vo = TrialVO.from(trial);
        const count = [posT, audioT, colorT].filter(Boolean).length;
        return vo.isSingleTarget() === (count === 1);
      }),
      { numRuns: 100 },
    );
  });

  it('7.8 isLureFor returns correct value', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (posLure, audioLure) => {
        const trial = createTrial({
          isPositionLure: posLure,
          isSoundLure: audioLure,
        });
        const vo = TrialVO.from(trial);
        return vo.isLureFor('position') === posLure && vo.isLureFor('audio') === audioLure;
      }),
      { numRuns: 100 },
    );
  });

  it('7.9 hasAnyLure returns true when any lure present', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (posL, audioL, colorL) => {
        const trial = createTrial({
          isPositionLure: posL,
          isSoundLure: audioL,
          isColorLure: colorL,
        });
        const vo = TrialVO.from(trial);
        const expected = posL || audioL || colorL;
        return vo.hasAnyLure() === expected;
      }),
      { numRuns: 100 },
    );
  });

  it('7.10 Basic accessors return correct values', () => {
    fc.assert(
      fc.property(nonBufferTrialArb, (trial) => {
        const vo = TrialVO.from(trial);
        return (
          vo.index === trial.index &&
          vo.isBuffer === trial.isBuffer &&
          vo.position === trial.position &&
          vo.sound === trial.sound &&
          vo.color === trial.color &&
          vo.trialType === trial.trialType
        );
      }),
      { numRuns: 100 },
    );
  });
});
