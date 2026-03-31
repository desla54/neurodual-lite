/**
 * Integration Tests with bun:sqlite
 *
 * Tests the full cycle:
 * 1. Create realistic events
 * 2. Persist to real SQLite (in-memory)
 * 3. Query back from SQLite
 * 4. Project via SessionProjector
 * 5. Verify consistency
 *
 * Unlike unit tests that mock everything, these tests use a REAL SQLite database.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SQLITE_SCHEMA } from './sqlite-schema';
import { buildInClause } from './sql-helpers';
import { SessionProjector } from '@neurodual/logic';
import type {
  GameEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
} from '@neurodual/logic';

// =============================================================================
// Test SQLite Adapter (simplified PersistencePort for tests)
// =============================================================================

type TestEmtMessageRow = {
  message_data: string;
};

class TestSQLiteAdapter {
  private db: Database;
  private globalPosition = 0n;
  private streamPositions = new Map<string, bigint>();

  constructor() {
    // In-memory database
    this.db = new Database(':memory:');
    this.initSchema();
  }

  private initSchema(): void {
    // Execute the entire schema as one block
    // bun:sqlite can handle multi-statement execution
    this.db.exec(SQLITE_SCHEMA);
  }

  private nextPositions(streamId: string): { streamPosition: bigint; globalPosition: bigint } {
    const nextStreamPosition = (this.streamPositions.get(streamId) ?? 0n) + 1n;
    this.streamPositions.set(streamId, nextStreamPosition);
    this.globalPosition += 1n;
    return { streamPosition: nextStreamPosition, globalPosition: this.globalPosition };
  }

  append(event: {
    id: string;
    sessionId: string;
    userId?: string;
    type: string;
    timestamp: number;
    payload: Record<string, unknown>;
  }): void {
    const streamId = `session:${event.sessionId}`;
    const { streamPosition, globalPosition } = this.nextPositions(streamId);

    const data: Record<string, unknown> = {
      ...event.payload,
      id: event.id,
      type: event.type,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      ...(typeof event.userId === 'string' ? { userId: event.userId } : {}),
    };

    const messageData = JSON.stringify({ id: event.id, type: event.type, data });
    const created = new Date(event.timestamp).toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO emt_messages (
        id,
        stream_id,
        stream_position,
        partition,
        message_kind,
        message_data,
        message_metadata,
        message_schema_version,
        message_type,
        message_id,
        is_archived,
        global_position,
        created
      ) VALUES (?, ?, ?, ?, 'E', ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
      `${streamId}:${streamPosition.toString()}`,
      streamId,
      streamPosition.toString(),
      'global',
      messageData,
      '{}',
      '1',
      event.type,
      event.id,
      globalPosition.toString(),
      created,
    );
  }

  appendBatch(
    events: Array<{
      id: string;
      sessionId: string;
      userId?: string;
      type: string;
      timestamp: number;
      payload: Record<string, unknown>;
    }>,
  ): number {
    const insertMany = this.db.transaction((evts: typeof events) => {
      for (const event of evts) {
        this.append(event);
      }
      return evts.length;
    });

    return insertMany(events);
  }

  getSession(sessionId: string): GameEvent[] {
    const stmt = this.db.prepare(`
      SELECT message_data
      FROM emt_messages
      WHERE message_kind = 'E'
        AND is_archived = 0
        AND stream_id = ?
      ORDER BY CAST(global_position AS INTEGER) ASC
    `);

    const rows = stmt.all(`session:${sessionId}`) as TestEmtMessageRow[];
    return rows.map((row) => this.rowToEvent(row));
  }

  queryEvents(options: { sessionId?: string; type?: string | string[] }): GameEvent[] {
    let sql = `
      SELECT message_data
      FROM emt_messages
      WHERE message_kind = 'E'
        AND is_archived = 0
    `;
    const params: unknown[] = [];

    if (options.sessionId) {
      sql += ' AND stream_id = ?';
      params.push(`session:${options.sessionId}`);
    }

    if (options.type) {
      if (Array.isArray(options.type)) {
        const { sql: typesSql, params: typeParams } = buildInClause([...options.type]);
        sql += ` AND message_type IN ${typesSql}`;
        params.push(...typeParams);
      } else {
        sql += ' AND message_type = ?';
        params.push(options.type);
      }
    }

    sql += ' ORDER BY CAST(global_position AS INTEGER) ASC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...(params as any[])) as TestEmtMessageRow[];
    return rows.map((row) => this.rowToEvent(row));
  }

  count(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM emt_messages
      WHERE message_kind = 'E' AND is_archived = 0
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  clear(): void {
    this.db.exec('DELETE FROM emt_messages');
    this.globalPosition = 0n;
    this.streamPositions.clear();
  }

  close(): void {
    this.db.close();
  }

  private rowToEvent(row: TestEmtMessageRow): GameEvent {
    const envelope = JSON.parse(row.message_data) as { data: Record<string, unknown> };
    return envelope.data as GameEvent;
  }
}

// =============================================================================
// Event Factories (realistic events with all required fields)
// =============================================================================

function createSessionStartedEvent(
  sessionId: string,
  timestamp: number,
  overrides: Partial<SessionStartedEvent> = {},
): SessionStartedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'SESSION_STARTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    userId: 'test-user-123',
    nLevel: 2,
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'Mozilla/5.0 (Test)',
      touchCapable: false,
      appVersion: '1.0.0',
    },
    context: {
      timeOfDay: 'afternoon',
      localHour: 14,
      dayOfWeek: 3,
      timezone: 'Europe/Paris',
    },
    config: {
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.25,
      lureProbability: 0.15,
      intervalSeconds: 2.5,
      stimulusDurationSeconds: 0.5,
      generator: 'Sequence',
    },
    gameMode: 'dual-catch',
    ...overrides,
  } as SessionStartedEvent;
}

function createTrialPresentedEvent(
  sessionId: string,
  timestamp: number,
  trialIndex: number,
  options: {
    isPositionTarget?: boolean;
    isSoundTarget?: boolean;
    isBuffer?: boolean;
  } = {},
): TrialPresentedEvent {
  const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const sounds = ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T'] as const;

  return {
    id: crypto.randomUUID(),
    type: 'TRIAL_PRESENTED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    trial: {
      index: trialIndex,
      isBuffer: options.isBuffer ?? trialIndex < 2,
      position: positions[trialIndex % 9],
      sound: sounds[trialIndex % 8],
      color: 'ink-black',
      image: 'circle',
      trialType: options.isPositionTarget || options.isSoundTarget ? 'Cible' : 'Non-Cible',
      isPositionTarget: options.isPositionTarget ?? false,
      isSoundTarget: options.isSoundTarget ?? false,
      isColorTarget: false,
      isImageTarget: false,
      isPositionLure: false,
      isSoundLure: false,
      isColorLure: false,
      isImageLure: false,
      positionLureType: undefined,
      soundLureType: undefined,
      colorLureType: undefined,
      imageLureType: undefined,
      targetModalities: [],
      lureModalities: [],
    },
    isiMs: 2500,
    stimulusDurationMs: 500,
  } as TrialPresentedEvent;
}

function createUserResponseEvent(
  sessionId: string,
  timestamp: number,
  trialIndex: number,
  modality: 'position' | 'audio',
  reactionTimeMs: number = 350,
): UserResponseEvent {
  return {
    id: crypto.randomUUID(),
    type: 'USER_RESPONDED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    trialIndex,
    modality,
    reactionTimeMs,
    pressDurationMs: 120,
    responsePhase: 'during_stimulus',
    inputMethod: 'keyboard',
  } as UserResponseEvent;
}

function createSessionEndedEvent(
  sessionId: string,
  timestamp: number,
  durationMs: number,
): SessionEndedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'SESSION_ENDED',
    sessionId,
    timestamp,
    schemaVersion: 1,
    durationMs,
    reason: 'completed',
  } as unknown as SessionEndedEvent;
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('SQLite Integration Tests', () => {
  let adapter: TestSQLiteAdapter;

  beforeEach(() => {
    adapter = new TestSQLiteAdapter();
  });

  afterEach(() => {
    adapter.close();
  });

  describe('Basic Persistence', () => {
    it('should persist and retrieve a single event', () => {
      const sessionId = crypto.randomUUID();
      const event = createSessionStartedEvent(sessionId, Date.now());

      adapter.append({
        id: event.id,
        sessionId: event.sessionId,
        userId: event.userId,
        type: event.type,
        timestamp: event.timestamp,
        payload: {
          schemaVersion: event.schemaVersion,
          nLevel: event.nLevel,
          device: event.device,
          context: event.context,
          config: event.config,
          gameMode: event.gameMode,
        },
      });

      const retrieved = adapter.getSession(sessionId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]!.type).toBe('SESSION_STARTED');
      expect(retrieved[0]!.sessionId).toBe(sessionId);
    });

    it('should handle null userId gracefully', () => {
      const sessionId = crypto.randomUUID();
      const event = createSessionStartedEvent(sessionId, Date.now());

      adapter.append({
        id: event.id,
        sessionId: event.sessionId,
        userId: undefined,
        type: event.type,
        timestamp: event.timestamp,
        payload: {
          schemaVersion: event.schemaVersion,
          nLevel: event.nLevel,
          device: event.device,
          context: event.context,
          config: event.config,
          gameMode: event.gameMode,
        },
      });

      const retrieved = adapter.getSession(sessionId);
      expect(retrieved).toHaveLength(1);
      expect((retrieved[0]! as any).userId).toBeUndefined();
    });

    it('should return empty array for non-existent session', () => {
      const retrieved = adapter.getSession(crypto.randomUUID());
      expect(retrieved).toHaveLength(0);
    });

    it('should persist and retrieve multiple events in order', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      const events = [
        createSessionStartedEvent(sessionId, baseTime),
        createTrialPresentedEvent(sessionId, baseTime + 100, 0, { isBuffer: true }),
        createTrialPresentedEvent(sessionId, baseTime + 3000, 1, { isBuffer: true }),
        createTrialPresentedEvent(sessionId, baseTime + 6000, 2, { isPositionTarget: true }),
        createUserResponseEvent(sessionId, baseTime + 6350, 2, 'position'),
        createSessionEndedEvent(sessionId, baseTime + 60000, 60000),
      ];

      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      const retrieved = adapter.getSession(sessionId);
      expect(retrieved).toHaveLength(6);

      // Verify order
      const types = retrieved.map((e) => e.type);
      expect(types).toEqual([
        'SESSION_STARTED',
        'TRIAL_PRESENTED',
        'TRIAL_PRESENTED',
        'TRIAL_PRESENTED',
        'USER_RESPONDED',
        'SESSION_ENDED',
      ]);

      // Verify timestamps are in order
      for (let i = 1; i < retrieved.length; i++) {
        expect(retrieved[i]!.timestamp).toBeGreaterThanOrEqual(retrieved[i - 1]!.timestamp);
      }
    });

    it('should handle batch insert efficiently', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      const events: GameEvent[] = [];
      events.push(createSessionStartedEvent(sessionId, baseTime));

      // 20 trials with responses
      for (let i = 0; i < 20; i++) {
        const trialTime = baseTime + 1000 + i * 3000;
        events.push(
          createTrialPresentedEvent(sessionId, trialTime, i, {
            isBuffer: i < 2,
            isPositionTarget: i >= 2 && i % 4 === 0,
            isSoundTarget: i >= 2 && i % 5 === 0,
          }),
        );

        // Add response for some trials
        if (i >= 2 && (i % 4 === 0 || i % 5 === 0)) {
          events.push(
            createUserResponseEvent(
              sessionId,
              trialTime + 350,
              i,
              i % 4 === 0 ? 'position' : 'audio',
            ),
          );
        }
      }

      events.push(createSessionEndedEvent(sessionId, baseTime + 70000, 70000));

      const batchEvents = events.map((event) => ({
        id: event.id,
        sessionId: event.sessionId,
        userId: (event as SessionStartedEvent).userId,
        type: event.type,
        timestamp: event.timestamp,
        payload: extractPayload(event),
      }));

      const count = adapter.appendBatch(batchEvents);
      expect(count).toBe(events.length);

      const retrieved = adapter.getSession(sessionId);
      expect(retrieved).toHaveLength(events.length);
    });

    it('should handle empty batch insert', () => {
      const count = adapter.appendBatch([]);
      expect(count).toBe(0);
    });

    it('should query events by type', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      const events = [
        createSessionStartedEvent(sessionId, baseTime),
        createTrialPresentedEvent(sessionId, baseTime + 100, 0),
        createTrialPresentedEvent(sessionId, baseTime + 3000, 1),
        createUserResponseEvent(sessionId, baseTime + 3350, 1, 'position'),
        createSessionEndedEvent(sessionId, baseTime + 10000, 10000),
      ];

      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      const trials = adapter.queryEvents({ type: 'TRIAL_PRESENTED' });
      expect(trials).toHaveLength(2);
      expect(trials.every((e) => e.type === 'TRIAL_PRESENTED')).toBe(true);

      const responses = adapter.queryEvents({ type: 'USER_RESPONDED' });
      expect(responses).toHaveLength(1);
    });

    it('should query events by array of types', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      const events = [
        createSessionStartedEvent(sessionId, baseTime),
        createTrialPresentedEvent(sessionId, baseTime + 100, 0),
        createTrialPresentedEvent(sessionId, baseTime + 3000, 1),
        createUserResponseEvent(sessionId, baseTime + 3350, 1, 'position'),
        createSessionEndedEvent(sessionId, baseTime + 10000, 10000),
      ];

      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      const results = adapter.queryEvents({ type: ['TRIAL_PRESENTED', 'USER_RESPONDED'] });
      expect(results).toHaveLength(3);
    });

    it('should query all events when no options', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      const events = [
        createSessionStartedEvent(sessionId, baseTime),
        createTrialPresentedEvent(sessionId, baseTime + 100, 0),
        createSessionEndedEvent(sessionId, baseTime + 5000, 5000),
      ];

      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      const allEvents = adapter.queryEvents({});
      expect(allEvents).toHaveLength(3);
    });
  });

  describe('Session Projection', () => {
    it('should project a complete session correctly', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      // Create a realistic session: 10 non-buffer trials
      // 4 position targets, 3 audio targets, 3 non-targets
      const events: GameEvent[] = [];

      events.push(createSessionStartedEvent(sessionId, baseTime));

      // Buffer trials (index 0, 1)
      events.push(createTrialPresentedEvent(sessionId, baseTime + 1000, 0, { isBuffer: true }));
      events.push(createTrialPresentedEvent(sessionId, baseTime + 4000, 1, { isBuffer: true }));

      // Non-buffer trials with various target configurations
      const trialConfigs = [
        { isPositionTarget: true, isSoundTarget: false }, // index 2 - position target
        { isPositionTarget: false, isSoundTarget: true }, // index 3 - audio target
        { isPositionTarget: false, isSoundTarget: false }, // index 4 - non-target
        { isPositionTarget: true, isSoundTarget: false }, // index 5 - position target
        { isPositionTarget: false, isSoundTarget: true }, // index 6 - audio target
        { isPositionTarget: true, isSoundTarget: true }, // index 7 - dual target
        { isPositionTarget: false, isSoundTarget: false }, // index 8 - non-target
        { isPositionTarget: true, isSoundTarget: false }, // index 9 - position target
      ];

      for (let i = 0; i < trialConfigs.length; i++) {
        const trialIndex = i + 2;
        const trialTime = baseTime + 7000 + i * 3000;

        events.push(createTrialPresentedEvent(sessionId, trialTime, trialIndex, trialConfigs[i]));

        // Simulate correct responses for targets
        if (trialConfigs[i]!.isPositionTarget) {
          events.push(
            createUserResponseEvent(sessionId, trialTime + 400, trialIndex, 'position', 400),
          );
        }
        if (trialConfigs[i]!.isSoundTarget) {
          events.push(
            createUserResponseEvent(sessionId, trialTime + 450, trialIndex, 'audio', 450),
          );
        }
      }

      events.push(createSessionEndedEvent(sessionId, baseTime + 35000, 35000));

      // Persist all events
      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      // Retrieve and project
      const retrieved = adapter.getSession(sessionId);
      expect(retrieved.length).toBe(events.length);

      // Use SessionProjector static method
      const summary = SessionProjector.project(retrieved);
      expect(summary).toBeDefined();
      expect(summary!.durationMs).toBe(35000);

      // Verify trials were processed (totalTrials = ALL trials including buffer)
      expect(summary!.totalTrials).toBe(10); // 2 buffer + 8 non-buffer = 10 total
    });

    it('should handle session with mixed hits, misses, and false alarms', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();
      const events: GameEvent[] = [];

      events.push(createSessionStartedEvent(sessionId, baseTime));

      // Buffer trials
      events.push(createTrialPresentedEvent(sessionId, baseTime + 1000, 0, { isBuffer: true }));
      events.push(createTrialPresentedEvent(sessionId, baseTime + 4000, 1, { isBuffer: true }));

      // Trial 2: Position target, user responds -> HIT
      events.push(
        createTrialPresentedEvent(sessionId, baseTime + 7000, 2, { isPositionTarget: true }),
      );
      events.push(createUserResponseEvent(sessionId, baseTime + 7400, 2, 'position'));

      // Trial 3: Audio target, user does NOT respond -> MISS
      events.push(
        createTrialPresentedEvent(sessionId, baseTime + 10000, 3, { isSoundTarget: true }),
      );
      // No response

      // Trial 4: Non-target, user responds -> FALSE ALARM
      events.push(createTrialPresentedEvent(sessionId, baseTime + 13000, 4));
      events.push(createUserResponseEvent(sessionId, baseTime + 13500, 4, 'position'));

      // Trial 5: Non-target, user does not respond -> CORRECT REJECTION
      events.push(createTrialPresentedEvent(sessionId, baseTime + 16000, 5));
      // No response

      events.push(createSessionEndedEvent(sessionId, baseTime + 20000, 20000));

      // Persist
      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      // Retrieve and project
      const retrieved = adapter.getSession(sessionId);
      const summary = SessionProjector.project(retrieved);

      expect(summary).toBeDefined();
      expect(summary!.totalTrials).toBe(6); // 2 buffer + 4 non-buffer = 6 total

      // Check finalStats.byModality stats exist
      expect(summary!.finalStats.byModality).toBeDefined();
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity across multiple sessions', () => {
      const session1 = crypto.randomUUID();
      const session2 = crypto.randomUUID();
      const baseTime = Date.now();

      // Create events for two different sessions
      const session1Events = [
        createSessionStartedEvent(session1, baseTime),
        createTrialPresentedEvent(session1, baseTime + 1000, 0),
        createSessionEndedEvent(session1, baseTime + 5000, 5000),
      ];

      const session2Events = [
        createSessionStartedEvent(session2, baseTime + 10000),
        createTrialPresentedEvent(session2, baseTime + 11000, 0),
        createTrialPresentedEvent(session2, baseTime + 14000, 1),
        createSessionEndedEvent(session2, baseTime + 20000, 10000),
      ];

      // Persist interleaved (simulating concurrent sessions)
      const allEvents = [...session1Events, ...session2Events].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      for (const event of allEvents) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      // Verify each session has correct events
      const s1Events = adapter.getSession(session1);
      const s2Events = adapter.getSession(session2);

      expect(s1Events).toHaveLength(3);
      expect(s2Events).toHaveLength(4);

      // All events in s1Events should have session1 id
      expect(s1Events.every((e) => e.sessionId === session1)).toBe(true);
      expect(s2Events.every((e) => e.sessionId === session2)).toBe(true);
    });

    it('should handle large payloads correctly', () => {
      const sessionId = crypto.randomUUID();
      const largeConfig = {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 100,
        targetProbability: 0.25,
        lureProbability: 0.15,
        intervalSeconds: 2.5,
        stimulusDurationSeconds: 0.5,
        generator: 'Sequence',
        // Add some extra data to make payload larger
        metadata: {
          experimentId: 'exp-123',
          participantId: 'participant-456',
          notes: 'A'.repeat(1000), // 1KB of notes
          tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
        },
      };

      const event = createSessionStartedEvent(sessionId, Date.now(), {
        config: largeConfig as SessionStartedEvent['config'],
      });

      adapter.append({
        id: event.id,
        sessionId: event.sessionId,
        userId: event.userId,
        type: event.type,
        timestamp: event.timestamp,
        payload: {
          schemaVersion: event.schemaVersion,
          nLevel: event.nLevel,
          device: event.device,
          context: event.context,
          config: largeConfig,
          gameMode: event.gameMode,
        },
      });

      const retrieved = adapter.getSession(sessionId);
      expect(retrieved).toHaveLength(1);

      const retrievedEvent = retrieved[0] as SessionStartedEvent;
      expect((retrievedEvent.config as unknown as Record<string, unknown>).metadata).toBeDefined();
    });

    it('should count events correctly', () => {
      const sessionId = crypto.randomUUID();
      const baseTime = Date.now();

      expect(adapter.count()).toBe(0);

      const events = [
        createSessionStartedEvent(sessionId, baseTime),
        createTrialPresentedEvent(sessionId, baseTime + 1000, 0),
        createTrialPresentedEvent(sessionId, baseTime + 4000, 1),
        createSessionEndedEvent(sessionId, baseTime + 10000, 10000),
      ];

      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      expect(adapter.count()).toBe(4);

      adapter.clear();
      expect(adapter.count()).toBe(0);
    });

    it('should clear all events', () => {
      const sessionId1 = crypto.randomUUID();
      const sessionId2 = crypto.randomUUID();
      const baseTime = Date.now();

      const events1 = [
        createSessionStartedEvent(sessionId1, baseTime),
        createTrialPresentedEvent(sessionId1, baseTime + 1000, 0),
      ];

      const events2 = [
        createSessionStartedEvent(sessionId2, baseTime + 2000),
        createTrialPresentedEvent(sessionId2, baseTime + 3000, 0),
      ];

      for (const event of events1) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      for (const event of events2) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      expect(adapter.count()).toBe(4);

      adapter.clear();
      expect(adapter.count()).toBe(0);
    });
  });

  describe('Reconstruction from Events', () => {
    it('should reconstruct session history correctly from raw events', () => {
      const sessionId = crypto.randomUUID();
      const userId = 'test-user-456';
      const baseTime = Date.now();

      // Create a complete session
      const events: GameEvent[] = [createSessionStartedEvent(sessionId, baseTime, { userId })];

      // 20 trials (2 buffer + 18 non-buffer)
      for (let i = 0; i < 20; i++) {
        const trialTime = baseTime + 1000 + i * 3000;
        const isBuffer = i < 2;
        const isPositionTarget = !isBuffer && i % 3 === 0;
        const isSoundTarget = !isBuffer && i % 4 === 0;

        events.push(
          createTrialPresentedEvent(sessionId, trialTime, i, {
            isBuffer,
            isPositionTarget,
            isSoundTarget,
          }),
        );

        // Respond to most targets (deterministic for test)
        if (!isBuffer && (isPositionTarget || isSoundTarget)) {
          if (isPositionTarget) {
            events.push(createUserResponseEvent(sessionId, trialTime + 350, i, 'position'));
          }
          if (isSoundTarget) {
            events.push(createUserResponseEvent(sessionId, trialTime + 400, i, 'audio'));
          }
        }
      }

      events.push(createSessionEndedEvent(sessionId, baseTime + 65000, 65000));

      // Persist
      for (const event of events) {
        adapter.append({
          id: event.id,
          sessionId: event.sessionId,
          userId: (event as SessionStartedEvent).userId,
          type: event.type,
          timestamp: event.timestamp,
          payload: extractPayload(event),
        });
      }

      // Reconstruct from DB
      const retrieved = adapter.getSession(sessionId);

      // Verify structure
      const sessionStart = retrieved.find(
        (e) => e.type === 'SESSION_STARTED',
      ) as SessionStartedEvent;
      const sessionEnd = retrieved.find((e) => e.type === 'SESSION_ENDED') as SessionEndedEvent;
      const trials = retrieved.filter((e) => e.type === 'TRIAL_PRESENTED') as TrialPresentedEvent[];
      const responses = retrieved.filter((e) => e.type === 'USER_RESPONDED') as UserResponseEvent[];

      expect(sessionStart).toBeDefined();
      expect(sessionEnd).toBeDefined();
      expect(trials).toHaveLength(20);
      expect(responses.length).toBeGreaterThan(0);

      // Verify all responses reference valid trial indices
      const trialIndices = new Set(trials.map((t) => t.trial.index));
      for (const response of responses) {
        expect(trialIndices.has(response.trialIndex)).toBe(true);
      }

      // Project and verify summary
      const summary = SessionProjector.project(retrieved);

      expect(summary).toBeDefined();
      expect(summary!.durationMs).toBe(65000);
    });
  });
});

// =============================================================================
// Helpers
// =============================================================================

function extractPayload(event: GameEvent): Record<string, unknown> {
  // Extract all fields except the base event fields
  const eventObj = event as unknown as Record<string, unknown>;
  const { id, sessionId, type, timestamp, ...payload } = eventObj;
  return payload;
}
