export interface RecognizerStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface WorkerLetterRecognitionResult {
  readonly letter: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface WorkerDigitRecognitionResult {
  readonly digit: number;
  readonly digitString: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface WorkerDigitNumberRecognitionResult {
  readonly value: number;
  readonly digits: readonly WorkerDigitRecognitionResult[];
  readonly confidence: number;
  readonly timeMs: number;
}

export interface WorkerRecognizeNumberOptions {
  readonly minDigitConfidence?: number;
}

export type RecognizerWorkerRequest =
  | {
      readonly id: number;
      readonly type: 'init-letter';
      readonly modelPath: string;
    }
  | {
      readonly id: number;
      readonly type: 'recognize-letter';
      readonly points: readonly RecognizerStrokePoint[];
    }
  | {
      readonly id: number;
      readonly type: 'init-digit';
      readonly modelPath?: string;
    }
  | {
      readonly id: number;
      readonly type: 'recognize-digit';
      readonly points: readonly RecognizerStrokePoint[];
    }
  | {
      readonly id: number;
      readonly type: 'recognize-number';
      readonly points: readonly RecognizerStrokePoint[];
      readonly options?: WorkerRecognizeNumberOptions;
    };

export type RecognizerWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: string;
    };
