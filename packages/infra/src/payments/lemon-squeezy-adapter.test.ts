/**
 * Lemon Squeezy Adapter Tests
 *
 * Tests for the license key adapter using Lemon Squeezy API.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { LicenseState } from '@neurodual/logic';
import { createEmptyLicenseState } from '@neurodual/logic';

// =============================================================================
// Module Mocks (must be before imports of the module under test)
// =============================================================================

let mockCapacitorPlatform = 'web';

mock.module('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => mockCapacitorPlatform,
  },
}));

mock.module('../logger', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

// localStorage mock
const localStorageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  removeItem: (key: string) => localStorageMap.delete(key),
  clear: () => localStorageMap.clear(),
  get length() {
    return localStorageMap.size;
  },
  key: (_index: number) => null as string | null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// matchMedia mock (for dark mode check in getCheckoutUrl)
Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  },
  writable: true,
  configurable: true,
});

// =============================================================================
// Import module under test (after mocks)
// =============================================================================

import {
  __resetLemonSqueezyAdapter,
  configureLemonSqueezy,
  lemonSqueezyAdapter,
} from './lemon-squeezy-adapter';

// =============================================================================
// Fetch Mock Helpers
// =============================================================================

function mockFetchResponse(body: unknown, status = 200) {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  ) as unknown as typeof fetch;
}

function makeValidLSResponse(overrides?: Record<string, unknown>) {
  return {
    valid: true,
    license_key: {
      id: 12345,
      status: 'active',
      key: 'ABCD-1234-EFGH-5678-IJKL',
      activation_limit: 5,
      activation_usage: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2027-01-01T00:00:00.000Z',
    },
    instance: {
      id: 'inst-abc-123',
      name: 'Web',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    meta: {
      store_id: 1,
      order_id: 100,
      order_item_id: 200,
      product_id: 300,
      product_name: 'Neurodual Premium',
      variant_id: 400,
      variant_name: 'Annuel',
      customer_id: 500,
      customer_name: 'Test User',
      customer_email: 'test@example.com',
    },
    ...overrides,
  };
}

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  __resetLemonSqueezyAdapter();
  localStorageMap.clear();
  mockCapacitorPlatform = 'web';
});

afterEach(() => {
  // Restore fetch
  if ('fetch' in globalThis) {
    // Will be overwritten each test anyway
  }
});

// =============================================================================
// configureLemonSqueezy
// =============================================================================

describe('configureLemonSqueezy', () => {
  test('sets config for the adapter', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-annual-1' },
    });

    // Verify config was applied by calling getProducts (depends on config)
    const products = await lemonSqueezyAdapter.getProducts();
    expect(products.length).toBe(1);
    expect(products[0]!.variantId).toBe('var-annual-1');
  });
});

// =============================================================================
// validateLicense
// =============================================================================

describe('validateLicense', () => {
  test('returns valid result for a valid license key', async () => {
    mockFetchResponse(makeValidLSResponse());

    const result = await lemonSqueezyAdapter.validateLicense('ABCD-1234-EFGH-5678-IJKL');

    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
    expect(result.customerEmail).toBe('test@example.com');
    expect(result.customerName).toBe('Test User');
    expect(result.productName).toBe('Neurodual Premium');
    expect(result.activationsUsed).toBe(1);
    expect(result.activationsLimit).toBe(5);
    expect(result.licenseKeyMasked).toBe('ABCD...IJKL');
  });

  test('returns invalid result for an invalid license key', async () => {
    mockFetchResponse({ valid: false, error: 'License key not found' });

    const result = await lemonSqueezyAdapter.validateLicense('BAD-KEY');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('inactive');
    expect(result.error).toBe('License key not found');
  });

  test('handles fetch error gracefully', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error')),
    ) as unknown as typeof fetch;

    const result = await lemonSqueezyAdapter.validateLicense('ANY-KEY');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Network error');
  });

  test('handles non-ok HTTP response', async () => {
    mockFetchResponse({ error: 'Unauthorized' }, 401);

    const result = await lemonSqueezyAdapter.validateLicense('ANY-KEY');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('inactive');
  });

  test('returns error on non-web platform', async () => {
    mockCapacitorPlatform = 'android';

    const result = await lemonSqueezyAdapter.validateLicense('ANY-KEY');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('only available on web');
  });

  test('sets isValidating during validation', async () => {
    const states: LicenseState[] = [];
    lemonSqueezyAdapter.subscribe((s) => states.push({ ...s }));

    // Clear initial subscription callback state
    states.length = 0;

    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.validateLicense('KEY');

    // Should have captured isValidating=true then isValidating=false
    expect(states.some((s) => s.isValidating)).toBe(true);
    expect(states[states.length - 1]!.isValidating).toBe(false);
  });
});

// =============================================================================
// activateLicense
// =============================================================================

describe('activateLicense', () => {
  test('activates and stores key + instanceId', async () => {
    mockFetchResponse(makeValidLSResponse());

    const result = await lemonSqueezyAdapter.activateLicense('ABCD-1234-EFGH-5678-IJKL');

    expect(result.activated).toBe(true);
    expect(result.instanceId).toBe('inst-abc-123');
    expect(result.license?.valid).toBe(true);

    // State should reflect activation
    const state = lemonSqueezyAdapter.getState();
    expect(state.hasValidLicense).toBe(true);
    expect(state.storedLicenseKey).toBe('ABCD-1234-EFGH-5678-IJKL');
    expect(state.instanceId).toBe('inst-abc-123');

    // Should be stored in localStorage
    expect(localStorageMap.get('neurodual_license_key')).toBe('ABCD-1234-EFGH-5678-IJKL');
    expect(localStorageMap.get('neurodual_license_instance')).toBe('inst-abc-123');
  });

  test('returns error when activation fails', async () => {
    mockFetchResponse({
      valid: false,
      error: 'Activation limit reached',
    });

    const result = await lemonSqueezyAdapter.activateLicense('KEY');

    expect(result.activated).toBe(false);
    expect(result.error).toBe('Activation limit reached');
  });

  test('returns error on non-web platform', async () => {
    mockCapacitorPlatform = 'ios';

    const result = await lemonSqueezyAdapter.activateLicense('KEY');

    expect(result.activated).toBe(false);
    expect(result.error).toContain('only available on web');
  });

  test('handles fetch error gracefully', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Timeout'))) as unknown as typeof fetch;

    const result = await lemonSqueezyAdapter.activateLicense('KEY');

    expect(result.activated).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});

// =============================================================================
// deactivateLicense
// =============================================================================

describe('deactivateLicense', () => {
  test('clears stored state after deactivation', async () => {
    // First activate
    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('ABCD-1234-EFGH-5678-IJKL');

    // Confirm stored
    expect(localStorageMap.has('neurodual_license_key')).toBe(true);

    // Now deactivate
    mockFetchResponse({ valid: true });
    const result = await lemonSqueezyAdapter.deactivateLicense();

    expect(result.deactivated).toBe(true);

    // State should be empty
    const state = lemonSqueezyAdapter.getState();
    expect(state.hasValidLicense).toBe(false);
    expect(state.storedLicenseKey).toBeNull();
    expect(state.instanceId).toBeNull();

    // localStorage should be cleared
    expect(localStorageMap.has('neurodual_license_key')).toBe(false);
    expect(localStorageMap.has('neurodual_license_instance')).toBe(false);
  });

  test('returns error when no license stored', async () => {
    const result = await lemonSqueezyAdapter.deactivateLicense();

    expect(result.deactivated).toBe(false);
    expect(result.error).toContain('No license to deactivate');
  });

  test('clears local state even when API fails', async () => {
    // Store a license manually
    localStorageMap.set('neurodual_license_key', 'SOME-KEY');
    localStorageMap.set('neurodual_license_instance', 'SOME-INST');

    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network down')),
    ) as unknown as typeof fetch;

    const result = await lemonSqueezyAdapter.deactivateLicense();

    // Should still deactivate locally
    expect(result.deactivated).toBe(true);
    expect(localStorageMap.has('neurodual_license_key')).toBe(false);
    expect(localStorageMap.has('neurodual_license_instance')).toBe(false);
  });

  test('returns error on non-web platform', async () => {
    mockCapacitorPlatform = 'android';

    const result = await lemonSqueezyAdapter.deactivateLicense();

    expect(result.deactivated).toBe(false);
    expect(result.error).toContain('only available on web');
  });
});

// =============================================================================
// getCheckoutUrl
// =============================================================================

describe('getCheckoutUrl', () => {
  test('throws when not configured', async () => {
    expect(lemonSqueezyAdapter.getCheckoutUrl('variant-1')).rejects.toThrow(
      'Lemon Squeezy not configured',
    );
  });

  test('builds correct base URL', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });

    const result = await lemonSqueezyAdapter.getCheckoutUrl('var-1');

    expect(result.url).toContain('https://mystore.lemonsqueezy.com/checkout/buy/var-1');
    // Should include embed param
    expect(result.url).toContain('embed=1');
  });

  test('includes email and name parameters', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });

    const result = await lemonSqueezyAdapter.getCheckoutUrl('var-1', {
      email: 'user@example.com',
      name: 'Test User',
    });

    expect(result.url).toContain('checkout%5Bemail%5D=user%40example.com');
    expect(result.url).toContain('checkout%5Bname%5D=Test+User');
  });

  test('includes discount code', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });

    const result = await lemonSqueezyAdapter.getCheckoutUrl('var-1', {
      discountCode: 'SAVE20',
    });

    expect(result.url).toContain('checkout%5Bdiscount_code%5D=SAVE20');
  });

  test('includes custom data', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });

    const result = await lemonSqueezyAdapter.getCheckoutUrl('var-1', {
      customData: { user_id: 'abc-123' },
    });

    expect(result.url).toContain('checkout%5Bcustom%5D%5Buser_id%5D=abc-123');
  });
});

// =============================================================================
// getProducts
// =============================================================================

describe('getProducts', () => {
  test('returns empty array when not configured', async () => {
    const products = await lemonSqueezyAdapter.getProducts();
    expect(products).toEqual([]);
  });

  test('returns annual product from config', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-annual-1' },
    });

    const products = await lemonSqueezyAdapter.getProducts();

    expect(products.length).toBe(1);
    expect(products[0]!.variantId).toBe('var-annual-1');
    expect(products[0]!.isSubscription).toBe(true);
    expect(products[0]!.interval).toBe('year');
    expect(products[0]!.priceCents).toBe(2499);
    expect(products[0]!.currencyCode).toBe('EUR');
  });

  test('includes lifetime product when configured', async () => {
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-annual-1', lifetime: 'var-lifetime-1' },
    });

    const products = await lemonSqueezyAdapter.getProducts();

    expect(products.length).toBe(2);
    expect(products[1]!.variantId).toBe('var-lifetime-1');
    expect(products[1]!.isSubscription).toBe(false);
    expect(products[1]!.priceCents).toBe(5999);
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe('isAvailable', () => {
  test('returns true on web platform', () => {
    mockCapacitorPlatform = 'web';
    expect(lemonSqueezyAdapter.isAvailable()).toBe(true);
  });

  test('returns false on android', () => {
    mockCapacitorPlatform = 'android';
    expect(lemonSqueezyAdapter.isAvailable()).toBe(false);
  });

  test('returns false on ios', () => {
    mockCapacitorPlatform = 'ios';
    expect(lemonSqueezyAdapter.isAvailable()).toBe(false);
  });
});

// =============================================================================
// getState / subscribe
// =============================================================================

describe('getState / subscribe', () => {
  test('initial state is empty license state', () => {
    const state = lemonSqueezyAdapter.getState();
    const empty = createEmptyLicenseState();

    expect(state).toEqual(empty);
  });

  test('subscribe immediately calls listener with current state', () => {
    const received: LicenseState[] = [];
    lemonSqueezyAdapter.subscribe((s) => received.push(s));

    expect(received.length).toBe(1);
    expect(received[0]).toEqual(createEmptyLicenseState());
  });

  test('subscribe notifies listener on state changes', async () => {
    const received: LicenseState[] = [];
    lemonSqueezyAdapter.subscribe((s) => received.push({ ...s }));

    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('KEY');

    // Should have received: initial + isValidating=true + final activated state
    expect(received.length).toBeGreaterThanOrEqual(3);
    const lastState = received[received.length - 1]!;
    expect(lastState.hasValidLicense).toBe(true);
  });

  test('unsubscribe stops notifications', async () => {
    const received: LicenseState[] = [];
    const unsub = lemonSqueezyAdapter.subscribe((s) => received.push({ ...s }));

    unsub();
    const countAfterUnsub = received.length;

    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('KEY');

    // Should not have received more states
    expect(received.length).toBe(countAfterUnsub);
  });

  test('multiple listeners all receive updates', async () => {
    const received1: LicenseState[] = [];
    const received2: LicenseState[] = [];

    lemonSqueezyAdapter.subscribe((s) => received1.push({ ...s }));
    lemonSqueezyAdapter.subscribe((s) => received2.push({ ...s }));

    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('KEY');

    expect(received1.length).toBeGreaterThanOrEqual(3);
    expect(received2.length).toBeGreaterThanOrEqual(3);
  });
});

// =============================================================================
// clearLicense
// =============================================================================

describe('clearLicense', () => {
  test('clears stored key and resets state', async () => {
    // First activate
    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('KEY');
    expect(lemonSqueezyAdapter.getState().hasValidLicense).toBe(true);

    // Clear
    await lemonSqueezyAdapter.clearLicense();

    const state = lemonSqueezyAdapter.getState();
    expect(state.hasValidLicense).toBe(false);
    expect(state.storedLicenseKey).toBeNull();
    expect(state.instanceId).toBeNull();
    expect(localStorageMap.has('neurodual_license_key')).toBe(false);
    expect(localStorageMap.has('neurodual_license_instance')).toBe(false);
  });
});

// =============================================================================
// refreshLicense
// =============================================================================

describe('refreshLicense', () => {
  test('returns null when no stored key', async () => {
    const result = await lemonSqueezyAdapter.refreshLicense();
    expect(result).toBeNull();
  });

  test('returns null on non-web platform', async () => {
    mockCapacitorPlatform = 'ios';
    const result = await lemonSqueezyAdapter.refreshLicense();
    expect(result).toBeNull();
  });

  test('validates stored key and updates state', async () => {
    // Store a key manually
    localStorageMap.set('neurodual_license_key', 'ABCD-1234-EFGH-5678-IJKL');
    localStorageMap.set('neurodual_license_instance', 'inst-abc-123');

    mockFetchResponse(makeValidLSResponse());
    const result = await lemonSqueezyAdapter.refreshLicense();

    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.status).toBe('active');

    const state = lemonSqueezyAdapter.getState();
    expect(state.hasValidLicense).toBe(true);
  });

  test('marks license as invalid when status is not active', async () => {
    localStorageMap.set('neurodual_license_key', 'KEY');

    mockFetchResponse(
      makeValidLSResponse({
        license_key: {
          id: 1,
          status: 'expired',
          key: 'KEY',
          activation_limit: 5,
          activation_usage: 1,
          created_at: '2025-01-01T00:00:00Z',
          expires_at: '2025-06-01T00:00:00Z',
        },
      }),
    );

    const result = await lemonSqueezyAdapter.refreshLicense();

    expect(result).not.toBeNull();
    const state = lemonSqueezyAdapter.getState();
    // expired status means hasValidLicense=false
    expect(state.hasValidLicense).toBe(false);
  });

  test('handles fetch error and sets lastError', async () => {
    localStorageMap.set('neurodual_license_key', 'KEY');

    globalThis.fetch = mock(() => Promise.reject(new Error('Offline'))) as unknown as typeof fetch;

    const result = await lemonSqueezyAdapter.refreshLicense();

    expect(result).toBeNull();
    const state = lemonSqueezyAdapter.getState();
    expect(state.lastError).toBe('Offline');
    expect(state.isValidating).toBe(false);
  });
});

// =============================================================================
// __resetLemonSqueezyAdapter
// =============================================================================

describe('__resetLemonSqueezyAdapter', () => {
  test('clears state, listeners, and config', async () => {
    // Set up state
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });

    mockFetchResponse(makeValidLSResponse());
    await lemonSqueezyAdapter.activateLicense('KEY');

    const listener = mock((_s: LicenseState) => {});
    lemonSqueezyAdapter.subscribe(listener);

    // Reset
    __resetLemonSqueezyAdapter();

    // State should be empty
    const state = lemonSqueezyAdapter.getState();
    expect(state).toEqual(createEmptyLicenseState());

    // Config should be cleared (getProducts returns empty)
    const products = await lemonSqueezyAdapter.getProducts();
    expect(products).toEqual([]);

    // Listener should not be called on future state changes
    const callCountAfterReset = listener.mock.calls.length;
    mockFetchResponse(makeValidLSResponse());

    // Re-configure to allow activation
    configureLemonSqueezy({
      storeId: 'mystore',
      variants: { annual: 'var-1' },
    });
    await lemonSqueezyAdapter.activateLicense('KEY2');

    // Listener should not have been called again (cleared by reset)
    expect(listener.mock.calls.length).toBe(callCountAfterReset);
  });
});
