/**
 * i18n configuration
 *
 * - French is bundled (default, instant)
 * - Other languages are lazy loaded on demand
 * - Integrates with settings store for persistence
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultLocale, defaultResources, loadLocale, supportedLanguages } from './locales';

// Extract supported language codes for i18next config
const supportedLngs = supportedLanguages.map((lang) => lang.code);

// Deduplication set for missing key warnings (avoids StrictMode spam)
// Keyed by "lng:ns:key".
const reportedMissingKeys = new Set<string>();

// Initialize i18next with French bundled
i18n.use(initReactI18next).init({
  resources: defaultResources,
  lng: defaultLocale,
  // Fallback strategy:
  // - French stays self-contained (fr -> en)
  // - Other languages fall back to English (then French as last resort)
  fallbackLng: {
    fr: ['fr', 'en'],
    default: ['en', 'fr'],
  },

  // Supported languages - prevents unexpected locale codes
  supportedLngs,

  // Load language only (e.g., 'fr' not 'fr-FR') - matches our locale files
  load: 'languageOnly',

  // Not all bundles are loaded at init (lazy loading)
  partialBundledLanguages: true,

  interpolation: {
    escapeValue: false, // React already escapes
  },

  // Missing key handling (dev only, deduplicated to avoid StrictMode spam)
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, ns, key, fallbackValue) => {
        const lng = Array.isArray(lngs) ? (lngs[0] ?? 'unknown') : String(lngs);
        const keyText = Array.isArray(key)
          ? key.join('|')
          : typeof key === 'string'
            ? key
            : key && typeof key === 'object'
              ? JSON.stringify(key)
              : String(key);
        const dedupeId = `${lng}:${String(ns)}:${keyText}`;
        if (reportedMissingKeys.has(dedupeId)) return;
        reportedMissingKeys.add(dedupeId);

        const fallback =
          fallbackValue === undefined || fallbackValue === null || fallbackValue === ''
            ? '(no default)'
            : String(fallbackValue);

        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing key ${lng}:${String(ns)}:${keyText} (${fallback})`);
      }
    : undefined,

  react: {
    useSuspense: false, // Avoid suspense boundary issues on mobile
  },
});

/**
 * Change language with lazy loading.
 * If the language bundle isn't loaded yet, it will be fetched and added.
 */
export async function changeLanguage(lang: string): Promise<void> {
  // Check if language resources are already loaded
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    try {
      const resources = await loadLocale(lang);
      i18n.addResourceBundle(lang, 'translation', resources);
    } catch (error) {
      console.error(`Failed to load locale "${lang}":`, error);
      return; // Keep current language on error
    }
  }

  // Ensure English is available as a fallback for non-English languages.
  // (Bundles are lazy-loaded; i18next won't fetch fallback languages for us.)
  if (lang !== 'en' && !i18n.hasResourceBundle('en', 'translation')) {
    try {
      const enResources = await loadLocale('en');
      i18n.addResourceBundle('en', 'translation', enResources);
    } catch (error) {
      console.error('Failed to load fallback locale "en":', error);
      // Non-fatal: keep going, user still gets primary language.
    }
  }

  await i18n.changeLanguage(lang);
}

export default i18n;
