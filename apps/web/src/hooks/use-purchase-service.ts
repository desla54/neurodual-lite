/**
 * Hook to access the PurchaseService instance.
 * Returns null on web (purchases only available on native).
 */

import { useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { createPurchaseService, type PurchaseServiceInstance } from '@/services/purchase-service';
import { getPremiumAdapter } from '@neurodual/ui';
import { env } from '@/env';

export function usePurchaseService(): PurchaseServiceInstance | null {
  return useMemo(() => {
    if (!Capacitor.isNativePlatform()) return null;

    const premiumAdapter = getPremiumAdapter();

    return createPurchaseService({
      apiUrl: env.VITE_ACTIVATION_API_URL,
      getDeviceId: () => premiumAdapter?.getDeviceId() ?? crypto.randomUUID(),
      getDeviceName: () => navigator.userAgent.slice(0, 60),
      onActivated: async (code: string) => {
        if (premiumAdapter) {
          await premiumAdapter.activate(code);
        }
      },
    });
  }, []);
}
