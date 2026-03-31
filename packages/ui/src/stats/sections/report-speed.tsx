/**
 * ReportSpeed - Speed/rhythm metrics section
 *
 * Displays reaction time and distribution for Tempo-like modes.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionEndReportModel } from '@neurodual/logic';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportSpeedProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

// =============================================================================
// Component
// =============================================================================

export function ReportSpeed({ data, labels }: ReportSpeedProps): ReactNode {
  const { t } = useTranslation();

  if (!data.speedStats) return null;

  return (
    <div className="w-full p-3 bg-secondary/50 rounded-xl border border-border">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {labels.speedRhythm}
      </h3>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {labels.speedLabel ?? data.speedStats.labelKey}
        </span>
        <span className="text-lg font-bold text-foreground font-mono">
          {Math.round(data.speedStats.valueMs)}ms
        </span>
      </div>

      {data.speedStats.secondary && data.speedStats.secondary.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
          {data.speedStats.secondary.map((s, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {labels.speedSecondaryLabels?.[i] ?? s.labelKey}
              </span>
              <span className="font-mono">{Math.round(s.valueMs)}ms</span>
            </div>
          ))}
        </div>
      )}

      {data.speedStats.distribution && (
        <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs text-muted-foreground">
          <span>
            {t('stats.unifiedReport.distributionMin')}:{' '}
            {Math.round(data.speedStats.distribution.min)}ms
          </span>
          <span>
            {t('stats.unifiedReport.distributionMed')}:{' '}
            {Math.round(data.speedStats.distribution.median)}ms
          </span>
          <span>
            {t('stats.unifiedReport.distributionMax')}:{' '}
            {Math.round(data.speedStats.distribution.max)}ms
          </span>
        </div>
      )}
    </div>
  );
}
