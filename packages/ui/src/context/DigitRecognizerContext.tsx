'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface DigitStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly strokeId: number;
}

export interface DigitRecognitionResult {
  readonly digit: number;
  readonly digitString: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface RecognizeNumberOptions {
  readonly minDigitConfidence?: number;
}

export interface DigitNumberRecognitionResult {
  readonly value: number;
  readonly digits: readonly DigitRecognitionResult[];
  readonly confidence: number;
  readonly timeMs: number;
}

export interface DigitRecognizer {
  readonly isReady: boolean;
  recognizeAsync(points: readonly DigitStrokePoint[]): Promise<DigitRecognitionResult>;
  recognizeNumberAsync(
    points: readonly DigitStrokePoint[],
    options?: RecognizeNumberOptions,
  ): Promise<DigitNumberRecognitionResult>;
}

export type DigitRecognizerLoader = (modelPath?: string) => Promise<DigitRecognizer>;

const DigitRecognizerContext = createContext<DigitRecognizerLoader | null>(null);

export function DigitRecognizerProvider({
  children,
  loader,
}: {
  children: ReactNode;
  loader: DigitRecognizerLoader;
}): ReactNode {
  return (
    <DigitRecognizerContext.Provider value={loader}>{children}</DigitRecognizerContext.Provider>
  );
}

export function useOptionalDigitRecognizerLoader(): DigitRecognizerLoader | null {
  return useContext(DigitRecognizerContext);
}

export function useDigitRecognizerLoader(): DigitRecognizerLoader {
  const ctx = useContext(DigitRecognizerContext);
  if (!ctx) {
    throw new Error('DigitRecognizerProvider is missing');
  }
  return ctx;
}
