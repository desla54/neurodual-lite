/**
 * Locales index - Split files merged into single namespace
 *
 * Files are organized by domain for easier editing:
 * - common.json, home.json, settings.json, stats.json, game.json, etc.
 *
 * At runtime, all files are merged into a single 'translation' namespace
 * to maintain backward compatibility with existing t() calls.
 *
 * English is bundled (default language, instant load).
 * Other languages are lazy loaded via dynamic imports (code-split by Vite).
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

// French split files (bundled as secondary fallback)
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
// Note: Keep this in sync with the product default language.
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

// Supported languages (38 languages)
export const supportedLanguages = [
  // Tier 1 - Major Western languages
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿' },
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
  // Tier 2 - CJK + Major non-Latin
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'fa', name: 'فارسی', flag: '🇮🇷', rtl: true },
  { code: 'ur', name: 'اردو', flag: '🇵🇰', rtl: true },
  // Tier 3 - Nordic premium markets
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰' },
  { code: 'no', name: 'Norsk', flag: '🇳🇴' },
  // Tier 4 - South Asia
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'বাংলা', flag: '🇧🇩' },
  { code: 'ta', name: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'मराठी', flag: '🇮🇳' },
  // Tier 5 - Southeast Asia & high-growth mobile
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
  { code: 'my', name: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'km', name: 'ខ្មែរ', flag: '🇰🇭' },
  // Tier 6 - Africa
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
] as const;

/**
 * Load all split files for a language and merge them.
 * Vite will code-split each language into separate chunks.
 */
async function loadAndMerge(lang: string): Promise<Record<string, unknown>> {
  const [common, home, admin, settings, stats, game, tutorial, journey, auth, badges, legal] =
    await Promise.all([
      import(`./${lang}/common.json`).then((m) => m.default),
      import(`./${lang}/home.json`).then((m) => m.default),
      import(`./${lang}/admin.json`).then((m) => m.default),
      import(`./${lang}/settings.json`).then((m) => m.default),
      import(`./${lang}/stats.json`).then((m) => m.default),
      import(`./${lang}/game.json`).then((m) => m.default),
      import(`./${lang}/tutorial.json`).then((m) => m.default),
      import(`./${lang}/journey.json`).then((m) => m.default),
      import(`./${lang}/auth.json`).then((m) => m.default),
      import(`./${lang}/badges.json`).then((m) => m.default),
      import(`./${lang}/legal.json`).then((m) => m.default).catch(() => ({})),
    ]);

  return mergeTranslations(
    common,
    home,
    admin,
    settings,
    stats,
    game,
    tutorial,
    journey,
    auth,
    badges,
    legal,
  );
}

/**
 * Lazy load a locale bundle.
 * Returns merged translations ready for i18next.
 */
export async function loadLocale(lang: string): Promise<Record<string, unknown>> {
  switch (lang) {
    case 'en':
      // Already bundled
      return defaultResources.en.translation;
    case 'fr':
      // Bundled (secondary fallback)
      return defaultResources.fr.translation;
    case 'es':
    case 'de':
    case 'it':
    case 'pt':
    case 'pl':
    case 'zh':
    case 'ja':
    case 'ko':
    case 'ru':
    case 'ar':
    case 'hi':
    case 'tr':
    case 'vi':
    case 'th':
    case 'id':
    case 'nl':
    case 'sv':
    case 'fi':
    case 'uk':
    case 'ms':
    case 'bn':
    case 'fa':
    case 'cs':
    case 'da':
    case 'no':
    case 'ro':
    case 'el':
    case 'hu':
    case 'ta':
    case 'te':
    case 'mr':
    case 'ur':
    case 'sw':
    case 'tl':
    case 'my':
    case 'km':
      return loadAndMerge(lang);
    default:
      console.warn(`Locale "${lang}" not found, falling back to English`);
      return defaultResources.en.translation;
  }
}
