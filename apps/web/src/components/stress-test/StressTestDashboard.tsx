/**
 * StressTestDashboard - Live dashboard for stress testing
 *
 * Shows:
 * - Progress (sessions completed / total)
 * - Pass/fail ratio
 * - Current config being tested
 * - Error log
 * - Memory usage
 */

import { Play, Pause, Stop, CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StressTestState, StressTestResult, GeneratorOptions } from './types';
import { getAvailableModes } from './config-generator';

// =============================================================================
// Types
// =============================================================================

interface StressTestDashboardProps {
  state: StressTestState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  options: GeneratorOptions;
  onOptionsChange: (options: GeneratorOptions) => void;
}

// =============================================================================
// Components
// =============================================================================

function ProgressBar({ value, max }: { value: number; max: number }): ReactNode {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'text-white',
}: {
  label: string;
  value: string | number;
  color?: string;
}): ReactNode {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ResultRow({ result }: { result: StressTestResult }): ReactNode {
  const { t } = useTranslation();
  const Icon = result.passed ? CheckCircle : XCircle;
  const iconColor = result.passed ? 'text-green-400' : 'text-red-400';

  const dPrime = result.scoring?.dPrime;
  const sessionPassed = result.scoring?.sessionPassed;

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-white/5 rounded-lg text-sm">
      <Icon size={18} weight="fill" className={iconColor} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{result.config.modeId}</div>
        <div className="text-xs text-gray-400">
          N={result.config.nLevel} | {result.config.modalities.join(', ')} |{' '}
          {t('admin.stressRunner.trials', {
            count: result.config.trialsCount,
            defaultValue: '{{count}} trials',
          })}
        </div>
      </div>
      {dPrime !== undefined && (
        <div className={`text-xs ${sessionPassed ? 'text-green-400' : 'text-yellow-400'}`}>
          d'={dPrime.toFixed(2)}
        </div>
      )}
      <div className="text-xs text-gray-400">{(result.durationMs / 1000).toFixed(1)}s</div>
      {result.memoryMb && (
        <div className="text-xs text-gray-400">{result.memoryMb.toFixed(0)}MB</div>
      )}
    </div>
  );
}

