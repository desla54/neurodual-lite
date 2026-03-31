/**
 * Generator Strategy Interface
 *
 * Pattern Strategy pour permettre différents algorithmes de génération.
 */

import type { SeededRandom } from '../random';
import type { BlockConfig, Trial } from '../types';

/**
 * Contexte passé aux stratégies de génération
 */
export interface GenerationContext {
  readonly config: BlockConfig;
  readonly rng: SeededRandom;
}

/**
 * Interface pour les stratégies de génération de blocs.
 * Chaque stratégie implémente un algorithme différent.
 */
export abstract class GeneratorStrategy {
  abstract readonly name: string;
  abstract generate(context: GenerationContext): Trial[];
}

/**
 * Registry pour enregistrer et récupérer les stratégies.
 * Permet l'extensibilité sans modifier le code existant.
 */
export class StrategyRegistry {
  private strategies = new Map<string, GeneratorStrategy>();

  register(strategy: GeneratorStrategy): this {
    this.strategies.set(strategy.name, strategy);
    return this;
  }

  get(name: string): GeneratorStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Unknown generator strategy: ${name}`);
    }
    return strategy;
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  list(): string[] {
    return Array.from(this.strategies.keys());
  }
}

// Registry global
export const strategyRegistry = new StrategyRegistry();
