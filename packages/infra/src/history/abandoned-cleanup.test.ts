import { describe, expect, it, mock } from 'bun:test';

import { cleanupAbandonedSessionById, cleanupLegacyAbandonedSummaries } from './abandoned-cleanup';

describe('abandoned-cleanup', () => {
  it('deletes abandoned sessions by id', async () => {
    const persistence = {
      deleteSession: mock(async () => 1),
      queueDeletion: mock(async () => {}),
    } as any;

    await cleanupAbandonedSessionById(persistence, 'session-1');

    expect(persistence.deleteSession).toHaveBeenCalledWith('session-1');
    expect(persistence.queueDeletion).not.toHaveBeenCalled();
  });

  it('cleans legacy abandoned summaries and skips empty ids', async () => {
    const persistence = {
      getDrizzleDb: () => ({
        all: async () => [
          { session_id: 'session-1' },
          { session_id: '' },
          { session_id: 'session-2' },
        ],
      }),
      deleteSession: mock(async () => 1),
      queueDeletion: mock(async () => {}),
    } as any;

    const result = await cleanupLegacyAbandonedSummaries(persistence);

    expect(result.cleaned).toBe(2);
    expect(persistence.deleteSession).toHaveBeenCalledTimes(2);
    expect(persistence.queueDeletion).not.toHaveBeenCalled();
  });
});
