/**
 * Settings page - User preferences organized in sections
 *
 * Navigation:
 * - Game: Journey, Mode, Visual, Audio
 * - Account: Profile, Data, Premium
 * - App: Language, Personalization, Notifications, Accessibility, About
 */

import { type ComponentType, type ReactNode, lazy, useEffect } from 'react';
import { SuspenseFade } from '../../components/suspense-fade';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from '@phosphor-icons/react';
import { PageTransition } from '@neurodual/ui';
import { useSettingsStore } from '../../stores';
import {
  DEFAULT_TEST_MODE,
  DEFAULT_TRAINING_MODE,
  isTestGameMode,
  isTrainingGameMode,
  sectionTitles,
} from './config';
import { SettingsMobileNav } from './components';

// Lazy load sections for code splitting
const JourneySection = lazy(() =>
  Promise.resolve({ default: () => null as any }),
);
const ModeSection = lazy(() => import('./sections/mode').then((m) => ({ default: m.ModeSection })));
const VisualSection = lazy(() =>
  import('./sections/visual').then((m) => ({ default: m.VisualSection })),
);
const AudioSection = lazy(() =>
  import('./sections/audio').then((m) => ({ default: m.AudioSection })),
);
const ProfileSection = lazy(async () => {
  const m = await import('./sections/profile');
  const Component = (m.ProfileSection ?? m.default) as ComponentType | undefined;
  if (!Component) {
    throw new Error('[SettingsPage] ./sections/profile does not export ProfileSection');
  }
  return { default: Component };
});
const DataSection = lazy(() => import('./sections/data').then((m) => ({ default: m.DataSection })));
// Premium section removed in Lite
const PremiumSection = lazy(() => Promise.resolve({ default: () => null }));
const LanguageSection = lazy(() =>
  import('./sections/language').then((m) => ({ default: m.LanguageSection })),
);
const PersonalizationSection = lazy(() =>
  import('./sections/personalization').then((m) => ({ default: m.PersonalizationSection })),
);
const NotificationsSection = lazy(() =>
  import('./sections/notifications').then((m) => ({ default: m.NotificationsSection })),
);
const AccessibilitySection = lazy(() =>
  import('./sections/about').then((m) => ({ default: m.AccessibilitySection })),
);
const AboutSection = lazy(() =>
  import('./sections/about').then((m) => ({ default: m.AboutSection })),
);

function SectionSkeleton(): ReactNode {
  return (
    <div className="space-y-4">
      <div className="h-8 rounded-lg w-1/3 skeleton-breathe" />
      <div className="h-32 rounded-xl skeleton-breathe" />
      <div className="h-24 rounded-xl skeleton-breathe" />
    </div>
  );
}

export function SettingsPage(): ReactNode {
  const { t } = useTranslation();
  const { section = 'mode', subSection } = useParams<{
    section?: string;
    subSection?: string;
  }>();
  const navigate = useNavigate();
  const currentMode = useSettingsStore((s) => s.currentMode);
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);

  useEffect(() => {
    if (section === 'mode' && !isTrainingGameMode(currentMode)) {
      setCurrentMode(DEFAULT_TRAINING_MODE);
      return;
    }
    if (section === 'tests' && !isTestGameMode(currentMode)) {
      setCurrentMode(DEFAULT_TEST_MODE);
    }
  }, [currentMode, section, setCurrentMode]);

  const pagePaddingClassName = 'pt-4 pb-8 space-y-6';

  // Render the appropriate section based on URL
  const renderSection = (): ReactNode => {
    return (
      <SuspenseFade fallback={<SectionSkeleton />}>
        {(() => {
          switch (section) {
            case 'journey':
              return <JourneySection />;
            case 'mode':
              return <ModeSection />;
            case 'visual':
              return <VisualSection />;
            case 'audio':
              return <AudioSection />;
            case 'profile':
              return <ProfileSection />;
            case 'data':
              return <DataSection />;
            case 'premium':
              return <PremiumSection />;
            case 'language':
              return <LanguageSection />;
            case 'personalization':
              return <PersonalizationSection />;
            case 'notifications':
              return <NotificationsSection />;
            case 'accessibility':
              return <AccessibilitySection />;
            case 'about':
              return <AboutSection />;
            default:
              return <JourneySection />;
          }
        })()}
      </SuspenseFade>
    );
  };

  const sectionTitle: string = sectionTitles[section] ?? 'settings.nav.journey';
  const isSubPage = subSection != null && subSection.length > 0;

  // Sub-page titles — map raw URL segments to i18n keys + defaults
  const subPageTitleMap: Record<string, [key: string, fallback: string]> = {
    // Mode & Journey shared sub-pages
    mode: ['settings.gameMode.activeMode', 'Choix du mode'],
    presets: ['settings.presets.title', 'Presets'],
    base: ['settings.config.main', 'Configuration du mode'],
    tempo: ['settings.brainworkshop.tempo', 'Tempo'],
    generator: ['settings.brainworkshop.generator', 'Génération'],
    advanced: ['settings.config.advanced', 'Réglages avancés'],
    // Journey-specific
    journeys: ['settings.nav.journey', 'Parcours'],
    profiles: ['settings.nav.profile', 'Profils'],
    // Dyslatéralisation-specific
    trace: ['settings.dyslatéralisation.mirrorSwipe', 'Trace miroir'],
    flow: ['settings.dyslatéralisation.mirrorTimeline', 'Flow miroir'],
    stroop: ['settings.gameMode.stroop', 'Stroop'],
  };
  const subPageEntry = isSubPage ? subPageTitleMap[subSection] : undefined;
  const subPageTitle = subPageEntry ? t(subPageEntry[0], subPageEntry[1]) : null;
  const subPageSubtitleMap: Record<string, [key: string, fallback: string]> = {
    journeys: ['journey.pageSubtitle', 'Choisis, organise et crée tes parcours'],
  };
  const subPageSubtitleEntry = isSubPage ? subPageSubtitleMap[subSection] : undefined;
  const subPageSubtitle = subPageSubtitleEntry
    ? t(subPageSubtitleEntry[0], subPageSubtitleEntry[1])
    : t(sectionTitle);

  return (
    <PageTransition className={pagePaddingClassName}>
      {/* Header - Mobile */}
      <div className="md:hidden -mx-4 px-4 py-3 flex items-center gap-3 min-w-0">
        {isSubPage ? (
          <button
            type="button"
            onClick={() => navigate(`/settings/${section}`, { replace: true })}
            className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/10 text-foreground hover:bg-foreground/15 active:scale-[0.97] transition-all"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
        ) : (
          <div className="shrink-0">
            <SettingsMobileNav currentSection={section} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground">
            {isSubPage ? subPageTitle : t('nav.settings')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSubPage ? subPageSubtitle : t(sectionTitle)}
          </p>
        </div>
      </div>

      {/* Header - Desktop only */}
      {isSubPage ? (
        <div className="hidden md:flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/settings/${section}`, { replace: true })}
            className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/10 text-foreground hover:bg-foreground/15 active:scale-[0.97] transition-all"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-foreground">{subPageTitle}</h2>
            <p className="text-sm text-muted-foreground">{subPageSubtitle}</p>
          </div>
        </div>
      ) : (
        <div className="hidden md:block">
          <h2 className="text-2xl font-bold text-foreground">{t(sectionTitle)}</h2>
        </div>
      )}

      {/* Section Content */}
      <div className="space-y-8">{renderSection()}</div>
    </PageTransition>
  );
}
