import type { ComponentType, ReactNode } from 'react';
import type {
  ProgressionIndicatorAction,
  ProgressionIndicatorModel,
  ProgressionExplanation,
} from '@neurodual/logic';
import {
  ArrowClockwise,
  ArrowRight,
  Equals,
  House,
  TrendDown,
  TrendUp,
  Trophy,
} from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
import { Button } from '../../primitives/button';
import type { ReportLabels } from './types';

export interface ProgressionIndicatorProps {
  readonly model: ProgressionIndicatorModel;
  readonly labels: ReportLabels;
  readonly onPlayAgain: () => void;
  readonly onStartAtLevel?: (level: number) => void;
  readonly onGoToJourneyStage?: (stageId: number, nLevel: number) => void;
  readonly onBackToHome?: () => void;
  readonly surfaceVariant?: 'card' | 'flat';
  /** Hide action buttons (e.g. when viewing a past journey session). */
  readonly hideActions?: boolean;
}

function getToneClasses(tone: ProgressionIndicatorModel['tone']): {
  readonly tint: string;
  readonly primaryCta: string;
  readonly icon: ComponentType<{ size?: number; weight?: IconWeight }>;
  readonly iconBorder: string;
} {
  if (tone === 'up') {
    return {
      tint: 'bg-woven-correct/[0.12]',
      primaryCta: 'bg-woven-correct hover:bg-woven-correct/90',
      icon: TrendUp,
      iconBorder: 'bg-woven-correct/10 border-woven-correct/30 text-woven-correct',
    };
  }
  if (tone === 'down') {
    return {
      tint: 'bg-woven-incorrect/[0.12]',
      primaryCta: 'bg-woven-incorrect hover:bg-woven-incorrect/90',
      icon: TrendDown,
      iconBorder: 'bg-woven-incorrect/10 border-woven-incorrect/30 text-woven-incorrect',
    };
  }
  return {
    tint: 'bg-woven-focus/[0.14]',
    primaryCta: 'bg-woven-focus hover:bg-woven-focus/90',
    icon: Equals,
    iconBorder: 'bg-woven-focus/10 border-woven-focus/35 text-woven-focus',
  };
}

function formatHybridCopy(
  template: string,
  display: NonNullable<ProgressionIndicatorModel['hybridJourneyDisplay']>,
): string {
  const current = display.current ?? 0;
  const total = display.total ?? 0;
  const remaining = total > current ? total - current : 0;
  return template
    .replace('{current}', String(current))
    .replace('{total}', String(total))
    .replace('{remaining}', String(remaining));
}

