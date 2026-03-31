/**
 * Settings Sync Service Tests
 *
 * Tests for the settings synchronization with Supabase.
 * Covers: push, pull, bidirectional sync, auth checks, subscription checks.
 */

import { describe, expect, test, beforeEach, afterAll, mock } from 'bun:test';
import type { SettingsData } from './settings-sync-service';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock subscription adapter
const mockSubscriptionState = {
  subscription: null,
  hasPremiumAccess: false,
  hasCloudSync: true,
  isTrialing: false,
  daysRemaining: null,
};

mock.module('./subscription-adapter', () => ({
  supabaseSubscriptionAdapter: {
    getState: () => mockSubscriptionState,
    subscribe: (listener: (state: typeof mockSubscriptionState) => void) => {
      listener(mockSubscriptionState);
      return () => {};
    },
    refresh: () => Promise.resolve(),
    canAccessNLevel: (n: number) => n < 4 || mockSubscriptionState.hasPremiumAccess,
    canSyncToCloud: () => mockSubscriptionState.hasCloudSync,
  },
  __resetSubscriptionAdapter: () => {},
}));

interface SupabaseResponse<T = any> {
  data: T | null;
  error: { message: string } | null;
}

// Mock Supabase response data
const mockSupabaseResponse: SupabaseResponse = {
  data: null,
  error: null,
};

// Mock Supabase client - will be reset in resetMocks()
let mockGetUser: import('bun:test').Mock<() => Promise<any>>;
let mockFrom: import('bun:test').Mock<(table: string) => any>;
let mockRpc: import('bun:test').Mock<(fn: string, params: any) => Promise<any>>;

// Mock RPC response (separate from from() response)
const mockRpcResponse: SupabaseResponse<boolean> = {
  data: true,
  error: null,
};

interface MockSupabase {
  auth: {
    getUser: import('bun:test').Mock<() => Promise<any>>;
  };
  from: import('bun:test').Mock<(table: string) => any>;
  rpc: import('bun:test').Mock<(fn: string, params: any) => Promise<any>>;
}

const mockSupabase: MockSupabase = {
  auth: {
    getUser: mock(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })),
  },
  from: mock(() => ({})),
  rpc: mock(() => Promise.resolve({ data: true, error: null })),
};

mock.module('./client', () => ({
  getSupabase: () => mockSupabase,
}));

// Note: We don't mock @neurodual/logic to avoid polluting other tests.
// The actual safeParseWithLog is used, which is fine since we control the input data.

// Import after mocking
import {
  pushSettings,
  pullSettings,
  syncSettings,
  migrateCloudSettings,
} from './settings-sync-service';

// =============================================================================
// Test Helpers
// =============================================================================

function resetMocks() {
  mockSubscriptionState.hasCloudSync = true;
  mockSupabaseResponse.data = null;
  mockSupabaseResponse.error = null;
  mockRpcResponse.data = true;
  mockRpcResponse.error = null;

  // Recreate auth.getUser mock
  mockGetUser = mock(() => Promise.resolve({ data: { user: { id: 'user-123' } }, error: null }));
  mockSupabase.auth.getUser = mockGetUser;

  // Recreate from mock with proper chain
  mockFrom = mock((_table: string) => ({
    select: mock((_columns: string) => ({
      eq: mock((_column: string, _value: string) => ({
        single: mock(() => Promise.resolve(mockSupabaseResponse)),
      })),
    })),
    upsert: mock((_data: any) => Promise.resolve(mockSupabaseResponse)),
  }));
  mockSupabase.from = mockFrom;

  // Recreate rpc mock
  mockRpc = mock((_fn: string, _params: any) => Promise.resolve(mockRpcResponse));
  mockSupabase.rpc = mockRpc;
}

function createMockSettings(overrides: Partial<SettingsData> = {}): any {
  return {
    currentMode: 'adaptive',
    modes: {
      adaptive: { difficulty: 2 },
      brainworkshop: { trialsCount: 20 },
    },
    ui: {
      theme: 'dark',
      language: 'fr',
    },
    ...overrides,
  };
}

// =============================================================================
// Push Settings Tests
// =============================================================================

