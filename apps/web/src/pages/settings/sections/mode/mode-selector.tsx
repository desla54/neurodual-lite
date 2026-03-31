/**
 * Game mode selector — featured essentials + categorized grid cards
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CaretDown,
  ChartBar,
  Check,
  Clock,
  Info,
  Lock,
  Play,
  Star,
  TrendUp,
} from '@phosphor-icons/react';
import { BetaBadge, formatDuration, Section } from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import { GAME_MODES, MODE_CATEGORIES, type GameMode, type GameModeConfig } from '../../config';
import { useModeGates } from '../../../../hooks/use-mode-gates';
import { useModeQuickStats, type ModeQuickStats } from '../../../../hooks/use-mode-quick-stats';
import { useLastPlayedMode } from '../../../../hooks/use-last-played-mode';
import { TIER_SORT_ORDER, type ModeTier } from '../../../../config/mode-tiers';

interface GameModeSelectorProps {
  onModeChange?: (mode: GameMode) => void;
  onPlay?: (mode: GameMode) => void;
  variant?: 'section' | 'card';
  lockedModesUi?: 'full' | 'minimal' | 'hidden';
  extraContent?: ReactNode;
  sectionFilter?: 'training' | 'test';
  /** Extra element rendered to the left of the sticky play button */
  stickyExtra?: ReactNode;
}

const modeConfigMap = new Map<GameMode, GameModeConfig>(GAME_MODES.map((m) => [m.value, m]));

