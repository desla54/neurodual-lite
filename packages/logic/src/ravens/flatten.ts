import type {
  CellSpec,
  EntitySpec,
  RavensMatrix,
  StructuredCell,
  StructuredRavensMatrix,
} from './types';

/**
 * Flatten a StructuredCell into the public CellSpec format.
 *
 * Multi-component cells merge all entities into a single flat list.
 * Positions are offset by component index × 10 to avoid collisions
 * (matching the existing convention in generator.ts).
 */
export function flattenCell(cell: StructuredCell): CellSpec {
  const entities: EntitySpec[] = [];
  const positions: number[] = [];

  for (let c = 0; c < cell.components.length; c++) {
    const comp = cell.components[c]!;
    for (const entity of comp.entities) {
      entities.push({
        shape: entity.shape,
        size: entity.size,
        color: entity.color,
        angle: entity.angle,
      });
    }
    const offset = cell.components.length > 1 ? c * 10 : 0;
    for (const pos of comp.positions) {
      positions.push(pos + offset);
    }
  }

  return { entities, positions, mesh: cell.mesh ? { ...cell.mesh } : undefined };
}

/**
 * Flatten a StructuredRavensMatrix into the public RavensMatrix format.
 * This is the projection layer that keeps the UI backward-compatible.
 */
export function flattenMatrix(structured: StructuredRavensMatrix): RavensMatrix {
  const grid = structured.grid.map((row) => row.map(flattenCell));
  const answer = flattenCell(structured.answer);
  const distractors = structured.distractors.map(flattenCell);

  // Flatten rule bindings: first component's bindings are the "main" bindings
  const ruleBindings = structured.componentBindings[0]?.ruleBindings ?? [];
  const componentBindings =
    structured.componentBindings.length > 1 ? structured.componentBindings : undefined;

  return {
    configId: structured.configId,
    grid,
    answer,
    distractors,
    ruleBindings,
    componentBindings,
    perceptual: structured.perceptual,
    difficulty: structured.difficulty,
    seed: structured.seed,
    optionCount: structured.optionCount,
  };
}
