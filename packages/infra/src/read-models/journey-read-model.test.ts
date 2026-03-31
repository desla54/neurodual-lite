/**
 * Journey Read Model Tests
 *
 * Tests the createJourneyReadModel factory: fast path (state.nextSession),
 * completion path, fallback derivation path, hybrid mode alternation,
 * cache key generation, and auto-eviction.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type {
  JourneyConfig,
  JourneyState,
  ReadModelPort,
  ReadModelSnapshot,
  Subscribable,
} from '@neurodual/logic';
import { createJourneyReadModel } from './journey-read-model';

// =============================================================================
// Helpers: mock subscribable factory
// =============================================================================

type Listener = () => void;

function createMockSubscribable<T>(
  initialData: T,
  initialPending = false,
): {
  subscribable: Subscribable<ReadModelSnapshot<T>>;
  emit: (data: T) => void;
  setPending: (p: boolean) => void;
} {
  let snapshot: ReadModelSnapshot<T> = {
    data: initialData,
    isPending: initialPending,
    error: null,
  };
  const listeners = new Set<Listener>();

  return {
    subscribable: {
      subscribe(listener: Listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot() {
        return snapshot;
      },
    },
    emit(data: T) {
      snapshot = { data, isPending: false, error: null };
      for (const l of listeners) l();
    },
    setPending(p: boolean) {
      snapshot = { ...snapshot, isPending: p };
      for (const l of listeners) l();
    },
  };
}

// =============================================================================
// Test fixtures
// =============================================================================

const TEST_CONFIG: JourneyConfig = {
  journeyId: 'journey-test',
  startLevel: 1,
  targetLevel: 3,
  gameMode: 'dualnback-classic',
};

function makeStages(count: number, currentStage: number) {
  return Array.from({ length: count }, (_, i) => ({
    stageId: i + 1,
    status: i + 1 < currentStage ? 'completed' : i + 1 === currentStage ? 'unlocked' : 'locked',
    validatingSessions: i + 1 < currentStage ? 1 : 0,
    bestScore: i + 1 < currentStage ? 100 : null,
  })) as JourneyState['stages'];
}

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    currentStage: 1,
    stages: makeStages(12, 1),
    isActive: true,
    startLevel: 1,
    targetLevel: 3,
    ...overrides,
  };
}

// =============================================================================
// Mock ReadModelPort
// =============================================================================

function createMockReadModelPort(initialState: JourneyState) {
  const source = createMockSubscribable<JourneyState>(initialState);

  const port = {
    journeyState: mock((_config: JourneyConfig, _userId: string | null) => source.subscribable),
  } as unknown as ReadModelPort;

  return { port, source };
}

async function flushMicrotasks() {
  await new Promise<void>((r) => queueMicrotask(r));
}

// =============================================================================
// Tests
// =============================================================================

describe('JourneyReadModel', () => {
  // We need to evict the module-level cache between tests
  beforeEach(async () => {
    const state = makeState();
    const { port } = createMockReadModelPort(state);
    const rm = createJourneyReadModel(port);
    const sub = rm.getNextSession(TEST_CONFIG, null);
    const unsub = sub.subscribe(() => {});
    unsub();
    await flushMicrotasks();
  });

  describe('createJourneyReadModel factory', () => {
    it('returns an object with getNextSession method', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      expect(typeof rm.getNextSession).toBe('function');
    });
  });

  describe('fast path (state.nextSession exists)', () => {
    it('uses state.nextSession when available and journey is not complete', () => {
      const state = makeState({
        currentStage: 2,
        stages: makeStages(12, 2),
        nextSession: {
          stageId: 2,
          nLevel: 1,
          gameMode: 'dualnback-classic',
          route: '/nback',
        },
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession).not.toBeNull();
      expect(result.nextSession!.stageId).toBe(2);
      expect(result.nextSession!.nLevel).toBe(1);
      expect(result.nextSession!.gameMode).toBe('dualnback-classic');
      expect(result.nextSession!.route).toBe('/nback');
      expect(result.nextSession!.isComplete).toBe(false);
      expect(result.nextSession!.journeyId).toBe('journey-test');
      expect(result.nextSession!.startLevel).toBe(1);
      expect(result.nextSession!.targetLevel).toBe(3);
      expect(result.nextSession!.journeyGameMode).toBe('dualnback-classic');
      expect(result.isPending).toBe(false);

      unsub();
    });

    it('includes strategyConfig from JourneyConfig in the fast path', () => {
      const config: JourneyConfig = {
        ...TEST_CONFIG,
        strategyConfig: { hybrid: { trackSessionsPerBlock: 2 } },
      };
      const state = makeState({
        nextSession: {
          stageId: 1,
          nLevel: 1,
          gameMode: 'dualnback-classic',
          route: '/nback',
        },
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.strategyConfig).toEqual({
        hybrid: { trackSessionsPerBlock: 2 },
      });

      unsub();
    });
  });

  describe('completion path (currentStage > stages.length)', () => {
    it('returns isComplete=true when journey is completed', () => {
      const stages = makeStages(12, 13); // all completed
      const state = makeState({
        currentStage: 13,
        stages,
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession).not.toBeNull();
      expect(result.nextSession!.isComplete).toBe(true);
      expect(result.nextSession!.nLevel).toBe(3); // targetLevel
      expect(result.nextSession!.stageId).toBe(13);
      expect(result.nextSession!.gameMode).toBe('dualnback-classic');

      unsub();
    });

    it('ignores state.nextSession when journey is complete', () => {
      const stages = makeStages(12, 13);
      const state = makeState({
        currentStage: 13,
        stages,
        nextSession: {
          stageId: 1,
          nLevel: 1,
          gameMode: 'dualnback-classic',
          route: '/nback',
        },
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      // Even though nextSession exists, isComplete should be true because currentStage > stages.length
      expect(result.nextSession!.isComplete).toBe(true);
      expect(result.nextSession!.stageId).toBe(13);

      unsub();
    });

    it('uses targetLevel as nLevel when complete', () => {
      const state = makeState({
        currentStage: 13,
        stages: makeStages(12, 13),
        targetLevel: 5,
      });
      const config: JourneyConfig = { ...TEST_CONFIG, targetLevel: 5 };
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.nLevel).toBe(5);

      unsub();
    });
  });

  describe('fallback path (no state.nextSession, not complete)', () => {
    it('derives nLevel from getStageDefinition for simulator mode', () => {
      const config: JourneyConfig = {
        journeyId: 'sim-journey',
        startLevel: 2,
        targetLevel: 5,
        gameMode: 'sim-brainworkshop',
      };
      // Simulator: 1 stage per level, so stage 2 = nLevel 3
      const state = makeState({
        currentStage: 2,
        stages: makeStages(4, 2),
        startLevel: 2,
        targetLevel: 5,
        isSimulator: true,
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, 'user-1');
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession).not.toBeNull();
      expect(result.nextSession!.isComplete).toBe(false);
      // Stage 2 with startLevel 2, simulator mode => nLevel 3
      expect(result.nextSession!.nLevel).toBe(3);

      unsub();
    });

    it('falls back to startLevel when getStageDefinition returns undefined', () => {
      // Create a state where currentStage doesn't match any generated stage
      const state = makeState({
        currentStage: 999,
        stages: makeStages(999, 999), // artificially large to avoid completion path
        startLevel: 2,
        targetLevel: 3,
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      // getStageDefinition(999, 3, 1) returns undefined => nLevel = state.startLevel = 2
      expect(result.nextSession!.nLevel).toBe(2);

      unsub();
    });

    it('uses config.gameMode as default for non-hybrid journeys', () => {
      const state = makeState({ currentStage: 1, stages: makeStages(12, 1) });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.gameMode).toBe('dualnback-classic');

      unsub();
    });

    it('uses nextSessionGameMode from state when available', () => {
      const state = makeState({
        currentStage: 1,
        stages: makeStages(12, 1),
        nextSessionGameMode: 'dual-track',
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.gameMode).toBe('dual-track');

      unsub();
    });

    it('defaults to "dualnback" when config.gameMode is undefined', () => {
      const config: JourneyConfig = {
        journeyId: 'no-mode-journey',
        startLevel: 1,
        targetLevel: 3,
      };
      const state = makeState({ currentStage: 1, stages: makeStages(12, 1) });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.journeyGameMode).toBe('dualnback');
      expect(result.nextSession!.gameMode).toBe('dualnback');

      unsub();
    });
  });

  describe('hybrid mode alternation', () => {
    it('uses ALTERNATING_JOURNEY_FIRST_MODE when config is alternating and no nextSessionGameMode', () => {
      const config: JourneyConfig = {
        journeyId: 'hybrid-journey',
        startLevel: 2,
        targetLevel: 5,
        gameMode: 'dual-track-dnb-hybrid',
      };
      const state = makeState({
        currentStage: 1,
        stages: makeStages(4, 1),
        startLevel: 2,
        targetLevel: 5,
        isSimulator: true,
        // no nextSessionGameMode
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      // Should use the ALTERNATING_JOURNEY_FIRST_MODE constant (dual-track)
      expect(result.nextSession!.gameMode).toBe('dual-track');
      expect(result.nextSession!.journeyGameMode).toBe('dual-track-dnb-hybrid');

      unsub();
    });

    it('uses nextSessionGameMode for alternating journey when projected', () => {
      const config: JourneyConfig = {
        journeyId: 'hybrid-journey',
        startLevel: 2,
        targetLevel: 5,
        gameMode: 'dual-track-dnb-hybrid',
      };
      const state = makeState({
        currentStage: 1,
        stages: makeStages(4, 1),
        startLevel: 2,
        targetLevel: 5,
        isSimulator: true,
        nextSessionGameMode: 'dualnback-classic',
      });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(config, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.nextSession!.gameMode).toBe('dualnback-classic');

      unsub();
    });
  });

  describe('journeyState passthrough', () => {
    it('includes the raw journeyState in the result', () => {
      const state = makeState({ currentStage: 3, stages: makeStages(12, 3) });
      const { port } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      const result = sub.getSnapshot().data;
      expect(result.journeyState).toBe(state);
      expect(result.journeyState.currentStage).toBe(3);

      unsub();
    });
  });

  describe('reactivity', () => {
    it('notifies listener when source emits new state', () => {
      const state = makeState({ currentStage: 1 });
      const { port, source } = createMockReadModelPort(state);
      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const listener = mock(() => {});
      const unsub = sub.subscribe(listener);

      const newState = makeState({
        currentStage: 2,
        stages: makeStages(12, 2),
        nextSession: {
          stageId: 2,
          nLevel: 1,
          gameMode: 'dualnback-classic',
          route: '/nback',
        },
      });
      source.emit(newState);

      expect(listener).toHaveBeenCalled();
      const result = sub.getSnapshot().data;
      expect(result.nextSession!.stageId).toBe(2);

      unsub();
    });

    it('reports isPending when source is pending', () => {
      const state = makeState();
      const { port, source } = createMockReadModelPort(state);
      source.setPending(true);

      const rm = createJourneyReadModel(port);
      const sub = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub.subscribe(() => {});

      expect(sub.getSnapshot().isPending).toBe(true);

      unsub();
    });
  });

  describe('cache key generation', () => {
    it('caches by journeyId + userId', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, null);
      const sub2 = rm.getNextSession(TEST_CONFIG, null);

      expect(sub1).toBe(sub2);
    });

    it('uses "local" for null userId in cache key', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, null);
      const sub2 = rm.getNextSession(TEST_CONFIG, null);

      expect(sub1).toBe(sub2);
      expect(port.journeyState).toHaveBeenCalledTimes(1);
    });

    it('creates different subscribables for different journeyIds', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, null);
      const sub2 = rm.getNextSession({ ...TEST_CONFIG, journeyId: 'other-journey' }, null);

      expect(sub1).not.toBe(sub2);
    });

    it('creates different subscribables for different userIds', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, 'user-A');
      const sub2 = rm.getNextSession(TEST_CONFIG, 'user-B');

      expect(sub1).not.toBe(sub2);
    });
  });

  describe('auto-eviction', () => {
    it('evicts cache entry after unsubscribe (via queueMicrotask)', async () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub1.subscribe(() => {});

      unsub();
      await flushMicrotasks();

      const sub2 = rm.getNextSession(TEST_CONFIG, null);
      expect(sub1).not.toBe(sub2);
    });

    it('does not evict synchronously on unsubscribe', () => {
      const { port } = createMockReadModelPort(makeState());
      const rm = createJourneyReadModel(port);
      const sub1 = rm.getNextSession(TEST_CONFIG, null);
      const unsub = sub1.subscribe(() => {});

      unsub();

      // Before microtask: still cached
      const sub2 = rm.getNextSession(TEST_CONFIG, null);
      expect(sub1).toBe(sub2);
    });
  });
});
