/**
 * DefaultModalityEvaluator
 *
 * Evaluates SDT results per modality when dynamicRules is enabled.
 * Returns new stats object (immutable update).
 *
 * PRINCIPLES:
 * - Data in / Data out: receives inputs, returns new stats
 * - No mutation: creates new stats object
 * - Spec-driven: uses dynamicRules, audioEnabled, colorEnabled from spec
 */

import type { TraceModality, TraceModalityResult } from '../../../types/trace';
import {
  computeAllModalityResults,
  updateModalityStats,
  getEnabledModalities,
  type TraceModalityStats,
} from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';
import type {
  ModalityEvaluator,
  ModalityEvalInput,
  ModalityEvalResult,
  TraceRunningStats,
} from './types';

// =============================================================================
// Factory
// =============================================================================

export interface ModalityEvaluatorConfig {
  readonly spec: TraceSpec;
}

/**
 * Creates a DefaultModalityEvaluator.
 * Only active when dynamicRules is enabled.
 */
export function createDefaultModalityEvaluator(config: ModalityEvaluatorConfig): ModalityEvaluator {
  const { spec } = config;
  const dynamicRulesEnabled = spec.extensions.dynamicRules;
  const enabledModalities = getEnabledModalities(spec.extensions);

  function isEnabled(): boolean {
    return dynamicRulesEnabled;
  }

  function getEnabledModalitiesResult(): readonly TraceModality[] {
    return enabledModalities;
  }

  function evaluate(input: ModalityEvalInput, currentStats: TraceRunningStats): ModalityEvalResult {
    if (!dynamicRulesEnabled) {
      // Empty result - this path should not be called (machine checks isEnabled() first)
      return {
        results: {} as Record<TraceModality, TraceModalityResult>,
        updatedStats: currentStats,
      };
    }

    const {
      response,
      activeModalities,
      writingResult,
      hadPositionTarget,
      hadAudioTarget,
      hadColorTarget,
      hadImageTarget,
      hadDigitTarget,
      hadEmotionTarget,
      hadWordTarget,
      hadToneTarget,
      hadSpatialTarget,
    } = input;

    // Determine correctness per modality
    const positionCorrect = response.isCorrect ? true : response.position !== null ? false : null;
    // For writing-based modalities, distinguish "no response" from "incorrect response".
    // - audio: no response when recognizedLetter is null
    // - color: no response when selectedColor is null/undefined
    const audioCorrect =
      writingResult && writingResult.recognizedLetter != null ? writingResult.isCorrect : null;
    const colorCorrect =
      writingResult && writingResult.selectedColor != null
        ? (writingResult.colorCorrect ??
          (writingResult.expectedColor != null &&
            writingResult.selectedColor === writingResult.expectedColor))
        : null;

    // New modalities: extract correctness from writingResult
    const imageCorrect =
      writingResult && writingResult.selectedImage != null
        ? (writingResult.imageCorrect ?? null)
        : null;
    const digitCorrect =
      writingResult && writingResult.recognizedDigit != null
        ? (writingResult.digitCorrect ?? null)
        : null;
    const emotionCorrect =
      writingResult && writingResult.selectedEmotion != null
        ? (writingResult.emotionCorrect ?? null)
        : null;
    const wordCorrect =
      writingResult && writingResult.recognizedWord != null
        ? (writingResult.wordCorrect ?? null)
        : null;
    const toneCorrect =
      writingResult && writingResult.recognizedTone != null
        ? (writingResult.toneCorrect ?? null)
        : null;
    const directionCorrect =
      writingResult && writingResult.recognizedDirection != null
        ? (writingResult.directionCorrect ?? null)
        : null;

    // Compute results using existing pure function
    const results = computeAllModalityResults(
      activeModalities,
      enabledModalities,
      positionCorrect,
      audioCorrect,
      colorCorrect,
      hadPositionTarget,
      hadAudioTarget,
      hadColorTarget,
      imageCorrect,
      digitCorrect,
      emotionCorrect,
      wordCorrect,
      toneCorrect,
      directionCorrect,
      hadImageTarget,
      hadDigitTarget,
      hadEmotionTarget,
      hadWordTarget,
      hadToneTarget,
      hadSpatialTarget,
    );

    // Update modality stats (immutable)
    let modalityStats = currentStats.modalityStats;
    if (modalityStats) {
      for (const modality of enabledModalities) {
        const result: TraceModalityResult | undefined = results[modality];
        const existingStats: TraceModalityStats | undefined = modalityStats[modality];
        if (result && existingStats) {
          modalityStats = {
            ...modalityStats,
            [modality]: updateModalityStats(existingStats, result),
          };
        }
      }
    }

    const updatedStats: TraceRunningStats = modalityStats
      ? { ...currentStats, modalityStats }
      : currentStats;

    return {
      results,
      updatedStats,
    };
  }

  return {
    isEnabled,
    getEnabledModalities: getEnabledModalitiesResult,
    evaluate,
  };
}
