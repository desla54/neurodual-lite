import { describe, expect, it } from 'bun:test';
import { resolveTooltipViewportPoint } from './tooltip-position';

describe('resolveTooltipViewportPoint', () => {
  it('uses regular chart coordinates outside rotated fullscreen', () => {
    expect(
      resolveTooltipViewportPoint({
        containerRect: { left: 100, top: 50, width: 320, height: 180 },
        coordinate: { x: 40, y: 70 },
        offsetY: 12,
        isRotatedFullscreen: false,
      }),
    ).toEqual({ left: 140, top: 108 });
  });

  it('swaps and mirrors the active point for rotated fullscreen charts', () => {
    expect(
      resolveTooltipViewportPoint({
        containerRect: { left: 0, top: 0, width: 390, height: 844 },
        coordinate: { x: 120, y: 80 },
        offsetY: 12,
        isRotatedFullscreen: true,
      }),
    ).toEqual({ left: 310, top: 108 });
  });
});
