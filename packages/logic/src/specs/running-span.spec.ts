/** STUB: running-span mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

export const RunningSpanSpec = {
  metadata: { id: 'running-span' },
  scoring: { passThreshold: 0.8, strategy: 'accuracy' },
} as unknown as ModeSpec;
