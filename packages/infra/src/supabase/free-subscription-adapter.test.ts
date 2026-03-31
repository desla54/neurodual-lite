import { describe, expect, it, mock } from 'bun:test';
import { freeSubscriptionAdapter } from './free-subscription-adapter';

describe('freeSubscriptionAdapter', () => {
  describe('getState', () => {
    it('should return premium access enabled', () => {
      const state = freeSubscriptionAdapter.getState();
      expect(state.hasPremiumAccess).toBe(true);
    });

    it('should return cloud sync enabled', () => {
      const state = freeSubscriptionAdapter.getState();
      expect(state.hasCloudSync).toBe(true);
    });

    it('should return no subscription', () => {
      const state = freeSubscriptionAdapter.getState();
      expect(state.subscription).toBeNull();
    });

    it('should return not trialing', () => {
      const state = freeSubscriptionAdapter.getState();
      expect(state.isTrialing).toBe(false);
    });

    it('should return no days remaining', () => {
      const state = freeSubscriptionAdapter.getState();
      expect(state.daysRemaining).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should call listener immediately with current state', () => {
      const listener = mock(() => {});
      freeSubscriptionAdapter.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(freeSubscriptionAdapter.getState());
    });

    it('should return unsubscribe function', () => {
      const listener = mock(() => {});
      const unsubscribe = freeSubscriptionAdapter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('refresh', () => {
    it('should complete without error', async () => {
      await expect(freeSubscriptionAdapter.refresh()).resolves.toBeUndefined();
    });
  });

  describe('canAccessNLevel', () => {
    it('should return true for N1', () => {
      expect(freeSubscriptionAdapter.canAccessNLevel(1)).toBe(true);
    });

    it('should return true for N10', () => {
      expect(freeSubscriptionAdapter.canAccessNLevel(10)).toBe(true);
    });

    it('should return true for any N level', () => {
      expect(freeSubscriptionAdapter.canAccessNLevel(100)).toBe(true);
    });
  });

  describe('canSyncToCloud', () => {
    it('should return true', () => {
      expect(freeSubscriptionAdapter.canSyncToCloud()).toBe(true);
    });
  });
});
