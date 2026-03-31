import type { ReactNode } from 'react';
import { Toggle } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';
import { CognitiveQuickSettingsOverlay } from '../game/CognitiveQuickSettingsOverlay';

interface DualTrackQuickSettingsProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly fullMenuBackTo: string;
  readonly onBeforeOpenFullMenu: () => void;
  readonly buttonSoundsEnabled: boolean;
  readonly feedbackSoundsEnabled: boolean;
  readonly hapticEnabled: boolean;
  readonly onButtonSoundsEnabledChange: (value: boolean) => void;
  readonly onFeedbackSoundsEnabledChange: (value: boolean) => void;
  readonly onHapticEnabledChange: (value: boolean) => void;
  readonly isDarkMode?: boolean;
  readonly onThemeToggle?: () => void;
  readonly onBugReport?: () => void;
}

export function DualTrackQuickSettings({
  isOpen,
  onClose,
  fullMenuBackTo,
  onBeforeOpenFullMenu,
  buttonSoundsEnabled,
  feedbackSoundsEnabled,
  hapticEnabled,
  onButtonSoundsEnabledChange,
  onFeedbackSoundsEnabledChange,
  onHapticEnabledChange,
  isDarkMode,
  onThemeToggle,
  onBugReport,
}: DualTrackQuickSettingsProps): ReactNode {
  const { t } = useTranslation();

  return (
    <CognitiveQuickSettingsOverlay
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.gameMode.dualTrack', 'Dual Track')}
      fullMenuState={{ backTo: fullMenuBackTo }}
      onBeforeOpenFullMenu={onBeforeOpenFullMenu}
      isDarkMode={isDarkMode}
      onThemeToggle={onThemeToggle}
      onBugReport={onBugReport}
    >
      <div className="divide-y divide-border/60">
        <Toggle
          label={t('settings.audio.buttonSounds', 'Button sounds')}
          checked={buttonSoundsEnabled}
          onChange={onButtonSoundsEnabledChange}
        />
        <Toggle
          label={t('settings.audio.feedbackSounds', 'Feedback sounds')}
          checked={feedbackSoundsEnabled}
          onChange={onFeedbackSoundsEnabledChange}
        />
        <Toggle
          label={t('settings.accessibility.hapticEnabled', 'Haptics')}
          checked={hapticEnabled}
          onChange={onHapticEnabledChange}
        />
      </div>
    </CognitiveQuickSettingsOverlay>
  );
}
