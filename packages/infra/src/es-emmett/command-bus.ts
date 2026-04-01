/**
 * Stub — createCommandBus for backward compatibility.
 * Delegates to DirectCommandBus.
 */

import type { CommandBusPort } from '@neurodual/logic';

export function createCommandBus(
  _dbOrPort: unknown,
): CommandBusPort {
  // Return a minimal stub that warns if used.
  // The real implementation is DirectCommandBus.
  return {
    async handle(command) {
      console.warn(`[CommandBus stub] handle(${command.type}) — should use DirectCommandBus`);
      return { events: [], fromCache: false };
    },
  };
}

export type { CommandBusPort };
