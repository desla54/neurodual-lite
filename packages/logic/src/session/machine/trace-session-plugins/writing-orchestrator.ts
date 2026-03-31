/**
 * DefaultWritingOrchestrator
 *
 * Manages the optional writing phase for handwriting recognition.
 * Active for all non-position modalities that require an explicit recall/selection phase.
 *
 * PRINCIPLES:
 * - Data out: returns config, not timer calls
 * - No side effects: pure decision logic
 * - Spec-driven: reads writing config from spec
 */

import type { TraceWritingResult, TraceModality } from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';
import type { WritingOrchestrator, WritingTimeoutExpectations } from './types';

// =============================================================================
// Factory
// =============================================================================

export interface WritingOrchestratorConfig {
  readonly spec: TraceSpec;
  /** N-level for warmup detection */
  readonly nLevel: number;
}

/**
 * Creates a DefaultWritingOrchestrator.
 * Writing phase is needed when a trial requests at least one writing-phase modality.
 */
export function createDefaultWritingOrchestrator(
  config: WritingOrchestratorConfig,
): WritingOrchestrator {
  const { spec, nLevel: _nLevel } = config;
  const ext = spec.extensions;
  const writingEnabled = ext.writing.enabled;
  const audioEnabled = ext.audioEnabled;
  const colorEnabled = ext.colorEnabled;
  const imageEnabled = ext.imageEnabled ?? false;
  const digitsEnabled = ext.digitsEnabled ?? false;
  const emotionsEnabled = ext.emotionsEnabled ?? false;
  const wordsEnabled = ext.wordsEnabled ?? false;
  const tonesEnabled = ext.tonesEnabled ?? false;
  const spatialEnabled = ext.spatialEnabled ?? false;
  const timeoutMs = ext.writing.timeoutMs;

  /** All modalities that require a writing/selection phase (anything beyond position). */
  const writingModalities: readonly TraceModality[] = [
    ...(audioEnabled ? (['audio'] as const) : []),
    ...(colorEnabled ? (['color'] as const) : []),
    ...(imageEnabled ? (['image'] as const) : []),
    ...(digitsEnabled ? (['digits'] as const) : []),
    ...(emotionsEnabled ? (['emotions'] as const) : []),
    ...(wordsEnabled ? (['words'] as const) : []),
    ...(tonesEnabled ? (['tones'] as const) : []),
    ...(spatialEnabled ? (['spatial'] as const) : []),
  ];

  const anyWritingModalityEnabled = writingModalities.length > 0;

  function needsWritingPhase(
    _trialIndex: number,
    isWarmup: boolean,
    activeModalities?: readonly TraceModality[],
  ): boolean {
    // No writing during warmup
    if (isWarmup) return false;

    // Writing must be enabled globally.
    if (!writingEnabled) return false;

    // Writing is only useful when at least one writing-phase modality is globally enabled.
    if (!anyWritingModalityEnabled) return false;

    // In dynamic rules mode, only require writing if this trial actually requests
    // a writing-phase modality.
    if (activeModalities && activeModalities.length > 0) {
      return activeModalities.some((m) => writingModalities.includes(m));
    }

    // Fallback for non-dynamic path (no per-trial modalities provided).
    return anyWritingModalityEnabled;
  }

  function getTimeoutMs(): number {
    return timeoutMs;
  }

  function createTimeoutResult({
    expectedSound,
    expectedColor,
    expectedImage = null,
    expectedDigit = null,
    expectedEmotion = null,
    expectedWord = null,
    expectedTone = null,
    expectedSpatialDirection = null,
  }: WritingTimeoutExpectations): TraceWritingResult {
    return {
      recognizedLetter: null,
      expectedLetter: expectedSound,
      isCorrect: false,
      confidence: 0,
      writingTimeMs: timeoutMs,
      timedOut: true,
      selectedColor: null,
      expectedColor,
      colorCorrect: expectedColor === null ? null : false,
      selectedImage: null,
      expectedImage,
      imageCorrect: expectedImage === null ? null : false,
      recognizedDigit: null,
      expectedDigit: expectedDigit === null ? null : String(expectedDigit),
      digitCorrect: expectedDigit === null ? null : false,
      selectedEmotion: null,
      expectedEmotion,
      emotionCorrect: expectedEmotion === null ? null : false,
      recognizedWord: null,
      expectedWord,
      wordCorrect: expectedWord === null ? null : false,
      recognizedTone: null,
      expectedTone,
      toneCorrect: expectedTone === null ? null : false,
      recognizedDirection: null,
      expectedDirection: expectedSpatialDirection,
      directionCorrect: expectedSpatialDirection === null ? null : false,
    };
  }

  function isWritingEnabled(): boolean {
    return writingEnabled && anyWritingModalityEnabled;
  }

  return {
    needsWritingPhase,
    getTimeoutMs,
    createTimeoutResult,
    isWritingEnabled,
  };
}
