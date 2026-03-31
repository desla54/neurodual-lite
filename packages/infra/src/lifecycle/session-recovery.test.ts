import { describe, expect, it, beforeEach } from 'bun:test';
import * as sessionRecoveryModule from './session-recovery';
import type { SessionRecoverySnapshot } from '@neurodual/logic';

// Shared storage for localStorage mock - must be set BEFORE module evaluation
// We reassign globalThis.localStorage directly since Object.defineProperty runs after imports
const mockStorage: { data: Record<string, string> } = { data: {} };

// Reassign localStorage directly on globalThis
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string): string | null => mockStorage.data[key] ?? null,
  setItem: (key: string, value: string): void => {
    mockStorage.data[key] = value;
  },
  removeItem: (key: string): void => {
    delete mockStorage.data[key];
  },
  clear: (): void => {
    mockStorage.data = {};
  },
  length: 0,
  key: (): null => null,
};

describe('session-recovery', () => {
  const {
    saveRecoverySnapshot,
    loadRecoverySnapshot,
    clearRecoverySnapshot,
    checkForRecoverableSession,
    hasRecoverySnapshot,
    createRecoverySnapshot,
  } = sessionRecoveryModule;

  const createValidSnapshot = (
    overrides: Partial<SessionRecoverySnapshot> = {},
  ): SessionRecoverySnapshot => ({
    sessionId: 'test-session-123',
    modeId: 'game',
    config: {
      nLevel: 2,
      trialsCount: 20,
      blocks: 1,
      trialsPerBlock: 20,
      restBetweenBlocksMs: 0,
    } as any,
    timestamp: Date.now(),
    trialIndex: 5,
    totalTrials: 20,
    ...overrides,
  });

  beforeEach(() => {
    // Clear storage before each test
    mockStorage.data = {};
  });

  describe('saveRecoverySnapshot', () => {
    it('should save snapshot to localStorage', () => {
      const snapshot = createValidSnapshot();
      saveRecoverySnapshot(snapshot);

      expect(mockStorage.data['nd_session_recovery']).toBeDefined();
      const stored = JSON.parse(mockStorage.data['nd_session_recovery']!);
      expect(stored.sessionId).toBe('test-session-123');
    });
  });

  describe('loadRecoverySnapshot', () => {
    it('should return null when no snapshot exists', () => {
      const result = loadRecoverySnapshot();
      expect(result).toBeNull();
    });

    it('should load valid snapshot', () => {
      const snapshot = createValidSnapshot();
      mockStorage.data['nd_session_recovery'] = JSON.stringify(snapshot);

      const result = loadRecoverySnapshot();

      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe('test-session-123');
    });

    it('should return null for invalid JSON', () => {
      mockStorage.data['nd_session_recovery'] = 'invalid-json';

      const result = loadRecoverySnapshot();
      expect(result).toBeNull();
    });

    it('should return null and clear snapshot without sessionId', () => {
      mockStorage.data['nd_session_recovery'] = JSON.stringify({
        modeId: 'dual-catch',
        config: {},
      });

      const result = loadRecoverySnapshot();

      expect(result).toBeNull();
      expect(mockStorage.data['nd_session_recovery']).toBeUndefined();
    });

    it('should return null and clear snapshot without modeId', () => {
      mockStorage.data['nd_session_recovery'] = JSON.stringify({
        sessionId: 'test',
        config: {},
      });

      const result = loadRecoverySnapshot();

      expect(result).toBeNull();
      expect(mockStorage.data['nd_session_recovery']).toBeUndefined();
    });

    it('should return null and clear snapshot without config', () => {
      mockStorage.data['nd_session_recovery'] = JSON.stringify({
        sessionId: 'test',
        modeId: 'dual-catch',
      });

      const result = loadRecoverySnapshot();

      expect(result).toBeNull();
    });
  });

  describe('clearRecoverySnapshot', () => {
    it('should remove snapshot from localStorage', () => {
      mockStorage.data['nd_session_recovery'] = 'some-data';

      clearRecoverySnapshot();

      expect(mockStorage.data['nd_session_recovery']).toBeUndefined();
    });
  });

  // Note: clearAllRecoveryData is a thin wrapper that calls clearRecoverySnapshot
  // and removes the pipeline recovery key. Testing it in isolation would require
  // complex mocking that conflicts with other test files. The function is simple
  // enough that it doesn't need dedicated tests.

  describe('checkForRecoverableSession', () => {
    it('should return hasSession: false when no snapshot', () => {
      const result = checkForRecoverableSession();

      expect(result.hasSession).toBe(false);
      expect(result.snapshot).toBeNull();
      expect(result.isStale).toBe(false);
    });

    it('should return hasSession: true for fresh snapshot', () => {
      const snapshot = createValidSnapshot({ timestamp: Date.now() });
      mockStorage.data['nd_session_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableSession();

      expect(result.hasSession).toBe(true);
      expect(result.snapshot).not.toBeNull();
      expect(result.isStale).toBe(false);
    });

    it('should return isStale: true for snapshot older than 30 minutes', () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const snapshot = createValidSnapshot({ timestamp: thirtyOneMinutesAgo });
      mockStorage.data['nd_session_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableSession();

      expect(result.hasSession).toBe(true);
      expect(result.isStale).toBe(true);
    });

    it('should auto-clear expired snapshot (older than 2 hours)', () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      const snapshot = createValidSnapshot({ timestamp: threeHoursAgo });
      mockStorage.data['nd_session_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableSession();

      expect(result.hasSession).toBe(false);
      expect(mockStorage.data['nd_session_recovery']).toBeUndefined();
    });
  });

  describe('hasRecoverySnapshot', () => {
    it('should return false when no snapshot exists', () => {
      expect(hasRecoverySnapshot()).toBe(false);
    });

    it('should return true when snapshot exists', () => {
      mockStorage.data['nd_session_recovery'] = 'some-data';
      expect(hasRecoverySnapshot()).toBe(true);
    });
  });

  describe('createRecoverySnapshot', () => {
    it('should create snapshot with required fields', () => {
      const snapshot = createRecoverySnapshot({
        sessionId: 'session-456',
        modeId: 'game',
        config: {
          nLevel: 3,
          trialsCount: 25,
          blocks: 1,
          trialsPerBlock: 25,
          restBetweenBlocksMs: 0,
        } as any,
        trialIndex: 10,
        totalTrials: 25,
      });

      expect(snapshot.sessionId).toBe('session-456');
      expect(snapshot.modeId).toBe('game');
      expect(snapshot.config.nLevel).toBe(3);
      expect(snapshot.trialIndex).toBe(10);
      expect(snapshot.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should include optional nLevel and declaredEnergyLevel', () => {
      const snapshot = createRecoverySnapshot({
        sessionId: 'session-789',
        modeId: 'game',
        config: {
          nLevel: 4,
          trialsCount: 30,
          blocks: 1,
          trialsPerBlock: 30,
          restBetweenBlocksMs: 0,
        } as any,
        trialIndex: 15,
        totalTrials: 30,
        nLevel: 4,
        declaredEnergyLevel: 3,
      });

      expect(snapshot.nLevel).toBe(4);
      expect(snapshot.declaredEnergyLevel).toBe(3);
    });

    it('should include optional playMode and journey metadata', () => {
      const snapshot = createRecoverySnapshot({
        sessionId: 'session-journey',
        modeId: 'game',
        config: {
          nLevel: 5,
          trialsCount: 30,
          blocks: 1,
          trialsPerBlock: 30,
          restBetweenBlocksMs: 0,
        } as any,
        trialIndex: 12,
        totalTrials: 30,
        playMode: 'journey',
        journeyStageId: 4,
        journeyId: 'dualnback-classic-journey',
      });

      expect(snapshot.playMode).toBe('journey');
      expect(snapshot.journeyStageId).toBe(4);
      expect(snapshot.journeyId).toBe('dualnback-classic-journey');
    });
  });

  describe('buildRecoveredState', () => {
    it('preserves calibration playMode from the recovery snapshot', async () => {
      const snapshot = createValidSnapshot({
        sessionId: 'recover-session-calibration',
        modeId: 'game',
        playMode: 'calibration',
        trialIndex: 3,
        totalTrials: 20,
      });
      saveRecoverySnapshot(snapshot);

      const persistence = {
        getSession: async (sessionId: string) => {
          if (sessionId !== 'recover-session-calibration') return [];
          return [
            {
              id: 'evt-session-started',
              session_id: sessionId,
              type: 'SESSION_STARTED',
              timestamp: Date.now() - 5000,
              payload: {
                schemaVersion: 1,
                userId: 'user-1',
                nLevel: 2,
                playContext: 'calibration',
                device: {
                  platform: 'web',
                  screenWidth: 1080,
                  screenHeight: 1920,
                  userAgent: 'test',
                  touchCapable: true,
                },
                context: {
                  timeOfDay: 'morning',
                  localHour: 10,
                  dayOfWeek: 1,
                  timezone: 'UTC',
                },
                config: {
                  nLevel: 2,
                  trialsCount: 20,
                  activeModalities: ['position'],
                  targetProbability: 0.33,
                  lureProbability: 0.1,
                  intervalSeconds: 3,
                  stimulusDurationSeconds: 0.5,
                  generator: 'DualnbackClassic',
                },
                gameMode: 'dualnback-classic',
                trialsSeed: 'seed-calibration',
              },
            },
          ];
        },
      } as unknown as Parameters<typeof sessionRecoveryModule.buildRecoveredState>[0];

      const recovered = await sessionRecoveryModule.buildRecoveredState(persistence);

      expect(recovered).not.toBeNull();
      expect(recovered?.playMode).toBe('calibration');
    });

    it('uses snapshot trialIndex fallback when projected trial index is missing', async () => {
      const snapshot = createValidSnapshot({
        sessionId: 'recover-session-fallback',
        modeId: 'game',
        trialIndex: 7,
        totalTrials: 20,
      });
      saveRecoverySnapshot(snapshot);

      const persistence = {
        getSession: async (sessionId: string) => {
          if (sessionId !== 'recover-session-fallback') return [];
          return [
            {
              id: 'evt-session-started',
              session_id: sessionId,
              type: 'SESSION_STARTED',
              timestamp: Date.now() - 5000,
              payload: {
                schemaVersion: 1,
                userId: 'user-1',
                nLevel: 2,
                playContext: 'free',
                device: {
                  platform: 'web',
                  screenWidth: 1080,
                  screenHeight: 1920,
                  userAgent: 'test',
                  touchCapable: true,
                },
                context: {
                  timeOfDay: 'morning',
                  localHour: 10,
                  dayOfWeek: 1,
                  timezone: 'UTC',
                },
                config: {
                  nLevel: 2,
                  trialsCount: 20,
                  activeModalities: ['position', 'audio'],
                  targetProbability: 0.33,
                  lureProbability: 0.1,
                  intervalSeconds: 3,
                  stimulusDurationSeconds: 0.5,
                  generator: 'DualnbackClassic',
                },
                gameMode: 'dualnback-classic',
                trialsSeed: 'seed-fallback',
              },
            },
          ];
        },
      } as unknown as Parameters<typeof sessionRecoveryModule.buildRecoveredState>[0];

      const recovered = await sessionRecoveryModule.buildRecoveredState(persistence);

      expect(recovered).not.toBeNull();
      expect(recovered?.lastTrialIndex).toBe(7);
    });
  });
});
