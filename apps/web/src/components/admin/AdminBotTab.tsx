/**
 * AdminBotTab - Gameplay test bot controls
 *
 * Provides:
 * - Bot mode selection (off/perfect/realistic/random)
 * - Accuracy and delay configuration
 * - Quick links to start sessions with bot
 */

import { Button, Card } from '@neurodual/ui';
import { Robot, Target, Crosshair, Shuffle, Play, X } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

// =============================================================================
// Types (matching useGameBot)
// =============================================================================

type BotMode = 'off' | 'perfect' | 'realistic' | 'random';

interface BotConfig {
  mode: BotMode;
  accuracy: number; // 0-1, only used for 'realistic'
  delayMs: number; // Response delay
}

// =============================================================================
// Mode Buttons
// =============================================================================

const MODE_OPTIONS: {
  mode: BotMode;
  icon: typeof Robot;
  labelKey: string;
  labelDefault: string;
  descKey: string;
  descDefault: string;
  color: string;
}[] = [
  {
    mode: 'off',
    icon: X,
    labelKey: 'admin.bot.modes.off.label',
    labelDefault: 'Off',
    descKey: 'admin.bot.modes.off.desc',
    descDefault: 'Bot disabled - manual play',
    color: 'bg-gray-600',
  },
  {
    mode: 'perfect',
    icon: Target,
    labelKey: 'admin.bot.modes.perfect.label',
    labelDefault: 'Perfect',
    descKey: 'admin.bot.modes.perfect.desc',
    descDefault: '100% accuracy, always correct',
    color: 'bg-green-600',
  },
  {
    mode: 'realistic',
    icon: Crosshair,
    labelKey: 'admin.bot.modes.realistic.label',
    labelDefault: 'Realistic',
    descKey: 'admin.bot.modes.realistic.desc',
    descDefault: 'Configurable accuracy with natural variation',
    color: 'bg-blue-600',
  },
  {
    mode: 'random',
    icon: Shuffle,
    labelKey: 'admin.bot.modes.random.label',
    labelDefault: 'Random',
    descKey: 'admin.bot.modes.random.desc',
    descDefault: '50% random responses for stress testing',
    color: 'bg-orange-600',
  },
];

// =============================================================================
// Main Component
// =============================================================================

export function AdminBotTab(): ReactNode {
  const { t } = useTranslation();
  const [config, setConfig] = useState<BotConfig>({
    mode: 'realistic',
    accuracy: 0.85,
    delayMs: 200,
  });

  const setMode = (mode: BotMode) => {
    setConfig({ ...config, mode });
  };

  const setAccuracy = (accuracy: number) => {
    setConfig({ ...config, accuracy });
  };

  const setDelay = (delayMs: number) => {
    setConfig({ ...config, delayMs });
  };

  // Build URL params for bot config
  const buildBotParams = () => {
    const params = new URLSearchParams();
    params.set('bot', config.mode);
    if (config.mode === 'realistic') {
      params.set('accuracy', config.accuracy.toString());
    }
    if (config.mode !== 'off') {
      params.set('delay', config.delayMs.toString());
    }
    return params.toString();
  };

  return (
    <div className="space-y-6">
      {/* Info */}
      <Card className="bg-blue-500/5 border-blue-500/30">
        <div className="flex gap-3">
          <Robot size={24} weight="bold" className="text-blue-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-blue-400 mb-1">
              {t('admin.bot.title', 'Gameplay Test Bot')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.bot.description',
                'Configure bot settings and start a session with automated responses. The bot is also available during gameplay with Ctrl+D.',
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* Mode Selection */}
      <Card>
        <h4 className="font-bold mb-4">{t('admin.bot.mode', 'Bot mode')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MODE_OPTIONS.map(
            ({ mode, icon: Icon, labelKey, labelDefault, descKey, descDefault, color }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all border ${
                  config.mode === mode
                    ? `${color} text-white border-transparent scale-105`
                    : 'bg-surface text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                <Icon size={24} weight={config.mode === mode ? 'bold' : 'regular'} />
                <span className="font-bold text-sm">{t(labelKey, labelDefault)}</span>
                <span className="text-3xs text-center opacity-80">{t(descKey, descDefault)}</span>
              </button>
            ),
          )}
        </div>
      </Card>

      {/* Configuration */}
      {config.mode !== 'off' && (
        <Card>
          <h4 className="font-bold mb-4">{t('admin.bot.config', 'Configuration')}</h4>
          <div className="space-y-4">
            {/* Accuracy (only for realistic) */}
            {config.mode === 'realistic' && (
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-muted-foreground">
                    {t('admin.bot.accuracy', 'Accuracy')}
                  </label>
                  <span className="text-sm font-mono text-blue-400">
                    {Math.round(config.accuracy * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.accuracy * 100}
                  onChange={(e) => setAccuracy(Number(e.target.value) / 100)}
                  className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Delay */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-muted-foreground">
                  {t('admin.bot.responseDelay', 'Response delay')}
                </label>
                <span className="text-sm font-mono text-purple-400">{config.delayMs}ms</span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                value={config.delayMs}
                onChange={(e) => setDelay(Number(e.target.value))}
                className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>50ms</span>
                <span>1000ms</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Start Buttons */}
      <Card>
        <h4 className="font-bold mb-4">{t('admin.bot.quickStart', 'Quick Start Session')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link to={`/game?${buildBotParams()}`}>
            <Button variant="secondary" className="w-full gap-2">
              <Play size={16} />
              {t('admin.bot.quickStarts.dualCatch', 'Dual Catch')}
            </Button>
          </Link>
          <Link to={`/active-training?${buildBotParams()}`}>
            <Button variant="secondary" className="w-full gap-2">
              <Play size={16} />
              {t('admin.bot.quickStarts.activeTraining', 'Active training')}
            </Button>
          </Link>
          <Link to={`/flow?${buildBotParams()}`}>
            <Button variant="secondary" className="w-full gap-2">
              <Play size={16} />
              {t('admin.bot.quickStarts.dualPlace', 'Dual Place')}
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {t(
            'admin.bot.hint',
            'Sessions will start with the configured bot settings. Use Ctrl+D during gameplay to toggle.',
          )}
        </p>
      </Card>

      {/* Current Config Summary */}
      <div className="text-center text-sm text-muted-foreground">
        {t('admin.bot.currentConfig', 'Current config')}:{' '}
        <code className="bg-surface px-2 py-1 rounded">{buildBotParams() || 'bot=off'}</code>
      </div>
    </div>
  );
}
