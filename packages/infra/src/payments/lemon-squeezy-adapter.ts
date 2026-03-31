/**
 * Lemon Squeezy License Adapter
 *
 * Implements LicensePort for web-based license key validation.
 * Uses Lemon Squeezy's license key API.
 *
 * Only works on web (PWA). On mobile, use RevenueCat for IAP.
 */

import type {
  CheckoutOptions,
  CheckoutUrlResult,
  LicenseActivationResult,
  LicenseDeactivationResult,
  LicensePort,
  LicenseProduct,
  LicenseState,
  LicenseStateListener,
  LicenseValidationResult,
} from '@neurodual/logic';
import {
  createEmptyLicenseState,
  maskLicenseKey,
  LemonSqueezyLicenseValidationSchema,
  safeParseWithLog,
} from '@neurodual/logic';
import { Capacitor } from '@capacitor/core';
import { createLogger } from '../logger';

const log = createLogger('lemon-squeezy');

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_LICENSE = 'neurodual_license_key';
const STORAGE_KEY_INSTANCE = 'neurodual_license_instance';

// Device/instance name for activation tracking
const INSTANCE_NAME = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 50) : 'Web';

// =============================================================================
// Configuration
// =============================================================================

export interface LemonSqueezyConfig {
  /** Store ID from Lemon Squeezy */
  storeId: string;
  /** Product variant IDs for checkout */
  variants: {
    /** Annual subscription variant ID */
    annual: string;
    /** Lifetime purchase variant ID (optional) */
    lifetime?: string;
  };
}

let config: LemonSqueezyConfig | null = null;

/**
 * Configure Lemon Squeezy adapter.
 * Must be called before using the adapter.
 */
export function configureLemonSqueezy(cfg: LemonSqueezyConfig): void {
  config = cfg;
  log.info('Configured with store:', cfg.storeId);
}

// =============================================================================
// State Management
// =============================================================================

let currentState: LicenseState = createEmptyLicenseState();
const listeners = new Set<LicenseStateListener>();

function setState(newState: LicenseState): void {
  currentState = newState;
  for (const listener of listeners) {
    listener(newState);
  }
}

// =============================================================================
// Platform Check
// =============================================================================

function isWebPlatform(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'web';
}

// =============================================================================
// Storage Helpers
// =============================================================================

function getStoredLicenseKey(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_LICENSE);
}

function setStoredLicenseKey(key: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (key) {
    localStorage.setItem(STORAGE_KEY_LICENSE, key);
  } else {
    localStorage.removeItem(STORAGE_KEY_LICENSE);
  }
}

function getStoredInstanceId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_INSTANCE);
}

function setStoredInstanceId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (id) {
    localStorage.setItem(STORAGE_KEY_INSTANCE, id);
  } else {
    localStorage.removeItem(STORAGE_KEY_INSTANCE);
  }
}

// =============================================================================
// API Helpers
// =============================================================================

interface LSValidateResponse {
  valid: boolean;
  error?: string;
  license_key?: {
    id: number;
    status: 'active' | 'inactive' | 'expired' | 'disabled';
    key: string;
    activation_limit: number;
    activation_usage: number;
    created_at: string;
    expires_at: string | null;
  };
  instance?: {
    id: string;
    name: string;
    created_at: string;
  };
  meta?: {
    store_id: number;
    order_id: number;
    order_item_id: number;
    product_id: number;
    product_name: string;
    variant_id: number;
    variant_name: string;
    customer_id: number;
    customer_name: string;
    customer_email: string;
  };
}

async function callLicenseAPI(
  endpoint: 'validate' | 'activate' | 'deactivate',
  licenseKey: string,
  instanceId?: string,
): Promise<LSValidateResponse> {
  const url = `https://api.lemonsqueezy.com/v1/licenses/${endpoint}`;

  const body: Record<string, string> = {
    license_key: licenseKey,
  };

  if (endpoint === 'activate') {
    body['instance_name'] = INSTANCE_NAME;
  }

  if (instanceId && (endpoint === 'validate' || endpoint === 'deactivate')) {
    body['instance_id'] = instanceId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    log.error(`API error (${endpoint}):`, response.status, text);
    return {
      valid: false,
      error: `API error: ${response.status}`,
    };
  }

  const data = await response.json();
  return data as LSValidateResponse;
}

