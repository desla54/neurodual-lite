// packages/infra/src/replay/index.ts
/**
 * Replay Module
 *
 * Exports replay adapters for loading and managing session replay data.
 */

export { createReplayAdapter, createReplayAdapterFromCommandBus } from './replay-adapter';
export { createReplayInteractifAdapter } from './replay-interactif-adapter';
export {
  interactiveReplayMachine,
  InteractiveReplayAdapter,
  createInteractiveReplayAdapter,
} from './interactive-replay-machine';
