/**
 * PurchaseService
 *
 * Handles in-app purchases via @capgo/native-purchases and
 * auto-activates premium by calling the activation API worker.
 *
 * - purchase(): triggers store purchase → sends receipt to worker → returns code
 * - restore(): restores past purchases → sends to worker → returns code
 * - Only available on native (Capacitor) — web uses manual code entry
 */

import { Capacitor } from '@capacitor/core';

// Lazy-import to avoid bundling native code on web
type NativePurchasesModule = typeof import('@capgo/native-purchases');

// Product ID — must match Google Play Console / App Store Connect
const PRODUCT_ID = 'premium_lifetime';

export interface PurchaseProduct {
  readonly title: string;
  readonly priceString: string;
  readonly priceMicros: number;
  readonly currencyCode: string;
}

export interface PurchaseResult {
  readonly success: true;
  readonly code: string;
  readonly activationsUsed: number;
}

export interface PurchaseError {
  readonly success: false;
  readonly error:
    | 'not_available'
    | 'cancelled'
    | 'already_owned'
    | 'network_error'
    | 'store_error'
    | 'max_activations';
}

export type PurchaseOutcome = PurchaseResult | PurchaseError;

export interface PurchaseServiceDeps {
  readonly apiUrl: string;
  readonly getDeviceId: () => string;
  readonly getDeviceName: () => string;
  /** Called after successful purchase/restore to update premium state */
  readonly onActivated: (code: string) => Promise<void>;
}

interface StoreValidationPayload {
  readonly store: 'google' | 'apple';
  readonly productId: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly transactionId?: string;
  readonly purchaseToken?: string;
  readonly orderId?: string;
  readonly receipt?: string;
  readonly jwsRepresentation?: string;
}

let _nativePurchases: NativePurchasesModule | null = null;

async function getNativePurchases(): Promise<NativePurchasesModule> {
  if (!_nativePurchases) {
    _nativePurchases = await import('@capgo/native-purchases');
  }
  return _nativePurchases;
}

export function createPurchaseService(deps: PurchaseServiceDeps) {
  function isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  async function getProduct(): Promise<PurchaseProduct | null> {
    if (!isAvailable()) return null;

    try {
      const { NativePurchases, PURCHASE_TYPE } = await getNativePurchases();

      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return null;

      const { product } = await NativePurchases.getProduct({
        productIdentifier: PRODUCT_ID,
        productType: PURCHASE_TYPE.INAPP,
      });

      return {
        title: product.title,
        priceString: product.priceString,
        priceMicros: 0,
        currencyCode: 'EUR',
      };
    } catch {
      return null;
    }
  }

  async function sendToWorker(payload: StoreValidationPayload): Promise<PurchaseOutcome> {
    const res = await fetch(`${deps.apiUrl}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      success?: boolean;
      code?: string;
      activationsUsed?: number;
      error?: string;
    };

    if (!res.ok) {
      return {
        success: false,
        error: data.error === 'max_activations' ? 'max_activations' : 'network_error',
      };
    }

    const code = data.code ?? '';
    await deps.onActivated(code);

    return {
      success: true,
      code,
      activationsUsed: data.activationsUsed ?? 1,
    };
  }

  async function purchase(): Promise<PurchaseOutcome> {
    if (!isAvailable()) {
      return { success: false, error: 'not_available' };
    }

    try {
      const { NativePurchases, PURCHASE_TYPE } = await getNativePurchases();

      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) {
        return { success: false, error: 'not_available' };
      }

      const result = await NativePurchases.purchaseProduct({
        productIdentifier: PRODUCT_ID,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
        autoAcknowledgePurchases: true,
      });

      const platform = Capacitor.getPlatform();
      const store = platform === 'ios' ? 'apple' : 'google';

      if (!result.transactionId) {
        return { success: false, error: 'store_error' };
      }

      return await sendToWorker({
        store,
        productId: result.productIdentifier,
        deviceId: deps.getDeviceId(),
        deviceName: deps.getDeviceName(),
        transactionId: result.transactionId,
        purchaseToken: result.purchaseToken,
        orderId: result.orderId,
        receipt: result.receipt,
        jwsRepresentation: result.jwsRepresentation,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('cancel') || msg.includes('Cancel')) {
        return { success: false, error: 'cancelled' };
      }
      if (msg.includes('already owned') || msg.includes('ALREADY_OWNED')) {
        // User already purchased — try restore flow instead
        return restore();
      }
      return { success: false, error: 'store_error' };
    }
  }

  async function restore(): Promise<PurchaseOutcome> {
    if (!isAvailable()) {
      return { success: false, error: 'not_available' };
    }

    try {
      const { NativePurchases, PURCHASE_TYPE } = await getNativePurchases();

      await NativePurchases.restorePurchases();

      const { purchases } = await NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.INAPP,
      });

      // Find our premium purchase
      const premiumPurchase = purchases.find((p) => {
        const isOurProduct = p.productIdentifier === PRODUCT_ID;
        const isValid =
          p.purchaseState === 'PURCHASED' ||
          p.purchaseState === '1' ||
          // iOS doesn't always have purchaseState — presence of transactionId is enough
          (p.transactionId && !p.purchaseState);
        return isOurProduct && isValid;
      });

      if (!premiumPurchase?.transactionId) {
        return { success: false, error: 'not_available' };
      }

      const platform = Capacitor.getPlatform();
      const store = platform === 'ios' ? 'apple' : 'google';

      return await sendToWorker({
        store,
        productId: premiumPurchase.productIdentifier,
        deviceId: deps.getDeviceId(),
        deviceName: deps.getDeviceName(),
        transactionId: premiumPurchase.transactionId,
        purchaseToken: premiumPurchase.purchaseToken,
        orderId: premiumPurchase.orderId,
        receipt: premiumPurchase.receipt,
        jwsRepresentation: premiumPurchase.jwsRepresentation,
      });
    } catch {
      return { success: false, error: 'network_error' };
    }
  }

  return { isAvailable, getProduct, purchase, restore };
}

export type PurchaseServiceInstance = ReturnType<typeof createPurchaseService>;
