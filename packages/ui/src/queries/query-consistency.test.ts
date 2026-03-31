import { describe, expect, test } from 'bun:test';
import {
  parseConsecutiveStrikesFromJourneyContext,
  parseHistoryModalityStats,
  rowToHistoryItem,
  rowToHistoryItemLite,
  type SessionSummaryListRowDb,
  type SessionSummaryRowDb,
} from './history-row-model';
import { effectiveUserIdsWithLocal } from './user-scope';

describe('query consistency', () => {
  test('history detail and list mappings keep core metrics aligned', () => {
    const detailRow: SessionSummaryRowDb = {
      id: 's-1',
      session_id: 's-1',
      user_id: 'user-1',
      session_type: 'tempo',
      created_at: '2026-02-15T12:00:00.000Z',
      n_level: 4,
      duration_ms: 90_000,
      trials_count: 30,
      total_hits: 20,
      total_misses: 6,
      total_fa: 2,
      total_cr: 12,
      global_d_prime: 1.65,
      accuracy: 0.76,
      generator: 'Adaptive',
      game_mode: 'dual-catch',
      passed: 1,
      reason: 'completed',
      journey_stage_id: '3',
      journey_id: 'journey-a',
      by_modality: JSON.stringify({
        audio: {
          hits: 10,
          misses: 2,
          falseAlarms: 1,
          correctRejections: 7,
          avgRT: 420,
          dPrime: 1.4,
        },
      }),
      flow_confidence_score: null,
      flow_directness_ratio: null,
      flow_wrong_slot_dwell_ms: null,
      recall_confidence_score: null,
      recall_fluency_score: null,
      recall_corrections_count: null,
      ups_score: 68,
      ups_accuracy: 74,
      ups_confidence: 62,
      avg_response_time_ms: 420,
      median_response_time_ms: 390,
      response_time_std_dev: 80,
      avg_press_duration_ms: 130,
      press_duration_std_dev: 35,
      responses_during_stimulus: 7,
      responses_after_stimulus: 23,
      focus_lost_count: 0,
      focus_lost_total_ms: 0,
      xp_breakdown: JSON.stringify({ total: 120 }),
      worst_modality_error_rate: 21,
      journey_context: JSON.stringify({ stageId: 3 }),
      input_methods: 'keyboard',
      play_context: 'journey',
    };

    const listRow: SessionSummaryListRowDb = {
      session_id: detailRow.session_id,
      created_at: detailRow.created_at,
      n_level: detailRow.n_level,
      duration_ms: detailRow.duration_ms,
      trials_count: detailRow.trials_count,
      total_hits: detailRow.total_hits,
      total_misses: detailRow.total_misses,
      total_fa: detailRow.total_fa,
      total_cr: detailRow.total_cr,
      global_d_prime: detailRow.global_d_prime,
      accuracy: detailRow.accuracy,
      generator: detailRow.generator,
      game_mode: detailRow.game_mode,
      passed: detailRow.passed,
      reason: detailRow.reason,
      journey_stage_id: detailRow.journey_stage_id,
      journey_id: detailRow.journey_id,
      ups_score: detailRow.ups_score,
      ups_accuracy: detailRow.ups_accuracy,
      ups_confidence: detailRow.ups_confidence,
      avg_response_time_ms: detailRow.avg_response_time_ms,
      median_response_time_ms: detailRow.median_response_time_ms,
      response_time_std_dev: detailRow.response_time_std_dev,
      avg_press_duration_ms: detailRow.avg_press_duration_ms,
      press_duration_std_dev: detailRow.press_duration_std_dev,
      responses_during_stimulus: detailRow.responses_during_stimulus,
      responses_after_stimulus: detailRow.responses_after_stimulus,
      focus_lost_count: detailRow.focus_lost_count,
      focus_lost_total_ms: detailRow.focus_lost_total_ms,
      active_modalities_csv: 'audio,position',
      play_context: detailRow.play_context,
    };

    const detailed = rowToHistoryItem(detailRow);
    const listed = rowToHistoryItemLite(listRow);

    expect(listed.id).toBe(detailed.id);
    expect(listed.nLevel).toBe(detailed.nLevel);
    expect(listed.dPrime).toBe(detailed.dPrime);
    expect(listed.trialsCount).toBe(detailed.trialsCount);
    expect(listed.reason).toBe(detailed.reason);
    expect(listed.playContext).toBe(detailed.playContext);
    expect(listed.upsScore).toBe(detailed.upsScore);
    expect(listed.upsAccuracy).toBe(detailed.upsAccuracy);
    expect(listed.unifiedMetrics.zone).toBe(detailed.unifiedMetrics.zone);
  });

  test('user scope helpers remain deterministic across query modules', () => {
    expect(effectiveUserIdsWithLocal(null)).toEqual(['local']);
    expect(effectiveUserIdsWithLocal('user-1')).toEqual(['user-1', 'local']);
    expect(effectiveUserIdsWithLocal('')).toEqual(['local']);
  });

  test('history mappers stay total for legacy rows', () => {
    const detailRow: SessionSummaryRowDb = {
      id: 'legacy-1',
      session_id: 'legacy-1',
      user_id: 'user-1',
      session_type: 'tempo',
      created_at: 'not-a-date',
      n_level: 2,
      duration_ms: 60_000,
      trials_count: 20,
      total_hits: 10,
      total_misses: 5,
      total_fa: 1,
      total_cr: 4,
      global_d_prime: 0.8,
      accuracy: 0.6,
      generator: 'Adaptive',
      game_mode: 'dual-catch',
      passed: 0,
      reason: 'completed',
      journey_stage_id: '2',
      journey_id: 'journey-a',
      by_modality: '{bad json',
      flow_confidence_score: null,
      flow_directness_ratio: null,
      flow_wrong_slot_dwell_ms: null,
      recall_confidence_score: null,
      recall_fluency_score: null,
      recall_corrections_count: null,
      ups_score: 50,
      ups_accuracy: 60,
      ups_confidence: 40,
      avg_response_time_ms: null,
      median_response_time_ms: null,
      response_time_std_dev: null,
      avg_press_duration_ms: null,
      press_duration_std_dev: null,
      responses_during_stimulus: null,
      responses_after_stimulus: null,
      focus_lost_count: null,
      focus_lost_total_ms: null,
      xp_breakdown: '{bad json',
      worst_modality_error_rate: null,
      journey_context: '{bad json',
      input_methods: null,
      play_context: null,
    };

    const listRow: SessionSummaryListRowDb = {
      session_id: detailRow.session_id,
      created_at: detailRow.created_at,
      n_level: detailRow.n_level,
      duration_ms: detailRow.duration_ms,
      trials_count: detailRow.trials_count,
      total_hits: detailRow.total_hits,
      total_misses: detailRow.total_misses,
      total_fa: detailRow.total_fa,
      total_cr: detailRow.total_cr,
      global_d_prime: detailRow.global_d_prime,
      accuracy: detailRow.accuracy,
      generator: detailRow.generator,
      game_mode: detailRow.game_mode,
      passed: detailRow.passed,
      reason: detailRow.reason,
      journey_stage_id: detailRow.journey_stage_id,
      journey_id: detailRow.journey_id,
      ups_score: detailRow.ups_score,
      ups_accuracy: detailRow.ups_accuracy,
      ups_confidence: detailRow.ups_confidence,
      avg_response_time_ms: detailRow.avg_response_time_ms,
      median_response_time_ms: detailRow.median_response_time_ms,
      response_time_std_dev: detailRow.response_time_std_dev,
      avg_press_duration_ms: detailRow.avg_press_duration_ms,
      press_duration_std_dev: detailRow.press_duration_std_dev,
      responses_during_stimulus: detailRow.responses_during_stimulus,
      responses_after_stimulus: detailRow.responses_after_stimulus,
      focus_lost_count: detailRow.focus_lost_count,
      focus_lost_total_ms: detailRow.focus_lost_total_ms,
      active_modalities_csv: null,
      by_modality: detailRow.by_modality,
      play_context: null,
    };

    const detailed = rowToHistoryItem(detailRow);
    const listed = rowToHistoryItemLite(listRow);

    expect(Number.isFinite(detailed.createdAt.getTime())).toBe(true);
    expect(Number.isFinite(listed.createdAt.getTime())).toBe(true);
    expect(detailed.playContext).toBe('journey');
    expect(listed.playContext).toBe('journey');
  });

  test('history parsing helpers degrade malformed JSON consistently', () => {
    expect(parseHistoryModalityStats('{bad json')).toEqual({});
    expect(
      parseHistoryModalityStats(
        JSON.stringify({
          audio: { hits: '4', misses: 1, falseAlarms: 0, correctRejections: 3, dPrime: '1.2' },
        }),
      ),
    ).toEqual({
      audio: {
        hits: 4,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 3,
        avgRT: 0,
        dPrime: 1.2,
      },
    });

    expect(parseConsecutiveStrikesFromJourneyContext('{bad json', 2)).toBeNull();
    expect(
      parseConsecutiveStrikesFromJourneyContext(JSON.stringify({ consecutiveStrikes: 2.9 }), 2),
    ).toBe(2);
  });
});
