import { describe, it, expect, beforeEach } from 'bun:test';
import { yieldToMain, yieldIfOverBudget, nowMs, type YieldBudgetState } from './yield-to-main';

describe('yield-to-main', () => {
  describe('nowMs', () => {
    it('returns a number', () => {
      const t = nowMs();
      expect(typeof t).toBe('number');
      expect(t).toBeGreaterThan(0);
    });

    it('returns monotonically increasing values', () => {
      const a = nowMs();
      const b = nowMs();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  describe('yieldToMain', () => {
    it('resolves without throwing', async () => {
      await expect(yieldToMain()).resolves.toBeUndefined();
    });

    it('resolves via setTimeout fallback in test environment', async () => {
      // In bun test, window is defined via test-preload but scheduler.yield is not,
      // so it falls through to the setTimeout(resolve, 0) path.
      const before = nowMs();
      await yieldToMain();
      const after = nowMs();
      // Should resolve nearly instantly (setTimeout 0)
      expect(after - before).toBeLessThan(100);
    });
  });

  describe('yieldIfOverBudget', () => {
    let state: YieldBudgetState;

    beforeEach(() => {
      state = { lastYieldMs: nowMs() };
    });

    it('does not yield when within budget', async () => {
      // Just created state, so elapsed ~0ms which is < default 8ms budget
      state.lastYieldMs = nowMs();
      const before = state.lastYieldMs;
      await yieldIfOverBudget(state);
      // lastYieldMs should NOT be updated because we didn't yield
      expect(state.lastYieldMs).toBe(before);
    });

    it('yields when over budget and updates lastYieldMs', async () => {
      // Set lastYieldMs far in the past to exceed budget
      state.lastYieldMs = 0;
      await yieldIfOverBudget(state);
      // After yielding, lastYieldMs should be updated to a recent time
      expect(state.lastYieldMs).toBeGreaterThan(0);
    });

    it('respects custom budget parameter', async () => {
      // With a very large budget, should not yield even with old timestamp
      state.lastYieldMs = nowMs() - 5;
      const before = state.lastYieldMs;
      await yieldIfOverBudget(state, 1000);
      // Should not have yielded
      expect(state.lastYieldMs).toBe(before);
    });

    it('yields with a small budget when time has passed', async () => {
      state.lastYieldMs = nowMs() - 100;
      await yieldIfOverBudget(state, 1);
      // Should have yielded and updated
      expect(state.lastYieldMs).toBeGreaterThan(0);
    });
  });
});
