/**
 * Signal Detection Theory (SDT) Scoring Utilities
 *
 * Progression helper for SDT-based scoring.
 * The actual scoring is done by session-passed.ts (pure functions).
 */

import { SDT_DPRIME_PASS, SDT_DPRIME_DOWN } from '../../specs/thresholds';

// =============================================================================
// Progression Helper
// =============================================================================

export function evaluateProgression(recentDPrimes: number[]): 'UP' | 'DOWN' | 'STAY' {
  if (recentDPrimes.length < 3) {
    return 'STAY';
  }

  const recent = recentDPrimes.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (avg >= SDT_DPRIME_PASS) {
    return 'UP';
  }
  if (avg < SDT_DPRIME_DOWN) {
    return 'DOWN';
  }
  return 'STAY';
}
