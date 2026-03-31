/**
 * OspanMeasureButton — Miniature "fiche" (index card) for the OSpan working memory measure.
 *
 * Sits next to the NeuralWebButton on the home page.
 * Same visual language: tiny document held by a paperclip,
 * but with an equation sketch and the last measured span displayed prominently.
 * Paperclip centered to differentiate from the profile fiche.
 */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useEffectiveUserId } from '@neurodual/ui';
import { usePowerSyncWatch } from '../../hooks/use-powersync-watch';

/** Metallic gray paperclip — centered on the card */
function Paperclip(): ReactNode {
  return (
    <svg
      width={13}
      height={32}
      viewBox="0 0 14 34"
      fill="none"
      className="absolute -top-[12px] left-1/2 -translate-x-1/2 z-10"
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

/** Tiny inline equation sketch: "3+2=?" rendered as a mini illustration */
function EquationSketch(): ReactNode {
  return (
    <div className="shrink-0 flex items-center justify-center w-4 h-4 rounded-[2px] border border-foreground/15 bg-foreground/[0.05]">
      <span className="text-[7px] font-bold leading-none text-foreground/70 -tracking-[0.5px]">
        ?=
      </span>
    </div>
  );
}

export function OspanMeasureButton(): ReactNode {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useEffectiveUserId();

  const lastOspanQuery = usePowerSyncWatch<{ absolute_score: number | null }>(
    `SELECT absolute_score FROM session_summaries
     WHERE user_id IN (?, 'local') AND session_type = 'ospan' AND reason = 'completed'
       AND global_d_prime >= 85
       AND absolute_score IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const lastScore = lastOspanQuery.data[0]?.absolute_score ?? null;

  return (
    <button
      type="button"
      onClick={() => navigate('/ospan-measure')}
      className="group relative rotate-2 origin-top-left active:scale-[0.97] active:origin-top-left transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-b-sm"
      aria-label={t('home.showOspanMeasure', 'Working memory measure')}
    >
      <Paperclip />

      {/* Card */}
      <div
        className="relative rounded-b-[3px] border border-t-0 border-foreground/20 bg-background group-hover:bg-foreground/[0.04] transition-colors overflow-hidden"
        style={{ width: 52, height: 68 }}
      >
        <div className="px-1.5 pt-2">
          {/* Row 1: equation icon "photo" + title lines */}
          <div className="flex items-start gap-1.5">
            <EquationSketch />
            {/* Title lines */}
            <div className="flex-1 flex flex-col gap-[3px] pt-0.5">
              <div className="h-[2.5px] rounded-full bg-foreground/25 w-full" />
              <div className="h-[2px] rounded-full bg-foreground/15 w-2/3" />
            </div>
          </div>

          {/* Separator */}
          <div className="mt-2 h-px bg-foreground/10" />

          {/* Score value or placeholder */}
          {lastScore != null ? (
            <div className="mt-0.5 flex flex-col items-center justify-center h-[36px]">
              <span className="text-[22px] font-black tabular-nums leading-none text-foreground/80">
                {lastScore}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-widest text-foreground/45 mt-0.5">
                score
              </span>
            </div>
          ) : (
            <div className="mt-0.5 flex flex-col items-center justify-center h-[36px]">
              <span className="text-[20px] font-light leading-none text-foreground/25">?</span>
              <span className="text-[7px] font-semibold uppercase tracking-widest text-foreground/35 mt-0.5">
                score
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
