/**
 * RavensMeasure — encyclopedic card for Visual Logic (Raven's Matrices).
 *
 * Refactored for the 30-level neurodual system:
 * - CeilingGauge with 7 difficulty tiers replaces score /60
 * - Score /30 with tier breakdown
 * - Session comparison (↑↓ delta)
 * - Dual CTA: adaptive (staircase, ~25 items) or classic SPM (60 items)
 */

import { BetaBadge, useEffectiveUserId } from '@neurodual/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAlphaEnabled } from '../../hooks/use-beta-features';
import { usePowerSyncWatch } from '../../hooks/use-powersync-watch';
import { ModeCard } from '../mode-card/mode-card';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RavensSessionRecord {
  readonly session_id: string;
  readonly created_at: string;
  readonly duration_ms: number;
  readonly total_trials: number;
  readonly correct_trials: number;
  readonly accuracy: number;
  readonly n_level: number;
  readonly mean_rt_ms: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_LEVEL = 30;

const DIFFICULTY_TIERS = [
  {
    max: 6,
    labelKey: 'beginner',
    defaultLabel: 'Débutant',
    fill: 'hsl(var(--woven-correct) / 0.7)',
  },
  {
    max: 12,
    labelKey: 'intermediate',
    defaultLabel: 'Intermédiaire',
    fill: 'hsl(var(--woven-correct) / 0.85)',
  },
  { max: 16, labelKey: 'advanced', defaultLabel: 'Avancé', fill: 'hsl(var(--woven-blue) / 0.8)' },
  { max: 20, labelKey: 'expert', defaultLabel: 'Expert', fill: 'hsl(var(--woven-blue) / 0.95)' },
  { max: 25, labelKey: 'elite', defaultLabel: 'Élite', fill: 'hsl(var(--woven-amber) / 0.9)' },
  {
    max: 28,
    labelKey: 'master',
    defaultLabel: 'Maître',
    fill: 'hsl(var(--woven-incorrect) / 0.8)',
  },
  {
    max: 30,
    labelKey: 'ceiling',
    defaultLabel: 'Plafond',
    fill: 'hsl(var(--woven-incorrect) / 0.95)',
  },
] as const;

function getTierForLevel(level: number): (typeof DIFFICULTY_TIERS)[number] {
  // biome-ignore lint: DIFFICULTY_TIERS is non-empty, fallback always exists
  return (
    DIFFICULTY_TIERS.find((t) => level <= t.max) ?? DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1]!
  );
}

