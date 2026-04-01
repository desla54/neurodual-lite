/**
 * Stub — ProcessorEngine (no longer needed).
 */

export interface ProcessorEngine {
  register(definition: unknown): void;
  ensureUpToDate(): Promise<{ replayed: string[]; caughtUp: string[]; totalEventsProcessed: number }>;
  invalidateCache(): void;
  rebuild(processorId: string): Promise<number>;
  rebuildAll(): Promise<number>;
  onDegradedProcessors(callback: (ids: readonly string[]) => void): () => void;
  getDegradedProcessors(): readonly string[];
}

export function getProcessorEngine(..._args: unknown[]): ProcessorEngine {
  return {
    register() {},
    async ensureUpToDate() { return { replayed: [], caughtUp: [], totalEventsProcessed: 0 }; },
    invalidateCache() {},
    async rebuild() { return 0; },
    async rebuildAll() { return 0; },
    onDegradedProcessors() { return () => {}; },
    getDegradedProcessors() { return []; },
  };
}

export function resetProcessorEngine(): void {}
export function invalidateProcessorEngineCache(): void {}
export function createProcessorEngine(): ProcessorEngine {
  return getProcessorEngine();
}
