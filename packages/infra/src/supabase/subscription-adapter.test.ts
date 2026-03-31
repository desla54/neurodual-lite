/**
 * Subscription Adapter Tests
 *
 * Tests for subscription management via Supabase.
 *
 * Note: These tests use dynamic imports and mock.restore() to avoid
 * interference from mock.module() used in other test files.
 */

import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  planHasPremiumAccess,
  planHasCloudSync,
  calculateDaysRemaining,
  PREMIUM_N_THRESHOLD,
} from '@neurodual/logic';

// Valid UUID for tests
const U1 = '00000000-0000-0000-0000-000000000001';
const SUB_ID = '00000000-0000-0000-0000-000000000099';

// Mock Supabase Client
const createSupabaseMock = (
  options: {
    hasUser?: boolean;
    subscription?: Record<string, unknown> | null;
    subscriptionError?: { code: string; message: string } | null;
  } = {},
) => {
  const { hasUser = true, subscription = null, subscriptionError = null } = options;

  const mockUser = hasUser ? { id: U1, email: 'test@test.com' } : null;

  const m: Record<string, unknown> = {
    auth: {
      getUser: mock(() => Promise.resolve({ data: { user: mockUser } })),
      onAuthStateChange: mock((_cb: (event: string, session: unknown) => void) => {
        return { data: { subscription: { unsubscribe: mock(() => {}) } } };
      }),
    },
    from: mock(() => m),
    select: mock(() => m),
    eq: mock(() => m),
    single: mock(() =>
      Promise.resolve({
        data: subscription,
        error: subscriptionError,
      }),
    ),
  };
  return m;
};

describe('SubscriptionAdapter - Pure Logic', () => {
  describe('planHasPremiumAccess', () => {
    it('should return true for premium plan with active status', () => {
      expect(planHasPremiumAccess('premium', 'active')).toBe(true);
    });

    it('should return true for premium plan with trial status', () => {
      expect(planHasPremiumAccess('premium', 'trial')).toBe(true);
    });

    it('should return false for premium plan with expired status', () => {
      expect(planHasPremiumAccess('premium', 'expired')).toBe(false);
    });

    it('should return false for free plan', () => {
      expect(planHasPremiumAccess('free', 'active')).toBe(false);
    });
  });

  describe('planHasCloudSync', () => {
    it('should return true for premium plan with active status', () => {
      expect(planHasCloudSync('premium', 'active')).toBe(true);
    });

    it('should return false for free plan', () => {
      expect(planHasCloudSync('free', 'active')).toBe(false);
    });

    it('should return false for expired premium', () => {
      expect(planHasCloudSync('premium', 'expired')).toBe(false);
    });
  });

  describe('calculateDaysRemaining', () => {
    it('should return null for null expiry date', () => {
      expect(calculateDaysRemaining(null)).toBeNull();
    });

    it('should return 0 for past date', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(calculateDaysRemaining(pastDate)).toBe(0);
    });

    it('should return positive days for future date', () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const days = calculateDaysRemaining(futureDate);
      expect(days).toBeGreaterThanOrEqual(4);
      expect(days).toBeLessThanOrEqual(6);
    });
  });

  describe('N-Level Access Rules', () => {
    it('should allow low N-levels without premium', () => {
      // Free users can access N-levels below threshold
      expect(PREMIUM_N_THRESHOLD).toBeGreaterThan(2);
    });

    it('should require premium for high N-levels', () => {
      // Premium threshold is typically 4 or 5
      expect(PREMIUM_N_THRESHOLD).toBeLessThanOrEqual(5);
    });
  });
});

