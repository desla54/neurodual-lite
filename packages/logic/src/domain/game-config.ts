/**
 * GameConfig - Value Object
 *
 * Encapsule la configuration d'un bloc avec validation stricte.
 * Empêche la création de configurations invalides (invariant check).
 */

import type { BlockConfig, GeneratorName } from './types';
import { DEFAULT_CONFIG } from './types';
import { VALIDATION_MIN_INTERVAL_SECONDS } from '../specs/thresholds';

export class GameConfig implements BlockConfig {
  readonly nLevel: number;
  readonly generator: GeneratorName;
  readonly activeModalities: string[];
  readonly trialsCount: number;
  readonly targetProbability: number;
  readonly lureProbability: number;
  readonly intervalSeconds: number;
  readonly stimulusDurationSeconds: number;

  constructor(config: Partial<BlockConfig> = {}) {
    // 1. Merge with defaults
    const merged = { ...DEFAULT_CONFIG, ...config };

    // 2. Validate Invariants
    this.validate(merged);

    // 3. Assign properties
    this.nLevel = merged.nLevel;
    this.generator = merged.generator;
    this.activeModalities = [...merged.activeModalities]; // Defensive copy
    this.trialsCount = merged.trialsCount;
    this.targetProbability = merged.targetProbability;
    this.lureProbability = merged.lureProbability;
    this.intervalSeconds = merged.intervalSeconds;
    this.stimulusDurationSeconds = merged.stimulusDurationSeconds;
  }

  /**
   * Validation stricte des invariants
   * @throws Error si la configuration est invalide
   */
  private validate(config: BlockConfig): void {
    // N-Level
    if (!Number.isInteger(config.nLevel) || config.nLevel < 1) {
      throw new Error(`Invalid nLevel: ${config.nLevel}. Must be an integer >= 1.`);
    }

    // Trials Count
    if (!Number.isInteger(config.trialsCount) || config.trialsCount < 1) {
      throw new Error(`Invalid trialsCount: ${config.trialsCount}. Must be an integer >= 1.`);
    }

    // Probabilities
    if (config.targetProbability < 0 || config.targetProbability > 1) {
      throw new Error(
        `Invalid targetProbability: ${config.targetProbability}. Must be between 0 and 1.`,
      );
    }
    if (config.lureProbability < 0 || config.lureProbability > 1) {
      throw new Error(
        `Invalid lureProbability: ${config.lureProbability}. Must be between 0 and 1.`,
      );
    }
    // Contrainte target + lure ≤ 1 uniquement pour BrainWorkshop
    // Jaeggi ignore les probas (protocole fixe)
    // Libre: tout est permis (cibles et leurres sont INDÉPENDANTS)
    if (
      config.generator === 'BrainWorkshop' &&
      config.targetProbability + config.lureProbability > 1
    ) {
      throw new Error(
        `Invalid probabilities: target (${config.targetProbability}) + lure (${config.lureProbability}) > 1`,
      );
    }

    // Timings
    if (config.intervalSeconds < VALIDATION_MIN_INTERVAL_SECONDS) {
      throw new Error(
        `Invalid intervalSeconds: ${config.intervalSeconds}. Must be >= ${VALIDATION_MIN_INTERVAL_SECONDS}s.`,
      );
    }
    if (config.stimulusDurationSeconds <= 0) {
      throw new Error(
        `Invalid stimulusDurationSeconds: ${config.stimulusDurationSeconds}. Must be > 0s.`,
      );
    }
    // BrainWorkshop allows stimulus duration === interval (continuous display, no gap)
    // Other modes require stimulus < interval for visual transition
    if (config.generator === 'BrainWorkshop') {
      if (config.stimulusDurationSeconds > config.intervalSeconds) {
        throw new Error(
          `Stimulus duration (${config.stimulusDurationSeconds}s) must not exceed interval (${config.intervalSeconds}s).`,
        );
      }
    } else if (config.stimulusDurationSeconds >= config.intervalSeconds) {
      throw new Error(
        `Stimulus duration (${config.stimulusDurationSeconds}s) must be less than interval (${config.intervalSeconds}s).`,
      );
    }

    // Modalities
    if (!Array.isArray(config.activeModalities) || config.activeModalities.length === 0) {
      throw new Error('activeModalities must be a non-empty array.');
    }
  }

  /**
   * Factory method pour créer une config valide depuis un objet partiel
   */
  static from(config: Partial<BlockConfig>): GameConfig {
    return new GameConfig(config);
  }

  /**
   * Retourne l'objet de configuration brut (DTO)
   */
  toDTO(): BlockConfig {
    return {
      nLevel: this.nLevel,
      generator: this.generator,
      activeModalities: [...this.activeModalities],
      trialsCount: this.trialsCount,
      targetProbability: this.targetProbability,
      lureProbability: this.lureProbability,
      intervalSeconds: this.intervalSeconds,
      stimulusDurationSeconds: this.stimulusDurationSeconds,
    };
  }
}
