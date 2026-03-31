import { serializeDualTrackPathProfile, type DualTrackPathProfile } from '@neurodual/logic';
import { useLayoutEffect, useRef } from 'react';
import { useAppPorts } from '../providers';

interface UseDualTrackPathRouteOverrideOptions {
  readonly adaptivePathEnabled: boolean;
  readonly pathLoaded: boolean;
  readonly journeyId: string | undefined;
  readonly routeTargetCount: number | undefined;
  readonly routeTierIndex: number | undefined;
  readonly userId: string;
  readonly storageKey: string;
  readonly applyOverride: (
    targetCount: number | undefined,
    tierIndex: number | undefined,
  ) => DualTrackPathProfile | null;
}

export function useDualTrackPathRouteOverride({
  adaptivePathEnabled,
  pathLoaded,
  journeyId,
  routeTargetCount,
  routeTierIndex,
  userId,
  storageKey,
  applyOverride,
}: UseDualTrackPathRouteOverrideOptions): void {
  const { persistence } = useAppPorts();
  const appliedRouteOverrideRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!adaptivePathEnabled || !pathLoaded) return;
    if (typeof routeTargetCount !== 'number' || typeof routeTierIndex !== 'number') return;

    const overrideKey = `${journeyId ?? 'none'}:${routeTargetCount}:${routeTierIndex}`;
    if (appliedRouteOverrideRef.current === overrideKey) return;

    appliedRouteOverrideRef.current = overrideKey;
    const nextProfile = applyOverride(routeTargetCount, routeTierIndex);
    if (!nextProfile || !persistence) return;

    void persistence.saveAlgorithmState(
      userId,
      storageKey,
      serializeDualTrackPathProfile(nextProfile),
    );
  }, [
    adaptivePathEnabled,
    applyOverride,
    journeyId,
    pathLoaded,
    persistence,
    routeTargetCount,
    routeTierIndex,
    storageKey,
    userId,
  ]);
}
