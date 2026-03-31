/**
 * ReportDetails - Detailed timeline of trial results by modality
 *
 * "Music Roll" / "DNA Strip" visualization style.
 * Visualizes the session as a continuous flow of events on horizontal tracks.
 *
 * Layout:
 * - Session summary
 * - Horizontal scroll timeline with tracks
 * - Legend
 */

import { X } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  SessionEndReportModel,
  TurnSummary,
  TempoTrialDetail,
  TrackTurnDetail,
  CognitiveTaskTrialDetail,
  ModalityId,
  ModalityFamily,
} from '@neurodual/logic';
import { getModalityColor, getModalityLabelInfo } from '@neurodual/logic';
import type { ReportLabels } from './types';
import { useTurnsLoader } from '../../hooks';
import { cn } from '../../lib/utils';
import { Spinner } from '../../primitives/spinner';

// =============================================================================
// Types
// =============================================================================

export interface ReportDetailsProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

type CellResult = 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Extract modality result from a turn's detail.
 * Returns null if the modality wasn't active or detail is not tempo-trial.
 */
function getModalityResult(
  turn: TurnSummary,
  modality: ModalityId,
): { hadTarget: boolean; result: CellResult } | null {
  if (turn.detail.kind !== 'tempo-trial') return null;

  const detail = turn.detail as TempoTrialDetail;
  const response = detail.responses[modality];
  if (!response) return null;

  const hadTarget = detail.targets.includes(modality);
  return { hadTarget, result: response.result };
}

function getFallbackModalityShortLabel(family: ModalityFamily): string {
  switch (family) {
    case 'position':
      return 'Pos';
    case 'audio':
      return 'Aud';
    case 'color':
      return 'Col';
    case 'arithmetic':
      return 'Ar';
    case 'image':
      return 'Img';
    case 'spatial':
      return 'Spa';
    case 'digits':
      return 'Dig';
    case 'emotions':
      return 'Emo';
    case 'words':
      return 'Wrd';
    case 'tones':
      return 'Ton';
    case 'shape':
      return 'Shp';
    case 'vis':
      return 'Vis';
    case 'visvis':
      return 'VV';
    case 'visaudio':
      return 'VA';
    case 'audiovis':
      return 'AV';
  }
}

function getModalityShortLabel(
  modalityId: ModalityId,
  t: (key: string, fallback: string) => string,
) {
  const { key, index, family } = getModalityLabelInfo(modalityId);
  const base = t(key, getFallbackModalityShortLabel(family));
  return index ? `${base}${index}` : base;
}

function getModalityLabelColorProps(modalityId: ModalityId): {
  className?: string;
  style?: CSSProperties;
} {
  const color = getModalityColor(modalityId);
  if (color.startsWith('#')) return { style: { color } };
  return { className: color };
}

// =============================================================================
// Component
// =============================================================================

