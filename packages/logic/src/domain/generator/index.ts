/**
 * Generator Module
 *
 * Point d'entrée pour la génération de blocs.
 */

import { strategyRegistry as registry } from './strategy';
import { DualnbackClassicStrategy } from './dualnback-classic';
import { BrainWorkshopStrategy } from './brainworkshop';

// Explicit registration to prevent tree-shaking
// (side-effect imports can be removed by bundlers)
if (!registry.has('DualnbackClassic')) {
  registry.register(new DualnbackClassicStrategy());
}
if (!registry.has('BrainWorkshop')) {
  registry.register(new BrainWorkshopStrategy());
}

// Block Generator (OOP wrapper)
export { BlockGenerator } from './block-generator';

export { BrainWorkshopStrategy } from './brainworkshop';
export { DualnbackClassicStrategy } from './dualnback-classic';
export type { GenerationContext } from './strategy';
export { GeneratorStrategy, StrategyRegistry, strategyRegistry } from './strategy';
// Flexible generators (new system)
export { assembleFlexibleTrial, generateModalityStream } from './flexible-strategy';
