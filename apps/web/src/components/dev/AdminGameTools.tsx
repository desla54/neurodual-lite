/**
 * AdminGameTools - Bot + DevPanel, loaded only when admin is enabled.
 *
 * Isolated from nback-training so the dev module (useGameBot, DevPanel, audioService)
 * is NOT loaded when admin is disabled, avoiding background lag.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { DevPanel } from './DevPanel';
import { useGameBot, DEFAULT_BOT_CONFIG, type BotConfig } from './useGameBot';
import type { Trial } from '@neurodual/logic';

export interface AdminGameToolsProps {
  phase: string;
  trial: Trial | null;
  trialIndex: number;
  totalTrials: number;
  nLevel: number;
  dispatch: (event: unknown) => void;
  activeModalities: readonly string[];
  selfPaced: boolean;
  devPanelOpen: boolean;
  setDevPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Initial bot config from URL params (e.g. ?bot=perfect&delay=100) */
  initialBotConfig?: BotConfig;
}

export function AdminGameTools({
  phase,
  trial,
  trialIndex,
  totalTrials,
  nLevel,
  dispatch,
  activeModalities,
  selfPaced,
  devPanelOpen,
  setDevPanelOpen,
  initialBotConfig,
}: AdminGameToolsProps): ReactNode {
  const [botConfig, setBotConfig] = useState<BotConfig>(initialBotConfig ?? DEFAULT_BOT_CONFIG);

  const botStats = useGameBot({
    snapshot: { phase, trial, trialIndex, totalTrials, nLevel },
    dispatch,
    activeModalities,
    config: botConfig,
    enabled: botConfig.mode !== 'off',
    selfPaced,
  });

  const handleClose = useCallback(() => setDevPanelOpen(false), [setDevPanelOpen]);

  if (!devPanelOpen) return null;

  return (
    <DevPanel
      config={botConfig}
      onChange={setBotConfig}
      onClose={handleClose}
      stats={botStats}
      trialIndex={trialIndex}
      totalTrials={totalTrials}
    />
  );
}
