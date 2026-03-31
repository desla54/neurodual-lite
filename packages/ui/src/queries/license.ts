/**
 * License Queries (Lemon Squeezy)
 *
 * TanStack Query hooks for license key validation and management.
 * Only available on web platform (mobile uses RevenueCat IAP).
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
  CheckoutOptions,
  CheckoutUrlResult,
  LicenseActivationResult,
  LicenseDeactivationResult,
  LicensePort,
  LicenseProduct,
  LicenseState,
  LicenseValidationResult,
} from '@neurodual/logic';
import { createEmptyLicenseState } from '@neurodual/logic';
import { queryKeys } from './keys';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let licenseAdapter: LicensePort | null = null;

export function setLicenseAdapter(adapter: LicensePort): void {
  licenseAdapter = adapter;
}

export function getLicenseAdapter(): LicensePort {
  if (!licenseAdapter) {
    throw new Error('License adapter not initialized. Call setLicenseAdapter first.');
  }
  return licenseAdapter;
}

export function hasLicenseAdapter(): boolean {
  return licenseAdapter !== null;
}

// =============================================================================
// Query Keys (local reference)
// =============================================================================

const licenseKeys = queryKeys.license;

// =============================================================================
// Queries
// =============================================================================

/**
 * Get current license state.
 *
 * Returns empty state if license system is not available (mobile).
 */
export function useLicenseState(): UseQueryResult<LicenseState> {
  return useQuery<LicenseState>({
    queryKey: licenseKeys.state(),
    queryFn: () => {
      if (!hasLicenseAdapter()) {
        return createEmptyLicenseState();
      }
      return getLicenseAdapter().getState();
    },
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: createEmptyLicenseState(),
  });
}

/**
 * Check if user has a valid license.
 */
export function useHasValidLicense(): boolean {
  const { data } = useLicenseState();
  return data?.hasValidLicense ?? false;
}

/**
 * Check if license system is available (web only).
 */
export function useIsLicenseAvailable(): boolean {
  if (!hasLicenseAdapter()) {
    return false;
  }
  return getLicenseAdapter().isAvailable();
}

/**
 * Get available license products.
 */
export function useLicenseProducts(): UseQueryResult<LicenseProduct[]> {
  return useQuery<LicenseProduct[]>({
    queryKey: licenseKeys.products(),
    queryFn: () => {
      if (!hasLicenseAdapter()) {
        return [];
      }
      return getLicenseAdapter().getProducts();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: [],
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Validate a license key without activating.
 */
export function useValidateLicense(): UseMutationResult<LicenseValidationResult, Error, string> {
  return useMutation<LicenseValidationResult, Error, string>({
    mutationFn: (licenseKey: string) => getLicenseAdapter().validateLicense(licenseKey),
  });
}

/**
 * Activate a license key.
 *
 * On success, invalidates license and subscription queries.
 */
export function useActivateLicense(): UseMutationResult<LicenseActivationResult, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<LicenseActivationResult, Error, string>({
    mutationFn: (licenseKey: string) => getLicenseAdapter().activateLicense(licenseKey),
    onSuccess: (result) => {
      if (result.activated) {
        // Invalidate license queries
        queryClient.invalidateQueries({ queryKey: licenseKeys.all });
        // Also invalidate subscription since license grants premium
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

/**
 * Deactivate the current license.
 *
 * On success, invalidates license and subscription queries.
 */
export function useDeactivateLicense(): UseMutationResult<LicenseDeactivationResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<LicenseDeactivationResult, Error, void>({
    mutationFn: () => getLicenseAdapter().deactivateLicense(),
    onSuccess: (result) => {
      if (result.deactivated) {
        // Invalidate license queries
        queryClient.invalidateQueries({ queryKey: licenseKeys.all });
        // Also invalidate subscription
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

/**
 * Refresh (re-validate) the stored license.
 */
export function useRefreshLicense(): UseMutationResult<
  LicenseValidationResult | null,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation<LicenseValidationResult | null, Error, void>({
    mutationFn: () => getLicenseAdapter().refreshLicense(),
    onSuccess: () => {
      // Update state query
      queryClient.invalidateQueries({ queryKey: licenseKeys.state() });
    },
  });
}

/**
 * Get checkout URL for purchasing.
 */
export function useGetCheckoutUrl(): UseMutationResult<
  CheckoutUrlResult,
  Error,
  { variantId: string; options?: CheckoutOptions }
> {
  return useMutation<CheckoutUrlResult, Error, { variantId: string; options?: CheckoutOptions }>({
    mutationFn: ({ variantId, options }) => getLicenseAdapter().getCheckoutUrl(variantId, options),
  });
}

/**
 * Clear stored license (logout).
 */
export function useClearLicense(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () => getLicenseAdapter().clearLicense(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: licenseKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}

// =============================================================================
// Listener Wiring
// =============================================================================

/**
 * Set up license listener to sync with TanStack Query cache.
 *
 * Call this once during app initialization (in NeurodualQueryProvider).
 * Returns unsubscribe function.
 */
export function setupLicenseListener(queryClient: QueryClient): () => void {
  if (!hasLicenseAdapter()) {
    // Not available on mobile - return no-op
    return () => {};
  }

  const adapter = getLicenseAdapter();

  return adapter.subscribe((state) => {
    // Update cache directly for immediate UI update
    queryClient.setQueryData(licenseKeys.state(), state);

    // Also invalidate subscription queries
    queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
  });
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Invalidate all license queries.
 */
export function invalidateLicenseQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: licenseKeys.all });
}
