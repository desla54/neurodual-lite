/**
 * Free Subscription Adapter
 *
 * Returns always-premium state for free + donations model.
 * All features are unlocked without requiring subscription.
 */

import type { SubscriptionListener, SubscriptionPort, SubscriptionState } from '@neurodual/logic';

const FREE_STATE: SubscriptionState = {
  subscription: null,
  hasPremiumAccess: true,
  hasCloudSync: true,
  isTrialing: false,
  daysRemaining: null,
};

const listeners = new Set<SubscriptionListener>();

export const freeSubscriptionAdapter: SubscriptionPort = {
  getState(): SubscriptionState {
    return FREE_STATE;
  },

  subscribe(listener: SubscriptionListener): () => void {
    listeners.add(listener);
    listener(FREE_STATE);
    return () => listeners.delete(listener);
  },

  async refresh(): Promise<void> {
    // No-op: state never changes
  },

  canAccessNLevel(_nLevel: number): boolean {
    return true; // All N levels unlocked
  },

  canSyncToCloud(): boolean {
    return true; // Cloud sync always available
  },
};
