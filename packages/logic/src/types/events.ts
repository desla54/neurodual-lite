/**
 * Event Projection Types (structures de données, pas de logique)
 *
 * Note: Les types des *events* eux-mêmes sont désormais dérivés des schemas Zod
 * dans `packages/logic/src/engine/events.ts` (Phase 1: Zod SSOT).
 */

import type { ModalityId, TrialResult } from './core';
import type { JaeggiConfidenceResult, TempoConfidenceResult } from './ups';

export interface ModalityTrialOutcome {
  readonly result: TrialResult;
  readonly reactionTime: number | null;
  readonly wasLure: boolean;
}

export interface TrialOutcome {
  readonly trialIndex: number;
  readonly byModality: Record<ModalityId, ModalityTrialOutcome>;
}

export interface ModalityRunningStats {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly avgRT: number | null;
  readonly dPrime: number;
}

export interface RunningStats {
  readonly trialsCompleted: number;
  readonly globalDPrime: number;
  readonly byModality: Record<ModalityId, ModalityRunningStats>;
}

export interface TimingStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly values: readonly number[];
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly outcomes: readonly TrialOutcome[];
  readonly finalStats: RunningStats;
  readonly durationMs: number;
  readonly focusLostCount: number;
  readonly totalFocusLostMs: number;
  readonly isiStats: TimingStats;
  readonly stimulusDurationStats: TimingStats;
  readonly luresCount: Record<ModalityId, number>;
  readonly tempoConfidence: TempoConfidenceResult | JaeggiConfidenceResult | null;
  readonly passed: boolean;
  readonly generator?: string;
  readonly gameMode?: string;
}
