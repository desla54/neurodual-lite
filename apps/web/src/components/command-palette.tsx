import { cn, DialogTitle, useMountEffect } from '@neurodual/ui';
import { Command as CommandPrimitive } from 'cmdk';
import {
  BookOpenText,
  ChartBar,
  ClockCounterClockwise,
  GameController,
  GearSix,
  House,
  Keyboard,
  MagnifyingGlass,
  Trophy,
} from '@phosphor-icons/react';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useAlphaEnabled } from '../hooks/use-beta-features';
import { useModeGates } from '../hooks/use-mode-gates';
import { useTransitionNavigate } from '../hooks/use-transition-navigate';
import { getRouteForMode } from '../lib/mode-metadata';
import {
  ESSENTIAL_MODES,
  GAME_MODES,
  MODE_CATEGORIES,
  getSectionIcon,
  settingsNavGroups,
  type GameMode,
} from '../pages/settings/config';
import { useSettingsStore } from '../stores/settings-store';

interface CommandAction {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly keywords: string[];
  readonly icon: typeof MagnifyingGlass;
  readonly onSelect: () => void;
  readonly toneClassName?: string;
  readonly badge?: 'alpha' | 'beta';
  readonly isCurrent?: boolean;
  readonly modeId?: GameMode;
}

interface CommandPaletteProps {
  readonly chrome?: 'standalone' | 'embedded';
}

const FEATURED_SETTING_IDS = ['mode', 'profile', 'language', 'personalization'] as const;

const RECENTS_STORAGE_KEY = 'neurodual:command-palette-recents';
const MAX_RECENTS_DISPLAY = 5;
const MAX_RECENTS_STORAGE = 12;

interface RecentEntry {
  readonly id: string;
  readonly timestamp: number;
}

function readRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return parsed.slice(0, MAX_RECENTS_STORAGE);
  } catch {
    return [];
  }
}

function pushRecent(actionId: string): void {
  const recents = readRecents().filter((r) => r.id !== actionId);
  recents.unshift({ id: actionId, timestamp: Date.now() });
  if (recents.length > MAX_RECENTS_STORAGE) recents.length = MAX_RECENTS_STORAGE;
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(recents));
  } catch {
    // storage full — ignore
  }
}

const GROUP_HEADING_CLASSNAME =
  'overflow-hidden [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground/90';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function getShortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

