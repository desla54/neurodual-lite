/**
 * Custom Mode Specification
 */
import type { ModeSpec } from './types';
import type { TempoUiExtensions } from './tempo-shared';
import {
  SDT_DPRIME_PASS, SDT_DPRIME_DOWN, FLOW_CONFIDENCE_THRESHOLD,
  TIMING_STIMULUS_TEMPO_MS, TIMING_INTERVAL_DEFAULT_MS, TIMING_SESSION_PREP_MS,
  TIMING_MIN_VALID_RT_MS, TIMING_VISUAL_OFFSET_DEFAULT_MS,
  GEN_TARGET_PROBABILITY_LOW, GEN_LURE_PROBABILITY_DEFAULT,
  DEFAULT_N_LEVEL, DEFAULT_TRIALS_COUNT_TEMPO, MODE_COLOR_CUSTOM,
} from './thresholds';

export const CustomModeSpec: ModeSpec & { extensions: TempoUiExtensions } = {
  metadata: { id: 'custom', displayName: 'Personnalise', description: 'Controle total.', tags: ['training', 'manual', 'custom'], difficultyLevel: 3, version: '1.0.0' },
  sessionType: 'GameSession',
  scoring: { strategy: 'sdt', passThreshold: SDT_DPRIME_PASS, downThreshold: SDT_DPRIME_DOWN, flowThreshold: FLOW_CONFIDENCE_THRESHOLD },
  timing: { stimulusDurationMs: TIMING_STIMULUS_TEMPO_MS, intervalMs: TIMING_INTERVAL_DEFAULT_MS, prepDelayMs: TIMING_SESSION_PREP_MS, minValidRtMs: TIMING_MIN_VALID_RT_MS, visualOffsetMs: TIMING_VISUAL_OFFSET_DEFAULT_MS },
  generation: { generator: 'BrainWorkshop', targetProbability: GEN_TARGET_PROBABILITY_LOW, lureProbability: GEN_LURE_PROBABILITY_DEFAULT },
  defaults: { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO, activeModalities: ['position', 'audio'] },
  adaptivity: { algorithm: 'none', nLevelSource: 'user', configurableSettings: ['nLevel', 'trialsCount', 'intervalSeconds', 'stimulusDurationSeconds', 'generator', 'targetProbability', 'lureProbability', 'activeModalities'] },
  report: { sections: ['HERO', 'RECENT_TREND', 'PERFORMANCE', 'CONFIDENCE_BREAKDOWN', 'ERROR_PROFILE', 'SPEED', 'NEXT_STEP', 'REWARD_INDICATOR', 'DETAILS'], display: { modeScoreKey: 'report.modeScore.dprime', modeScoreTooltipKey: 'report.modeScore.dprimeTooltip', speedStatKey: 'report.speed.reactionTime', colors: MODE_COLOR_CUSTOM } },
  stats: { simple: { sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS', 'MODE_SCORE', 'EVOLUTION_ACCURACY', 'EVOLUTION_N_LEVEL', 'MODALITY_TABLE', 'ERROR_PROFILE'] }, advanced: { sections: ['UPS_SUMMARY', 'MODE_SCORE', 'DISTRIBUTION', 'TIMING_STATS', 'TIMING_BY_MODALITY', 'TIMING_VARIABILITY', 'ERROR_AWARENESS', 'SDT_MODALITY_TABLE'] } },
  extensions: { guidedMode: false, mirrorMode: false, gameCountdownMode: false, gameShowProgressBar: true, gameShowNLevel: true },
};
