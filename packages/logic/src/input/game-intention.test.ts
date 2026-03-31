/**
 * Tests for game-intention.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  Intents,
  isSessionControlIntention,
  isTempoIntention,
  isArithmeticInputIntention,
  isCoachingIntention,
  isPlaceIntention,
  isMemoIntention,
  isTraceIntention,
} from './game-intention';

describe('Intents factory', () => {
  describe('session control', () => {
    it('creates START intention', () => {
      const intent = Intents.start();
      expect(intent.type).toBe('START');
    });

    it('creates STOP intention', () => {
      const intent = Intents.stop();
      expect(intent.type).toBe('STOP');
    });

    it('creates PAUSE intention', () => {
      const intent = Intents.pause();
      expect(intent.type).toBe('PAUSE');
    });

    it('creates RESUME intention', () => {
      const intent = Intents.resume();
      expect(intent.type).toBe('RESUME');
    });
  });

  describe('tempo mode', () => {
    it('creates CLAIM_MATCH intention', () => {
      const intent = Intents.claimMatch('position', 'keyboard');
      expect(intent.type).toBe('CLAIM_MATCH');
      expect(intent.modality).toBe('position');
      expect(intent.inputMethod).toBe('keyboard');
    });

    it('creates CLAIM_MATCH with options', () => {
      const intent = Intents.claimMatch('audio', 'touch', {
        capturedAtMs: 1000,
        buttonPosition: { x: 100, y: 200 },
      });
      expect(intent.capturedAtMs).toBe(1000);
      expect(intent.buttonPosition).toEqual({ x: 100, y: 200 });
    });

    it('creates RELEASE_CLAIM intention', () => {
      const intent = Intents.releaseClaim('position', 250);
      expect(intent.type).toBe('RELEASE_CLAIM');
      expect(intent.modality).toBe('position');
      expect(intent.pressDurationMs).toBe(250);
    });
  });

  describe('arithmetic input', () => {
    it('creates ARITHMETIC_INPUT with digit', () => {
      // @ts-expect-error test override
      const intent = Intents.arithmeticInput('5');
      expect(intent.type).toBe('ARITHMETIC_INPUT');
      // @ts-expect-error test override
      expect(intent.key).toBe('5');
    });

    it('creates ARITHMETIC_INPUT with backspace', () => {
      // @ts-expect-error test override
      const intent = Intents.arithmeticInput('backspace');
      // @ts-expect-error test override
      expect(intent.key).toBe('backspace');
    });

    it('creates ARITHMETIC_INPUT with enter', () => {
      // @ts-expect-error test override
      const intent = Intents.arithmeticInput('enter');
      // @ts-expect-error test override
      expect(intent.key).toBe('enter');
    });
  });

  describe('coaching', () => {
    it('creates MISFIRED_INPUT intention', () => {
      const intent = Intents.misfiredInput('x');
      expect(intent.type).toBe('MISFIRED_INPUT');
      expect(intent.key).toBe('x');
    });

    it('creates DECLARE_ENERGY intention', () => {
      const intent = Intents.declareEnergy(2);
      expect(intent.type).toBe('DECLARE_ENERGY');
      expect(intent.level).toBe(2);
    });
  });

  describe('flow/label mode', () => {
    it('creates DROP_ITEM intention', () => {
      const intent = Intents.dropItem('item-1', 3);
      expect(intent.type).toBe('DROP_ITEM');
      expect(intent.itemId).toBe('item-1');
      expect(intent.targetSlot).toBe(3);
    });

    it('creates CANCEL_DRAG intention', () => {
      const intent = Intents.cancelDrag('item-2');
      expect(intent.type).toBe('CANCEL_DRAG');
      expect(intent.itemId).toBe('item-2');
    });

    it('creates ADVANCE intention', () => {
      const intent = Intents.advance();
      expect(intent.type).toBe('ADVANCE');
    });
  });

  describe('recall mode', () => {
    it('creates SELECT_VALUE intention', () => {
      const intent = Intents.selectValue(1, 'position', 5, 'touch');
      expect(intent.type).toBe('SELECT_VALUE');
      expect(intent.slot).toBe(1);
      expect(intent.modality).toBe('position');
      expect(intent.value).toBe(5);
    });

    it('creates CONFIRM_SELECTION intention', () => {
      const intent = Intents.confirmSelection();
      expect(intent.type).toBe('CONFIRM_SELECTION');
    });
  });

  describe('trace mode', () => {
    it('creates SWIPE intention', () => {
      const intent = Intents.swipe(0, 4);
      expect(intent.type).toBe('SWIPE');
      expect(intent.fromPosition).toBe(0);
      expect(intent.toPosition).toBe(4);
    });

    it('creates TAP intention', () => {
      const intent = Intents.tap('center', 2, 'touch');
      expect(intent.type).toBe('TAP');
      expect(intent.position).toBe('center');
      expect(intent.count).toBe(2);
    });

    it('creates SKIP intention', () => {
      const intent = Intents.skip();
      expect(intent.type).toBe('SKIP');
    });

    it('creates WRITING_COMPLETE intention', () => {
      const intent = Intents.writingComplete('A', 0.95, { strokes: [] });
      expect(intent.type).toBe('WRITING_COMPLETE');
      expect(intent.recognizedLetter).toBe('A');
      expect(intent.confidence).toBe(0.95);
    });
  });
});

describe('Type guards', () => {
  describe('isSessionControlIntention', () => {
    it('returns true for session control intents', () => {
      expect(isSessionControlIntention(Intents.start())).toBe(true);
      expect(isSessionControlIntention(Intents.stop())).toBe(true);
      expect(isSessionControlIntention(Intents.pause())).toBe(true);
      expect(isSessionControlIntention(Intents.resume())).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isSessionControlIntention(Intents.claimMatch('p'))).toBe(false);
      expect(isSessionControlIntention(Intents.advance())).toBe(false);
    });
  });

  describe('isTempoIntention', () => {
    it('returns true for tempo intents', () => {
      expect(isTempoIntention(Intents.claimMatch('p'))).toBe(true);
      expect(isTempoIntention(Intents.releaseClaim('p', 100))).toBe(true);
      expect(
        isTempoIntention(
          // @ts-expect-error test override
          Intents.reportInputPipelineLatency('p', 'keyboard', {
            phase: 'stimulus',
            trialIndex: 0,
            capturedAtMs: 1000,
            dispatchCompletedAtMs: 1010,
            paintAtMs: 1030,
          }),
        ),
      ).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isTempoIntention(Intents.start())).toBe(false);
    });
  });

  describe('isArithmeticInputIntention', () => {
    it('returns true for arithmetic input', () => {
      // @ts-expect-error test override
      expect(isArithmeticInputIntention(Intents.arithmeticInput('5'))).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isArithmeticInputIntention(Intents.claimMatch('p'))).toBe(false);
    });
  });

  describe('isCoachingIntention', () => {
    it('returns true for coaching intents', () => {
      expect(isCoachingIntention(Intents.misfiredInput('x'))).toBe(true);
      expect(isCoachingIntention(Intents.declareEnergy(1))).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isCoachingIntention(Intents.start())).toBe(false);
    });
  });

  describe('isPlaceIntention', () => {
    it('returns true for flow intents', () => {
      expect(isPlaceIntention(Intents.dropItem('i', 0))).toBe(true);
      expect(isPlaceIntention(Intents.cancelDrag('i'))).toBe(true);
      expect(isPlaceIntention(Intents.advance())).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isPlaceIntention(Intents.start())).toBe(false);
    });
  });

  describe('isMemoIntention', () => {
    it('returns true for recall intents', () => {
      expect(isMemoIntention(Intents.selectValue(0, 'p', 1))).toBe(true);
      expect(isMemoIntention(Intents.confirmSelection())).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isMemoIntention(Intents.start())).toBe(false);
    });
  });

  describe('isTraceIntention', () => {
    it('returns true for trace intents', () => {
      expect(isTraceIntention(Intents.swipe(0, 1))).toBe(true);
      expect(isTraceIntention(Intents.tap(0, 1))).toBe(true);
      expect(isTraceIntention(Intents.skip())).toBe(true);
      expect(isTraceIntention(Intents.writingComplete(null, 0))).toBe(true);
    });

    it('returns false for other intents', () => {
      expect(isTraceIntention(Intents.start())).toBe(false);
    });
  });
});