export function CommandPalette({ chrome = 'standalone' }: CommandPaletteProps): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const location = useLocation();
  const setCurrentMode = useSettingsStore((state) => state.setCurrentMode);
  const currentMode = useSettingsStore((state) => state.currentMode);
  const isCaptureHybrid =
    useSettingsStore((state) => state.ui.visualThemePreset) === 'capture-hybrid';
  const isAlphaEnabled = useAlphaEnabled();
  const { isModePlayable } = useModeGates();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const shortcutLabel = getShortcutLabel();

  const [recentIds, setRecentIds] = useState<string[]>(() => readRecents().map((r) => r.id));

  // Track navigation to non-game pages
  const isFirstNavRender = useRef(true);
  useEffect(() => {
    if (isFirstNavRender.current) {
      isFirstNavRender.current = false;
      return;
    }
    const path = location.pathname;
    let actionId: string | undefined;

    if (path === '/') {
      actionId = 'nav:home';
    } else if (path === '/stats') {
      actionId = 'nav:stats';
    } else if (path === '/social') {
      actionId = 'nav:social';
    } else if (path === '/tutorial') {
      actionId = 'nav:tutorial';
    } else if (path === '/settings') {
      actionId = 'nav:settings';
    } else if (path.startsWith('/settings/')) {
      const section = decodeURIComponent(path.replace('/settings/', ''));
      actionId = `settings:${section}`;
    }

    if (actionId) {
      pushRecent(actionId);
      setRecentIds(readRecents().map((r) => r.id));
    }
  }, [location.pathname]);

  // Track mode changes (game routes) — fires when user starts playing a mode
  const isFirstModeRender = useRef(true);
  useEffect(() => {
    if (isFirstModeRender.current) {
      isFirstModeRender.current = false;
      return;
    }
    if (currentMode) {
      pushRecent(`mode:${currentMode}`);
      setRecentIds(readRecents().map((r) => r.id));
    }
  }, [currentMode]);

  useMountEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  // Close palette and clear search on navigation change
  const onLocationChange = useEffectEvent(() => {
    setOpen(false);
    setSearch('');
  });

  useEffect(() => {
    onLocationChange();
  }, [location.pathname, location.search]);

  const categoryLabelByMode = useMemo(() => {
    const next = new Map<GameMode, string>();
    for (const category of MODE_CATEGORIES) {
      const label = t(category.labelKey);
      for (const mode of category.modes) {
        next.set(mode, label);
      }
    }
    return next;
  }, [t]);

  const navigationActions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'nav:home',
        label: t('common.home', 'Home'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['home', '/', 'dashboard'],
        icon: House,
        onSelect: () => transitionNavigate('/'),
      },
      {
        id: 'nav:play',
        label: t('nav.play', 'Play'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['play', 'train', 'home'],
        icon: GameController,
        onSelect: () => transitionNavigate('/'),
      },
      {
        id: 'nav:stats',
        label: t('nav.stats', 'Stats'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['stats', 'history', 'progress'],
        icon: ChartBar,
        onSelect: () => transitionNavigate('/stats'),
      },
      {
        id: 'nav:social',
        label: t('nav.social', 'Leaderboard'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['social', 'leaderboard', 'ranking'],
        icon: Trophy,
        onSelect: () => transitionNavigate('/social'),
      },
      {
        id: 'nav:tutorial',
        label: t('nav.tutorial', 'Tutorial'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['tutorial', 'help', 'guide'],
        icon: BookOpenText,
        onSelect: () => transitionNavigate('/tutorial'),
      },
      {
        id: 'nav:settings',
        label: t('nav.settings', 'Settings'),
        subtitle: t('commandPalette.openPage', 'Open page'),
        keywords: ['settings', 'preferences', 'options'],
        icon: GearSix,
        onSelect: () => transitionNavigate('/settings'),
      },
    ],
    [t, transitionNavigate],
  );

  const settingsActions = useMemo<CommandAction[]>(() => {
    return settingsNavGroups.flatMap((group) =>
      group.items
        .filter((item) => !item.alphaOnly || isAlphaEnabled)
        .map((item) => ({
          id: `settings:${item.id}`,
          label: t(item.labelKey),
          subtitle: t('commandPalette.openSettings', 'Open settings'),
          keywords: [group.id, item.id, 'settings', t(group.labelKey)],
          icon: getSectionIcon(item.id),
          onSelect: () => transitionNavigate(`/settings/${encodeURIComponent(item.id)}`),
        })),
    );
  }, [isAlphaEnabled, t, transitionNavigate]);

  const featuredSettingIdSet = useMemo(() => new Set<string>(FEATURED_SETTING_IDS), []);
  const visibleSettingsActions = useMemo(() => {
    if (search.trim().length > 0) {
      return settingsActions;
    }

    const featured = settingsActions.filter((action) =>
      featuredSettingIdSet.has(action.id.replace('settings:', '')),
    );
    return [...featured].sort((left, right) => {
      const leftIndex = FEATURED_SETTING_IDS.indexOf(left.id.replace('settings:', '') as never);
      const rightIndex = FEATURED_SETTING_IDS.indexOf(right.id.replace('settings:', '') as never);
      return leftIndex - rightIndex;
    });
  }, [featuredSettingIdSet, search, settingsActions]);

  const modeActions = useMemo<CommandAction[]>(() => {
    return GAME_MODES.filter((mode) => isModePlayable(mode.value))
      .map((mode) => {
        const categoryLabel = categoryLabelByMode.get(mode.value) ?? t('nav.play', 'Play');
        const description = t(mode.descKey);
        const displayedBadge =
          mode.reliability === 'alpha' || mode.reliability === 'beta'
            ? mode.reliability
            : undefined;

        return {
          id: `mode:${mode.value}`,
          label: t(mode.labelKey),
          subtitle: categoryLabel,
          keywords: [
            mode.value,
            description,
            categoryLabel,
            mode.section,
            mode.reliability ?? '',
            displayedBadge ?? '',
          ],
          icon: mode.icon,
          onSelect: () => {
            setCurrentMode(mode.value);
            transitionNavigate(getRouteForMode(mode.value), { direction: 'modal' });
          },
          toneClassName: cn(mode.colorClass, 'bg-transparent'),
          badge: displayedBadge,
          isCurrent: currentMode === mode.value,
          modeId: mode.value,
        };
      })
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
      );
  }, [categoryLabelByMode, currentMode, isModePlayable, setCurrentMode, t, transitionNavigate]);

  const essentialModeSet = useMemo(() => new Set<GameMode>(ESSENTIAL_MODES), []);
  const visibleModeActions = useMemo(() => {
    if (search.trim().length > 0) {
      return modeActions;
    }

    const featured = modeActions.filter(
      (action) => action.modeId && essentialModeSet.has(action.modeId),
    );
    return [...featured].sort((left, right) => {
      const leftIndex = ESSENTIAL_MODES.indexOf(left.modeId ?? 'dualnback-classic');
      const rightIndex = ESSENTIAL_MODES.indexOf(right.modeId ?? 'dualnback-classic');
      return leftIndex - rightIndex;
    });
  }, [essentialModeSet, modeActions, search]);

  const allActionsById = useMemo(() => {
    const map = new Map<string, CommandAction>();
    for (const a of navigationActions) map.set(a.id, a);
    for (const a of settingsActions) map.set(a.id, a);
    for (const a of modeActions) map.set(a.id, a);
    return map;
  }, [navigationActions, settingsActions, modeActions]);

  const recentActions = useMemo<CommandAction[]>(() => {
    if (search.trim().length > 0) return [];
    const actions: CommandAction[] = [];
    for (const id of recentIds) {
      const action = allActionsById.get(id);
      if (action) actions.push(action);
    }
    return actions.slice(0, MAX_RECENTS_DISPLAY);
  }, [allActionsById, recentIds, search]);

  const recentIdSet = useMemo(() => new Set(recentActions.map((a) => a.id)), [recentActions]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-capture-control={chrome === 'embedded' ? 'toolbar-button' : undefined}
        className={cn(
          chrome === 'embedded'
            ? 'flex h-9 w-9 items-center justify-center rounded-full text-foreground transition duration-200 hover:bg-foreground/6 active:scale-95'
            : 'shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-woven-border bg-woven-surface text-foreground shadow-sm transition duration-200 hover:bg-woven-surface active:scale-95',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        )}
        aria-label={t('commandPalette.open', 'Quick search')}
        title={`${t('commandPalette.open', 'Quick search')} (${shortcutLabel})`}
      >
        <MagnifyingGlass
          size={chrome === 'embedded' && isCaptureHybrid ? 20 : 18}
          weight="bold"
          className={
            isCaptureHybrid && chrome === 'embedded' ? 'text-foreground' : 'text-muted-foreground'
          }
        />
      </button>

      <CommandPrimitive.Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
        label={t('commandPalette.title', 'Quick search')}
        overlayClassName="fixed inset-0 z-[110] bg-black/35 md:bg-black/18"
        contentClassName={cn(
          'fixed left-1/2 top-[max(0.75rem,6vh)] z-[111] w-[calc(100vw-1rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[22px] border border-border/50 bg-card shadow-[0_24px_70px_-36px_hsl(var(--border)/0.45)] outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out duration-200',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        )}
        loop
      >
        <CommandPrimitive className="overflow-hidden" shouldFilter>
          <DialogTitle className="sr-only">{t('commandPalette.title', 'Quick search')}</DialogTitle>
          <div className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MagnifyingGlass size={16} weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
                {t('commandPalette.title', 'Quick search')}
              </div>
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                className="mt-0.5 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={t('commandPalette.placeholder', 'Search a page, setting or mode...')}
              />
            </div>
            <div className="hidden sm:flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <Keyboard size={13} weight="bold" />
              <span>{shortcutLabel}</span>
            </div>
          </div>

          <CommandPrimitive.List className="max-h-[min(64vh,28rem)] overflow-y-auto p-2">
            <CommandPrimitive.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('commandPalette.empty', 'No result')}
            </CommandPrimitive.Empty>

            {recentActions.length > 0 && (
              <>
                <CommandPrimitive.Group
                  heading={t('commandPalette.recents', 'Recents')}
                  className={GROUP_HEADING_CLASSNAME}
                >
                  {recentActions.map((action) => (
                    <PaletteItem
                      key={`recent:${action.id}`}
                      action={{ ...action, id: `recent:${action.id}` }}
                      valuePrefix="recent:"
                      icon={ClockCounterClockwise}
                      onSelect={() => {
                        setOpen(false);
                        action.onSelect();
                      }}
                    />
                  ))}
                </CommandPrimitive.Group>
                <CommandPrimitive.Separator className="my-1.5 h-px bg-border/50" />
              </>
            )}

            <CommandPrimitive.Group
              heading={t('commandPalette.modes', 'Modes')}
              className={GROUP_HEADING_CLASSNAME}
            >
              {visibleModeActions
                .filter((a) => !recentIdSet.has(a.id))
                .map((action) => (
                  <PaletteItem
                    key={action.id}
                    action={action}
                    onSelect={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                  />
                ))}
            </CommandPrimitive.Group>

            <CommandPrimitive.Separator className="my-1.5 h-px bg-border/50" />

            <CommandPrimitive.Group
              heading={t('commandPalette.settings', 'Settings')}
              className={GROUP_HEADING_CLASSNAME}
            >
              {visibleSettingsActions
                .filter((a) => !recentIdSet.has(a.id))
                .map((action) => (
                  <PaletteItem
                    key={action.id}
                    action={action}
                    onSelect={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                  />
                ))}
            </CommandPrimitive.Group>

            <CommandPrimitive.Separator className="my-1.5 h-px bg-border/50" />

            <CommandPrimitive.Group
              heading={t('commandPalette.navigation', 'Navigation')}
              className={GROUP_HEADING_CLASSNAME}
            >
              {navigationActions
                .filter((a) => !recentIdSet.has(a.id))
                .map((action) => (
                  <PaletteItem
                    key={action.id}
                    action={action}
                    onSelect={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                  />
                ))}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>
        </CommandPrimitive>
      </CommandPrimitive.Dialog>
    </>
  );
}

function PaletteItem({
  action,
  icon,
  valuePrefix,
  onSelect,
}: {
  readonly action: CommandAction;
  readonly icon?: typeof MagnifyingGlass;
  readonly valuePrefix?: string;
  readonly onSelect: () => void;
}): ReactNode {
  const Icon = icon ?? action.icon;
  const { t } = useTranslation();

  return (
    <CommandPrimitive.Item
      value={`${valuePrefix ?? ''}${action.label}`}
      keywords={action.keywords}
      onSelect={onSelect}
      className={cn(
        'group flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none',
        'data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/65 text-muted-foreground transition-colors group-data-[selected=true]:bg-primary/12">
        <Icon size={18} weight="bold" className={action.toneClassName} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{action.label}</span>
          {action.badge ? (
            <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {action.badge}
            </span>
          ) : null}
          {action.isCurrent ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
              {t('commandPalette.current', 'Current')}
            </span>
          ) : null}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{action.subtitle}</div>
      </div>
    </CommandPrimitive.Item>
  );
}
