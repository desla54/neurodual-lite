import type { ConfigId } from './types';

export interface SlotPosition {
  x: number;
  y: number;
}

export interface ConfigurationDef {
  id: ConfigId;
  /** Number of components (independent rule groups) */
  componentCount: number;
  /** Slot count per component */
  slotsPerComponent: number[];
  /** Whether position/number attributes are meaningful (multi-entity configs) */
  hasPositionAttr: boolean;
}

const CENTER: ConfigurationDef = {
  id: 'center',
  componentCount: 1,
  slotsPerComponent: [1],
  hasPositionAttr: false,
};

const GRID4: ConfigurationDef = {
  id: 'grid4',
  componentCount: 1,
  slotsPerComponent: [4],
  hasPositionAttr: true,
};

const GRID5: ConfigurationDef = {
  id: 'grid5',
  componentCount: 1,
  slotsPerComponent: [5],
  hasPositionAttr: true,
};

const GRID9: ConfigurationDef = {
  id: 'grid9',
  componentCount: 1,
  slotsPerComponent: [9],
  hasPositionAttr: true,
};

const LEFT_RIGHT: ConfigurationDef = {
  id: 'left_right',
  componentCount: 2,
  slotsPerComponent: [1, 1],
  hasPositionAttr: false,
};

const UP_DOWN: ConfigurationDef = {
  id: 'up_down',
  componentCount: 2,
  slotsPerComponent: [1, 1],
  hasPositionAttr: false,
};

const OUT_IN_CENTER: ConfigurationDef = {
  id: 'out_in_center',
  componentCount: 2,
  slotsPerComponent: [1, 1],
  hasPositionAttr: false,
};

const OUT_IN_GRID: ConfigurationDef = {
  id: 'out_in_grid',
  componentCount: 2,
  slotsPerComponent: [1, 4],
  hasPositionAttr: true,
};

export const CONFIGURATIONS: Record<ConfigId, ConfigurationDef> = {
  center: CENTER,
  grid4: GRID4,
  grid5: GRID5,
  grid9: GRID9,
  left_right: LEFT_RIGHT,
  up_down: UP_DOWN,
  out_in_center: OUT_IN_CENTER,
  out_in_grid: OUT_IN_GRID,
};

/**
 * Get normalized slot positions for a given config and component.
 * All positions are in [0, 1] space.
 */
export function getSlotPositions(configId: ConfigId, componentIdx: number): SlotPosition[] {
  switch (configId) {
    case 'center':
      return [{ x: 0.5, y: 0.5 }];

    case 'grid4':
      return [
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.3 },
        { x: 0.3, y: 0.7 },
        { x: 0.7, y: 0.7 },
      ];

    case 'grid5':
      return [
        { x: 0.3, y: 0.25 },
        { x: 0.7, y: 0.25 },
        { x: 0.5, y: 0.5 },
        { x: 0.3, y: 0.75 },
        { x: 0.7, y: 0.75 },
      ];

    case 'grid9':
      return [
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.25, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.5 },
        { x: 0.25, y: 0.75 },
        { x: 0.5, y: 0.75 },
        { x: 0.75, y: 0.75 },
      ];

    case 'left_right':
      return componentIdx === 0 ? [{ x: 0.25, y: 0.5 }] : [{ x: 0.75, y: 0.5 }];

    case 'up_down':
      return componentIdx === 0 ? [{ x: 0.5, y: 0.25 }] : [{ x: 0.5, y: 0.75 }];

    case 'out_in_center':
      return componentIdx === 0
        ? [{ x: 0.5, y: 0.5 }] // outer
        : [{ x: 0.5, y: 0.5 }]; // inner (rendered smaller)

    case 'out_in_grid':
      if (componentIdx === 0) return [{ x: 0.5, y: 0.5 }]; // outer
      return [
        // inner 2x2
        { x: 0.35, y: 0.35 },
        { x: 0.65, y: 0.35 },
        { x: 0.35, y: 0.65 },
        { x: 0.65, y: 0.65 },
      ];

    default:
      return [{ x: 0.5, y: 0.5 }];
  }
}
