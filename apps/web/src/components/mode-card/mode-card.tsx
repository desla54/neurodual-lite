/**
 * ModeCard — generic "encyclopedic card" for any game mode / cognitive test.
 *
 * Layout zones (mirrors OspanMeasure):
 * 1. Identity   — avatar, mode label, player name, player stats, subtitle chips
 * 2. CTA        — launch / re-launch action
 * 3. Scores     — secondary (1/3 left) + primary (2/3 right)
 * 4. Stats row  — configurable stat pills
 * 5. History    — session list (free-form ReactNode)
 * 6. Protocol   — how the test works (step-by-step)
 * 7. Why        — scientific rationale
 * 8. Chart 1    — optional (e.g. score gauge, performance graph)
 * 9. Chart 2    — optional (e.g. age norms, comparison chart)
 */

import type { ReactNode } from 'react';
import { Avatar, Hatching, cn, useAuthQuery } from '@neurodual/ui';
import { ClockCountdown, Play, X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModeCardScore {
  /** Display value — ReactNode for full flexibility (text, CircularScore, etc.) */
  readonly value: ReactNode;
  /** Label shown above the value */
  readonly label: string;
  /** Optional color class (defaults to text-foreground) */
  readonly color?: string;
}

export interface ModeCardStat {
  readonly label: string;
  readonly value: ReactNode;
  /** Optional color class for the value */
  readonly color?: string;
}

export interface ModeCardChartSection {
  /** Section title (uppercase label) */
  readonly title: string;
  /** Optional italic description below the title */
  readonly description?: string;
  /** Chart content (SVG, canvas, anything) */
  readonly content: ReactNode;
}

export interface ModeCardCtaProps {
  /** Label above the button (e.g. "Mesure 3") */
  readonly label?: string;
  /** Right-side secondary label (e.g. "Il y a 5 j") */
  readonly secondaryLabel?: string;
  /** Title text */
  readonly title: string;
  /** Subtitle / hint text */
  readonly subtitle?: string;
  /** Icon shown in the circle left of the text (defaults to ClockCountdown) */
  readonly icon?: ReactNode;
  /** Background tint variant */
  readonly variant?: 'blue' | 'green';
  /** Click handler for the play button */
  readonly onPlay: () => void;
}

export interface ModeCardProps {
  /** Mode display label (e.g. "Évaluation mémoire de travail") */
  readonly modeLabel: string;
  /** Stats shown below the player name (e.g. "Dernier empan 5 · Record 6") */
  readonly playerStats?: ReactNode;
  /** Mode technical subtitle shown below identity (e.g. "Operation Span") */
  readonly modeSubtitle?: string;
  /** Extra chips next to the subtitle (e.g. "12 mesures valides · 2 invalidées") */
  readonly subtitleChips?: readonly string[];

  /** CTA configuration — omit to hide the CTA zone */
  readonly cta?: ModeCardCtaProps;

  /** Left score (1/3 width — typically the secondary/smaller metric) */
  readonly leftScore?: ModeCardScore;
  /** Right score (2/3 width — typically the primary/bigger metric) */
  readonly rightScore?: ModeCardScore;
  /** Warning banner below scores (e.g. processing accuracy warning) */
  readonly scoreWarning?: ReactNode;

  /** Row of stat pills */
  readonly stats?: readonly ModeCardStat[];

  /** Session history — render as ReactNode for full flexibility */
  readonly history?: ReactNode;

  /** Protocol steps (how the test works) */
  readonly protocol?: {
    readonly steps: readonly string[];
    /** Optional estimated duration string (e.g. "Durée estimée : 5 minutes") */
    readonly duration?: string;
  };

  /** Why this test — scientific rationale paragraphs */
  readonly why?: {
    readonly paragraphs: readonly string[];
  };

  /** Optional chart sections (score gauge, age norms, performance graph…) */
  readonly chart1?: ModeCardChartSection;
  readonly chart2?: ModeCardChartSection;

  /** Extra sections rendered after chart2 */
  readonly extra?: ReactNode;

  /** Optional badge shown after the mode label (e.g. Beta) */
  readonly badge?: ReactNode;

  /** Close handler — shows close button when provided */
  readonly onClose?: () => void;

  /** Unique prefix for Hatching IDs to avoid DOM conflicts */
  readonly hatchPrefix?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ModeCard({
  modeLabel,
  playerStats,
  modeSubtitle,
  subtitleChips,
  cta,
  leftScore,
  rightScore,
  scoreWarning,
  stats,
  history,
  protocol,
  why,
  chart1,
  chart2,
  extra,
  badge,
  onClose,
  hatchPrefix = 'mc',
}: ModeCardProps): ReactNode {
  const { t } = useTranslation();
  const authState = useAuthQuery();
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);

  const authProfile = authState.status === 'authenticated' ? authState.profile : null;
  const displayName =
    authProfile?.username ?? localDisplayName ?? t('cognitive.defaultName', 'Joueur');
  const avatarId = authProfile?.avatarId ?? localAvatarId ?? 'glasses';

  const h = (id: string) => `${hatchPrefix}-${id}`;

  return (
    <div className="relative w-full md:max-w-md lg:max-w-lg md:mx-auto">
      {/* Desktop floating close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="hidden md:flex absolute -top-3 -right-3 items-center justify-center p-2 bg-woven-bg text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-20 border border-border shadow-sm"
        >
          <X size={20} />
        </button>
      )}

      {/* ═══ Frame ═══ */}
      <Hatching id={h('frame-top')} className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id={h('frame-left')}
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="flex-1 min-w-0">
          {/* ═══ ZONE 1: IDENTITY ═══ */}
          <div className="px-2 pt-4 pb-0">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="shrink-0">
                <Hatching id={h('avatar-top')} className="text-foreground/70" />
                <div className="flex items-stretch">
                  <Hatching
                    id={h('avatar-left')}
                    orientation="vertical"
                    className="shrink-0 text-foreground/70"
                  />
                  <div className="p-1.5">
                    <Avatar id={avatarId} size={42} className="border-border/30 bg-background/70" />
                  </div>
                  <Hatching
                    id={h('avatar-right')}
                    orientation="vertical"
                    className="shrink-0 text-foreground/70"
                  />
                </div>
                <Hatching id={h('avatar-bottom')} className="text-foreground/70" />
              </div>

              {/* Title block */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="relative">
                  {/* Mobile close button */}
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label={t('common.close', 'Close')}
                      className="md:hidden absolute top-0 right-0 p-1 text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-10"
                    >
                      <X size={18} />
                    </button>
                  )}
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1.5">
                    {modeLabel}
                    {badge}
                  </div>
                  <h2
                    className={cn(
                      'mt-1 text-xl sm:text-2xl font-black tracking-tight text-foreground leading-tight',
                      onClose && 'pr-10 md:pr-0',
                    )}
                  >
                    {displayName}
                  </h2>
                </div>

                {/* Player stats line (e.g. "Dernier empan 5 · Record 6") */}
                {playerStats && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
                    {playerStats}
                  </div>
                )}
              </div>
            </div>

            {/* Subtitle + chips */}
            {(modeSubtitle || (subtitleChips && subtitleChips.length > 0)) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {modeSubtitle && <span>{modeSubtitle}</span>}
                {subtitleChips?.map((chip, i) => (
                  <span key={i} className="contents">
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>{chip}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Hatching id={h('identity-hatch')} className="mt-4 text-foreground/70" />

          {/* ═══ ZONE 2: CTA ═══ */}
          {cta && (
            <>
              <div className="-mx-2 px-[1px] py-[1px] rounded-2xl overflow-hidden">
                <div
                  className={cn(
                    'px-4 py-5',
                    cta.variant === 'green'
                      ? 'bg-woven-correct/[0.06]'
                      : 'bg-[hsl(var(--woven-blue)/0.08)]',
                  )}
                >
                  {(cta.label || cta.secondaryLabel) && (
                    <div className="mb-3 flex items-center justify-between gap-3">
                      {cta.label && (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {cta.label}
                        </span>
                      )}
                      {cta.secondaryLabel && (
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {cta.secondaryLabel}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-woven-border/50 bg-woven-bg/70">
                      {cta.icon ?? (
                        <ClockCountdown size={22} weight="duotone" className="text-foreground/70" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-foreground">{cta.title}</div>
                      {cta.subtitle && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {cta.subtitle}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={cta.onPlay}
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-95"
                    >
                      <Play size={20} weight="fill" />
                    </button>
                  </div>
                </div>
              </div>

              <Hatching id={h('cta-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 3: SCORES — left 1/3 + right 2/3 ═══ */}
          {(leftScore || rightScore) && (
            <>
              <div className="px-2 py-6">
                <div className="flex items-stretch">
                  {/* Left score — 1/3 */}
                  {leftScore && (
                    <div
                      className={cn(
                        'px-2 py-2 flex flex-col items-center justify-center text-center',
                        rightScore ? 'w-1/3' : 'w-full',
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {leftScore.label}
                      </p>
                      <div className="mt-2">{leftScore.value}</div>
                    </div>
                  )}

                  {leftScore && rightScore && (
                    <Hatching
                      id={h('score-divider')}
                      orientation="vertical"
                      className="text-foreground/70"
                    />
                  )}

                  {/* Right score — 2/3 */}
                  {rightScore && (
                    <div
                      className={cn(
                        'px-3 py-2 flex flex-col items-center justify-center text-center',
                        leftScore ? 'flex-1' : 'w-full',
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {rightScore.label}
                      </p>
                      <div className="mt-2">{rightScore.value}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Score warning */}
              {scoreWarning && <div className="px-2 -mt-2 mb-2">{scoreWarning}</div>}

              <Hatching id={h('score-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 4: STATS ROW ═══ */}
          {stats && stats.length > 0 && (
            <>
              <div
                className="px-2 mt-4 grid gap-2 text-center"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, minmax(0, 1fr))`,
                }}
              >
                {stats.map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border/60 bg-muted/80 backdrop-blur-lg backdrop-saturate-150 shadow-sm p-2.5"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </p>
                    <p
                      className={cn(
                        'text-lg font-bold tabular-nums',
                        stat.color ?? 'text-foreground',
                      )}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <Hatching id={h('stats-hatch')} className="mt-4 text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 5: HISTORY ═══ */}
          {history && (
            <>
              <div className="px-2 py-6">{history}</div>
              <Hatching id={h('history-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 6: PROTOCOL ═══ */}
          {protocol && (
            <>
              <div className="px-2 py-6">
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('modeCard.protocol', 'Le protocole')}
                  </div>
                </div>

                <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
                  {protocol.steps.map((step, i) => (
                    <p key={i}>{step}</p>
                  ))}
                </div>

                {protocol.duration && (
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <ClockCountdown size={14} weight="duotone" />
                    <span>{protocol.duration}</span>
                  </div>
                )}
              </div>

              <Hatching id={h('protocol-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 7: WHY ═══ */}
          {why && (
            <>
              <div className="px-2 py-6">
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('modeCard.why', 'Pourquoi ce test ?')}
                  </div>
                </div>

                <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
                  {why.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>

              <Hatching id={h('why-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 8: CHART 1 ═══ */}
          {chart1 && (
            <>
              <div className="px-2 py-6">
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {chart1.title}
                  </div>
                  {chart1.description && (
                    <div className="mt-1 text-[11px] text-muted-foreground italic">
                      {chart1.description}
                    </div>
                  )}
                </div>
                {chart1.content}
              </div>

              <Hatching id={h('chart1-hatch')} className="text-foreground/70" />
            </>
          )}

          {/* ═══ ZONE 9: CHART 2 ═══ */}
          {chart2 && (
            <div className="px-2 py-6">
              <div className="mb-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {chart2.title}
                </div>
                {chart2.description && (
                  <div className="mt-1 text-[11px] text-muted-foreground italic">
                    {chart2.description}
                  </div>
                )}
              </div>
              {chart2.content}
            </div>
          )}

          {/* ═══ EXTRA ═══ */}
          {extra}
        </div>
        <Hatching
          id={h('frame-right')}
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id={h('frame-bottom')} className="text-foreground/70" />
    </div>
  );
}
