/**
 * Stub — Checkpointer (no longer needed).
 */

export interface Checkpointer {
  read(id: string): Promise<{ version: number; last_processed_position: string } | null>;
  readMany(ids: readonly string[]): Promise<Map<string, { version: number; last_processed_position: string }>>;
  write(id: string, version: number, position: bigint): Promise<void>;
}

export function createCheckpointer(): Checkpointer {
  return {
    async read() { return null; },
    async readMany() { return new Map(); },
    async write() {},
  };
}