function resolveDisplay(
  model: ProgressionIndicatorModel,
  labels: ReportLabels,
): { headline: string; body: string | null } {
  const d = model.hybridJourneyDisplay;
  switch (model.messageKind) {
    // Journey completed
    case 'journey-completed':
      return { headline: labels.journeyCompleted ?? 'Parcours terminé !', body: null };

    // Hybrid journey phases
    case 'hybrid-track-progress':
      return {
        headline: labels.hybridJourneyMessages?.trackTitle ?? 'Boucle Track',
        body: d
          ? formatHybridCopy(
              labels.hybridJourneyMessages?.trackBody ??
                'Le Track fait avancer la boucle. La prochaine decision se jouera pendant la session DNB.',
              d,
            )
          : null,
      };
    case 'hybrid-validation-progress':
      return {
        headline: d
          ? (labels.hybridJourneyMessages?.validationTitle ?? 'Validation {current}/{total}')
              .replace('{current}', String(d.current ?? 0))
              .replace('{total}', String(d.total ?? 0))
          : (labels.hybridJourneyMessages?.validationTitle ?? 'Validation'),
        body: d
          ? formatHybridCopy(
              labels.hybridJourneyMessages?.validationBody ??
                'Cette session va dans le bon sens. Vous restez sur ce niveau pour l instant ; encore {remaining} validation pour monter.',
              d,
            )
          : null,
      };
    case 'hybrid-stay-progress':
      return {
        headline: d
          ? (labels.hybridJourneyMessages?.stayProgressTitle ?? 'Maintien {current}/{total}')
              .replace('{current}', String(d.current ?? 0))
              .replace('{total}', String(d.total ?? 0))
          : (labels.hybridJourneyMessages?.stayProgressTitle ?? 'Maintien'),
        body: d
          ? formatHybridCopy(
              labels.hybridJourneyMessages?.stayProgressBody ??
                'Vous etes dans la zone de maintien. Le niveau reste identique et la boucle DNB continue.',
              d,
            )
          : null,
      };
    case 'hybrid-failure-progress':
      return {
        headline: d
          ? (labels.hybridJourneyMessages?.failureTitle ?? 'Echec {current}/{total}')
              .replace('{current}', String(d.current ?? 0))
              .replace('{total}', String(d.total ?? 0))
          : (labels.hybridJourneyMessages?.failureTitle ?? 'Echec'),
        body: d
          ? formatHybridCopy(
              labels.hybridJourneyMessages?.failureBody ??
                'Cette session compte comme un echec. Vous restez encore sur ce niveau, mais un nouvel echec declenchera la descente.',
              d,
            )
          : null,
      };
    case 'hybrid-up-decision':
      return {
        headline:
          labels.hybridJourneyMessages?.upDecisionTitle ?? labels.levelUp ?? 'Niveau suivant',
        body:
          labels.hybridJourneyMessages?.up ??
          'La session DNB valide la paire hybride. Vous passez au niveau suivant.',
      };
    case 'hybrid-stay-decision':
      return {
        headline: labels.hybridJourneyMessages?.stayDecisionTitle ?? labels.levelSame ?? 'Maintien',
        body:
          labels.hybridJourneyMessages?.stay ??
          'La session DNB maintient la paire hybride a ce niveau. La prochaine boucle recommence par Track.',
      };
    case 'hybrid-down-decision':
      return {
        headline:
          labels.hybridJourneyMessages?.downDecisionTitle ??
          labels.levelDown ??
          'Retour au niveau precedent',
        body:
          labels.hybridJourneyMessages?.down ??
          'La session DNB fait redescendre la paire hybride. La prochaine boucle recommence un niveau plus bas.',
      };
    case 'hybrid-pending-pair':
      return {
        headline: labels.hybridJourneyMessages?.trackTitle ?? 'Boucle Track',
        body:
          labels.hybridJourneyMessages?.pendingPair ??
          'Cette session Track prépare la décision. La progression sera décidée après la session DNB.',
      };

    // Brain Workshop
    case 'bw-up':
      return {
        headline: labels.levelUp ?? 'Niveau maîtrisé !',
        body: labels.bwMessages?.up ?? 'Score excellent ! Vous montez au niveau supérieur.',
      };
    case 'bw-stay':
      return {
        headline: labels.levelSame ?? 'On continue à ce niveau',
        body: labels.bwMessages?.stay ?? 'Score stable. Continuez à vous entraîner sur ce niveau.',
      };
    case 'bw-strike-1':
      return {
        headline: labels.bwStrikeHeadline ?? labels.bwStrike ?? 'Session ratée',
        body:
          labels.bwMessages?.strikeFirst ??
          'Première session ratée. Attention, encore 2 avant de redescendre.',
      };
    case 'bw-strike-2':
      return {
        headline: labels.bwStrikeHeadline ?? labels.bwStrike ?? 'Session ratée',
        body:
          labels.bwMessages?.strikeSecond ??
          'Deuxième session ratée. Encore 1 et vous revenez au niveau précédent.',
      };
    case 'bw-down':
      return {
        headline: labels.bwStrikeHeadline ?? labels.bwStrike ?? 'Session ratée',
        body:
          labels.bwMessages?.strikeThird ??
          'Trois sessions ratées. Vous redescendez pour consolider vos acquis.',
      };

    // Jaeggi journey
    case 'jaeggi-up':
      return { headline: labels.levelUp ?? 'Niveau maîtrisé !', body: null };
    case 'jaeggi-stay':
      return { headline: labels.levelSame ?? 'On continue à ce niveau', body: null };
    case 'jaeggi-down':
      return { headline: labels.levelDown ?? 'Niveau ajusté', body: null };

    // Dual Trace journey
    case 'trace-up':
      return { headline: labels.levelUp ?? 'Niveau maîtrisé !', body: null };
    case 'trace-stay':
      return { headline: labels.levelSame ?? 'On continue à ce niveau', body: null };

    // Dual Track journey
    case 'track-up':
      return {
        headline: labels.trackMessages?.up ?? labels.levelUp ?? 'Progression !',
        body: labels.trackMessages?.upBody ?? 'La difficulté augmente pour la prochaine session.',
      };
    case 'track-stay':
      return {
        headline: labels.trackMessages?.stay ?? labels.levelSame ?? 'Maintien',
        body:
          labels.trackMessages?.stayBody ?? 'Continuez à ce rythme, la difficulté reste identique.',
      };
    case 'track-down':
      return {
        headline: labels.trackMessages?.down ?? 'Ajustement',
        body:
          labels.trackMessages?.downBody ?? 'La difficulté est réduite pour la prochaine session.',
      };
    case 'track-promoted':
      return {
        headline: labels.trackMessages?.promoted ?? 'Niveau suivant débloqué !',
        body: labels.trackMessages?.promotedBody ?? 'Vous passez au nombre de cibles suivant.',
      };

    // Free training
    case 'free-up':
      return { headline: labels.levelUp ?? 'Niveau maîtrisé !', body: null };
    case 'free-stay':
      return { headline: labels.levelSame ?? 'On continue à ce niveau', body: null };
    case 'free-down':
      return { headline: labels.levelDown ?? 'Niveau ajusté', body: null };

    default: {
      const _exhaustive: never = model.messageKind;
      return _exhaustive;
    }
  }
}

