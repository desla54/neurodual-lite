/**
 * CognitiveTaskHUD - Thin wrapper around GameHUD for cognitive task modes.
 *
 * Adds route-based label inference and contextual quick-settings overlay.
 */

import { memo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { GameHUD } from '@neurodual/ui';
import { getModeForRoute } from '../../lib/mode-metadata';
import { getModeLabelKey } from '../../pages/settings/config/game-modes';
import { useSettingsStore } from '../../stores';
import { CognitiveQuickSettingsOverlay } from './CognitiveQuickSettingsOverlay';

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
}: CognitiveTaskHUDProps): ReactNode {
  const { t } = useTranslation();
  const location = useLocation();
  const setCurrentMode = useSettingsStore((s) => s.setCurrentMode);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const inferredMode = getModeForRoute(location.pathname);
  const inferredLabelKey = inferredMode ? getModeLabelKey(inferredMode) : undefined;
  const resolvedLabel = label ?? (inferredLabelKey ? t(inferredLabelKey) : undefined);
  const settingsAction =
    onOpenSettings ?? (inferredMode ? () => setShowSettingsMenu(true) : undefined);

  return (
    <>
      <GameHUD
        label={resolvedLabel}
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
