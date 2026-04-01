/**
 * Journey Scoring - Stub for backward compatibility
 */
import { JAEGGI_POINTS_PER_ERROR, SCORE_MAX, SCORE_MIN } from '../../specs/thresholds';
import {
  calculateTempoSessionPassed as calculateTempoPassedFromCentralized,
  type ModalitySDTCounts,
} from '../scoring/session-passed';

export type JourneyScoringStrategy =
  | 'brainworkshop'
  | 'dualnback-classic'
  | 'jaeggi'
  | 'balanced'
  | 'dprime';

export interface JourneyScoreResult {
  readonly score: number;
  readonly passed: boolean;
  readonly strategy: JourneyScoringStrategy;
  readonly details?: JourneyScoreDetails;
}

export interface JourneyScoreDetails {
  readonly rawScore?: number;
  readonly normalizedScore?: number;
  readonly totalErrors?: number;
  readonly maxErrors?: number;
  readonly sensitivity?: number;
  readonly specificity?: number;
}

export interface PrecomputedScoreSession {
  readonly sessionId: string;
  readonly score: number;
  readonly passed: boolean;
}

export interface RawSDTStats {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
}

export function isSessionPassing(
  byModality: Record<string, RawSDTStats>,
  gameMode: string | undefined,
  globalDPrime: number,
): boolean {
  const modalityCounts: Record<string, ModalitySDTCounts> = {};
  for (const [key, stats] of Object.entries(byModality)) {
    modalityCounts[key] = {
      hits: stats.hits,
      misses: stats.misses,
      falseAlarms: stats.falseAlarms,
      correctRejections: stats.correctRejections,
    };
  }
  return calculateTempoPassedFromCentralized({
    generator: undefined,
    gameMode,
    byModality: modalityCounts,
    globalDPrime,
  });
}

export function computeBrainWorkshopScoreFromRaw(
  hits: number,
  correctRejections: number,
  falseAlarms: number,
  misses: number,
): number {
  const total = hits + correctRejections + falseAlarms + misses;
  if (total === 0) return 0;
  return Math.max(
    SCORE_MIN,
    Math.min(
      SCORE_MAX,
      (((hits + correctRejections - falseAlarms - misses) / total + 1) / 2) * SCORE_MAX,
    ),
  );
}

export function computeDualnbackClassicScoreFromRaw(
  byModality: Record<string, RawSDTStats>,
): number {
  let totalErrors = 0;
  for (const stats of Object.values(byModality)) {
    totalErrors += stats.falseAlarms + stats.misses;
  }
  return Math.max(
    SCORE_MIN,
    Math.min(SCORE_MAX, SCORE_MAX - totalErrors * JAEGGI_POINTS_PER_ERROR),
  );
}

export function aggregateRawStats(byModality: Record<string, RawSDTStats>): RawSDTStats {
  const result: RawSDTStats = { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 };
  for (const stats of Object.values(byModality)) {
    result.hits += stats.hits;
    result.misses += stats.misses;
    result.falseAlarms += stats.falseAlarms;
    result.correctRejections += stats.correctRejections;
  }
  return result;
}
