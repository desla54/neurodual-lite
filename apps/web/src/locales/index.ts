/**
 * Locales index - NeuroDual Lite (EN + FR only)
 *
 * Files are organized by domain for easier editing:
 * - common.json, home.json, settings.json, stats.json, game.json, etc.
 *
 * At runtime, all files are merged into a single 'translation' namespace
 * to maintain backward compatibility with existing t() calls.
 *
 * Both English and French are bundled (no lazy loading needed for 2 languages).
 */

// English split files (bundled - default)
import enCommon from './en/common.json';
import enHome from './en/home.json';
import enAdmin from './en/admin.json';
import enSettings from './en/settings.json';
import enStats from './en/stats.json';
import enGame from './en/game.json';
import enTutorial from './en/tutorial.json';
import enJourney from './en/journey.json';
import enAuth from './en/auth.json';
import enBadges from './en/badges.json';
import enLegal from './en/legal.json';

// French split files (bundled)
import frCommon from './fr/common.json';
import frHome from './fr/home.json';
import frAdmin from './fr/admin.json';
import frSettings from './fr/settings.json';
import frStats from './fr/stats.json';
import frGame from './fr/game.json';
import frTutorial from './fr/tutorial.json';
import frJourney from './fr/journey.json';
import frAuth from './fr/auth.json';
import frBadges from './fr/badges.json';
import frLegal from './fr/legal.json';

// Merge function - combines split files into single object
function mergeTranslations(...parts: Record<string, unknown>[]): Record<string, unknown> {
  return Object.assign({}, ...parts);
}

// Default language (bundled)
export const defaultLocale = 'en';

// Default resources - merged into single 'translation' namespace
export const defaultResources = {
  en: {
    translation: mergeTranslations(
      enCommon,
      enHome,
      enAdmin,
      enSettings,
      enStats,
      enGame,
      enTutorial,
      enJourney,
      enAuth,
      enBadges,
      enLegal,
    ),
  },
  fr: {
    translation: mergeTranslations(
      frCommon,
      frHome,
      frAdmin,
      frSettings,
      frStats,
      frGame,
      frTutorial,
      frJourney,
      frAuth,
      frBadges,
      frLegal,
    ),
  },
};

// Supported languages (NeuroDual Lite: EN + FR only)
export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
] as const;

/**
 * Lazy load a locale bundle.
 * With only 2 languages, both are bundled — no dynamic imports needed.
 */
export async function loadLocale(lang: string): Promise<Record<string, unknown>> {
  switch (lang) {
    case 'en':
      return defaultResources.en.translation;
    case 'fr':
      return defaultResources.fr.translation;
    default:
      console.warn(`Locale "${lang}" not found, falling back to English`);
      return defaultResources.en.translation;
  }
}
