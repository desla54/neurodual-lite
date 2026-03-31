/**
 * OspanMeasure — encyclopedic card for the OSpan working memory measure.
 *
 * Built on ModeCard — OSpan-specific parts (CircularScore, ScoreGauge,
 * ReferenceNormsChart, SessionRow) are defined locally and passed as props.
 */

import { cn, useEffectiveUserId } from '@neurodual/ui';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAppPorts } from '../../providers';
import { ModeCard } from '../mode-card/mode-card';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OspanSessionRecord {
  readonly session_id: string;
  readonly n_level: number;
  readonly accuracy: number;
  readonly created_at: string;
  readonly duration_ms: number;
  readonly trials_count: number;
  readonly total_hits: number;
  /** Processing (equation) accuracy stored in global_d_prime for OSpan (0-100) */
  readonly processing_accuracy: number;
  /** Absolute score (sum of spans for correctly recalled sets) */
  readonly absolute_score: number | null;
}

const PROCESSING_THRESHOLD = 85;

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

// ─── Circular Score ─────────────────────────────────────────────────────────

function CircularScore({
  score,
  maxScore,
  size = 100,
}: {
  score: number;
  maxScore: number;
  size?: number;
}): ReactNode {
  const { t } = useTranslation();
  const [animScore, setAnimScore] = useState(0);
  const strokeWidth = 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

  useEffect(() => {
    const id = setTimeout(() => setAnimScore(pct), 200);
    return () => clearTimeout(id);
  }, [pct]);

  const offset = circumference - (animScore / 100) * circumference;

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
          {score > 0 ? <AnimatedNumber value={score} /> : '\u2014'}
        </span>
        <span className="mt-1 text-[9px] font-medium tracking-wider uppercase text-muted-foreground">
          {t('ospan.measure.span', 'Empan')}
        </span>
      </div>
    </div>
  );
}

// ─── Session Row ────────────────────────────────────────────────────────────

