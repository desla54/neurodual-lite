// packages/logic/src/types/trajectory.ts
/**
 * Trajectory Types - Session Replay
 *
 * Types and utilities for capturing and replaying user trajectories
 * (cursor/finger movements) during game sessions.
 *
 * Used by:
 * - Dual Flow: drag trajectories during card placement
 * - Dual Memo: cursor movement during recall phase
 */

import {
  TRAJECTORY_SAMPLE_INTERVAL_MS as _TRAJECTORY_SAMPLE_INTERVAL_MS,
  TRAJECTORY_SAMPLE_RATE_HZ,
  TRAJECTORY_MAX_POINTS,
  TRAJECTORY_WARNING_POINTS,
} from '../specs/thresholds';

// =============================================================================
// Core Types
// =============================================================================

/**
 * A single point in a trajectory.
 * Coordinates are normalized (0-1) relative to container.
 */
export interface TrajectoryPoint {
  /** X coordinate normalized 0-1 */
  readonly x: number;
  /** Y coordinate normalized 0-1 */
  readonly y: number;
  /** Timestamp in ms (relative to trajectory start, i.e. first point is t=0) */
  readonly t: number;
}

/**
 * Compact trajectory format for efficient storage.
 * Points are stored as [x, y, t] tuples with normalized coordinates.
 *
 * Storage cost: ~18 bytes per point in JSON (vs ~50 bytes for verbose format)
 * At 20Hz sampling: ~360 bytes/second of movement
 */
export interface CompactTrajectory {
  /** Sampling rate in Hz (fixed at TRAJECTORY_SAMPLE_RATE_HZ for consistency) */
  readonly sampleRate: typeof TRAJECTORY_SAMPLE_RATE_HZ;
  /** Container dimensions at capture time (for denormalization during replay) */
  readonly containerSize: {
    readonly w: number;
    readonly h: number;
  };
  /**
   * Points as [x, y, t] tuples.
   * - x, y: normalized 0-1 (relative to container)
   * - t: milliseconds since trajectory start
   */
  readonly points: ReadonlyArray<readonly [number, number, number]>;
}

// =============================================================================
// Encoding / Decoding
// =============================================================================

/**
 * Raw point captured during user interaction.
 * Uses absolute pixel coordinates before normalization.
 */
export interface RawTrajectoryPoint {
  /** Absolute X in pixels */
  readonly x: number;
  /** Absolute Y in pixels */
  readonly y: number;
  /** Monotonic timestamp (performance.now()) */
  readonly t: number;
}

/**
 * Encode raw trajectory points into compact format.
 *
 * Applies size limits from thresholds.ts:
 * - TRAJECTORY_MAX_POINTS: auto-truncate if exceeded (default 600 = 30s @ 20Hz)
 * - TRAJECTORY_WARNING_POINTS: log warning if exceeded (default 500)
 *
 * @param rawPoints - Array of raw points with absolute coordinates
 * @param containerRect - Container bounding rect for normalization
 * @returns CompactTrajectory ready for storage
 */
export function encodeTrajectory(
  rawPoints: readonly RawTrajectoryPoint[],
  containerRect: { left: number; top: number; width: number; height: number },
): CompactTrajectory {
  if (rawPoints.length === 0) {
    return {
      sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
      containerSize: { w: containerRect.width, h: containerRect.height },
      points: [],
    };
  }

  // Apply size limits
  let pointsToEncode = rawPoints;
  if (rawPoints.length > TRAJECTORY_MAX_POINTS) {
    console.warn(
      `[Trajectory] Truncating trajectory from ${rawPoints.length} to ${TRAJECTORY_MAX_POINTS} points`,
    );
    pointsToEncode = rawPoints.slice(0, TRAJECTORY_MAX_POINTS);
  } else if (rawPoints.length > TRAJECTORY_WARNING_POINTS) {
    console.warn(
      `[Trajectory] Large trajectory: ${rawPoints.length} points (warning at ${TRAJECTORY_WARNING_POINTS})`,
    );
  }

  const firstPoint = pointsToEncode[0];
  if (!firstPoint) {
    return {
      sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
      containerSize: { w: containerRect.width, h: containerRect.height },
      points: [],
    };
  }
  const startTime = firstPoint.t;

  const points = pointsToEncode.map((p): readonly [number, number, number] => {
    // Normalize coordinates to 0-1 range
    const x = Math.max(0, Math.min(1, (p.x - containerRect.left) / containerRect.width));
    const y = Math.max(0, Math.min(1, (p.y - containerRect.top) / containerRect.height));
    // Time relative to start
    const t = Math.round(p.t - startTime);
    // Round to 4 decimal places for storage efficiency
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, t] as const;
  });

  return {
    sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
    containerSize: { w: containerRect.width, h: containerRect.height },
    points,
  };
}

