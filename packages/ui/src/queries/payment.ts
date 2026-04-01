/**
 * Payment Queries (Lite - Noop)
 *
 * Simplified payment queries for local-only mode.
 * No in-app purchases - everything is free.
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
// Adapter Reference (noop - no payments in Lite)
// =============================================================================

const DEFAULT_CUSTOMER_INFO: CustomerInfo = {
  isActive: false,
  activeEntitlement: null,
  expirationDate: null,
  isTrialing: false,
  originalPurchaseDate: null,
};

const noopPaymentAdapter: PaymentPort = {
  initialize: async () => {},
  isAvailable: () => false,
  getProducts: async () => [],
  getCustomerInfo: async () => DEFAULT_CUSTOMER_INFO,
  purchase: async () => ({
    success: false as const,
    errorMessage: 'Payments not available in Lite',
  }),
  restorePurchases: async () => DEFAULT_CUSTOMER_INFO,
  subscribe: () => () => {},
  setUserId: async () => {},
  logout: async () => {},
};

let paymentAdapter: PaymentPort = noopPaymentAdapter;

export function setPaymentAdapter(adapter: PaymentPort): void {
  paymentAdapter = adapter;
}

export function getPaymentAdapter(): PaymentPort {
  return paymentAdapter;
}

export function hasPaymentAdapter(): boolean {
  return paymentAdapter !== noopPaymentAdapter;
}

// =============================================================================
// Query Keys (local reference)
// =============================================================================

const paymentKeys = queryKeys.payment;

// =============================================================================
// Queries
// =============================================================================

/**
 * Get available products for purchase.
 * Always empty in Lite mode.
 */
export function useProducts(): UseQueryResult<Product[]> {
  return useQuery<Product[]>({
    queryKey: paymentKeys.products(),
    queryFn: () => getPaymentAdapter().getProducts(),
    enabled: getPaymentAdapter().isAvailable(),
    staleTime: 5 * 60 * 1000,
    placeholderData: [],
  });
}

/**
 * Get current customer info.
 * Always returns inactive in Lite mode.
 */
export function useCustomerInfo(): UseQueryResult<CustomerInfo> {
  return useQuery<CustomerInfo>({
    queryKey: paymentKeys.customerInfo(),
    queryFn: () => getPaymentAdapter().getCustomerInfo(),
    enabled: getPaymentAdapter().isAvailable(),
    staleTime: 60 * 1000,
    placeholderData: DEFAULT_CUSTOMER_INFO,
  });
}

/**
 * Check if user has an active purchase.
 * Always false in Lite mode.
 */
export function useIsPurchaseActive(): boolean {
  const { data } = useCustomerInfo();
  return data?.isActive ?? false;
}

/**
 * Check if payments are available.
 * Always false in Lite mode.
 */
export function useIsPaymentAvailable(): boolean {
  return getPaymentAdapter().isAvailable();
}

// =============================================================================
// Mutations (noop in Lite)
// =============================================================================

export function usePurchase(): UseMutationResult<PurchaseResult, Error, ProductId> {
  const queryClient = useQueryClient();
  return useMutation<PurchaseResult, Error, ProductId>({
    mutationFn: (productId: ProductId) => getPaymentAdapter().purchase(productId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

export function useRestorePurchases(): UseMutationResult<CustomerInfo, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<CustomerInfo, Error, void>({
    mutationFn: () => getPaymentAdapter().restorePurchases(),
    onSuccess: (result) => {
      if (result.isActive) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

// =============================================================================
// Listener Wiring (noop in Lite)
// =============================================================================

export function setupPaymentListener(_queryClient: QueryClient): () => void {
  // No payment listener in Lite mode
  return () => {};
}

// =============================================================================
// Cache Helpers
// =============================================================================

export function invalidatePaymentQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: paymentKeys.all });
}
