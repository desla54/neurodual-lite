/**
 * GameHUD — Unified head-up display for all game modes.
 *
 * Glass + subtle weave texture, info left / actions right,
 * progress bar flush at the bottom of the block.
 *
 * Supports custom slots (customLabel, customTrialCounter) so modes
 * like nback can inject their own widgets while sharing the shell.
 */

import { memo, type ReactNode } from 'react';
import { ArrowClockwise, GearSix, House, Pause, Play, Timer } from '@phosphor-icons/react';
import { cn } from '../lib/utils';
import { CanvasWeave } from '../primitives';

// =============================================================================
// Types
// =============================================================================

export interface GameHUDProps {
  /** Mode label badge (e.g. "N-3", "PASAT"). Hidden if omitted. */
  label?: string;
  /** Replace default label badge with custom ReactNode (e.g. flip badge) */
  customLabel?: ReactNode;
  /** Current trial (0-based index) */
  trialIndex: number;
  /** Total number of trials */
  totalTrials: number;
  /** Show remaining trials instead of current/total */
  countdownMode?: boolean;
  /** Replace default trial counter with custom ReactNode (e.g. clickable counter) */
  customTrialCounter?: ReactNode;
  /** Adaptive zone value (e.g. 2 → "Z2"). Hidden if null/undefined. */
  zone?: number | null;
  /** Secondary info badge (e.g. "ISI 2.0s"). Hidden if omitted. */
  sublabel?: string;
  /** Whether session is paused */
  isPaused?: boolean;
  /** Whether pause/resume is available */
  canPause?: boolean;
  /** Pause/resume handler. Button hidden if omitted. */
  onTogglePause?: () => void;
  /** Settings handler. Button hidden if omitted. */
  onSettings?: () => void;
  /** Quit handler (required — always shown) */
  onQuit: () => void;
  /** Restart handler, shown only when paused. Hidden if omitted. */
  onRestart?: () => void;
  /** Extra action rendered before the quit button */
  extraAction?: ReactNode;
  /** Show progress bar below HUD (default: true) */
  showProgressBar?: boolean;
  /** Haptic feedback trigger */
  onHaptic?: (durationMs?: number) => void;
  /** Additional className on the outermost wrapper */
  className?: string;
}

// =============================================================================
// Style constants
// =============================================================================

const pad = (n: number) => String(n).padStart(2, '0');

/** HUD container — flat surface with warm shadow */
const GLASS =
  'relative flex flex-col w-fit max-w-full sm:max-w-md rounded-2xl overflow-hidden border border-woven-border/60 bg-woven-surface shadow-[0_2px_16px_-2px_hsl(var(--woven-border)/0.25)]';

/** Info badge */
export const HUD_BADGE =
  'h-8 px-2.5 rounded-lg text-[13px] font-bold uppercase border border-woven-border/40 bg-woven-text/[0.07] shadow-[inset_0_1px_3px_0_hsl(var(--woven-border)/0.2)] text-woven-text leading-none flex items-center justify-center whitespace-nowrap';

/** Small info badge */
export const HUD_BADGE_SM =
  'px-2 py-1 rounded-lg text-xs font-bold border border-woven-border/40 bg-woven-text/[0.07] shadow-[inset_0_1px_3px_0_hsl(var(--woven-border)/0.2)] whitespace-nowrap';

/** Action button (no active:scale — creates stacking context) */
export const HUD_BTN =
  'w-10 h-10 flex items-center justify-center rounded-lg transition-colors border border-woven-border/50 bg-woven-surface text-woven-text active:brightness-90 shadow-sm';

// =============================================================================
// Component
// =============================================================================