describe('Settings Sync - Push', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('pushSettings succeeds with valid settings', async () => {
    const settings = createMockSettings();
    const localUpdatedAt = Date.now();

    // RPC returns true (was updated)
    mockRpcResponse.data = true;
    mockRpcResponse.error = null;

    const result = await pushSettings(settings, localUpdatedAt);

    expect(result.success).toBe(true);
    expect(result.direction).toBe('pushed');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('upsert_settings_if_newer', expect.any(Object));
  });

  test('pushSettings checks subscription status', async () => {
    mockSubscriptionState.hasCloudSync = false;

    const settings = createMockSettings();
    const result = await pushSettings(settings, Date.now());

    expect(result.success).toBe(false);
    expect(result.direction).toBe('none');
    expect(result.errorMessage).toContain('Cloud sync not available');
  });

  test('pushSettings checks authentication', async () => {
    mockSupabase.auth.getUser.mockImplementation(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );

    const settings = createMockSettings();
    const result = await pushSettings(settings, Date.now());

    expect(result.success).toBe(false);
    expect(result.direction).toBe('none');
    expect(result.errorMessage).toBe('Not authenticated');
  });

  test('pushSettings skips when cloud is newer', async () => {
    const localUpdatedAt = 1000;

    // RPC returns false (cloud was newer, not updated)
    mockRpcResponse.data = false;
    mockRpcResponse.error = null;

    const settings = createMockSettings();
    const result = await pushSettings(settings, localUpdatedAt);

    expect(result.success).toBe(true);
    expect(result.direction).toBe('none');
  });

  test('pushSettings handles rpc error', async () => {
    mockRpcResponse.data = null;
    mockRpcResponse.error = { message: 'Database error' };

    const settings = createMockSettings();
    const result = await pushSettings(settings, Date.now());

    expect(result.success).toBe(false);
    expect(result.direction).toBe('none');
    expect(result.errorMessage).toBe('Database error');
  });

  test('pushSettings catches exceptions', async () => {
    mockSupabase.rpc.mockImplementation(() => {
      throw new Error('Network error');
    });

    const settings = createMockSettings();
    const result = await pushSettings(settings, Date.now());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Network error');
  });
});

// =============================================================================
// Pull Settings Tests
// =============================================================================

describe('Settings Sync - Pull', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('pullSettings returns cloud settings when cloud is newer', async () => {
    const localUpdatedAt = 1000;
    const cloudUpdatedAt = 2000;
    const cloudSettings = createMockSettings({ currentMode: 'brainworkshop' });

    mockSupabaseResponse.data = {
      config: cloudSettings,
      client_updated_at: cloudUpdatedAt,
    };
    mockSupabaseResponse.error = null;

    const result = await pullSettings(localUpdatedAt);

    expect(result).not.toBeNull();
    expect(result!.settings.currentMode).toBe('brainworkshop');
    expect(result!.cloudUpdatedAt).toBe(cloudUpdatedAt);
  });

  test('pullSettings returns null when no cloud settings', async () => {
    mockSupabaseResponse.data = null;
    mockSupabaseResponse.error = { message: 'No rows returned' };

    const result = await pullSettings(Date.now());

    expect(result).toBeNull();
  });

  test('pullSettings returns null when local is newer', async () => {
    const localUpdatedAt = 2000;
    const cloudUpdatedAt = 1000;

    mockSupabaseResponse.data = {
      config: createMockSettings(),
      client_updated_at: cloudUpdatedAt,
    };

    const result = await pullSettings(localUpdatedAt);

    expect(result).toBeNull();
  });

  test('pullSettings returns null when local is equal to cloud', async () => {
    const timestamp = 1500;

    mockSupabaseResponse.data = {
      config: createMockSettings(),
      client_updated_at: timestamp,
    };

    const result = await pullSettings(timestamp);

    expect(result).toBeNull();
  });

  test('pullSettings checks subscription status', async () => {
    mockSubscriptionState.hasCloudSync = false;

    const result = await pullSettings(Date.now());

    expect(result).toBeNull();
  });

  test('pullSettings checks authentication', async () => {
    mockSupabase.auth.getUser.mockImplementation(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );

    const result = await pullSettings(Date.now());

    expect(result).toBeNull();
  });

  test('pullSettings handles missing client_updated_at', async () => {
    mockSupabaseResponse.data = {
      config: createMockSettings(),
      client_updated_at: null,
    };

    const result = await pullSettings(1000);

    // Should treat null as 0, so local (1000) is newer
    expect(result).toBeNull();
  });

  test('pullSettings handles database errors gracefully', async () => {
    // Simulate a database error via the error field (not an exception)
    mockSupabaseResponse.data = null;
    mockSupabaseResponse.error = { message: 'Connection refused' };

    const result = await pullSettings(Date.now());

    // Should return null when there's an error
    expect(result).toBeNull();
  });
});

// =============================================================================
// Bidirectional Sync Tests
// =============================================================================