function BadgeLabel({
  badge,
  section,
}: {
  badge: 'alpha' | 'beta';
  section?: 'training' | 'test';
}): ReactNode {
  const { t } = useTranslation();
  if (badge === 'alpha') {
    return (
      <span
        className="text-3xs px-1 py-0.5 leading-none font-bold uppercase tracking-wide rounded shrink-0"
        style={{ color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.15)' }}
      >
        {t('settings.badge.alpha', 'Alpha')}
      </span>
    );
  }
  return <BetaBadge size={section === 'test' ? 'xs' : 'sm'} />;
}

function getDisplayedBadge(mode: GameModeConfig): 'alpha' | 'beta' | undefined {
  return mode.badge;
}

const TIER_DOT_CSS_VAR: Record<ModeTier, string> = {
  incontournable: 'var(--woven-amber)',
  notable: 'var(--woven-correct)',
  catalogue: 'var(--woven-purple)',
};

function TierDot({ tier }: { tier: ModeTier }): ReactNode {
  return (
    <span
      className="shrink-0 size-2 rounded-full"
      style={{ backgroundColor: `hsl(${TIER_DOT_CSS_VAR[tier]})` }}
    />
  );
}

type TierFilter = 'all' | ModeTier;

const TIER_FILTERS: TierFilter[] = ['all', 'incontournable', 'notable', 'catalogue'];

const TIER_LABEL_KEYS: Record<TierFilter, string> = {
  all: 'settings.gameMode.tierAll',
  incontournable: 'settings.gameMode.tierIncontournable',
  notable: 'settings.gameMode.tierNotable',
  catalogue: 'settings.gameMode.tierCatalogue',
};

const TIER_CHIP_STYLES: Record<TierFilter, { bg: string; text?: string }> = {
  all: { bg: 'bg-primary', text: 'text-primary-foreground' },
  incontournable: { bg: 'woven-amber' },
  notable: { bg: 'woven-correct' },
  catalogue: { bg: 'woven-purple' },
};

function TierFilterChips({
  value,
  onChange,
  count,
}: {
  value: TierFilter;
  onChange: (v: TierFilter) => void;
  count: number;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TIER_FILTERS.map((tier) => {
        const active = tier === value;
        const style = TIER_CHIP_STYLES[tier];
        const label = t(TIER_LABEL_KEYS[tier]);
        // "all" uses tailwind classes; tier chips use woven CSS vars
        if (active && style.text) {
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(tier)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${style.bg} ${style.text}`}
            >
              {label}
              <span className="ml-1 opacity-70 tabular-nums">{count}</span>
            </button>
          );
        }
        if (active) {
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(tier)}
              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-colors"
              style={{
                backgroundColor: `hsl(${TIER_DOT_CSS_VAR[tier as ModeTier]} / 0.15)`,
                color: `hsl(${TIER_DOT_CSS_VAR[tier as ModeTier]})`,
              }}
            >
              {label}
              <span className="ml-1 opacity-70 tabular-nums">{count}</span>
            </button>
          );
        }
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onChange(tier)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-colors bg-muted/70 text-muted-foreground hover:bg-muted"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const PROGRESS_TARGET = 5;

function ModeProgressBar({ sessions }: { sessions: number }): ReactNode {
  const pct = Math.min(sessions / PROGRESS_TARGET, 1) * 100;
  const fillOpacity = 0.06 + (pct / 100) * 0.1;
  return (
    <div className="w-full h-1 bg-muted/30">
      {pct > 0 && (
        <div
          className="h-full rounded-r-full bg-[hsl(var(--woven-correct))]"
          style={{ width: `${pct}%`, opacity: fillOpacity }}
        />
      )}
    </div>
  );
}

function CardStatsBack({
  stats,
  visible,
  onFlip,
}: {
  stats: ModeQuickStats;
  visible: boolean;
  onFlip: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onFlip}
      className={`absolute inset-0 w-full h-full rounded-xl border border-border/50 bg-card/85 backdrop-blur-lg p-3 flex flex-col items-center justify-center gap-2 text-center transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <ChartBar size={20} weight="duotone" className="text-muted-foreground" />
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-lg font-bold text-foreground tabular-nums">{stats.sessions}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {t('settings.gameMode.sessions', 'sessions')}
        </span>
      </div>
      <div className="flex items-center justify-center gap-3 text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span className="text-[11px] tabular-nums">{formatDuration(stats.totalTimeMs)}</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendUp size={12} />
          <span className="text-[11px] tabular-nums">N{stats.maxLevel}</span>
        </div>
      </div>
    </button>
  );
}

function FeaturedModeCard({
  mode,
  isSelected,
  isLocked,
  isFavorite,
  stats,
  onClick,
  onToggleFavorite,
}: {
  mode: GameModeConfig;
  isSelected: boolean;
  isLocked: boolean;
  isFavorite: boolean;
  stats: ModeQuickStats | undefined;
  onClick: () => void;
  onToggleFavorite: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = mode.icon;
  const sessions = stats?.sessions ?? 0;
  const [flipped, setFlipped] = useState(false);
  const badge = getDisplayedBadge(mode);

  return (
    <div className="relative">
      <div className="relative">
        {/* Front face */}
        <div
          role="button"
          tabIndex={isLocked ? -1 : 0}
          onClick={isLocked ? undefined : onClick}
          onKeyDown={
            isLocked
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') onClick();
                }
          }
          className={`w-full flex flex-col rounded-2xl text-left transition-opacity duration-300 overflow-hidden ${
            flipped ? 'opacity-0 pointer-events-none' : 'opacity-100'
          } ${
            isSelected
              ? 'border-2 border-primary/50 bg-card/85 backdrop-blur-lg ring-1 ring-primary/20 shadow-sm'
              : 'border border-border/50 bg-card/60 backdrop-blur-lg hover:border-primary/20 active:bg-secondary/40'
          } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex items-start gap-3 w-full pe-6 p-3.5 pb-2.5">
            <span className="shrink-0 p-2.5 rounded-xl bg-muted/60 text-muted-foreground">
              <Icon size={22} weight="duotone" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <TierDot tier={mode.tier} />
                <span className="text-sm font-semibold text-foreground">{t(mode.labelKey)}</span>
                {badge && !isLocked && <BadgeLabel badge={badge} section={mode.section} />}
                {isSelected && <Check size={14} weight="bold" className="shrink-0 text-primary" />}
                {isLocked && (
                  <Lock size={12} className="text-muted-foreground shrink-0" weight="bold" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t(mode.descKey)}</p>
            </div>
          </div>
          <ModeProgressBar sessions={sessions} />
        </div>

        {/* Back face — stats */}
        <CardStatsBack
          stats={stats ?? { sessions: 0, totalTimeMs: 0, maxLevel: 1 }}
          visible={flipped}
          onFlip={() => setFlipped(false)}
        />
      </div>

      {/* Overlay — favorite + stats buttons (top-right, side by side) */}
      {!isLocked && (
        <div className="absolute top-2.5 end-2 z-10 flex items-center gap-0.5 pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(!flipped);
            }}
            className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
            aria-label={t('settings.gameMode.stats', 'Stats')}
          >
            <ChartBar size={15} weight="duotone" className="text-muted-foreground/35" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
            aria-label={t('home.favorite', 'Favorite')}
          >
            <Star
              size={15}
              weight={isFavorite ? 'fill' : 'regular'}
              className={isFavorite ? 'text-amber-500' : 'text-muted-foreground'}
            />
          </button>
        </div>
      )}
    </div>
  );
}

function CompactModeCard({
  mode,
  isSelected,
  isLocked,
  isFavorite,
  stats,
  onClick,
  onToggleFavorite,
}: {
  mode: GameModeConfig;
  isSelected: boolean;
  isLocked: boolean;
  isFavorite: boolean;
  stats: ModeQuickStats | undefined;
  onClick: () => void;
  onToggleFavorite: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const Icon = mode.icon;
  const [flipped, setFlipped] = useState(false);
  const sessions = stats?.sessions ?? 0;
  const badge = getDisplayedBadge(mode);

  return (
    <div className="relative h-full">
      <div className="relative h-full">
        {/* Front face */}
        <div
          role="button"
          tabIndex={isLocked ? -1 : 0}
          onClick={isLocked ? undefined : onClick}
          onKeyDown={
            isLocked
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') onClick();
                }
          }
          className={`w-full h-full flex flex-col items-start rounded-xl text-left transition-opacity duration-300 overflow-hidden ${
            flipped ? 'opacity-0 pointer-events-none' : 'opacity-100'
          } ${
            isSelected
              ? 'border-2 border-primary/50 bg-card/85 backdrop-blur-lg ring-1 ring-primary/20 shadow-sm'
              : 'border border-border/50 bg-card/60 backdrop-blur-lg hover:border-primary/20 active:bg-secondary/40'
          } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex flex-col flex-1 p-2.5 pb-2 w-full">
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="shrink-0 p-1.5 rounded-lg bg-muted/60 text-muted-foreground">
                <Icon size={16} weight="duotone" />
              </span>
              {isLocked && <Lock size={12} className="text-muted-foreground" weight="bold" />}
            </div>
            <div className="flex items-center gap-1 min-w-0 w-full">
              <TierDot tier={mode.tier} />
              <span className="text-xs font-semibold text-foreground truncate">
                {t(mode.labelKey)}
              </span>
              {badge && !isLocked && <BadgeLabel badge={badge} section={mode.section} />}
              {isSelected && <Check size={12} weight="bold" className="shrink-0 text-primary" />}
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground mt-0.5 line-clamp-2 w-full">
              {t(mode.descKey)}
            </p>
          </div>
          <div className="mt-auto w-full">
            <ModeProgressBar sessions={sessions} />
          </div>
        </div>

        {/* Back face — stats */}
        <CardStatsBack
          stats={stats ?? { sessions: 0, totalTimeMs: 0, maxLevel: 1 }}
          visible={flipped}
          onFlip={() => setFlipped(false)}
        />
      </div>

      {/* Overlay — stats + favorite buttons (top-right, side by side) */}
      {!isLocked && (
        <div className="absolute top-1.5 end-1 z-10 flex items-center gap-0 pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(!flipped);
            }}
            className="pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
            aria-label={t('settings.gameMode.stats', 'Stats')}
          >
            <ChartBar size={13} weight="duotone" className="text-muted-foreground/35" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-muted/50 active:bg-muted"
            aria-label={t('home.favorite', 'Favorite')}
          >
            <Star
              size={13}
              weight={isFavorite ? 'fill' : 'regular'}
              className={isFavorite ? 'text-amber-500' : 'text-muted-foreground'}
            />
          </button>
        </div>
      )}
    </div>
  );
}

/** Category with top modes visible and rest in a collapsible section */
function CategoryAccordion({
  label,
  totalCount,
  topModes,
  extraModes,
  selectedMode,
  isModePlayable,
  favoriteSet,
  modeStats,
  onModeChange,
  onToggleFavorite,
}: {
  label: string;
  totalCount: number;
  topModes: GameModeConfig[];
  extraModes: GameModeConfig[];
  selectedMode: GameMode | null;
  isModePlayable: (mode: string) => boolean;
  favoriteSet: Set<string>;
  modeStats: Map<string, ModeQuickStats>;
  onModeChange: (mode: GameMode) => void;
  onToggleFavorite: (mode: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const renderCard = (mode: GameModeConfig) => {
    const isSelected = mode.value === selectedMode;
    const isLocked = !isModePlayable(mode.value);
    return (
      <CompactModeCard
        key={mode.value}
        mode={mode}
        isSelected={isSelected}
        isLocked={isLocked}
        isFavorite={favoriteSet.has(mode.value)}
        stats={modeStats.get(mode.value)}
        onClick={() => {
          if (!isLocked) onModeChange(mode.value);
        }}
        onToggleFavorite={() => onToggleFavorite(mode.value)}
      />
    );
  };

  return (
    <div className="space-y-2.5">
      <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
        <span className="ml-1.5 text-muted-foreground/40 tabular-nums font-normal">
          {totalCount}
        </span>
      </h3>
      <div className="grid grid-cols-2 gap-2">{topModes.map(renderCard)}</div>
      {extraModes.length > 0 && (
        <>
          {expanded && <div className="grid grid-cols-2 gap-2">{extraModes.map(renderCard)}</div>}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-center gap-1 w-full py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {expanded
              ? t('common.showLess', 'Show less')
              : `${t('common.showAll', 'Show all')} (${extraModes.length})`}
            <CaretDown
              size={10}
              weight="bold"
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </>
      )}
    </div>
  );
}

export function GameModeSelector({
  onModeChange,
  onPlay,
  variant = 'section',
  lockedModesUi = 'full',
  extraContent,
  sectionFilter,
  stickyExtra,
}: GameModeSelectorProps): ReactNode {
  const { t } = useTranslation();
  const currentMode = useSettingsStore((s) => s.currentMode) as GameMode;
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);
  const favoriteModes = useSettingsStore((s) => s.ui.favoriteModes);
  const toggleFavoriteMode = useSettingsStore((s) => s.toggleFavoriteMode);

  const tierFilter = useSettingsStore((s) => s.ui.modeTierFilter ?? 'all') as TierFilter;
  const setTierFilter = useSettingsStore((s) => s.setModeTierFilter);

  const { isModePlayable } = useModeGates();
  const modeStats = useModeQuickStats();
  const lastPlayedMode = useLastPlayedMode();
  const favoriteSet = new Set(favoriteModes ?? []);

  const visibleModesUnfiltered =
    lockedModesUi === 'hidden'
      ? GAME_MODES.filter((mode) => isModePlayable(mode.value))
      : GAME_MODES;
  const visibleModesBySection =
    sectionFilter != null
      ? visibleModesUnfiltered.filter((mode) => mode.section === sectionFilter)
      : visibleModesUnfiltered;
  const visibleModes =
    lockedModesUi === 'hidden'
      ? visibleModesBySection
      : visibleModesBySection.length > 0
        ? visibleModesBySection
        : sectionFilter != null
          ? GAME_MODES.filter((mode) => mode.section === sectionFilter)
          : GAME_MODES;
  const visibleSet = new Set(visibleModes.map((m) => m.value));

  const selectedMode = visibleSet.has(currentMode) ? currentMode : (visibleModes[0]?.value ?? null);
  const selectedModeConfig = selectedMode ? modeConfigMap.get(selectedMode) : undefined;

  const handleModeChange = (mode: GameMode) => {
    setCurrentMode(mode);
    onModeChange?.(mode);
  };

  // Favorites section: modes starred by the user (ordered by favoriteModes)
  const favoriteConfigs = (favoriteModes ?? [])
    .map((id) => modeConfigMap.get(id as GameMode))
    .filter((m): m is GameModeConfig => m != null && visibleSet.has(m.value));

  const content = (
    <div className="space-y-6">
      {visibleModes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {t('settings.experimental.comingSoon', 'Coming soon')}
          </p>
          {sectionFilter === 'test' ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                'settings.gameMode.testsStableOnlyHint',
                'Tests will appear here when they are available in the stable version.',
              )}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {/* Last played — quick access to the most recent actually-played mode */}
          {(() => {
            if (!lastPlayedMode) return null;
            const lastPlayedConfig = modeConfigMap.get(lastPlayedMode as GameMode);
            if (!lastPlayedConfig || !visibleSet.has(lastPlayedMode as GameMode)) return null;
            const isLocked = !isModePlayable(lastPlayedMode);
            if (isLocked) return null;
            return (
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  {t('settings.gameMode.lastPlayed', 'Last played')}
                </h3>
                <FeaturedModeCard
                  mode={lastPlayedConfig}
                  isSelected={lastPlayedMode === selectedMode}
                  isLocked={false}
                  isFavorite={favoriteSet.has(lastPlayedMode)}
                  stats={modeStats.get(lastPlayedMode as GameMode)}
                  onClick={() => handleModeChange(lastPlayedMode as GameMode)}
                  onToggleFavorite={() => toggleFavoriteMode(lastPlayedMode)}
                />
              </div>
            );
          })()}

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info size={14} weight="bold" className="shrink-0 mt-0.5" />
            <p>
              {t(
                'settings.gameMode.progressHint',
                "The progress bar lets you spot at a glance the modes you've already explored. It fills up over your first 5 sessions.",
              )}
            </p>
          </div>

          <TierFilterChips
            value={tierFilter}
            onChange={setTierFilter}
            count={
              tierFilter === 'all'
                ? visibleModes.length
                : visibleModes.filter((m) => m.tier === tierFilter).length
            }
          />

          {/* Favorites — featured cards (user's selection) */}
          {favoriteConfigs.filter((m) => m.value !== lastPlayedMode).length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('settings.gameMode.selection', 'Favorites')}
              </h3>
              <div className="space-y-2">
                {favoriteConfigs
                  .filter((m) => m.value !== lastPlayedMode)
                  .map((mode) => {
                    const isSelected = mode.value === selectedMode;
                    const isLocked = !isModePlayable(mode.value);
                    return (
                      <FeaturedModeCard
                        key={mode.value}
                        mode={mode}
                        isSelected={isSelected}
                        isLocked={isLocked}
                        isFavorite={true}
                        stats={modeStats.get(mode.value)}
                        onClick={() => {
                          if (!isLocked) handleModeChange(mode.value);
                        }}
                        onToggleFavorite={() => toggleFavoriteMode(mode.value)}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {/* Categories — top modes shown, rest in accordion */}
          {MODE_CATEGORIES.filter((c) =>
            sectionFilter === 'test'
              ? c.section === 'test'
              : sectionFilter === 'training'
                ? c.section !== 'test'
                : true,
          ).map((category) => {
            const categoryModes = category.modes
              .map((id) => modeConfigMap.get(id))
              .filter(
                (m): m is GameModeConfig =>
                  m != null &&
                  visibleSet.has(m.value) &&
                  !favoriteSet.has(m.value) &&
                  m.value !== lastPlayedMode &&
                  (tierFilter === 'all' || m.tier === tierFilter),
              );

            if (categoryModes.length === 0) return null;

            // Sort: tier first (signature → established → exploratory), then most played
            const sorted = [...categoryModes].sort((a, b) => {
              const ta = TIER_SORT_ORDER[a.tier];
              const tb = TIER_SORT_ORDER[b.tier];
              if (ta !== tb) return ta - tb;
              const sa = modeStats.get(a.value)?.sessions ?? 0;
              const sb = modeStats.get(b.value)?.sessions ?? 0;
              if (sb !== sa) return sb - sa;
              return 0; // keep original order for unplayed
            });

            const VISIBLE_COUNT = 4;
            const topModes = sorted.slice(0, VISIBLE_COUNT);
            const extraModes = sorted.slice(VISIBLE_COUNT);

            return (
              <CategoryAccordion
                key={category.labelKey}
                label={t(category.labelKey)}
                totalCount={categoryModes.length}
                topModes={topModes}
                extraModes={extraModes}
                selectedMode={selectedMode}
                isModePlayable={isModePlayable}
                favoriteSet={favoriteSet}
                modeStats={modeStats}
                onModeChange={handleModeChange}
                onToggleFavorite={toggleFavoriteMode}
              />
            );
          })}
        </>
      )}

      {extraContent ? <div>{extraContent}</div> : null}

      {/* Spacer so sticky bar doesn't overlap last cards */}
      {onPlay && selectedModeConfig ? <div className="h-14" /> : null}
    </div>
  );

  const stickyBar =
    onPlay && selectedModeConfig ? (
      <div className="sticky bottom-1 z-20 pointer-events-none flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2">
          {stickyExtra}
          <button
            type="button"
            onClick={() => onPlay(selectedModeConfig.value)}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform"
          >
            <span className={`shrink-0 p-2 rounded-xl bg-primary-foreground/15`}>
              <selectedModeConfig.icon size={20} weight="duotone" />
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">
              {t(selectedModeConfig.labelKey)}
            </span>
            <Play size={22} weight="fill" className="shrink-0" />
          </button>
        </div>
      </div>
    ) : null;

  const wrapped = (
    <>
      {content}
      {stickyBar}
    </>
  );

  if (variant === 'card') return wrapped;
  return <Section title={t('settings.gameMode.activeMode', 'Active mode')}>{wrapped}</Section>;
}
