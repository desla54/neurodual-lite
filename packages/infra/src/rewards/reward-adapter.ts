/**
 * Reward Adapter
 *
 * Implementation of RewardPort for granting XP-based Premium rewards.
 * Uses Supabase Edge Functions for secure backend validation.
 * Includes offline queue support via SQLite.
 */

import type {
  GrantedReward,
  PendingReward,
  RewardGrantResult,
  RewardPort,
  RewardState,
  RewardStateListener,
  PremiumRewardType,
  PersistencePort,
} from '@neurodual/logic';
import { sql } from 'drizzle-orm';
import { requireDrizzleDb } from '../db/drizzle';
import { parseSqlDate, toFiniteNumber } from '../db/sql-helpers';
import { getSupabase, isSupabaseConfigured } from '../supabase/client';
import { getPersistencePort } from '../persistence/setup-persistence';

// =============================================================================
// State
// =============================================================================

let grantedRewards: GrantedReward[] = [];
let pendingRewards: PendingReward[] = [];
let isProcessing = false;
let isNotifying = false; // Re-entrant protection
const listeners = new Set<RewardStateListener>();

function notifyListeners(): void {
  // Block re-entrant calls to prevent infinite loops
  if (isNotifying) {
    console.warn('[RewardAdapter] Blocked re-entrant notifyListeners call');
    return;
  }

  isNotifying = true;
  try {
    const state: RewardState = {
      grantedRewards: [...grantedRewards],
      pendingRewards: [...pendingRewards],
      isProcessing,
    };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('[RewardAdapter] Listener error:', error);
      }
    }
  } finally {
    isNotifying = false;
  }
}

// =============================================================================
// SQLite Queue (Offline Support)
// =============================================================================

const PENDING_REWARDS_TABLE = 'pending_rewards';

let activePersistence: PersistencePort | null = null;
function getPersistence(): PersistencePort {
  return activePersistence ?? getPersistencePort();
}

