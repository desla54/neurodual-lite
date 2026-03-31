/**
 * useCalibrationActions — Encapsulates command bus interactions for
 * calibration reset and skip (set baseline).
 *
 * After each command, applies the same state change directly to
 * cognitive_profile_projection so the UI updates immediately
 * (same pattern as deleteSession writing directly to session_summaries).
 */

import { START_LEVEL } from '@neurodual/logic';
import { useCallback, useRef, useState } from 'react';
import { useCommandBus, usePersistence } from '../providers';
import type { CalibrationModality, CalibrationGameMode } from '@neurodual/logic';

interface CalibrationActions {
  readonly skipCalibration: () => Promise<void>;
  readonly resetProfile: () => Promise<void>;
  readonly recordModalityResult: (
    modality: CalibrationModality,
    gameMode: CalibrationGameMode,
    masteredLevel: number,
  ) => Promise<void>;
  readonly isSkipping: boolean;
  readonly isResetting: boolean;
  readonly resetError: string | null;
  readonly clearResetError: () => void;
}

export function useCalibrationActions(userId: string): CalibrationActions {
  const commandBus = useCommandBus();
  const persistence = usePersistence();
  const [isSkipping, setIsSkipping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const recordingRef = useRef(false);

  const skipCalibration = useCallback(async () => {
    if (!commandBus || isSkipping) return;
    const timestamp = Date.now();

    setIsSkipping(true);
    try {
      await commandBus.handle({
        type: 'CALIBRATION/SET_BASELINE',
        data: {
          userId,
          event: {
            id: crypto.randomUUID(),
            type: 'CALIBRATION_BASELINE_SET',
            timestamp,
            userId,
            level: START_LEVEL,
          },
        },
        metadata: {
          commandId: crypto.randomUUID(),
          timestamp: new Date(timestamp),
          userId,
        },
      });
      // Direct write to projection table for immediate UI update
      const { applyBaselineDirectly } = await import('@neurodual/infra');
      const p = persistence as { getPowerSyncDb?: () => Promise<unknown> } | null;
      if (p?.getPowerSyncDb) {
        const db = await p.getPowerSyncDb();
        await applyBaselineDirectly(db as never, userId, START_LEVEL);
      }
    } finally {
      setIsSkipping(false);
    }
  }, [commandBus, isSkipping, persistence, userId]);

  const resetProfile = useCallback(async () => {
    if (!commandBus || isResetting) return;
    const timestamp = Date.now();

    setIsResetting(true);
    setResetError(null);
    try {
      await commandBus.handle({
        type: 'CALIBRATION/RESET',
        data: {
          userId,
          event: {
            id: crypto.randomUUID(),
            type: 'CALIBRATION_RESET',
            timestamp,
            userId,
          },
        },
        metadata: {
          commandId: crypto.randomUUID(),
          timestamp: new Date(timestamp),
          userId,
        },
      });
      // Direct write to projection table for immediate UI update
      const { applyResetDirectly } = await import('@neurodual/infra');
      const p = persistence as { getPowerSyncDb?: () => Promise<unknown> } | null;
      if (p?.getPowerSyncDb) {
        const db = await p.getPowerSyncDb();
        await applyResetDirectly(db as never, userId);
      }
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'La réinitialisation a échoué.');
    } finally {
      setIsResetting(false);
    }
  }, [commandBus, isResetting, persistence, userId]);

  const recordModalityResult = useCallback(
    async (modality: CalibrationModality, gameMode: CalibrationGameMode, masteredLevel: number) => {
      if (!commandBus || recordingRef.current) return;
      const timestamp = Date.now();
      recordingRef.current = true;
      try {
        await commandBus.handle({
          type: 'CALIBRATION/MODALITY_DETERMINED',
          data: {
            userId,
            event: {
              id: crypto.randomUUID(),
              type: 'CALIBRATION_MODALITY_DETERMINED',
              timestamp,
              userId,
              modality,
              gameMode,
              masteredLevel,
            },
          },
          metadata: {
            commandId: crypto.randomUUID(),
            timestamp: new Date(timestamp),
            userId,
          },
        });
      } finally {
        recordingRef.current = false;
      }
    },
    [commandBus, userId],
  );

  const clearResetError = useCallback(() => setResetError(null), []);

  return {
    skipCalibration,
    resetProfile,
    recordModalityResult,
    isSkipping,
    isResetting,
    resetError,
    clearResetError,
  };
}
