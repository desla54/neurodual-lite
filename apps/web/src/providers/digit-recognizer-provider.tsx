import type { ReactNode } from 'react';
import { DigitRecognizerProvider, type DigitRecognizerLoader } from '@neurodual/ui';
import { getSharedWorkerDigitRecognizer } from '../services/recognizer-worker-client';

const loader: DigitRecognizerLoader = async (modelPath?: string) => {
  return getSharedWorkerDigitRecognizer(modelPath);
};

export function WebDigitRecognizerProvider({ children }: { children: ReactNode }): ReactNode {
  return <DigitRecognizerProvider loader={loader}>{children}</DigitRecognizerProvider>;
}
