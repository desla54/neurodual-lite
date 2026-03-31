/**
 * RevenueCat Payment Adapter
 *
 * Implements PaymentPort using RevenueCat SDK for in-app purchases.
 * Only works on mobile (Capacitor). Returns stub data on web.
 */

import type {
  CustomerInfo,
  PaymentPort,
  PaymentStateListener,
  Product,
  ProductId,
  PurchaseResult,
} from '@neurodual/logic';
import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  type CustomerInfo as RCCustomerInfo,
  type PurchasesPackage,
  LOG_LEVEL,
} from '@revenuecat/purchases-capacitor';
import { revenueCatLog } from '../logger';

// =============================================================================
// Constants
// =============================================================================

const ENTITLEMENT_PREMIUM = 'premium';

// Product ID mapping (RevenueCat product IDs)
const PRODUCT_IDS: Record<ProductId, string> = {
  premium_monthly: 'premium_monthly',
  premium_yearly: 'premium_yearly',
  premium_lifetime: 'premium_lifetime',
};

/**
 * Match a store product identifier against our product IDs.
 *
 * Google Play subscriptions use the format `product_id:base_plan_id`
 * (e.g., "premium_yearly:yearly-base"). We match on the product_id prefix.
 * One-time purchases (lifetime) use just the product_id.
 */
function matchProductId(storeIdentifier: string): ProductId | undefined {
  // Exact match first (lifetime, test store)
  const exact = Object.entries(PRODUCT_IDS).find(([, rcId]) => rcId === storeIdentifier)?.[0] as
    | ProductId
    | undefined;
  if (exact) return exact;

  // Prefix match for Google Play subscriptions (product_id:base_plan_id)
  const prefix = storeIdentifier.split(':')[0];
  return Object.entries(PRODUCT_IDS).find(([, rcId]) => rcId === prefix)?.[0] as
    | ProductId
    | undefined;
}

// =============================================================================
// State
// =============================================================================

let initialized = false;
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;
let currentCustomerInfo: CustomerInfo = {
  isActive: false,
  activeEntitlement: null,
  expirationDate: null,
  isTrialing: false,
  originalPurchaseDate: null,
};

const listeners = new Set<PaymentStateListener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(currentCustomerInfo);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function mapCustomerInfo(rcInfo: RCCustomerInfo): CustomerInfo {
  const premium = rcInfo.entitlements.active[ENTITLEMENT_PREMIUM];

  return {
    isActive: !!premium,
    activeEntitlement: premium ? 'premium' : null,
    expirationDate: premium?.expirationDate ? new Date(premium.expirationDate) : null,
    isTrialing: premium?.periodType === 'TRIAL',
    originalPurchaseDate: premium?.originalPurchaseDate
      ? new Date(premium.originalPurchaseDate)
      : null,
  };
}

function mapProduct(rcProduct: PurchasesPackage): Product | null {
  const storeProduct = rcProduct.product;
  const productId = matchProductId(storeProduct.identifier);

  if (!productId) return null;

  return {
    id: productId,
    title: storeProduct.title,
    description: storeProduct.description,
    priceString: storeProduct.priceString,
    priceMicros: storeProduct.price * 1_000_000,
    currencyCode: storeProduct.currencyCode,
  };
}

// =============================================================================
// Configuration
// =============================================================================

export interface RevenueCatConfig {
  /** API key for Android */
  androidApiKey?: string;
  /** API key for iOS */
  iosApiKey?: string;
}

let config: RevenueCatConfig = {};

// =============================================================================
// Platform Check
// =============================================================================

function isMobilePlatform(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
}

function redactKey(key: string): string {
  if (key.length <= 8) return '[redacted]';
  return `${key.slice(0, 5)}…${key.slice(-3)}`;
}

function getConfiguredApiKeyForCurrentPlatform(): string {
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const key = config.androidApiKey;
    if (!key) throw new Error('RevenueCat Android API key not configured');
    // RevenueCat public SDK keys for Android typically start with "goog_"
    if (key.startsWith('test_')) {
      throw new Error(
        `RevenueCat Android API key looks like a test key (${redactKey(key)}). Use the production SDK key (goog_...) even for sandbox tests.`,
      );
    }
    return key;
  }

  if (platform === 'ios') {
    const key = config.iosApiKey;
    if (!key) throw new Error('RevenueCat iOS API key not configured');
    // RevenueCat public SDK keys for iOS typically start with "appl_"
    if (key.startsWith('test_')) {
      throw new Error(
        `RevenueCat iOS API key looks like a test key (${redactKey(key)}). Use the production SDK key (appl_...) even for sandbox tests.`,
      );
    }
    return key;
  }

  throw new Error(`Unsupported platform for payments: ${platform}`);
}

