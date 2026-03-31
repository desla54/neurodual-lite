import {
  adjustDualTrackPathProfileToPreset,
  createDefaultDualTrackPathProfile,
  restoreDualTrackPathProfile,
  serializeDualTrackPathProfile,
  type DualTrackPathProfile,
} from '@neurodual/logic';
import type { Dispatch, SetStateAction } from 'react';
import { useLayoutEffect } from 'react';
import { useAppPorts } from '../providers';

interface UseDualTrackPathProfileLoadOptions {
  readonly adaptivePathEnabled: boolean;
  readonly calibratedPreset: 'easy' | 'medium' | 'hard' | undefined;
  readonly userId: string;
  readonly storageKey: string;
  readonly setPathLoaded: Dispatch<SetStateAction<boolean>>;
  readonly setPathProfile: Dispatch<SetStateAction<DualTrackPathProfile>>;
}

export function useDualTrackPathProfileLoad({
  adaptivePathEnabled,
  calibratedPreset,
  userId,
  storageKey,
  setPathLoaded,
  setPathProfile,
}: UseDualTrackPathProfileLoadOptions): void {
  const { persistence } = useAppPorts();

  useLayoutEffect(() => {
    let cancelled = false;

    if (!adaptivePathEnabled || !persistence) {
      setPathLoaded(true);
      setPathProfile(createDefaultDualTrackPathProfile());
      return () => {
        cancelled = true;
      };
    }

    setPathLoaded(false);
    const effectivePreset = calibratedPreset ?? 'medium';

    persistence
      .getAlgorithmState(userId, storageKey)
      .then(async (stored) => {
        if (cancelled) return;
        const restored = restoreDualTrackPathProfile(stored?.stateJson);
        const { adjusted, needsUpdate } = adjustDualTrackPathProfileToPreset(
          restored,
          effectivePreset,
        );

        setPathProfile(adjusted);

        if (needsUpdate) {
          try {
            await persistence.saveAlgorithmState(
              userId,
              storageKey,
              serializeDualTrackPathProfile(adjusted),
            );
          } catch {
            // Non-critical persistence refresh.
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPathProfile(createDefaultDualTrackPathProfile());
      })
      .finally(() => {
        if (!cancelled) {
          setPathLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    adaptivePathEnabled,
    calibratedPreset,
    persistence,
    setPathLoaded,
    setPathProfile,
    storageKey,
    userId,
  ]);
}
