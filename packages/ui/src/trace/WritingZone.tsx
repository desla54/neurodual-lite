/**
 * WritingZone - Flexible handwriting input for Dual Trace
 *
 * Provides a drawing surface for handwriting recognition.
 * Supports multiple display modes for integration with the game grid.
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { TraceWritingConfig, TraceWritingResult } from '@neurodual/logic';
import type {
  HandwritingRecognizer,
  HandwritingRecognitionResult,
} from '../context/HandwritingRecognizerContext';
import { useOptionalHandwritingRecognizerLoader } from '../context/HandwritingRecognizerContext';
import {
  TRACE_WRITING_MIN_POINTS_FOR_RECOGNITION,
  TRACE_WRITING_MIN_CONFIDENCE_THRESHOLD,
} from '@neurodual/logic';
import { DrawingCanvas, canvasStrokesToPoints, type Stroke } from './DrawingCanvas';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

export interface WritingZoneProps {
  /** Writing zone configuration */
  config: TraceWritingConfig;
  /** Expected letter for this trial (Sound type) */
  expectedLetter: string | null;
  /** Called when writing is submitted */
  onSubmit: (result: TraceWritingResult) => void;
  /** Called when user wants to cancel/skip */
  onCancel?: () => void;
  /** Grid size for positioning (grid-overlay mode) */
  gridSize?: number;
  /** Trigger to clear the canvas */
  clearTrigger?: number;
  /** Additional class name */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function WritingZone({
  config,
  expectedLetter,
  onSubmit,
  onCancel,
  gridSize = 300,
  clearTrigger = 0,
  // feedbackDurationMs is managed by parent now
  className = '',
}: WritingZoneProps): ReactNode {
  const { t } = useTranslation();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const recognizerRef = useRef<HandwritingRecognizer | null>(null);
  const loader = useOptionalHandwritingRecognizerLoader();
  const startTimeRef = useRef<number>(0);

  // Initialize recognizer (singleton - shared across components)
  useEffect(() => {
    let cancelled = false;

    if (!loader) {
      // Recognizer is optional: WritingZone still works as a drawing surface.
      if (import.meta.env.DEV) {
        console.warn('[WritingZone] Handwriting recognizer loader not configured');
      }
      return () => {
        cancelled = true;
      };
    }

    loader('/models/emnist-letters/model.json')
      .then((recognizer) => {
        if (!cancelled) {
          recognizerRef.current = recognizer;
        }
      })
      .catch((err: unknown) => {
        console.error('[WritingZone] Failed to load handwriting model:', err);
      });

    return () => {
      cancelled = true;
      // Don't dispose - singleton is shared
    };
  }, [loader]);

  // Track start time when component mounts or clears
  startTimeRef.current = performance.now();

  // Handle stroke completion
  const handleStrokeEnd = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
  }, []);

  // Submit the current drawing for recognition
  const handleSubmit = useCallback(async () => {
    if (isRecognizing) return;
    if (!recognizerRef.current?.isReady) {
      console.warn('[WritingZone] Recognizer not ready');
      return;
    }

    setIsRecognizing(true);
    const writingTimeMs = performance.now() - startTimeRef.current;

    // Convert strokes to points
    const points = canvasStrokesToPoints(strokes);

    if (points.length < TRACE_WRITING_MIN_POINTS_FOR_RECOGNITION) {
      // Too few points - treat as no attempt (skip)
      const result: TraceWritingResult = {
        recognizedLetter: null,
        expectedLetter,
        isCorrect: false,
        confidence: 0,
        writingTimeMs,
        timedOut: false,
        selectedColor: null,
        expectedColor: null,
        colorCorrect: null,
      };
      if (import.meta.env.DEV) {
        console.log('[WritingZone] Too few points, treating as no response:', points.length);
      }
      setIsRecognizing(false);
      onSubmit(result);
      return;
    }

    // Run async recognition to avoid blocking main thread
    const recognition = await recognizerRef.current.recognizeAsync(points);

    // If confidence too low, treat as no valid response
    const hasValidRecognition = recognition.score >= TRACE_WRITING_MIN_CONFIDENCE_THRESHOLD;

    const result: TraceWritingResult = {
      recognizedLetter: hasValidRecognition ? recognition.letter : null,
      expectedLetter,
      isCorrect: hasValidRecognition && recognition.letter === expectedLetter,
      confidence: recognition.score,
      writingTimeMs,
      timedOut: false,
      selectedColor: null,
      expectedColor: null,
      colorCorrect: null,
    };

    if (import.meta.env.DEV) {
      console.log('[WritingZone] Recognition result:', {
        recognized: recognition.letter,
        expected: expectedLetter,
        isCorrect: result.isCorrect,
        confidence: recognition.score.toFixed(2),
        validRecognition: hasValidRecognition,
        pointCount: points.length,
      });
    }

    setIsRecognizing(false);
    onSubmit(result);
  }, [strokes, expectedLetter, onSubmit, isRecognizing]);

  // Compute dimensions based on mode
  const getZoneDimensions = (): { width: number; height: number } => {
    switch (config.mode) {
      case 'grid-overlay':
        return { width: gridSize, height: gridSize };
      case 'target-cell':
        // About 1/3 of grid size for a single cell
        return { width: gridSize / 3, height: gridSize / 3 };
      case 'floating-zone':
        return { width: Math.max(config.minSizePx, 200), height: Math.max(config.minSizePx, 200) };
      case 'fullscreen':
        return { width: window.innerWidth - 40, height: window.innerHeight - 200 };
      default:
        return { width: 200, height: 200 };
    }
  };

  const dimensions = getZoneDimensions();

  // Mode-specific container styles
  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
    };

    switch (config.mode) {
      case 'grid-overlay':
        return {
          ...baseStyles,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
          justifyContent: 'center',
        };
      case 'target-cell':
        return {
          ...baseStyles,
          position: 'absolute',
          zIndex: 10,
        };
      case 'floating-zone':
        return {
          ...baseStyles,
          padding: '16px',
        };
      case 'fullscreen':
        return {
          ...baseStyles,
          position: 'fixed',
          inset: 0,
          backgroundColor: 'hsl(var(--woven-base))',
          zIndex: 100,
          justifyContent: 'center',
        };
      default:
        return baseStyles;
    }
  };

  return (
    <div style={getContainerStyles()} className={className}>
      {/* Hint: show expected letter if enabled */}
      {config.showHint && expectedLetter && (
        <div className="text-woven-text-muted text-sm mb-2">
          {t('common.trace')}{' '}
          <span className="font-mono font-bold text-lg text-woven-text">{expectedLetter}</span>
        </div>
      )}

      {/* Drawing canvas */}
      <div
        className="relative rounded-xl border-2 border-dashed border-woven-border/50 bg-woven-surface/60 backdrop-blur-lg overflow-hidden"
        style={{
          width: dimensions.width,
          height: dimensions.height,
        }}
      >
        <DrawingCanvas
          width={dimensions.width}
          height={dimensions.height}
          strokeColor="hsl(var(--woven-text))"
          strokeWidth={8}
          onStrokeEnd={handleStrokeEnd}
          clearTrigger={clearTrigger}
          disabled={isRecognizing}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-3 mt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm bg-woven-cell-rest text-woven-text hover:opacity-80 transition-opacity"
            disabled={isRecognizing}
          >
            {t('common.skip')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          className="px-6 py-2 rounded-lg text-sm font-medium bg-woven-text text-woven-bg hover:opacity-90 transition-opacity disabled:opacity-40"
          disabled={isRecognizing || strokes.length === 0}
        >
          {isRecognizing ? '...' : 'OK'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Composable hook for direct recognizer access
// =============================================================================

interface HandwritingRecognizerHook {
  isReady: boolean;
  isLoading: boolean;
  recognize: (strokes: Stroke[]) => Promise<HandwritingRecognitionResult | null>;
}

export function useHandwritingRecognizer(): HandwritingRecognizerHook {
  const recognizerRef = useRef<HandwritingRecognizer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const loader = useOptionalHandwritingRecognizerLoader();

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);

    if (!loader) {
      setIsReady(false);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    loader('/models/emnist-letters/model.json')
      .then((recognizer) => {
        if (!cancelled) {
          recognizerRef.current = recognizer;
          setIsReady(true);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error('[useHandwritingRecognizer] Failed to load model:', err);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      // Don't dispose - singleton is shared
    };
  }, [loader]);

  const recognize = useCallback(async (strokes: Stroke[]) => {
    if (!recognizerRef.current?.isReady) {
      return null;
    }
    const points = canvasStrokesToPoints(strokes);
    if (points.length === 0) return null;
    return recognizerRef.current.recognizeAsync(points);
  }, []);

  return { isReady, isLoading, recognize };
}