function mapValidationResult(response: LSValidateResponse): LicenseValidationResult {
  if (!response.valid || !response.license_key) {
    return {
      valid: false,
      status: 'inactive',
      error: response.error || 'Invalid license key',
    };
  }

  const lk = response.license_key;
  const meta = response.meta;

  return {
    valid: true,
    status: lk.status,
    licenseKeyMasked: maskLicenseKey(lk.key),
    customerEmail: meta?.customer_email,
    customerName: meta?.customer_name,
    productName: meta?.product_name,
    variantName: meta?.variant_name,
    activationsUsed: lk.activation_usage,
    activationsLimit: lk.activation_limit,
    renewsAt: lk.expires_at ? new Date(lk.expires_at) : null,
    createdAt: new Date(lk.created_at),
  };
}

// =============================================================================
// Lemon Squeezy Adapter Implementation
// =============================================================================

export const lemonSqueezyAdapter: LicensePort = {
  getState(): LicenseState {
    return currentState;
  },

  subscribe(listener: LicenseStateListener): () => void {
    listeners.add(listener);
    listener(currentState);
    return () => listeners.delete(listener);
  },

  async validateLicense(licenseKey: string): Promise<LicenseValidationResult> {
    if (!isWebPlatform()) {
      return {
        valid: false,
        status: 'inactive',
        error: 'License validation is only available on web',
      };
    }

    setState({ ...currentState, isValidating: true, lastError: null });

    try {
      const response = await callLicenseAPI('validate', licenseKey);

      // Validate response at boundary
      const parseResult = safeParseWithLog(
        LemonSqueezyLicenseValidationSchema,
        response,
        'lemonSqueezy.validateLicense',
      );

      if (!parseResult.success) {
        log.warn('Response validation failed, using raw response');
      }

      const result = mapValidationResult(response);

      setState({
        ...currentState,
        isValidating: false,
        lastError: result.valid ? null : result.error || null,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      log.error('Validation error:', error);

      setState({
        ...currentState,
        isValidating: false,
        lastError: errorMessage,
      });

      return {
        valid: false,
        status: 'inactive',
        error: errorMessage,
      };
    }
  },

  async activateLicense(licenseKey: string): Promise<LicenseActivationResult> {
    if (!isWebPlatform()) {
      return {
        activated: false,
        error: 'License activation is only available on web',
      };
    }

    setState({ ...currentState, isValidating: true, lastError: null });

    try {
      const response = await callLicenseAPI('activate', licenseKey);
      const validationResult = mapValidationResult(response);

      if (!response.valid || !response.instance) {
        setState({
          ...currentState,
          isValidating: false,
          lastError: response.error || 'Activation failed',
        });

        return {
          activated: false,
          error: response.error || 'Activation failed',
          license: validationResult,
        };
      }

      // Store the license key and instance ID
      setStoredLicenseKey(licenseKey);
      setStoredInstanceId(response.instance.id);

      setState({
        hasValidLicense: true,
        license: validationResult,
        isValidating: false,
        lastError: null,
        storedLicenseKey: licenseKey,
        instanceId: response.instance.id,
      });

      log.info('License activated successfully');

      return {
        activated: true,
        instanceId: response.instance.id,
        license: validationResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Activation failed';
      log.error('Activation error:', error);

      setState({
        ...currentState,
        isValidating: false,
        lastError: errorMessage,
      });

      return {
        activated: false,
        error: errorMessage,
      };
    }
  },

  async deactivateLicense(): Promise<LicenseDeactivationResult> {
    if (!isWebPlatform()) {
      return {
        deactivated: false,
        error: 'License deactivation is only available on web',
      };
    }

    const licenseKey = getStoredLicenseKey();
    const instanceId = getStoredInstanceId();

    if (!licenseKey || !instanceId) {
      return {
        deactivated: false,
        error: 'No license to deactivate',
      };
    }

    try {
      const response = await callLicenseAPI('deactivate', licenseKey, instanceId);

      // Clear stored data regardless of API response
      setStoredLicenseKey(null);
      setStoredInstanceId(null);

      setState(createEmptyLicenseState());

      if (!response.valid) {
        // Still consider it "deactivated" locally even if API fails
        log.warn('Deactivation API returned invalid, but cleared local state');
      }

      log.info('License deactivated');

      return {
        deactivated: true,
      };
    } catch (error) {
      // Clear local state even on error
      setStoredLicenseKey(null);
      setStoredInstanceId(null);
      setState(createEmptyLicenseState());

      log.warn('Deactivation API error, but cleared local state:', error);

      return {
        deactivated: true,
      };
    }
  },

  async refreshLicense(): Promise<LicenseValidationResult | null> {
    if (!isWebPlatform()) {
      return null;
    }

    const licenseKey = getStoredLicenseKey();
    const instanceId = getStoredInstanceId();

    if (!licenseKey) {
      return null;
    }

    setState({ ...currentState, isValidating: true });

    try {
      const response = await callLicenseAPI('validate', licenseKey, instanceId ?? undefined);
      const result = mapValidationResult(response);

      const isValid = result.valid && result.status === 'active';

      setState({
        hasValidLicense: isValid,
        license: result,
        isValidating: false,
        lastError: isValid ? null : result.error || null,
        storedLicenseKey: licenseKey,
        instanceId: instanceId,
      });

      if (!isValid) {
        log.warn('License no longer valid:', result.status);
      }

      return result;
    } catch (error) {
      log.error('Refresh error:', error);

      setState({
        ...currentState,
        isValidating: false,
        lastError: error instanceof Error ? error.message : 'Refresh failed',
      });

      return null;
    }
  },

  async getCheckoutUrl(variantId: string, options?: CheckoutOptions): Promise<CheckoutUrlResult> {
    if (!config) {
      throw new Error('Lemon Squeezy not configured. Call configureLemonSqueezy() first.');
    }

    // Build checkout URL with Lemon Squeezy's hosted checkout
    // Format: https://STORE.lemonsqueezy.com/checkout/buy/VARIANT_ID
    const baseUrl = `https://${config.storeId}.lemonsqueezy.com/checkout/buy/${variantId}`;

    const params = new URLSearchParams();

    if (options?.email) {
      params.set('checkout[email]', options.email);
    }

    if (options?.name) {
      params.set('checkout[name]', options.name);
    }

    if (options?.discountCode) {
      params.set('checkout[discount_code]', options.discountCode);
    }

    // Pass custom data (e.g., user_id for webhook)
    if (options?.customData) {
      for (const [key, value] of Object.entries(options.customData)) {
        params.set(`checkout[custom][${key}]`, value);
      }
    }

    // Enable dark mode based on user preference
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      params.set('dark', '1');
    }

    // Embed mode for cleaner experience
    params.set('embed', '1');

    const queryString = params.toString();
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    return { url };
  },

  async getProducts(): Promise<LicenseProduct[]> {
    if (!config) {
      return [];
    }

    // Return static product info based on config
    // In a real implementation, you could fetch from Lemon Squeezy API
    const products: LicenseProduct[] = [
      {
        variantId: config.variants.annual,
        name: 'Neurodual Premium',
        variantName: 'Annuel',
        priceString: '24,99 €',
        priceCents: 2499,
        currencyCode: 'EUR',
        isSubscription: true,
        interval: 'year',
      },
    ];

    if (config.variants.lifetime) {
      products.push({
        variantId: config.variants.lifetime,
        name: 'Neurodual Premium',
        variantName: 'À vie',
        priceString: '59,99 €',
        priceCents: 5999,
        currencyCode: 'EUR',
        isSubscription: false,
      });
    }

    return products;
  },

  async clearLicense(): Promise<void> {
    setStoredLicenseKey(null);
    setStoredInstanceId(null);
    setState(createEmptyLicenseState());
    log.info('License cleared');
  },

  isAvailable(): boolean {
    return isWebPlatform();
  },
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the license adapter.
 * Loads stored license and validates it.
 */
export async function initLemonSqueezyAdapter(): Promise<void> {
  if (!isWebPlatform()) {
    log.info('Not available on mobile platform');
    return;
  }

  const storedKey = getStoredLicenseKey();
  const storedInstance = getStoredInstanceId();

  if (storedKey) {
    log.info('Found stored license, validating...');

    setState({
      ...currentState,
      storedLicenseKey: storedKey,
      instanceId: storedInstance,
      isValidating: true,
    });

    // Validate in background
    lemonSqueezyAdapter.refreshLicense().catch((err) => {
      log.error('Background validation failed:', err);
    });
  }
}

/**
 * Reset adapter state (for testing).
 * @internal
 */
export function __resetLemonSqueezyAdapter(): void {
  currentState = createEmptyLicenseState();
  listeners.clear();
  config = null;
}