/**
 * Decode compact trajectory into usable points.
 *
 * @param trajectory - Compact trajectory from storage
 * @returns Array of TrajectoryPoint with normalized coordinates
 */
export function decodeTrajectory(trajectory: CompactTrajectory): TrajectoryPoint[] {
  return trajectory.points.map(([x, y, t]) => ({ x, y, t }));
}

/**
 * Interpolate trajectory to get position at any time.
 * Uses linear interpolation between sampled points.
 *
 * @param trajectory - Decoded trajectory points
 * @param timeMs - Time in ms (relative to trajectory start)
 * @returns Interpolated position, or null if time is out of range
 */
export function interpolateTrajectory(
  points: readonly TrajectoryPoint[],
  timeMs: number,
): { x: number; y: number } | null {
  if (points.length === 0) return null;

  const firstPoint = points[0];
  if (!firstPoint) return null;

  if (points.length === 1) return { x: firstPoint.x, y: firstPoint.y };

  // Before first point
  if (timeMs <= firstPoint.t) {
    return { x: firstPoint.x, y: firstPoint.y };
  }

  // After last point
  const lastPoint = points[points.length - 1];
  if (lastPoint && timeMs >= lastPoint.t) {
    return { x: lastPoint.x, y: lastPoint.y };
  }

  // Find surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1 && p2 && timeMs >= p1.t && timeMs <= p2.t) {
      // Linear interpolation
      const ratio = (timeMs - p1.t) / (p2.t - p1.t);
      return {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio,
      };
    }
  }

  return null;
}

/**
 * Get total duration of a trajectory in milliseconds.
 */
export function getTrajectoryDuration(trajectory: CompactTrajectory): number {
  if (trajectory.points.length === 0) return 0;
  const lastPoint = trajectory.points[trajectory.points.length - 1];
  return lastPoint ? lastPoint[2] : 0;
}

// =============================================================================
// Sampling Utilities
// =============================================================================

/** Sample interval in ms for 20Hz @see thresholds.ts (SSOT) */
export const TRAJECTORY_SAMPLE_INTERVAL_MS = _TRAJECTORY_SAMPLE_INTERVAL_MS;

/**
 * Create a trajectory sampler that captures points at 20Hz.
 * Call `sample(x, y)` on each pointer move, it will only record
 * if enough time has passed since last sample.
 */
export function createTrajectorySampler(): {
  sample: (x: number, y: number) => void;
  getPoints: () => RawTrajectoryPoint[];
  reset: () => void;
} {
  let points: RawTrajectoryPoint[] = [];
  let lastSampleTime = 0;

  return {
    sample(x: number, y: number) {
      const now = performance.now();
      // Always capture first point, then throttle to 20Hz
      if (points.length === 0 || now - lastSampleTime >= TRAJECTORY_SAMPLE_INTERVAL_MS) {
        points.push({ x, y, t: now });
        lastSampleTime = now;
      }
    },
    getPoints() {
      return points;
    },
    reset() {
      points = [];
      lastSampleTime = 0;
    },
  };
}
