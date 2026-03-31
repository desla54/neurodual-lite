/**
 * No-Op Adapters
 *
 * Stub implementations of AuthPort, SyncPort, SubscriptionPort.
 * Used when Supabase is not configured (missing env vars).
 * Allows the app to run in offline/local mode without crashing.
 */

import type {
  AuthPort,
  AuthResult,
  AuthSession,
  AuthState,
  AuthStateListener,
  AuthUserProfile,
  SubscriptionPort,
  SubscriptionState,
  SubscriptionListener,
  SyncPort,
  SyncResult,
  SyncState,
  SyncStateListener,
  GameEvent,
} from '@neurodual/logic';

// =============================================================================
// No-Op Auth Adapter
// =============================================================================

const noopAuthState: AuthState = { status: 'unauthenticated' };
const noopAuthListeners = new Set<AuthStateListener>();

export const noopAuthAdapter: AuthPort = {
  getState(): AuthState {
    return noopAuthState;
  },

  subscribe(listener: AuthStateListener): () => void {
    noopAuthListeners.add(listener);
    listener(noopAuthState);
    return () => noopAuthListeners.delete(listener);
  },

  async signUp(): Promise<AuthResult<AuthSession>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async signIn(): Promise<AuthResult<AuthSession>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async signInWithGoogle(): Promise<AuthResult<AuthSession>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async signInWithApple(): Promise<AuthResult<AuthSession>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async signOut(): Promise<void> {
    // No-op
  },

  async updateProfile(): Promise<AuthResult<AuthUserProfile>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async resetPassword(_email: string, _captchaToken?: string): Promise<AuthResult<void>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async updatePassword(): Promise<AuthResult<void>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },

  async validateSession(): Promise<boolean> {
    return false; // Always invalid in no-op mode
  },

  getAccessToken(): string | null {
    return null; // No token in no-op mode
  },

  async deleteAccount(): Promise<AuthResult<void>> {
    return {
      success: false,
      error: { code: 'network_error', message: 'Auth not configured' },
    };
  },
};

// =============================================================================
// No-Op Sync Adapter
// =============================================================================

const noopSyncState: SyncState = {
  status: 'disabled',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  isAvailable: false,
};
const noopSyncListeners = new Set<SyncStateListener>();

export const noopSyncAdapter: SyncPort = {
  getState(): SyncState {
    return noopSyncState;
  },

  subscribe(listener: SyncStateListener): () => void {
    noopSyncListeners.add(listener);
    listener(noopSyncState);
    return () => noopSyncListeners.delete(listener);
  },

  async sync(): Promise<SyncResult> {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      errorMessage: 'Sync not configured',
    };
  },

  setAutoSync(): void {
    // No-op
  },

  isAutoSyncEnabled(): boolean {
    return false;
  },

  async getUnsyncedEvents(): Promise<GameEvent[]> {
    return [];
  },

  async refreshPendingCount(): Promise<void> {
    // No-op
  },
};

// =============================================================================
// No-Op Subscription Adapter
// =============================================================================

const noopSubscriptionState: SubscriptionState = {
  subscription: null,
  hasPremiumAccess: false,
  hasCloudSync: false,
  isTrialing: false,
  daysRemaining: null,
};
const noopSubscriptionListeners = new Set<SubscriptionListener>();

export const noopSubscriptionAdapter: SubscriptionPort = {
  getState(): SubscriptionState {
    return noopSubscriptionState;
  },

  subscribe(listener: SubscriptionListener): () => void {
    noopSubscriptionListeners.add(listener);
    listener(noopSubscriptionState);
    return () => noopSubscriptionListeners.delete(listener);
  },

  async refresh(): Promise<void> {
    // No-op
  },

  canAccessNLevel(nLevel: number): boolean {
    // Free tier: N1-N4 only
    return nLevel <= 4;
  },

  canSyncToCloud(): boolean {
    return false;
  },
};
