/**
 * AdminHandwritingTab - Debug & test handwriting recognition
 *
 * Uses the exact same DrawingCanvas + recognizer pipeline as the game.
 * Shows recognized result, confidence, timing, and algorithm details.
 *
 * Modes:
 * - Letters A-Z: full 26-letter uppercase model
 * - Digits: 0-9 production model
 * - Multi-digit: multi-stroke number recognition
 * - Direction: 8 cardinal/diagonal directions (geometric)
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  DrawingCanvas,
  canvasStrokesToPoints,
  CircularSelector,
  type CircularSelectorItem,
  type Stroke,
  type HandwritingStrokePoint,
  type DigitStrokePoint,
} from '@neurodual/ui';
import {
  getSharedWorkerHandwritingRecognizer,
  getSharedWorkerDigitRecognizer,
} from '../../services/recognizer-worker-client';
import { getSharedDirectionRecognizer, type DirectionStrokePoint } from '@neurodual/infra';

type RecognizerType = 'letter-26' | 'digit' | 'number' | 'direction';

const RECOGNIZER_OPTIONS: readonly {
  value: RecognizerType;
  label: string;
  modelPath: string;
  modelSize: string;
  classes: number;
  backend: string;
}[] = [
  {
    value: 'letter-26',
    label: 'Letters A-Z',
    modelPath: '/models/emnist-letters/model.json',
    modelSize: '1.1 MB',
    classes: 26,
    backend: 'TF.js WebGL (Worker)',
  },
  {
    value: 'digit',
    label: 'Digits',
    modelPath: '/models/emnist-digits/model.json',
    modelSize: '524 KB',
    classes: 10,
    backend: 'TF.js WebGL (Worker)',
  },
  {
    value: 'number',
    label: 'Multi-digit',
    modelPath: '/models/emnist-digits/model.json',
    modelSize: '524 KB',
    classes: 10,
    backend: 'TF.js WebGL (Worker)',
  },
  {
    value: 'direction',
    label: 'Direction',
    modelPath: 'N/A (geometric)',
    modelSize: '0 KB',
    classes: 8,
    backend: 'Geometric (main thread)',
  },
];

interface RecognitionEntry {
  id: number;
  type: RecognizerType;
  result: string;
  confidence: number;
  timeMs: number;
  pointCount: number;
  timestamp: number;
}

export function AdminHandwritingTab(): ReactNode {
  const [recognizerType, setRecognizerType] = useState<RecognizerType>('letter-26');
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [history, setHistory] = useState<RecognitionEntry[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const nextId = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);

  // Match game proportions: grid measures its container, canvas = gridSize - 32
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState(300);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Square grid fitting the container, like the game
      setGridSize(Math.min(rect.width, 400));
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  const canvasSize = Math.max(100, gridSize - 32);

  const handleStrokeEnd = useCallback((strokes: Stroke[]) => {
    strokesRef.current = strokes;
  }, []);

  const handleRecognize = useCallback(async () => {
    const strokes = strokesRef.current;
    if (strokes.length === 0) return;

    const points = canvasStrokesToPoints(strokes) as unknown as readonly HandwritingStrokePoint[];
    if (points.length < 3) return;

    setIsRecognizing(true);
    setInitError(null);
    const t0 = performance.now();

    try {
      let result: string;
      let confidence: number;
      let timeMs: number;

      if (recognizerType === 'letter-26') {
        const recognizer = await getSharedWorkerHandwritingRecognizer(
          '/models/emnist-letters/model.json',
        );
        const r = await recognizer.recognizeAsync(points);
        result = r.letter || '?';
        confidence = r.score;
        timeMs = performance.now() - t0;
      } else if (recognizerType === 'digit') {
        const recognizer = await getSharedWorkerDigitRecognizer();
        const r = await recognizer.recognizeAsync(points as unknown as readonly DigitStrokePoint[]);
        result = r.digit >= 0 ? String(r.digit) : '?';
        confidence = r.score;
        timeMs = performance.now() - t0;
      } else if (recognizerType === 'number') {
        const recognizer = await getSharedWorkerDigitRecognizer();
        const r = await recognizer.recognizeNumberAsync(
          points as unknown as readonly DigitStrokePoint[],
        );
        result = Number.isNaN(r.value) ? '?' : String(r.value);
        confidence = r.confidence;
        timeMs = performance.now() - t0;
      } else {
        // direction — geometric, no async needed
        const recognizer = getSharedDirectionRecognizer();
        const r = recognizer.recognizeAsync(points as unknown as readonly DirectionStrokePoint[]);
        result = r.label || '?';
        confidence = r.score;
        timeMs = r.timeMs;
      }

      const entry: RecognitionEntry = {
        id: nextId.current++,
        type: recognizerType,
        result,
        confidence,
        timeMs,
        pointCount: points.length,
        timestamp: Date.now(),
      };

      setHistory((prev) => [entry, ...prev].slice(0, 50));
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRecognizing(false);
    }
  }, [recognizerType]);

  const handleClear = useCallback(() => {
    setClearTrigger((c) => c + 1);
    strokesRef.current = [];
  }, []);

  const handleRecognizeAndClear = useCallback(async () => {
    await handleRecognize();
    handleClear();
  }, [handleRecognize, handleClear]);

  const lastEntry = history[0] ?? null;
  const activeOption = RECOGNIZER_OPTIONS.find(
    (o) => o.value === recognizerType,
  ) as (typeof RECOGNIZER_OPTIONS)[number];

  return (
    <div className="space-y-6">
      {/* Recognizer selector */}
      <Card>
        <h3 className="text-sm font-semibold mb-3">Algorithm</h3>
        <div className="flex flex-wrap gap-2">
          {RECOGNIZER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecognizerType(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                recognizerType === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 hover:bg-white/10 text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Model: {activeOption.modelPath} ({activeOption.modelSize}){' | '}Classes:{' '}
          {activeOption.classes}
          {' | '}
          {activeOption.backend}
        </p>
      </Card>

      {/* Drawing area + result */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Canvas */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">
            Drawing Zone{' '}
            <span className="text-muted-foreground font-normal">
              ({canvasSize}×{canvasSize}px — same as game grid)
            </span>
          </h3>
          <div ref={containerRef} className="flex justify-center">
            <div
              className="rounded-2xl bg-woven-surface border-2 border-dashed border-woven-focus overflow-hidden"
              style={{ width: canvasSize, height: canvasSize }}
            >
              <DrawingCanvas
                width={canvasSize}
                height={canvasSize}
                strokeColor="hsl(var(--woven-text))"
                strokeWidth={8}
                onStrokeEnd={handleStrokeEnd}
                clearTrigger={clearTrigger}
                inkEffect={false}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleRecognizeAndClear}
              disabled={isRecognizing}
              className="flex-1"
            >
              {isRecognizing ? 'Recognizing...' : 'Recognize & Clear'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRecognize}
              disabled={isRecognizing}
            >
              Recognize
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          </div>
          {initError && <p className="text-xs text-red-400 mt-2">{initError}</p>}
        </Card>

        {/* Live result */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Result</h3>
          {lastEntry ? (
            <div className="space-y-4">
              {/* Big result display */}
              <div className="flex items-center justify-center">
                <span
                  className={`text-7xl font-bold ${lastEntry.confidence >= 0.7 ? 'text-green-400' : lastEntry.confidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}
                >
                  {lastEntry.result}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-lg font-mono font-bold">
                    {(lastEntry.confidence * 100).toFixed(1)}%
                  </p>
                  <div className="w-full bg-white/10 rounded-full h-1.5 mt-1">
                    <div
                      className={`h-1.5 rounded-full ${lastEntry.confidence >= 0.7 ? 'bg-green-400' : lastEntry.confidence >= 0.4 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, lastEntry.confidence * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Inference Time</p>
                  <p className="text-lg font-mono font-bold">{lastEntry.timeMs.toFixed(0)} ms</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Points</p>
                  <p className="text-lg font-mono font-bold">{lastEntry.pointCount}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Algorithm</p>
                  <p className="text-sm font-mono font-bold">
                    {lastEntry.type === 'direction'
                      ? 'Geometric'
                      : `CNN ${activeOption.classes}-class`}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Draw something and click Recognize
            </div>
          )}
        </Card>
      </div>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">History ({history.length})</h3>
            <Button variant="ghost" size="sm" onClick={() => setHistory([])}>
              Clear
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-white/10">
                  <th className="text-left py-1.5 px-2">#</th>
                  <th className="text-left py-1.5 px-2">Type</th>
                  <th className="text-left py-1.5 px-2">Result</th>
                  <th className="text-right py-1.5 px-2">Confidence</th>
                  <th className="text-right py-1.5 px-2">Time</th>
                  <th className="text-right py-1.5 px-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 px-2 text-muted-foreground">{entry.id + 1}</td>
                    <td className="py-1.5 px-2">{entry.type}</td>
                    <td className="py-1.5 px-2 font-bold text-base">{entry.result}</td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono ${entry.confidence >= 0.7 ? 'text-green-400' : entry.confidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}
                    >
                      {(entry.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {entry.timeMs.toFixed(0)}ms
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">{entry.pointCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Circular Selector demos */}
      <SelectorDemos />
    </div>
  );
}

// =============================================================================
// Circular selector demos (colors, shapes, emotions)
// =============================================================================

const COLOR_ITEMS: CircularSelectorItem[] = [
  { id: 'red', label: 'Red', color: '#EF4444' },
  { id: 'blue', label: 'Blue', color: '#3B82F6' },
  { id: 'green', label: 'Green', color: '#22C55E' },
  { id: 'yellow', label: 'Yellow', color: '#EAB308' },
  { id: 'purple', label: 'Purple', color: '#A855F7' },
  { id: 'orange', label: 'Orange', color: '#F97316' },
  { id: 'cyan', label: 'Cyan', color: '#06B6D4' },
  { id: 'magenta', label: 'Magenta', color: '#EC4899' },
];

const SHAPE_ITEMS: CircularSelectorItem[] = [
  { id: 'circle', label: 'Circle', emoji: '\u25CF' },
  { id: 'square', label: 'Square', emoji: '\u25A0' },
  { id: 'triangle', label: 'Triangle', emoji: '\u25B2' },
  { id: 'diamond', label: 'Diamond', emoji: '\u25C6' },
  { id: 'pentagon', label: 'Pentagon', emoji: '\u2B1F' },
  { id: 'hexagon', label: 'Hexagon', emoji: '\u2B22' },
  { id: 'star', label: 'Star', emoji: '\u2605' },
  { id: 'cross', label: 'Cross', emoji: '\u271A' },
];

const EMOTION_ITEMS: CircularSelectorItem[] = [
  { id: 'joy', label: 'Joy', emoji: '\uD83D\uDE04' },
  { id: 'sadness', label: 'Sadness', emoji: '\uD83D\uDE22' },
  { id: 'anger', label: 'Anger', emoji: '\uD83D\uDE21' },
  { id: 'fear', label: 'Fear', emoji: '\uD83D\uDE28' },
  { id: 'disgust', label: 'Disgust', emoji: '\uD83E\uDD22' },
  { id: 'surprise', label: 'Surprise', emoji: '\uD83D\uDE32' },
  { id: 'contempt', label: 'Contempt', emoji: '\uD83D\uDE12' },
  { id: 'neutral', label: 'Neutral', emoji: '\uD83D\uDE10' },
];

function SelectorDemos(): ReactNode {
  const [colorSelected, setColorSelected] = useState<string | null>(null);
  const [shapeSelected, setShapeSelected] = useState<string | null>(null);
  const [emotionSelected, setEmotionSelected] = useState<string | null>(null);
  const [lastValidated, setLastValidated] = useState<string>('');

  return (
    <Card>
      <h3 className="text-sm font-semibold mb-4">Circular Selector (prototype)</h3>
      <div className="flex flex-wrap justify-center gap-8">
        {/* Colors */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">Colors</span>
          <CircularSelector
            items={COLOR_ITEMS}
            selected={colorSelected}
            onSelect={(id) => {
              setColorSelected(id);
              setLastValidated(`color: ${id}`);
            }}
            onClear={() => setColorSelected(null)}
            size={220}
          />
        </div>

        {/* Shapes */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">Shapes</span>
          <CircularSelector
            items={SHAPE_ITEMS}
            selected={shapeSelected}
            onSelect={(id) => {
              setShapeSelected(id);
              setLastValidated(`shape: ${id}`);
            }}
            onClear={() => setShapeSelected(null)}
            size={220}
          />
        </div>

        {/* Emotions */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">Emotions</span>
          <CircularSelector
            items={EMOTION_ITEMS}
            selected={emotionSelected}
            onSelect={(id) => {
              setEmotionSelected(id);
              setLastValidated(`emotion: ${id}`);
            }}
            onClear={() => setEmotionSelected(null)}
            size={220}
          />
        </div>
      </div>

      {lastValidated && (
        <p className="text-xs text-center text-green-400 mt-4">Last: {lastValidated}</p>
      )}
    </Card>
  );
}
