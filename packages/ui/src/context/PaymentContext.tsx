'use client';

/**
 * Payment Context (Lite - Noop)
 *
 * Simplified payment context. No in-app purchases - everything is free.
 */

import type {
  CustomerInfo,
  PaymentPort,
  Product,
  ProductId,
  PurchaseResult,
} from '@neurodual/logic';
import { getPaymentAdapter } from '../queries';

/**
 * Hook to get the payment adapter.
 */
export function usePaymentAdapter(): PaymentPort {
  return getPaymentAdapter();
}

/**
 * Hook to get current customer info.
 * Always returns inactive in Lite mode.
 */
export function useCustomerInfo(): CustomerInfo {
  return {
    isActive: false,
    activeEntitlement: null,
    expirationDate: null,
    isTrialing: false,
    originalPurchaseDate: null,
  };
}

/**
 * Hook to check if user has any active purchase.
 * Always false in Lite mode.
 */
export function useIsPurchaseActive(): boolean {
  return false;
}

/**
 * Hook to check if payments are available.
 * Always false in Lite mode.
 */
export function useIsPaymentAvailable(): boolean {
  return false;
}

/**
 * Hook to get available products.
 * Always empty in Lite mode.
 */
export function useProducts(): { products: Product[]; loading: boolean; refresh: () => void } {
  return {
    products: [],
    loading: false,
    refresh: () => {},
  };
}

/**
 * Hook to purchase a product.
 * Noop in Lite mode.
 */
export function usePurchase(): {
  purchase: (productId: ProductId) => Promise<PurchaseResult>;
  purchasing: boolean;
} {
  return {
    purchase: async (_productId: ProductId): Promise<PurchaseResult> => ({
      success: false,
      errorMessage: 'Payments not available in Lite mode',
    }),
    purchasing: false,
  };
}

/**
 * Hook to restore purchases.
 * Noop in Lite mode.
 */
export function useRestorePurchases(): {
  restore: () => Promise<CustomerInfo>;
  restoring: boolean;
} {
  return {
    restore: async (): Promise<CustomerInfo> => ({
      isActive: false,
      activeEntitlement: null,
      expirationDate: null,
      isTrialing: false,
      originalPurchaseDate: null,
    }),
    restoring: false,
  };
}
