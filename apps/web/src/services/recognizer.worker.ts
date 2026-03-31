import {
  getSharedCNNRecognizer,
  getSharedDigitRecognizer,
  type DigitRecognitionResult,
  type RecognitionResult,
} from '@neurodual/infra';
import type {
  RecognizerStrokePoint,
  RecognizerWorkerRequest,
  RecognizerWorkerResponse,
  WorkerDigitNumberRecognitionResult,
} from './recognizer-worker-protocol';

const workerScope = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<RecognizerWorkerRequest>) => void) | null;
  postMessage: (message: RecognizerWorkerResponse) => void;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function postSuccess(id: number, result: unknown): void {
  const message: RecognizerWorkerResponse = { id, ok: true, result };
  workerScope.postMessage(message);
}

function postFailure(id: number, error: unknown): void {
  const message: RecognizerWorkerResponse = {
    id,
    ok: false,
    error: toErrorMessage(error),
  };
  workerScope.postMessage(message);
}

function normalizePoints(points: readonly RecognizerStrokePoint[]): RecognizerStrokePoint[] {
  return points.map((point) => ({
    x: point.x,
    y: point.y,
    strokeId: point.strokeId,
  }));
}

/** Track which letter model path was last initialized */
let activeLetterModelPath: string | undefined;

async function recognizeLetter(
  points: readonly RecognizerStrokePoint[],
): Promise<RecognitionResult> {
  const recognizer = await getSharedCNNRecognizer(activeLetterModelPath);
  return recognizer.recognizeAsync(normalizePoints(points));
}

async function recognizeDigit(
  points: readonly RecognizerStrokePoint[],
): Promise<DigitRecognitionResult> {
  const recognizer = await getSharedDigitRecognizer();
  return recognizer.recognizeAsync(normalizePoints(points));
}

async function recognizeNumber(
  points: readonly RecognizerStrokePoint[],
  options?: { readonly minDigitConfidence?: number },
): Promise<WorkerDigitNumberRecognitionResult> {
  const recognizer = await getSharedDigitRecognizer();
  return recognizer.recognizeNumberAsync(normalizePoints(points), options);
}

workerScope.onmessage = (event: MessageEvent<RecognizerWorkerRequest>) => {
  void (async () => {
    const message = event.data;
    try {
      switch (message.type) {
        case 'init-letter': {
          activeLetterModelPath = message.modelPath;
          await getSharedCNNRecognizer(message.modelPath);
          postSuccess(message.id, { ready: true });
          return;
        }
        case 'recognize-letter': {
          postSuccess(message.id, await recognizeLetter(message.points));
          return;
        }
        case 'init-digit': {
          await getSharedDigitRecognizer(message.modelPath);
          postSuccess(message.id, { ready: true });
          return;
        }
        case 'recognize-digit': {
          postSuccess(message.id, await recognizeDigit(message.points));
          return;
        }
        case 'recognize-number': {
          postSuccess(message.id, await recognizeNumber(message.points, message.options));
          return;
        }
      }
    } catch (error) {
      postFailure(message.id, error);
    }
  })();
};