function FailedInvariants({ result }: { result: StressTestResult }): ReactNode {
  const failed = result.invariants.filter((i) => !i.passed);
  if (failed.length === 0) return null;

  return (
    <div className="mt-1 ml-7 text-xs text-red-300">
      {failed.map((inv) => (
        <div key={inv.name}>
          <Warning size={12} className="inline mr-1" />
          {inv.name}: {inv.message}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

export function StressTestDashboard({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  options,
  onOptionsChange,
}: StressTestDashboardProps): ReactNode {
  const { t } = useTranslation();
  const isRunning = state.phase === 'running';
  const isPaused = state.phase === 'paused';
  const isIdle = state.phase === 'idle' || state.phase === 'completed';

  const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
  const elapsedFormatted = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const passRate =
    state.completedCount > 0 ? ((state.passedCount / state.completedCount) * 100).toFixed(1) : '0';

  // Get recent results (last 10)
  const recentResults = state.results.slice(-10).reverse();
  const failedResults = state.results.filter((r) => !r.passed);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {t('admin.stressRunner.title', 'Stress test runner')}
          </h1>
          <div className="flex gap-2">
            {isIdle && (
              <button
                type="button"
                onClick={onStart}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
              >
                <Play size={20} weight="fill" />
                {t('admin.stressRunner.start', 'Start')}
              </button>
            )}
            {isRunning && (
              <button
                type="button"
                onClick={onPause}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg transition-colors"
              >
                <Pause size={20} weight="fill" />
                {t('admin.stressRunner.pause', 'Pause')}
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={onResume}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
              >
                <Play size={20} weight="fill" />
                {t('admin.stressRunner.resume', 'Resume')}
              </button>
            )}
            {!isIdle && (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                <Stop size={20} weight="fill" />
                {t('admin.stressRunner.stop', 'Stop')}
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        {state.targetCount > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('admin.stressRunner.progress', 'Progress')}</span>
              <span>
                {state.completedCount} / {state.targetCount}
              </span>
            </div>
            <ProgressBar value={state.completedCount} max={state.targetCount} />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t('admin.stressRunner.completed', 'Completed')}
            value={state.completedCount}
          />
          <StatCard
            label={t('admin.stressRunner.passed', 'Passed')}
            value={state.passedCount}
            color="text-green-400"
          />
          <StatCard
            label={t('admin.stressRunner.failed', 'Failed')}
            value={state.failedCount}
            color="text-red-400"
          />
          <StatCard label={t('admin.stressRunner.passRate', 'Pass rate')} value={`${passRate}%`} />
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label={t('admin.stressRunner.duration', 'Duration')} value={elapsedFormatted} />
          <StatCard
            label={t('admin.stressRunner.phase', 'Phase')}
            value={state.phase}
            color={
              state.phase === 'running'
                ? 'text-green-400'
                : state.phase === 'paused'
                  ? 'text-yellow-400'
                  : 'text-gray-400'
            }
          />
          {state.currentConfig && (
            <StatCard
              label={t('admin.stressRunner.currentMode', 'Current mode')}
              value={state.currentConfig.modeId}
            />
          )}
        </div>

        {/* Options (only when idle) */}
        {isIdle && (
          <div className="bg-white/5 rounded-lg p-4 space-y-4">
            <h2 className="font-semibold">{t('admin.stressRunner.options', 'Options')}</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t('admin.stressRunner.nLevelRange', 'N-level range')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={options.nLevelRange.min}
                    onChange={(e) =>
                      onOptionsChange({
                        ...options,
                        nLevelRange: {
                          ...options.nLevelRange,
                          min: Number(e.target.value),
                        },
                      })
                    }
                    className="w-16 px-2 py-1 bg-black/30 border border-white/20 rounded text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={options.nLevelRange.max}
                    onChange={(e) =>
                      onOptionsChange({
                        ...options,
                        nLevelRange: {
                          ...options.nLevelRange,
                          max: Number(e.target.value),
                        },
                      })
                    }
                    className="w-16 px-2 py-1 bg-black/30 border border-white/20 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {t('admin.stressRunner.trialsRange', 'Trials range')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={options.trialsCountRange.min}
                    onChange={(e) =>
                      onOptionsChange({
                        ...options,
                        trialsCountRange: {
                          ...options.trialsCountRange,
                          min: Number(e.target.value),
                        },
                      })
                    }
                    className="w-16 px-2 py-1 bg-black/30 border border-white/20 rounded text-sm"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={options.trialsCountRange.max}
                    onChange={(e) =>
                      onOptionsChange({
                        ...options,
                        trialsCountRange: {
                          ...options.trialsCountRange,
                          max: Number(e.target.value),
                        },
                      })
                    }
                    className="w-16 px-2 py-1 bg-black/30 border border-white/20 rounded text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {t('admin.stressRunner.modesToTest', 'Modes to test')}
              </label>
              <div className="flex flex-wrap gap-2">
                {getAvailableModes().map((mode) => {
                  const isIncluded = !options.excludeModes?.includes(mode);
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        const current = options.excludeModes ?? [];
                        const newExcluded = isIncluded
                          ? [...current, mode]
                          : current.filter((m) => m !== mode);
                        onOptionsChange({
                          ...options,
                          excludeModes: newExcluded,
                        });
                      }}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        isIncluded ? 'bg-violet-600 text-white' : 'bg-white/10 text-gray-400'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Current Config */}
        {state.currentConfig && (
          <div className="bg-violet-900/30 border border-violet-500/30 rounded-lg p-4">
            <div className="text-sm text-violet-300 mb-2">
              {t('admin.stressRunner.currentlyTesting', 'Currently testing')}
            </div>
            <div className="font-mono">
              <span className="text-violet-400">{state.currentConfig.modeId}</span>
              <span className="text-gray-400"> | </span>
              N={state.currentConfig.nLevel}
              <span className="text-gray-400"> | </span>
              {state.currentConfig.modalities.join(', ')}
              <span className="text-gray-400"> | </span>
              {t('admin.stressRunner.trials', {
                count: state.currentConfig.trialsCount,
                defaultValue: '{{count}} trials',
              })}
            </div>
          </div>
        )}

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold">
              {t('admin.stressRunner.recentResults', 'Recent results')}
            </h2>
            <div className="space-y-1">
              {recentResults.map((result) => (
                <div key={result.config.id}>
                  <ResultRow result={result} />
                  <FailedInvariants result={result} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failed Results Summary */}
        {failedResults.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-red-400">
              {t('admin.stressRunner.failedSessions', {
                count: failedResults.length,
                defaultValue: 'Failed sessions ({{count}})',
              })}
            </h2>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {failedResults.map((result) => (
                <div key={result.config.id}>
                  <ResultRow result={result} />
                  <FailedInvariants result={result} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {state.errors.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-red-400">
              {t('admin.stressRunner.errors', 'Errors')}
            </h2>
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-sm font-mono max-h-48 overflow-y-auto">
              {state.errors.map((error, i) => (
                <div key={`${error.timestamp}-${i}`} className="text-red-300">
                  [{error.type}] {error.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