export function ReportDetails({ data, labels }: ReportDetailsProps): ReactNode {
  const { t } = useTranslation();

  // Lazy load turns from events on mount
  const {
    state: loadState,
    turns: loadedTurns,
    load,
  } = useTurnsLoader(data.sessionId, data.gameMode);

  // Trigger load on mount (component is rendered when Disclosure opens)
  useEffect(() => {
    if (loadState === 'idle') {
      load();
    }
  }, [loadState, load]);

  // Use already-present turns from data (fresh session) OR loaded turns (history view)
  const turns = data.turns && data.turns.length > 0 ? data.turns : loadedTurns;
  const isLoading = loadState === 'loading';

  // Filter by trial kind
  const tempoTurns = turns.filter((t) => t.detail.kind === 'tempo-trial');
  const trackTurns = turns.filter((t) => t.detail.kind === 'track-trial');
  const cognitiveTaskTurns = turns.filter((t) => t.detail.kind === 'cognitive-task-trial');
  const modalities = data.activeModalities;
  const guideLineHeightPx = Math.max(0, modalities.length * 24 + (modalities.length - 1) * 20 + 16);

  return (
    <div className="w-full bg-white dark:bg-white/[0.05] border border-border rounded-xl p-4 space-y-6">
      {/* Session summary */}
      <div className="flex items-center justify-center gap-4 text-xs font-medium text-muted-foreground border-b border-border/40 pb-4">
        <div className="px-3 py-1 rounded-full bg-secondary/50 text-foreground">
          <span className="font-bold">N-{data.nLevel}</span>
        </div>
        <span>{t('stats.unifiedReport.trialsCount', { count: data.trialsCount })}</span>
        <span>{formatDuration(data.durationMs)}</span>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-3">
          <Spinner size={20} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {labels.loading ?? t('common.loading', 'Loading...')}
          </span>
        </div>
      ) : trackTurns.length > 0 ? (
        <div className="space-y-3">
          {trackTurns.map((turn) => (
            <TrackTurnCard key={turn.index} turn={turn} t={t} />
          ))}
        </div>
      ) : cognitiveTaskTurns.length > 0 ? (
        <div className="space-y-3">
          {cognitiveTaskTurns.map((turn) => (
            <CognitiveTaskTurnCard key={turn.index} turn={turn} t={t} />
          ))}
        </div>
      ) : tempoTurns.length > 0 ? (
        <div className="space-y-2">
          {/* Timeline Tracks (Flat Layout) */}
          <div className="relative">
            {/* Horizontal Scroll Area */}
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted pb-2">
              <div className="min-w-max px-2">
                {/* Render one track per modality */}
                <div className="flex flex-col gap-5">
                  {modalities.map((mod) => (
                    <TimelineTrack
                      key={mod}
                      modality={mod}
                      turns={tempoTurns}
                      t={t}
                      labels={labels}
                    />
                  ))}
                </div>

                {/* Turn Numbers Footer */}
                <div className="flex pt-2 ml-[40px] mt-1 border-t border-border/20">
                  {tempoTurns.map((turn) => (
                    <div key={turn.index} className="w-[24px] flex justify-center relative">
                      {/* Vertical Guide Line for footer */}
                      {turn.index % 5 === 0 && (
                        <div
                          className="absolute bottom-full w-px bg-border/20 left-1/2 -translate-x-1/2 pointer-events-none -z-10"
                          style={{ height: guideLineHeightPx }}
                        />
                      )}
                      {(turn.index % 5 === 0 || turn.index === 1) && (
                        <span className="text-[10px] font-mono text-muted-foreground/60 select-none">
                          {turn.index}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-4 border-t border-border/20">
            <LegendItem
              icon={<div className="w-3 h-3 rounded-full bg-woven-correct" />}
              label={labels.hits}
            />
            <LegendItem
              icon={<div className="w-3 h-3 rounded-full border-2 border-woven-incorrect" />}
              label={labels.misses}
            />
            <LegendItem
              icon={<X size={12} weight="bold" className="text-woven-incorrect" />}
              label={labels.falseAlarms}
            />
            <LegendItem
              icon={<div className="w-1 h-1 rounded-full bg-border" />}
              label={labels.correctRejections}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">{labels.noDetails}</p>
      )}
    </div>
  );
}

function TrackTurnCard({
  turn,
  t,
}: {
  turn: TurnSummary;
  t: (key: string, fallback: string) => string;
}): ReactNode {
  const detail = turn.detail as TrackTurnDetail;
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/25 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{turn.headline}</p>
          {turn.subline ? <p className="text-xs text-muted-foreground">{turn.subline}</p> : null}
        </div>
        <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-foreground border border-border/60">
          {detail.correctCount}/{detail.targetCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <TrackChip
          label={t('stats.track.targets', 'Targets')}
          value={detail.targetIndices.join(', ')}
        />
        <TrackChip
          label={t('stats.track.selected', 'Selected')}
          value={detail.selectedIndices.join(', ')}
        />
        <TrackChip
          label={t('stats.unifiedReport.misses', 'Misses')}
          value={String(detail.misses)}
        />
        <TrackChip label="FA" value={String(detail.falseAlarms)} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {typeof detail.responseTimeMs === 'number' && (
          <span>RT {Math.round(detail.responseTimeMs)}ms</span>
        )}
        {typeof detail.crowdingEvents === 'number' && (
          <span>
            {t('stats.track.crowding', 'Crowding')} {detail.crowdingEvents}
          </span>
        )}
        {typeof detail.minInterObjectDistancePx === 'number' && (
          <span>
            {t('stats.track.minGap', 'Min gap')} {Math.round(detail.minInterObjectDistancePx)}px
          </span>
        )}
        <span>
          {detail.totalObjects} {t('stats.track.objects', 'objects')}
        </span>
      </div>
    </div>
  );
}

function CognitiveTaskTurnCard({
  turn,
  t,
}: {
  turn: TurnSummary;
  t: (key: string, fallback: string) => string;
}): ReactNode {
  const detail = turn.detail as CognitiveTaskTrialDetail;
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/25 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{turn.headline}</p>
          {turn.subline ? <p className="text-xs text-muted-foreground">{turn.subline}</p> : null}
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold border',
            detail.correct
              ? 'bg-woven-correct/10 text-woven-correct border-woven-correct/30'
              : 'bg-woven-incorrect/10 text-woven-incorrect border-woven-incorrect/30',
          )}
        >
          {detail.correct
            ? t('stats.cognitiveTask.correct', 'Correct')
            : t('stats.cognitiveTask.incorrect', 'Incorrect')}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>RT {Math.round(detail.responseTimeMs)}ms</span>
      </div>
    </div>
  );
}