async function ensurePendingRewardsTable(): Promise<void> {
  const persistence = getPersistence();
  const db = requireDrizzleDb(persistence);
  await db.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS ${PENDING_REWARDS_TABLE} (
      reward_id TEXT PRIMARY KEY,
      requested_at INTEGER NOT NULL
    )`),
  );
}

async function loadPendingRewardsFromDB(): Promise<void> {
  await ensurePendingRewardsTable();
  const persistence = getPersistence();
  const db = requireDrizzleDb(persistence);
  const result = await db.all<{ reward_id: string; requested_at: string | number }>(
    sql`SELECT reward_id, requested_at FROM pending_rewards`,
  );
  pendingRewards = result
    .map((row) => ({
      rewardId: row.reward_id as PremiumRewardType,
      requestedAt: toFiniteNumber(row.requested_at, -1),
    }))
    .filter((row) => row.requestedAt >= 0);
}

async function savePendingRewardToDB(reward: PendingReward): Promise<void> {
  await ensurePendingRewardsTable();
  const persistence = getPersistence();
  const db = requireDrizzleDb(persistence);
  await db.run(
    sql`INSERT INTO pending_rewards (reward_id, requested_at)
        VALUES (${reward.rewardId}, ${reward.requestedAt})
        ON CONFLICT (reward_id) DO NOTHING`,
  );
}

async function removePendingRewardFromDB(rewardId: PremiumRewardType): Promise<void> {
  const persistence = getPersistence();
  const db = requireDrizzleDb(persistence);
  await db.run(sql`DELETE FROM pending_rewards WHERE reward_id = ${rewardId}`);
}

// =============================================================================
// Edge Function Calls
// =============================================================================

interface GrantRewardResponse {
  success: boolean;
  expires_at?: string | null;
  error?: 'already_granted' | 'not_eligible' | 'revenuecat_error' | 'server_error';
  message?: string;
}

async function callGrantRewardEdgeFunction(
  rewardId: PremiumRewardType,
): Promise<RewardGrantResult> {
  if (!isSupabaseConfigured()) {
    console.warn('[RewardAdapter] Supabase not configured, returning mock success');
    return { success: true, expiresAt: null };
  }

  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.warn('[RewardAdapter] No active session, cannot grant reward');
    return { success: false, error: 'network_error' };
  }

  try {
    const { data, error } = await supabase.functions.invoke<GrantRewardResponse>(
      'grant-premium-reward',
      { body: { reward_id: rewardId } },
    );

    if (error || !data) {
      console.error('[RewardAdapter] Failed to call Edge Function:', error);
      return { success: false, error: 'network_error' };
    }

    if (data.success) {
      const expiresAt = parseSqlDate(data.expires_at ?? null);
      return {
        success: true,
        expiresAt,
      };
    }

    // Map error types
    if (data.error === 'already_granted') {
      return { success: false, error: 'already_granted' };
    }
    if (data.error === 'not_eligible') {
      return { success: false, error: 'not_eligible' };
    }

    return { success: false, error: 'server_error' };
  } catch (error) {
    console.error('[RewardAdapter] Network error calling Edge Function:', error);
    return { success: false, error: 'network_error' };
  }
}

async function fetchGrantedRewardsFromServer(): Promise<GrantedReward[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_rewards')
    .select('reward_id, granted_at, expires_at')
    .eq('user_id', user.id);

  if (error) {
    console.error('[RewardAdapter] Failed to fetch granted rewards:', error);
    return [];
  }

  const rewards: GrantedReward[] = [];
  for (const row of data || []) {
    const grantedAt = parseSqlDate(row.granted_at);
    if (!grantedAt) continue;
    rewards.push({
      rewardId: row.reward_id as PremiumRewardType,
      grantedAt,
      expiresAt: parseSqlDate(row.expires_at ?? null),
    });
  }
  return rewards;
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export const rewardAdapter: RewardPort = {
  getState(): RewardState {
    return {
      grantedRewards: [...grantedRewards],
      pendingRewards: [...pendingRewards],
      isProcessing,
    };
  },

  async grantReward(rewardId: PremiumRewardType): Promise<RewardGrantResult> {
    isProcessing = true;
    notifyListeners();

    try {
      const result = await callGrantRewardEdgeFunction(rewardId);

      if (result.success) {
        // Add to local cache
        grantedRewards.push({
          rewardId,
          grantedAt: new Date(),
          expiresAt: result.expiresAt,
        });

        // Remove from pending if it was queued
        const pendingIndex = pendingRewards.findIndex((p) => p.rewardId === rewardId);
        if (pendingIndex !== -1) {
          pendingRewards.splice(pendingIndex, 1);
          await removePendingRewardFromDB(rewardId);
        }
      }

      return result;
    } finally {
      isProcessing = false;
      notifyListeners();
    }
  },

  async getGrantedRewards(): Promise<GrantedReward[]> {
    // Return cached if available
    if (grantedRewards.length > 0) {
      return [...grantedRewards];
    }

    // Fetch from server (no notifyListeners here - it's just a read, not a state change)
    // Notifications happen in grantReward(), queueReward(), refresh() where state actually changes
    grantedRewards = await fetchGrantedRewardsFromServer();
    return [...grantedRewards];
  },

  getPendingRewards(): PendingReward[] {
    return [...pendingRewards];
  },

  queueReward(rewardId: PremiumRewardType): void {
    // Check if already queued
    if (pendingRewards.some((p) => p.rewardId === rewardId)) {
      return;
    }

    // Check if already granted
    if (grantedRewards.some((g) => g.rewardId === rewardId)) {
      return;
    }

    const pending: PendingReward = {
      rewardId,
      requestedAt: Date.now(),
    };

    pendingRewards.push(pending);
    savePendingRewardToDB(pending).catch((error) => {
      console.error('[RewardAdapter] Failed to save pending reward to DB:', error);
    });

    notifyListeners();
  },

  async processPendingRewards(): Promise<void> {
    if (pendingRewards.length === 0) {
      return;
    }

    isProcessing = true;
    notifyListeners();

    try {
      // Process each pending reward
      const toProcess = [...pendingRewards];
      for (const pending of toProcess) {
        const result = await callGrantRewardEdgeFunction(pending.rewardId);

        if (result.success || result.error === 'already_granted') {
          // Remove from pending
          const index = pendingRewards.findIndex((p) => p.rewardId === pending.rewardId);
          if (index !== -1) {
            pendingRewards.splice(index, 1);
          }
          await removePendingRewardFromDB(pending.rewardId);

          // Add to granted if successful
          if (result.success) {
            grantedRewards.push({
              rewardId: pending.rewardId,
              grantedAt: new Date(),
              expiresAt: result.expiresAt,
            });
          }
        }
        // If error is network_error or not_eligible, keep in queue for retry
      }
    } finally {
      isProcessing = false;
      notifyListeners();
    }
  },

  async hasReward(rewardId: PremiumRewardType): Promise<boolean> {
    // Check local cache first
    if (grantedRewards.some((g) => g.rewardId === rewardId)) {
      return true;
    }

    // Refresh from server
    await this.refresh();
    return grantedRewards.some((g) => g.rewardId === rewardId);
  },

  subscribe(listener: RewardStateListener): () => void {
    listeners.add(listener);

    // Defer initial notification to break synchronous cycles
    // This prevents: subscribe → notify → invalidate → refetch → subscribe loops
    const currentState: RewardState = {
      grantedRewards: [...grantedRewards],
      pendingRewards: [...pendingRewards],
      isProcessing,
    };
    setTimeout(() => {
      // Only notify if still subscribed
      if (listeners.has(listener)) {
        listener(currentState);
      }
    }, 0);

    return () => {
      listeners.delete(listener);
    };
  },

  async refresh(): Promise<void> {
    grantedRewards = await fetchGrantedRewardsFromServer();
    await loadPendingRewardsFromDB();
    notifyListeners();
  },
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Configure reward adapter to use an injected PersistencePort (preferred).
 */
export function createRewardAdapter(persistence: PersistencePort): RewardPort {
  activePersistence = persistence;
  return rewardAdapter;
}

/**
 * Initialize the reward adapter.
 * Loads pending rewards from local DB.
 */
export async function initRewardAdapter(): Promise<void> {
  await loadPendingRewardsFromDB();
  // Fetch granted rewards from server (async, non-blocking)
  fetchGrantedRewardsFromServer()
    .then((rewards) => {
      grantedRewards = rewards;
      notifyListeners();
    })
    .catch((error) => {
      console.error('[RewardAdapter] Failed to fetch granted rewards on init:', error);
    });
}

/**
 * Reset the reward adapter state (for logout).
 */
export function resetRewardAdapter(): void {
  grantedRewards = [];
  pendingRewards = [];
  isProcessing = false;
  notifyListeners();
}

// =============================================================================
// Noop Adapter (when Supabase not configured)
// =============================================================================

export const noopRewardAdapter: RewardPort = {
  getState(): RewardState {
    return { grantedRewards: [], pendingRewards: [], isProcessing: false };
  },

  async grantReward(_rewardId: PremiumRewardType): Promise<RewardGrantResult> {
    return { success: true, expiresAt: null };
  },

  async getGrantedRewards(): Promise<GrantedReward[]> {
    return [];
  },

  getPendingRewards(): PendingReward[] {
    return [];
  },

  queueReward(_rewardId: PremiumRewardType): void {
    // No-op
  },

  async processPendingRewards(): Promise<void> {
    // No-op
  },

  async hasReward(_rewardId: PremiumRewardType): Promise<boolean> {
    return false;
  },

  subscribe(_listener: RewardStateListener): () => void {
    return () => {};
  },

  async refresh(): Promise<void> {
    // No-op
  },
};
