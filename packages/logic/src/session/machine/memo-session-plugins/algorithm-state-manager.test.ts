import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { DefaultAlgorithmStateManager } from './algorithm-state-manager';
import type { TrialGenerator } from '../../../coach/trial-generator';
import type { AlgorithmStatePort } from '../../../ports/algorithm-state-port';
import type { AlgorithmState } from '../../../sequence';

describe('DefaultAlgorithmStateManager (Memo)', () => {
  let manager: DefaultAlgorithmStateManager;

  beforeEach(() => {
    manager = new DefaultAlgorithmStateManager();
  });

  // Mock generators
  function createBasicGenerator(): TrialGenerator {
    return {
      // @ts-expect-error test override
      next: () => null,
      hasCompleted: () => false,
    };
  }

  function createAdaptiveGenerator(
    algorithmType: string = 'adaptive-controller',
    // @ts-expect-error test override
    state: AlgorithmState | null = { nLevel: 3, performance: 0.75 },
  ): TrialGenerator & {
    getAlgorithmType: () => string;
    serializeAlgorithmState: () => AlgorithmState | null;
    restoreAlgorithmState: (s: AlgorithmState) => void;
  } {
    let currentState = state;
    return {
      // @ts-expect-error test override
      next: () => null,
      hasCompleted: () => false,
      getAlgorithmType: () => algorithmType,
      serializeAlgorithmState: () => currentState,
      restoreAlgorithmState: (s: AlgorithmState) => {
        currentState = s;
      },
    };
  }

  function createMockPort(): AlgorithmStatePort & {
    savedState: AlgorithmState | null;
    loadedState: { state: AlgorithmState; updatedAt: number } | null;
  } {
    return {
      savedState: null,
      loadedState: null,
      saveState: mock(async function (
        this: { savedState: AlgorithmState | null },
        _userId: string,
        _type: 'adaptive-controller' | 'meta-learning',
        state: AlgorithmState,
      ) {
        this.savedState = state;
      }),
      // @ts-expect-error test override
      loadState: mock(async function (this: {
        loadedState: { state: AlgorithmState; updatedAt: number } | null;
      }) {
        return this.loadedState;
      }),
    };
  }

  describe('canPersist', () => {
    it('should return false for basic generator without getAlgorithmType', () => {
      const generator = createBasicGenerator();
      expect(manager.canPersist(generator)).toBe(false);
    });

    it('should return true for adaptive-controller generator', () => {
      const generator = createAdaptiveGenerator('adaptive-controller');
      expect(manager.canPersist(generator)).toBe(true);
    });

    it('should return true for meta-learning generator', () => {
      const generator = createAdaptiveGenerator('meta-learning');
      expect(manager.canPersist(generator)).toBe(true);
    });

    it('should return false for other algorithm types', () => {
      const generator = createAdaptiveGenerator('fixed');
      expect(manager.canPersist(generator)).toBe(false);
    });
  });

  describe('getAlgorithmType', () => {
    it('should return null for generator without getAlgorithmType', () => {
      const generator = createBasicGenerator();
      expect(manager.getAlgorithmType(generator)).toBe(null);
    });

    it('should return algorithm type for adaptive generator', () => {
      const generator = createAdaptiveGenerator('meta-learning');
      expect(manager.getAlgorithmType(generator)).toBe('meta-learning');
    });
  });

  describe('serializeState', () => {
    it('should return null for generator without serializeAlgorithmState', () => {
      const generator = createBasicGenerator();
      expect(manager.serializeState(generator)).toBe(null);
    });

    it('should return state for adaptive generator', () => {
      const expectedState = { nLevel: 5, performance: 0.9 };
      // @ts-expect-error test override
      const generator = createAdaptiveGenerator('adaptive-controller', expectedState);

      const state = manager.serializeState(generator);

      // @ts-expect-error test override
      expect(state).toEqual(expectedState);
    });

    it('should return null if generator returns null', () => {
      const generator = createAdaptiveGenerator('adaptive-controller', null);

      const state = manager.serializeState(generator);

      expect(state).toBe(null);
    });
  });

  describe('saveState', () => {
    it('should not save for non-persistable generator', async () => {
      const generator = createBasicGenerator();
      const port = createMockPort();

      await manager.saveState('user-123', generator, port);

      expect(port.saveState).not.toHaveBeenCalled();
    });

    it('should not save if algorithm type is null', async () => {
      const generator = {
        ...createBasicGenerator(),
        getAlgorithmType: () => 'fixed', // Not persistable
      };
      const port = createMockPort();

      await manager.saveState('user-123', generator as TrialGenerator, port);

      expect(port.saveState).not.toHaveBeenCalled();
    });

    it('should not save if state is null', async () => {
      const generator = createAdaptiveGenerator('adaptive-controller', null);
      const port = createMockPort();

      await manager.saveState('user-123', generator, port);

      expect(port.saveState).not.toHaveBeenCalled();
    });

    it('should save state for valid adaptive generator', async () => {
      const expectedState = { nLevel: 4, performance: 0.8 };
      // @ts-expect-error test override
      const generator = createAdaptiveGenerator('adaptive-controller', expectedState);
      const port = createMockPort();

      await manager.saveState('user-123', generator, port);

      expect(port.saveState).toHaveBeenCalledTimes(1);
      // @ts-expect-error test override
      expect(port.savedState).toEqual(expectedState);
    });

    it('should handle save errors gracefully', async () => {
      const generator = createAdaptiveGenerator('adaptive-controller');
      const port = createMockPort();
      port.saveState = mock(() => Promise.reject(new Error('Save failed')));

      // Should not throw
      await manager.saveState('user-123', generator, port);
    });
  });

  describe('loadAndRestoreState', () => {
    it('should not load for non-persistable generator', async () => {
      const generator = createBasicGenerator();
      const port = createMockPort();

      await manager.loadAndRestoreState('user-123', generator, port);

      expect(port.loadState).not.toHaveBeenCalled();
    });

    it('should not load if generator cannot restore state', async () => {
      const generator = {
        ...createBasicGenerator(),
        getAlgorithmType: () => 'adaptive-controller',
        // No restoreAlgorithmState method
      };
      const port = createMockPort();

      await manager.loadAndRestoreState('user-123', generator as TrialGenerator, port);

      expect(port.loadState).not.toHaveBeenCalled();
    });

    it('should load and restore state when available', async () => {
      const storedState = { nLevel: 6, performance: 0.95 };
      const generator = createAdaptiveGenerator('adaptive-controller', {
        // @ts-expect-error test override
        nLevel: 1,
        performance: 0.5,
      });
      const port = createMockPort();
      // @ts-expect-error test override
      port.loadedState = { state: storedState, updatedAt: Date.now() };

      await manager.loadAndRestoreState('user-123', generator, port);

      expect(port.loadState).toHaveBeenCalledTimes(1);
      // After restore, serializing should return the restored state
      // @ts-expect-error test override
      expect(generator.serializeAlgorithmState()).toEqual(storedState);
    });

    it('should not restore if no stored state', async () => {
      const initialState = { nLevel: 2, performance: 0.6 };
      // @ts-expect-error test override
      const generator = createAdaptiveGenerator('adaptive-controller', initialState);
      const port = createMockPort();
      port.loadedState = null;

      await manager.loadAndRestoreState('user-123', generator, port);

      // State should remain unchanged
      // @ts-expect-error test override
      expect(generator.serializeAlgorithmState()).toEqual(initialState);
    });

    it('should handle load errors gracefully', async () => {
      const generator = createAdaptiveGenerator('adaptive-controller');
      const port = createMockPort();
      port.loadState = mock(() => Promise.reject(new Error('Load failed')));

      // Should not throw
      await manager.loadAndRestoreState('user-123', generator, port);
    });
  });
});
