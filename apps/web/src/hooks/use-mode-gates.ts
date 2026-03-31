/**
 * useModeGates
 *
 * UI-facing access gates for game modes.
 * Keeps gating logic out of components (no scattered alpha/beta decisions).
 */

import { useCallback, useMemo } from 'react';
import { isGameModeVisibleForAccess, type FeatureAccessFlags } from '../config/mode-reliability';
import { featureFlags } from '../config/feature-flags';
import { useAlphaEnabled, useBetaEnabled } from './use-beta-features';

export interface ModeGates {
  access: FeatureAccessFlags;
  isModePlayable: (modeId: string) => boolean;
}

export function useModeGates(): ModeGates {
  const alphaEnabled = useAlphaEnabled();
  const betaEnabled = useBetaEnabled();

  const access = useMemo<FeatureAccessFlags>(
    () => ({ alphaEnabled, betaEnabled, prototypesEnabled: featureFlags.prototypesEnabled }),
    [alphaEnabled, betaEnabled],
  );

  const isModePlayable = useCallback(
    (modeId: string) => isGameModeVisibleForAccess(modeId, access),
    [access],
  );

  return { access, isModePlayable };
}
