/**
 * CNN Digit Recognizer using TensorFlow.js
 *
 * Uses a CNN trained on EMNIST digits dataset for high-accuracy recognition.
 * Supports digits 0-9 for arithmetic interference in Dual Trace mode.
 *
 * Architecture and preprocessing match the letter recognizer (CNNRecognizer)
 * for consistent user experience.
 *
 * TensorFlow.js is loaded dynamically to avoid blocking the main thread
 * during WebGL backend initialization.
 */

// Re-use types from CNN recognizer for consistency
export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface DigitRecognitionResult {
  readonly digit: number; // 0-9, or -1 if no strokes
  readonly digitString: string; // "0"-"9" or ""
  readonly score: number; // 0-1, higher is better
  readonly timeMs: number;
}

export interface RecognizeNumberOptions {
  /**
   * Minimum confidence required for each individual digit.
   * If any digit falls below this threshold, the returned `value` is `NaN`.
   */
  readonly minDigitConfidence?: number;
}

// Model metadata
const MODEL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const INPUT_SIZE = 28;
const DIGIT_ONE_INDEX = MODEL_DIGITS.indexOf(1);
const DIGIT_SEVEN_INDEX = MODEL_DIGITS.indexOf(7);

// Tuned from production evaluation (scripts/handwriting/reports/digits-production-report.json).
// Keeps >99% coverage while improving accepted accuracy on 10..20 arithmetic values.
const DEFAULT_MIN_DIGIT_CONFIDENCE = 0.7;

// TensorFlow.js types (extracted from the module)
type TFModule = typeof import('@tensorflow/tfjs');
type GraphModel = Awaited<ReturnType<TFModule['loadGraphModel']>>;
type Tensor4D = ReturnType<TFModule['tensor4d']>;
type Tensor = ReturnType<TFModule['tensor']>;

// Singleton for TensorFlow.js module (loaded dynamically)
let tfModule: TFModule | null = null;
let tfLoadPromise: Promise<TFModule> | null = null;

/**
 * Lazily load TensorFlow.js to avoid blocking main thread during WebGL init
 */
async function getTF(): Promise<typeof import('@tensorflow/tfjs')> {
  if (tfModule) return tfModule;

  if (!tfLoadPromise) {
    tfLoadPromise = (async () => {
      const t0 = performance.now();
      const tf = await import('@tensorflow/tfjs');
      await tf.ready(); // Ensure backend is fully initialized
      console.log(
        `[DigitRecognizer] TensorFlow.js loaded in ${(performance.now() - t0).toFixed(0)}ms, backend: ${tf.getBackend()}`,
      );
      tfModule = tf;
      return tf;
    })();
  }

  return tfLoadPromise;
}

export class DigitRecognizer {
  private model: GraphModel | null = null;
  private isLoading = false;
  private loadError: Error | null = null;
  private warnedModelNotLoaded = false;

