/**
 * Tests for session-health.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  computeSessionHealthMetrics,
  deriveQualityFlag,
  createEmptyHealthMetrics,
  type SessionHealthInput,
  // @ts-expect-error test override
  type GameEvent,
} from './session-health';

const createTrialCompleteEvent = (
  processingLagMs: number,
  timestampMs = Date.now(),
): GameEvent => ({
  type: 'TRIAL_COMPLETE',
  timestampMs,
  processingLagMs,
});

const createUserResponseEvent = (reactionTimeMs: number, timestampMs = Date.now()): GameEvent => ({
  type: 'USER_RESPONDED',
  timestampMs,
  reactionTimeMs,
});

const createFocusEvents = (): GameEvent[] => [
  { type: 'FOCUS_LOST', timestampMs: 1000 },
  { type: 'FOCUS_REGAINED', timestampMs: 2000, lostDurationMs: 1000 },
];

describe('deriveQualityFlag', () => {
  it('returns high for score >= 80', () => {
    expect(deriveQualityFlag(80)).toBe('high');
    expect(deriveQualityFlag(100)).toBe('high');
    expect(deriveQualityFlag(95)).toBe('high');
  });

  it('returns medium for score >= 50 and < 80', () => {
    expect(deriveQualityFlag(50)).toBe('medium');
    expect(deriveQualityFlag(79)).toBe('medium');
    expect(deriveQualityFlag(65)).toBe('medium');
  });

  it('returns degraded for score < 50', () => {
    expect(deriveQualityFlag(49)).toBe('degraded');
    expect(deriveQualityFlag(0)).toBe('degraded');
    expect(deriveQualityFlag(25)).toBe('degraded');
  });
});

describe('createEmptyHealthMetrics', () => {
  it('returns default healthy metrics', () => {
    const metrics = createEmptyHealthMetrics();

    expect(metrics.reliabilityScore).toBe(100);
    expect(metrics.quality).toBe('high');
    expect(metrics.processingLag).toEqual({ min: 0, max: 0, avg: 0, p95: 0 });
    expect(metrics.freezeCount).toBe(0);
    expect(metrics.longTaskCount).toBe(0);
  });
});

describe('computeSessionHealthMetrics', () => {
  it('computes metrics for healthy session', () => {
    const input: SessionHealthInput = {
      sessionEvents: [
        createTrialCompleteEvent(5),
        createTrialCompleteEvent(8),
        createTrialCompleteEvent(6),
        createUserResponseEvent(450),
        createUserResponseEvent(480),
        createUserResponseEvent(460),
      ],
      eventLoopLagAtStart: 10,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const metrics = computeSessionHealthMetrics(input);

    expect(metrics.quality).toBe('high');
    expect(metrics.reliabilityScore).toBeGreaterThanOrEqual(80);
    expect(metrics.processingLag.avg).toBeLessThan(10);
  });

  it('computes metrics for degraded session', () => {
    const input: SessionHealthInput = {
      sessionEvents: [
        createTrialCompleteEvent(100),
        createTrialCompleteEvent(150),
        createTrialCompleteEvent(200),
      ],
      eventLoopLagAtStart: 150,
      freezeCount: 3,
      longTaskCount: 10,
    };

    const metrics = computeSessionHealthMetrics(input);

    expect(['degraded', 'medium']).toContain(metrics.quality);
    expect(metrics.reliabilityScore).toBeLessThan(100);
  });

  it('handles empty events', () => {
    const input: SessionHealthInput = {
      sessionEvents: [],
      eventLoopLagAtStart: 0,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const metrics = computeSessionHealthMetrics(input);

    expect(metrics.processingLag).toEqual({ min: 0, max: 0, avg: 0, p95: 0 });
    expect(metrics.rtStabilityCV).toBe(0);
  });

  it('tracks focus loss events', () => {
    const input: SessionHealthInput = {
      sessionEvents: createFocusEvents(),
      eventLoopLagAtStart: 5,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const metrics = computeSessionHealthMetrics(input);

    expect(metrics.focusLossCount).toBe(1);
    expect(metrics.totalFocusLostMs).toBe(1000);
  });

  it('calculates processing lag stats', () => {
    const input: SessionHealthInput = {
      sessionEvents: [
        createTrialCompleteEvent(10),
        createTrialCompleteEvent(20),
        createTrialCompleteEvent(30),
        createTrialCompleteEvent(40),
        createTrialCompleteEvent(100), // outlier for p95
      ],
      eventLoopLagAtStart: 5,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const metrics = computeSessionHealthMetrics(input);

    expect(metrics.processingLag.min).toBeGreaterThanOrEqual(0);
    expect(metrics.processingLag.max).toBeGreaterThanOrEqual(0);
    expect(metrics.processingLag.avg).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.processingLag.p95).toBe('number');
  });

  it('calculates RT stability (CV)', () => {
    const input: SessionHealthInput = {
      sessionEvents: [
        createUserResponseEvent(500),
        createUserResponseEvent(500),
        createUserResponseEvent(500),
        createUserResponseEvent(500),
      ],
      eventLoopLagAtStart: 0,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const metrics = computeSessionHealthMetrics(input);

    // Perfectly consistent RTs → CV should be 0
    expect(metrics.rtStabilityCV).toBe(0);
  });

  it('penalizes freezes and long tasks', () => {
    const baseInput: SessionHealthInput = {
      sessionEvents: [],
      eventLoopLagAtStart: 0,
      freezeCount: 0,
      longTaskCount: 0,
    };

    const withFreezes: SessionHealthInput = {
      ...baseInput,
      freezeCount: 5,
      longTaskCount: 10,
    };

    const baseMetrics = computeSessionHealthMetrics(baseInput);
    const freezeMetrics = computeSessionHealthMetrics(withFreezes);

    expect(freezeMetrics.reliabilityScore).toBeLessThan(baseMetrics.reliabilityScore);
  });
});
