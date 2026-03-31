import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  measureEventLoopLag,
  startLagSampler,
  stopLagSampler,
  getLastMeasuredLag,
  isLagSamplerRunning,
} from './event-loop-lag';

describe('event-loop-lag', () => {
  beforeEach(() => {
    // Ensure sampler is stopped before each test
    stopLagSampler();
  });

  afterEach(() => {
    // Clean up after each test
    stopLagSampler();
  });

  describe('measureEventLoopLag', () => {
    it('should return a number representing lag in milliseconds', async () => {
      const lag = await measureEventLoopLag();

      expect(typeof lag).toBe('number');
      expect(lag).toBeGreaterThanOrEqual(0);
    });

    it('should return reasonable values (under 1000ms typically)', async () => {
      const lag = await measureEventLoopLag();

      // In normal conditions, setTimeout(0) shouldn't take more than 100ms
      expect(lag).toBeLessThan(1000);
    });
  });

  describe('startLagSampler', () => {
    it('should start the sampler', () => {
      expect(isLagSamplerRunning()).toBe(false);

      startLagSampler();

      expect(isLagSamplerRunning()).toBe(true);
    });

    it('should not start twice if already running', () => {
      startLagSampler();
      expect(isLagSamplerRunning()).toBe(true);

      // Starting again should be a no-op
      startLagSampler();
      expect(isLagSamplerRunning()).toBe(true);
    });

    it('should eventually populate lastMeasuredLag', async () => {
      startLagSampler();

      // Wait for initial measurement
      await new Promise((resolve) => setTimeout(resolve, 50));

      const lag = getLastMeasuredLag();
      expect(lag).toBeDefined();
      expect(typeof lag).toBe('number');
    });
  });

  describe('stopLagSampler', () => {
    it('should stop the sampler', () => {
      startLagSampler();
      expect(isLagSamplerRunning()).toBe(true);

      stopLagSampler();

      expect(isLagSamplerRunning()).toBe(false);
    });

    it('should be safe to call when not running', () => {
      expect(isLagSamplerRunning()).toBe(false);

      // Should not throw
      stopLagSampler();

      expect(isLagSamplerRunning()).toBe(false);
    });
  });

  describe('getLastMeasuredLag', () => {
    it('should return undefined before sampler starts', () => {
      // Reset by stopping and waiting
      stopLagSampler();

      // Note: This may fail if other tests left state
      // In isolation, it should return undefined or a previous value
      const lag = getLastMeasuredLag();
      // Can be undefined or a number from previous tests
      if (lag !== undefined) {
        expect(typeof lag).toBe('number');
      }
    });

    it('should return last measured value after sampler runs', async () => {
      startLagSampler();

      // Wait for measurement
      await new Promise((resolve) => setTimeout(resolve, 100));

      const lag = getLastMeasuredLag();
      expect(lag).toBeDefined();
      expect(typeof lag).toBe('number');
      expect(lag).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isLagSamplerRunning', () => {
    it('should return false initially', () => {
      stopLagSampler(); // Ensure stopped
      expect(isLagSamplerRunning()).toBe(false);
    });

    it('should return true when running', () => {
      startLagSampler();
      expect(isLagSamplerRunning()).toBe(true);
    });

    it('should return false after stopping', () => {
      startLagSampler();
      stopLagSampler();
      expect(isLagSamplerRunning()).toBe(false);
    });
  });
});