  /**
   * Load the TensorFlow.js model
   * @param modelPath Path to model.json (relative to web root)
   */
  async loadModel(modelPath: string): Promise<void> {
    if (this.model || this.isLoading) return;

    this.isLoading = true;
    this.loadError = null;

    try {
      const tf = await getTF();

      this.model = await tf.loadGraphModel(modelPath);
      console.log('[DigitRecognizer] Model loaded successfully');

      // Warmup: first inference compiles WebGL shaders (causes freeze without this)
      await this.warmup();
    } catch (error) {
      this.loadError = error instanceof Error ? error : new Error(String(error));
      console.error('[DigitRecognizer] Failed to load model:', error);
      throw this.loadError;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Warmup the model by running a dummy inference
   * This pre-compiles WebGL shaders to avoid freeze on first real inference
   */
  private async warmup(): Promise<void> {
    if (!this.model || !tfModule) return;

    const t0 = performance.now();
    const dummyInput = tfModule.zeros([1, INPUT_SIZE, INPUT_SIZE, 1]);

    try {
      // Cast to Tensor since our model returns a single output tensor
      const prediction = this.model.execute(dummyInput) as Tensor;
      // Use async data() to avoid blocking - this also warms up the GPU pipeline
      await prediction.data();
      prediction.dispose();
      console.log(`[DigitRecognizer] Warmup completed in ${(performance.now() - t0).toFixed(0)}ms`);
    } finally {
      dummyInput.dispose();
    }
  }

  /**
   * Check if model is ready for inference
   */
  get isReady(): boolean {
    return this.model !== null && tfModule !== null;
  }

  /**
   * Compute simple geometry descriptors used for targeted ambiguity resolution.
   * Focuses on patterns that separate "1" and "7" in freehand writing.
   */
  private getStrokeGeometry(points: readonly StrokePoint[]): {
    aspectRatio: number;
    horizontalRatio: number;
    topSpanNorm: number;
    topHorizontalRatio: number;
    topCoverage: number;
  } {
    if (points.length === 0) {
      return {
        aspectRatio: 0,
        horizontalRatio: 0,
        topSpanNorm: 0,
        topHorizontalRatio: 0,
        topCoverage: 0,
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const aspectRatio = width / height;

    const topBandY = minY + height * 0.3;

    let totalDx = 0;
    let totalDy = 0;
    let topDx = 0;
    let topDy = 0;

    let topCount = 0;
    let topMinX = Infinity;
    let topMaxX = -Infinity;

    let prev: StrokePoint | null = null;
    for (const point of points) {
      const inTopBand = point.y <= topBandY;
      if (inTopBand) {
        topCount += 1;
        topMinX = Math.min(topMinX, point.x);
        topMaxX = Math.max(topMaxX, point.x);
      }

      if (prev && prev.strokeId === point.strokeId) {
        const dx = Math.abs(point.x - prev.x);
        const dy = Math.abs(point.y - prev.y);
        totalDx += dx;
        totalDy += dy;

        if (prev.y <= topBandY && point.y <= topBandY) {
          topDx += dx;
          topDy += dy;
        }
      }

      prev = point;
    }

    const totalTravel = totalDx + totalDy;
    const topTravel = topDx + topDy;

    return {
      aspectRatio,
      horizontalRatio: totalTravel > 0 ? totalDx / totalTravel : 0,
      topSpanNorm: topCount >= 2 ? Math.max(0, topMaxX - topMinX) / width : 0,
      topHorizontalRatio: topTravel > 0 ? topDx / topTravel : 0,
      topCoverage: topCount / points.length,
    };
  }

  /**
   * Resolve frequent ambiguity between 1 and 7 when model probabilities are close.
   * Keeps model output untouched when confidence gap is large.
   */
  private resolveOneSevenAmbiguity(
    points: readonly StrokePoint[],
    predictedDigit: number,
    probOne: number,
    probSeven: number,
  ): number {
    const probGap = Math.abs(probOne - probSeven);
    const maxCandidateProb = Math.max(probOne, probSeven);

    // Leave confident predictions unchanged.
    if (probGap > 0.2 || maxCandidateProb < 0.25) {
      return predictedDigit;
    }

    const g = this.getStrokeGeometry(points);

    // Typical "7": visible top bar + more horizontal movement.
    const likelySeven =
      (g.topSpanNorm >= 0.52 && g.topHorizontalRatio >= 0.62 && g.topCoverage >= 0.16) ||
      (g.aspectRatio >= 0.47 && g.horizontalRatio >= 0.46 && g.topSpanNorm >= 0.45);

    // Typical "1": slender shape with little top horizontal span.
    const likelyOne =
      (g.aspectRatio <= 0.4 && g.horizontalRatio <= 0.46 && g.topSpanNorm <= 0.44) ||
      (g.aspectRatio <= 0.36 && g.topSpanNorm < 0.4);

    if (likelySeven && !likelyOne) return 7;
    if (likelyOne && !likelySeven) return 1;

    // If geometry is inconclusive, keep probability ordering.
    return probSeven > probOne ? 7 : 1;
  }

  /**
   * Select final digit from model probabilities, with targeted 1/7 disambiguation.
   */
  private pickDigitFromProbabilities(
    points: readonly StrokePoint[],
    probabilities: ArrayLike<number>,
  ): { digit: number; score: number } {
    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const prob = probabilities[i] ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxIdx = i;
      }
    }

    const rawDigit = MODEL_DIGITS[maxIdx] ?? 0;
    if (DIGIT_ONE_INDEX < 0 || DIGIT_SEVEN_INDEX < 0) {
      return { digit: rawDigit, score: maxProb };
    }

    if (rawDigit === 1 || rawDigit === 7) {
      const probOne = probabilities[DIGIT_ONE_INDEX] ?? 0;
      const probSeven = probabilities[DIGIT_SEVEN_INDEX] ?? 0;
      const resolvedDigit = this.resolveOneSevenAmbiguity(points, rawDigit, probOne, probSeven);
      if (resolvedDigit !== rawDigit) {
        const resolvedScore = resolvedDigit === 1 ? probOne : probSeven;
        return { digit: resolvedDigit, score: resolvedScore };
      }
    }

    return { digit: rawDigit, score: maxProb };
  }

  /**
   * Recognize handwritten digit from stroke points (ASYNC - non-blocking)
   *
   * Returns -1 when there are no strokes or when the model isn't loaded.
   *
   * Uses async data() to avoid blocking the main thread during GPU readback.
   */
  async recognizeAsync(points: readonly StrokePoint[]): Promise<DigitRecognitionResult> {
    const t0 = performance.now();

    // No strokes = no digit
    if (points.length === 0) {
      return { digit: -1, digitString: '', score: 0, timeMs: performance.now() - t0 };
    }

    if (!this.model || !tfModule) {
      if (!this.warnedModelNotLoaded) {
        this.warnedModelNotLoaded = true;
        console.warn('[DigitRecognizer] Model not loaded; returning invalid digit (-1)');
      }
      return { digit: -1, digitString: '', score: 0, timeMs: performance.now() - t0 };
    }

    // Convert strokes to 28x28 image tensor
    const imageTensor = this.strokesToTensor(points);

    // Run inference (GraphModel uses execute instead of predict)
    const prediction = this.model.execute(imageTensor) as Tensor;
    // Use async data() to avoid blocking main thread during GPU readback
    const probabilities = (await prediction.data()) as Float32Array;

    // Clean up tensors
    imageTensor.dispose();
    prediction.dispose();

    const { digit, score } = this.pickDigitFromProbabilities(points, probabilities);
    const timeMs = performance.now() - t0;

    return { digit, digitString: String(digit), score, timeMs };
  }

  /**
   * Recognize handwritten digit from stroke points (SYNC - blocks main thread)
   *
   * @deprecated Use recognizeAsync() instead to avoid UI freezes
   */
  recognize(points: readonly StrokePoint[]): DigitRecognitionResult {
    const t0 = performance.now();

    // No strokes = no digit
    if (points.length === 0) {
      return { digit: -1, digitString: '', score: 0, timeMs: performance.now() - t0 };
    }

    if (!this.model || !tfModule) {
      if (!this.warnedModelNotLoaded) {
        this.warnedModelNotLoaded = true;
        console.warn('[DigitRecognizer] Model not loaded; returning invalid digit (-1)');
      }
      return { digit: -1, digitString: '', score: 0, timeMs: performance.now() - t0 };
    }

    // Convert strokes to 28x28 image tensor
    const imageTensor = this.strokesToTensor(points);

    // Run inference (GraphModel uses execute instead of predict)
    const prediction = this.model.execute(imageTensor) as Tensor;
    const probabilities = prediction.dataSync() as Float32Array;

    // Clean up tensors
    imageTensor.dispose();
    prediction.dispose();

    const { digit, score } = this.pickDigitFromProbabilities(points, probabilities);
    const timeMs = performance.now() - t0;

    return { digit, digitString: String(digit), score, timeMs };
  }

  /**
   * Recognize a multi-digit number (ASYNC - non-blocking)
   *
   * Uses async recognition to avoid blocking the main thread.
   */
  async recognizeNumberAsync(
    points: readonly StrokePoint[],
    options: RecognizeNumberOptions = {},
  ): Promise<{
    value: number;
    digits: DigitRecognitionResult[];
    confidence: number;
    timeMs: number;
  }> {
    const t0 = performance.now();

    if (points.length === 0) {
      return { value: NaN, digits: [], confidence: 0, timeMs: performance.now() - t0 };
    }

    // Group strokes by spatial position (left to right)
    // This handles multi-digit numbers
    const groups = this.groupStrokesByPosition(points);

    const minDigitConfidence = options.minDigitConfidence ?? DEFAULT_MIN_DIGIT_CONFIDENCE;

    // Recognize each group as a digit (async)
    const digits: DigitRecognitionResult[] = [];
    for (const group of groups) {
      digits.push(await this.recognizeAsync(group));
    }

    // Build the number from digits
    let value = 0;
    let minConfidence = 1;

    for (const d of digits) {
      if (d.digit < 0) {
        // Invalid digit, return NaN
        return { value: NaN, digits, confidence: 0, timeMs: performance.now() - t0 };
      }
      value = value * 10 + d.digit;
      minConfidence = Math.min(minConfidence, d.score);
    }

    if (digits.length > 0 && minConfidence < minDigitConfidence) {
      return {
        value: NaN,
        digits,
        confidence: minConfidence,
        timeMs: performance.now() - t0,
      };
    }

    return {
      value,
      digits,
      confidence: digits.length > 0 ? minConfidence : 0,
      timeMs: performance.now() - t0,
    };
  }

  /**
   * Recognize a multi-digit number from multiple stroke groups (SYNC)
   * Each group of strokes (separated by strokeId gaps) is a separate digit
   *
   * @deprecated Use recognizeNumberAsync() instead to avoid UI freezes
   */
  recognizeNumber(
    points: readonly StrokePoint[],
    options: RecognizeNumberOptions = {},
  ): {
    value: number;
    digits: DigitRecognitionResult[];
    confidence: number;
    timeMs: number;
  } {
    const t0 = performance.now();

    if (points.length === 0) {
      return { value: NaN, digits: [], confidence: 0, timeMs: performance.now() - t0 };
    }

    // Group strokes by spatial position (left to right)
    // This handles multi-digit numbers
    const groups = this.groupStrokesByPosition(points);

    const minDigitConfidence = options.minDigitConfidence ?? DEFAULT_MIN_DIGIT_CONFIDENCE;

    // Recognize each group as a digit
    const digits: DigitRecognitionResult[] = [];
    for (const group of groups) {
      digits.push(this.recognize(group));
    }

    // Build the number from digits
    let value = 0;
    let minConfidence = 1;

    for (const d of digits) {
      if (d.digit < 0) {
        // Invalid digit, return NaN
        return { value: NaN, digits, confidence: 0, timeMs: performance.now() - t0 };
      }
      value = value * 10 + d.digit;
      minConfidence = Math.min(minConfidence, d.score);
    }

    if (digits.length > 0 && minConfidence < minDigitConfidence) {
      return {
        value: NaN,
        digits,
        confidence: minConfidence,
        timeMs: performance.now() - t0,
      };
    }

    // Handle negative numbers (if first "digit" looks like a minus sign)
    // For now, we only support positive numbers

    return {
      value,
      digits,
      confidence: digits.length > 0 ? minConfidence : 0,
      timeMs: performance.now() - t0,
    };
  }

  /**
   * Group strokes by horizontal position for multi-digit recognition
   */
  private groupStrokesByPosition(points: readonly StrokePoint[]): StrokePoint[][] {
    if (points.length === 0) return [];

    // Find all unique stroke IDs and their bounding boxes
    const strokeBounds = new Map<
      number,
      { minX: number; maxX: number; centerX: number; width: number; points: StrokePoint[] }
    >();
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;

    for (const p of points) {
      let bounds = strokeBounds.get(p.strokeId);
      if (!bounds) {
        bounds = { minX: Infinity, maxX: -Infinity, centerX: 0, width: 0, points: [] };
        strokeBounds.set(p.strokeId, bounds);
      }
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.points.push(p);
      globalMinX = Math.min(globalMinX, p.x);
      globalMaxX = Math.max(globalMaxX, p.x);
    }

    const strokeItems = Array.from(strokeBounds.values()).map((b) => {
      const width = Math.max(1, b.maxX - b.minX);
      const centerX = (b.minX + b.maxX) / 2;
      return { ...b, width, centerX };
    });

    // Sort strokes by their center X position
    const sortedStrokes = strokeItems.sort((a, b) => a.centerX - b.centerX);

    function median(values: number[]): number {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const a = sorted[mid] ?? 0;
      if (sorted.length % 2 === 1) return a;
      const b = sorted[mid - 1] ?? a;
      return (a + b) / 2;
    }

    const overallWidth = Math.max(1, globalMaxX - globalMinX);
    const typicalStrokeWidth = Math.max(1, median(sortedStrokes.map((s) => s.width)));
    const multiDigitLikely = sortedStrokes.length >= 2 && overallWidth / typicalStrokeWidth >= 2.2;

    // Group strokes into digits using conservative gap/overlap heuristics.
    const groups: StrokePoint[][] = [];
    let currentGroup: StrokePoint[] = [];
    let groupMinX = Infinity;
    let groupMaxX = -Infinity;
    let groupCenterX = 0;

    for (const stroke of sortedStrokes) {
      if (currentGroup.length > 0) {
        const gap = stroke.minX - groupMaxX;
        const groupWidth = Math.max(1, groupMaxX - groupMinX);

        const overlap = Math.max(
          0,
          Math.min(groupMaxX, stroke.maxX) - Math.max(groupMinX, stroke.minX),
        );
        const union = Math.max(groupMaxX, stroke.maxX) - Math.min(groupMinX, stroke.minX);
        const overlapRatio = union > 0 ? overlap / union : 1;

        const centerGap = stroke.centerX - groupCenterX;
        const minGapPx = multiDigitLikely ? 4 : 10;
        const gapThreshold = Math.max(minGapPx, groupWidth * (multiDigitLikely ? 0.18 : 0.3));

        const shouldSplit =
          gap > gapThreshold ||
          (multiDigitLikely && overlapRatio < 0.15 && centerGap > Math.max(10, groupWidth * 0.5));

        if (shouldSplit) {
          groups.push(currentGroup);
          currentGroup = [];
          groupMinX = Infinity;
          groupMaxX = -Infinity;
          groupCenterX = 0;
        }
      }

      if (currentGroup.length === 0) {
        groupMinX = stroke.minX;
        groupMaxX = stroke.maxX;
        groupCenterX = (groupMinX + groupMaxX) / 2;
      } else {
        groupMinX = Math.min(groupMinX, stroke.minX);
        groupMaxX = Math.max(groupMaxX, stroke.maxX);
        groupCenterX = (groupMinX + groupMaxX) / 2;
      }

      currentGroup.push(...stroke.points);
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // If we ended up with a single group but the drawing looks "multi-digit wide",
    // attempt a simple 2-way split by stroke centers. This helps with close pairs
    // like "11" or "12" where the gap heuristic can be too strict.
    if (groups.length === 1 && multiDigitLikely && sortedStrokes.length >= 2) {
      const centerXs = sortedStrokes.map((s) => s.centerX);
      const meanCenter = centerXs.reduce((sum, x) => sum + x, 0) / centerXs.length;

      const left = sortedStrokes.filter((s) => s.centerX < meanCenter);
      const right = sortedStrokes.filter((s) => s.centerX >= meanCenter);

      if (left.length > 0 && right.length > 0) {
        const leftWidth =
          Math.max(...left.map((s) => s.maxX)) - Math.min(...left.map((s) => s.minX));
        const rightWidth =
          Math.max(...right.map((s) => s.maxX)) - Math.min(...right.map((s) => s.minX));

        // Avoid splitting a single digit made of multiple overlapping strokes.
        // Require the two halves to be reasonably separated in center space.
        const sortedCenters = [...centerXs].sort((a, b) => a - b);
        const centerSpread =
          (sortedCenters[sortedCenters.length - 1] ?? 0) - (sortedCenters[0] ?? 0);
        if (
          centerSpread > Math.max(12, typicalStrokeWidth * 1.2) &&
          leftWidth > 0 &&
          rightWidth > 0
        ) {
          return [left.flatMap((s) => s.points), right.flatMap((s) => s.points)];
        }
      }
    }

    return groups;
  }

  /**
   * Convert stroke points to a 28x28 grayscale image tensor
   * (Same algorithm as CNNRecognizer for consistency)
   */
  private strokesToTensor(points: readonly StrokePoint[]): Tensor4D {
    if (!tfModule) throw new Error('TensorFlow.js not loaded');

    // Find bounding box
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const size = Math.max(width, height, 1);

    // Add padding (10% on each side)
    const padding = size * 0.1;
    const scale = (INPUT_SIZE - 4) / (size + 2 * padding); // Leave 2px margin

    // Center in 28x28
    const offsetX = (INPUT_SIZE - (width + 2 * padding) * scale) / 2;
    const offsetY = (INPUT_SIZE - (height + 2 * padding) * scale) / 2;

    // Create 28x28 image buffer (0 = black, 1 = white)
    const imageData = new Float32Array(INPUT_SIZE * INPUT_SIZE);

    // Draw strokes with anti-aliasing simulation
    let prevPoint: StrokePoint | null = null;

    for (const point of points) {
      // Transform to 28x28 coordinates
      const x = (point.x - minX + padding) * scale + offsetX;
      const y = (point.y - minY + padding) * scale + offsetY;

      // Draw line from previous point if same stroke
      if (prevPoint && prevPoint.strokeId === point.strokeId) {
        const px = (prevPoint.x - minX + padding) * scale + offsetX;
        const py = (prevPoint.y - minY + padding) * scale + offsetY;
        this.drawLine(imageData, px, py, x, y);
      }

      // Draw point
      this.drawPoint(imageData, x, y);

      prevPoint = point;
    }

    // Create tensor [1, 28, 28, 1]
    return tfModule.tensor4d(imageData, [1, INPUT_SIZE, INPUT_SIZE, 1]);
  }

  /**
   * Draw a point with soft edges
   */
  private drawPoint(imageData: Float32Array, x: number, y: number): void {
    const radius = 1.5;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);

        if (px >= 0 && px < INPUT_SIZE && py >= 0 && py < INPUT_SIZE) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          const intensity = Math.max(0, 1 - dist / radius);
          const idx = py * INPUT_SIZE + px;
          imageData[idx] = Math.max(imageData[idx] ?? 0, intensity);
        }
      }
    }
  }

  /**
   * Draw a line between two points using Bresenham's algorithm with thickness
   */
  private drawLine(imageData: Float32Array, x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const steps = Math.max(dx, dy, 1);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.drawPoint(imageData, x, y);
    }
  }

  /**
   * Dispose of the model to free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}

/**
 * Create a digit recognizer (model loading is async)
 */
