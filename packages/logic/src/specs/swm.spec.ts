/** STUB: swm mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

export const SwmSpec = {
  metadata: { id: 'swm' },
  scoring: { passThreshold: 0.8, strategy: 'accuracy' },
  extensions: {},
} as unknown as ModeSpec;
