import { describe, expect, it, mock } from 'bun:test';
import { createAlgorithmStateAdapter } from './algorithm-state-adapter';
import type { AlgorithmState, AlgorithmType, PersistencePort } from '@neurodual/logic';

// =============================================================================
// Mock Helpers
// =============================================================================

type MockPersistence = Pick<
  PersistencePort,
  'getAlgorithmState' | 'saveAlgorithmState' | 'clearAlgorithmStates'
>;

function createMockPersistence(overrides: Partial<MockPersistence> = {}): PersistencePort {
  return {
    getAlgorithmState: mock(async () => null),
    saveAlgorithmState: mock(async () => {}),
    clearAlgorithmStates: mock(async () => {}),
    ...overrides,
  } as unknown as PersistencePort;
}

function makeValidState(type: AlgorithmType = 'adaptive-controller'): AlgorithmState {
  return {
    algorithmType: type,
    version: 1,
    data: { learningRate: 0.5, history: [1, 2, 3] },
  } as AlgorithmState;
}

describe('algorithm-state-adapter', () => {
  describe('loadState', () => {
    it('returns stored state when valid JSON exists', async () => {
      const state = makeValidState();
      const persistence = createMockPersistence({
        getAlgorithmState: mock(async () => ({
          stateJson: state,
          sessionCount: 5,
        })),
      });
      const adapter = createAlgorithmStateAdapter(persistence);

      const result = await adapter.loadState('user-1', 'adaptive-controller');

      expect(result).not.toBeNull();
      expect(result!.state.algorithmType).toBe('adaptive-controller');
      expect(result!.state.version).toBe(1);
      expect(result!.saveCount).toBe(5);
      expect(result!.updatedAt).toBeInstanceOf(Date);
    });

    it('returns null when no state exists', async () => {
      const persistence = createMockPersistence({
        getAlgorithmState: mock(async () => null),
      });
      const adapter = createAlgorithmStateAdapter(persistence);

      const result = await adapter.loadState('user-1', 'adaptive-controller');

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON (missing algorithmType)', async () => {
      const persistence = createMockPersistence({
        getAlgorithmState: mock(async () => ({
          stateJson: { version: 1, data: {} },
          sessionCount: 3,
        })),
      });
      const adapter = createAlgorithmStateAdapter(persistence);

      const result = await adapter.loadState('user-1', 'adaptive-controller');

      expect(result).toBeNull();
    });

    it('returns null for invalid JSON (negative version)', async () => {
      const persistence = createMockPersistence({
        getAlgorithmState: mock(async () => ({
          stateJson: { algorithmType: 'adaptive-controller', version: -1, data: {} },
          sessionCount: 1,
        })),
      });
      const adapter = createAlgorithmStateAdapter(persistence);

      const result = await adapter.loadState('user-1', 'adaptive-controller');

      expect(result).toBeNull();
    });

    it('isolates users from each other', async () => {
      const getAlgorithmState = mock(async (userId: string, _alg: string) => {
        if (userId === 'user-A') {
          return { stateJson: makeValidState(), sessionCount: 10 };
        }
        return null;
      });
      const persistence = createMockPersistence({ getAlgorithmState });
      const adapter = createAlgorithmStateAdapter(persistence);

      const resultA = await adapter.loadState('user-A', 'adaptive-controller');
      const resultB = await adapter.loadState('user-B', 'adaptive-controller');

      expect(resultA).not.toBeNull();
      expect(resultB).toBeNull();
    });

    it('isolates algorithm types from each other', async () => {
      const getAlgorithmState = mock(async (_userId: string, alg: string) => {
        if (alg === 'adaptive-controller') {
          return { stateJson: makeValidState('adaptive-controller'), sessionCount: 2 };
        }
        return null;
      });
      const persistence = createMockPersistence({ getAlgorithmState });
      const adapter = createAlgorithmStateAdapter(persistence);

      const resultAC = await adapter.loadState('user-1', 'adaptive-controller');
      const resultML = await adapter.loadState('user-1', 'meta-learning');

      expect(resultAC).not.toBeNull();
      expect(resultML).toBeNull();
    });
  });

  describe('saveState', () => {
    it('delegates to persistence with correct args', async () => {
      const persistence = createMockPersistence();
      const adapter = createAlgorithmStateAdapter(persistence);
      const state = makeValidState();

      await adapter.saveState('user-1', 'adaptive-controller', state);

      expect(persistence.saveAlgorithmState).toHaveBeenCalledTimes(1);
      expect(persistence.saveAlgorithmState).toHaveBeenCalledWith('user-1', 'adaptive-controller', {
        algorithmType: 'adaptive-controller',
        version: 1,
        data: { learningRate: 0.5, history: [1, 2, 3] },
      });
    });

    it('roundtrip: save then load returns same state', async () => {
      const store = new Map<string, { stateJson: unknown; sessionCount: number }>();

      const persistence = createMockPersistence({
        getAlgorithmState: mock(async (userId: string, algorithmType: string) => {
          return store.get(`${userId}:${algorithmType}`) ?? null;
        }),
        saveAlgorithmState: mock(
          async (userId: string, algorithmType: string, stateJson: unknown) => {
            const key = `${userId}:${algorithmType}`;
            const existing = store.get(key);
            store.set(key, {
              stateJson,
              sessionCount: (existing?.sessionCount ?? 0) + 1,
            });
          },
        ),
      });

      const adapter = createAlgorithmStateAdapter(persistence);
      const state = makeValidState();

      await adapter.saveState('user-1', 'adaptive-controller', state);
      const loaded = await adapter.loadState('user-1', 'adaptive-controller');

      expect(loaded).not.toBeNull();
      expect(loaded!.state.algorithmType).toBe('adaptive-controller');
      expect(loaded!.state.version).toBe(1);
      expect(loaded!.saveCount).toBe(1);
    });
  });

  describe('clearStates', () => {
    it('delegates to persistence.clearAlgorithmStates', async () => {
      const persistence = createMockPersistence();
      const adapter = createAlgorithmStateAdapter(persistence);

      await adapter.clearStates('user-1');

      expect(persistence.clearAlgorithmStates).toHaveBeenCalledTimes(1);
      expect(persistence.clearAlgorithmStates).toHaveBeenCalledWith('user-1');
    });
  });
});
