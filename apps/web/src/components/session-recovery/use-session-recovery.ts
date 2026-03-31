/**
 * useSessionRecovery Hook
 *
 * Manages session recovery state and actions.
 * Should be used at the app level (e.g., in App.tsx or main layout).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { SessionRecoverySnapshot, RecoveryCheckResult } from '@neurodual/logic';
import { useSettingsStore } from '../../stores/settings-store';
import { useAppPorts } from '../../providers';

export interface UseSessionRecoveryReturn {
  /** Whether there's a session to recover */
  hasRecovery: boolean;
  /** The recovery snapshot if available */
  snapshot: SessionRecoverySnapshot | null;
  /** Whether the session is stale */
  isStale: boolean;
  /** Resume the session (navigates to the correct page) */
  resume: () => void;
  /** Decline recovery and clear snapshot */
  decline: () => void;
  /** Dismiss the modal (same as decline) */
  dismiss: () => void;
}

/**
 * Hook to manage session recovery flow.
 *
 * Usage:
 * ```tsx
 * const { hasRecovery, snapshot, isStale, resume, decline, dismiss } = useSessionRecovery();
 *
 * if (hasRecovery && snapshot) {
 *   return <SessionRecoveryModal
 *     snapshot={snapshot}
 *     isStale={isStale}
 *     onResume={resume}
 *     onStartFresh={decline}
 *     onDismiss={dismiss}
 *   />;
 * }
 * ```
 */
export function useSessionRecovery(): UseSessionRecoveryReturn {
  const navigate = useNavigate();
  const sessionRecoveryEnabled = useSettingsStore((s) => s.ui.sessionRecoveryEnabled);
  const { sessionRecovery } = useAppPorts();
  const [recoveryState, setRecoveryState] = useState<RecoveryCheckResult>({
    hasSession: false,
    snapshot: null,
    isStale: false,
  });

  // Check for recovery on mount
  useEffect(() => {
    if (!sessionRecoveryEnabled) {
      // If disabled, ensure we don't keep showing prompts after refresh.
      sessionRecovery.clearRecoverySnapshot();
      setRecoveryState({ hasSession: false, snapshot: null, isStale: false });
      return;
    }

    const result = sessionRecovery.checkForRecoverableSession();
    setRecoveryState(result);
  }, [sessionRecoveryEnabled, sessionRecovery]);

  const resume = useCallback(() => {
    const { snapshot } = recoveryState;
    if (!snapshot) return;

    // Map modeId to actual route path
    const modeIdToRoute: Record<string, string> = {
      game: '/nback',
      'active-training': '/dual-memo',
      'place-training': '/dual-place',
      'dual-pick-training': '/dual-pick',
      'trace-training': '/dual-trace',
    };
    const routePath = modeIdToRoute[snapshot.modeId] ?? `/${snapshot.modeId}`;

    // Navigate to the correct page with recovery flag
    const route = `${routePath}?recover=${snapshot.sessionId}`;
    if (routePath === '/nback') {
      const resolvedPlayMode =
        snapshot.playMode ??
        (typeof snapshot.journeyStageId === 'number' || typeof snapshot.journeyId === 'string'
          ? 'journey'
          : 'free');
      navigate(route, {
        state: {
          playMode: resolvedPlayMode,
          journeyStageId: snapshot.journeyStageId,
          journeyId: snapshot.journeyId,
        },
      });
    } else {
      navigate(route);
    }

    // Clear the recovery state (the page will handle actual recovery)
    setRecoveryState({ hasSession: false, snapshot: null, isStale: false });
  }, [recoveryState, navigate]);

  const decline = useCallback(() => {
    sessionRecovery.clearRecoverySnapshot();
    setRecoveryState({ hasSession: false, snapshot: null, isStale: false });
  }, [sessionRecovery]);

  const dismiss = useCallback(() => {
    // Same as decline - dismissing means starting fresh
    decline();
  }, [decline]);

  return {
    hasRecovery: recoveryState.hasSession,
    snapshot: recoveryState.snapshot,
    isStale: recoveryState.isStale,
    resume,
    decline,
    dismiss,
  };
}
