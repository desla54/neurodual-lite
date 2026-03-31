/**
 * Trace Input Components
 *
 * Handwriting recognition and drawing canvas for Dual Trace mode.
 */

export {
  DrawingCanvas,
  canvasStrokesToPoints,
  type DrawingCanvasProps,
  type Point,
  type Stroke,
  type StrokePoint,
} from './DrawingCanvas';

export { WritingZone, useHandwritingRecognizer, type WritingZoneProps } from './WritingZone';

export {
  CircularSelector,
  type CircularSelectorItem,
  type CircularSelectorProps,
} from './CircularSelector';
