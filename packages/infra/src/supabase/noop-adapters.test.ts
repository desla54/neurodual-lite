import { describe, expect, it, mock } from 'bun:test';
import { noopAuthAdapter, noopSyncAdapter, noopSubscriptionAdapter } from './noop-adapters';

describe('noopAuthAdapter', () => {
  describe('getState', () => {
    it('should return unauthenticated state', () => {
      const state = noopAuthAdapter.getState();
      expect(state.status).toBe('unauthenticated');
    });
  });

  describe('subscribe', () => {
    it('should call listener with unauthenticated state', () => {
      const listener = mock(() => {});
      noopAuthAdapter.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ status: 'unauthenticated' });
    });

    it('should return unsubscribe function', () => {
      const listener = mock(() => {});
      const unsubscribe = noopAuthAdapter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('signUp', () => {
    it('should return failure with network_error', async () => {
      const result = await (noopAuthAdapter.signUp as any)('test@example.com', 'password');
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('signIn', () => {
    it('should return failure with network_error', async () => {
      const result = await (noopAuthAdapter.signIn as any)('test@example.com', 'password');
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('signInWithGoogle', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.signInWithGoogle();
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('signInWithApple', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.signInWithApple();
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('signOut', () => {
    it('should complete without error', async () => {
      await expect(noopAuthAdapter.signOut()).resolves.toBeUndefined();
    });
  });

  describe('updateProfile', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.updateProfile({});
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('resetPassword', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.resetPassword('test@example.com');
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('updatePassword', () => {
    it('should return failure with network_error', async () => {
      const result = await (noopAuthAdapter.updatePassword as any)('oldpass', 'newpass');
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('refreshSession', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.refreshSession();
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });

  describe('validateSession', () => {
    it('should return false', async () => {
      const result = await noopAuthAdapter.validateSession();
      expect(result).toBe(false);
    });
  });

  describe('getAccessToken', () => {
    it('should return null', () => {
      const token = noopAuthAdapter.getAccessToken();
      expect(token).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('should return failure with network_error', async () => {
      const result = await noopAuthAdapter.deleteAccount();
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('network_error');
    });
  });
});

describe('noopSyncAdapter', () => {
  describe('getState', () => {
    it('should return disabled state', () => {
      const state = noopSyncAdapter.getState();
      expect(state.status).toBe('disabled');
    });

    it('should return not available', () => {
      const state = noopSyncAdapter.getState();
      expect(state.isAvailable).toBe(false);
    });

    it('should have no pending count', () => {
      const state = noopSyncAdapter.getState();
      expect(state.pendingCount).toBe(0);
    });

    it('should have no last sync', () => {
      const state = noopSyncAdapter.getState();
      expect(state.lastSyncAt).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should call listener with disabled state', () => {
      const listener = mock(() => {});
      noopSyncAdapter.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0];
      expect((state as any).status).toBe('disabled');
    });

    it('should return unsubscribe function', () => {
      const listener = mock(() => {});
      const unsubscribe = noopSyncAdapter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('sync', () => {
    it('should return failure', async () => {
      const result = await noopSyncAdapter.sync();
      expect(result.success).toBe(false);
    });

    it('should return zero counts', async () => {
      const result = await noopSyncAdapter.sync();
      expect(result.pushedCount).toBe(0);
      expect(result.pulledCount).toBe(0);
    });

    it('should return error message', async () => {
      const result = await noopSyncAdapter.sync();
      expect(result.errorMessage).toBe('Sync not configured');
    });
  });

  describe('setAutoSync', () => {
    it('should not throw', () => {
      expect(() => noopSyncAdapter.setAutoSync(true)).not.toThrow();
    });
  });

  describe('isAutoSyncEnabled', () => {
    it('should return false', () => {
      expect(noopSyncAdapter.isAutoSyncEnabled()).toBe(false);
    });
  });

  describe('getUnsyncedEvents', () => {
    it('should return empty array', async () => {
      const events = await noopSyncAdapter.getUnsyncedEvents();
      expect(events).toEqual([]);
    });
  });

  describe('refreshPendingCount', () => {
    it('should complete without error', async () => {
      await expect(noopSyncAdapter.refreshPendingCount()).resolves.toBeUndefined();
    });
  });
});

describe('noopSubscriptionAdapter', () => {
  describe('getState', () => {
    it('should return no premium access', () => {
      const state = noopSubscriptionAdapter.getState();
      expect(state.hasPremiumAccess).toBe(false);
    });

    it('should return no cloud sync', () => {
      const state = noopSubscriptionAdapter.getState();
      expect(state.hasCloudSync).toBe(false);
    });

    it('should return no subscription', () => {
      const state = noopSubscriptionAdapter.getState();
      expect(state.subscription).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should call listener with no premium state', () => {
      const listener = mock(() => {});
      noopSubscriptionAdapter.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      const state = (listener!.mock.calls as any)[0][0];
      expect((state as any).hasPremiumAccess).toBe(false);
    });

    it('should return unsubscribe function', () => {
      const listener = mock(() => {});
      const unsubscribe = noopSubscriptionAdapter.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('refresh', () => {
    it('should complete without error', async () => {
      await expect(noopSubscriptionAdapter.refresh()).resolves.toBeUndefined();
    });
  });

  describe('canAccessNLevel', () => {
    it('should allow N1 to N4', () => {
      expect(noopSubscriptionAdapter.canAccessNLevel(1)).toBe(true);
      expect(noopSubscriptionAdapter.canAccessNLevel(2)).toBe(true);
      expect(noopSubscriptionAdapter.canAccessNLevel(3)).toBe(true);
      expect(noopSubscriptionAdapter.canAccessNLevel(4)).toBe(true);
    });

    it('should deny N5 and above', () => {
      expect(noopSubscriptionAdapter.canAccessNLevel(5)).toBe(false);
      expect(noopSubscriptionAdapter.canAccessNLevel(10)).toBe(false);
    });
  });

  describe('canSyncToCloud', () => {
    it('should return false', () => {
      expect(noopSubscriptionAdapter.canSyncToCloud()).toBe(false);
    });
  });
});
