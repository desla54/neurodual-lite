/**
 * Training Types
 *
 * Types pour le système d'entraînement adaptatif.
 * RÈGLE: Zéro import interne sauf depuis types/
 */

import type { ModalityId, ResponseRecord, SDTCounts } from './core';

// =============================================================================
// Training Running Stats
// =============================================================================

export interface TrainingRunningStats {
  readonly trialsCompleted: number;
  readonly trialsTotal: number;
  readonly byModality: Map<ModalityId, TrainingModalityStats>;
  readonly currentDPrime: number;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly estimatedFinalDPrime: number;
}

export interface TrainingModalityStats extends SDTCounts {
  readonly currentDPrime: number;
  readonly reactionTimes: number[];
  readonly avgRT: number | null;
  readonly rtTrend: 'faster' | 'stable' | 'slower';
}

// =============================================================================
// Trial Response
// =============================================================================

export interface TrialResponse {
  readonly trialIndex: number;
  readonly responses: Map<ModalityId, ResponseRecord>;
  readonly timestamp: Date;
}
