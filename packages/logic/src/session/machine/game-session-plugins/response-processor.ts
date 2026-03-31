/**
 * ResponseProcessor Plugin
 *
 * Validates user responses for modalities.
 * Detects duplicates, filters too-fast responses.
 *
 * Data in / Data out: Pure logic, no side effects.
 */

import type { ModeSpec } from '../../../specs/types';
import type { ResponseRecord } from '../../../domain';
import type { GameEvent } from '../../../engine';
import { TIMING_MIN_VALID_RT_MS } from '../../../specs/thresholds';
import { generateId } from '../../../domain';
import type { ResponseInput, ResponseResult, ResponseProcessor } from './types';

/**
 * Default ResponseProcessor implementation.
 */
export class DefaultResponseProcessor implements ResponseProcessor {
  private readonly minValidRtMs: number;
  private readonly touchDebounceMs: number;

  constructor(spec: ModeSpec) {
    this.minValidRtMs = spec.timing.minValidRtMs ?? TIMING_MIN_VALID_RT_MS;
    this.touchDebounceMs = 80;
  }

  processResponse(
    input: ResponseInput,
    existingResponse: ResponseRecord | undefined,
    activeModalities: readonly string[],
  ): ResponseResult {
    const {
      modalityId,
      inputMethod,
      stimulusStartTime,
      currentAudioTime,
      sessionId,
      trialIndex,
      currentPhase,
    } = input;

    // Check if modality is active
    if (!activeModalities.includes(modalityId)) {
      return {
        isValid: false,
        rt: null,
        isDuplicate: false,
        isTooFast: false,
        filtered: null,
        duplicateEvent: null,
        updates: null,
      };
    }

    // Calculate RT (AudioContext time in seconds → ms)
    // Guard against NaN/Infinity/negative from invalid AudioContext timestamps
    const rawRt = (currentAudioTime - stimulusStartTime) * 1000;
    const rt = Number.isFinite(rawRt) && rawRt >= 0 ? rawRt : null;

    // Check for duplicate response
    if (existingResponse?.pressed) {
      const rawDelta = (rt ?? 0) - (existingResponse.rt ?? 0);
      const deltaSinceFirstMs = Number.isFinite(rawDelta) ? Math.max(0, rawDelta) : 0;

      // Touch bounce (double-tap artifacts): silently ignore very fast duplicates to reduce noise.
      if (
        inputMethod === 'touch' &&
        deltaSinceFirstMs > 0 &&
        deltaSinceFirstMs < this.touchDebounceMs
      ) {
        return {
          isValid: false,
          rt,
          isDuplicate: true,
          isTooFast: false,
          filtered: {
            reason: 'touch_bounce',
            reactionTimeMs: rt !== null ? Math.min(rt, 600000) : null,
            deltaSinceFirstMs,
          },
          duplicateEvent: null,
          updates: null,
        };
      }

      const duplicateEvent: GameEvent = {
        type: 'DUPLICATE_RESPONSE_DETECTED',
        schemaVersion: 1,
        sessionId,
        trialIndex,
        modality: modalityId,
        deltaSinceFirstMs,
        inputMethod: inputMethod ?? 'keyboard',
        phase: currentPhase ?? 'stimulus',
        timestamp: Date.now(),
        id: generateId(),
      };

      return {
        isValid: false,
        rt,
        isDuplicate: true,
        isTooFast: false,
        filtered: null,
        duplicateEvent,
        updates: null,
      };
    }

    // Too fast filter (physiologically impossible) or invalid RT
    // Bot responses bypass RT filtering — no human physiology constraint
    if (input.inputMethod !== 'bot' && (rt === null || rt < this.minValidRtMs)) {
      return {
        isValid: false,
        rt,
        isDuplicate: false,
        isTooFast: true,
        filtered: {
          reason: 'too_fast',
          reactionTimeMs: rt !== null ? Math.min(rt, 600000) : null,
          minValidRtMs: this.minValidRtMs,
        },
        duplicateEvent: null,
        updates: null,
      };
    }

    // Valid response
    return {
      isValid: true,
      rt,
      isDuplicate: false,
      isTooFast: false,
      filtered: null,
      duplicateEvent: null,
      updates: {
        pressed: true,
        rt,
      },
    };
  }

  getMinValidRtMs(): number {
    return this.minValidRtMs;
  }
}