// ─── Animated Number ────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }): ReactNode {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let current = 0;
    const step = value / 75;
    const id = setInterval(() => {
      current += step;
      if (current >= value) {
        setDisplay(value);
        clearInterval(id);
      } else {
        setDisplay(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <>{display}</>;
}

// ─── Accuracy Ring ──────────────────────────────────────────────────────────

function AccuracyRing({ accuracy, size = 80 }: { accuracy: number; size?: number }): ReactNode {
  const { t } = useTranslation();
  const [animPct, setAnimPct] = useState(0);
  const strokeWidth = 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const id = setTimeout(() => setAnimPct(accuracy), 200);
    return () => clearTimeout(id);
  }, [accuracy]);

  const offset = circumference - (animPct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-[1200ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums leading-none text-foreground">
          {accuracy > 0 ? (
            <>
              <AnimatedNumber value={accuracy} />%
            </>
          ) : (
            '\u2014'
          )}
        </span>
        <span className="mt-1 text-[9px] font-medium tracking-wider uppercase text-muted-foreground">
          {t('visualLogic.measure.accuracy', 'Précision')}
        </span>
      </div>
    </div>
  );
}

// ─── Session Row ────────────────────────────────────────────────────────────

function SessionRow({
  session,
  index,
  prevSession,
}: {
  session: RavensSessionRecord;
  index: number;
  prevSession: RavensSessionRecord | null;
}): ReactNode {
  const { t } = useTranslation();
  const date = new Date(session.created_at);
  const dateStr = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const durationMin = Math.round(session.duration_ms / 60000);
  const accuracy = Math.round(session.accuracy * 100);
  const tier = getTierForLevel(session.n_level);

  // Delta vs previous session
  const levelDelta = prevSession ? session.n_level - prevSession.n_level : null;

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="text-xs font-bold text-muted-foreground w-5 text-right tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground tabular-nums">
            {t('visualLogic.measure.level', 'Niveau')} {session.n_level}
            <span className="text-muted-foreground font-medium">/{MAX_LEVEL}</span>
            {levelDelta != null && levelDelta !== 0 && (
              <span
                className={`ml-1.5 text-xs font-bold ${
                  levelDelta > 0
                    ? 'text-[hsl(var(--chart-success))]'
                    : 'text-[hsl(var(--woven-incorrect))]'
                }`}
              >
                {levelDelta > 0 ? '+' : ''}
                {levelDelta}
              </span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground">{dateStr}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: tier.fill, color: 'hsl(var(--woven-surface))' }}
          >
            {t(`visualLogic.measure.tier.${tier.labelKey}`, tier.defaultLabel)}
          </span>
          <span>{accuracy}%</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>
            {(session.mean_rt_ms / 1000).toFixed(1)}s /{' '}
            {t('visualLogic.measure.problem', 'problème')}
          </span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>{durationMin} min</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ceiling Gauge ──────────────────────────────────────────────────────────

function CeilingGauge({ level }: { level: number | null }): ReactNode {
  const { t } = useTranslation();
  const width = 320;
  const height = 72;
  const padX = 10;
  const barY = 26;
  const barH = 20;
  const barW = width - padX * 2;
  const displayLevel = level ?? 0;
  const clampedLevel = Math.min(Math.max(displayLevel, 0), MAX_LEVEL);
  const pct = clampedLevel / MAX_LEVEL;
  const markerX = padX + pct * barW;
  const markerLabelX = Math.min(width - padX - 22, Math.max(padX + 22, markerX));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="max-w-sm mx-auto"
      role="img"
      aria-label={t('visualLogic.measure.ceilingGaugeLabel', 'Jauge de score')}
    >
      <rect
        x={padX}
        y={barY}
        width={barW}
        height={barH}
        rx={6}
        ry={6}
        fill="hsl(var(--woven-surface) / 0.94)"
        stroke="hsl(var(--woven-border) / 0.8)"
      />

      {DIFFICULTY_TIERS.map((tier, i) => {
        const prevMax = i === 0 ? 0 : DIFFICULTY_TIERS[i - 1]!.max;
        const x = padX + (prevMax / MAX_LEVEL) * barW;
        const w = ((tier.max - prevMax) / MAX_LEVEL) * barW;
        const isFirst = i === 0;
        const isLast = i === DIFFICULTY_TIERS.length - 1;
        return (
          <g key={tier.labelKey}>
            <rect
              x={x}
              y={barY}
              width={w}
              height={barH}
              fill={tier.fill}
              rx={isFirst || isLast ? 4 : 0}
              ry={isFirst || isLast ? 4 : 0}
              stroke="hsl(var(--woven-bg) / 0.92)"
              strokeWidth={1}
            />
            {w > 28 && (
              <text
                x={x + w / 2}
                y={barY + barH / 2 + 3}
                textAnchor="middle"
                className="text-[6px] font-bold tracking-wide"
                fill="hsl(var(--woven-surface))"
              >
                {t(`visualLogic.measure.tier.${tier.labelKey}`, tier.defaultLabel).slice(0, 5)}
              </text>
            )}
            {isFirst && (
              <text
                x={x}
                y={barY - 7}
                textAnchor="middle"
                className="text-[8px] font-semibold tabular-nums fill-[hsl(var(--woven-text-muted)/0.95)]"
              >
                1
              </text>
            )}
            <text
              x={x + w}
              y={barY - 7}
              textAnchor="middle"
              className="text-[8px] font-semibold tabular-nums fill-[hsl(var(--woven-text-muted)/0.95)]"
            >
              {tier.max}
            </text>
            {!isLast && (
              <line
                x1={x + w}
                x2={x + w}
                y1={barY + 2}
                y2={barY + barH - 2}
                stroke="hsl(var(--woven-bg) / 0.92)"
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}

      {level != null && level > 0 && (
        <>
          <rect
            x={markerLabelX - 22}
            y={4}
            width={44}
            height={16}
            rx={8}
            ry={8}
            fill="hsl(var(--woven-text))"
          />
          <text
            x={markerLabelX}
            y={15}
            textAnchor="middle"
            className="text-[9px] font-black"
            fill="hsl(var(--woven-surface))"
          >
            {displayLevel}/{MAX_LEVEL}
          </text>
          <line
            x1={markerX}
            x2={markerX}
            y1={20}
            y2={barY + barH + 4}
            stroke="hsl(var(--woven-text))"
            strokeWidth={2}
          />
          <circle
            cx={markerX}
            cy={barY + barH / 2}
            r={4.5}
            fill="hsl(var(--woven-text))"
            stroke="hsl(var(--woven-surface))"
            strokeWidth={1.5}
          />
        </>
      )}
    </svg>
  );
}

// ─── Progression Chart ──────────────────────────────────────────────────────

function ProgressionChart({ sessions }: { sessions: RavensSessionRecord[] }): ReactNode {
  const { t } = useTranslation();
  if (sessions.length < 2) return null;

  const width = 320;
  const height = 140;
  const padLeft = 34;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxLevel = Math.max(...sessions.map((s) => s.n_level), 10);
  const yScale = (level: number) => padTop + chartH - (level / maxLevel) * chartH;
  const xScale = (i: number) => padLeft + (i / (sessions.length - 1)) * chartW;

  const pathD = sessions
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(s.n_level).toFixed(1)}`)
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-[320px] mx-auto">
      {/* Y-axis grid */}
      {[5, 10, 15, 20, 25, 30]
        .filter((l) => l <= maxLevel + 2)
        .map((level) => (
          <g key={level}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={yScale(level)}
              y2={yScale(level)}
              stroke="hsl(var(--muted-foreground) / 0.1)"
              strokeWidth={0.5}
            />
            <text
              x={padLeft - 6}
              y={yScale(level) + 4}
              textAnchor="end"
              className="text-[10px] font-medium fill-[hsl(var(--muted-foreground)/0.6)]"
            >
              {level}
            </text>
          </g>
        ))}

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--foreground))"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Dots */}
      {sessions.map((s, i) => (
        <circle
          key={s.session_id}
          cx={xScale(i)}
          cy={yScale(s.n_level)}
          r={3}
          fill="hsl(var(--foreground))"
          stroke="hsl(var(--background))"
          strokeWidth={1.5}
        />
      ))}

      {/* X label */}
      <text
        x={padLeft + chartW / 2}
        y={height - 4}
        textAnchor="middle"
        className="text-[10px] fill-[hsl(var(--muted-foreground)/0.5)]"
      >
        {t('visualLogic.measure.progressionXLabel', 'Sessions')}
      </text>
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface RavensMeasureProps {
  readonly onClose?: () => void;
}

export function RavensMeasure({ onClose }: RavensMeasureProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const alphaEnabled = useAlphaEnabled();
  const userId = useEffectiveUserId();

  // Query Ravens sessions from session_summaries
  const sessionsQuery = usePowerSyncWatch<RavensSessionRecord>(
    `SELECT session_id, created_at, duration_ms, total_trials, correct_trials,
            CAST(correct_trials AS REAL) / CASE WHEN total_trials > 0 THEN total_trials ELSE 1 END AS accuracy,
            n_level, mean_rt_ms
     FROM session_summaries
     WHERE user_id IN (?, 'local') AND game_mode IN ('visual-logic', 'ravens') AND reason = 'completed'
     ORDER BY created_at ASC`,
    [userId],
  );
  const sessions = sessionsQuery.data.filter((s) => s.total_trials > 0);
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const prevSession = sessions.length > 1 ? sessions[sessions.length - 2] : null;
  const bestAccuracy =
    sessions.length > 0 ? Math.max(...sessions.map((s) => Math.round(s.accuracy * 100))) : 0;
  const maxLevel = sessions.length > 0 ? Math.max(...sessions.map((s) => s.n_level)) : 0;
  const sessionCount = sessions.length;

  const lastAccuracy = lastSession ? Math.round(lastSession.accuracy * 100) : 0;
  const lastLevel = lastSession?.n_level ?? 0;
  const lastTier = lastLevel > 0 ? getTierForLevel(lastLevel) : null;

  // Level delta vs previous session
  const levelDelta = lastSession && prevSession ? lastSession.n_level - prevSession.n_level : null;

  const daysSinceLastTest = lastSession
    ? Math.floor((Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Subtitle chips ──
  const chips = [
    t('visualLogic.measure.sessionCount', '{{count}} sessions', { count: sessionCount }),
  ];
  if (maxLevel > 0) {
    chips.push(
      t('visualLogic.measure.maxLevelChip', 'Niveau max {{level}}/{{max}}', {
        level: maxLevel,
        max: MAX_LEVEL,
      }),
    );
  }

  return (
    <ModeCard
      hatchPrefix="ravens"
      modeLabel={t('visualLogic.measure.sheetLabel', 'Raisonnement abstrait')}
      badge={<BetaBadge size="md" />}
      modeSubtitle={t('visualLogic.measure.subtitle', 'Matrices progressives (Visual Logic)')}
      subtitleChips={chips}
      onClose={onClose}
      playerStats={
        <>
          <span>
            {lastSession
              ? t('visualLogic.measure.lastLevel', 'Dernier niveau {{level}}', {
                  level: lastLevel,
                })
              : t('visualLogic.measure.neverTested', 'Aucune session')}
          </span>
          {lastTier && (
            <>
              <span className="text-muted-foreground/40">&middot;</span>
              <span>
                {t(`visualLogic.measure.tier.${lastTier.labelKey}`, lastTier.defaultLabel)}
              </span>
            </>
          )}
          {levelDelta != null && levelDelta !== 0 && (
            <>
              <span className="text-muted-foreground/40">&middot;</span>
              <span
                className={
                  levelDelta > 0
                    ? 'text-[hsl(var(--chart-success))]'
                    : 'text-[hsl(var(--woven-incorrect))]'
                }
              >
                {levelDelta > 0 ? '+' : ''}
                {levelDelta}
              </span>
            </>
          )}
        </>
      }
      cta={{
        label: t('visualLogic.measure.nextSessionLabel', 'Session {{count}}', {
          count: sessionCount + 1,
        }),
        secondaryLabel:
          daysSinceLastTest != null
            ? t('visualLogic.measure.daysSince', 'Il y a {{days}} j', { days: daysSinceLastTest })
            : undefined,
        title: !lastSession
          ? t('visualLogic.measure.firstTestTitle', 'Testez votre raisonnement abstrait')
          : t('visualLogic.measure.nextSessionTitle', 'Lancer une nouvelle session'),
        subtitle: !lastSession
          ? t(
              'visualLogic.measure.firstTestDesc',
              '30 matrices, une par niveau (1→30). Score objectif comparable entre sessions. ~15-20 minutes.',
            )
          : t(
              'visualLogic.measure.nextSessionDesc',
              '30 matrices (niveaux 1→30). Comparez votre score avec vos sessions précédentes.',
            ),
        variant: lastSession ? 'green' : 'blue',
        onPlay: () => navigate('/visual-logic?mode=standard'),
      }}
      leftScore={{
        label: t('visualLogic.measure.currentAccuracy', 'Précision'),
        value: <AccuracyRing accuracy={lastAccuracy} size={80} />,
      }}
      rightScore={{
        label: t('visualLogic.measure.currentLevel', 'Niveau atteint'),
        value: (
          <span className="text-4xl font-black tabular-nums text-foreground">
            {lastLevel || '\u2014'}
            {lastLevel > 0 && (
              <span className="text-lg text-muted-foreground font-bold">/{MAX_LEVEL}</span>
            )}
          </span>
        ),
      }}
      stats={
        lastSession
          ? [
              {
                label: t('visualLogic.measure.problems', 'Problèmes'),
                value: `${lastSession.correct_trials}/${lastSession.total_trials}`,
                color: lastAccuracy >= 80 ? 'text-[hsl(var(--chart-success))]' : undefined,
              },
              {
                label: t('visualLogic.measure.avgRt', 'Temps moy.'),
                value: `${(lastSession.mean_rt_ms / 1000).toFixed(1)}s`,
              },
              {
                label: t('visualLogic.measure.maxLevelStat', 'Niv. max'),
                value: `${maxLevel}/${MAX_LEVEL}`,
                color: 'text-primary',
              },
              ...(bestAccuracy > 0
                ? [
                    {
                      label: t('visualLogic.measure.bestAccuracy', 'Record'),
                      value: `${bestAccuracy}%`,
                    },
                  ]
                : []),
            ]
          : undefined
      }
      history={
        sessions.length > 0 ? (
          <>
            <div className="mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('visualLogic.measure.historyLabel', 'Historique')}
              </div>
              <div className="mt-1 text-sm text-foreground">
                {t(
                  'visualLogic.measure.historyDesc',
                  'Toutes les sessions complétées, triées de la plus récente à la plus ancienne.',
                )}
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {[...sessions].reverse().map((session, i) => {
                const displayIndex = sessions.length - 1 - i;
                const prev = displayIndex > 0 ? (sessions[displayIndex - 1] ?? null) : null;
                return (
                  <SessionRow
                    key={session.session_id}
                    session={session}
                    index={displayIndex}
                    prevSession={prev}
                  />
                );
              })}
            </div>
          </>
        ) : undefined
      }
      protocol={{
        steps: [
          t(
            'visualLogic.measure.protocolStep1',
            '30 matrices, une par niveau de difficulté (1 à 30). La séquence est toujours la même pour un score objectif.',
          ),
          t(
            'visualLogic.measure.protocolStep2',
            'Chaque matrice est une grille 3×3 dont la dernière case est manquante. Observez les règles dans les lignes et colonnes.',
          ),
          t(
            'visualLogic.measure.protocolStep3',
            'Sélectionnez une option pour la prévisualiser dans la case manquante, puis validez.',
          ),
          t(
            'visualLogic.measure.protocolStep4',
            'Votre score /30 est comparable entre sessions. Refaites le test pour suivre votre progression.',
          ),
        ],
        duration: t('visualLogic.measure.duration', 'Durée estimée : 15\u201320 minutes'),
      }}
      why={{
        paragraphs: [
          t(
            'visualLogic.measure.whyParagraph1',
            'Inspirées des matrices progressives de Raven, ces épreuves sollicitent le raisonnement abstrait \u2014 la capacité à identifier des règles visuelles et à les appliquer à des problèmes nouveaux.',
          ),
          t(
            'visualLogic.measure.whyParagraph2',
            '30 niveaux couvrent 9 types de règles (constant, progression, arithmétique, distribution, XOR, AND, OR, cross-attribute, méta-cycle), des overlays mesh et la complexité perceptive Embretson.',
          ),
          t(
            'visualLogic.measure.whyParagraph3',
            'Le raisonnement abstrait est fortement corrélé à la mémoire de travail. Entraîner cette capacité améliore le raisonnement logique, la résolution de problèmes et l\u2019apprentissage en général.',
          ),
        ],
      }}
      chart1={{
        title: t('visualLogic.measure.ceilingGaugeTitle', 'Score par palier de difficulté'),
        description: t(
          'visualLogic.measure.ceilingGaugeDesc',
          '7 tranches de difficulté sur 30 niveaux. Le marqueur indique votre dernier score.',
        ),
        content: <CeilingGauge level={lastLevel > 0 ? lastLevel : null} />,
      }}
      chart2={
        sessions.length >= 2
          ? {
              title: t('visualLogic.measure.progressionTitle', 'Progression'),
              description: t(
                'visualLogic.measure.progressionDesc',
                'Évolution du score au fil des sessions.',
              ),
              content: <ProgressionChart sessions={sessions} />,
            }
          : undefined
      }
      extra={
        <div className="px-2 pt-4 pb-6 space-y-4">
          {/* Tutorial button */}
          <button
            type="button"
            className={`w-full py-2.5 px-4 rounded-lg border text-sm text-left transition-colors ${
              alphaEnabled
                ? 'border-primary/40 text-foreground hover:border-primary bg-primary/5'
                : 'border-border text-muted-foreground opacity-50 grayscale cursor-default'
            }`}
            onClick={() => {
              if (alphaEnabled) navigate('/visual-logic-tutorial');
            }}
          >
            <span className="font-semibold">
              {t('visualLogic.measure.tutorialLabel', 'Tutoriel interactif')}
            </span>
            <span className="block mt-0.5 text-xs text-muted-foreground/70">
              {t(
                'visualLogic.measure.tutorialDesc',
                '20 leçons guidées pour apprendre à résoudre les matrices, du niveau débutant au niveau expert.',
              )}
            </span>
          </button>

          {/* Classic SPM option */}
          <button
            type="button"
            className="w-full py-2.5 px-4 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors text-left"
            onClick={() => navigate('/visual-logic?mode=spm')}
          >
            <span className="font-semibold">
              {t('visualLogic.measure.classicSpmLabel', 'Mode classique SPM')}
            </span>
            <span className="block mt-0.5 text-xs text-muted-foreground/70">
              {t(
                'visualLogic.measure.classicSpmDesc',
                '60 matrices fixes, 5 paliers (A–E), score brut /60. Profil I-RAVEN.',
              )}
            </span>
          </button>

          <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
            {t(
              'visualLogic.measure.trademark',
              'Raven\u2019s Progressive Matrices\u2122 est une marque déposée de Pearson Education, Inc. Ce test n\u2019est ni produit, ni approuvé, ni affilié à Pearson. Les matrices sont générées procéduralement selon l\u2019algorithme I-RAVEN (open source) et ne constituent pas le test SPM clinique standardisé.',
            )}
          </p>
        </div>
      }
    />
  );
}