export const GameHUD = memo(function GameHUD({
  label,
  customLabel,
  trialIndex,
  totalTrials,
  countdownMode = false,
  customTrialCounter,
  zone,
  sublabel,
  isPaused = false,
  canPause = false,
  onTogglePause,
  onSettings,
  onQuit,
  onRestart,
  extraAction,
  showProgressBar = true,
  onHaptic,
  className,
}: GameHUDProps): ReactNode {
  const safeTotalTrials = Math.max(0, totalTrials);
  const clampedTrialIndex =
    safeTotalTrials > 0 ? Math.min(Math.max(trialIndex, 0), safeTotalTrials - 1) : 0;
  const displayedTrial = safeTotalTrials > 0 ? clampedTrialIndex + 1 : 0;
  const remaining = Math.max(0, safeTotalTrials - displayedTrial);
  const progressPercent =
    safeTotalTrials > 0 ? Math.min(100, Math.max(0, (displayedTrial / safeTotalTrials) * 100)) : 0;

  // ── Default label badge ───────────────────────────────
  const labelNode =
    customLabel ??
    (label ? (
      <div className={HUD_BADGE} data-capture-badge="game-hud">
        {label}
      </div>
    ) : null);

  // ── Default trial counter ─────────────────────────────
  const trialNode = customTrialCounter ?? (
    <div className={cn(HUD_BADGE, 'gap-1')} data-capture-badge="game-hud">
      <Timer size={12} weight="bold" className="text-woven-text-muted" />
      {countdownMode ? (
        <span className="text-[15px] tabular-nums tracking-tight">{remaining}</span>
      ) : (
        <>
          <span className="text-[15px] tabular-nums tracking-tight">{pad(displayedTrial)}</span>
          <span className="text-woven-text-muted"> / </span>
          <span className="text-[15px] tabular-nums tracking-tight">{pad(safeTotalTrials)}</span>
        </>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'relative z-40 shrink-0 flex flex-col items-center pt-[clamp(0.25rem,2vh,0.75rem)]',
        className,
      )}
    >
      <div className="relative flex flex-col items-center w-full px-2 sm:px-3">
        {/* ── Glass block (HUD + progress) ───────────────── */}
        <div className={GLASS} data-testid="game-hud" data-capture-surface="game-hud">
          <CanvasWeave lineCount={8} rounded="2xl" opacity={0.04} />

          {/* ── Content row ────────────────────────────────── */}
          <div className="relative z-10 flex items-center justify-between gap-2 p-2 px-2 sm:px-3">
            {/* ── Info side (left) ──────────────────────────── */}
            <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5 overflow-hidden">
              {labelNode}
              {trialNode}

              {zone != null && (
                <div
                  className={cn(HUD_BADGE_SM, 'text-woven-text')}
                  data-capture-badge="game-hud-sm"
                >
                  Z{zone}
                </div>
              )}

              {sublabel && (
                <div
                  className={cn(HUD_BADGE_SM, 'max-w-[7rem] truncate text-woven-text-muted')}
                  data-capture-badge="game-hud-sm"
                >
                  {sublabel}
                </div>
              )}
            </div>

            {/* ── Separator ────────────────────────────────── */}
            <div
              className="w-px self-stretch shrink-0 bg-woven-border/25"
              data-capture-control-divider="true"
            />

            {/* ── Actions side (right) ─────────────────────── */}
            <div className="flex shrink-0 items-center justify-end gap-1">
              {onTogglePause && (
                <button
                  type="button"
                  onClick={() => {
                    onHaptic?.(10);
                    onTogglePause();
                  }}
                  className={cn(HUD_BTN, !canPause && 'opacity-50')}
                  data-capture-control="game-hud-button"
                  disabled={!canPause}
                >
                  {isPaused ? <Play size={15} /> : <Pause size={15} />}
                </button>
              )}

              {onSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onHaptic?.(10);
                    onSettings();
                  }}
                  className={HUD_BTN}
                  data-capture-control="game-hud-button"
                >
                  <GearSix size={15} />
                </button>
              )}

              {extraAction}

              <button
                type="button"
                onClick={() => {
                  onHaptic?.(10);
                  onQuit();
                }}
                className={HUD_BTN}
                data-capture-control="game-hud-button"
              >
                <House size={15} />
              </button>
            </div>
          </div>

          {/* ── Progress bar (flush bottom) ──────────────── */}
          {showProgressBar && (
            <div className="w-full h-[3px] bg-woven-cell-rest/30" data-capture-progress="track">
              <div
                className="h-full bg-woven-text/25 rounded-r-full transition-[width] duration-300 ease-out"
                data-capture-progress="fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Restart button (appears below when paused) ──── */}
        {isPaused && onRestart && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-50 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                onHaptic?.(10);
                onRestart();
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-destructive/45 bg-woven-surface text-woven-text transition-colors hover:bg-woven-cell-rest/60 active:brightness-90"
              data-capture-control="game-hud-button"
            >
              <ArrowClockwise size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
