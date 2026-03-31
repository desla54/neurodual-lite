/**
 * ReportPerformance - Per-modality performance grid
 *
 * Displays hits/misses/FA/CR per modality with d' and RT if available.
 * Uses spec-driven helpers for colors and labels (supports N modalities).
 */

import { Check, X, Warning, Timer } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { SubCard } from '../../primitives/card';
import {
  type SessionEndReportModel,
  computeSpecDrivenTempoAccuracy,
  getModalityColor,
  getModalityFamily,
  getModalityLabelInfo,
  getOptimalModalityLayout,
  isHexColor,
} from '@neurodual/logic';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportPerformanceProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

// =============================================================================
// Component
// =============================================================================

export function ReportPerformance({ data, labels }: ReportPerformanceProps): ReactNode {
  const modalities = data.activeModalities;
  const layout = getOptimalModalityLayout(modalities.length);
  const gameMode = data.gameMode;

  // Layout classes based on modality count
  const layoutClasses = {
    'grid-2': 'grid grid-cols-2 gap-3',
    'grid-3': 'grid grid-cols-3 gap-3',
    scroll:
      'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible',
  };

  // Card classes for scroll layout
  const cardClasses = layout === 'scroll' ? 'flex-shrink-0 w-[45%] snap-center sm:w-auto' : '';

  return (
    <div className="w-full space-y-3">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">
        {labels.performance}
      </h3>

      <div className={layoutClasses[layout]}>
        {modalities.map((modality) => {
          const stats = data.byModality[modality];
          if (!stats) return null;

          const modalityScorePercent = (() => {
            // Tempo-like modes: use spec-driven scoring strategy (SDT / Dual N-Back Classic / BW / accuracy).
            if (stats.falseAlarms !== null && stats.correctRejections !== null) {
              const total =
                stats.hits +
                stats.misses +
                (stats.falseAlarms ?? 0) +
                (stats.correctRejections ?? 0);
              if (total === 0) return null;
              return Math.round(
                computeSpecDrivenTempoAccuracy(
                  gameMode,
                  stats.hits,
                  stats.misses,
                  stats.falseAlarms ?? 0,
                  stats.correctRejections ?? 0,
                ) * 100,
              );
            }

            // Non-tempo modes: simple accuracy (hits / (hits + misses)).
            const total = stats.hits + stats.misses;
            if (total === 0) return null;
            return Math.round((stats.hits / total) * 100);
          })();

          // Get color (CSS class or hex color)
          const color = getModalityColor(modality);
          const colorStyle = isHexColor(color) ? { color } : undefined;
          const colorClass = isHexColor(color) ? '' : color;

          // Get label info for i18n
          const labelInfo = getModalityLabelInfo(modality);
          const label =
            labelInfo.index !== null
              ? `${labels.modality?.[labelInfo.family] ?? labelInfo.family} ${labelInfo.index}`
              : (labels.modality?.[labelInfo.family] ?? labelInfo.family);

          // Binding modalities (color/audio in dual-track) use a simplified display
          const family = getModalityFamily(modality);
          const isBindingModality =
            (family === 'color' || family === 'audio') &&
            stats.falseAlarms === null &&
            stats.correctRejections === null;

          if (isBindingModality) {
            const total = stats.hits + stats.misses;
            const pct = total > 0 ? Math.round((stats.hits / total) * 100) : null;

            return (
              <SubCard key={modality} className={cn('space-y-3', cardClasses)}>
                <span
                  className={cn(
                    colorClass,
                    'font-bold text-3xs uppercase tracking-widest block text-center border-b border-border/60 pb-2',
                  )}
                  style={colorStyle}
                >
                  {label}
                </span>

                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-mono text-lg font-bold text-foreground">
                    {stats.hits}
                    <span className="text-muted-foreground font-normal">/{total}</span>
                  </span>
                  {pct !== null && (
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        pct >= 80
                          ? 'text-woven-correct'
                          : pct >= 50
                            ? 'text-amber-500'
                            : 'text-woven-incorrect',
                      )}
                    >
                      {pct}%
                    </span>
                  )}
                </div>
              </SubCard>
            );
          }

          return (
            <SubCard key={modality} className={cn('space-y-3', cardClasses)}>
              <span
                className={cn(
                  colorClass,
                  'font-bold text-3xs uppercase tracking-widest block text-center border-b border-border/60 pb-2',
                )}
                style={colorStyle}
              >
                {label}
              </span>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center group">
                  <span className="text-muted-foreground group-hover:text-woven-correct transition-colors flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-woven-correct" weight="bold" />
                    {labels.hits}
                  </span>
                  <span className="font-bold text-foreground font-mono">{stats.hits}</span>
                </div>
                <div className="flex justify-between items-center group">
                  <span className="text-muted-foreground group-hover:text-woven-incorrect transition-colors flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 text-woven-incorrect" weight="bold" />
                    {labels.misses}
                  </span>
                  <span className="font-bold text-foreground font-mono">{stats.misses}</span>
                </div>
                {/* FA only shown for Tempo-like modes (when not null) */}
                {stats.falseAlarms !== null && (
                  <div className="flex justify-between items-center group">
                    <span className="text-muted-foreground group-hover:text-woven-incorrect transition-colors flex items-center gap-1.5">
                      <Warning className="w-3.5 h-3.5 text-woven-incorrect" weight="bold" />
                      {labels.falseAlarms}
                    </span>
                    <span className="font-bold text-foreground font-mono">{stats.falseAlarms}</span>
                  </div>
                )}
              </div>

              {/* d' and RT if available */}
              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{labels.accuracy}</span>
                  <span className="font-mono font-medium text-foreground/90">
                    {modalityScorePercent === null ? '—' : `${modalityScorePercent}%`}
                  </span>
                </div>
                {stats.dPrime !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{labels.dPrime}</span>
                    <span className="font-mono font-medium text-foreground/90">
                      {stats.dPrime.toFixed(2)}
                    </span>
                  </div>
                )}
                {stats.avgRT !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Timer className="w-3 h-3 opacity-70" />
                      {labels.reactionTime}
                    </span>
                    <span className="font-mono font-medium text-foreground/90">
                      {Math.round(stats.avgRT)}ms
                    </span>
                  </div>
                )}
              </div>
            </SubCard>
          );
        })}
      </div>
    </div>
  );
}
