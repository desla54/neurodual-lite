export interface FreezeEvent {
  timestamp: number;
  durationMs: number;
  lastContext: string | null;
  contextSource?: 'active' | 'recent' | 'unknown';
  pendingStepContext?: string | null;
  pendingStepAgeMs?: number;
  pendingStepStack?: string | null;
  stack: string | null;
}

export interface LongTaskEvent {
  timestamp: number;
  durationMs: number;
  context: string | null;
  name: string;
}

export interface DiagnosticsPort {
  startFreezeWatchdog(): void;
  stopFreezeWatchdog(): void;
  enableLongTaskObserver(): void;
  disableLongTaskObserver(): void;
  installEventStoreFlushOnPageHide(flushTimeoutMs: number): () => void;

  setWatchdogContext(context: string): void;
  clearWatchdogContext(): void;
  onFreeze(listener: (event: FreezeEvent) => void): () => void;
  onLongTask(listener: (event: LongTaskEvent) => void): () => void;
}
