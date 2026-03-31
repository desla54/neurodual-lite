/**
 * Reward Adapter Tests
 *
 * Tests for the reward adapter (queueReward, grantReward, processPendingRewards,
 * subscribe/unsubscribe, resetRewardAdapter, noopRewardAdapter).
 *
 * Mocking strategy: mock.module() for Supabase client and Drizzle DB,
 * then dynamic import of the adapter under test.
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test';
import type { RewardState } from '@neurodual/logic';

// ---------------------------------------------------------------------------
// Mutable mock state — mutated per test, read by mock.module() closures
// ---------------------------------------------------------------------------

let supabaseConfigured = true;

/** Auth session returned by getSession() */
let mockSession: { access_token: string } | null = { access_token: 'tok_test' };

/** Auth user returned by getUser() */
let mockUser: { id: string } | null = { id: 'u1' };

/** Value returned by functions.invoke() */
let mockFunctionsInvokeResult: { data: unknown; error: unknown } = {
  data: { success: true, expires_at: null },
  error: null,
};

/** Rows returned by supabase.from('user_rewards').select().eq() */
let mockUserRewardsRows: unknown[] = [];
let mockUserRewardsError: unknown = null;

// Track calls
const functionsInvokeMock = mock(
  async (_name: string, _opts: unknown) => mockFunctionsInvokeResult,
);

// Supabase from().select().eq() chain — returns a thenable
function createFromChain() {
  const chain: Record<string, unknown> = {
    select: mock(function (this: typeof chain) {
      return this;
    }),
    eq: mock(function (this: typeof chain) {
      return this;
    }),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: mockUserRewardsRows, error: mockUserRewardsError }).then(resolve),
  };
  return chain;
}

const mockSupabase = {
  auth: {
    getSession: mock(async () => ({ data: { session: mockSession } })),
    getUser: mock(async () => ({ data: { user: mockUser } })),
  },
  functions: {
    invoke: functionsInvokeMock,
  },
  from: mock(() => createFromChain()),
};

// ---------------------------------------------------------------------------
// mock.module() — MUST be before import of the adapter
// ---------------------------------------------------------------------------

mock.module('../supabase/client', () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  getSupabase: () => mockSupabase,
}));

mock.module('../db/drizzle', () => ({
  requireDrizzleDb: () => ({
    run: mock(async () => {}),
    all: mock(async () => []),
  }),
}));

mock.module('../persistence/setup-persistence', () => ({
  getPersistencePort: () => ({}),
}));

