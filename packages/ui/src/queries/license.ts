/**
 * License Queries (Lite - Noop)
 *
 * Simplified license queries for local-only mode.
 * No license key validation needed - everything is free.
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
// Adapter Reference (noop - no licenses in Lite)
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
 * Always returns empty state in Lite mode.
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
    staleTime: 30 * 1000,
    placeholderData: createEmptyLicenseState(),
  });
}

/**
 * Check if user has a valid license.
 * Always false in Lite mode (but premium is free anyway).
 */
export function useHasValidLicense(): boolean {
  const { data } = useLicenseState();
  return data?.hasValidLicense ?? false;
}

/**
 * Check if license system is available.
 * Always false in Lite mode.
 */
export function useIsLicenseAvailable(): boolean {
  if (!hasLicenseAdapter()) {
    return false;
  }
  return getLicenseAdapter().isAvailable();
}

/**
 * Get available license products.
 * Always empty in Lite mode.
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
    staleTime: 5 * 60 * 1000,
    placeholderData: [],
  });
}

// =============================================================================
// Mutations (noop in Lite)
// =============================================================================

export function useValidateLicense(): UseMutationResult<LicenseValidationResult, Error, string> {
  return useMutation<LicenseValidationResult, Error, string>({
    mutationFn: (licenseKey: string) => getLicenseAdapter().validateLicense(licenseKey),
  });
}

export function useActivateLicense(): UseMutationResult<LicenseActivationResult, Error, string> {
  const queryClient = useQueryClient();
  return useMutation<LicenseActivationResult, Error, string>({
    mutationFn: (licenseKey: string) => getLicenseAdapter().activateLicense(licenseKey),
    onSuccess: (result) => {
      if (result.activated) {
        queryClient.invalidateQueries({ queryKey: licenseKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

export function useDeactivateLicense(): UseMutationResult<LicenseDeactivationResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<LicenseDeactivationResult, Error, void>({
    mutationFn: () => getLicenseAdapter().deactivateLicense(),
    onSuccess: (result) => {
      if (result.deactivated) {
        queryClient.invalidateQueries({ queryKey: licenseKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      }
    },
  });
}

export function useRefreshLicense(): UseMutationResult<
  LicenseValidationResult | null,
  Error,
  void
> {
  const queryClient = useQueryClient();
  return useMutation<LicenseValidationResult | null, Error, void>({
    mutationFn: () => getLicenseAdapter().refreshLicense(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: licenseKeys.state() });
    },
  });
}

export function useGetCheckoutUrl(): UseMutationResult<
  CheckoutUrlResult,
  Error,
  { variantId: string; options?: CheckoutOptions }
> {
  return useMutation<CheckoutUrlResult, Error, { variantId: string; options?: CheckoutOptions }>({
    mutationFn: ({ variantId, options }) => getLicenseAdapter().getCheckoutUrl(variantId, options),
  });
}

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
// Listener Wiring (noop in Lite)
// =============================================================================

export function setupLicenseListener(_queryClient: QueryClient): () => void {
  // No license listener in Lite mode
  return () => {};
}

// =============================================================================
// Cache Helpers
// =============================================================================

export function invalidateLicenseQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: licenseKeys.all });
}
