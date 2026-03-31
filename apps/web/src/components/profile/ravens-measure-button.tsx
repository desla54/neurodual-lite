/**
 * RavensMeasureButton — Miniature "fiche" (index card) for Raven's Progressive Matrices.
 *
 * Third fiche on the home page, next to cognitive profile and OSpan measure.
 * Same visual language: tiny document held by a paperclip,
 * but with a mini 3×3 matrix grid sketch and the last accuracy displayed.
 * Paperclip on the left to differentiate from the other two fiches.
 */

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn, useEffectiveUserId } from '@neurodual/ui';
import { usePowerSyncWatch } from '../../hooks/use-powersync-watch';
import { useAlphaEnabled } from '../../hooks/use-beta-features';

/** Metallic gray paperclip — left side */
function Paperclip(): ReactNode {
  return (
    <svg
      width={13}
      height={32}
      viewBox="0 0 14 34"
      fill="none"
      className="absolute -top-[12px] left-1 z-10"
    >
      <path
        d="M7 0 V7 Q7 10 4 10 Q1 10 1 13 V25 Q1 30 5 30 Q9 30 9 25 V11 Q9 8.5 7 8.5 Q5 8.5 5 11 V21"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="text-foreground"
      />
    </svg>
  );
}

/** Tiny 3×3 matrix grid sketch with a "?" in the bottom-right cell */
function MatrixSketch(): ReactNode {
  return (
    <div className="shrink-0 flex items-center justify-center w-4 h-4 rounded-[2px] border border-foreground/15 bg-foreground/[0.05]">
      <svg width={10} height={10} viewBox="0 0 10 10" className="text-foreground/70">
        {/* 3×3 grid of tiny cells, bottom-right is empty with "?" */}
        <rect x={0} y={0} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.5} />
        <rect x={3.6} y={0} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.35} />
        <rect x={7.2} y={0} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.5} />
        <rect x={0} y={3.6} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.35} />
        <rect x={3.6} y={3.6} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.5} />
        <rect
          x={7.2}
          y={3.6}
          width={2.8}
          height={2.8}
          rx={0.4}
          fill="currentColor"
          opacity={0.35}
        />
        <rect x={0} y={7.2} width={2.8} height={2.8} rx={0.4} fill="currentColor" opacity={0.5} />
        <rect
          x={3.6}
          y={7.2}
          width={2.8}
          height={2.8}
          rx={0.4}
          fill="currentColor"
          opacity={0.35}
        />
        {/* Bottom-right: dashed empty cell */}
        <rect
          x={7.2}
          y={7.2}
          width={2.8}
          height={2.8}
          rx={0.4}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.4}
          strokeDasharray="0.8 0.6"
          opacity={0.5}
        />
        <text
          x={8.6}
          y={9.6}
          fontSize={2.2}
          fontWeight="bold"
          fill="currentColor"
          textAnchor="middle"
          opacity={0.6}
        >
          ?
        </text>
      </svg>
    </div>
  );
}

export function RavensMeasureButton(): ReactNode {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useEffectiveUserId();
  const alphaEnabled = useAlphaEnabled();
  const [showSoon, setShowSoon] = useState(false);

  const lastRavensQuery = usePowerSyncWatch<{ accuracy: number | null }>(
    `SELECT CASE WHEN total_trials > 0
       THEN ROUND(CAST(correct_trials AS REAL) / total_trials * 100)
       ELSE NULL END AS accuracy
     FROM session_summaries
     WHERE user_id IN (?, 'local') AND game_mode IN ('visual-logic', 'ravens') AND reason = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const lastAccuracy = lastRavensQuery.data[0]?.accuracy ?? null;

  return (
    <button
      type="button"
      onClick={() => {
        if (alphaEnabled) {
          navigate('/visual-logic-measure');
        } else {
          setShowSoon(true);
          setTimeout(() => setShowSoon(false), 3000);
        }
      }}
      className="group relative -rotate-1 origin-top-left active:scale-[0.97] active:origin-top-left transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-b-sm"
      aria-label={t('home.showVisualLogic', 'Visual Logic')}
    >
      <Paperclip />

      {/* "Coming soon" floating tooltip */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 z-30 w-48 -translate-x-1/2 transition-all duration-300 ease-out',
          showSoon ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none',
        )}
        style={{ top: 'calc(100% + 8px)' }}
      >
        <div className="relative rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 shadow-[0_8px_32px_-8px_hsl(var(--glass-shadow)/0.35)] backdrop-blur-xl">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 rounded-[2px] border-l border-t border-foreground/10 bg-background/80 backdrop-blur-xl" />
          <p className="relative text-[11px] font-bold leading-tight text-foreground">
            Visual Logic <span className="text-muted-foreground">·</span>{' '}
            <span className="text-primary/80">{t('home.comingSoon', 'Bientôt')}</span>
          </p>
          <p className="relative mt-0.5 text-[9px] leading-snug text-muted-foreground">
            {t('home.visualLogicComingSoonDesc', 'Matrices progressives de raisonnement abstrait.')}
          </p>
        </div>
      </div>

      {/* Card */}
      <div
        className={cn(
          'relative rounded-b-[3px] border border-t-0 border-foreground/20 bg-background transition-colors overflow-hidden',
          alphaEnabled ? 'group-hover:bg-foreground/[0.04]' : 'opacity-50 grayscale',
        )}
        style={{ width: 52, height: 68 }}
      >
        <div className="px-1.5 pt-2">
          {/* Row 1: matrix icon "photo" + title lines */}
          <div className="flex items-start gap-1.5">
            <MatrixSketch />
            {/* Title lines */}
            <div className="flex-1 flex flex-col gap-[3px] pt-0.5">
              <div className="h-[2.5px] rounded-full bg-foreground/25 w-full" />
              <div className="h-[2px] rounded-full bg-foreground/15 w-3/5" />
            </div>
          </div>

          {/* Separator */}
          <div className="mt-2 h-px bg-foreground/10" />

          {/* Accuracy value or placeholder */}
          {lastAccuracy != null ? (
            <div className="mt-0.5 flex flex-col items-center justify-center h-[36px]">
              <span className="text-[20px] font-black tabular-nums leading-none text-foreground/80">
                {lastAccuracy}
                <span className="text-[11px] font-bold text-foreground/50">%</span>
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-widest text-foreground/45 mt-0.5">
                acc
              </span>
            </div>
          ) : (
            <div className="mt-0.5 flex flex-col items-center justify-center h-[36px]">
              <span className="text-[20px] font-light leading-none text-foreground/25">?</span>
              <span className="text-[7px] font-semibold uppercase tracking-widest text-foreground/35 mt-0.5">
                acc
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
