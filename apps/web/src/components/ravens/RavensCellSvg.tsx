import type { CellSpec, ConfigId, PerceptualComplexity } from '@neurodual/logic';
import {
  GRID4_SLOTS,
  GRID5_SLOTS,
  GRID9_SLOTS,
  OUT_IN_GRID_SLOTS,
  resolveSlotPosition,
} from './ravens-layout';
import { RavensEntitySvg } from './RavensEntitySvg';
import { RavensMeshSvg } from './RavensMeshSvg';

interface RavensCellSvgProps {
  cell: CellSpec;
  size: number;
  /** Config ID for layout decisions on multi-component cells */
  configId?: ConfigId;
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
}

export function RavensCellSvg({ cell, size, configId, perceptual }: RavensCellSvgProps) {
  const count = cell.entities.length;
  const distortion = perceptual?.distortion ?? 0;

  // S7: compute distortion transform for the entire entities group
  const cx = size / 2;
  const cy = size / 2;
  let distortTransform: string | undefined;
  if (distortion > 0) {
    const skewX = distortion * 2.5;
    const scaleY = 1 + distortion * 0.04;
    // Apply around center of cell
    distortTransform = `translate(${cx},${cy}) skewX(${skewX.toFixed(1)}) scaleY(${scaleY.toFixed(3)}) translate(${-cx},${-cy})`;
  }

  const entities =
    count > 0 ? <RavensCellEntities cell={cell} size={size} configId={configId} /> : null;

  return (
    <>
      {distortTransform ? <g transform={distortTransform}>{entities}</g> : entities}
      {cell.mesh && <RavensMeshSvg mesh={cell.mesh} size={size} />}
    </>
  );
}

/** Internal: renders the entity shapes for a cell */
function RavensCellEntities({ cell, size, configId }: Omit<RavensCellSvgProps, 'perceptual'>) {
  const count = cell.entities.length;
  if (count === 0) return null;

  // Grid configs with positional slots: render entities at slot positions
  if (configId === 'grid4' && count <= 4) {
    const maxR = size * 0.18;
    return (
      <>
        {cell.entities.map((entity, i) => {
          const slot = resolveSlotPosition(GRID4_SLOTS, cell.positions[i], i);
          return (
            <RavensEntitySvg
              key={i}
              entity={entity}
              cx={slot.x * size}
              cy={slot.y * size}
              maxRadius={maxR}
            />
          );
        })}
      </>
    );
  }

  if (configId === 'grid5' && count <= 5) {
    const maxR = size * 0.16;
    return (
      <>
        {cell.entities.map((entity, i) => {
          const slot = resolveSlotPosition(GRID5_SLOTS, cell.positions[i], i);
          return (
            <RavensEntitySvg
              key={i}
              entity={entity}
              cx={slot.x * size}
              cy={slot.y * size}
              maxRadius={maxR}
            />
          );
        })}
      </>
    );
  }

  if (configId === 'grid9' && count <= 9) {
    const maxR = size * 0.13;
    return (
      <>
        {cell.entities.map((entity, i) => {
          const slot = resolveSlotPosition(GRID9_SLOTS, cell.positions[i], i);
          return (
            <RavensEntitySvg
              key={i}
              entity={entity}
              cx={slot.x * size}
              cy={slot.y * size}
              maxRadius={maxR}
            />
          );
        })}
      </>
    );
  }

  if (count === 1) {
    return (
      <RavensEntitySvg
        entity={cell.entities[0]!}
        cx={size / 2}
        cy={size / 2}
        maxRadius={size * 0.38}
      />
    );
  }

  if (count === 2) {
    // Nested: out_in_center — outer large, inner small
    if (configId === 'out_in_center') {
      return (
        <>
          <RavensEntitySvg
            entity={cell.entities[0]!}
            cx={size / 2}
            cy={size / 2}
            maxRadius={size * 0.4}
          />
          <RavensEntitySvg
            entity={cell.entities[1]!}
            cx={size / 2}
            cy={size / 2}
            maxRadius={size * 0.18}
          />
        </>
      );
    }

    // Stacked vertically: up_down
    if (configId === 'up_down') {
      return (
        <>
          <RavensEntitySvg
            entity={cell.entities[0]!}
            cx={size / 2}
            cy={size * 0.28}
            maxRadius={size * 0.22}
          />
          <RavensEntitySvg
            entity={cell.entities[1]!}
            cx={size / 2}
            cy={size * 0.72}
            maxRadius={size * 0.22}
          />
        </>
      );
    }

    // Side by side: left_right (default for 2 entities)
    return (
      <>
        <RavensEntitySvg
          entity={cell.entities[0]!}
          cx={size * 0.28}
          cy={size / 2}
          maxRadius={size * 0.22}
        />
        <RavensEntitySvg
          entity={cell.entities[1]!}
          cx={size * 0.72}
          cy={size / 2}
          maxRadius={size * 0.22}
        />
      </>
    );
  }

  // out_in_grid: 1 outer + N inner entities (N = 1..4) in 2×2 grid positions
  if (configId === 'out_in_grid' && count >= 2) {
    const innerEntities = cell.entities.slice(1);
    // Scale inner entities based on how many there are
    const innerRadius = size * (innerEntities.length <= 2 ? 0.16 : 0.13);
    return (
      <>
        {/* Outer entity (large, centered) */}
        <RavensEntitySvg
          entity={cell.entities[0]!}
          cx={size / 2}
          cy={size / 2}
          maxRadius={size * 0.4}
        />
        {/* Inner entities placed in 2×2 grid slots using positions */}
        {innerEntities.map((entity, i) => {
          const slot = resolveSlotPosition(OUT_IN_GRID_SLOTS, cell.positions[i + 1], i);
          return (
            <RavensEntitySvg
              key={cell.positions[i + 1] ?? i}
              entity={entity}
              cx={size * slot.x}
              cy={size * slot.y}
              maxRadius={innerRadius}
            />
          );
        })}
      </>
    );
  }

  // Generic auto-grid for any other multi-entity layout
  const cols = count <= 4 ? 2 : count <= 6 ? 3 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = size / cols;
  const cellH = size / rows;
  const maxR = Math.min(cellW, cellH) * 0.35;

  return (
    <>
      {cell.entities.map((entity, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <RavensEntitySvg
            key={i}
            entity={entity}
            cx={cellW * (col + 0.5)}
            cy={cellH * (row + 0.5)}
            maxRadius={maxR}
          />
        );
      })}
    </>
  );
}
