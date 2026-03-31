/**
 * TraceFinishedScreen - Session complete screen for Dual Trace mode
 *
 * Uses UnifiedSessionReport for consistent end-of-game display.
 */

import {
  convertTraceSession,
  generateContextualMessageData,
  type ModalityId,
  TRACE_ACCURACY_PASS_NORMALIZED,
  type SessionEndReportModel,
} from '@neurodual/logic';
import type { TraceSessionSummary } from '@neurodual/logic';
import type { TraceModality } from '@neurodual/logic';
import { UnifiedSessionReport } from '@neurodual/ui';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnifiedReportLabels } from '../../hooks/use-unified-report-labels';
import { translateContextualMessage } from '../../utils/contextual-message';
import { useReportVariant } from '../../hooks/use-report-variant';

// =============================================================================
// Types
// =============================================================================

export interface TraceFinishedScreenProps {
  /** Session summary data */
  summary: TraceSessionSummary;
  /** N-level */
  nLevel: number;
  /** Enabled modalities for this session */
  enabledModalities: readonly TraceModality[];
  /** Called when restart is clicked */
  onRestart: () => void;
  /** Called when back/home is clicked */
  onBack: () => void;
  /** Called when statistics is clicked */
  onGoToStats?: (report: SessionEndReportModel) => void;
  /** Beta features enabled */
  betaEnabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function TraceFinishedScreen({
  summary,
  nLevel,
  enabledModalities,
  onRestart,
  onBack,
  onGoToStats,
  betaEnabled = false,
}: TraceFinishedScreenProps): ReactNode {
  const { t } = useTranslation();
  const reportVariant = useReportVariant();
  const unifiedReportLabels = useUnifiedReportLabels();

  // Active modalities come from the session config (not from observed responses).
  const activeModalities = useMemo<readonly ModalityId[]>(() => {
    const list: ModalityId[] = [];
    if (enabledModalities.includes('position')) list.push('position');
    if (enabledModalities.includes('audio')) list.push('audio');
    if (enabledModalities.includes('color')) list.push('color');
    // Safety: ensure at least position exists
    return list.length > 0 ? list : ['position'];
  }, [enabledModalities]);

  // Convert summary to unified report model
  const unifiedReportData = useMemo(() => {
    return convertTraceSession({
      sessionId: summary.sessionId,
      createdAt: new Date().toISOString(),
      summary,
      activeModalities,
      gameModeLabel: t('modes.dualTrace.name', 'Dual Trace'),
      passed: summary.score >= TRACE_ACCURACY_PASS_NORMALIZED * 100,
      nextLevel: nLevel, // Keep same level for now
    });
  }, [summary, activeModalities, nLevel, t]);

  // Generate contextual message
  const contextMessage = useMemo(() => {
    return translateContextualMessage(
      t,
      generateContextualMessageData(unifiedReportData, {
        style: reportVariant === 'beta' ? 'analyst' : 'simple',
        variant: reportVariant,
      }),
    );
  }, [unifiedReportData, t, reportVariant]);

  return (
    <div className="game-report-scroll" data-testid="trace-session-report-transition">
      <div
        className="relative space-y-6 pt-0 pb-8 px-0 md:px-4 md:py-8"
        data-testid="trace-session-report-container"
      >
        <UnifiedSessionReport
          data={unifiedReportData}
          message={contextMessage}
          labels={{
            ...unifiedReportLabels,
            modeScoreLabel: t(unifiedReportData.modeScore.labelKey),
            modeScoreTooltip: unifiedReportData.modeScore.tooltipKey
              ? t(unifiedReportData.modeScore.tooltipKey)
              : undefined,
          }}
          onPlayAgain={onRestart}
          onBackToHome={onBack}
          onGoToStats={onGoToStats}
          showFloatingCloseButton
          betaEnabled={betaEnabled}
        />
      </div>
    </div>
  );
}
