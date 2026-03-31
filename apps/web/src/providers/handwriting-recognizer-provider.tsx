import type { ReactNode } from 'react';
import { HandwritingRecognizerProvider, type HandwritingRecognizerLoader } from '@neurodual/ui';
import { getSharedWorkerHandwritingRecognizer } from '../services/recognizer-worker-client';

const loader: HandwritingRecognizerLoader = async (modelPath: string) => {
  return getSharedWorkerHandwritingRecognizer(modelPath);
};

export function WebHandwritingRecognizerProvider({ children }: { children: ReactNode }): ReactNode {
  return <HandwritingRecognizerProvider loader={loader}>{children}</HandwritingRecognizerProvider>;
}
