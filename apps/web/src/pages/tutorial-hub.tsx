import { TutorialHub } from '@neurodual/ui';
import { Shuffle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransitionNavigate } from '../hooks/use-transition-navigate';
import { useSettingsStore } from '../stores/settings-store';

export function TutorialHubPage(): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const completedTutorials = useSettingsStore((s) => s.ui.completedTutorials ?? []);

  return (
    <TutorialHub
      onSelect={(id) => transitionNavigate(`/tutorial/${id}`, { direction: 'modal' })}
      completedTutorials={completedTutorials}
      lockedModeIds={[]}
      extraCards={
        <button
          type="button"
          onClick={() => transitionNavigate('/stroop-flex?intro=1', { direction: 'modal' })}
          className="group relative flex items-center gap-4 text-left p-4 rounded-2xl transition-all duration-200 border border-border bg-card hover:bg-secondary/50 hover:border-primary/20 active:scale-[0.98] cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[hsl(var(--woven-magenta)/0.12)]">
            <Shuffle size={22} weight="duotone" className="text-[hsl(var(--woven-magenta))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate text-foreground">
              {t('settings.gameMode.stroopFlex', 'Stroop Flex')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
              {t('settings.gameMode.stroopFlexDesc')}
            </p>
          </div>
        </button>
      }
    />
  );
}
