import { useCallback } from 'react';
import { useHasPremiumAccess } from '@neurodual/ui';
import { adMobService } from '@/services/admob';

/**
 * Exposes `maybeShowAd()` to call after each session (Back to Home / Play Again).
 * AdMob init + GDPR consent is handled at app root level (app-root.tsx).
 *
 * No-op on web and iOS — safe to use in all game pages.
 */
export function useAdInterstitial() {
  const hasPremium = useHasPremiumAccess();

  const maybeShowAd = useCallback(async () => {
    await adMobService.maybeShow(hasPremium);
  }, [hasPremium]);

  return { maybeShowAd };
}
