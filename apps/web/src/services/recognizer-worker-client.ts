import type {
  DigitNumberRecognitionResult,
  DigitRecognitionResult,
  DigitRecognizer,
  DigitStrokePoint,
  HandwritingRecognitionResult,
  HandwritingRecognizer,
  HandwritingStrokePoint,
  RecognizeNumberOptions,
} from '@neurodual/ui';
import type {
  RecognizerStrokePoint,
  RecognizerWorkerRequest,
  RecognizerWorkerResponse,
  WorkerDigitNumberRecognitionResult,
} from './recognizer-worker-protocol';
import RecognizerWorker from './recognizer.worker?worker';

const DEFAULT_LETTER_MODEL_PATH = '/models/emnist-letters/model.json';
const DEFAULT_DIGIT_MODEL_PATH = '/models/emnist-digits/model.json';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type RecognizerWorkerRequestInput = RecognizerWorkerRequest extends infer TRequest
  ? TRequest extends { readonly id: number }
    ? Omit<TRequest, 'id'>
    : never
  : never;

interface RecognizerWorkerState {
  worker: Worker | null;
  nextId: number;
  pending: Map<number, PendingRequest>;
}

function getGlobalState(): RecognizerWorkerState {
  const globalState = globalThis as typeof globalThis & {
    __neurodualRecognizerWorkerState__?: RecognizerWorkerState;
  };

  if (globalState.__neurodualRecognizerWorkerState__) {
    return globalState.__neurodualRecognizerWorkerState__;
  }

  const state: RecognizerWorkerState = {
    worker: null,
    nextId: 1,
    pending: new Map(),
  };
  globalState.__neurodualRecognizerWorkerState__ = state;
  return state;
}

function normalizePoints(
  points: readonly HandwritingStrokePoint[] | readonly DigitStrokePoint[],
): RecognizerStrokePoint[] {
  return points.map((point) => ({
    x: point.x,
    y: point.y,
    strokeId: point.strokeId,
  }));
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function ensureWorker(): Worker {
  const state = getGlobalState();
  if (state.worker) return state.worker;

  const worker = new RecognizerWorker({
    name: 'neurodual-recognizer',
  });

  worker.onmessage = (event: MessageEvent<RecognizerWorkerResponse>) => {
    const pending = state.pending.get(event.data.id);
    if (!pending) return;
    state.pending.delete(event.data.id);
    if (event.data.ok) {
      pending.resolve(event.data.result);
      return;
    }
    pending.reject(new Error(event.data.error));
  };

  worker.onerror = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Recognizer worker error');
    for (const pending of state.pending.values()) {
      pending.reject(error);
    }
    state.pending.clear();
    state.worker = null;
  };

  state.worker = worker;
  return worker;
}

function terminateWorker(): void {
  const state = getGlobalState();
  state.worker?.terminate();
  state.worker = null;
  for (const pending of state.pending.values()) {
    pending.reject(new Error('Recognizer worker terminated'));
  }
  state.pending.clear();
}

async function callWorker<TResponse>(message: RecognizerWorkerRequestInput): Promise<TResponse> {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Worker unavailable');
  }

  const state = getGlobalState();
  const worker = ensureWorker();
  const id = state.nextId++;

  return await new Promise<TResponse>((resolve, reject) => {
    state.pending.set(id, {
      resolve: (value) => resolve(value as TResponse),
      reject,
    });
    worker.postMessage({ ...message, id } as RecognizerWorkerRequest);
  });
}

async function loadMainThreadLetterRecognizer(modelPath: string): Promise<HandwritingRecognizer> {
  const { getSharedCNNRecognizer } = await import('@neurodual/infra');
  return getSharedCNNRecognizer(modelPath);
}

async function loadMainThreadDigitRecognizer(modelPath: string): Promise<DigitRecognizer> {
  const { getSharedDigitRecognizer } = await import('@neurodual/infra');
  return getSharedDigitRecognizer(modelPath);
}

let letterReady = false;
let activeLetterModelPath: string | null = null;
let letterInitPromise: Promise<HandwritingRecognizer> | null = null;

const letterWorkerRecognizer: HandwritingRecognizer = {
  get isReady() {
    return letterReady;
  },
  async recognizeAsync(
    points: readonly HandwritingStrokePoint[],
  ): Promise<HandwritingRecognitionResult> {
    return await callWorker<HandwritingRecognitionResult>({
      type: 'recognize-letter',
      points: normalizePoints(points),
    });
  },
};

export async function getSharedWorkerHandwritingRecognizer(
  modelPath = DEFAULT_LETTER_MODEL_PATH,
): Promise<HandwritingRecognizer> {
  if (typeof Worker === 'undefined') {
    return loadMainThreadLetterRecognizer(modelPath);
  }

  if (letterReady && activeLetterModelPath === modelPath) {
    return letterWorkerRecognizer;
  }

  if (!letterInitPromise || activeLetterModelPath !== modelPath) {
    activeLetterModelPath = modelPath;
    letterReady = false;
    letterInitPromise = callWorker<{ ready: true }>({
      type: 'init-letter',
      modelPath,
    })
      .then(() => {
        letterReady = true;
        return letterWorkerRecognizer;
      })
      .catch((error) => {
        letterInitPromise = null;
        activeLetterModelPath = null;
        return loadMainThreadLetterRecognizer(modelPath).catch(() => {
          throw toError(error);
        });
      });
  }

  return letterInitPromise;
}

let digitReady = false;
let activeDigitModelPath: string | null = null;
let digitInitPromise: Promise<DigitRecognizer> | null = null;

const digitWorkerRecognizer: DigitRecognizer = {
  get isReady() {
    return digitReady;
  },
  async recognizeAsync(points: readonly DigitStrokePoint[]): Promise<DigitRecognitionResult> {
    return await callWorker<DigitRecognitionResult>({
      type: 'recognize-digit',
      points: normalizePoints(points),
    });
  },
  async recognizeNumberAsync(
    points: readonly DigitStrokePoint[],
    options?: RecognizeNumberOptions,
  ): Promise<DigitNumberRecognitionResult> {
    const result = await callWorker<WorkerDigitNumberRecognitionResult>({
      type: 'recognize-number',
      points: normalizePoints(points),
      options,
    });
    return {
      value: result.value,
      digits: result.digits,
      confidence: result.confidence,
      timeMs: result.timeMs,
    };
  },
};

export async function getSharedWorkerDigitRecognizer(
  modelPath = DEFAULT_DIGIT_MODEL_PATH,
): Promise<DigitRecognizer> {
  if (typeof Worker === 'undefined') {
    return loadMainThreadDigitRecognizer(modelPath);
  }

  if (digitReady && activeDigitModelPath === modelPath) {
    return digitWorkerRecognizer;
  }

  if (!digitInitPromise || activeDigitModelPath !== modelPath) {
    activeDigitModelPath = modelPath;
    digitReady = false;
    digitInitPromise = callWorker<{ ready: true }>({
      type: 'init-digit',
      modelPath,
    })
      .then(() => {
        digitReady = true;
        return digitWorkerRecognizer;
      })
      .catch((error) => {
        digitInitPromise = null;
        activeDigitModelPath = null;
        return loadMainThreadDigitRecognizer(modelPath).catch(() => {
          throw toError(error);
        });
      });
  }

  return digitInitPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    terminateWorker();
    letterReady = false;
    activeLetterModelPath = null;
    letterInitPromise = null;
    digitReady = false;
    activeDigitModelPath = null;
    digitInitPromise = null;
  });
}
