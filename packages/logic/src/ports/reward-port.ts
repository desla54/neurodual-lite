/**
 * Reward Port
 *
 * Interface for granting XP-based Premium rewards (Train-to-Own system).
 * Handles communication with backend to grant RevenueCat promotional entitlements.
 */

import type { PremiumRewardType } from '../types';

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of a reward grant attempt.
 */
export type RewardGrantResult =
  | { readonly success: true; readonly expiresAt: Date | null }
  | {
      readonly success: false;
      readonly error: 'already_granted' | 'not_eligible' | 'network_error' | 'server_error';
    };

/**
 * A reward waiting to be granted (queued while offline).
 */
export interface PendingReward {
  readonly rewardId: PremiumRewardType;
  readonly requestedAt: number; // timestamp ms
}

/**
 * A reward that has been successfully granted.
 */
export interface GrantedReward {
  readonly rewardId: PremiumRewardType;
  readonly grantedAt: Date;
  readonly expiresAt: Date | null; // null = lifetime
}

// =============================================================================
// Listener Types
// =============================================================================

/**
 * Listener for reward state changes.
 */
export type RewardStateListener = (state: RewardState) => void;

/**
 * Current state of rewards.
 */
export interface RewardState {
  readonly grantedRewards: readonly GrantedReward[];
  readonly pendingRewards: readonly PendingReward[];
  readonly isProcessing: boolean;
}

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for managing XP-based Premium rewards.
 *
 * Flow:
 * 1. User reaches a level threshold (5, 10, 20, 30)
 * 2. UI calls `grantReward(rewardId)`
 * 3. If online: Edge Function validates & grants via RevenueCat
 * 4. If offline: Queued via `queueReward()` for later processing
 * 5. RevenueCat entitlement is refreshed after successful grant
 */
export interface RewardPort {
  /**
   * Get current reward state snapshot.
   */
  getState(): RewardState;

  /**
   * Grant a Premium reward to the current user.
   * Calls the backend Edge Function which validates eligibility and grants via RevenueCat.
   *
   * @param rewardId - The reward type to grant
   * @returns Result indicating success or failure reason
   */
  grantReward(rewardId: PremiumRewardType): Promise<RewardGrantResult>;

  /**
   * Get all rewards that have been granted to the user.
   * Fetched from the `user_rewards` table in Supabase.
   */
  getGrantedRewards(): Promise<GrantedReward[]>;

  /**
   * Get rewards that are queued for granting (offline mode).
   * Stored locally in SQLite.
   */
  getPendingRewards(): PendingReward[];

  /**
   * Queue a reward for later processing (when offline).
   * Will be automatically processed when `processPendingRewards()` is called.
   *
   * @param rewardId - The reward type to queue
   */
  queueReward(rewardId: PremiumRewardType): void;

  /**
   * Process all pending rewards in the queue.
   * Should be called when the app comes back online.
   * Grants each pending reward and removes from queue on success.
   */
  processPendingRewards(): Promise<void>;

  /**
   * Check if a specific reward has been granted.
   *
   * @param rewardId - The reward type to check
   */
  hasReward(rewardId: PremiumRewardType): Promise<boolean>;

  /**
   * Subscribe to reward state changes.
   *
   * @param listener - Callback for state updates
   * @returns Unsubscribe function
   */
  subscribe(listener: RewardStateListener): () => void;

  /**
   * Refresh the granted rewards from the server.
   * Useful after login or sync.
   */
  refresh(): Promise<void>;
}
