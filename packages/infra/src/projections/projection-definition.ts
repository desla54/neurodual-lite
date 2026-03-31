// packages/infra/src/projections/projection-definition.ts
/**
 * Re-exports from the ES library.
 *
 * The canonical types now live in `es-emmett/processor-definition.ts`.
 * This file provides backwards-compatible aliases so existing projection
 * files don't need to change their imports yet.
 *
 * @deprecated Import from `../es-emmett/processor-definition` directly.
 */

export type { ProcessorEvent as ProjectedEvent } from '../es-emmett/processor-definition';
export type { ProcessorDefinition as ProjectionDefinition } from '../es-emmett/processor-definition';

export const DEFAULT_PARTITION = 'global';
