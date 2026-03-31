/**
 * Tutorial Page - Orchestrator (NeuroDual Lite)
 *
 * This file manages the routing between the Tutorial Hub and the
 * Active Tutorial Engine.
 *
 * NeuroDual Lite: Only the basics (Classic N-2) tutorial is available.
 * Place/Pick/Trace/Memo tutorials are not included.
 *
 * Logic and UI components are imported from @neurodual/logic and @neurodual/ui.
 */

import { TutorialSpecs, type TutorialCompletionReport } from '@neurodual/logic';
import { TutorialHub, TutorialEngine, TutorialReport } from '@neurodual/ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

/**
 * TutorialGuidedPage - Router/Orchestrator
 *
 * - /tutorial          -> TutorialHub
 * - /tutorial/:specId  -> ActiveTutorialEngine
 */
export function TutorialGuidedPage(): ReactNode {
  const { specId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const completedTutorials = useSettingsStore((s) => s.ui.completedTutorials ?? []);
  const addCompletedTutorial = useSettingsStore((s) => s.addCompletedTutorial);

  const { audio, tutorialRecovery } = useAppPorts();

  // Recovery state
  const [recoveryCheck, setRecoveryCheck] = useState<{
    hasRecovery: boolean;
    stepIndex: number;
    tutorialId: string;
    isStale: boolean;
  } | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [startAtStep, setStartAtStep] = useState<number | undefined>(undefined);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [completionReport, setCompletionReport] = useState<TutorialCompletionReport | null>(null);
  const [engineRunId, setEngineRunId] = useState(0);

  // Check for recovery on mount
  useEffect(() => {
    const result = tutorialRecovery.checkForRecoverableTutorial();
    if (result.hasSession && result.snapshot) {
      setRecoveryCheck({
        hasRecovery: true,
        stepIndex: result.snapshot.stepIndex,
        tutorialId: result.snapshot.tutorialId,
        isStale: result.isStale,
      });
    }
  }, [tutorialRecovery]);

  // Derive active spec from URL param
  const activeSpec = useMemo(() => {
    if (!specId) return null;
    return TutorialSpecs[specId as keyof typeof TutorialSpecs] ?? null;
  }, [specId]);

  // Show recovery dialog if recovery matches current tutorial
  useEffect(() => {
    if (activeSpec && recoveryCheck?.hasRecovery && recoveryCheck.tutorialId === activeSpec.id) {
      setShowRecoveryDialog(true);
    }
  }, [activeSpec, recoveryCheck]);

  // Memoize callbacks to prevent actor recreation in useTutorialSession
  const handleExit = useCallback(() => {
    tutorialRecovery.clearTutorialRecoverySnapshot();
    setShowCompletionDialog(false);
    navigate('/');
  }, [navigate]);

  const handleComplete = useCallback(
    (report?: TutorialCompletionReport) => {
      tutorialRecovery.clearTutorialRecoverySnapshot();
      setCompletionReport(report ?? null);

      if (activeSpec) {
        const passed = report?.assessment ? report.assessment.passed : true;
        if (passed) {
          addCompletedTutorial(activeSpec.id);
        }
      }
      setShowCompletionDialog(true);
    },
    [activeSpec, addCompletedTutorial],
  );

  const handleRestart = useCallback(() => {
    tutorialRecovery.clearTutorialRecoverySnapshot();
    setStartAtStep(undefined);
    setShowCompletionDialog(false);
    setCompletionReport(null);
    setEngineRunId((x) => x + 1);
  }, []);

  // Handle step change - save recovery snapshot
  const handleStepChange = useCallback(
    (stepIndex: number) => {
      if (activeSpec) {
        const snapshot = tutorialRecovery.createTutorialRecoverySnapshot(activeSpec.id, stepIndex);
        tutorialRecovery.saveTutorialRecoverySnapshot(snapshot);
      }
    },
    [activeSpec],
  );

  // Recovery dialog handlers
  const handleResume = useCallback(() => {
    if (recoveryCheck) {
      setStartAtStep(recoveryCheck.stepIndex);
    }
    setShowRecoveryDialog(false);
  }, [recoveryCheck]);

  const handleStartFresh = useCallback(() => {
    tutorialRecovery.clearTutorialRecoverySnapshot();
    setStartAtStep(undefined);
    setShowRecoveryDialog(false);
  }, []);

  // Handle Tutorial Hub (No active spec)
  if (!activeSpec) {
    return (
      <TutorialHub
        onSelect={(id) => navigate(`/tutorial/${id}`)}
        completedTutorials={completedTutorials}
        lockedModeIds={[]}
      />
    );
  }

  // Show recovery dialog
  if (showRecoveryDialog && recoveryCheck) {
    const progress = Math.round(((recoveryCheck.stepIndex + 1) / activeSpec.steps.length) * 100);
    return (
      <div className="game-page-safe-center p-6">
        <div className="bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm rounded-2xl p-6 max-w-sm w-full shadow-lg">
          <h2 className="text-xl font-bold text-woven-text mb-2">
            {t('tutorial.recovery.title', 'Resume tutorial?')}
          </h2>
          <p className="text-woven-text-muted mb-4">
            {recoveryCheck.isStale
              ? t(
                  'tutorial.recovery.staleMessage',
                  'An interrupted session from more than 30 minutes ago was found.',
                )
              : t('tutorial.recovery.message', 'An interrupted session was found.')}
          </p>
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-2 bg-woven-cell-rest rounded-full overflow-hidden">
              <div
                className="h-full bg-visual rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-medium text-woven-text">{progress}%</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStartFresh}
              className="flex-1 px-4 py-3 rounded-xl border border-woven-border bg-woven-surface text-woven-text font-medium hover:bg-woven-cell-rest transition-colors"
            >
              {t('tutorial.recovery.startFresh', 'Start over')}
            </button>
            <button
              type="button"
              onClick={handleResume}
              className="flex-1 px-4 py-3 rounded-xl bg-woven-text text-woven-bg font-medium hover:opacity-90 transition-opacity"
            >
              {t('tutorial.recovery.resume', 'Resume')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showCompletionDialog) {
    const modeId = activeSpec.associatedModeId;

    return (
      <div className="game-page-safe-center p-6">
        <TutorialReport
          spec={activeSpec}
          report={completionReport ?? undefined}
          onBackToHome={handleExit}
          onRetry={handleRestart}
          onGoToTraining={() =>
            navigate('/', {
              state: {
                homeTab: 'free',
                suggestedModeId: modeId,
              },
            })
          }
        />
      </div>
    );
  }

  return (
    <TutorialEngine
      key={`${activeSpec.id}-${engineRunId}`}
      spec={activeSpec}
      audioAdapter={audio}
      onExit={handleExit}
      onComplete={handleComplete}
      startAtStep={startAtStep}
      onStepChange={handleStepChange}
    />
  );
}

export default TutorialGuidedPage;
