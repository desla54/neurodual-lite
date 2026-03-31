/**
 * Audio configuration for settings
 */

/** Languages with available audio packs */
export const audioLanguages = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
] as const;

/** Voice options (voiceId 1 = femme, voiceId 2 = homme) */
export const voiceOptions = [
  { id: 1, labelKey: 'settings.audio.voiceFemale' },
  { id: 2, labelKey: 'settings.audio.voiceMale' },
] as const;
