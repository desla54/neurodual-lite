/**
 * Payment Queries (RevenueCat)
 *
 * TanStack Query hooks for in-app purchases.
 * Uses RevenueCat SDK under the hood via PaymentPort.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CustomerInfo,
  PaymentPort,
  Product,
  ProductId,
  PurchaseResult,
} from '@neurodual/logic';
import { queryKeys } from './keys';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let paymentAdapter: PaymentPort | null = null;

export function setPaymentAdapter(adapter: PaymentPort): void {
  paymentAdapter = adapter;
}

export function getPaymentAdapter(): PaymentPort {
  if (!paymentAdapter) {
    throw new Error('Payment adapter not initialized. Call setPaymentAdapter first.');
  }
  return paymentAdapter;
}

export function hasPaymentAdapter(): boolean {
  return paymentAdapter !== null;
}

// =============================================================================
// Query Keys (local reference)
// =============================================================================

const paymentKeys = queryKeys.payment;

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_CUSTOMER_INFO: CustomerInfo = {
  isActive: false,
  activeEntitlement: null,
  expirationDate: null,
  isTrialing: false,
  originalPurchaseDate: null,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Get available products for purchase.
 *
 * Products are cached for 5 minutes since they rarely change.
 */
export function useProducts(): UseQueryResult<Product[]> {
  const adapter = getPaymentAdapter();
  return useQuery<Product[]>({
    queryKey: paymentKeys.products(),
    queryFn: () => adapter.getProducts(),
    enabled: adapter.isAvailable(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: [],
  });
}

/**
 * Get current customer info (entitlements).
 *
 * Uses placeholderData to ensure UI renders immediately.
 */
export function useCustomerInfo(): UseQueryResult<CustomerInfo> {
  const adapter = getPaymentAdapter();
  return useQuery<CustomerInfo>({
    queryKey: paymentKeys.customerInfo(),
    queryFn: () => adapter.getCustomerInfo(),
    enabled: adapter.isAvailable(),
    staleTime: 60 * 1000, // 1 minute
    placeholderData: DEFAULT_CUSTOMER_INFO,
  });
}

/**
 * Check if user has an active purchase (premium).
 */
export function useIsPurchaseActive(): boolean {
  const { data } = useCustomerInfo();
  return data?.isActive ?? false;
}

/**
 * Check if payments are available (mobile only).
 * This is a sync check, no query needed.
 */
export function useIsPaymentAvailable(): boolean {
  return getPaymentAdapter().isAvailable();
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Purchase a product.
 *
 * On success, invalidates customerInfo and subscription queries.
 */
export function usePurchase(): UseMutationResult<PurchaseResult, Error, ProductId> {
  const queryClient = useQueryClient();

  return useMutation<PurchaseResult, Error, ProductId>({
    mutationFn: (productId: ProductId) => getPaymentAdapter().purchase(productId),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate all payment-related queries
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
        // Also invalidate subscription since it depends on purchases
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

/**
 * Restore previous purchases.
 *
 * On success, invalidates customerInfo and subscription queries.
 */
export function useRestorePurchases(): UseMutationResult<CustomerInfo, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<CustomerInfo, Error, void>({
    mutationFn: () => getPaymentAdapter().restorePurchases(),
    onSuccess: (result) => {
      if (result.isActive) {
        // Invalidate all payment-related queries
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
        // Also invalidate subscription since it depends on purchases
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

// =============================================================================
// Listener Wiring
// =============================================================================

/**
 * Set up RevenueCat listener to sync with TanStack Query cache.
 *
 * Call this once during app initialization (in NeurodualQueryProvider).
 * Returns unsubscribe function.
 */
export function setupPaymentListener(queryClient: QueryClient): () => void {
  const adapter = getPaymentAdapter();

  return adapter.subscribe((customerInfo) => {
    // Update cache directly for immediate UI update
    queryClient.setQueryData(paymentKeys.customerInfo(), customerInfo);

    // Also invalidate subscription queries since they depend on this
    queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  });
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Invalidate all payment queries.
 */
export function invalidatePaymentQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: paymentKeys.all });
}
