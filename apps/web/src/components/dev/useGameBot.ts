/**
 * useGameBot - Bot de gameplay automatique pour les tests
 *
 * Modes:
 * - off: Bot désactivé
 * - perfect: 100% accuracy, connaît les bonnes réponses
 * - realistic: Accuracy configurable (ex: 85%)
 * - random: Répond au hasard
 */

import { useEffect, useRef } from 'react';
import { getIsTarget, type ModalityId, type Trial } from '@neurodual/logic';
import { useMountEffect } from '@neurodual/ui';

// =============================================================================
// Types
// =============================================================================

export type BotMode = 'off' | 'perfect' | 'realistic' | 'random';

export interface BotConfig {
  mode: BotMode;
  /** Accuracy pour le mode realistic (0-1) */
  accuracy: number;
  /** Délai avant de répondre en ms (simule un humain) */
  delayMs: number;
  /** Probabilité de faux positif en mode realistic (0-1) */
  falsePositiveRate: number;
}

export interface BotStats {
  trialsPlayed: number;
  responsesGiven: number;
  targetsDetected: number;
}

export interface GameSnapshot {
  phase: string;
  trial: Trial | null;
  trialIndex: number;
  totalTrials: number;
  nLevel: number;
}

export interface UseGameBotOptions {
  snapshot: GameSnapshot;
  // Using any for dispatch since the actual type is complex (GameIntention -> IntentResult)
  // The bot only dispatches CLAIM_MATCH which is valid
  // biome-ignore lint/suspicious/noExplicitAny: Dispatch type varies by session
  dispatch: (event: any) => void;
  activeModalities: readonly string[];
  config: BotConfig;
  enabled: boolean;
  /** If true, bot will dispatch ADVANCE after responding */
  selfPaced?: boolean;
}

// =============================================================================
// Default Config
// =============================================================================

export const DEFAULT_BOT_CONFIG: BotConfig = {
  mode: 'off',
  accuracy: 0.85,
  delayMs: 200,
  falsePositiveRate: 0.05,
};

// =============================================================================
// Hook
// =============================================================================

export function useGameBot({
  snapshot,
  dispatch,
  activeModalities,
  config,
  enabled,
  selfPaced = false,
}: UseGameBotOptions): BotStats {
  const statsRef = useRef<BotStats>({
    trialsPlayed: 0,
    responsesGiven: 0,
    targetsDetected: 0,
  });

  // Track which trial we've already processed to avoid double-responses
  const processedTrialRef = useRef<number>(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMountEffect(() => {
    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  });

  useEffect(() => {
    // Skip if disabled or bot is off
    if (!enabled || config.mode === 'off') return;

    // Only act during stimulus or waiting phases
    if (snapshot.phase !== 'stimulus' && snapshot.phase !== 'waiting') return;

    // Skip if no trial
    if (!snapshot.trial) return;

    // Skip if we've already processed this trial
    if (processedTrialRef.current === snapshot.trialIndex) return;

    // Mark as processed
    processedTrialRef.current = snapshot.trialIndex;
    statsRef.current.trialsPlayed++;

    // Compute which modalities are targets
    const targetModalities: ModalityId[] = [];
    for (const modalityId of activeModalities) {
      if (getIsTarget(snapshot.trial, modalityId as ModalityId)) {
        targetModalities.push(modalityId as ModalityId);
        statsRef.current.targetsDetected++;
      }
    }

    // Decide which modalities to respond to based on mode
    const modalitiesToRespond = decideBotResponses(
      config.mode,
      targetModalities,
      activeModalities as ModalityId[],
      config.accuracy,
      config.falsePositiveRate,
    );

    // Schedule responses with human-like delay
    const delay = config.delayMs + (Math.random() - 0.5) * 100; // ±50ms variation

    timeoutRef.current = setTimeout(() => {
      // Dispatch responses
      for (const modality of modalitiesToRespond) {
        dispatch({
          type: 'CLAIM_MATCH',
          modality,
          inputMethod: 'bot',
        });
        statsRef.current.responsesGiven++;
      }

      // In self-paced mode, also advance to next trial
      if (selfPaced) {
        // Small delay after responses before advancing
        setTimeout(() => {
          dispatch({ type: 'ADVANCE' });
        }, 100);
      }
    }, delay);
  }, [
    enabled,
    config.mode,
    config.accuracy,
    config.delayMs,
    config.falsePositiveRate,
    snapshot.phase,
    snapshot.trial,
    snapshot.trialIndex,
    activeModalities,
    dispatch,
    selfPaced,
  ]);

  return statsRef.current;
}

// =============================================================================
// Decision Logic
// =============================================================================

function decideBotResponses(
  mode: BotMode,
  targetModalities: ModalityId[],
  activeModalities: ModalityId[],
  accuracy: number,
  falsePositiveRate: number,
): ModalityId[] {
  switch (mode) {
    case 'perfect':
      // Return all correct targets
      return [...targetModalities];

    case 'realistic': {
      const responses: ModalityId[] = [];

      // For each target, respond with probability = accuracy
      for (const modality of targetModalities) {
        if (Math.random() < accuracy) {
          responses.push(modality);
        }
      }

      // For each non-target, maybe add a false positive
      for (const modality of activeModalities) {
        if (!targetModalities.includes(modality) && Math.random() < falsePositiveRate) {
          responses.push(modality);
        }
      }

      return responses;
    }

    case 'random': {
      // Random responses with ~30% probability per modality
      const responses: ModalityId[] = [];
      for (const modality of activeModalities) {
        if (Math.random() < 0.3) {
          responses.push(modality);
        }
      }
      return responses;
    }

    default:
      return [];
  }
}
