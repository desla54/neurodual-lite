/**
 * useAudioConfig
 *
 * Synchronizes audio settings (voice, language) from the settings store
 * to the audio service.
 */

import { useMountEffect } from '@neurodual/ui';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

// =============================================================================
// Voice mapping
// =============================================================================

type Voice = 'voice1_femme_standard' | 'voice2_homme_standard';

function voiceIdToVoice(id: number): Voice {
  // Assets shipped in-app only exist for voiceId 1/2. Clamp legacy/invalid values to avoid 404s.
  return id === 2 ? 'voice2_homme_standard' : 'voice1_femme_standard';
}

// =============================================================================
// Language resolution
// =============================================================================

type AudioLanguage = 'fr' | 'en' | 'de' | 'es' | 'pl' | 'ar';

const SUPPORTED_AUDIO_LANGUAGES = new Set<string>(['fr', 'en', 'de', 'es', 'pl', 'ar']);

/**
 * Resolve audio language from setting.
 * If 'auto', uses the app language. Falls back to 'en' if not supported.
 */
function resolveAudioLanguage(audioLanguage: string, appLanguage: string): AudioLanguage {
  // If not 'auto', use the explicit setting (if supported)
  if (audioLanguage !== 'auto') {
    if (SUPPORTED_AUDIO_LANGUAGES.has(audioLanguage)) {
      return audioLanguage as AudioLanguage;
    }
    // Unsupported language, fall back to English
    return 'en';
  }

  // 'auto' mode: use app language if supported
  if (SUPPORTED_AUDIO_LANGUAGES.has(appLanguage)) {
    return appLanguage as AudioLanguage;
  }

  // App language not supported for audio, fall back to English
  return 'en';
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook that keeps audio service config in sync with user settings.
 * Should be called once at app root level.
 */
export function useAudioConfig(): void {
  const { audio } = useAppPorts();

  useMountEffect(() => {
    const applyAudioConfig = ({
      voiceId,
      audioLanguage,
      appLanguage,
    }: {
      voiceId: number;
      audioLanguage: string;
      appLanguage: string;
    }): void => {
      const voice = voiceIdToVoice(voiceId);
      const language = resolveAudioLanguage(audioLanguage, appLanguage);
      audio.setConfig({ voice, language });
    };

    applyAudioConfig({
      voiceId: useSettingsStore.getState().ui.voiceId,
      audioLanguage: useSettingsStore.getState().ui.audioLanguage,
      appLanguage: useSettingsStore.getState().ui.language,
    });

    return useSettingsStore.subscribe(
      (state) => ({
        voiceId: state.ui.voiceId,
        audioLanguage: state.ui.audioLanguage,
        appLanguage: state.ui.language,
      }),
      applyAudioConfig,
    );
  });
}