// Import AFTER mock.module()
import {
  rewardAdapter,
  noopRewardAdapter,
  resetRewardAdapter,
  createRewardAdapter,
} from './reward-adapter';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset module-level state
  resetRewardAdapter();

  // Reset mock state to defaults
  supabaseConfigured = true;
  mockSession = { access_token: 'tok_test' };
  mockUser = { id: 'u1' };
  mockFunctionsInvokeResult = {
    data: { success: true, expires_at: null },
    error: null,
  };
  mockUserRewardsRows = [];
  mockUserRewardsError = null;

  // Clear call counts
  functionsInvokeMock.mockClear();
  mockSupabase.auth.getSession.mockClear();
  mockSupabase.auth.getUser.mockClear();
  mockSupabase.from.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rewardAdapter', () => {
  // =========================================================================
  // queueReward
  // =========================================================================

  describe('queueReward', () => {
    it('should add a reward to the pending list', () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      const pending = rewardAdapter.getPendingRewards();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.rewardId).toBe('REWARD_7_DAYS_PREMIUM');
      expect(pending[0]!.requestedAt).toBeGreaterThan(0);
    });

    it('should prevent duplicate queuing of the same reward', () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      expect(rewardAdapter.getPendingRewards()).toHaveLength(1);
    });

    it('should allow queuing different reward types', () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');
      rewardAdapter.queueReward('REWARD_1_MONTH_PREMIUM');

      expect(rewardAdapter.getPendingRewards()).toHaveLength(2);
    });

    it('should skip if the reward is already granted', async () => {
      // Grant the reward first
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      // Now try to queue it
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      expect(rewardAdapter.getPendingRewards()).toHaveLength(0);
    });

    it('should notify listeners when a reward is queued', () => {
      const listener = mock(() => {});
      rewardAdapter.subscribe(listener);

      // Clear the initial deferred notification
      listener.mockClear();

      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      // Synchronous notification from queueReward
      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0] as RewardState;
      expect(state.pendingRewards).toHaveLength(1);
    });
  });

  // =========================================================================
  // grantReward
  // =========================================================================

  describe('grantReward', () => {
    it('should call edge function and add to granted on success', async () => {
      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.expiresAt).toBeNull();
      }

      const granted = await rewardAdapter.getGrantedRewards();
      expect(granted).toHaveLength(1);
      expect(granted[0]!.rewardId).toBe('REWARD_7_DAYS_PREMIUM');
      expect(functionsInvokeMock).toHaveBeenCalledTimes(1);
    });

    it('should remove from pending when granted successfully', async () => {
      // Queue first
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');
      expect(rewardAdapter.getPendingRewards()).toHaveLength(1);

      // Grant
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(rewardAdapter.getPendingRewards()).toHaveLength(0);
    });

    it('should return network_error when no session', async () => {
      mockSession = null;

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('network_error');
      }
      // Edge function should NOT have been called
      expect(functionsInvokeMock).not.toHaveBeenCalled();
    });

    it('should return mock success when Supabase is not configured', async () => {
      supabaseConfigured = false;

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(true);
      // Edge function should NOT have been called
      expect(functionsInvokeMock).not.toHaveBeenCalled();
    });

    it('should return network_error when edge function returns error', async () => {
      mockFunctionsInvokeResult = {
        data: null,
        error: { message: 'network failure' },
      };

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('network_error');
      }
    });

    it('should return already_granted when edge function says so', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'already_granted' },
        error: null,
      };

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('already_granted');
      }
    });

    it('should return not_eligible when edge function says so', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'not_eligible' },
        error: null,
      };

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_eligible');
      }
    });

    it('should return server_error for unknown edge function errors', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'revenuecat_error' },
        error: null,
      };

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('server_error');
      }
    });

    it('should parse expiresAt from edge function response', async () => {
      const expiryDate = '2026-06-01T00:00:00.000Z';
      mockFunctionsInvokeResult = {
        data: { success: true, expires_at: expiryDate },
        error: null,
      };

      const result = await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt!.toISOString()).toBe(expiryDate);
      }
    });

    it('should set isProcessing true during grant and false after', async () => {
      const states: boolean[] = [];
      rewardAdapter.subscribe((state: RewardState) => {
        states.push(state.isProcessing);
      });

      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      // Should have been true (start) then false (end)
      expect(states).toContain(true);
      expect(states[states.length - 1]).toBe(false);
    });

    it('should not add to granted on failure', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'not_eligible' },
        error: null,
      };

      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      const granted = await rewardAdapter.getGrantedRewards();
      // Cache is empty, will fetch from server (which returns [])
      expect(granted).toHaveLength(0);
    });
  });

  // =========================================================================
  // getGrantedRewards
  // =========================================================================

  describe('getGrantedRewards', () => {
    it('should return cached granted rewards if present', async () => {
      // Grant a reward to populate cache
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      // Clear the from() mock call count
      mockSupabase.from.mockClear();

      const rewards = await rewardAdapter.getGrantedRewards();
      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.rewardId).toBe('REWARD_7_DAYS_PREMIUM');

      // from() should NOT have been called because cache was used
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should fetch from server when cache is empty', async () => {
      mockUserRewardsRows = [
        {
          reward_id: 'REWARD_1_MONTH_PREMIUM',
          granted_at: '2026-01-01T00:00:00.000Z',
          expires_at: null,
        },
      ];

      const rewards = await rewardAdapter.getGrantedRewards();

      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.rewardId).toBe('REWARD_1_MONTH_PREMIUM');
      expect(rewards[0]!.grantedAt).toBeInstanceOf(Date);
      expect(rewards[0]!.expiresAt).toBeNull();
    });

    it('should parse expires_at date from server response', async () => {
      mockUserRewardsRows = [
        {
          reward_id: 'REWARD_7_DAYS_PREMIUM',
          granted_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2026-01-08T00:00:00.000Z',
        },
      ];

      const rewards = await rewardAdapter.getGrantedRewards();

      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.expiresAt).toBeInstanceOf(Date);
      expect(rewards[0]!.expiresAt!.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    });

    it('should skip rows with invalid granted_at and tolerate invalid expires_at', async () => {
      mockUserRewardsRows = [
        {
          reward_id: 'REWARD_7_DAYS_PREMIUM',
          granted_at: 'not-a-date',
          expires_at: '2026-01-08T00:00:00.000Z',
        },
        {
          reward_id: 'REWARD_1_MONTH_PREMIUM',
          granted_at: '2026-01-01T00:00:00.000Z',
          expires_at: 'not-a-date',
        },
      ];

      const rewards = await rewardAdapter.getGrantedRewards();

      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.rewardId).toBe('REWARD_1_MONTH_PREMIUM');
      expect(rewards[0]!.grantedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(rewards[0]!.expiresAt).toBeNull();
    });

    it('should return empty array when Supabase is not configured', async () => {
      supabaseConfigured = false;

      const rewards = await rewardAdapter.getGrantedRewards();

      expect(rewards).toEqual([]);
    });

    it('should return empty array when no user is logged in', async () => {
      mockUser = null;

      const rewards = await rewardAdapter.getGrantedRewards();

      expect(rewards).toEqual([]);
    });

    it('should return a copy (not the internal array)', async () => {
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      const r1 = await rewardAdapter.getGrantedRewards();
      const r2 = await rewardAdapter.getGrantedRewards();
      expect(r1).not.toBe(r2); // different references
      expect(r1).toEqual(r2); // same content
    });
  });

  // =========================================================================
  // getPendingRewards
  // =========================================================================

  describe('getPendingRewards', () => {
    it('should return empty array initially', () => {
      expect(rewardAdapter.getPendingRewards()).toEqual([]);
    });

    it('should return a copy of the pending list', () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      const p1 = rewardAdapter.getPendingRewards();
      const p2 = rewardAdapter.getPendingRewards();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });

  // =========================================================================
  // processPendingRewards
  // =========================================================================

  describe('processPendingRewards', () => {
    it('should do nothing when queue is empty', async () => {
      await rewardAdapter.processPendingRewards();

      expect(functionsInvokeMock).not.toHaveBeenCalled();
    });

    it('should grant each pending reward and remove from queue on success', async () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');
      rewardAdapter.queueReward('REWARD_1_MONTH_PREMIUM');
      expect(rewardAdapter.getPendingRewards()).toHaveLength(2);

      await rewardAdapter.processPendingRewards();

      expect(rewardAdapter.getPendingRewards()).toHaveLength(0);
      const granted = await rewardAdapter.getGrantedRewards();
      expect(granted).toHaveLength(2);
    });

    it('should remove from pending but not add to granted on already_granted', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'already_granted' },
        error: null,
      };

      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      await rewardAdapter.processPendingRewards();

      // Removed from pending
      expect(rewardAdapter.getPendingRewards()).toHaveLength(0);
    });

    it('should keep in queue on network_error for retry', async () => {
      mockFunctionsInvokeResult = {
        data: null,
        error: { message: 'offline' },
      };

      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      await rewardAdapter.processPendingRewards();

      // Should still be pending
      expect(rewardAdapter.getPendingRewards()).toHaveLength(1);
    });

    it('should keep in queue on not_eligible for retry', async () => {
      mockFunctionsInvokeResult = {
        data: { success: false, error: 'not_eligible' },
        error: null,
      };

      rewardAdapter.queueReward('REWARD_3_MONTHS_PREMIUM');

      await rewardAdapter.processPendingRewards();

      expect(rewardAdapter.getPendingRewards()).toHaveLength(1);
    });

    it('should set isProcessing during processing', async () => {
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      const states: boolean[] = [];
      rewardAdapter.subscribe((state: RewardState) => {
        states.push(state.isProcessing);
      });

      await rewardAdapter.processPendingRewards();

      expect(states).toContain(true);
      expect(states[states.length - 1]).toBe(false);
    });
  });

  // =========================================================================
  // subscribe / unsubscribe
  // =========================================================================

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const unsub = rewardAdapter.subscribe(() => {});
      expect(typeof unsub).toBe('function');
      unsub(); // cleanup
    });

    it('should deliver initial state via deferred notification', async () => {
      const listener = mock(() => {});

      const unsub = rewardAdapter.subscribe(listener);

      // Initial notification is deferred via setTimeout(0)
      await new Promise((r) => setTimeout(r, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0] as RewardState;
      expect(state.grantedRewards).toEqual([]);
      expect(state.pendingRewards).toEqual([]);
      expect(state.isProcessing).toBe(false);

      unsub();
    });

    it('should not call listener after unsubscribe', async () => {
      const listener = mock(() => {});

      const unsub = rewardAdapter.subscribe(listener);
      unsub();

      // Wait for deferred notification — should NOT fire because unsubscribed
      await new Promise((r) => setTimeout(r, 10));
      listener.mockClear();

      // Queue a reward — listener should NOT be notified
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      const unsub1 = rewardAdapter.subscribe(listener1);
      const unsub2 = rewardAdapter.subscribe(listener2);

      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      // Both should have been called (synchronous notification from queueReward)
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('should survive a throwing listener without affecting others', () => {
      const badListener = mock(() => {
        throw new Error('listener boom');
      });
      const goodListener = mock(() => {});

      const unsub1 = rewardAdapter.subscribe(badListener);
      const unsub2 = rewardAdapter.subscribe(goodListener);

      // Should not throw
      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      expect(goodListener).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('should unsubscribe only the specific listener', () => {
      const listener1 = mock(() => {});
      const listener2 = mock(() => {});

      const unsub1 = rewardAdapter.subscribe(listener1);
      const unsub2 = rewardAdapter.subscribe(listener2);

      unsub1();
      listener1.mockClear();
      listener2.mockClear();

      rewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub2();
    });
  });

  // =========================================================================
  // hasReward
  // =========================================================================

  describe('hasReward', () => {
    it('should return true when reward is in local cache', async () => {
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');

      const has = await rewardAdapter.hasReward('REWARD_7_DAYS_PREMIUM');
      expect(has).toBe(true);
    });

    it('should return false when reward is not granted', async () => {
      const has = await rewardAdapter.hasReward('REWARD_LIFETIME_ACCESS');
      expect(has).toBe(false);
    });

    it('should refresh from server if not in local cache', async () => {
      // First call: cache empty, server returns nothing
      const has1 = await rewardAdapter.hasReward('REWARD_7_DAYS_PREMIUM');
      expect(has1).toBe(false);

      // Verify that from() was called (server fetch via refresh)
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resetRewardAdapter
  // =========================================================================

  describe('resetRewardAdapter', () => {
    it('should clear all granted and pending rewards', async () => {
      // Populate state
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');
      rewardAdapter.queueReward('REWARD_1_MONTH_PREMIUM');

      expect((await rewardAdapter.getGrantedRewards()).length).toBeGreaterThan(0);
      expect(rewardAdapter.getPendingRewards().length).toBeGreaterThan(0);

      resetRewardAdapter();

      // getPendingRewards is synchronous, should be empty
      expect(rewardAdapter.getPendingRewards()).toEqual([]);

      // getGrantedRewards: cache cleared, will try to fetch from server which returns []
      const granted = await rewardAdapter.getGrantedRewards();
      expect(granted).toEqual([]);
    });

    it('should notify listeners on reset', () => {
      const listener = mock(() => {});
      const unsub = rewardAdapter.subscribe(listener);
      listener.mockClear();

      resetRewardAdapter();

      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0] as RewardState;
      expect(state.grantedRewards).toEqual([]);
      expect(state.pendingRewards).toEqual([]);
      expect(state.isProcessing).toBe(false);

      unsub();
    });

    it('should set isProcessing to false', async () => {
      await rewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');
      resetRewardAdapter();

      const listener = mock(() => {});
      const unsub = rewardAdapter.subscribe(listener);
      await new Promise((r) => setTimeout(r, 10));

      const state = (listener!.mock.calls as any)[0][0] as RewardState;
      expect(state.isProcessing).toBe(false);

      unsub();
    });
  });

  // =========================================================================
  // createRewardAdapter
  // =========================================================================

  describe('createRewardAdapter', () => {
    it('should return the same adapter singleton', () => {
      const adapter = createRewardAdapter({} as never);
      expect(adapter).toBe(rewardAdapter);
    });
  });
});

// ===========================================================================
// noopRewardAdapter
// ===========================================================================

describe('noopRewardAdapter', () => {
  it('grantReward should return success without throwing', async () => {
    const result = await noopRewardAdapter.grantReward('REWARD_7_DAYS_PREMIUM');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.expiresAt).toBeNull();
    }
  });

  it('getGrantedRewards should return empty array', async () => {
    const rewards = await noopRewardAdapter.getGrantedRewards();
    expect(rewards).toEqual([]);
  });

  it('getPendingRewards should return empty array', () => {
    const pending = noopRewardAdapter.getPendingRewards();
    expect(pending).toEqual([]);
  });

  it('queueReward should not throw', () => {
    expect(() => noopRewardAdapter.queueReward('REWARD_7_DAYS_PREMIUM')).not.toThrow();
  });

  it('processPendingRewards should not throw', async () => {
    await expect(noopRewardAdapter.processPendingRewards()).resolves.toBeUndefined();
  });

  it('hasReward should return false', async () => {
    const has = await noopRewardAdapter.hasReward('REWARD_LIFETIME_ACCESS');
    expect(has).toBe(false);
  });

  it('subscribe should return an unsubscribe function', () => {
    const unsub = noopRewardAdapter.subscribe(() => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('refresh should not throw', async () => {
    await expect(noopRewardAdapter.refresh()).resolves.toBeUndefined();
  });
});
