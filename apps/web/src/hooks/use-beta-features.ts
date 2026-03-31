/**
 * Feature reliability hooks.
 *
 * Alpha access is unlock-code gated.
 * Beta access is opt-in (via /beta).
 */

import { useSettingsStore } from '../stores/settings-store';
import { featureFlags } from '../config/feature-flags';

/**
 * Check if beta features are enabled.
 */
export function useBetaEnabled(): boolean {
  const betaEnabled = useSettingsStore((s) => s.ui.betaEnabled);
  return featureFlags.experimentalModesEnabled && betaEnabled;
}

/**
 * Check if alpha features are enabled.
 */
export function useAlphaEnabled(): boolean {
  const alphaEnabled = useSettingsStore((s) => s.ui.alphaEnabled);
  return featureFlags.experimentalModesEnabled && alphaEnabled;
}

/**
 * Unified scoring remains enabled across all tiers.
 */
export function useBetaScoringEnabled(): boolean {
  return true;
}

/**
 * Check if admin dashboard is enabled.
 * Independent from alpha; only admin flag + build availability.
 */
export function useAdminEnabled(): boolean {
  const adminEnabled = useSettingsStore((s) => s.ui.adminEnabled);
  return featureFlags.experimentalModesEnabled && adminEnabled;
}