export function createDigitRecognizer(): DigitRecognizer {
  return new DigitRecognizer();
}

// =============================================================================
// Singleton instance (avoids reloading model on each component mount)
// =============================================================================

let singletonDigitRecognizer: DigitRecognizer | null = null;
let singletonDigitLoadPromise: Promise<DigitRecognizer> | null = null;
const DEFAULT_DIGIT_MODEL_PATH = '/models/emnist-digits/model.json';

function getDigitModelPathCandidates(modelPath: string): string[] {
  const candidates = new Set<string>();
  candidates.add(modelPath);

  // Some dev setups serve static assets under "/public".
  // Keep a fallback to avoid loading HTML from history-fallback routes.
  if (modelPath.startsWith('/')) {
    candidates.add(`/public${modelPath}`);
  }

  // Extra safety for the default model path.
  if (modelPath === DEFAULT_DIGIT_MODEL_PATH) {
    candidates.add('/public/models/emnist-digits/model.json');
  }

  return Array.from(candidates);
}

/**
 * Get a shared digit recognizer instance.
 * The model is loaded once and reused across all components.
 *
 * @param modelPath Path to model.json (default: '/models/emnist-digits/model.json')
 */
export async function getSharedDigitRecognizer(
  modelPath = DEFAULT_DIGIT_MODEL_PATH,
): Promise<DigitRecognizer> {
  if (singletonDigitRecognizer?.isReady) {
    return singletonDigitRecognizer;
  }

  if (!singletonDigitLoadPromise) {
    singletonDigitLoadPromise = (async () => {
      const recognizer = new DigitRecognizer();
      const candidates = getDigitModelPathCandidates(modelPath);
      let lastError: unknown = null;

      for (const candidatePath of candidates) {
        try {
          await recognizer.loadModel(candidatePath);
          if (candidatePath !== modelPath) {
            console.warn(
              `[DigitRecognizer] Loaded model from fallback path: ${candidatePath} (requested: ${modelPath})`,
            );
          }
          singletonDigitRecognizer = recognizer;
          return recognizer;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Failed to load digit model from paths: ${candidates.join(', ')}`);
    })().catch((error) => {
      // Allow retries after a failed attempt.
      singletonDigitLoadPromise = null;
      throw error;
    });

    singletonDigitLoadPromise = singletonDigitLoadPromise.then((recognizer) => {
      singletonDigitRecognizer = recognizer;
      return recognizer;
    });
  }

  return singletonDigitLoadPromise;
}

/**
 * Check if the shared digit recognizer is ready (model loaded).
 */
export function isSharedDigitRecognizerReady(): boolean {
  return singletonDigitRecognizer?.isReady ?? false;
}

/**
 * Dispose the shared digit recognizer (for cleanup/testing).
 */
export function disposeSharedDigitRecognizer(): void {
  if (singletonDigitRecognizer) {
    singletonDigitRecognizer.dispose();
    singletonDigitRecognizer = null;
    singletonDigitLoadPromise = null;
  }
}
