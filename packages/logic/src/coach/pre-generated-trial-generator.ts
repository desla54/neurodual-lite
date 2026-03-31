/**
 * PreGeneratedTrialGenerator - Trials générés à l'avance
 *
 * Implémentation de TrialGenerator pour les stratégies pré-générées:
 * - BrainWorkshop
 * - Jaeggi
 * - Libre
 *
 * Les trials sont générés une seule fois au début de la session.
 * Pas de Cerveau ici - c'est du mode classique.
 */

import type { GameParams, PerformanceContext } from '../types/adaptive';
import type { SeededRandom, Trial, BlockConfig } from '../domain';
import { strategyRegistry, DualnbackClassicStrategy, BrainWorkshopStrategy } from '../domain';
import type { TrialGenerator } from './trial-generator';

// Ensure strategies are registered before use.
// This is necessary because bundlers may tree-shake or code-split the
// auto-registration side effects in jaeggi.ts and brainworkshop.ts.
if (!strategyRegistry.has('DualnbackClassic')) {
  strategyRegistry.register(new DualnbackClassicStrategy());
}
if (!strategyRegistry.has('BrainWorkshop')) {
  strategyRegistry.register(new BrainWorkshopStrategy());
}

/**
 * Config with optional extensions for mode-specific settings.
 * BrainWorkshop uses extensions for variableNBack, crabBackMode, multiStimulus, etc.
 */
export interface ExtendedBlockConfig extends BlockConfig {
  readonly extensions?: Record<string, unknown>;
}

/**
 * Générateur qui utilise des trials pré-générés par une stratégie.
 */
export class PreGeneratedTrialGenerator implements TrialGenerator {
  private readonly trials: Trial[];
  private nextIndex = 0;

  constructor(config: ExtendedBlockConfig, rng: SeededRandom) {
    const strategy = strategyRegistry.get(config.generator);
    this.trials = strategy.generate({ config, rng });
  }

  /**
   * Crée un générateur à partir de trials déjà générés.
   * Utile pour les tests ou la reprise de session.
   */
  static fromTrials(trials: Trial[]): PreGeneratedTrialGenerator {
    const generator = Object.create(PreGeneratedTrialGenerator.prototype);
    generator.trials = trials;
    generator.nextIndex = 0;
    return generator;
  }

  generateNext(): Trial {
    if (this.nextIndex >= this.trials.length) {
      throw new Error(`No more trials: index ${this.nextIndex} >= ${this.trials.length}`);
    }
    const trial = this.trials[this.nextIndex];
    if (!trial) {
      throw new Error(`No trial at index ${this.nextIndex}`);
    }
    this.nextIndex++;
    return trial;
  }

  hasMore(): boolean {
    return this.nextIndex < this.trials.length;
  }

  getTotalTrials(): number {
    return this.trials.length;
  }

  getNextIndex(): number {
    return this.nextIndex;
  }

  getGeneratedTrials(): Trial[] {
    return this.trials.slice(0, this.nextIndex);
  }

  // Mode non-adaptatif: tous ces getters retournent null
  getGameParameters(): GameParams | null {
    return null;
  }

  getDifficulty(): number | null {
    return null;
  }

  getLureProbability(): number | null {
    return null;
  }

  getTargetProbability(): number | null {
    return null;
  }

  getISI(): number | null {
    return null;
  }

  getPerformanceContext(): PerformanceContext | null {
    return null;
  }

  getZoneNumber(): number | null {
    return null;
  }

  processFeedback(): void {
    // No-op pour les générateurs non-adaptatifs
  }

  isAdaptive(): boolean {
    return false;
  }

  /**
   * Avance le générateur à un index donné.
   * Pour les trials pré-générés, on avance simplement l'index interne.
   */
  skipTo(index: number): void {
    if (index < 0 || index > this.trials.length) {
      throw new Error(`Invalid skipTo index: ${index} (valid range: 0-${this.trials.length})`);
    }
    this.nextIndex = index;
  }
}
