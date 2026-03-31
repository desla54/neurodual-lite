export interface SlotPosition {
  readonly x: number;
  readonly y: number;
}

export const GRID4_SLOTS: readonly SlotPosition[] = [
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.7 },
];

export const GRID9_SLOTS: readonly SlotPosition[] = [
  { x: 0.22, y: 0.22 },
  { x: 0.5, y: 0.22 },
  { x: 0.78, y: 0.22 },
  { x: 0.22, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.78, y: 0.5 },
  { x: 0.22, y: 0.78 },
  { x: 0.5, y: 0.78 },
  { x: 0.78, y: 0.78 },
];

export const GRID5_SLOTS: readonly SlotPosition[] = [
  { x: 0.3, y: 0.25 },
  { x: 0.7, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.3, y: 0.75 },
  { x: 0.7, y: 0.75 },
];

export const OUT_IN_GRID_SLOTS: readonly SlotPosition[] = [
  { x: 0.32, y: 0.32 },
  { x: 0.68, y: 0.32 },
  { x: 0.32, y: 0.68 },
  { x: 0.68, y: 0.68 },
];

export function decodeFlattenedPosition(
  position: number | undefined,
  fallbackIndex: number,
): number {
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    return fallbackIndex;
  }
  const normalized = Math.trunc(position);
  return normalized >= 10 ? normalized % 10 : normalized;
}

export function resolveSlotIndex(
  slots: readonly SlotPosition[],
  position: number | undefined,
  fallbackIndex: number,
): number {
  const decoded = decodeFlattenedPosition(position, fallbackIndex);
  if (decoded >= 0 && decoded < slots.length) {
    return decoded;
  }
  if (fallbackIndex >= 0 && fallbackIndex < slots.length) {
    return fallbackIndex;
  }
  return 0;
}

export function resolveSlotPosition(
  slots: readonly SlotPosition[],
  position: number | undefined,
  fallbackIndex: number,
): SlotPosition {
  const fallbackSlot = slots[0];
  if (!fallbackSlot) {
    throw new Error('resolveSlotPosition requires at least one slot');
  }
  return slots[resolveSlotIndex(slots, position, fallbackIndex)] ?? fallbackSlot;
}
