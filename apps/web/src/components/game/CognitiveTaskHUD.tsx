/**
 * CognitiveTaskHUD - Thin wrapper around GameHUD for cognitive task modes.
 *
 * Adds route-based label inference and contextual quick-settings overlay.
 */

import { memo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { GameHUD, HUD_BADGE } from '@neurodual/ui';
import { getModeForRoute } from '../../lib/mode-metadata';
import { getModeLabelKey, getModeShortLabel } from '../../pages/settings/config/game-modes';
import { useSettingsStore } from '../../stores';
import { CognitiveQuickSettingsOverlay } from './CognitiveQuickSettingsOverlay';

/** Modes that expose an N-level setting (used for HUD badge). */
const MODES_WITH_NLEVEL = new Set([
  'stroop-flex',
  'gridlock',
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-mix',
]);

export interface CognitiveTaskHUDProps {
  /** Mode label badge (e.g. "PASAT", "Empan 4"). Auto-resolved from route if omitted. */
  label?: string;
  /** Secondary info shown after the trial counter (e.g. "ISI 2.0s") */
  sublabel?: string;
  /** Current trial index (0-based) */
  trialIndex: number;
  /** Total number of trials */
  totalTrials: number;
  /** Called when quit button is clicked */
  onQuit: () => void;
  /** Show progress bar below HUD (default: true) */
  showProgressBar?: boolean;
  /** Optional pause state */
  isPaused?: boolean;
  /** Whether pause/resume is currently available */
  canPause?: boolean;
  /** Optional pause/resume handler */
  onTogglePause?: () => void;
  /** Optional settings shortcut */
  onOpenSettings?: () => void;
  /** Optional quick settings content shown in the contextual menu */
  settingsMenuContent?: ReactNode;
  /** Optional title for the contextual settings menu */
  settingsMenuTitle?: string;
  /** Optional extra action rendered before quit (e.g. context menu) */
  extraAction?: ReactNode;
  /** Optional explicit N-level override for modes that resolve it outside the shared registry. */
  overrideNLevel?: number | null;
}

export const CognitiveTaskHUD = memo(function CognitiveTaskHUD({
  label,
  sublabel,
  trialIndex,
  totalTrials,
  onQuit,
  showProgressBar = true,
  isPaused = false,
  canPause = false,
  onTogglePause,
  onOpenSettings,
  settingsMenuContent,
  settingsMenuTitle,
  extraAction,
  overrideNLevel,
}: CognitiveTaskHUDProps): ReactNode {
  const { t } = useTranslation();
  const location = useLocation();
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const [showModeName, setShowModeName] = useState(false);

  const inferredMode = getModeForRoute(location.pathname);
  const inferredLabelKey = inferredMode ? getModeLabelKey(inferredMode) : undefined;
  const resolvedLabel = label ?? (inferredLabelKey ? t(inferredLabelKey) : undefined);
  const settingsAction =
    onOpenSettings ?? (inferredMode ? () => setShowSettingsMenu(true) : undefined);

  // Read nLevel from the mode inferred from the current route
  const nLevel = useSettingsStore((s) => {
    if (typeof overrideNLevel === 'number' && Number.isFinite(overrideNLevel)) {
      return overrideNLevel;
    }
    if (!inferredMode || !MODES_WITH_NLEVEL.has(inferredMode)) return null;
    const ms = s.modes[inferredMode as keyof typeof s.modes];
    const v = (ms as Record<string, unknown> | undefined)?.['nLevel'];
    return typeof v === 'number' && Number.isFinite(v) ? v : 1;
  });

  // Toggleable label: N-level by default, mode short name on tap
  const shortName = inferredMode ? getModeShortLabel(inferredMode) : undefined;
  const flipLabel =
    nLevel != null ? (
      <button
        type="button"
        onClick={() => setShowModeName((v) => !v)}
        className={HUD_BADGE}
        data-capture-badge="game-hud"
      >
        {showModeName && shortName ? shortName : `N-${nLevel}`}
      </button>
    ) : undefined;

  return (
    <>
      <GameHUD
        customLabel={flipLabel}
        label={flipLabel ? undefined : resolvedLabel}
        sublabel={sublabel}
        trialIndex={trialIndex}
        totalTrials={totalTrials}
        isPaused={isPaused}
        canPause={canPause}
        onTogglePause={onTogglePause}
        onSettings={settingsAction}
        onQuit={onQuit}
        showProgressBar={showProgressBar}
        extraAction={extraAction}
      />

      {inferredMode && !onOpenSettings && (
        <CognitiveQuickSettingsOverlay
          isOpen={showSettingsMenu}
          onClose={() => setShowSettingsMenu(false)}
          title={settingsMenuTitle}
          fullMenuState={{
            backTo: `${location.pathname}${location.search}${location.hash}`,
          }}
          onBeforeOpenFullMenu={() => setCurrentMode(inferredMode)}
        >
          {settingsMenuContent}
        </CognitiveQuickSettingsOverlay>
      )}
    </>
  );
});
