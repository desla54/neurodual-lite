/**
 * Noop adapters for NeuroDual Lite — cloud features removed.
 * These stubs satisfy type contracts without requiring cloud infrastructure.
 */

import type {
  AuthPort,
  SubscriptionPort,
  SyncPort,
  RewardPort,
  SettingsSyncPort,
  OAuthCallbackPort,
} from '@neurodual/logic';

/** Auth adapter that always reports unauthenticated */
export const noopAuthAdapter: AuthPort = {
  getUser: () => null,
  getAccessToken: async () => null,
  signIn: async () => ({ error: 'Auth not available in Lite' }),
  signUp: async () => ({ error: 'Auth not available in Lite' }),
  signOut: async () => {},
  onAuthStateChange: () => ({ unsubscribe: () => {} }),
  deleteAccount: async () => {},
  subscribe: () => () => {},
  getState: () => ({ user: null, session: null, isAuthenticated: false, isLoading: false }),
} as unknown as AuthPort;

/** Subscription adapter that always returns premium (everything free in Lite) */
export const freeSubscriptionAdapter: SubscriptionPort = {
  hasPremiumAccess: () => true,
  getSubscriptionStatus: () => 'free',
  onSubscriptionChange: () => ({ unsubscribe: () => {} }),
  subscribe: () => () => {},
  getState: () => ({
    status: 'free',
    hasPremiumAccess: true,
    canAccessNLevel: () => true,
    canSyncToCloud: false,
  }),
} as unknown as SubscriptionPort;

/** Sync adapter that never syncs */
export const noopSyncAdapter: SyncPort = {
  sync: async () => {},
  getStatus: () => ({ connected: false, uploading: false, downloading: false }),
  onStatusChange: () => ({ unsubscribe: () => {} }),
  subscribe: () => () => {},
  getState: () => ({ connected: false, uploading: false, downloading: false }),
} as unknown as SyncPort;

/** Reward adapter with no rewards */
export const noopRewardAdapter: RewardPort = {
  getRewards: () => [],
  getGrantedRewards: async () => [],
  getPendingRewards: () => [],
  grantReward: async () => ({ success: false, error: 'not available' }),
  queueReward: () => {},
  processPendingRewards: async () => {},
  claimReward: async () => {},
  onRewardChange: () => ({ unsubscribe: () => {} }),
  subscribe: () => () => {},
  getState: () => ({ rewards: [], pending: [] }),
} as unknown as RewardPort;

/** Settings sync adapter (noop — local only) */
export const settingsSyncAdapter: SettingsSyncPort = {
  pullSettings: async () => null,
  pushSettings: async () => {},
} as unknown as SettingsSyncPort;

/** OAuth callback adapter (noop — no OAuth in Lite) */
export const oauthCallbackAdapter: OAuthCallbackPort = {
  handleCallback: async () => {},
} as unknown as OAuthCallbackPort;
