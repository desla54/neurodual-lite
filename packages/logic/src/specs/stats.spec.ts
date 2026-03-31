/**
 * Stats Specifications for Non-Mode Views
 *
 * Defines section configurations for aggregate views that don't
 * correspond to a specific game mode (e.g., "all modes" view).
 *
 * For mode-specific stats, see the `stats` field in each mode's spec.
 */

import type { ModeStatsSpec } from './types';

// =============================================================================
// Global Stats View (mode='all')
// =============================================================================

/**
 * Stats spec for the global view (all modes combined).
 * Shows cross-mode aggregate metrics.
 *
 * Differences from mode-specific specs:
 * - No MODE_SCORE (cross-mode score doesn't make sense)
 * - No ERROR_PROFILE (error types vary by mode)
 * - Shows MODE_BREAKDOWN for per-mode comparison
 * - Shows EVOLUTION_UPS instead of accuracy/N-level trends
 */
export const GlobalStatsSpec: ModeStatsSpec = {
  simple: {
    sections: [
      'ACTIVITY_KPIS',
      'SESSIONS_PER_DAY',
      'PERFORMANCE_KPIS', // UPS only, N-Level/Accuracy hidden by component
      'EVOLUTION_UPS', // UPS trend instead of accuracy/N-level
      'MODE_BREAKDOWN', // Visual bar breakdown by mode
      'MODALITY_TABLE',
    ],
  },
  advanced: {
    sections: [
      'UPS_SUMMARY',
      'DISTRIBUTION',
      'MODE_BREAKDOWN_TABLE', // Full table with all stats per mode
    ],
  },
};

// =============================================================================
// Journey Stats View
// =============================================================================

/**
 * Stats spec for the Journey view.
 * Uses the same configuration as global view since Journey
 * aggregates multiple modes into a training path.
 */
export const JourneyStatsSpec: ModeStatsSpec = GlobalStatsSpec;

// =============================================================================
// Default Stats Spec (Fallback)
// =============================================================================

/**
 * Default stats spec for modes without explicit configuration.
 * Matches the behavior of tempo-like modes (DualTempo, Jaeggi, etc.).
 *
 * Used as fallback when `ModeSpec.stats` is undefined.
 */
export const DefaultStatsSpec: ModeStatsSpec = {
  simple: {
    sections: [
      'ACTIVITY_KPIS',
      'SESSIONS_PER_DAY',
      'PERFORMANCE_KPIS',
      'MODE_SCORE',
      'EVOLUTION_ACCURACY',
      'EVOLUTION_N_LEVEL',
      'MODALITY_TABLE',
      'ERROR_PROFILE',
    ],
  },
  advanced: {
    sections: [
      'UPS_SUMMARY',
      'MODE_SCORE',
      'DISTRIBUTION',
      'TIMING_STATS',
      'TIMING_BY_MODALITY',
      'TIMING_VARIABILITY',
      'ERROR_AWARENESS',
      'SDT_MODALITY_TABLE',
    ],
  },
};