function resolveActionLabel(
  labels: ReportLabels,
  action: ProgressionIndicatorAction,
  currentLevel: number,
): string {
  if (action.kind === 'back_to_home') return labels.backToHome ?? 'Accueil';

  const templateForLevel = (template: string | undefined, level: number, fallback: string) =>
    (template ?? fallback).replace('{level}', String(level));

  if (action.kind === 'replay_current_level') {
    return templateForLevel(
      labels.replayLevel ?? labels.stayAtLevel,
      action.level,
      `N-${action.level}`,
    );
  }
  if (action.kind === 'play_at_level') {
    const template = action.level < currentLevel ? labels.backToLevel : labels.goToLevel;
    return templateForLevel(template, action.level, `N-${action.level}`);
  }
  // journey_go_to_stage: même logique que play_at_level, basée sur le niveau cible
  if (action.level < currentLevel) {
    return templateForLevel(labels.backToLevel, action.level, `N-${action.level}`);
  }
  if (action.level > currentLevel) {
    return templateForLevel(labels.goToLevel, action.level, `N-${action.level}`);
  }
  return templateForLevel(
    labels.replayLevel ?? labels.stayAtLevel,
    action.level,
    `N-${action.level}`,
  );
}

function runAction(
  action: ProgressionIndicatorAction,
  handlers: Pick<
    ProgressionIndicatorProps,
    'onPlayAgain' | 'onStartAtLevel' | 'onGoToJourneyStage' | 'onBackToHome'
  >,
): void {
  if (action.kind === 'back_to_home') {
    handlers.onBackToHome?.();
    return;
  }
  if (action.kind === 'replay_current_level') {
    if (handlers.onStartAtLevel) {
      handlers.onStartAtLevel(action.level);
      return;
    }
    handlers.onPlayAgain();
    return;
  }
  if (action.kind === 'play_at_level') {
    if (handlers.onStartAtLevel) {
      handlers.onStartAtLevel(action.level);
      return;
    }
    handlers.onPlayAgain();
    return;
  }
  if (handlers.onGoToJourneyStage) {
    handlers.onGoToJourneyStage(action.stageId, action.level);
    return;
  }
  handlers.onPlayAgain();
}

// =============================================================================
// Brain Workshop Unified View (design avec dots de strike)
// =============================================================================

function StrikeDots({ current, total }: { current: number; total: number }): ReactNode {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-3 w-3 rounded-full',
            i < current ? 'bg-woven-incorrect' : 'bg-muted-foreground/25',
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {current}/{total}
      </span>
    </div>
  );
}

