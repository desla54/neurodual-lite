import { describe, expect, it } from 'bun:test';
import { sessionSummaryRowToHistoryItem } from './history-port';
import type { SessionSummaryRow } from './persistence-port';

describe('sessionSummaryRowToHistoryItem', () => {
  it('keeps legacy rows readable when play_context is missing', () => {
    const row: SessionSummaryRow = {
      session_id: 'legacy-session',
      user_id: 'user-1',
      session_type: 'tempo',
      created_at: 'not-a-date',
      n_level: 3,
      duration_ms: 90_000,
      trials_count: 30,
      total_hits: 10,
      total_misses: 5,
      total_fa: 2,
      total_cr: 13,
      global_d_prime: 1.1,
      accuracy: 0.7,
      generator: 'Adaptive',
      game_mode: 'dual-catch',
      passed: true,
      reason: 'completed',
      journey_stage_id: '4',
      journey_id: 'journey-a',
      play_context: null,
      by_modality: {},
      adaptive_path_progress_pct: null,
      flow_confidence_score: null,
      flow_directness_ratio: null,
      flow_wrong_slot_dwell_ms: null,
      recall_confidence_score: null,
      recall_fluency_score: null,
      recall_corrections_count: null,
      ups_score: 70,
      ups_accuracy: 75,
      ups_confidence: 60,
      avg_response_time_ms: null,
      median_response_time_ms: null,
      response_time_std_dev: null,
      avg_press_duration_ms: null,
      press_duration_std_dev: null,
      responses_during_stimulus: null,
      responses_after_stimulus: null,
      focus_lost_count: null,
      focus_lost_total_ms: null,
      xp_breakdown: null,
      worst_modality_error_rate: null,
      journey_context: null,
      input_methods: null,
    };

    const item = sessionSummaryRowToHistoryItem(row);
    expect(item.playContext).toBe('journey');
    expect(Number.isFinite(item.createdAt.getTime())).toBe(true);
  });
});
