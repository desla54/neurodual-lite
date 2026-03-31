/**
 * Language sync component
 * Keeps i18next in sync with the settings store language preference
 * Also handles RTL direction for Arabic and other RTL languages
 */

import { useEffect, type ReactNode } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { changeLanguage } from '../i18n';

interface LanguageSyncProps {
  children: ReactNode;
}

/**
 * RTL language codes
 */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * Check if a language code is RTL
 */
function isRtlLanguage(langCode: string): boolean {
  return RTL_LANGUAGES.has(langCode);
}

export function LanguageSync({ children }: LanguageSyncProps): ReactNode {
  const language = useSettingsStore((state) => state.ui.language);

  useEffect(() => {
    changeLanguage(language);

    // Update HTML lang attribute
    document.documentElement.lang = language;

    // Update HTML dir attribute for RTL languages
    const isRtl = isRtlLanguage(language);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [language]);

  return children;
}
