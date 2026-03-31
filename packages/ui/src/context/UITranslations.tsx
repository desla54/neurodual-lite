'use client';

/**
 * UI Translations Context
 *
 * Context Injection pattern for UI component translations.
 * Eliminates prop drilling and provides type-safe translations.
 */

import { createContext, type ReactNode, useContext } from 'react';

export interface UITranslations {
  modality: {
    position: string;
    audio: string;
    dual: string;
    color: string;
    arithmetic: string;
    image: string;
  };
  controls: {
    keyLabel: string;
    groupLabel: string;
  };
  distractors: {
    addLabel: string;
    enabled: string;
    disabled: string;
    noDistractors: string;
    sectionLabel: string;
    timingLabel: string;
    enabledCheckmark: string;
    timing: {
      synchronized: string;
      fixedOffset: string;
      independent: string;
      random: string;
    };
    modalities: {
      position: string;
      audio: string;
      color: string;
    };
  };
  stimulusStyle: {
    fullSquare: string;
    fullSquareDesc: string;
    nineDots: string;
    nineDotsDesc: string;
  };
  logo: {
    aria: string;
    tagline: string;
  };
  grid: {
    fixationCross: string;
    gridLabel: string;
    cellLabel: string;
    /** Localized word labels for the words modality (key → display text) */
    wordLabels?: Record<string, string>;
  };
  audioGate: {
    tapToEnable: string;
    tapToResume: string;
    loading: string;
  };
}

const UITranslationContext = createContext<UITranslations | null>(null);

export function useUITranslations(): UITranslations {
  const ctx = useContext(UITranslationContext);
  if (!ctx) {
    throw new Error('useUITranslations must be used within UIProvider');
  }
  return ctx;
}

export function UIProvider({
  translations,
  children,
}: {
  translations: UITranslations;
  children: ReactNode;
}) {
  return (
    <UITranslationContext.Provider value={translations}>{children}</UITranslationContext.Provider>
  );
}
