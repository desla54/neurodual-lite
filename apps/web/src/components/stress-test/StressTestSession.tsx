/**
 * StressTestSession - Runs a single session for stress testing
 *
 * Minimal session wrapper that:
 * 1. Creates a session based on config
 * 2. Uses the bot to play automatically
 * 3. Reports when done
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  GameConfig,
  GameSessionXState,
  gameModeRegistry,
  getBlockConfigFromSpec,
} from '@neurodual/logic';
import { Grid, useGameSession } from '@neurodual/ui';
import { useAppPorts } from '../../providers';
import { useCommandBus } from '../../providers/system-provider';
import { useGameBot, DEFAULT_BOT_CONFIG } from '../dev';
import type { StressTestConfig } from './types';
import type { SessionRunResult } from './useStressTestRunner';

// =============================================================================
// Types
// =============================================================================

interface StressTestSessionProps {
  config: StressTestConfig;
  onComplete: (result: SessionRunResult) => void;
}

// =============================================================================
// Component
// =============================================================================

export function StressTestSession({ config, onComplete }: StressTestSessionProps): React.ReactNode {
  const { audio, platformInfo, devLogger } = useAppPorts();
  const commandBus = useCommandBus();
  const startTimeRef = useRef(Date.now());
  const eventsRef = useRef<Array<{ type: string; timestamp: number; data?: unknown }>>([]);
  const completedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get mode spec
  const resolvedMode = useMemo(() => {
    try {
      return gameModeRegistry.resolveWithSettings(config.modeId, {
        nLevel: config.nLevel,
        trialsCount: config.trialsCount,
        activeModalities: config.modalities as string[],
      });
    } catch {
      // Fallback to dual-catch if mode not found
      return gameModeRegistry.resolveWithSettings('dual-catch', {
        nLevel: config.nLevel,
        trialsCount: config.trialsCount,
        activeModalities: config.modalities as string[],
      });
    }
  }, [config]);

  // Create session
  const session = useMemo(() => {
    const gameConfig = new GameConfig({
      ...getBlockConfigFromSpec(resolvedMode.spec),
      nLevel: config.nLevel,
      trialsCount: config.trialsCount,
      activeModalities: config.modalities as string[],
    });

    return new GameSessionXState(`stress-test-${config.id}`, gameConfig, {
      // Audio is always required by GameSessionXState
      // We control sound via feedbackConfig.audioFeedback instead
      audio,
      devLogger,
      platformInfoPort: platformInfo,
      // gameMode comes from spec.metadata.id - SSOT
      spec: resolvedMode.spec,
      playMode: 'free',
      feedbackConfig: {
        visualFeedback: false,
        audioFeedback: config.uiSettings.soundEnabled,
      },
      commandBus: commandBus ?? undefined,
    });
  }, [config, resolvedMode, audio, devLogger, platformInfo, commandBus]);

  // Hook into session
  const {
    snapshot: { phase, trial, trialIndex, totalTrials, nLevel, dPrime, summary },
    dispatch,
  } = useGameSession(session);

  // Collect phase events
  useEffect(() => {
    eventsRef.current.push({
      type: `PHASE_${phase.toUpperCase()}`,
      timestamp: Date.now(),
    });
  }, [phase]);

  // Collect trial events (when trialIndex changes = trial presented/completed)
  useEffect(() => {
    if (trialIndex > 0) {
      eventsRef.current.push({
        type: 'TRIAL_COMPLETED',
        timestamp: Date.now(),
        data: { trialIndex, trial },
      });
    }
    if (trial) {
      eventsRef.current.push({
        type: 'TRIAL_PRESENTED',
        timestamp: Date.now(),
        data: { trialIndex, position: trial.position, sound: trial.sound },
      });
    }
  }, [trialIndex, trial]);

  // Debug logging
  useEffect(() => {
    const isTarget = trial
      ? `pos=${trial.isPositionTarget} snd=${trial.isSoundTarget}`
      : 'no-trial';
    console.log(
      `[StressTest] ${config.modeId} | phase=${phase} trial=${trialIndex}/${totalTrials} | ${isTarget}`,
    );
  }, [phase, trialIndex, totalTrials, config.modeId, trial]);

  // Bot configuration - fast, perfect mode
  const botConfig = useMemo(
    () => ({
      ...DEFAULT_BOT_CONFIG,
      mode: 'perfect' as const,
      delayMs: 50, // Fast responses
    }),
    [],
  );

  // Use the bot
  const botStats = useGameBot({
    snapshot: {
      phase,
      trial,
      trialIndex,
      totalTrials,
      nLevel,
    },
    dispatch,
    activeModalities: config.modalities,
    config: botConfig,
    enabled: phase === 'stimulus' || phase === 'waiting',
    selfPaced: false,
  });

  // Start session on mount
  useEffect(() => {
    startTimeRef.current = Date.now();
    eventsRef.current = [{ type: 'SESSION_STARTED', timestamp: Date.now() }];

    // Start with a small delay to ensure everything is mounted
    const startTimeout = setTimeout(() => {
      dispatch({ type: 'START' });
    }, 100);

    return () => {
      clearTimeout(startTimeout);
      session.stop();
    };
  }, [dispatch, session]);

  // Handle session end
  useEffect(() => {
    if (phase === 'finished' && !completedRef.current) {
      completedRef.current = true;

      eventsRef.current.push({ type: 'SESSION_ENDED', timestamp: Date.now() });

      const result: SessionRunResult = {
        config,
        finalPhase: phase,
        events: eventsRef.current,
        durationMs: Date.now() - startTimeRef.current,
        timedOut: false,
        summary: {
          trialsCompleted: trialIndex,
          dPrime,
          passed: summary?.passed,
        },
      };

      // Small delay before reporting to let any final renders complete
      setTimeout(() => onComplete(result), 100);
    }
  }, [phase, config, trialIndex, onComplete]);

  // Timeout handler
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;

        eventsRef.current.push({ type: 'TIMEOUT', timestamp: Date.now() });

        onComplete({
          config,
          finalPhase: phase,
          events: eventsRef.current,
          durationMs: Date.now() - startTimeRef.current,
          timedOut: true,
          summary: {
            trialsCompleted: trialIndex,
          },
        });
      }
    }, 120000); // 2 minute timeout

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [config, phase, trialIndex, onComplete]);

  // Show stimulus during stimulus or waiting phase
  const showStimulus = phase === 'stimulus' || phase === 'waiting';
  const activePosition = trial?.position ?? null;

  // Minimal UI - just show the grid for visual verification
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      {/* Status */}
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-400">
          {config.modeId} | N={nLevel} | Trial {trialIndex}/{totalTrials}
        </div>
        <div className="text-xs text-gray-500">Phase: {phase}</div>
      </div>

      {/* Grid - scaled down */}
      <div className="transform scale-75">
        <Grid
          activePosition={activePosition}
          showStimulus={showStimulus}
          stimulusStyle="full"
          color="white"
        />
      </div>

      {/* Bot stats */}
      <div className="mt-4 text-xs text-gray-500">
        Bot: {botStats.responsesGiven} responses | {botStats.targetsDetected} targets
      </div>
    </div>
  );
}