function hasConfiguredApiKeyForCurrentPlatform(): boolean {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return Boolean(config.androidApiKey);
  if (platform === 'ios') return Boolean(config.iosApiKey);
  return false;
}

function normalizeInitError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  if (!isMobilePlatform()) {
    revenueCatLog.info('Not available on web platform');
    initialized = true;
    return;
  }

  // Store the promise so other methods can await it
  initPromise = (async () => {
    try {
      const apiKey = getConfiguredApiKeyForCurrentPlatform();

      // Set log level based on environment (avoid verbose logs in production)
      const logLevel =
        typeof import.meta !== 'undefined' &&
        (import.meta as { env?: { PROD?: boolean } }).env?.PROD
          ? LOG_LEVEL.INFO
          : LOG_LEVEL.DEBUG;
      await Purchases.setLogLevel({ level: logLevel });
      await Purchases.configure({ apiKey });

      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        currentCustomerInfo = mapCustomerInfo(customerInfo);
        notifyListeners();
      });

      // Get initial customer info
      const { customerInfo } = await Purchases.getCustomerInfo();
      currentCustomerInfo = mapCustomerInfo(customerInfo);

      revenueCatLog.info('Initialized successfully');
    } catch (error) {
      initError = normalizeInitError(error);
      // Fail-soft: do not crash app startup if RevenueCat is misconfigured.
      revenueCatLog.error('Failed to initialize (payments will be disabled):', initError);
    } finally {
      initialized = true;
    }
  })();

  return initPromise;
}

// =============================================================================
// RevenueCat Adapter
// =============================================================================

