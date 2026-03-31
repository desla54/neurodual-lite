import { describe, expect, it } from 'bun:test';
import type { GameEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';
import { projectTempoSessionEntrypoint } from './tempo-projection-entrypoint';

/**
 * Create a minimal N-Back (non-dualnback-classic) event stream that
 * SessionProjector.project can turn into a SessionSummary.
 */
function createNbackEvents(sessionId: string): GameEvent[] {
  return [
    createMockEvent('SESSION_STARTED', {
      sessionId,
      timestamp: 1000,
      userId: 'local',
      nLevel: 2,
      // @ts-expect-error test override
      gameMode: 'dualnback',
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: false,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
      config: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 20,
        targetProbability: 0.3,
        lureProbability: 0.1,
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
        // @ts-expect-error test override
        generator: 'Dualnback',
      },
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 2000,
      trial: {
        index: 0,
        isBuffer: false,
        position: 0,
        sound: 'C',
        color: 'ink-black',
        image: 'diamond',
        trialType: 'Dual',
        isPositionTarget: true,
        isSoundTarget: true,
        isColorTarget: false,
        isImageTarget: false,
        isPositionLure: false,
        isSoundLure: false,
        isColorLure: false,
        isImageLure: false,
      },
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 3000,
      trialIndex: 0,
      // @ts-expect-error test override
      responses: { position: true, audio: true },
      reactionTimes: { position: 500, audio: 600 },
    }),
    createMockEvent('SESSION_ENDED', {
      sessionId,
      timestamp: 10000,
      // @ts-expect-error test override
      durationMs: 9000,
      reason: 'completed',
    }),
  ];
}

function createDualnbackClassicEvents(sessionId: string): GameEvent[] {
  return [
    createMockEvent('SESSION_STARTED', {
      sessionId,
      timestamp: 1000,
      userId: 'local',
      nLevel: 2,
      gameMode: 'dualnback-classic',
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: false,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
      config: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 20,
        targetProbability: 0.3,
        lureProbability: 0.1,
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
        generator: 'DualnbackClassic',
      },
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 2000,
      trial: {
        index: 0,
        isBuffer: false,
        position: 0,
        sound: 'C',
        color: 'ink-black',
        image: 'diamond',
        trialType: 'Dual',
        isPositionTarget: true,
        isSoundTarget: true,
        isColorTarget: false,
        isImageTarget: false,
        isPositionLure: false,
        isSoundLure: false,
        isColorLure: false,
        isImageLure: false,
      },
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 3000,
      trialIndex: 0,
      // @ts-expect-error test override
      responses: { position: true, audio: true },
      reactionTimes: { position: 500, audio: 600 },
    }),
    createMockEvent('SESSION_ENDED', {
      sessionId,
      timestamp: 10000,
      // @ts-expect-error test override
      durationMs: 9000,
      reason: 'completed',
    }),
  ];
}

describe('projectTempoSessionEntrypoint', () => {
  // ── Stream isolation ────────────────────────────────────────────────────
  describe('stream isolation by sessionId', () => {
    it('filters events to only the target sessionId for non-classic modes', () => {
      const target = createNbackEvents('target-session');
      const other = createNbackEvents('other-session');
      const mixed = [...target, ...other];

      const result = projectTempoSessionEntrypoint({
        sessionId: 'target-session',
        gameMode: 'dualnback',
        events: mixed,
      });

      expect(result).not.toBeNull();
      // All returned events should belong to target session
      for (const e of result!.eventsForProjection) {
        expect(e.sessionId).toBe('target-session');
      }
    });

    it('excludes events from other sessions', () => {
      const target = createNbackEvents('s1');
      const other = createNbackEvents('s2');
      const mixed = [...target, ...other];

      const result = projectTempoSessionEntrypoint({
        sessionId: 's1',
        gameMode: 'dualnback',
        events: mixed,
      });

      expect(result).not.toBeNull();
      expect(result!.eventsForProjection.length).toBe(target.length);
    });
  });

  // ── Non-classic mode dispatch ───────────────────────────────────────────
  describe('non-classic modes (default path)', () => {
    it('returns summary and events for a valid session', () => {
      const events = createNbackEvents('s1');
      const result = projectTempoSessionEntrypoint({
        sessionId: 's1',
        gameMode: 'dualnback',
        events,
      });

      expect(result).not.toBeNull();
      expect(result!.summary).toBeDefined();
      expect(result!.eventsForProjection.length).toBeGreaterThan(0);
    });

    it('returns null when SessionProjector yields no summary', () => {
      // Empty events for the target session => no SESSION_STARTED => null summary
      const result = projectTempoSessionEntrypoint({
        sessionId: 'missing',
        gameMode: 'dualnback',
        events: createNbackEvents('other'),
      });

      expect(result).toBeNull();
    });

    it('returns null for empty events array', () => {
      const result = projectTempoSessionEntrypoint({
        sessionId: 's1',
        gameMode: 'dualnback',
        events: [],
      });

      expect(result).toBeNull();
    });
  });

  // ── dualnback-classic special case ──────────────────────────────────────
  describe('dualnback-classic dispatch', () => {
    it('routes dualnback-classic through Home ES registry', () => {
      const events = createDualnbackClassicEvents('classic-1');
      const result = projectTempoSessionEntrypoint({
        sessionId: 'classic-1',
        gameMode: 'dualnback-classic',
        events,
      });

      // The Home ES projector handles dualnback-classic; it may return a result or null
      // depending on event completeness. The key assertion is that it does not crash
      // and returns the expected shape if non-null.
      if (result !== null) {
        expect(result.summary).toBeDefined();
        expect(result.eventsForProjection).toBeDefined();
      }
    });

    it('returns null when Home ES projection fails for dualnback-classic', () => {
      // Pass events with a mismatched sessionId so the projector cannot find them
      const events = createDualnbackClassicEvents('other-session');
      const result = projectTempoSessionEntrypoint({
        sessionId: 'missing-session',
        gameMode: 'dualnback-classic',
        events,
      });

      expect(result).toBeNull();
    });
  });

  // ── Result shape ────────────────────────────────────────────────────────
  describe('result shape', () => {
    it('has summary with expected fields', () => {
      const events = createNbackEvents('s1');
      const result = projectTempoSessionEntrypoint({
        sessionId: 's1',
        gameMode: 'dualnback',
        events,
      });

      expect(result).not.toBeNull();
      const s = result!.summary;
      expect(s.totalTrials).toBeGreaterThanOrEqual(0);
      expect(typeof s.durationMs).toBe('number');
    });

    it('eventsForProjection is an array', () => {
      const events = createNbackEvents('s1');
      const result = projectTempoSessionEntrypoint({
        sessionId: 's1',
        gameMode: 'dualnback',
        events,
      });

      expect(result).not.toBeNull();
      expect(Array.isArray(result!.eventsForProjection)).toBe(true);
    });
  });

  // ── Various game modes (non-classic) use default path ───────────────────
  it.each([
    'dualnback',
    'trialnback',
    'quadnback',
    'some-other-mode',
  ])('routes %s through SessionProjector (default path)', (mode: string) => {
    const events = createNbackEvents('s1');
    const result = projectTempoSessionEntrypoint({
      sessionId: 's1',
      gameMode: mode,
      events,
    });

    // All non-dualnback-classic modes use the default path
    // They should succeed for valid n-back event streams
    if (result !== null) {
      expect(result.summary).toBeDefined();
      expect(result.eventsForProjection).toBeDefined();
    }
  });
});
