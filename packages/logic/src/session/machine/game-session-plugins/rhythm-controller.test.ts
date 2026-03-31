import { describe, expect, it } from 'bun:test';
import { DefaultRhythmController } from './rhythm-controller';
import { SELF_PACED_MAX_TIMEOUT_MS } from '../../../specs/thresholds';
import type { ModeSpec } from '../../../specs/types';

describe('DefaultRhythmController', () => {
  function createMockSpec(selfPaced = false): ModeSpec {
    // @ts-expect-error test override
    return {
      timing: {
        stimulusDurationMs: 500,
        intervalMs: 3000,
      },
      extensions: {
        selfPaced,
      },
    } as ModeSpec;
  }

  describe('isSelfPaced', () => {
    it('should return false when selfPaced not in extensions', () => {
      const spec = { timing: { stimulusDurationMs: 500, intervalMs: 3000 } } as ModeSpec;
      const controller = new DefaultRhythmController(spec);
      expect(controller.isSelfPaced()).toBe(false);
    });

    it('should return false when selfPaced is false', () => {
      const controller = new DefaultRhythmController(createMockSpec(false));
      expect(controller.isSelfPaced()).toBe(false);
    });

    it('should return true when selfPaced is true', () => {
      const controller = new DefaultRhythmController(createMockSpec(true));
      expect(controller.isSelfPaced()).toBe(true);
    });
  });

  describe('getStimulusDuration', () => {
    it('should return stimulus duration from spec', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      expect(controller.getStimulusDuration()).toBe(500);
    });
  });

  describe('getIsi', () => {
    it('should return interval from spec', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      expect(controller.getIsi()).toBe(3000);
    });
  });

  describe('getNextTrialTarget', () => {
    it('should add ISI to current target when in future', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const currentTarget = 5.0; // seconds
      const currentAudio = 5.0;
      const isi = 3000; // ms

      const nextTarget = controller.getNextTrialTarget(currentTarget, currentAudio, isi);

      expect(nextTarget).toBe(8.0); // 5.0 + 3.0
    });

    it('should realign to current time when target is in the past', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const currentTarget = 5.0;
      const currentAudio = 10.0; // We've fallen behind
      const isi = 3000;

      const nextTarget = controller.getNextTrialTarget(currentTarget, currentAudio, isi);

      expect(nextTarget).toBe(13.0); // currentAudio + isi/1000
    });

    it('should handle exact boundary', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const currentTarget = 5.0;
      const currentAudio = 8.0; // Exactly at proposed target
      const isi = 3000;

      const nextTarget = controller.getNextTrialTarget(currentTarget, currentAudio, isi);

      // Proposed target 8.0 is not > 8.0, so realigns
      expect(nextTarget).toBe(11.0);
    });
  });

  describe('adjustAfterResume', () => {
    it('should shift target by real pause duration and keep trial elapsed for RT', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const pauseDuration = 10000; // 10 seconds paused
      const pauseElapsed = 2500; // 2.5 seconds elapsed in the paused trial
      const nextTrialTarget = 10.0;
      const stimulusStart = 8.0;
      const currentAudio = 18.0;

      const adjustment = controller.adjustAfterResume(
        pauseDuration,
        pauseElapsed,
        nextTrialTarget,
        stimulusStart,
        currentAudio,
      );

      expect(adjustment.nextTrialTargetTime).toBe(20.0); // 10.0 + 10.0
      expect(adjustment.stimulusStartTime).toBe(15.5); // 18.0 - 2.5
    });
  });

  describe('calculateWaitingDuration', () => {
    it('should calculate positive duration when target is in future', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const targetTime = 10.0;
      const currentTime = 7.0;

      const duration = controller.calculateWaitingDuration(targetTime, currentTime, 3000);

      expect(duration).toBe(3000); // (10 - 7) * 1000
    });

    it('should return 0 when target is in past', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const targetTime = 5.0;
      const currentTime = 7.0;

      const duration = controller.calculateWaitingDuration(targetTime, currentTime, 3000);

      expect(duration).toBe(0);
    });

    it('should return 0 when target equals current', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      const duration = controller.calculateWaitingDuration(7.0, 7.0, 3000);

      expect(duration).toBe(0);
    });
  });

  describe('getSelfPacedMaxTimeout', () => {
    it('should return constant from thresholds', () => {
      const controller = new DefaultRhythmController(createMockSpec());
      expect(controller.getSelfPacedMaxTimeout()).toBe(SELF_PACED_MAX_TIMEOUT_MS);
    });
  });
});
