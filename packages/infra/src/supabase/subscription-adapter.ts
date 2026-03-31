/**
 * Supabase Subscription Adapter
 *
 * Implements SubscriptionPort using Supabase.
 */

import type {
  PaymentProvider,
  PlanType,
  Subscription,
  SubscriptionListener,
  SubscriptionPort,
  SubscriptionState,
  SubscriptionStatus,
} from '@neurodual/logic';
import {
  calculateDaysRemaining,
  planHasCloudSync,
  planHasPremiumAccess,
  PREMIUM_N_THRESHOLD,
  safeParseWithLog,
  SubscriptionRowSchema,
} from '@neurodual/logic';
import { getSupabase } from './client';
import { subscriptionLog } from '../logger';
import type { Tables } from './types';

// =============================================================================
// Helpers
// =============================================================================

function mapSubscriptionRow(row: Tables<'subscriptions'>): Subscription {
  return {
    id: row.id,
    userId: row.user_id ?? '',
    planType: row.plan_type as PlanType,
    status: row.status as SubscriptionStatus,
    startedAt: row.started_at ? new Date(row.started_at) : new Date(),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    paymentProvider: row.payment_provider as PaymentProvider | null,
  };
}

function buildSubscriptionState(subscription: Subscription | null): SubscriptionState {
  if (!subscription) {
    return {
      subscription: null,
      hasPremiumAccess: false,
      hasCloudSync: false,
      isTrialing: false,
      daysRemaining: null,
    };
  }

  const hasPremium = planHasPremiumAccess(subscription.planType, subscription.status);
  const hasSync = planHasCloudSync(subscription.planType, subscription.status);

  return {
    subscription,
    hasPremiumAccess: hasPremium,
    hasCloudSync: hasSync,
    isTrialing: subscription.status === 'trial',
    daysRemaining: calculateDaysRemaining(subscription.expiresAt),
  };
}

// =============================================================================
// Adapter State
// =============================================================================

let currentState: SubscriptionState = {
  subscription: null,
  hasPremiumAccess: false,
  hasCloudSync: false,
  isTrialing: false,
  daysRemaining: null,
};

const listeners = new Set<SubscriptionListener>();

function setState(newState: SubscriptionState): void {
  const hadCloudSync = currentState.hasCloudSync;
  currentState = newState;

  // Log sync status changes (orchestration handled by SystemProvider)
  if (newState.hasCloudSync && !hadCloudSync) {
    subscriptionLog.info('Cloud sync access granted');
  } else if (!newState.hasCloudSync && hadCloudSync) {
    subscriptionLog.info('Cloud sync access revoked');
  }

  for (const listener of listeners) {
    listener(newState);
  }
}

// =============================================================================
// Subscription Fetching
// =============================================================================

async function fetchSubscription(): Promise<Subscription | null> {
  const supabase = getSupabase();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    // No subscription found is not an error - user is on free tier
    if (error?.code !== 'PGRST116') {
      subscriptionLog.error('Failed to fetch subscription:', error);
    }
    return null;
  }

  // Validate subscription data at boundary
  const parseResult = safeParseWithLog(SubscriptionRowSchema, data, 'fetchSubscription');
  if (!parseResult.success) {
    subscriptionLog.error('Invalid subscription data from cloud');
    return null;
  }

  return mapSubscriptionRow(parseResult.data as Tables<'subscriptions'>);
}

// =============================================================================
// Initialize Subscription Listener
// =============================================================================

let initialized = false;
// Generation counter to detect stale callbacks from setTimeout
let authGeneration = 0;
let authSubscription: { unsubscribe: () => void } | null = null;

/**
 * Initialize subscription listener.
 * Listens for auth state changes to refresh subscription.
 *
 * NOTE: We removed Realtime channel for subscriptions to reduce bandwidth/connections.
 * RevenueCat SDK notifies directly on purchase, and we call refresh() after.
 */
function initSubscriptionListener(): void {
  if (initialized) return;
  initialized = true;

  const supabase = getSupabase();

  // Listen for auth state changes to refresh subscription
  // CRITICAL: Use setTimeout to prevent deadlocks with Supabase internal locks (gotrue-js#762)
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Capture generation to detect if auth state changed during setTimeout
    const generation = ++authGeneration;
    const userId = session?.user?.id;

    setTimeout(async () => {
      // Guard: auth state changed during setTimeout - ignore stale callback
      if (generation !== authGeneration) {
        subscriptionLog.debug('Ignoring stale subscription fetch (auth generation changed)');
        return;
      }

      if (userId) {
        // User logged in - fetch subscription
        const subscription = await fetchSubscription();

        // Guard again after async operation
        if (generation !== authGeneration) {
          subscriptionLog.debug('Ignoring stale subscription result (auth generation changed)');
          return;
        }

        setState(buildSubscriptionState(subscription));
      } else {
        // User logged out - reset state
        setState(buildSubscriptionState(null));
      }
    }, 0);
  });
  authSubscription = data.subscription;

  // Initial fetch
  fetchSubscription().then((subscription) => {
    setState(buildSubscriptionState(subscription));
  });
}

// =============================================================================
// Subscription Adapter Implementation
// =============================================================================

export const supabaseSubscriptionAdapter: SubscriptionPort = {
  getState(): SubscriptionState {
    initSubscriptionListener();
    return currentState;
  },

  subscribe(listener: SubscriptionListener): () => void {
    initSubscriptionListener();
    listeners.add(listener);
    // Immediately call with current state
    listener(currentState);
    return () => listeners.delete(listener);
  },

  async refresh(): Promise<void> {
    const subscription = await fetchSubscription();
    setState(buildSubscriptionState(subscription));
  },

  canAccessNLevel(nLevel: number): boolean {
    if (nLevel < PREMIUM_N_THRESHOLD) return true;
    return currentState.hasPremiumAccess;
  },

  canSyncToCloud(): boolean {
    return currentState.hasCloudSync;
  },
};

/**
 * Internal function for testing only.
 * @internal
 */
export function __resetSubscriptionAdapter(): void {
  initialized = false;
  authSubscription?.unsubscribe();
  authSubscription = null;
  currentState = {
    subscription: null,
    hasPremiumAccess: false,
    hasCloudSync: false,
    isTrialing: false,
    daysRemaining: null,
  };
  listeners.clear();
}

const hot = (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose(() => {
    __resetSubscriptionAdapter();
  });
}
