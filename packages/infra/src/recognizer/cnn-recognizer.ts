/**
 * CNN Letter Recognizer using TensorFlow.js
 *
 * Uses a CNN trained on EMNIST letters dataset for high-accuracy recognition.
 * Supports the 8 letters used in Dual Trace: C, H, K, L, N, S, T, Q
 *
 * TensorFlow.js is loaded dynamically to avoid blocking the main thread
 * during WebGL backend initialization.
 */

// Types (self-contained, no dependency on $Q recognizer)
export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface RecognitionResult {
  readonly letter: string;
  readonly score: number; // 0-1, higher is better
  readonly timeMs: number;
}

// Fallback letter set (used when metadata.json is unavailable)
const MODEL_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;
const INPUT_SIZE = 28;

const DEFAULT_LETTER_MODEL_PATH = '/models/emnist-letters/model.json';

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
        `[CNNRecognizer] TensorFlow.js loaded in ${(performance.now() - t0).toFixed(0)}ms, backend: ${tf.getBackend()}`,
      );
      tfModule = tf;
      return tf;
    })();
  }

  return tfLoadPromise;
}

export class CNNRecognizer {
  private model: GraphModel | null = null;
  private isLoading = false;
  private loadError: Error | null = null;
  private warnedModelNotLoaded = false;
  /** Letters this model can recognize (loaded from metadata or default) */
  private letters: readonly string[] = MODEL_LETTERS;

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

      // Try to load metadata.json alongside model.json to get the letter list
      const metadataPath = modelPath.replace(/model\.json$/, 'metadata.json');
      try {
        const resp = await fetch(metadataPath);
        if (resp.ok) {
          const meta = await resp.json();
          // Support multiple metadata key names (letters, shapes, directions, etc.)
          const classes = meta.letters ?? meta.shapes ?? meta.directions ?? meta.classes;
          if (Array.isArray(classes) && classes.length > 0) {
            this.letters = classes as string[];
            console.log(`[CNNRecognizer] Loaded ${this.letters.length} classes from metadata`);
          }
        }
      } catch {
        // metadata.json is optional — fall back to hardcoded MODEL_LETTERS
      }

      this.model = await tf.loadGraphModel(modelPath);
      console.log('[CNNRecognizer] Model loaded successfully');

