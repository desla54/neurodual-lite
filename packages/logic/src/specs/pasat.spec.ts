/** STUB: pasat mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

export const PasatSpec = {
  metadata: { id: 'pasat' },
  scoring: { passThreshold: 0.7, strategy: 'accuracy' },
} as unknown as ModeSpec;
