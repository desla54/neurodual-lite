/** STUB: corsi-block mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

export const CorsiBlockSpec = {
  metadata: { id: 'corsi-block' },
  scoring: { passThreshold: 0.7, strategy: 'accuracy' },
} as unknown as ModeSpec;
