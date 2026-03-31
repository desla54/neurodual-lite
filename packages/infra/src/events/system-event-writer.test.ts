import { describe, expect, it } from 'bun:test';

import {
  appendSystemEvents,
  setSystemEventWriterCommandBus,
  setSystemEventWriterPersistence,
} from './system-event-writer';

describe('system-event-writer', () => {
  it('rejects JOURNEY_TRANSITION_DECIDED (no longer a system event)', async () => {
    setSystemEventWriterPersistence({} as never);
    setSystemEventWriterCommandBus({
      handle: async () => ({ events: [], fromCache: false }),
    } as never);

    await expect(
      appendSystemEvents([
        {
          id: 'journey-transition:test',
          type: 'JOURNEY_TRANSITION_DECIDED',
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
          journeyId: 'journey-1',
          journeyStartLevel: 2,
          journeyTargetLevel: 5,
          stageId: 1,
          stageMode: 'simulator',
          nLevel: 2,
          journeyName: 'Hybrid',
          upsThreshold: 50,
          isValidating: false,
          validatingSessions: 0,
          sessionsRequired: 1,
          stageCompleted: false,
          nextStageUnlocked: null,
        } as never,
      ]),
    ).rejects.toThrow('No command mapping');
  });

  it('throws on unsupported system event types', async () => {
    setSystemEventWriterPersistence({} as never);
    setSystemEventWriterCommandBus({
      handle: async () => ({ events: [], fromCache: false }),
    } as never);

    await expect(
      appendSystemEvents([
        {
          id: 'unsupported:test',
          type: 'SESSION_STARTED',
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
        } as never,
      ]),
    ).rejects.toThrow('No command mapping');
  });

  it('fails fast when persistence or command bus is not injected', async () => {
    setSystemEventWriterPersistence(null);
    setSystemEventWriterCommandBus(null);

    await expect(
      appendSystemEvents([
        {
          id: 'badge:test',
          type: 'BADGE_UNLOCKED',
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
        } as never,
      ]),
    ).rejects.toThrow();
  });
});
