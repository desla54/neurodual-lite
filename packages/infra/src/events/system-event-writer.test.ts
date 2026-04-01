import { describe, expect, it } from 'bun:test';

import {
  appendSystemEvents,
  setSystemEventWriterCommandBus,
  setSystemEventWriterPersistence,
} from './system-event-writer';

describe('system-event-writer', () => {
  it('is a no-op and resolves without error', async () => {
    await expect(
      appendSystemEvents([
        {
          id: 'journey-transition:test',
          type: 'JOURNEY_TRANSITION_DECIDED',
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
        } as never,
      ]),
    ).resolves.toBeUndefined();
  });

  it('resolves for any event type (no-op)', async () => {
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
    ).resolves.toBeUndefined();
  });

  it('resolves even when persistence and command bus are null', async () => {
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
    ).resolves.toBeUndefined();
  });
});
