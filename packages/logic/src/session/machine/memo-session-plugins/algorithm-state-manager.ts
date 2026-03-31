/**
 * AlgorithmStateManager Plugin
 *
 * Handles algorithm state persistence for adaptive generators.
 *
 * Data in / Data out: Manages persistence with explicit port injection.
 */

import type { TrialGenerator } from '../../../coach/trial-generator';
import type { AlgorithmStatePort } from '../../../ports/algorithm-state-port';
import type { AlgorithmState } from '../../../sequence';
import type { AlgorithmStateManager } from './types';

/** Type guard for generators with getAlgorithmType */
function hasGetAlgorithmType(gen: unknown): gen is { getAlgorithmType(): string } {
  return typeof gen === 'object' && gen !== null && 'getAlgorithmType' in gen;
}

/** Type guard for generators with serializeAlgorithmState */
function hasSerializeAlgorithmState(
  gen: unknown,
): gen is { serializeAlgorithmState(): AlgorithmState | null } {
  return typeof gen === 'object' && gen !== null && 'serializeAlgorithmState' in gen;
}

/** Type guard for generators with restoreAlgorithmState */
function hasRestoreAlgorithmState(
  gen: unknown,
): gen is { restoreAlgorithmState(state: AlgorithmState): void } {
  return typeof gen === 'object' && gen !== null && 'restoreAlgorithmState' in gen;
}

/**
 * Default AlgorithmStateManager implementation.
 */
export class DefaultAlgorithmStateManager implements AlgorithmStateManager {
  canPersist(generator: TrialGenerator): boolean {
    if (!hasGetAlgorithmType(generator)) return false;
    const type = generator.getAlgorithmType();
    return type === 'adaptive-controller' || type === 'meta-learning';
  }

  getAlgorithmType(generator: TrialGenerator): string | null {
    if (!hasGetAlgorithmType(generator)) return null;
    return generator.getAlgorithmType();
  }

  serializeState(generator: TrialGenerator): AlgorithmState | null {
    if (!hasSerializeAlgorithmState(generator)) return null;
    return generator.serializeAlgorithmState();
  }

  async saveState(
    userId: string,
    generator: TrialGenerator,
    port: AlgorithmStatePort,
  ): Promise<void> {
    if (!this.canPersist(generator)) return;

    const algorithmType = this.getAlgorithmType(generator);
    if (!algorithmType) return;

    const state = this.serializeState(generator);
    if (!state) return;

    try {
      await port.saveState(userId, algorithmType as 'adaptive-controller' | 'meta-learning', state);
    } catch (err) {
      console.warn('[MemoSession] Failed to save algorithm state:', err);
    }
  }

  async loadAndRestoreState(
    userId: string,
    generator: TrialGenerator,
    port: AlgorithmStatePort,
  ): Promise<void> {
    if (!this.canPersist(generator)) return;
    if (!hasRestoreAlgorithmState(generator)) return;

    const algorithmType = this.getAlgorithmType(generator);
    if (!algorithmType) return;

    try {
      const stored = await port.loadState(
        userId,
        algorithmType as 'adaptive-controller' | 'meta-learning',
      );
      if (stored) {
        generator.restoreAlgorithmState(stored.state);
      }
    } catch (err) {
      console.warn('[MemoSession] Failed to load algorithm state:', err);
    }
  }
}
