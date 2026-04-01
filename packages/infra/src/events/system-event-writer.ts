import type { GameEvent, PersistencePort, CommandBusPort } from '@neurodual/logic';

// Keep setters for backward compatibility (called by setup-persistence and system-provider).
// The injected values are no longer used — DirectCommandBus handles persistence inline.
export function setSystemEventWriterPersistence(_persistence: PersistencePort | null): void {
  void _persistence;
}

export function setSystemEventWriterCommandBus(_commandBus: CommandBusPort | null): void {
  void _commandBus;
}

/**
 * Single entry point for pipeline/system events persistence.
 *
 * With DirectCommandBus, badges and XP are computed inline during
 * session finalization. This function is now a no-op.
 */
export async function appendSystemEvents(_events: readonly GameEvent[]): Promise<void> {
  // No-op: DirectCommandBus handles badges/XP inline during finalizeSession.
}
