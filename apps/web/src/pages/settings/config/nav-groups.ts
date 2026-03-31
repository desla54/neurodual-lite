/**
 * Settings navigation configuration
 */

import {
  ArrowsLeftRight,
  Exam,
  Crown,
  Database,
  Eye,
  GearSix,
  Globe,
  HandWaving,
  Heart,
  Info,
  MapTrifold,
  Bell,
  Palette,
  SpeakerHigh,
  SquaresFour,
  User,
} from '@phosphor-icons/react';
import { featureFlags } from '../../../config/feature-flags';

export interface SettingsNavItem {
  id: string;
  labelKey: string;
  icon: typeof GearSix;
  /** If true, only shown when alpha is enabled */
  alphaOnly?: boolean;
}

export interface SettingsNavGroup {
  id: string;
  labelKey: string;
  items: SettingsNavItem[];
}

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    id: 'game',
    labelKey: 'settings.nav.game',
    items: [
      { id: 'mode', labelKey: 'settings.nav.mode', icon: SquaresFour },
      { id: 'journey', labelKey: 'settings.nav.journey', icon: MapTrifold },
      { id: 'tests', labelKey: 'settings.nav.tests', icon: Exam },
      {
        id: 'dyslatéralisation',
        labelKey: 'settings.nav.dyslatéralisation',
        icon: ArrowsLeftRight,
        alphaOnly: true,
      },
      { id: 'visual', labelKey: 'settings.nav.visual', icon: Eye },
      { id: 'audio', labelKey: 'settings.nav.audio', icon: SpeakerHigh },
    ],
  },
  {
    id: 'account',
    labelKey: 'settings.nav.account',
    items: [
      { id: 'profile', labelKey: 'settings.nav.profile', icon: User },
      { id: 'data', labelKey: 'settings.nav.data', icon: Database },
      {
        id: 'premium',
        labelKey: featureFlags.premiumEnabled ? 'settings.nav.premium' : 'settings.nav.support',
        icon: featureFlags.premiumEnabled ? Crown : Heart,
      },
    ],
  },
  {
    id: 'app',
    labelKey: 'settings.nav.app',
    items: [
      { id: 'language', labelKey: 'settings.nav.language', icon: Globe },
      { id: 'personalization', labelKey: 'settings.nav.personalization', icon: Palette },
      { id: 'notifications', labelKey: 'settings.nav.notifications', icon: Bell },
      { id: 'accessibility', labelKey: 'settings.nav.accessibility', icon: HandWaving },
      { id: 'about', labelKey: 'settings.nav.about', icon: Info },
    ],
  },
];

/** Get icon for a section */
export function getSectionIcon(sectionId: string): typeof GearSix {
  for (const group of settingsNavGroups) {
    const item = group.items.find((i) => i.id === sectionId);
    if (item) return item.icon;
  }
  return GearSix;
}

/** Section titles - Maps section ID to translation keys */
export const sectionTitles: Record<string, string> = {
  journey: 'settings.nav.journey',
  mode: 'settings.nav.mode',
  tests: 'settings.nav.tests',
  dyslatéralisation: 'settings.nav.dyslatéralisation',
  visual: 'settings.nav.visual',
  audio: 'settings.nav.audio',
  profile: 'settings.nav.profile',
  data: 'settings.nav.data',
  premium: featureFlags.premiumEnabled ? 'settings.nav.premium' : 'settings.nav.support',
  language: 'settings.nav.language',
  personalization: 'settings.nav.personalization',
  notifications: 'settings.nav.notifications',
  accessibility: 'settings.nav.accessibility',
  about: 'settings.nav.about',
};
