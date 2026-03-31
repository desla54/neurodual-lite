/**
 * Home page — simplified mode grid with 4 game modes + tutorial link.
 */

import { getEffectiveModeConfig, getRouteForMode, type GameModeId } from '../lib/mode-metadata';
import {
  cn,
  Logo,
  PageTransition,
  useHasPremiumAccess,
} from '@neurodual/ui';
import {
  BookOpenIcon,
} from '@phosphor-icons/react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useSettingsStore } from '../stores/settings-store';
import { GAME_MODES, type GameModeConfig } from './settings/config';
import { createFreePlayIntent } from '../lib/play-intent';

const modeConfigMap = new Map<string, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

// Categories for the home mode grid
const HOME_CATEGORIES = [
  {
    label: 'Working Memory',
    labelKey: 'settings.gameMode.categoryDualNBack',
    modes: ['dualnback-classic', 'sim-brainworkshop'] as GameModeId[],
  },
  {
    label: 'Inhibition',
    labelKey: 'settings.gameMode.categoryInhibition',
    modes: ['stroop', 'stroop-flex'] as GameModeId[],
  },
] as const;

export function HomePage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasPremium = useHasPremiumAccess();
  const currentMode = useSettingsStore((s) => s.currentMode);
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);

  // Resolve display config for each mode
  const modeCards = useMemo(() => {
    return HOME_CATEGORIES.map((category) => ({
      label: t(category.labelKey, category.label),
      modes: category.modes.map((modeId) => {
        const config = modeConfigMap.get(modeId);
        const route = getRouteForMode(modeId);
        return {
          id: modeId,
          label: config?.labelKey ? t(config.labelKey, modeId) : modeId,
          desc: config?.descKey ? t(config.descKey, '') : '',
          icon: config?.icon,
          colorClass: config?.colorClass ?? 'text-muted-foreground',
          bgClass: config?.bgClass ?? 'bg-muted/30',
          route,
        };
      }),
    }));
  }, [t]);

  const handlePlay = (modeId: GameModeId, route: string) => {
    setCurrentMode(modeId);
    // For n-back modes, append ?mode= param
    if (route === '/nback') {
      navigate(`/nback?mode=${modeId}`, {
        state: createFreePlayIntent(modeId),
      });
    } else {
      navigate(route, {
        state: createFreePlayIntent(modeId),
      });
    }
  };

  return (
    <PageTransition
      className="flex-1 w-full max-w-md md:max-w-lg mx-auto self-stretch text-center"
      data-testid="home-page"
    >
      <div className="relative flex min-h-full w-full flex-col items-center gap-6 pb-8">
        {/* Header / Logo */}
        <div className="w-full pt-16 pb-3 sm:pt-20">
          <div className="px-6 py-4">
            <Logo
              className="w-full max-w-[200px] sm:max-w-[240px] h-auto text-foreground mx-auto"
              ariaLabel={t('home.ariaLabel')}
              showPremiumBadge={hasPremium}
            />
          </div>
        </div>

        {/* Mode Grid */}
        {HOME_CATEGORIES.map((category, catIdx) => (
          <div key={catIdx} className="w-full px-4">
            {/* Category heading */}
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 text-left px-1">
              {t(category.labelKey, category.label)}
            </h2>

            {/* Mode cards grid */}
            <div className="grid grid-cols-2 gap-3">
              {category.modes.map((modeId) => {
                const config = modeConfigMap.get(modeId);
                const route = getRouteForMode(modeId);
                const Icon = config?.icon;
                const label = config?.labelKey ? t(config.labelKey, modeId) : modeId;
                const desc = config?.descKey ? t(config.descKey, '') : '';
                const isActive = currentMode === modeId;

                return (
                  <button
                    key={modeId}
                    type="button"
                    onClick={() => handlePlay(modeId, route)}
                    className={cn(
                      'group relative flex flex-col items-center gap-2 rounded-[18px] border p-4 text-center transition-all',
                      'border-border/50 bg-card/85 shadow-[0_16px_48px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-2xl',
                      'hover:border-border/70 hover:bg-card/95 hover:shadow-[0_20px_56px_-20px_hsl(var(--glass-shadow)/0.45)]',
                      'active:scale-[0.97]',
                      isActive && 'ring-2 ring-primary/40 border-primary/30',
                    )}
                    data-testid={`mode-card-${modeId}`}
                  >
                    {Icon && (
                      <div className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-full',
                        config?.bgClass ?? 'bg-muted/30',
                      )}>
                        <Icon
                          size={24}
                          weight="duotone"
                          className={config?.colorClass ?? 'text-muted-foreground'}
                        />
                      </div>
                    )}
                    <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
                      <span className="text-sm font-semibold text-foreground truncate w-full">
                        {label}
                      </span>
                      {desc && (
                        <span className="text-[11px] leading-tight text-muted-foreground line-clamp-2">
                          {desc}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Tutorial link */}
        <div className="w-full px-4 mt-2">
          <Link
            to="/tutorial"
            className={cn(
              'flex items-center gap-3 rounded-[18px] border p-4 transition-all w-full',
              'border-border/50 bg-card/85 shadow-[0_16px_48px_-24px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-2xl',
              'hover:border-border/70 hover:bg-card/95 hover:shadow-[0_20px_56px_-20px_hsl(var(--glass-shadow)/0.45)]',
              'active:scale-[0.98]',
            )}
            data-testid="tutorial-link"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <BookOpenIcon size={24} weight="duotone" className="text-primary" />
            </div>
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="text-sm font-semibold text-foreground">
                {t('home.tutorial', 'Tutorial')}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {t('home.tutorialDesc', 'Learn how the games work')}
              </span>
            </div>
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
