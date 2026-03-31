/**
 * TutorialReport - Enhanced completion report for tutorials
 *
 * Inspired by UnifiedSessionReport but adapted for tutorial context:
 * - Shows tutorial completion status
 * - Displays score percentage
 * - Provides orientation recommendations
 * - Uses hatching separators
 * - Evaluates at least 8 responses
 */

import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { House, TrendUp, TrendDown, Minus, ArrowRight, Play } from '@phosphor-icons/react';
import gsap from 'gsap';
import { cn } from '../lib/utils';
import type { TutorialCompletionReport, TutorialSpec } from '@neurodual/logic';
import { Hatching } from '../primitives';
import { useMountEffect } from '../hooks';

interface TutorialReportProps {
  readonly spec: TutorialSpec;
  readonly report?: TutorialCompletionReport;
  readonly onBackToHome: () => void;
  readonly onRetry: () => void;
  readonly onGoToTraining: () => void;
  readonly onExplainLevels?: () => void;
  readonly className?: string;
}

// =============================================================================
// Types
// =============================================================================

type StatusTone = 'up' | 'stay' | 'down';

// =============================================================================
// Component
// =============================================================================

export function TutorialReport({
  spec,
  report,
  onBackToHome,
  onRetry,
  onGoToTraining,
  onExplainLevels,
  className,
}: TutorialReportProps): ReactNode {
  const { t } = useTranslation();
  // Animation on mount
  const containerRef = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    if (!containerRef.current) return;

    // Start hidden
    gsap.set(containerRef.current, { opacity: 0, scale: 0.95 });

    // Animate in
    gsap.to(containerRef.current, {
      opacity: 1,
      scale: 1,
      duration: 0.3,
      ease: 'power2.out',
    });
  });

  // Calculate completion status
  const assessment = report?.assessment;
  const passed = assessment ? assessment.passed : true;
  const scorePct = assessment ? Math.round(assessment.accuracy * 100) : 100; // Default to 100% if no assessment
  const correctSteps = assessment?.correctSteps ?? 0;
  const totalSteps = assessment?.totalSteps ?? spec.steps.length;

  // Determine if we have enough assessment steps
  const hasEnoughAssessmentSteps = totalSteps >= 8;

  // Status configuration
  const status: StatusTone = passed ? 'up' : 'down';

  const statusConfig = {
    up: {
      border: 'border-woven-correct',
      bg: 'bg-woven-correct/5',
      text: 'text-woven-correct',
      icon: TrendUp,
      actionBg: 'bg-woven-correct hover:bg-woven-correct/90',
      message: t('tutorial.report.statusMessage.up', 'Bien joue. Vous avez valide le tutoriel.'),
    },
    stay: {
      border: 'border-woven-focus',
      bg: 'bg-woven-focus/5',
      text: 'text-woven-focus',
      icon: Minus,
      actionBg: 'bg-woven-focus hover:bg-woven-focus/90',
      message: t(
        'tutorial.report.statusMessage.stay',
        "Presque. Un peu plus d'entrainement et ce sera bon.",
      ),
    },
    down: {
      border: 'border-woven-incorrect',
      bg: 'bg-woven-incorrect/5',
      text: 'text-woven-incorrect',
      icon: TrendDown,
      actionBg: 'bg-woven-incorrect hover:bg-woven-incorrect/90',
      message: t(
        'tutorial.report.statusMessage.down',
        "Ce n'est pas encore valide. Recommencez le tutoriel pour consolider les bases.",
      ),
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div ref={containerRef} className={cn('w-full max-w-md sm:max-w-lg mx-auto', className)}>
      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE 1: TUTORIAL HERO
          Title + Message + Score + Back button
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-2 pt-4 pb-6">
        <div className="text-center space-y-5 w-full">
          {/* Mode title - prominent and color-coded */}
          <div className="inline-flex flex-col items-center gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-woven-text">
              {t('tutorial.title', 'Tutoriel')}
            </span>
            <div className="inline-flex items-end gap-2">
              <span className="h-1.5 w-14 rounded-full bg-visual" />
              <span className="text-sm font-semibold leading-none text-woven-text">N-2</span>
            </div>
          </div>

          {/* Contextual message */}
          <div className="mx-auto w-full max-w-[36ch] rounded-xl border border-border/60 bg-surface/50 px-4 py-2.5">
            <p className="text-sm sm:text-base font-medium leading-relaxed text-muted-foreground tracking-normal">
              {config.message}
            </p>
          </div>

          {/* Score Card */}
          <div className="bg-white/50 dark:bg-white/[0.05] border border-border/60 rounded-2xl p-5 mx-auto max-w-sm">
            <div className="text-center">
              <span
                className={cn(
                  'text-5xl font-black tabular-nums tracking-tight',
                  status === 'up'
                    ? 'text-woven-correct'
                    : status === 'down'
                      ? 'text-woven-incorrect'
                      : 'text-woven-focus',
                )}
              >
                {scorePct}%
              </span>
              <div className="flex items-center justify-center gap-1 mt-2">
                <span className="text-xs text-muted-foreground">
                  {t('tutorial.report.correctAnswers', {
                    correct: correctSteps,
                    total: totalSteps,
                    defaultValue: '{{correct}}/{{total}} réponses correctes',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Back to Home button */}
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-all active:scale-[0.98]"
          >
            <House size={18} weight="fill" />
            {t('tutorial.report.actions.backToHome', 'Back to home')}
          </button>
        </div>
      </div>

      <Hatching id="tutorial-hero-hatch" className="text-foreground/70" />

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE 2: RECOMMENDATION
          Orientation recommendation with action buttons
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-2 py-6">
        <div
          className={cn('w-full p-4 rounded-2xl border-2 transition-all', config.border, config.bg)}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-border/50">
              <Icon className={cn('w-5 h-5', config.text)} weight="bold" />
            </div>
            <div className="flex-1 min-w-0">
              <span className={cn('text-lg font-bold', config.text)}>
                {status === 'up'
                  ? t('tutorial.report.header.up', 'Tutorial passed!')
                  : status === 'down'
                    ? t('tutorial.report.header.down', 'Needs review')
                    : t('tutorial.report.header.stay', 'Presque !')}
              </span>
            </div>
          </div>

          {/* Contextual guidance */}
          <div className="space-y-3">
            {!hasEnoughAssessmentSteps && (
              <p className="text-xs text-muted-foreground text-center italic">
                {t(
                  'tutorial.report.noteMinAssessment',
                  'Note: for a more accurate assessment, tutorials evaluate at least 8 answers.',
                )}
              </p>
            )}
            <p className={cn('text-sm text-center font-medium', config.text)}>
              {status === 'up'
                ? t('tutorial.report.guidance.passed', 'You are ready for free training.')
                : t(
                    'tutorial.report.guidance.failed',
                    'We recommend replaying this tutorial before moving on to training.',
                  )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-4 space-y-3">
            {status === 'up' ? (
              <>
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all active:scale-[0.98] bg-secondary/80 hover:bg-secondary text-foreground border border-border/50"
                >
                  <Play size={18} weight="bold" />
                  {t('tutorial.report.actions.retryTutorial', 'Retry tutorial')}
                </button>
                {spec.id === 'basics' && onExplainLevels && (
                  <button
                    type="button"
                    onClick={onExplainLevels}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all active:scale-[0.98] bg-secondary/80 hover:bg-secondary text-foreground border border-border/50"
                  >
                    <span>
                      {t('tutorial.report.actions.explainLevels', 'Understand N levels (N)')}
                    </span>
                    <ArrowRight size={18} weight="bold" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToTraining}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold text-white transition-all active:scale-[0.98]',
                    config.actionBg,
                  )}
                >
                  <span>{t('tutorial.report.actions.goToTraining', "Aller a l'entrainement")}</span>
                  <ArrowRight size={18} weight="bold" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold text-white transition-all active:scale-[0.98]',
                    config.actionBg,
                  )}
                >
                  <Play size={18} weight="bold" />
                  {t('tutorial.report.actions.retryTutorial', 'Retry tutorial')}
                </button>
                {spec.id === 'basics' && onExplainLevels && (
                  <button
                    type="button"
                    onClick={onExplainLevels}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all active:scale-[0.98] bg-woven-surface text-woven-text border border-woven-border hover:bg-woven-cell-rest"
                  >
                    <span>
                      {t('tutorial.report.actions.explainLevels', 'Understand N levels (N)')}
                    </span>
                    <ArrowRight size={18} weight="bold" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToTraining}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all active:scale-[0.98] bg-secondary/80 hover:bg-secondary text-foreground border border-border/50"
                >
                  <span>
                    {t(
                      'tutorial.report.actions.continueToTraining',
                      "Continuer vers l'entrainement",
                    )}
                  </span>
                  <ArrowRight size={18} weight="bold" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
