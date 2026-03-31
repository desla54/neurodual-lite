/**
 * BlockGenerator - OOP Wrapper for Block Generation
 *
 * Classe wrapper qui encapsule la génération de blocs.
 * Permet l'injection de dépendances et une API OOP cohérente.
 *
 * @example
 * ```ts
 * // Avec registry injecté
 * const generator = new BlockGenerator(strategyRegistry);
 * const block = generator.generate(config);
 *
 * // Ou via méthodes statiques (utilise le registry global)
 * const block = BlockGenerator.generate(config, 'test-seed');
 * ```
 */

import { generateId, SeededRandom } from '../random';
import type { Block, BlockConfig } from '../types';
import { type StrategyRegistry, strategyRegistry } from './strategy';

// =============================================================================
// BlockGenerator
// =============================================================================

/**
 * Générateur de blocs de trials.
 * Peut être utilisé avec injection de dépendances ou via méthodes statiques.
 */
export class BlockGenerator {
  /**
   * Crée un générateur avec un registry injecté.
   * @param registry - Registry des stratégies de génération
   */
  constructor(private readonly registry: StrategyRegistry) {}

  /**
   * Génère un bloc de trials.
   * @param config - Configuration du bloc
   * @param seed - Seed optionnel pour la reproductibilité
   * @returns Le bloc généré avec ses trials
   */
  generate(config: BlockConfig, seed?: string): Block {
    const actualSeed = seed ?? generateId();
    const rng = new SeededRandom(actualSeed);

    const strategy = this.registry.get(config.generator);
    const trials = strategy.generate({ config, rng });

    return {
      id: generateId(),
      config,
      trials,
      createdAt: new Date(),
      seed: actualSeed,
    };
  }

  /**
   * Liste les stratégies disponibles dans ce registry.
   */
  listStrategies(): string[] {
    return this.registry.list();
  }

  /**
   * Vérifie si une stratégie est disponible.
   */
  hasStrategy(name: string): boolean {
    return this.registry.has(name);
  }

  // ===========================================================================
  // Static Methods (use global registry for convenience)
  // ===========================================================================

  /**
   * Génère un bloc en utilisant le registry global.
   * Méthode de convenance pour usage simple.
   *
   * @param config - Configuration du bloc
   * @param seed - Seed optionnel pour la reproductibilité
   * @returns Le bloc généré avec ses trials
   */
  static generate(config: BlockConfig, seed?: string): Block {
    const generator = new BlockGenerator(strategyRegistry);
    return generator.generate(config, seed);
  }

  /**
   * Liste les stratégies disponibles dans le registry global.
   */
  static listStrategies(): string[] {
    return strategyRegistry.list();
  }

  /**
   * Crée une instance avec le registry global.
   */
  static withGlobalRegistry(): BlockGenerator {
    return new BlockGenerator(strategyRegistry);
  }
}