function TrackChip({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2.5 py-1 text-xs text-foreground">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono">{value || '-'}</span>
    </span>
  );
}

// =============================================================================
// TimelineTrack - A single horizontal track for a modality
// =============================================================================

interface TimelineTrackProps {
  modality: ModalityId;
  turns: TurnSummary[];
  t: (key: string, fallback: string) => string;
  labels: ReportLabels;
}

function TimelineTrack({ modality, turns, t, labels }: TimelineTrackProps) {
  const label = getModalityShortLabel(modality, (k, f) => t(k, f));
  const colorProps = getModalityLabelColorProps(modality);

  return (
    <div className="flex items-center">
      {/* Track Label */}
      <div className="w-[40px] shrink-0 flex items-center justify-start">
        <span
          className={cn('text-[10px] font-bold uppercase tracking-wider', colorProps.className)}
          style={colorProps.style}
        >
          {label}
        </span>
      </div>

      {/* Track Line & Nodes */}
      <div className="relative flex items-center h-6">
        {/* Central Line */}
        <div className="absolute left-0 right-0 h-[2px] bg-border/30 rounded-full" />

        {/* Nodes */}
        {turns.map((turn) => {
          const result = getModalityResult(turn, modality);
          return (
            <div
              key={turn.index}
              className="relative w-[24px] h-6 flex items-center justify-center z-10"
            >
              <TimelineNode
                hadTarget={result?.hadTarget ?? false}
                result={result?.result}
                labels={labels}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// TimelineNode - Individual event marker
// =============================================================================

interface TimelineNodeProps {
  readonly hadTarget: boolean;
  readonly result?: CellResult;
  readonly labels: Pick<ReportLabels, 'hits' | 'misses' | 'falseAlarms' | 'correctRejections'>;
}

function TimelineNode({ hadTarget, result, labels }: TimelineNodeProps): ReactNode {
  if (!result) return null; // Should not happen in tempo-trial context if active

  // 1. HIT (Target + Response) -> Solid filled circle
  if (hadTarget && result === 'hit') {
    return (
      <div
        className="w-3.5 h-3.5 rounded-full bg-woven-correct ring-2 ring-background transition-transform hover:scale-125"
        title={labels.hits}
      />
    );
  }

  // 2. MISS (Target + No Response) -> Outlined circle (Hollow)
  if (hadTarget && result === 'miss') {
    return (
      <div
        className="w-3.5 h-3.5 rounded-full border-[2.5px] border-woven-incorrect bg-background ring-2 ring-background transition-transform hover:scale-125"
        title={labels.misses}
      />
    );
  }

  // 3. FALSE ALARM (No Target + Response) -> X mark
  if (!hadTarget && result === 'false-alarm') {
    return (
      <div
        className="w-4 h-4 flex items-center justify-center text-woven-incorrect transition-transform hover:scale-125 bg-background rounded-full ring-2 ring-background"
        title={labels.falseAlarms}
      >
        <X size={14} weight="bold" />
      </div>
    );
  }

  // 4. CORRECT REJECTION (No Target + No Response) -> Small dot (Noise reduction)
  // Keeps the rhythm visual but de-emphasizes non-events
  return <div className="w-1 h-1 rounded-full bg-border" title={labels.correctRejections} />;
}

// =============================================================================
// LegendItem
// =============================================================================

function LegendItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
