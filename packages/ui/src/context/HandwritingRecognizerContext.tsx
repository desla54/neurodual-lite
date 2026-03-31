'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface HandwritingStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface HandwritingRecognitionResult {
  readonly letter: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface HandwritingRecognizer {
  readonly isReady: boolean;
  recognizeAsync(points: readonly HandwritingStrokePoint[]): Promise<HandwritingRecognitionResult>;
}

export type HandwritingRecognizerLoader = (modelPath: string) => Promise<HandwritingRecognizer>;

const HandwritingRecognizerContext = createContext<HandwritingRecognizerLoader | null>(null);

export function HandwritingRecognizerProvider({
  children,
  loader,
}: {
  children: ReactNode;
  loader: HandwritingRecognizerLoader;
}): ReactNode {
  return (
    <HandwritingRecognizerContext.Provider value={loader}>
      {children}
    </HandwritingRecognizerContext.Provider>
  );
}

export function useOptionalHandwritingRecognizerLoader(): HandwritingRecognizerLoader | null {
  return useContext(HandwritingRecognizerContext);
}

export function useHandwritingRecognizerLoader(): HandwritingRecognizerLoader {
  const ctx = useContext(HandwritingRecognizerContext);
  if (!ctx) {
    throw new Error('HandwritingRecognizerProvider is missing');
  }
  return ctx;
}