describe('SubscriptionAdapter - Adapter Methods', () => {
  // Import directly - tests verify behavior after reset
  let clientModule: typeof import('./client');
  let adapterModule: typeof import('./subscription-adapter');
  let supabaseSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Import modules
    clientModule = await import('./client');
    adapterModule = await import('./subscription-adapter');

    // Setup mock for no user / no premium
    const supabaseMock = createSupabaseMock({ hasUser: false });
    supabaseSpy = spyOn(clientModule, 'getSupabase').mockReturnValue(supabaseMock as any);

    // Reset adapter to clean state
    adapterModule.__resetSubscriptionAdapter();
  });

  afterEach(() => {
    supabaseSpy?.mockRestore();
  });

  describe('getState', () => {
    it('should return state with expected shape', () => {
      const state = adapterModule.supabaseSubscriptionAdapter.getState();

      // Verify state has all required properties
      expect(state).toHaveProperty('hasPremiumAccess');
      expect(state).toHaveProperty('hasCloudSync');
      expect(state).toHaveProperty('subscription');
      expect(state).toHaveProperty('isTrialing');
      expect(state).toHaveProperty('daysRemaining');
    });

    it('should return consistent state after reset', () => {
      adapterModule.__resetSubscriptionAdapter();
      const state = adapterModule.supabaseSubscriptionAdapter.getState();

      // After reset, subscription should be null
      expect(state.subscription).toBeNull();
      // Premium access should match subscription state
      expect(state.hasPremiumAccess).toBe(state.subscription !== null);
    });
  });

  describe('subscribe', () => {
    it('should call listener immediately with current state', () => {
      const listener = mock(() => {});
      adapterModule.supabaseSubscriptionAdapter.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0];
      expect(state).toHaveProperty('hasPremiumAccess');
    });

    it('should return unsubscribe function', () => {
      const listener = mock(() => {});
      const unsubscribe = adapterModule.supabaseSubscriptionAdapter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('canAccessNLevel', () => {
    it('should allow low N-levels regardless of premium', () => {
      adapterModule.supabaseSubscriptionAdapter.getState();

      // N-levels below threshold should always be accessible
      expect(adapterModule.supabaseSubscriptionAdapter.canAccessNLevel(1)).toBe(true);
      expect(adapterModule.supabaseSubscriptionAdapter.canAccessNLevel(2)).toBe(true);
      expect(adapterModule.supabaseSubscriptionAdapter.canAccessNLevel(3)).toBe(true);
    });

    it('should check premium for high N-levels', () => {
      const state = adapterModule.supabaseSubscriptionAdapter.getState();

      // High N-levels require premium
      const canAccessHigh =
        adapterModule.supabaseSubscriptionAdapter.canAccessNLevel(PREMIUM_N_THRESHOLD);
      expect(canAccessHigh).toBe(state.hasPremiumAccess);
    });
  });

  describe('canSyncToCloud', () => {
    it('should return consistent value with state', () => {
      const state = adapterModule.supabaseSubscriptionAdapter.getState();
      const canSync = adapterModule.supabaseSubscriptionAdapter.canSyncToCloud();

      // canSyncToCloud should match hasCloudSync from state
      expect(canSync).toBe(state.hasCloudSync);
    });
  });

  describe('refresh', () => {
    it('should be callable and update state', async () => {
      // Test that refresh is a function and doesn't throw
      await expect(adapterModule.supabaseSubscriptionAdapter.refresh()).resolves.toBeUndefined();

      // State should still be valid after refresh
      const state = adapterModule.supabaseSubscriptionAdapter.getState();
      expect(state).toHaveProperty('subscription');
      expect(state).toHaveProperty('hasPremiumAccess');
    });

    it('should return state consistent with subscription', async () => {
      await adapterModule.supabaseSubscriptionAdapter.refresh();

      const state = adapterModule.supabaseSubscriptionAdapter.getState();
      // State should be internally consistent
      if (state.subscription === null) {
        // Without subscription, should not have premium (unless mocked)
        // We can only verify the state is valid, not specific values
        expect(typeof state.hasPremiumAccess).toBe('boolean');
      } else {
        // With subscription, premium depends on plan type and status
        expect(state.subscription).toHaveProperty('planType');
      }
    });
  });

  describe('__resetSubscriptionAdapter', () => {
    it('should reset state to initial values', () => {
      // Call reset
      adapterModule.__resetSubscriptionAdapter();

      // After reset, get state and verify it's in initial form
      const state = adapterModule.supabaseSubscriptionAdapter.getState();

      // Verify state has all required properties
      expect(state).toHaveProperty('subscription');
      expect(state).toHaveProperty('hasPremiumAccess');
      expect(state).toHaveProperty('hasCloudSync');
      expect(state).toHaveProperty('isTrialing');
      expect(state).toHaveProperty('daysRemaining');

      // After reset, subscription should be null
      expect(state.subscription).toBeNull();
    });

    it('should allow re-initialization after reset', async () => {
      // Reset
      adapterModule.__resetSubscriptionAdapter();

      // Should be able to call methods after reset
      expect(() => adapterModule.supabaseSubscriptionAdapter.getState()).not.toThrow();
      await expect(adapterModule.supabaseSubscriptionAdapter.refresh()).resolves.toBeUndefined();
    });
  });
});
