/**
 * Tests for calculateBrainWorkshopStrikes
 *
 * Covers:
 * - Empty sessions
 * - Strike accumulation from failed sessions (< 50%)
 * - Score >= 50% does NOT reset strikes (BW original behavior)
 * - Strike reset on level change
 * - Maximum 2 strikes carried (3 would have triggered level down)
 * - Timestamp sorting (most recent first)
 */

import { describe, it, expect } from 'bun:test';
import { calculateBrainWorkshopStrikes, type BrainWorkshopSessionData } from './bw-strikes';

// =============================================================================
// Helpers
// =============================================================================

function session(score: number, nLevel: number, timestamp: number): BrainWorkshopSessionData {
  return { score, nLevel, timestamp };
}

// =============================================================================
// Tests
// =============================================================================

describe('calculateBrainWorkshopStrikes', () => {
  it('returns 0 for empty sessions', () => {
    expect(calculateBrainWorkshopStrikes([])).toBe(0);
  });

  it('returns 0 when the only session passed (score >= 50)', () => {
    expect(calculateBrainWorkshopStrikes([session(60, 2, 1)])).toBe(0);
  });

  it('returns 1 for a single failed session (score < 50)', () => {
    expect(calculateBrainWorkshopStrikes([session(40, 2, 1)])).toBe(1);
  });

  it('returns 0 for a session with exactly 50% score', () => {
    expect(calculateBrainWorkshopStrikes([session(50, 2, 1)])).toBe(0);
  });

  it('accumulates strikes from consecutive failures', () => {
    const sessions = [
      session(30, 2, 3), // most recent
      session(40, 2, 2),
      session(20, 2, 1),
    ];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(2);
  });

  it('does NOT reset strikes on success (BW original behavior)', () => {
    // Fail -> Success -> Fail = 2 strikes, not 1
    const sessions = [
      session(40, 2, 3), // fail (most recent)
      session(60, 2, 2), // success — does NOT reset
      session(40, 2, 1), // fail
    ];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(2);
  });

  it('caps at 2 strikes (3 would have caused level down)', () => {
    const sessions = [
      session(10, 2, 5),
      session(20, 2, 4),
      session(30, 2, 3),
      session(40, 2, 2),
      session(45, 2, 1),
    ];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(2);
  });

  it('resets strikes when level changes (level up)', () => {
    const sessions = [
      session(40, 3, 3), // fail at level 3 (most recent)
      session(80, 2, 2), // success at level 2 — different level, stops
      session(30, 2, 1), // fail at level 2
    ];
    // Only 1 strike at level 3
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(1);
  });

  it('resets strikes when level changes (level down)', () => {
    const sessions = [
      session(40, 2, 3), // fail at level 2 (most recent)
      session(30, 3, 2), // at level 3 — different, stops
      session(40, 3, 1), // at level 3
    ];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(1);
  });

  it('sorts by timestamp DESC regardless of input order', () => {
    // Input in ascending order, but should be sorted to descending
    const sessions = [
      session(40, 2, 1), // oldest
      session(60, 2, 2), // middle
      session(30, 2, 3), // newest → most recent
    ];
    // Most recent is 30 (fail), then 60 (pass), then 40 (fail) = 2 strikes
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(2);
  });

  it('handles all passing sessions at same level', () => {
    const sessions = [session(80, 2, 3), session(90, 2, 2), session(50, 2, 1)];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(0);
  });

  it('counts only sessions at the most recent level', () => {
    const sessions = [
      session(80, 3, 5), // pass at level 3 (most recent)
      session(40, 3, 4), // fail at level 3
      session(30, 2, 3), // fail at level 2 — different level
      session(20, 2, 2), // fail at level 2
    ];
    // At level 3: pass + fail = 1 strike
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(1);
  });

  it('returns 0 when most recent session passed and all others at different level', () => {
    const sessions = [session(90, 3, 2), session(30, 2, 1)];
    expect(calculateBrainWorkshopStrikes(sessions)).toBe(0);
  });

  it('handles score of exactly 49 as a strike', () => {
    expect(calculateBrainWorkshopStrikes([session(49, 2, 1)])).toBe(1);
  });

  it('handles score of 0 as a strike', () => {
    expect(calculateBrainWorkshopStrikes([session(0, 2, 1)])).toBe(1);
  });

  it('handles score of 100 as not a strike', () => {
    expect(calculateBrainWorkshopStrikes([session(100, 2, 1)])).toBe(0);
  });
});
