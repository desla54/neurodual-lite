/**
 * Report Action Sections
 *
 * Split into two zones:
 * - ReportPrimaryActions: Rejouer + Accueil (at top of report)
 * - ReportSecondaryActions: Corriger + Revoir + NextStep (at bottom)
 */

import {
  House,
  PencilSimple,
  PlayIcon,
  ArrowClockwiseIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../primitives/button';
import { InfoSheet } from '../../primitives/info-sheet';
import type { JourneyContext } from '@neurodual/logic';
import type { ReportLabels } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportPrimaryActionsProps {
  readonly journeyContext?: JourneyContext;
  readonly labels: ReportLabels;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onNextStage?: () => void;
}

export interface ReportSecondaryActionsProps {
  readonly labels: ReportLabels;
  readonly onReplay?: () => void;
  readonly onCorrect?: () => void;
}

// =============================================================================
// Primary Actions (Top of report)
// =============================================================================

/**
 * Primary actions: Rejouer + Accueil
 * Displayed at the top of the report for quick access.
 */
export function ReportPrimaryActions({
  journeyContext,
  labels,
  onPlayAgain,
  onBackToHome,
  onNextStage,
}: ReportPrimaryActionsProps): ReactNode {
  const showNextStage =
    journeyContext?.stageCompleted && journeyContext.nextStageUnlocked && onNextStage;

  return (
    <div className="flex gap-3">
      {/* Primary Action - Rejouer or Next Stage */}
      {showNextStage ? (
        <Button
          onClick={onNextStage}
          variant="primary"
          size="lg"
          className="flex-1 shadow-soft-colored hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <span>{labels.nextStage}</span>
          <ArrowRightIcon size={20} weight="bold" />
        </Button>
      ) : (
        <Button
          onClick={onPlayAgain}
          variant="primary"
          size="lg"
          className="flex-1 shadow-soft-colored hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <ArrowClockwiseIcon size={20} weight="bold" />
          <span>{labels.playAgain}</span>
        </Button>
      )}

      {/* Home button */}
      <Button
        onClick={onBackToHome}
        variant="secondary"
        size="lg"
        className="border-border/50 hover:bg-surface hover:border-border text-muted-foreground hover:text-foreground transition-all"
      >
        <House size={20} weight="regular" />
      </Button>
    </div>
  );
}

// =============================================================================
// Secondary Actions (Bottom of report)
// =============================================================================

/**
 * Secondary actions: Corriger + Revoir
 * Displayed at the bottom of the report.
 * Returns null if no secondary actions are available.
 */
export function ReportSecondaryActions({
  labels,
  onReplay,
  onCorrect,
}: ReportSecondaryActionsProps): ReactNode {
  const { t } = useTranslation();
  const hasButtons = onCorrect || onReplay;
  if (!hasButtons) return null;

  return (
    <div className="flex gap-3">
      {onCorrect && (
        <ActionTile
          icon={<PencilSimple size={20} weight="duotone" />}
          label={t('stats.unifiedReport.correct')}
          description={t('stats.unifiedReport.correctDesc')}
          onClick={onCorrect}
        />
      )}
      {onReplay && labels.replay && (
        <ActionTile
          icon={<PlayIcon size={20} weight="duotone" />}
          label={labels.replay}
          description={t('stats.unifiedReport.replayDesc')}
          onClick={onReplay}
        />
      )}
    </div>
  );
}

// =============================================================================
// Action Tile Component
// =============================================================================

interface ActionTileProps {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}

function ActionTile({ icon, label, description, onClick }: ActionTileProps): ReactNode {
  return (
    <div className="flex-1 relative overflow-visible">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full flex flex-col items-center gap-1.5 py-3 px-4',
          'bg-surface hover:bg-muted/50 active:bg-muted',
          'border border-border hover:border-foreground/20',
          'rounded-xl transition-all',
          'text-foreground/70 hover:text-foreground',
        )}
      >
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </button>

      {/* Info button with tooltip */}
      <InfoSheet
        iconSize={12}
        triggerClassName="absolute top-1 right-1 z-20 p-1.5 pointer-events-auto text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60"
      >
        {description}
      </InfoSheet>
    </div>
  );
}