function SessionRow({
  session,
  index,
  isValid,
}: {
  session: OspanSessionRecord;
  index: number;
  isValid: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const date = new Date(session.created_at);
  const dateStr = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const durationMin = Math.round(session.duration_ms / 60000);

  return (
    <div className={cn('flex items-center gap-3 px-3 py-3', !isValid && 'opacity-50')}>
      <span className="text-xs font-bold text-muted-foreground w-5 text-right tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-foreground tabular-nums">
            {t('ospan.measure.span', 'Empan')} {session.n_level}
          </span>
          <span className="text-[11px] text-muted-foreground">{dateStr}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {session.total_hits}/{session.trials_count} {t('game.cogTask.sets').toLowerCase()}
          </span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>{Math.round(session.accuracy * 100)}%</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span>{durationMin} min</span>
        </div>
        {!isValid && (
          <div className="mt-1 text-[10px] text-amber-500">
            {t(
              'ospan.measure.invalidSession',
              '\u00c9quations < 85 % \u2014 non comptabilis\u00e9 comme empan actuel',
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score Gauge ────────────────────────────────────────────────────────────

const OSPAN_MAX_SCORE = 75;

const SCORE_ZONES = [
  {
    max: 25,
    label: 'Faible',
    fill: 'hsl(var(--woven-incorrect) / 0.92)',
    textColor: 'hsl(var(--woven-surface))',
  },
  {
    max: 45,
    label: 'Moyen',
    fill: 'hsl(var(--woven-amber) / 0.94)',
    textColor: 'hsl(var(--woven-surface))',
  },
  {
    max: 60,
    label: 'Bon',
    fill: 'hsl(var(--woven-blue) / 0.92)',
    textColor: 'hsl(var(--woven-surface))',
  },
  {
    max: 75,
    label: 'Excellent',
    fill: 'hsl(var(--woven-correct) / 0.94)',
    textColor: 'hsl(var(--woven-surface))',
  },
] as const;

function ScoreGauge({ score }: { score: number | null }): ReactNode {
  const { t } = useTranslation();
  const width = 320;
  const height = 72;
  const padX = 10;
  const barY = 26;
  const barH = 20;
  const barW = width - padX * 2;
  const displayScore = score ?? 0;
  const clampedScore = Math.min(Math.max(displayScore, 0), OSPAN_MAX_SCORE);
  const pct = clampedScore / OSPAN_MAX_SCORE;
  const markerX = padX + pct * barW;
  const markerLabelX = Math.min(width - padX - 22, Math.max(padX + 22, markerX));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="max-w-sm mx-auto"
      role="img"
      aria-label={t('ospan.measure.scoreGaugeLabel', 'Jauge de score OSpan')}
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

      {SCORE_ZONES.map((zone, i) => {
        const prevMax = i === 0 ? 0 : (SCORE_ZONES[i - 1]?.max ?? 0);
        const x = padX + (prevMax / OSPAN_MAX_SCORE) * barW;
        const w = ((zone.max - prevMax) / OSPAN_MAX_SCORE) * barW;
        const isFirst = i === 0;
        const isLast = i === SCORE_ZONES.length - 1;
        return (
          <g key={zone.label}>
            <rect
              x={x}
              y={barY}
              width={w}
              height={barH}
              fill={zone.fill}
              rx={isFirst || isLast ? 4 : 0}
              ry={isFirst || isLast ? 4 : 0}
              stroke="hsl(var(--woven-bg) / 0.92)"
              strokeWidth={1}
            />
            <text
              x={x + w / 2}
              y={barY + barH / 2 + 3}
              textAnchor="middle"
              className="text-[7px] font-bold tracking-wide"
              fill={zone.textColor}
            >
              {zone.label}
            </text>
            {isFirst && (
              <text
                x={x}
                y={barY - 7}
                textAnchor="middle"
                className="text-[8px] font-semibold tabular-nums fill-[hsl(var(--woven-text-muted)/0.95)]"
              >
                0
              </text>
            )}
            <text
              x={x + w}
              y={barY - 7}
              textAnchor="middle"
              className="text-[8px] font-semibold tabular-nums fill-[hsl(var(--woven-text-muted)/0.95)]"
            >
              {zone.max}
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

      {score != null && score > 0 && (
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
            {displayScore}
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

// ─── Reference Norms Chart ──────────────────────────────────────────────────

const AGE_NORMS = [
  { label: '7-12', min: 2, max: 3 },
  { label: '13-17', min: 3, max: 4 },
  { label: '18-30', min: 4, max: 5 },
  { label: '30-50', min: 3.5, max: 4.5 },
  { label: '50-65', min: 3, max: 4 },
  { label: '65+', min: 2.5, max: 3.5 },
] as const;

const NORMS_MAX_SPAN = 7;

function ReferenceNormsChart({ currentSpan }: { currentSpan: number | null }): ReactNode {
  const { t } = useTranslation();
  const width = 320;
  const height = 180;
  const padLeft = 34;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 42;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const barWidth = chartW / AGE_NORMS.length;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-[320px] mx-auto">
      {/* Y axis grid lines */}
      {[2, 3, 4, 5, 6, 7].map((level) => {
        const y = padTop + chartH - (level / NORMS_MAX_SPAN) * chartH;
        return (
          <g key={level}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y}
              y2={y}
              stroke="hsl(var(--muted-foreground) / 0.12)"
              strokeWidth={0.5}
            />
            <text
              x={padLeft - 6}
              y={y + 4}
              textAnchor="end"
              className="text-[11px] font-medium fill-[hsl(var(--muted-foreground)/0.7)]"
            >
              {level}
            </text>
          </g>
        );
      })}

      {/* Range bars for each age group */}
      {AGE_NORMS.map((norm, i) => {
        const x = padLeft + i * barWidth + barWidth / 2;
        const yMin = padTop + chartH - (norm.min / NORMS_MAX_SPAN) * chartH;
        const yMax = padTop + chartH - (norm.max / NORMS_MAX_SPAN) * chartH;
        const mid = (norm.min + norm.max) / 2;
        const yMid = padTop + chartH - (mid / NORMS_MAX_SPAN) * chartH;
        const rangeBarW = barWidth * 0.45;

        return (
          <g key={norm.label}>
            {/* Range bar */}
            <rect
              x={x - rangeBarW / 2}
              y={yMax}
              width={rangeBarW}
              height={yMin - yMax}
              rx={3}
              fill="hsl(var(--foreground) / 0.12)"
            />
            {/* Mid dot */}
            <circle cx={x} cy={yMid} r={2.5} fill="hsl(var(--foreground) / 0.5)" />
            {/* Age label */}
            <text
              x={x}
              y={height - padBottom + 16}
              textAnchor="middle"
              className="text-[10px] font-medium fill-[hsl(var(--muted-foreground)/0.75)]"
            >
              {norm.label}
            </text>
          </g>
        );
      })}

      {/* X axis label */}
      <text
        x={padLeft + chartW / 2}
        y={height - 2}
        textAnchor="middle"
        className="text-[10px] fill-[hsl(var(--muted-foreground)/0.6)]"
      >
        {t('ospan.measure.normsAgeLabel', '\u00c2ge (ann\u00e9es)')}
      </text>

      {/* Current span line */}
      {currentSpan != null && currentSpan > 0 && (
        <>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + chartH - (currentSpan / NORMS_MAX_SPAN) * chartH}
            y2={padTop + chartH - (currentSpan / NORMS_MAX_SPAN) * chartH}
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
          <text
            x={width - padRight + 4}
            y={padTop + chartH - (currentSpan / NORMS_MAX_SPAN) * chartH + 4}
            className="text-[10px] font-bold fill-[hsl(var(--foreground))]"
          >
            {t('ospan.measure.normsYou', 'Vous')}
          </text>
        </>
      )}
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface OspanMeasureProps {
  readonly onClose?: () => void;
}

export function OspanMeasure({ onClose }: OspanMeasureProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useEffectiveUserId();
  const { persistence } = useAppPorts();

  // Query OSpan sessions from session_summaries
  const [sessions, setSessions] = useState<OspanSessionRecord[]>([]);

  const loadSessions = useCallback(() => {
    persistence
      ?.query<OspanSessionRecord>(
        `SELECT session_id, n_level, accuracy, created_at, duration_ms, trials_count, total_hits,
                global_d_prime AS processing_accuracy, absolute_score
         FROM session_summaries
         WHERE user_id IN (?, 'local') AND session_type = 'ospan' AND reason = 'completed'
         ORDER BY created_at ASC`,
        [userId],
      )
      .then((result) => setSessions((result.rows ?? []).filter((s) => s.n_level > 0)))
      .catch(() => {});
  }, [persistence, userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);
  const validSessions = sessions.filter((s) => s.processing_accuracy >= PROCESSING_THRESHOLD);
  const lastSession = validSessions.length > 0 ? validSessions[validSessions.length - 1] : null;
  const bestSpan = validSessions.length > 0 ? Math.max(...validSessions.map((s) => s.n_level)) : 0;
  const sessionCount = validSessions.length;
  const invalidSessionCount = Math.max(0, sessions.length - validSessions.length);
  const nextMeasureNumber = sessionCount + 1;
  const baselineRemaining = Math.max(0, 3 - sessionCount);

  const measureHint = !lastSession
    ? t(
        'ospan.measure.firstTestDesc',
        'Ce test dure environ 10 minutes. Il mesure votre capacit\u00e9 de m\u00e9moire de travail.',
      )
    : sessionCount < 3
      ? t(
          'ospan.measure.baselineDesc',
          'Faites 3 mesures initiales pour \u00e9tablir votre empan de r\u00e9f\u00e9rence.',
        ) +
        ' (' +
        baselineRemaining +
        ' restante' +
        (baselineRemaining > 1 ? 's' : '') +
        ')'
      : t(
          'ospan.measure.nextMeasureDesc',
          'Espacez vos mesures d\u2019au moins une semaine pour un suivi fiable de l\u2019effet de l\u2019entra\u00eenement.',
        );

  const daysSinceLastTest = lastSession
    ? Math.floor((Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Subtitle chips ──
  const chips = [
    t('ospan.measure.sessionCount', '{{count}} mesures valides', { count: sessionCount }),
  ];
  if (invalidSessionCount > 0) {
    chips.push(
      t('ospan.measure.invalidCount', '{{count}} invalid\u00e9es', {
        count: invalidSessionCount,
      }),
    );
  }

  return (
    <ModeCard
      hatchPrefix="ospan"
      modeLabel={t('ospan.measure.sheetLabel', '\u00c9valuation m\u00e9moire de travail')}
      modeSubtitle={t('settings.gameMode.ospan')}
      subtitleChips={chips}
      onClose={onClose}
      playerStats={
        <>
          <span>
            {lastSession
              ? t('ospan.measure.lastSpan', 'Dernier empan {{span}}', {
                  span: lastSession.n_level,
                })
              : t('ospan.measure.neverTested', 'Aucune mesure valide')}
          </span>
          {bestSpan > 0 && (
            <>
              <span className="text-muted-foreground/40">&middot;</span>
              <span>{t('ospan.measure.bestSpan', 'Record {{span}}', { span: bestSpan })}</span>
            </>
          )}
        </>
      }
      cta={{
        label: t('ospan.measure.nextMeasureLabel', 'Mesure {{count}}', {
          count: nextMeasureNumber,
        }),
        secondaryLabel:
          daysSinceLastTest != null
            ? t('ospan.measure.daysSince', 'Il y a {{days}} j', { days: daysSinceLastTest })
            : undefined,
        title: !lastSession
          ? t('ospan.measure.firstTestTitle', 'Mesurez votre m\u00e9moire de travail')
          : t('ospan.measure.nextMeasureTitle', 'Lancer une nouvelle mesure'),
        subtitle: measureHint,
        variant: lastSession ? 'green' : 'blue',
        onPlay: () => navigate('/ospan'),
      }}
      leftScore={{
        label: t('ospan.measure.currentSpan', 'Empan actuel'),
        value: <CircularScore score={lastSession?.n_level ?? 0} maxScore={7} size={80} />,
      }}
      rightScore={{
        label: t('ospan.measure.ospanScore', 'Score OSpan'),
        value: (
          <span className="text-4xl font-black tabular-nums text-foreground">
            {lastSession?.absolute_score ?? 0}
          </span>
        ),
      }}
      history={
        sessions.length > 0 ? (
          <>
            <div className="mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('ospan.measure.historyLabel', 'Historique')}
              </div>
              <div className="mt-1 text-sm text-foreground">
                {t(
                  'ospan.measure.historyDesc',
                  'Toutes les passations compl\u00e9t\u00e9es. Les sessions invalides restent visibles mais ne comptent pas dans la mesure actuelle.',
                )}
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {[...sessions].reverse().map((session, i) => (
                <SessionRow
                  key={session.session_id}
                  session={session}
                  index={sessions.length - 1 - i}
                  isValid={session.processing_accuracy >= PROCESSING_THRESHOLD}
                />
              ))}
            </div>
          </>
        ) : undefined
      }
      protocol={{
        steps: [
          t(
            'ospan.measure.protocolStep1',
            'Le test comporte 15 s\u00e9ries de 3 \u00e0 7 lettres (3 s\u00e9ries par taille), pr\u00e9sent\u00e9es dans un ordre al\u00e9atoire.',
          ),
          t(
            'ospan.measure.protocolStep2',
            'Avant chaque lettre, v\u00e9rifiez une \u00e9quation (ex. (2 \u00d7 3) + 1 = 7 ?) en appuyant sur Vrai ou Faux. Vous avez 5 secondes.',
          ),
          t(
            'ospan.measure.protocolStep3',
            '\u00c0 la fin de chaque s\u00e9rie, rappelez les lettres dans l\u2019ordre. Seules les s\u00e9ries enti\u00e8rement correctes comptent dans le score.',
          ),
          t(
            'ospan.measure.protocolStep4',
            'Chaque s\u00e9rie r\u00e9ussie sans erreur ajoute son nombre de lettres \u00e0 votre score. Maximum possible\u00a0: 75.',
          ),
        ],
        duration: t('ospan.measure.duration', 'Dur\u00e9e estim\u00e9e : 10 minutes'),
      }}
      why={{
        paragraphs: [
          t(
            'ospan.measure.whyParagraph1',
            'La m\u00e9moire de travail est la capacit\u00e9 \u00e0 retenir et manipuler des informations en temps r\u00e9el. Elle est au c\u0153ur de presque toutes les activit\u00e9s cognitives\u00a0: raisonnement, compr\u00e9hension, apprentissage.',
          ),
          t(
            'ospan.measure.whyParagraph2',
            'L\u2019Operation Span (Unsworth & Engle, 2005) est le test de r\u00e9f\u00e9rence en sciences cognitives pour mesurer cette capacit\u00e9. Il est plus fiable qu\u2019un simple test d\u2019empan car il vous oblige \u00e0 traiter des \u00e9quations en m\u00eame temps que vous m\u00e9morisez \u2014 exactement comme dans la vie r\u00e9elle.',
          ),
          t(
            'ospan.measure.whyParagraph3',
            'Chaque passation ajoute une mesure comparable dans le temps, \u00e0 condition de garder une pr\u00e9cision suffisante sur les \u00e9quations (\u2265 85\u00a0%). En dessous, le r\u00e9sultat est consid\u00e9r\u00e9 invalide car il sugg\u00e8re que les \u00e9quations n\u2019ont pas \u00e9t\u00e9 r\u00e9ellement trait\u00e9es.',
          ),
        ],
      }}
      chart1={{
        title: t('ospan.measure.scoreGaugeTitle', 'Score absolu'),
        description: t(
          'ospan.measure.scoreGaugeDesc',
          'M\u00e9diane \u2248 40 chez les 18-35 ans (Unsworth & Engle 2005). Maximum\u00a0: 75.',
        ),
        content: <ScoreGauge score={lastSession?.absolute_score ?? null} />,
      }}
      chart2={{
        title: t('ospan.measure.normsLabel', 'Rep\u00e8res par \u00e2ge'),
        description: t(
          'ospan.measure.normsDisclaimer',
          'Valeurs approximatives issues de la litt\u00e9rature scientifique (Cowan 2001, Unsworth & Engle 2005, Bopp & Verhaeghen 2005)',
        ),
        content: <ReferenceNormsChart currentSpan={lastSession?.n_level ?? null} />,
      }}
    />
  );
}
