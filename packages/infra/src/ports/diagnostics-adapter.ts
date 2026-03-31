import type { DiagnosticsPort, FreezeEvent, LongTaskEvent } from '@neurodual/logic';
import {
  clearWatchdogContext,
  disableLongTaskObserver,
  enableLongTaskObserver,
  installEventStoreFlushOnPageHide,
  onFreeze,
  onLongTask,
  setWatchdogContext,
  startFreezeWatchdog,
  stopFreezeWatchdog,
} from '../diagnostics';

export const diagnosticsAdapter: DiagnosticsPort = {
  startFreezeWatchdog: () => startFreezeWatchdog(),
  stopFreezeWatchdog: () => stopFreezeWatchdog(),
  enableLongTaskObserver: () => enableLongTaskObserver(),
  disableLongTaskObserver: () => disableLongTaskObserver(),
  installEventStoreFlushOnPageHide: (flushTimeoutMs: number) =>
    installEventStoreFlushOnPageHide(flushTimeoutMs),
  setWatchdogContext: (context: string) => setWatchdogContext(context),
  clearWatchdogContext: () => clearWatchdogContext(),
  onFreeze: (listener: (event: FreezeEvent) => void) => onFreeze(listener),
  onLongTask: (listener: (event: LongTaskEvent) => void) => onLongTask(listener),
};
