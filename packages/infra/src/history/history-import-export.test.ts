import { describe, expect, it, mock } from 'bun:test';
import { exportSessionsToJSON, importSessionsFromJSON } from './history-import-export';
import type { PersistencePort, SessionHistoryItem } from '@neurodual/logic';

describe('history-import-export', () => {
  const createMockSession = (overrides: Partial<SessionHistoryItem> = {}): SessionHistoryItem => ({
    id: 'session-123',
    createdAt: new Date('2024-01-15T10:30:00.000Z'),
    nLevel: 2,
    dPrime: 1.5,
    passed: true,
    trialsCount: 20,
    durationMs: 60000,
    byModality: {
      position: {
        hits: 8,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 9,
        dPrime: 1.8,
        avgRT: 450,
      },
      sound: {
        hits: 7,
        misses: 3,
        falseAlarms: 2,
        correctRejections: 8,
        dPrime: 1.2,
        avgRT: 500,
      },
    },
    generator: 'standard',
    gameMode: 'dual-catch',
    activeModalities: ['position', 'sound'],
    reason: 'completed',
    playContext: 'free',
    unifiedMetrics: {
      accuracy: 0.8,
      nLevel: 2,
      zone: 1,
      zoneProgress: 0,
    },
    ...overrides,
  });

  describe('exportSessionsToJSON', () => {
    it('should export empty array correctly', () => {
      const result = exportSessionsToJSON([]);

      expect(result.version).toBe(1);
      expect(result.exportedAt).toBeDefined();
      expect(result.sessions).toEqual([]);
    });

    it('should export single session with all required fields', () => {
      const session = createMockSession();
      const result = exportSessionsToJSON([session]);

      expect(result.version).toBe(1);
      expect(result.sessions.length).toBe(1);

      const exported = result.sessions[0];
      expect(exported!.id).toBe('session-123');
      expect(exported!.createdAt).toBe('2024-01-15T10:30:00.000Z');
      expect(exported!.nLevel).toBe(2);
      expect(exported!.dPrime).toBe(1.5);
      expect(exported!.passed).toBe(true);
      expect(exported!.trialsCount).toBe(20);
      expect(exported!.durationMs).toBe(60000);
      expect(exported!.gameMode).toBe('dual-catch');
      expect(exported!.generator).toBe('standard');
      expect(exported!.reason).toBe('completed');
    });

    it('should export byModality data correctly', () => {
      const session = createMockSession();
      const result = exportSessionsToJSON([session]);

      const exported = result.sessions[0];
      expect(exported!.byModality).toBeDefined();
      expect(exported!.byModality?.position?.hits).toBe(8);
      expect(exported!.byModality?.sound?.dPrime).toBe(1.2);
    });

    it('should export multiple sessions', () => {
      const sessions = [
        createMockSession({ id: 'session-1', nLevel: 2 }),
        createMockSession({ id: 'session-2', nLevel: 3 }),
        createMockSession({ id: 'session-3', nLevel: 4 }),
      ];

      const result = exportSessionsToJSON(sessions);

      expect(result.sessions.length).toBe(3);
      expect(result!.sessions[0]!.id).toBe('session-1');
      expect(result!.sessions[1]!.id).toBe('session-2');
      expect(result!.sessions[2]!.id).toBe('session-3');
    });

    it('should export optional UPS score when present', () => {
      const session = createMockSession({ upsScore: 75.5, upsAccuracy: 74.2, upsConfidence: 88.1 });
      const result = exportSessionsToJSON([session]);

      expect(result!.sessions[0]!.upsScore).toBe(75.5);
      expect(result!.sessions[0]!.upsAccuracy).toBe(74.2);
      expect(result!.sessions[0]!.upsConfidence).toBe(88.1);
    });

    it('should export optional confidence metrics when present', () => {
      const session = createMockSession({
        flowConfidenceScore: 85,
        flowDirectnessRatio: 0.92,
        flowWrongSlotDwellMs: 150,
        recallConfidenceScore: 78,
        recallFluencyScore: 90,
        recallCorrectionsCount: 2,
      });

      const result = exportSessionsToJSON([session]);
      const exported = result.sessions[0];

      expect(exported!.flowConfidenceScore).toBe(85);
      expect(exported!.flowDirectnessRatio).toBe(0.92);
      expect(exported!.flowWrongSlotDwellMs).toBe(150);
      expect(exported!.recallConfidenceScore).toBe(78);
      expect(exported!.recallFluencyScore).toBe(90);
      expect(exported!.recallCorrectionsCount).toBe(2);
    });

    it('should export timing metrics when present', () => {
      const session = createMockSession({
        avgResponseTimeMs: 450,
        medianResponseTimeMs: 420,
        responseTimeStdDev: 85,
        avgPressDurationMs: 120,
        pressDurationStdDev: 25,
        responsesDuringStimulus: 15,
        responsesAfterStimulus: 5,
      });

      const result = exportSessionsToJSON([session]);
      const exported = result.sessions[0];

      expect(exported!.avgResponseTimeMs).toBe(450);
      expect(exported!.medianResponseTimeMs).toBe(420);
      expect(exported!.responseTimeStdDev).toBe(85);
      expect(exported!.avgPressDurationMs).toBe(120);
      expect(exported!.pressDurationStdDev).toBe(25);
      expect(exported!.responsesDuringStimulus).toBe(15);
      expect(exported!.responsesAfterStimulus).toBe(5);
    });

    it('should export focus metrics when present', () => {
      const session = createMockSession({
        focusLostCount: 3,
        focusLostTotalMs: 5000,
      });

      const result = exportSessionsToJSON([session]);
      const exported = result.sessions[0];

      expect(exported!.focusLostCount).toBe(3);
      expect(exported!.focusLostTotalMs).toBe(5000);
    });

    it('should export journey information when present', () => {
      const session = createMockSession({
        journeyStageId: 1,
        journeyId: 'journey-abc',
        playContext: 'journey',
      });

      const result = exportSessionsToJSON([session]);
      const exported = result.sessions[0];

      expect(exported!.journeyStageId).toBe(1);
      expect(exported!.journeyId).toBe('journey-abc');
    });

    it('should handle undefined optional fields gracefully', () => {
      const session = createMockSession({
        upsScore: undefined,
        flowConfidenceScore: undefined,
        journeyStageId: undefined,
      });

      const result = exportSessionsToJSON([session]);
      const exported = result.sessions[0];

      expect(exported!.upsScore).toBeUndefined();
      expect(exported!.flowConfidenceScore).toBeUndefined();
      expect(exported!.journeyStageId).toBeUndefined();
    });

    it('should have valid exportedAt timestamp', () => {
      const before = new Date();
      const result = exportSessionsToJSON([createMockSession()]);
      const after = new Date();

      const exportedAt = new Date(result.exportedAt);
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('importSessionsFromJSON', () => {
    it('should project dualnback-classic imports via the standard history projector', async () => {
      const insertSessionSummary = mock(async () => {});
      const insertSessionSummariesBatch = mock(async () => 0);

      const persistence = {
        appendBatch: mock(async () => 1),
        getSession: mock(async () => [
          {
            user_id: 'local',
          },
        ]),
        insertSessionSummary,
        insertSessionSummariesBatch,
      } as unknown as PersistencePort;

      const input = exportSessionsToJSON([
        createMockSession({
          id: '123e4567-e89b-42d3-a456-426614174000',
          gameMode: 'dualnback-classic',
          byModality: {
            position: {
              hits: 10,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 10,
              dPrime: 3,
              avgRT: 400,
            },
          },
          activeModalities: ['position'],
        }),
      ]);

      const result = await importSessionsFromJSON(persistence, input, []);

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(insertSessionSummary).toHaveBeenCalledTimes(1);
      expect(insertSessionSummariesBatch).not.toHaveBeenCalled();
    });
  });
});
