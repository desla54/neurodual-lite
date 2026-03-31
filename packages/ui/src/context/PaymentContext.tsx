'use client';

/**
 * Payment Context
 *
 * Re-exports TanStack Query payment hooks with backward-compatible API.
 * The actual implementation is in queries/payment.ts.
 */

import type {
  CustomerInfo,
  PaymentPort,
  Product,
  ProductId,
  PurchaseResult,
} from '@neurodual/logic';
import {
  getPaymentAdapter,
  useCustomerInfo as useCustomerInfoQuery,
  useIsPaymentAvailable as useIsPaymentAvailableQuery,
  useIsPurchaseActive as useIsPurchaseActiveQuery,
  useProducts as useProductsQuery,
  usePurchase as usePurchaseMutation,
  useRestorePurchases as useRestorePurchasesMutation,
} from '../queries';

/**
 * Hook to get the payment adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function usePaymentAdapter(): PaymentPort {
  return getPaymentAdapter();
}

/**
 * Hook to get current customer info with automatic updates.
 * Returns CustomerInfo directly for backward compatibility.
 */
export function useCustomerInfo(): CustomerInfo {
  const { data } = useCustomerInfoQuery();
  return (
    data ?? {
      isActive: false,
      activeEntitlement: null,
      expirationDate: null,
      isTrialing: false,
      originalPurchaseDate: null,
    }
  );
}

/**
 * Hook to check if user has any active purchase.
 */
export function useIsPurchaseActive(): boolean {
  return useIsPurchaseActiveQuery();
}

/**
 * Hook to check if payments are available (mobile only).
 */
export function useIsPaymentAvailable(): boolean {
  return useIsPaymentAvailableQuery();
}

/**
 * Hook to get available products.
 * Returns backward-compatible object with products, loading, and refresh.
 */
export function useProducts(): { products: Product[]; loading: boolean; refresh: () => void } {
  const { data, isLoading, refetch } = useProductsQuery();
  return {
    products: data ?? [],
    loading: isLoading,
    refresh: () => {
      refetch();
    },
  };
}

/**
 * Hook to purchase a product.
 * Returns backward-compatible object with purchase function and purchasing state.
 */
export function usePurchase(): {
  purchase: (productId: ProductId) => Promise<PurchaseResult>;
  purchasing: boolean;
} {
  const mutation = usePurchaseMutation();

  return {
    purchase: async (productId: ProductId): Promise<PurchaseResult> => {
      try {
        return await mutation.mutateAsync(productId);
      } catch (error) {
        // Convert thrown errors to PurchaseResult format
        return {
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Purchase failed',
        };
      }
    },
    purchasing: mutation.isPending,
  };
}

/**
 * Hook to restore purchases.
 * Returns backward-compatible object with restore function and restoring state.
 */
export function useRestorePurchases(): {
  restore: () => Promise<CustomerInfo>;
  restoring: boolean;
} {
  const mutation = useRestorePurchasesMutation();

  return {
    restore: async (): Promise<CustomerInfo> => {
      return mutation.mutateAsync();
    },
    restoring: mutation.isPending,
  };
}
