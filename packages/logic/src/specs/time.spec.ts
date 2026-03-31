/** STUB: dual-time mode removed in NeuroDual Lite */
import type { ModeSpec } from './types';

// Minimal stub with enough structure to avoid crashes in code that imports this
// at module-load time (e.g., time-session-projection.ts accesses scoring.passThreshold)
export const DualTimeSpec = {
  metadata: { id: 'dual-time' },
  scoring: { passThreshold: 0.7, strategy: 'accuracy' },
} as unknown as ModeSpec;
