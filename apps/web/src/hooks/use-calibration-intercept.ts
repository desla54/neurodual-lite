/**
 * useCalibrationIntercept — Hook that intercepts game session completion
 * when in calibration mode and navigates back to /profile.
 *
 * Returns a derived pending intercept so the host page can mount a commit
 * component conditionally and skip report display.
 */

import {
  getCalibrationSessionScore,
  type CalibrationGameMode,
  type SessionEndReportModel,
} from '@neurodual/logic';
import { useMountEffect } from '@neurodual/ui';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { PlayIntentState } from '../lib/play-intent';

export interface CalibrationInterceptCommitPayload {
  readonly sessionId: string;
  readonly score: number;
}

export function CalibrationInterceptCommit({
  sessionId: _sessionId,
  score: _score,
}: CalibrationInterceptCommitPayload): ReactNode {
  const navigate = useNavigate();

  useMountEffect(() => {
    navigate('/profile', { replace: true });
  });

  return null;
}

export function useCalibrationIntercept(
  phase: string,
  report: SessionEndReportModel | null | undefined,
  /** Which game mode is running — determines which metric to record */
  gameMode: CalibrationGameMode = 'nback',
): {
  isCalibrationMode: boolean;
  pendingCommit: CalibrationInterceptCommitPayload | null;
} {
  const location = useLocation();

  const routerState = location.state as PlayIntentState | null;
  const isCalibrationMode =
    (routerState?.playMode === 'calibration' && routerState.calibration != null) ||
    (routerState?.playMode === 'profile' && routerState.profileTraining != null);

  const pendingCommit =
    isCalibrationMode && phase === 'finished' && report
      ? {
          sessionId: report.sessionId,
          score: getCalibrationSessionScore(gameMode, report.modeScore, report.unifiedAccuracy),
        }
      : null;

  return {
    isCalibrationMode,
    pendingCommit,
  };
}
