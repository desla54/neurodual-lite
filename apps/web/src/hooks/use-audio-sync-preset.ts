/**
 * Hook to sync audioSyncPreset and pinkNoiseLevel settings to the audio service.
 *
 * When the user changes the audioSyncPreset or noise level in settings,
 * this hook updates the audio service config so sounds are loaded
 * from the correct folder and the noise layer is configured.
 */

import type { AudioPreset } from '@neurodual/logic';
import { useMountEffect } from '@neurodual/ui';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Sync audioSyncPreset + pinkNoiseLevel from settings to audioService.
 *
 * Call this hook once in a high-level component (e.g., main layout or game pages).
 * The one-time pink noise info banner is shown by the game page (nback-training.tsx).
 */
export function useAudioSyncPreset(): void {
  const { audio } = useAppPorts();

  useMountEffect(() => {
    const applyAudioPresetConfig = ({
      audioSyncPreset,
      pinkNoiseLevel,
      binauralCarrierHz,
    }: {
      audioSyncPreset: AudioPreset;
      pinkNoiseLevel: number;
      binauralCarrierHz: 200;
    }): void => {
      audio.setConfig({ audioPreset: audioSyncPreset, pinkNoiseLevel, binauralCarrierHz });
    };

    applyAudioPresetConfig({
      audioSyncPreset: useSettingsStore.getState().ui.audioSyncPreset,
      pinkNoiseLevel: useSettingsStore.getState().ui.pinkNoiseLevel,
      binauralCarrierHz: useSettingsStore.getState().ui.binauralCarrierHz ?? 200,
    });

    return useSettingsStore.subscribe(
      (state) => ({
        audioSyncPreset: state.ui.audioSyncPreset,
        pinkNoiseLevel: state.ui.pinkNoiseLevel,
        binauralCarrierHz: state.ui.binauralCarrierHz ?? 200,
      }),
      applyAudioPresetConfig,
    );
  });
}
