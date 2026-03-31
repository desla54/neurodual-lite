import type { Coordinate } from 'recharts';

export interface TooltipViewportPointInput {
  readonly containerRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  readonly coordinate: Coordinate;
  readonly offsetY: number;
  readonly isRotatedFullscreen: boolean;
}

export function resolveTooltipViewportPoint({
  containerRect,
  coordinate,
  offsetY,
  isRotatedFullscreen,
}: TooltipViewportPointInput): { left: number; top: number } {
  if (isRotatedFullscreen) {
    return {
      left: containerRect.left + (containerRect.width - coordinate.y),
      top: containerRect.top + coordinate.x - offsetY,
    };
  }

  return {
    left: containerRect.left + coordinate.x,
    top: containerRect.top + coordinate.y - offsetY,
  };
}
