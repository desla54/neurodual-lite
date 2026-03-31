import type { PersistencePort } from '@neurodual/logic';

export async function cleanupAbandonedSession(
  persistence: PersistencePort | null,
  sessionId: string,
): Promise<void> {
  if (!persistence) return;
  await persistence.deleteSession(sessionId);
}
