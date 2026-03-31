/**
 * ReportErrorProfile - Error analysis section
 *
 * Displays error rate and miss/FA distribution.
 * Shows a compact "no errors" state when applicable.
 */

import type { ReactNode } from 'react';
import type { SessionEndReportModel } from '@neurodual/logic';
import type { ReportLabels } from './types';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

export interface ReportErrorProfileProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

// =============================================================================
// Component
// =============================================================================

export function ReportErrorProfile({ data, labels }: ReportErrorProfileProps): ReactNode {
  const { t } = useTranslation();
  const { errorProfile } = data;
  // FA can be null for Flow/Memo modes
  const fa = data.totals.falseAlarms ?? 0;
  const totalErrors = data.totals.misses + fa;
  const hasFalseAlarms = errorProfile.faShare !== null;

  const errorRateDisplay = `${Math.round(errorProfile.errorRate * 100)}%`;
  const hasErrors = totalErrors > 0;

  return (
    <div className="w-full p-3 bg-white dark:bg-white/[0.05] rounded-xl border border-border">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {labels.errorProfile}
      </h3>

      <div className="space-y-3">
        {/* Error rate */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{labels.errorRate}</span>
          <span className="text-lg font-bold text-foreground">{errorRateDisplay}</span>
        </div>

        {/* Error distribution bar - only show for Tempo-like modes (when FA is applicable) */}
        {hasFalseAlarms && hasErrors && (
          <div className="space-y-1">
            <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
              <div
                className="bg-orange-500 transition-all"
                style={{ width: `${errorProfile.missShare * 100}%` }}
              />
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(errorProfile.faShare ?? 0) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                {labels.missShare}: {Math.round(errorProfile.missShare * 100)}%
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                {labels.faShare}: {Math.round((errorProfile.faShare ?? 0) * 100)}%
              </span>
            </div>
          </div>
        )}

        {!hasErrors && (
          <p className="text-xs text-muted-foreground">
            {labels.noErrors ?? t('stats.unifiedReport.errors.none', 'No errors')}
          </p>
        )}
      </div>
    </div>
  );
}