describe('Settings Sync - Bidirectional', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('syncSettings pulls when cloud is newer', async () => {
    const localUpdatedAt = 1000;
    const cloudUpdatedAt = 2000;
    const cloudSettings = createMockSettings({ currentMode: 'journey' });

    mockSupabaseResponse.data = {
      config: cloudSettings,
      client_updated_at: cloudUpdatedAt,
    };

    let pulledSettings: SettingsData | null = null;
    const onPull = (settings: SettingsData) => {
      pulledSettings = settings;
    };

    const result = await syncSettings(createMockSettings(), localUpdatedAt, onPull);

    expect(result.success).toBe(true);
    expect(result.direction).toBe('pulled');
    expect(pulledSettings).not.toBeNull();
    expect(pulledSettings!.currentMode).toBe('journey');
  });

  test('syncSettings pushes when local is newer', async () => {
    const localUpdatedAt = 2000;
    const cloudUpdatedAt = 1000;

    // Pull returns cloud with older timestamp
    mockSupabaseResponse.data = {
      client_updated_at: cloudUpdatedAt,
    };
    mockSupabaseResponse.error = null;

    // Push via RPC succeeds
    mockRpcResponse.data = true;
    mockRpcResponse.error = null;

    let onPullCalled = false;
    const onPull = () => {
      onPullCalled = true;
    };

    const localSettings = createMockSettings({ currentMode: 'local-mode' });
    const result = await syncSettings(localSettings, localUpdatedAt, onPull);

    expect(result.success).toBe(true);
    expect(result.direction).toBe('pushed');
    expect(onPullCalled).toBe(false);
  });

  test('syncSettings pushes when no cloud data exists', async () => {
    mockSupabaseResponse.data = null;
    mockSupabaseResponse.error = null; // No error, just no data

    // Push via RPC succeeds
    mockRpcResponse.data = true;
    mockRpcResponse.error = null;

    let onPullCalled = false;
    const onPull = () => {
      onPullCalled = true;
    };

    const localSettings = createMockSettings();
    const result = await syncSettings(localSettings, Date.now(), onPull);

    expect(result.direction).toBe('pushed');
    expect(onPullCalled).toBe(false);
  });

  test('syncSettings calls onPull callback when pulling', async () => {
    const cloudSettings = createMockSettings({ currentMode: 'cloud-mode' });
    mockSupabaseResponse.data = {
      config: cloudSettings,
      client_updated_at: 2000,
    };

    const pulledSettings: SettingsData[] = [];
    const onPull = (settings: SettingsData) => {
      pulledSettings.push(settings);
    };

    await syncSettings(createMockSettings(), 1000, onPull);

    expect(pulledSettings.length).toBe(1);
    expect(pulledSettings[0]!.currentMode).toBe('cloud-mode');
  });
});

// =============================================================================
// Last-Write-Wins Strategy Tests
// =============================================================================

describe('Settings Sync - Last-Write-Wins', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('newer timestamp always wins in push', async () => {
    const scenarios = [
      { local: 1000, cloud: 500, shouldPush: true },
      { local: 1000, cloud: 1000, shouldPush: true }, // Equal = push (upsert)
      { local: 1000, cloud: 1500, shouldPush: false },
    ];

    for (const scenario of scenarios) {
      resetMocks();
      // RPC returns true if local was newer (updated), false otherwise
      mockRpcResponse.data = scenario.shouldPush;
      mockRpcResponse.error = null;

      const result = await pushSettings(createMockSettings(), scenario.local);

      if (scenario.shouldPush) {
        expect(result.direction).toBe('pushed');
      } else {
        expect(result.direction).toBe('none');
      }
    }
  });

  test('newer timestamp always wins in pull', async () => {
    const scenarios = [
      { local: 1000, cloud: 500, shouldPull: false },
      { local: 1000, cloud: 1000, shouldPull: false },
      { local: 1000, cloud: 1500, shouldPull: true },
    ];

    for (const scenario of scenarios) {
      resetMocks();
      mockSupabaseResponse.data = {
        config: createMockSettings(),
        client_updated_at: scenario.cloud,
      };

      const result = await pullSettings(scenario.local);

      if (scenario.shouldPull) {
        expect(result).not.toBeNull();
      } else {
        expect(result).toBeNull();
      }
    }
  });
});

// =============================================================================
// Integration Scenarios
// =============================================================================

