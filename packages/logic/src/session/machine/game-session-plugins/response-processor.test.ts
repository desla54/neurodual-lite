import { describe, expect, it } from 'bun:test';
import { DefaultResponseProcessor } from './response-processor';
import type { ModeSpec } from '../../../specs/types';
import type { ResponseInput } from './types';
import { TIMING_MIN_VALID_RT_MS } from '../../../specs/thresholds';

describe('DefaultResponseProcessor', () => {
  function createMockSpec(minValidRtMs?: number): ModeSpec {
    return {
      id: 'test-mode',
      timing: {
        stimulusDurationMs: 500,
        intervalMs: 3000,
        minValidRtMs,
      },
    } as unknown as ModeSpec;
  }

  function createInput(overrides: Partial<ResponseInput> = {}): ResponseInput {
    return {
      modalityId: 'position',
      inputMethod: 'keyboard',
      stimulusStartTime: 1.0, // seconds
      currentAudioTime: 1.3, // 300ms later
      sessionId: 'session-123',
      trialIndex: 5,
      currentPhase: 'stimulus',
      ...overrides,
    };
  }

  describe('constructor', () => {
    it('should use default minValidRtMs when not in spec', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      expect(processor.getMinValidRtMs()).toBe(TIMING_MIN_VALID_RT_MS);
    });

    it('should use custom minValidRtMs from spec', () => {
      const processor = new DefaultResponseProcessor(createMockSpec(150));
      expect(processor.getMinValidRtMs()).toBe(150);
    });
  });

  describe('processResponse', () => {
    const activeModalities = ['position', 'audio'];

    it('should reject response for inactive modality', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput({ modalityId: 'color' });

      const result = processor.processResponse(input, undefined, activeModalities);

      expect(result.isValid).toBe(false);
      expect(result.isDuplicate).toBe(false);
      expect(result.isTooFast).toBe(false);
      expect(result.updates).toBe(null);
    });

    it('should accept valid response for active modality', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput({
        stimulusStartTime: 1.0,
        currentAudioTime: 1.3, // 300ms RT
      });

      const result = processor.processResponse(input, undefined, activeModalities);

      expect(result.isValid).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.isTooFast).toBe(false);
      expect(result.rt).toBeCloseTo(300, 0);
      expect(result.updates?.pressed).toBe(true);
      expect(result.updates?.rt).toBeCloseTo(300, 0);
    });

    it('should detect duplicate response', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput();
      const existingResponse = { pressed: true, rt: 250 };

      const result = processor.processResponse(input, existingResponse, activeModalities);

      expect(result.isValid).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.isTooFast).toBe(false);
      expect(result.duplicateEvent).not.toBe(null);
      expect(result.duplicateEvent?.type).toBe('DUPLICATE_RESPONSE_DETECTED');
    });

    it('should include delta since first response in duplicate event', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput({
        stimulusStartTime: 1.0,
        currentAudioTime: 1.4, // 400ms RT
      });
      const existingResponse = { pressed: true, rt: 200 }; // First at 200ms

      const result = processor.processResponse(input, existingResponse, activeModalities);

      const ev = result.duplicateEvent as unknown as { deltaSinceFirstMs?: number } | null;
      expect(ev?.deltaSinceFirstMs).toBeCloseTo(200, 0); // 400 - 200
    });

    it('should silently ignore touch bounce duplicates (<80ms)', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput({
        inputMethod: 'touch',
        stimulusStartTime: 1.0,
        currentAudioTime: 1.25, // 250ms
      });
      const existingResponse = { pressed: true, rt: 200 }; // First at 200ms => delta 50ms

      const result = processor.processResponse(input, existingResponse, activeModalities);

      expect(result.isValid).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateEvent).toBe(null);
      expect(result.filtered?.reason).toBe('touch_bounce');
    });

    it('should reject too-fast responses', () => {
      const processor = new DefaultResponseProcessor(createMockSpec(100)); // 100ms min
      const input = createInput({
        stimulusStartTime: 1.0,
        currentAudioTime: 1.05, // 50ms RT (too fast)
      });

      const result = processor.processResponse(input, undefined, activeModalities);

      expect(result.isValid).toBe(false);
      expect(result.isDuplicate).toBe(false);
      expect(result.isTooFast).toBe(true);
      expect(result.updates).toBe(null);
      expect(result.filtered?.reason).toBe('too_fast');
      expect(result.filtered?.minValidRtMs).toBe(100);
    });

    it('should accept response at exactly minValidRtMs', () => {
      const processor = new DefaultResponseProcessor(createMockSpec(100)); // 100ms min
      const input = createInput({
        stimulusStartTime: 1.0,
        currentAudioTime: 1.1, // 100ms RT (exactly at threshold)
      });

      const result = processor.processResponse(input, undefined, activeModalities);

      expect(result.isValid).toBe(true);
    });

    it('should not count existing unpressed response as duplicate', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput();
      const existingResponse = { pressed: false, rt: null };

      const result = processor.processResponse(input, existingResponse, activeModalities);

      expect(result.isValid).toBe(true);
      expect(result.isDuplicate).toBe(false);
    });

    it('should calculate RT correctly', () => {
      const processor = new DefaultResponseProcessor(createMockSpec());
      const input = createInput({
        stimulusStartTime: 2.5, // seconds
        currentAudioTime: 3.0, // 500ms later
      });

      const result = processor.processResponse(input, undefined, activeModalities);

      expect(result.rt).toBeCloseTo(500, 0);
    });
  });

  describe('getMinValidRtMs', () => {
    it('should return configured minimum RT', () => {
      const processor = new DefaultResponseProcessor(createMockSpec(200));
      expect(processor.getMinValidRtMs()).toBe(200);
    });
  });
});
