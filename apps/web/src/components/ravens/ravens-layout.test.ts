import { describe, expect, it } from 'bun:test';

import {
  GRID4_SLOTS,
  OUT_IN_GRID_SLOTS,
  decodeFlattenedPosition,
  resolveSlotIndex,
  resolveSlotPosition,
} from './ravens-layout';

describe('ravens-layout helpers', () => {
  it('preserves single-entity positional slots in grid layouts', () => {
    const slot = resolveSlotPosition(GRID4_SLOTS, 3, 0);

    expect(slot).toEqual(GRID4_SLOTS[3]);
  });

  it('decodes flattened multi-component positions for out_in_grid inner entities', () => {
    expect(decodeFlattenedPosition(10, 0)).toBe(0);
    expect(decodeFlattenedPosition(13, 0)).toBe(3);
    expect(resolveSlotIndex(OUT_IN_GRID_SLOTS, 12, 0)).toBe(2);
    expect(resolveSlotPosition(OUT_IN_GRID_SLOTS, 11, 0)).toEqual(OUT_IN_GRID_SLOTS[1]);
  });

  it('falls back to the visual order when the decoded position is invalid', () => {
    expect(resolveSlotIndex(OUT_IN_GRID_SLOTS, 19, 2)).toBe(2);
    expect(resolveSlotPosition(OUT_IN_GRID_SLOTS, undefined, 1)).toEqual(OUT_IN_GRID_SLOTS[1]);
  });
});