describe('Settings Sync - Integration Scenarios', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('scenario: first sync pushes local settings', async () => {
    // No cloud settings yet
    mockSupabaseResponse.data = null;
    mockSupabaseResponse.error = null;

    const localSettings = createMockSettings();
    const result = await pushSettings(localSettings, Date.now());

    expect(result.success).toBe(true);
    expect(result.direction).toBe('pushed');
  });

  test('scenario: user switches devices, pulls newer settings', async () => {
    const cloudSettings = createMockSettings({ currentMode: 'device2-mode' });
    mockSupabaseResponse.data = {
      config: cloudSettings,
      client_updated_at: 2000,
    };

    const result = await pullSettings(1000);

    expect(result).not.toBeNull();
    expect(result!.settings.currentMode).toBe('device2-mode');
  });

  test('scenario: offline changes pushed when back online', async () => {
    const localSettings = createMockSettings({ currentMode: 'offline-changes' });
    mockSupabaseResponse.data = {
      client_updated_at: 1000,
    };

    const result = await pushSettings(localSettings, 2000);

    expect(result.success).toBe(true);
    expect(result.direction).toBe('pushed');
  });

  test('scenario: free user cannot sync', async () => {
    mockSubscriptionState.hasCloudSync = false;

    const result = await pushSettings(createMockSettings(), Date.now());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Cloud sync not available');
  });

  test('scenario: logged out user cannot sync', async () => {
    mockSupabase.auth.getUser.mockImplementation(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );

    const result = await pushSettings(createMockSettings(), Date.now());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Not authenticated');
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Settings Sync - Validation', () => {
  /**
   * Note: Old mode ID migration (adaptive → dual-tempo, etc.) is now done
   * server-side via SQL migration. Client code only validates structure.
   */

  test('migrateCloudSettings handles modern format (already correct)', () => {
    const modernSettings = {
      currentMode: 'dual-catch',
      modes: {
        'dual-catch': { algorithm: 'adaptive' },
        custom: { nLevel: 3 },
      },
      ui: {
        soundEnabled: true,
        language: 'fr',
      },
    };

    const result = migrateCloudSettings(modernSettings);

    expect(result).not.toBeNull();
    expect(result!.currentMode).toBe('dual-catch');
    expect(result!.modes['dual-catch']).toEqual({ algorithm: 'adaptive' });
    expect(result!.ui.soundEnabled).toBe(true);
  });

  test('migrateCloudSettings preserves mode IDs as-is (migration done server-side)', () => {
    // Server-side SQL migration handles old→new ID conversion.
    // Client code preserves whatever IDs come from the cloud.
    const settings = {
      currentMode: 'dual-memo',
      modes: {
        'dual-catch': { algorithm: 'rules-v1' },
        'dual-memo': { trialsCount: 10 },
      },
      ui: { language: 'en' },
    };

    const result = migrateCloudSettings(settings);

    expect(result).not.toBeNull();
    expect(result!.currentMode).toBe('dual-memo');
    expect(result!.modes['dual-catch']).toEqual({ algorithm: 'rules-v1' });
    expect(result!.modes['dual-memo']).toEqual({ trialsCount: 10 });
  });

  test('migrateCloudSettings fills missing UI defaults', () => {
    const partialSettings = {
      currentMode: 'dual-catch',
      modes: {},
      ui: { language: 'en' }, // Only language set
    };

    const result = migrateCloudSettings(partialSettings);

    expect(result).not.toBeNull();
    // Should have all defaults merged
    expect(result!.ui.language).toBe('en'); // Preserved
    expect(result!.ui.soundEnabled).toBe(false); // Default
    expect(result!.ui.stimulusStyle).toBe('full'); // Default
    expect(result!.ui.journeyActive).toBe(true); // Default
  });

  test('migrateCloudSettings handles partial format (currentMode only)', () => {
    const partialSettings = {
      currentMode: 'dual-place',
    };

    const result = migrateCloudSettings(partialSettings);

    expect(result).not.toBeNull();
    expect(result!.currentMode).toBe('dual-place');
    expect(result!.modes).toEqual({});
    expect(result!.ui.soundEnabled).toBe(false); // Default
  });

  test('migrateCloudSettings returns defaults for unknown format', () => {
    const unknownSettings = {
      randomField: 'value',
      anotherField: 123,
    };

    const result = migrateCloudSettings(unknownSettings);

    expect(result).not.toBeNull();
    expect(result!.currentMode).toBe('dual-catch');
    expect(result!.modes).toEqual({});
    expect(result!.ui.soundEnabled).toBe(false);
  });

  test('migrateCloudSettings returns null for non-object data', () => {
    expect(migrateCloudSettings(null)).toBeNull();
    expect(migrateCloudSettings(undefined)).toBeNull();
    expect(migrateCloudSettings('string')).toBeNull();
    expect(migrateCloudSettings(123)).toBeNull();
  });

  test('pullSettings integrates validation', async () => {
    resetMocks();

    const cloudSettings = {
      currentMode: 'dual-catch',
      modes: { 'dual-catch': { algorithm: 'rules-v1' } },
      ui: { stimulusStyle: 'full', soundEnabled: true },
    };

    mockSupabaseResponse.data = {
      config: cloudSettings,
      client_updated_at: 2000,
    };

    const result = await pullSettings(1000);

    expect(result).not.toBeNull();
    expect(result!.settings.currentMode).toBe('dual-catch');
    expect(result!.settings.modes['dual-catch']?.algorithm).toBe('rules-v1');
    expect(result!.settings.ui.stimulusStyle).toBe('full');
  });
});

// =============================================================================
// Cleanup
// =============================================================================

afterAll(() => {
  mock.restore();
});
