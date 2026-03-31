/** STUB: dual-track mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

export const DualTrackSpec = {
  metadata: { id: 'dual-track' },
  scoring: { passThreshold: 0.7, strategy: 'accuracy' },
} as unknown as ModeSpec;
