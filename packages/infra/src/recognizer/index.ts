/**
 * Handwriting Recognition Module
 *
 * Production: CNN Recognizers (TensorFlow.js)
 * - CNNRecognizer: Letters (C, H, K, L, Q, R, S, T)
 * - DigitRecognizer: Digits (0-9) for arithmetic interference
 *
 * Alternative ($Q recognizer) moved to tools/qdollar-recognizer/
 * for potential future use on low-resource devices.
 */

// Letter recognizer (Dual Trace mode)
export {
  CNNRecognizer,
  createCNNRecognizer,
  getSharedCNNRecognizer,
  isSharedCNNRecognizerReady,
  disposeSharedCNNRecognizer,
  type StrokePoint,
  type RecognitionResult,
} from './cnn-recognizer';

// Digit recognizer (Arithmetic interference)
export {
  DigitRecognizer,
  createDigitRecognizer,
  getSharedDigitRecognizer,
  isSharedDigitRecognizerReady,
  disposeSharedDigitRecognizer,
  type DigitRecognitionResult,
} from './digit-recognizer';

// Direction recognizer (geometric, no ML model)
export {
  DirectionRecognizer,
  getSharedDirectionRecognizer,
  type DirectionStrokePoint,
  type DirectionRecognitionResult,
} from './direction-recognizer';