      // Warmup: first inference compiles WebGL shaders (causes freeze without this)
      await this.warmup();
    } catch (error) {
      this.loadError = error instanceof Error ? error : new Error(String(error));
      console.error('[CNNRecognizer] Failed to load model:', error);
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
      console.log(`[CNNRecognizer] Warmup completed in ${(performance.now() - t0).toFixed(0)}ms`);
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
   * Recognize handwritten letter from stroke points (ASYNC - non-blocking)
   *
   * Returns an empty string when there are no strokes or when the model isn't loaded.
   *
   * Uses async data() to avoid blocking the main thread during GPU readback.
   */
  async recognizeAsync(points: readonly StrokePoint[]): Promise<RecognitionResult> {
    const t0 = performance.now();

    // No strokes = no letter
    if (points.length === 0) {
      return { letter: '', score: 0, timeMs: performance.now() - t0 };
    }

    if (!this.model || !tfModule) {
      if (!this.warnedModelNotLoaded) {
        this.warnedModelNotLoaded = true;
        console.warn('[CNNRecognizer] Model not loaded; returning empty recognition');
      }
      return { letter: '', score: 0, timeMs: performance.now() - t0 };
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

    // Find best prediction
    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const prob = probabilities[i] ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxIdx = i;
      }
    }

    const letter = this.letters[maxIdx] ?? '';
    const timeMs = performance.now() - t0;

    return { letter, score: maxProb, timeMs };
  }

  /**
   * Recognize handwritten letter from stroke points (SYNC - blocks main thread)
   *
   * @deprecated Use recognizeAsync() instead to avoid UI freezes
   */
  recognize(points: readonly StrokePoint[]): RecognitionResult {
    const t0 = performance.now();

    // No strokes = no letter
    if (points.length === 0) {
      return { letter: '', score: 0, timeMs: performance.now() - t0 };
    }

    if (!this.model || !tfModule) {
      if (!this.warnedModelNotLoaded) {
        this.warnedModelNotLoaded = true;
        console.warn('[CNNRecognizer] Model not loaded; returning empty recognition');
      }
      return { letter: '', score: 0, timeMs: performance.now() - t0 };
    }

    // Convert strokes to 28x28 image tensor
    const imageTensor = this.strokesToTensor(points);

    // Run inference (GraphModel uses execute instead of predict)
    const prediction = this.model.execute(imageTensor) as Tensor;
    const probabilities = prediction.dataSync() as Float32Array;

    // Clean up tensors
    imageTensor.dispose();
    prediction.dispose();

    // Find best prediction
    let maxProb = 0;
    let maxIdx = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const prob = probabilities[i] ?? 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxIdx = i;
      }
    }

    const letter = this.letters[maxIdx] ?? '';
    const timeMs = performance.now() - t0;

    return { letter, score: maxProb, timeMs };
  }

  /**
   * Get all recognition candidates with scores
   */
  recognizeByLetter(points: readonly StrokePoint[]): RecognitionResult[] {
    const t0 = performance.now();

    if (!this.model || !tfModule || points.length === 0) {
      return [];
    }

    // Convert strokes to tensor
    const imageTensor = this.strokesToTensor(points);

    // Run inference (GraphModel uses execute instead of predict)
    const prediction = this.model.execute(imageTensor) as Tensor;
    const probabilities = prediction.dataSync() as Float32Array;

    // Clean up
    imageTensor.dispose();
    prediction.dispose();

    const timeMs = performance.now() - t0;

    // Build sorted results
    const results: RecognitionResult[] = this.letters.map((letter, i) => ({
      letter,
      score: probabilities[i] ?? 0,
      timeMs,
    }));

    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Convert stroke points to a 28x28 grayscale image tensor
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

    // EMNIST images are white on black, so we need to invert
    // Our imageData is already white (1.0) strokes on black (0.0) background

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
 * Create a CNN recognizer (model loading is async)
 */
export function createCNNRecognizer(): CNNRecognizer {
  return new CNNRecognizer();
}

// =============================================================================
// Singleton instance (avoids reloading model on each component mount)
// =============================================================================

let singletonRecognizer: CNNRecognizer | null = null;
let singletonLoadPromise: Promise<CNNRecognizer> | null = null;
let singletonModelPath: string | null = null;

function getLetterModelPathCandidates(modelPath: string): string[] {
  const candidates = new Set<string>();
  candidates.add(modelPath);

  // Some dev setups serve static assets under "/public".
  // Keep a fallback to avoid loading HTML from history-fallback routes.
  if (modelPath.startsWith('/')) {
    candidates.add(`/public${modelPath}`);
  }

  // Extra safety for the default model path.
  if (modelPath === DEFAULT_LETTER_MODEL_PATH) {
    candidates.add('/public/models/emnist-letters/model.json');
  }

  return Array.from(candidates);
}

/**
 * Get a shared CNN recognizer instance.
 * The model is loaded once and reused across all components.
 * If a different modelPath is requested, the previous model is disposed and a new one is loaded.
 *
 * @param modelPath Path to model.json (default: '/models/emnist-letters/model.json')
 */
export async function getSharedCNNRecognizer(
  modelPath = DEFAULT_LETTER_MODEL_PATH,
): Promise<CNNRecognizer> {
  // If already loaded with the same path, return cached
  if (singletonRecognizer?.isReady && singletonModelPath === modelPath) {
    return singletonRecognizer;
  }

  // If a different model is requested, dispose the old one
  if (singletonRecognizer && singletonModelPath !== modelPath) {
    singletonRecognizer.dispose();
    singletonRecognizer = null;
    singletonLoadPromise = null;
    singletonModelPath = null;
  }

  if (!singletonLoadPromise) {
    singletonModelPath = modelPath;
    singletonLoadPromise = (async () => {
      const recognizer = new CNNRecognizer();
      const candidates = getLetterModelPathCandidates(modelPath);
      let lastError: unknown = null;

      for (const candidatePath of candidates) {
        try {
          await recognizer.loadModel(candidatePath);
          if (candidatePath !== modelPath) {
            console.warn(
              `[CNNRecognizer] Loaded model from fallback path: ${candidatePath} (requested: ${modelPath})`,
            );
          }
          singletonRecognizer = recognizer;
          return recognizer;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Failed to load letter model from paths: ${candidates.join(', ')}`);
    })().catch((error) => {
      // Allow retries after a failed attempt.
      singletonLoadPromise = null;
      singletonModelPath = null;
      throw error;
    });

    singletonLoadPromise = singletonLoadPromise.then((recognizer) => {
      singletonRecognizer = recognizer;
      return recognizer;
    });
  }

  return singletonLoadPromise;
}

/**
 * Check if the shared recognizer is ready (model loaded).
 */
export function isSharedCNNRecognizerReady(): boolean {
  return singletonRecognizer?.isReady ?? false;
}

/**
 * Dispose the shared recognizer (for cleanup/testing).
 */
export function disposeSharedCNNRecognizer(): void {
  if (singletonRecognizer) {
    singletonRecognizer.dispose();
    singletonRecognizer = null;
    singletonLoadPromise = null;
  }
}
