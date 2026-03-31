/**
 * DevPanel - Panneau de développement flottant
 *
 * Visible uniquement quand beta est activé.
 * Toggle avec Ctrl+D.
 * Contient les contrôles du bot de gameplay.
 */

import { Clock, Robot, X, Target, Crosshair, Shuffle, ArrowClockwise } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPorts } from '../../providers';
import type { AudioPreset } from '@neurodual/logic';
import type { BotConfig, BotMode, BotStats } from './useGameBot';

// =============================================================================
// Types
// =============================================================================

interface DevPanelProps {
  config: BotConfig;
  onChange: (config: BotConfig) => void;
  onClose: () => void;
  stats: BotStats;
  trialIndex: number;
  totalTrials: number;
}

interface TimingDiagnostics {
  count: number;
  avgAbsLateMs: number;
  p95AbsLateMs: number;
  maxAbsLateMs: number;
  byKind: Record<
    string,
    { count: number; avgAbsLateMs: number; p95AbsLateMs: number; maxAbsLateMs: number }
  >;
  visualCalibrationDeltaMs: number;
  visualPreScheduledCount: number;
  visualOffsetClampedCount: number;
  visualOffsetClampedRate: number;
}

// =============================================================================
// Component
// =============================================================================

export function DevPanel({
  config,
  onChange,
  onClose,
  stats,
  trialIndex,
  totalTrials,
}: DevPanelProps): ReactNode {
  const { t } = useTranslation();
  const { audioDebug } = useAppPorts();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const [tab, setTab] = useState<'bot' | 'sync'>('bot');

  const [audioRunning, setAudioRunning] = useState(audioDebug.isAudioContextRunning());
  const [timingDiag, setTimingDiag] = useState<TimingDiagnostics | null>(null);
  const [timingDebugEnabled, setTimingDebugEnabled] = useState(() => {
    try {
      return window.localStorage?.getItem('ND_AUDIO_DEBUG_TIMING') === '1';
    } catch {
      return false;
    }
  });

  // Dragging handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, input, select')) return;
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Config change handlers
  const setMode = (mode: BotMode) => {
    onChange({ ...config, mode });
  };

  const setAccuracy = (accuracy: number) => {
    onChange({ ...config, accuracy });
  };

  const setDelay = (delayMs: number) => {
    onChange({ ...config, delayMs });
  };

  // Live sync diagnostics refresh (only while Sync tab is open)
  useEffect(() => {
    if (tab !== 'sync') return;
    const id = window.setInterval(() => {
      setAudioRunning(audioDebug.isAudioContextRunning());
      try {
        setTimingDiag(audioDebug.getTimingDiagnostics() as TimingDiagnostics);
      } catch {
        setTimingDiag(null);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [tab, audioDebug]);

  const toggleTimingDebug = useCallback(() => {
    const next = !timingDebugEnabled;
    try {
      window.localStorage?.setItem('ND_AUDIO_DEBUG_TIMING', next ? '1' : '0');
    } catch {
      // ignore
    }
    setTimingDebugEnabled(next);
  }, [timingDebugEnabled]);

  const toggleAutoCalibration = useCallback(() => {
    const next = !audioDebug.isAutoVisualCalibrationEnabled();
    audioDebug.setAutoVisualCalibrationEnabled(next);
  }, []);

  const resetCalibration = useCallback(() => {
    audioDebug.resetAutoVisualCalibration();
  }, []);

  const initOrResumeAudio = useCallback(async () => {
    await audioDebug.init();
    await audioDebug.resume();
    setAudioRunning(audioDebug.isAudioContextRunning());
  }, []);

  const setAudioPreset = useCallback((preset: AudioPreset) => {
    audioDebug.setConfig({ audioPreset: preset });
  }, []);

  const modeButtons: { mode: BotMode; icon: typeof Robot; color: string }[] = [
    { mode: 'off', icon: X, color: 'bg-gray-600' },
    { mode: 'perfect', icon: Target, color: 'bg-green-600' },
    { mode: 'realistic', icon: Crosshair, color: 'bg-blue-600' },
    { mode: 'random', icon: Shuffle, color: 'bg-orange-600' },
  ];

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg shadow-xl text-white text-sm select-none"
      style={{
        left: position.x,
        top: position.y,
        width: 280,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-grab">
        <div className="flex items-center gap-2">
          {tab === 'bot' ? (
            <Robot size={18} weight="bold" className="text-purple-400" />
          ) : (
            <Clock size={18} weight="bold" className="text-cyan-300" />
          )}
          <span className="font-bold">
            {tab === 'bot'
              ? t('admin.devPanel.titleBot', 'Dev bot')
              : t('admin.devPanel.titleSync', 'Sync monitor')}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-4">
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab('bot')}
            className={`px-3 py-2 rounded transition-all text-xs font-semibold ${
              tab === 'bot'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t('admin.tabs.bot', 'Bot')}
          </button>
          <button
            type="button"
            onClick={() => setTab('sync')}
            className={`px-3 py-2 rounded transition-all text-xs font-semibold ${
              tab === 'sync'
                ? 'bg-cyan-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t('admin.tabs.sync', 'Sync')}
          </button>
        </div>

        {tab === 'bot' && (
          <>
            {/* Mode selector */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                {t('admin.bot.mode', 'Bot mode')}
              </label>
              <div className="grid grid-cols-4 gap-1">
                {modeButtons.map(({ mode, icon: Icon, color }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMode(mode)}
                    className={`flex flex-col items-center gap-1 p-2 rounded transition-all ${
                      config.mode === mode
                        ? `${color} text-white scale-105`
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <Icon size={16} weight={config.mode === mode ? 'bold' : 'regular'} />
                    <span className="text-3xs">{t(`admin.bot.modes.${mode}.label`, mode)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accuracy slider (only for realistic mode) */}
            {config.mode === 'realistic' && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-xs text-gray-400 uppercase tracking-wider">
                    {t('admin.bot.accuracy', 'Accuracy')}
                  </label>
                  <span className="text-xs font-mono text-blue-400">
                    {Math.round(config.accuracy * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.accuracy * 100}
                  onChange={(e) => setAccuracy(Number(e.target.value) / 100)}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            {/* Delay slider */}
            {config.mode !== 'off' && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-xs text-gray-400 uppercase tracking-wider">
                    {t('admin.bot.responseDelay', 'Response delay')}
                  </label>
                  <span className="text-xs font-mono text-purple-400">{config.delayMs}ms</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="25"
                  value={config.delayMs}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            )}
          </>
        )}

        {tab === 'sync' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400 uppercase tracking-wider">
                {t('admin.devPanel.audio', 'Audio')}
              </div>
              <button
                type="button"
                onClick={() => void initOrResumeAudio()}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-xs"
              >
                <ArrowClockwise size={14} />
                {t('admin.sync.audioInit', 'Init/Resume')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/5 rounded p-2">
                <div className="text-gray-400">{t('admin.devPanel.running', 'Running')}</div>
                <div className="font-mono text-white">{String(audioRunning)}</div>
              </div>
              <div className="bg-white/5 rounded p-2">
                <div className="text-gray-400">{t('admin.devPanel.autoCalib', 'Auto-calib')}</div>
                <div className="font-mono text-white">
                  {String(audioDebug.isAutoVisualCalibrationEnabled())}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wider">
                {t('admin.sync.audioPreset', 'Audio preset')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAudioPreset('default')}
                  className="px-2 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-mono"
                >
                  default
                </button>
                <button
                  type="button"
                  onClick={() => setAudioPreset('default')}
                  className="px-2 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-mono"
                >
                  default
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-400 uppercase tracking-wider">
                {t('admin.sync.debugTiming', 'Debug timing')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={toggleTimingDebug}
                  className={`px-2 py-2 rounded text-xs font-semibold ${
                    timingDebugEnabled
                      ? 'bg-green-600 text-white'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {t('admin.devPanel.debug', 'Debug')}{' '}
                  {timingDebugEnabled
                    ? t('admin.devPanel.on', 'ON')
                    : t('admin.devPanel.off', 'OFF')}
                </button>
                <button
                  type="button"
                  onClick={toggleAutoCalibration}
                  className="px-2 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-semibold"
                >
                  {t('admin.devPanel.toggleCalib', 'Toggle calib')}
                </button>
              </div>
              <button
                type="button"
                onClick={resetCalibration}
                className="w-full px-2 py-2 rounded bg-white/5 hover:bg-white/10 text-xs font-semibold"
              >
                {t('admin.devPanel.resetCalib', 'Reset calib')}
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-400 uppercase tracking-wider">
                {t('admin.sync.diagnostics', 'Timing diagnostics')}
              </div>
              {timingDiag ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-gray-400">
                      {t('admin.devPanel.overallP95', 'overall p95')}
                    </div>
                    <div className="font-mono text-white">
                      {timingDiag.p95AbsLateMs.toFixed(1)}ms
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-gray-400">
                      {t('admin.devPanel.overallMax', 'overall max')}
                    </div>
                    <div className="font-mono text-white">
                      {timingDiag.maxAbsLateMs.toFixed(1)}ms
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-gray-400">
                      {t('admin.devPanel.visualPreP95', 'visual_pre p95')}
                    </div>
                    <div className="font-mono text-white">
                      {(timingDiag.byKind['visual_pre']?.p95AbsLateMs ?? 0).toFixed(1)}ms
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-gray-400">
                      {t('admin.devPanel.audioSyncP95', 'audio_sync p95')}
                    </div>
                    <div className="font-mono text-white">
                      {(timingDiag.byKind['audio_sync']?.p95AbsLateMs ?? 0).toFixed(1)}ms
                    </div>
                  </div>
                  <div className="col-span-2 bg-white/5 rounded p-2">
                    <div className="text-gray-400">{t('admin.devPanel.calibDelta', 'calib Δ')}</div>
                    <div className="font-mono text-white">
                      {timingDiag.visualCalibrationDeltaMs.toFixed(1)}ms
                    </div>
                  </div>
                  <div className="col-span-2 bg-white/5 rounded p-2">
                    <div className="text-gray-400">
                      {t('admin.devPanel.clampRate', 'clamp rate')}
                    </div>
                    <div className="font-mono text-white">
                      {(timingDiag.visualOffsetClampedRate * 100).toFixed(0)}% (
                      {timingDiag.visualOffsetClampedCount}/{timingDiag.visualPreScheduledCount})
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  {t('admin.devPanel.noSamplesYet', 'No samples yet')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="pt-2 border-t border-white/10 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">{t('admin.devPanel.trials', 'Trials')}</span>
            <span className="font-mono">
              {trialIndex}/{totalTrials}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">{t('admin.devPanel.responses', 'Responses')}</span>
            <span className="font-mono text-green-400">{stats.responsesGiven}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">
              {t('admin.devPanel.targetsFound', 'Targets found')}
            </span>
            <span className="font-mono text-blue-400">{stats.targetsDetected}</span>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-white/10 text-3xs text-gray-500 text-center">
        {t('admin.devPanel.toggleHint', 'Ctrl+D to toggle')}
      </div>
    </div>
  );
}
