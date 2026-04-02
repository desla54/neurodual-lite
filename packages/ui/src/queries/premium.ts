/**
 * Premium Queries
 *
 * TanStack Query hooks for the premium activation system.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ActivationResult,
  DeactivationResult,
  PremiumPort,
  PremiumState,
} from '@neurodual/logic';
import { createDefaultPremiumState } from '@neurodual/logic';

// =============================================================================
// Adapter Reference
// =============================================================================

let premiumAdapter: PremiumPort | null = null;

export function setPremiumAdapter(adapter: PremiumPort): void {
  premiumAdapter = adapter;
}

export function getPremiumAdapter(): PremiumPort | null {
  return premiumAdapter;
}

// =============================================================================
// API URL (fallback for direct fetch when adapter not ready)
// =============================================================================

const API_URL = 'https://neurodual-activation-api.abdeslam-aguilal.workers.dev';

function getDeviceId(): string {
  const stored = localStorage.getItem('nd_premium');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.deviceId) return parsed.deviceId;
    } catch {
      /* ignore */
    }
  }
  const id = crypto.randomUUID();
  localStorage.setItem(
    'nd_premium',
    JSON.stringify({ deviceId: id, activationCode: null, isPremium: false }),
  );
  return id;
}

/** Direct fetch activation — works even if adapter isn't ready */
async function directActivate(code: string): Promise<ActivationResult> {
  const deviceId = getDeviceId();
  try {
    const res = await fetch(`${API_URL}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        deviceId,
        deviceName: navigator.userAgent.slice(0, 60),
      }),
    });

    const data: {
      success?: boolean;
      alreadyActivated?: boolean;
      activationsUsed?: number;
      error?: string;
    } = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: (data.error as ActivationResult['error']) ?? 'network_error',
      };
    }

    // Save locally
    const normalizedCode = code.trim().toUpperCase();
    localStorage.setItem(
      'nd_premium',
      JSON.stringify({
        deviceId,
        activationCode: normalizedCode,
        isPremium: true,
      }),
    );

    return {
      success: true,
      alreadyActivated: data.alreadyActivated,
      activationsUsed: data.activationsUsed,
    };
  } catch (err) {
    console.error('[Premium] Activation fetch failed:', err);
    return { success: false, error: 'network_error' };
  }
}

// =============================================================================
// Query Keys
// =============================================================================

const premiumKeys = {
  all: ['premium'] as const,
  state: () => [...premiumKeys.all, 'state'] as const,
};

// =============================================================================
// Queries
// =============================================================================

export function usePremiumState(): UseQueryResult<PremiumState> {
  return useQuery<PremiumState>({
    queryKey: premiumKeys.state(),
    queryFn: () => {
      if (!premiumAdapter) {
        // Fallback: read from localStorage
        const stored = localStorage.getItem('nd_premium');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.isPremium) {
              return {
                ...createDefaultPremiumState(),
                isPremium: true,
                activationCode: parsed.activationCode,
              };
            }
          } catch {
            /* ignore */
          }
        }
        return createDefaultPremiumState();
      }
      return premiumAdapter.getState();
    },
    staleTime: 30 * 1000,
    placeholderData: createDefaultPremiumState(),
  });
}

export function useIsPremium(): boolean {
  const { data } = usePremiumState();
  return data?.isPremium ?? false;
}

export function useCanAccessNLevel(nLevel: number): boolean {
  if (!premiumAdapter) return true;
  return premiumAdapter.canAccessNLevel(nLevel);
}

// =============================================================================
// Mutations
// =============================================================================

export function useActivateCode(): UseMutationResult<ActivationResult, Error, string> {
  const queryClient = useQueryClient();
  return useMutation<ActivationResult, Error, string>({
    mutationFn: async (code: string) => {
      // Use adapter if available, otherwise direct fetch
      if (premiumAdapter) {
        return premiumAdapter.activate(code);
      }
      return directActivate(code);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: premiumKeys.all });
      }
    },
  });
}

export function useDeactivateDevice(): UseMutationResult<DeactivationResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<DeactivationResult, Error, void>({
    mutationFn: async () => {
      if (!premiumAdapter) return { success: false };
      return premiumAdapter.deactivate();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: premiumKeys.all });
      }
    },
  });
}

export function useVerifyPremium(): UseMutationResult<PremiumState, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<PremiumState, Error, void>({
    mutationFn: async () => {
      if (!premiumAdapter) return createDefaultPremiumState();
      return premiumAdapter.verify();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: premiumKeys.all });
    },
  });
}

// =============================================================================
// Listener Wiring
// =============================================================================

export function setupPremiumListener(queryClient: ReturnType<typeof useQueryClient>): () => void {
  if (!premiumAdapter) return () => {};
  return premiumAdapter.subscribe(() => {
    queryClient.invalidateQueries({ queryKey: premiumKeys.all });
  });
}

export function invalidatePremiumQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: premiumKeys.all });
}