function BrainWorkshopUnifiedView({
  model,
  labels,
  tone,
  onAction,
  hideActions,
  primaryButtonIcon: ButtonIcon = ArrowRight,
}: {
  model: ProgressionIndicatorModel;
  labels: ReportLabels;
  tone: {
    readonly tint: string;
    readonly primaryCta: string;
    readonly icon: ComponentType<{ size?: number; weight?: IconWeight }>;
    readonly iconBorder: string;
  };
  onAction: () => void;
  hideActions?: boolean;
  primaryButtonIcon?: ComponentType<{ size?: number; weight?: IconWeight }>;
}): ReactNode {
  const isBwDown = model.tone === 'down' && model.explanation.protocol === 'brainworkshop';

  // Contexte visuel des strikes : strike en cours OU down déclenché par les strikes
  const strikeDisplay = (() => {
    if (model.headline === 'strike' && model.strike) return model.strike;
    if (isBwDown && model.explanation.protocol === 'brainworkshop') {
      const total = model.explanation.strikesToDown;
      return { current: total, total };
    }
    return null;
  })();

  const { headline, body: message } = resolveDisplay(model, labels);

  const buttonLabel = resolveActionLabel(labels, model.primaryAction, model.currentLevel);

  return (
    <div className="flex flex-col h-full">
      {/* Contenu centré */}
      <div className="flex flex-col items-center justify-center gap-3 flex-1">
        <p className="text-lg font-black tracking-tight text-foreground leading-tight text-center">
          {headline}
        </p>
        {strikeDisplay && (
          <>
            <div className="w-full border-t border-border/40" />
            <StrikeDots current={strikeDisplay.current} total={strikeDisplay.total} />
          </>
        )}
        {message && (
          <p className="text-sm text-foreground text-center leading-relaxed px-2">{message}</p>
        )}
      </div>

      {/* Bouton */}
      {!hideActions && (
        <div className="flex items-center justify-center">
          <Button
            size="lg"
            className={cn(
              'shadow-soft-colored hover:shadow-md transition-all active:scale-[0.98]',
              tone.primaryCta,
            )}
            onClick={onAction}
          >
            <span>{buttonLabel}</span>
            <ButtonIcon size={20} weight="bold" />
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Explanation Sub-components (pour Jaeggi/Dual N-Back classique)
// =============================================================================

const ZONE_COLORS = {
  up: 'text-woven-correct',
  stay: 'text-woven-focus',
  down: 'text-woven-incorrect',
} as const;

function resolveModalityLabel(modalityId: string, labels: ReportLabels): string {
  const fromMap = labels.modality?.[modalityId as keyof typeof labels.modality];
  if (fromMap) return fromMap;
  // Legacy fallbacks
  if (modalityId === 'position') return labels.position ?? 'POS';
  if (modalityId === 'audio') return labels.audio ?? 'AUD';
  if (modalityId === 'color') return labels.color ?? 'COL';
  return modalityId.toUpperCase().slice(0, 3);
}

function JaeggiExplanationView({
  tone,
  explanation,
  labels,
  ruleOverride,
}: {
  tone: ProgressionIndicatorModel['tone'];
  explanation: ProgressionExplanation & { protocol: 'jaeggi' };
  labels: ReportLabels;
  ruleOverride?: string;
}): ReactNode {
  const errLabel = labels.errorsLabel ?? 'err.';
  const contextualRule = (() => {
    if (ruleOverride) return ruleOverride;
    if (tone === 'up') {
      return (
        labels.dualnbackClassicRuleUp ??
        labels.dualnbackClassicThresholdExplanation ??
        `Moins de ${explanation.thresholdUp} erreurs par modalité : montée`
      );
    }
    if (tone === 'down') {
      return (
        labels.dualnbackClassicRuleDown ??
        `Plus de ${explanation.thresholdDown} erreurs sur une modalité : descente`
      );
    }
    return (
      labels.dualnbackClassicRuleStay ??
      `${explanation.thresholdUp}-${explanation.thresholdDown} erreurs sur une modalité : maintien`
    );
  })();
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        {explanation.errorsByModality.map((info) => (
          <span key={info.modalityId} className={cn('font-medium', ZONE_COLORS[info.zone])}>
            {resolveModalityLabel(info.modalityId, labels)}: {info.errors} {errLabel}
          </span>
        ))}
      </div>
      <span className="text-muted-foreground text-xs">{contextualRule}</span>
    </div>
  );
}

function ExplanationSection({
  model,
  labels,
}: {
  model: ProgressionIndicatorModel;
  labels: ReportLabels;
}): ReactNode {
  if (model.journeyCompletion === 'journey-completed') {
    return null;
  }

  if (model.explanation.protocol === 'jaeggi') {
    return (
      <JaeggiExplanationView
        tone={model.tone}
        explanation={model.explanation}
        labels={labels}
        ruleOverride={
          model.journeyProtocol === 'hybrid-jaeggi'
            ? (labels.hybridJourneyMessages?.rule ??
              'Dans ce parcours, seule la session DNB décide montée / maintien / descente.')
            : undefined
        }
      />
    );
  }
  // Brain Workshop n'utilise plus cette section
  return null;
}

// =============================================================================
// Main Component
// =============================================================================

export function ProgressionIndicator({
  model,
  labels,
  onPlayAgain,
  onStartAtLevel,
  onGoToJourneyStage,
  onBackToHome,
  surfaceVariant = 'card',
  hideActions = false,
}: ProgressionIndicatorProps): ReactNode {
  const isJourneyCompleted = model.journeyCompletion === 'journey-completed';

  // Gold override for journey-completed, otherwise use tone classes
  const tone = isJourneyCompleted
    ? {
        tint: 'bg-amber-500/[0.12]',
        primaryCta: 'bg-amber-500 hover:bg-amber-500/90 text-white',
        icon: Trophy,
        iconBorder: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
      }
    : getToneClasses(model.tone);

  const handlers = { onPlayAgain, onStartAtLevel, onGoToJourneyStage, onBackToHome };

  // Détection de Brain Workshop
  const isBrainWorkshop = model.explanation.protocol === 'brainworkshop';

  const containerClass =
    surfaceVariant === 'card'
      ? 'w-full rounded-2xl border border-border bg-surface shadow-sm'
      : 'w-full';

  const scopeTitle =
    model.scope === 'journey'
      ? (model.journeyDisplayName ??
        (model.journeyProtocol === 'hybrid-jaeggi' ? labels.hybridJourneyName : undefined) ??
        labels.reportContextJourney ??
        labels.journey ??
        'Parcours')
      : (labels.reportContextFree ?? 'Entraînement libre');
  const { headline: displayHeadline, body: journeyMessage } = resolveDisplay(model, labels);

  // Primary button icon
  const PrimaryButtonIcon = isJourneyCompleted ? House : ArrowRight;

  // Rendu unifié pour Brain Workshop
  if (isBrainWorkshop) {
    return (
      <div className={cn(containerClass, !hideActions && 'h-[280px]')}>
        <div className={cn('flex flex-col p-4', !hideActions && 'h-full')}>
          {/* 1/3 - Header */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-xl border flex items-center justify-center shrink-0',
                tone.iconBorder,
              )}
            >
              <tone.icon size={18} weight="duotone" />
            </div>
            <p className="text-sm font-semibold text-foreground leading-tight">{scopeTitle}</p>
          </div>

          {/* 2/3 + 3/3 - Contenu BW unifié */}
          <BrainWorkshopUnifiedView
            model={model}
            labels={labels}
            tone={tone}
            hideActions={hideActions}
            onAction={() => runAction(model.primaryAction, handlers)}
            primaryButtonIcon={PrimaryButtonIcon}
          />
        </div>
      </div>
    );
  }

  // Rendu standard pour Jaeggi/Dual N-Back classique
  return (
    <div className={cn(containerClass, 'px-4 py-4')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-xl border flex items-center justify-center shrink-0',
              tone.iconBorder,
            )}
          >
            <tone.icon size={18} weight="duotone" />
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{scopeTitle}</p>
        </div>

        <div className="text-center">
          <p className="text-lg font-black tracking-tight text-foreground leading-tight">
            {displayHeadline}
          </p>
        </div>

        {journeyMessage && (
          <p className="text-sm text-foreground text-center leading-relaxed px-2">
            {journeyMessage}
          </p>
        )}

        <ExplanationSection model={model} labels={labels} />

        {!hideActions && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button
              size="lg"
              className={cn(
                'shadow-soft-colored hover:shadow-md transition-all active:scale-[0.98]',
                tone.primaryCta,
              )}
              onClick={() => runAction(model.primaryAction, handlers)}
            >
              <span>{resolveActionLabel(labels, model.primaryAction, model.currentLevel)}</span>
              <PrimaryButtonIcon size={20} weight="bold" />
            </Button>
            {model.secondaryActions.map((action) => (
              <Button
                key={
                  action.kind === 'back_to_home'
                    ? 'back_to_home'
                    : action.kind === 'journey_go_to_stage'
                      ? `${action.kind}:${action.stageId}`
                      : `${action.kind}:${action.level}`
                }
                size="md"
                variant="secondary"
                className="border-border/50 hover:bg-surface hover:border-border text-muted-foreground hover:text-foreground transition-all"
                onClick={() => runAction(action, handlers)}
              >
                {action.kind === 'replay_current_level' ? (
                  <ArrowClockwise size={18} weight="bold" />
                ) : (
                  <ArrowRight size={18} weight="bold" />
                )}
                <span>{resolveActionLabel(labels, action, model.currentLevel)}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
