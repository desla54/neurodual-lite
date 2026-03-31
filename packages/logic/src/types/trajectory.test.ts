import { describe, expect, it } from 'bun:test';
import {
  encodeTrajectory,
  decodeTrajectory,
  interpolateTrajectory,
  getTrajectoryDuration,
  createTrajectorySampler,
  TRAJECTORY_SAMPLE_INTERVAL_MS,
  type RawTrajectoryPoint,
  type CompactTrajectory,
  type TrajectoryPoint,
} from './trajectory';
import { TRAJECTORY_SAMPLE_RATE_HZ } from '../specs/thresholds';

describe('trajectory', () => {
  const mockContainerRect = {
    left: 100,
    top: 50,
    width: 400,
    height: 300,
  };

  describe('encodeTrajectory', () => {
    it('should return empty trajectory for empty input', () => {
      const result = encodeTrajectory([], mockContainerRect);

      expect(result.sampleRate).toBe(TRAJECTORY_SAMPLE_RATE_HZ);
      expect(result.containerSize.w).toBe(400);
      expect(result.containerSize.h).toBe(300);
      expect(result.points).toHaveLength(0);
    });

    it('should normalize coordinates to 0-1 range', () => {
      const rawPoints: RawTrajectoryPoint[] = [
        { x: 100, y: 50, t: 1000 }, // top-left corner
        { x: 300, y: 200, t: 1100 }, // center
        { x: 500, y: 350, t: 1200 }, // bottom-right corner
      ];

      const result = encodeTrajectory(rawPoints, mockContainerRect);

      expect(result.points).toHaveLength(3);
      // Top-left: (100-100)/400 = 0, (50-50)/300 = 0
      expect(result.points[0]![0]).toBeCloseTo(0, 4);
      expect(result.points[0]![1]).toBeCloseTo(0, 4);
      // Center: (300-100)/400 = 0.5, (200-50)/300 = 0.5
      expect(result.points[1]![0]).toBeCloseTo(0.5, 4);
      expect(result.points[1]![1]).toBeCloseTo(0.5, 4);
      // Bottom-right: (500-100)/400 = 1, (350-50)/300 = 1
      expect(result.points[2]![0]).toBeCloseTo(1, 4);
      expect(result.points[2]![1]).toBeCloseTo(1, 4);
    });

    it('should clamp coordinates outside container', () => {
      const rawPoints: RawTrajectoryPoint[] = [
        { x: 0, y: 0, t: 1000 }, // Outside top-left
        { x: 600, y: 400, t: 1100 }, // Outside bottom-right
      ];

      const result = encodeTrajectory(rawPoints, mockContainerRect);

      // Should be clamped to 0
      expect(result.points[0]![0]).toBe(0);
      expect(result.points[0]![1]).toBe(0);
      // Should be clamped to 1
      expect(result.points[1]![0]).toBe(1);
      expect(result.points[1]![1]).toBe(1);
    });

    it('should make time relative to first point', () => {
      const rawPoints: RawTrajectoryPoint[] = [
        { x: 200, y: 100, t: 5000 },
        { x: 250, y: 150, t: 5100 },
        { x: 300, y: 200, t: 5250 },
      ];

      const result = encodeTrajectory(rawPoints, mockContainerRect);

      expect(result.points[0]![2]).toBe(0);
      expect(result.points[1]![2]).toBe(100);
      expect(result.points[2]![2]).toBe(250);
    });

    it('should round coordinates to 4 decimal places', () => {
      const rawPoints: RawTrajectoryPoint[] = [
        { x: 233, y: 117, t: 1000 }, // 0.3325, 0.22333...
      ];

      const result = encodeTrajectory(rawPoints, mockContainerRect);

      // (233-100)/400 = 0.3325
      expect(result.points[0]![0]).toBe(0.3325);
      // (117-50)/300 = 0.2233...
      expect(result.points[0]![1]).toBe(0.2233);
    });
  });

  describe('decodeTrajectory', () => {
    it('should decode compact trajectory to points', () => {
      const compact: CompactTrajectory = {
        sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
        containerSize: { w: 400, h: 300 },
        points: [
          [0, 0, 0],
          [0.5, 0.5, 100],
          [1, 1, 200],
        ],
      };

      const decoded = decodeTrajectory(compact);

      expect(decoded).toHaveLength(3);
      expect(decoded[0]).toEqual({ x: 0, y: 0, t: 0 });
      expect(decoded[1]).toEqual({ x: 0.5, y: 0.5, t: 100 });
      expect(decoded[2]).toEqual({ x: 1, y: 1, t: 200 });
    });

    it('should handle empty trajectory', () => {
      const compact: CompactTrajectory = {
        sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
        containerSize: { w: 400, h: 300 },
        points: [],
      };

      const decoded = decodeTrajectory(compact);

      expect(decoded).toHaveLength(0);
    });
  });

  describe('interpolateTrajectory', () => {
    const points: TrajectoryPoint[] = [
      { x: 0, y: 0, t: 0 },
      { x: 0.5, y: 0.5, t: 100 },
      { x: 1, y: 1, t: 200 },
    ];

    it('should return null for empty points', () => {
      const result = interpolateTrajectory([], 50);
      expect(result).toBeNull();
    });

    it('should return first point for single point trajectory', () => {
      const singlePoint: TrajectoryPoint[] = [{ x: 0.3, y: 0.7, t: 0 }];

      const result = interpolateTrajectory(singlePoint, 50);

      expect(result).toEqual({ x: 0.3, y: 0.7 });
    });

    it('should return first point for time before start', () => {
      const result = interpolateTrajectory(points, -10);

      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('should return last point for time after end', () => {
      const result = interpolateTrajectory(points, 300);

      expect(result).toEqual({ x: 1, y: 1 });
    });

    it('should return exact point when time matches', () => {
      const result = interpolateTrajectory(points, 100);

      expect(result).toEqual({ x: 0.5, y: 0.5 });
    });

    it('should interpolate between points', () => {
      // At time 50, should be halfway between first and second point
      const result = interpolateTrajectory(points, 50);

      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0.25, 4);
      expect(result!.y).toBeCloseTo(0.25, 4);
    });

    it('should interpolate at 75% between points', () => {
      // At time 75, should be 75% between first and second point
      const result = interpolateTrajectory(points, 75);

      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0.375, 4);
      expect(result!.y).toBeCloseTo(0.375, 4);
    });

    it('should interpolate in second segment', () => {
      // At time 150, should be halfway between second and third point
      const result = interpolateTrajectory(points, 150);

      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0.75, 4);
      expect(result!.y).toBeCloseTo(0.75, 4);
    });
  });

  describe('getTrajectoryDuration', () => {
    it('should return 0 for empty trajectory', () => {
      const trajectory: CompactTrajectory = {
        sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
        containerSize: { w: 400, h: 300 },
        points: [],
      };

      const duration = getTrajectoryDuration(trajectory);

      expect(duration).toBe(0);
    });

    it('should return 0 for single point trajectory', () => {
      const trajectory: CompactTrajectory = {
        sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
        containerSize: { w: 400, h: 300 },
        points: [[0.5, 0.5, 0]],
      };

      const duration = getTrajectoryDuration(trajectory);

      expect(duration).toBe(0);
    });

    it('should return last point time as duration', () => {
      const trajectory: CompactTrajectory = {
        sampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
        containerSize: { w: 400, h: 300 },
        points: [
          [0, 0, 0],
          [0.5, 0.5, 500],
          [1, 1, 1500],
        ],
      };

      const duration = getTrajectoryDuration(trajectory);

      expect(duration).toBe(1500);
    });
  });

  describe('createTrajectorySampler', () => {
    it('should sample first point immediately', () => {
      const sampler = createTrajectorySampler();

      sampler.sample(100, 200);
      const points = sampler.getPoints();

      expect(points).toHaveLength(1);
      expect(points[0]!.x).toBe(100);
      expect(points[0]!.y).toBe(200);
    });

    it('should reset sampler', () => {
      const sampler = createTrajectorySampler();

      sampler.sample(100, 200);
      expect(sampler.getPoints()).toHaveLength(1);

      sampler.reset();
      expect(sampler.getPoints()).toHaveLength(0);
    });
  });

  describe('TRAJECTORY_SAMPLE_INTERVAL_MS', () => {
    it('should be defined and match expected value', () => {
      expect(TRAJECTORY_SAMPLE_INTERVAL_MS).toBeDefined();
      // 20Hz = 50ms interval
      expect(TRAJECTORY_SAMPLE_INTERVAL_MS).toBe(50);
    });
  });
});