export const revenueCatAdapter: PaymentPort = {
  async initialize(): Promise<void> {
    await ensureInitialized();
  },

  async getProducts(): Promise<Product[]> {
    if (!isMobilePlatform()) {
      // Return mock products for web development (yearly + lifetime only)
      return [
        {
          id: 'premium_monthly',
          title: 'Premium (Mensuel)',
          description: 'Entraînement illimité + Sync Cloud',
          priceString: '3,99 €',
          priceMicros: 3_990_000,
          currencyCode: 'EUR',
        },
        {
          id: 'premium_yearly',
          title: 'Premium (Annuel)',
          description: 'Entraînement illimité + Sync Cloud',
          priceString: '24,99 €',
          priceMicros: 24_990_000,
          currencyCode: 'EUR',
        },
        {
          id: 'premium_lifetime',
          title: 'Premium (À vie)',
          description: 'Entraînement illimité + Sync Cloud • Paiement unique',
          priceString: '59,99 €',
          priceMicros: 59_990_000,
          currencyCode: 'EUR',
        },
      ];
    }

    // Wait for initialization to complete before calling RevenueCat API
    await ensureInitialized();
    if (initError) return [];

    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;

      if (!current) {
        revenueCatLog.warn('No current offering available');
        return [];
      }

      return current.availablePackages.map(mapProduct).filter((p): p is Product => p !== null);
    } catch (error) {
      revenueCatLog.error('Failed to get products:', error);
      return [];
    }
  },

  async purchase(productId: ProductId): Promise<PurchaseResult> {
    if (!isMobilePlatform()) {
      return {
        success: false,
        errorMessage: 'Payments not available on web. Please use the mobile app.',
      };
    }

    // Wait for initialization to complete before calling RevenueCat API
    await ensureInitialized();
    if (initError) {
      return {
        success: false,
        errorMessage: 'Payments unavailable (RevenueCat misconfigured). Please update the app.',
      };
    }

    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;

      if (!current) {
        return { success: false, errorMessage: 'No offerings available' };
      }

      // Log available packages for debugging
      revenueCatLog.info(
        'Available packages:',
        current.availablePackages
          .map((p: PurchasesPackage) => `${p.identifier}→${p.product.identifier}`)
          .join(', '),
      );

      const pkg = current.availablePackages.find(
        (p: PurchasesPackage) => matchProductId(p.product.identifier) === productId,
      );

      if (!pkg) {
        return {
          success: false,
          errorMessage: `Product ${productId} not found in: ${current.availablePackages.map((p: PurchasesPackage) => p.product.identifier).join(', ')}`,
        };
      }

      revenueCatLog.info(
        `Purchasing: ${productId} → pkg=${pkg.identifier}, store=${pkg.product.identifier}`,
      );

      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      currentCustomerInfo = mapCustomerInfo(customerInfo);
      notifyListeners();

      return {
        success: true,
        productId,
      };
    } catch (error: unknown) {
      const err = error as {
        userCancelled?: boolean;
        message?: string;
        code?: number | string;
        underlyingErrorMessage?: string;
        readableErrorCode?: string;
      };

      if (err.userCancelled) {
        return { success: false, userCancelled: true };
      }

      // Log full error details for debugging
      revenueCatLog.error(
        'Purchase failed:',
        JSON.stringify({
          message: err.message,
          code: err.code,
          readableErrorCode: err.readableErrorCode,
          underlyingErrorMessage: err.underlyingErrorMessage,
          keys: Object.keys(error as object),
        }),
      );

      // Build detailed error message for UI debugging
      const details = [
        err.readableErrorCode,
        err.code !== undefined ? `code=${err.code}` : null,
        err.underlyingErrorMessage,
        err.message,
      ]
        .filter(Boolean)
        .join(' | ');

      return {
        success: false,
        errorMessage: details || 'Purchase failed',
      };
    }
  },

  async restorePurchases(): Promise<CustomerInfo> {
    if (!isMobilePlatform()) {
      return currentCustomerInfo;
    }

    await ensureInitialized();
    if (initError) return currentCustomerInfo;

    try {
      const { customerInfo } = await Purchases.restorePurchases();
      currentCustomerInfo = mapCustomerInfo(customerInfo);
      notifyListeners();
      return currentCustomerInfo;
    } catch (error) {
      revenueCatLog.error('Restore failed:', error);
      return currentCustomerInfo;
    }
  },

  async getCustomerInfo(): Promise<CustomerInfo> {
    if (!isMobilePlatform()) {
      return currentCustomerInfo;
    }

    await ensureInitialized();
    if (initError) return currentCustomerInfo;

    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      currentCustomerInfo = mapCustomerInfo(customerInfo);
      return currentCustomerInfo;
    } catch (error) {
      revenueCatLog.error('Failed to get customer info:', error);
      return currentCustomerInfo;
    }
  },

  subscribe(listener: PaymentStateListener): () => void {
    listeners.add(listener);
    listener(currentCustomerInfo);
    return () => listeners.delete(listener);
  },

  async setUserId(userId: string): Promise<void> {
    if (!isMobilePlatform()) return;

    await ensureInitialized();
    if (initError) return;

    try {
      await Purchases.logIn({ appUserID: userId });
      const { customerInfo } = await Purchases.getCustomerInfo();
      currentCustomerInfo = mapCustomerInfo(customerInfo);
      notifyListeners();
    } catch (error) {
      revenueCatLog.error('Failed to set user ID:', error);
    }
  },

  async logout(): Promise<void> {
    if (!isMobilePlatform()) return;

    await ensureInitialized();
    if (initError) return;

    try {
      // Check if user is anonymous before logging out
      // RevenueCat throws if you call logOut on an anonymous user
      const { isAnonymous } = await Purchases.isAnonymous();
      if (isAnonymous) {
        revenueCatLog.debug('Skipping logout - user is anonymous');
        return;
      }

      await Purchases.logOut();
      currentCustomerInfo = {
        isActive: false,
        activeEntitlement: null,
        expirationDate: null,
        isTrialing: false,
        originalPurchaseDate: null,
      };
      notifyListeners();
    } catch (error) {
      revenueCatLog.error('Failed to logout:', error);
    }
  },

  isAvailable(): boolean {
    // Availability = platform supports IAP + SDK key is configured.
    // Initialization may still fail at runtime (network/store/offering issues),
    // but the UI should treat this as "mobile payments path".
    if (!isMobilePlatform()) return false;
    if (!hasConfiguredApiKeyForCurrentPlatform()) return false;
    return true;
  },
};

// =============================================================================
// Configuration Function
// =============================================================================

/**
 * Configure RevenueCat adapter with API keys.
 * Must be called before initialize().
 */
export function configureRevenueCat(cfg: RevenueCatConfig): void {
  config = cfg;
}
