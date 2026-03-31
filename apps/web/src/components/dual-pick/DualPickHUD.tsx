/**
 * DualPickHUD.tsx - Header avec contrôles pour Dual Label
 *
 * Affiche : N-level, compteur de trials, zone adaptative, pause/play, quit
 * Design unifié "Woven Ink" avec texture canvas.
 */

import type { ReactNode } from 'react';
import { GearSix, House, Pause, Play, Timer } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { DualPickSessionSnapshot } from '@neurodual/logic';
import { cn, CanvasWeave } from '@neurodual/ui';

// =============================================================================
// TYPES
// =============================================================================

interface DualPickHUDProps {
  snapshot: DualPickSessionSnapshot;
  isPaused: boolean;
  /** Show remaining trials instead of current/total */
  countdownMode?: boolean;
  /** Show N-level badge (N-2, N-3...) */
  showNLevel?: boolean;
  /** Show adaptive zone badge (Z1, Z2...) */
  showAdaptiveZone?: boolean;
  /** Current adaptive zone value (null if not adaptive) */
  adaptiveZone?: number | null;
  /** Show progress bar below HUD */
  showProgressBar?: boolean;
  onTogglePause: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
  onHaptic?: (durationMs?: number) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DualPickHUD({
  snapshot,
  isPaused,
  countdownMode = false,
  showNLevel = true,
  showAdaptiveZone = true,
  adaptiveZone = null,
  showProgressBar = true,
  onTogglePause,
  onOpenSettings,
  onQuit,
  onHaptic,
}: DualPickHUDProps): ReactNode {
  const { t } = useTranslation();

  const isPlaying = snapshot.phase === 'stimulus' || snapshot.phase === 'placement';
  const safeTotalTrials = Math.max(0, snapshot.totalTrials);
  const clampedTrialIndex =
    safeTotalTrials > 0 ? Math.min(Math.max(snapshot.trialIndex, 0), safeTotalTrials - 1) : 0;
  const displayedTrial = safeTotalTrials > 0 ? clampedTrialIndex + 1 : 0;
  const remaining = Math.max(0, safeTotalTrials - displayedTrial);
  const progressPercent =
    safeTotalTrials > 0 ? Math.min(100, Math.max(0, (displayedTrial / safeTotalTrials) * 100)) : 0;
  const canPause = isPlaying || isPaused;

  return (
    <div className="shrink-0 flex flex-col items-center">
      <div
        className="relative flex items-center gap-2 p-2 px-3 [@media(max-height:700px)]:p-1 [@media(max-height:700px)]:px-2 rounded-full bg-woven-surface/60 backdrop-blur-2xl border border-woven-border/50 shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)] overflow-hidden"
        data-testid="game-hud"
      >
        {/* Weave texture */}
        <CanvasWeave lineCount={8} rounded="full" />

        {showNLevel && (
          <div className="relative z-10 h-9 px-2.5 [@media(max-height:700px)]:px-2 rounded-full text-[13px] font-bold uppercase bg-woven-cell-rest/60 backdrop-blur-lg text-woven-text leading-none flex items-center justify-center">
            N-{snapshot.nLevel}
          </div>
        )}
        <div className="relative z-10 h-9 text-[13px] [@media(max-height:700px)]:text-xs font-bold px-2.5 [@media(max-height:700px)]:px-2 rounded-full bg-woven-cell-rest/60 backdrop-blur-lg text-woven-text flex items-center gap-1 leading-none">
          <Timer size={12} weight="bold" className="text-woven-text-muted" />
          {countdownMode ? (
            <span className="text-[16px] tabular-nums tracking-tight">{remaining}</span>
          ) : (
            <>
              <span className="text-[16px] tabular-nums tracking-tight">
                {String(displayedTrial).padStart(2, '0')}
              </span>
              <span className="text-woven-text-muted"> / </span>
              <span className="text-[16px] tabular-nums tracking-tight">
                {String(safeTotalTrials).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
        {showAdaptiveZone && adaptiveZone !== null && (
          <div className="relative z-10 px-2 py-1 [@media(max-height:700px)]:px-1.5 bg-woven-cell-rest/60 backdrop-blur-lg rounded-full text-xs font-bold text-woven-text">
            Z{adaptiveZone}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            onHaptic?.(10);
            onTogglePause();
          }}
          className={cn(
            'relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border/50 bg-woven-surface/60 backdrop-blur-lg text-woven-text',
            isPaused && 'bg-woven-cell-rest',
            !canPause && 'opacity-50',
          )}
          title={isPaused ? t('game.hud.resume') : t('game.hud.pause')}
          disabled={!canPause}
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button
          type="button"
          onClick={() => {
            onHaptic?.(10);
            onOpenSettings();
          }}
          className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border/50 bg-woven-surface/60 backdrop-blur-lg text-woven-text"
          title={t('game.hud.settings', 'Settings')}
        >
          <GearSix size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            onHaptic?.(10);
            onQuit();
          }}
          className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full transition-all border border-woven-border/50 bg-woven-surface/60 backdrop-blur-lg text-woven-text"
          title={t('game.hud.quit')}
        >
          <House size={16} />
        </button>
      </div>

      {/* Progress bar with hatch pattern */}
      {showProgressBar && (
        <div className="w-full max-w-[200px] h-[3px] mt-3 rounded-full overflow-hidden bg-woven-cell-rest/30">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${progressPercent}%`,
            }}
          >
            <svg className="w-full h-full" aria-hidden="true">
              <defs>
                <pattern
                  id="label-progress-hatch"
                  width="7"
                  height="3"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="1.2"
                    y1="0"
                    x2="1.2"
                    y2="3"
                    className="stroke-woven-text"
                    strokeWidth="0.75"
                    opacity="0.25"
                  />
                  <line
                    x1="3.5"
                    y1="0"
                    x2="3.5"
                    y2="3"
                    className="stroke-woven-text"
                    strokeWidth="0.75"
                    opacity="0.25"
                  />
                  <line
                    x1="5.8"
                    y1="0"
                    x2="5.8"
                    y2="3"
                    className="stroke-woven-text"
                    strokeWidth="0.75"
                    opacity="0.6"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#label-progress-hatch)" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
