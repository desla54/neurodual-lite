/**
 * Operation Span (OSPAN) Measure Page
 *
 * Complex span task:
 * - Verify arithmetic equations (processing component)
 * - Memorize letters shown between equations (storage component)
 * - Recall letters in correct order at end of each set
 * - Span increases on success, session ends after consecutive failures
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cn,
  CanvasWeave,
  Hatching,
  Disclosure,
  useSessionCompletion,
  useMountEffect,
  useEffectiveUserId,
} from '@neurodual/ui';
import {
  AllSpecs,
  buildOspanSessionSummary,
  transitionOspanSessionMachine,
  createInitialOspanSessionState,
  generateOspanEquation,
  generateStandardOspanSequence,
  selectOspanLetters,
  type GameEvent,
  type OspanCompletionDraft,
  type OspanCompletionInput,
  type OspanSessionEventDraft,
  type OspanSessionMachineConfig,
  type OspanSessionMachineState,
  type OspanSessionMachineAction,
} from '@neurodual/logic';
import { ArrowClockwise, House, Check, X, ListChecks, ChartBar } from '@phosphor-icons/react';
import { useHaptic } from '../hooks/use-haptic';
import { useAnalytics } from '../hooks/use-analytics';
import { useAppPorts, useCommandBus } from '../providers';

import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';
import { CognitiveTaskHUD } from '../components/game/CognitiveTaskHUD';
import { GameQuitModal } from '../components/game/game-quit-modal';
import { useTranslation } from 'react-i18next';
import {
  type CogTaskEventEmitter,
  getTemporalContext,
  getDeviceInfo,
  createEnvelope,
  persistEvent,
} from '../lib/cognitive-task-events';

// =============================================================================
// Constants
// =============================================================================

const spec = AllSpecs['ospan'];
const ext = spec.extensions as {
  startSpan: number;
  maxSpan: number;
  maxConsecutiveFailures: number;
  itemDisplayMs: number;
  equationTimeoutMs: number;
  itemGapMs: number;
  processingAccuracyThreshold: number;
  letterPool: readonly string[];
};

// =============================================================================
// Event emission helpers
// =============================================================================

function materializeOspanEvent(
  emitter: CogTaskEventEmitter,
  draft: OspanSessionEventDraft,
): GameEvent {
  return {
    ...createEnvelope(emitter),
    ...draft,
  } as unknown as GameEvent;
}

// =============================================================================
// Main Page
// =============================================================================

export function OspanTrainingPage() {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const { track } = useAnalytics();
  const commandBus = useCommandBus();
  const { platformInfo, persistence } = useAppPorts();
  const userId = useEffectiveUserId();
  const { complete } = useSessionCompletion({});

  const startSpan = ext.startSpan;
  const processingAccuracyThreshold = ext.processingAccuracyThreshold;

  // Standard Unsworth 2005 protocol: 15 sets (3× each of sizes 3-7), random order
  const [setSequence, setSetSequence] = useState(() => generateStandardOspanSequence());

  const machineConfig = useMemo<OspanSessionMachineConfig>(
    () => ({
      setSequence,
      playContext: 'free',
    }),
    [setSequence],
  );

  // Event emitter
  const emitterRef = useRef<CogTaskEventEmitter>({
    sessionId: crypto.randomUUID(),
    userId,
    seq: 0,
    events: [],
    commandBus,
  });
  emitterRef.current.commandBus = commandBus;
  emitterRef.current.userId = userId;

  // Quit modal
  const [showQuitModal, setShowQuitModal] = useState(false);
  const sessionStartMsRef = useRef(Date.now());
  const sessionStartedRef = useRef(false);

  // Session state
  const [machineState, setMachineState] = useState<OspanSessionMachineState>(() =>
    createInitialOspanSessionState(),
  );
  const machineStateRef = useRef(machineState);
  machineStateRef.current = machineState;

  // UI state for equation/letter display
  const [currentEquation, setCurrentEquation] = useState<{
    display: string;
    equation: string;
    correctAnswer: boolean;
  } | null>(null);
  const [currentLetter, setCurrentLetter] = useState<string | null>(null);
  const [recallSelection, setRecallSelection] = useState<string[]>([]);
  const [equationAnswered, setEquationAnswered] = useState(false);
  const [equationResult, setEquationResult] = useState<boolean | null>(null);
  const currentEquationRef = useRef<typeof currentEquation>(null);
  const equationAnsweredRef = useRef(false);
  const showEquationRef = useRef<(() => void) | null>(null);
  currentEquationRef.current = currentEquation;
  equationAnsweredRef.current = equationAnswered;

  // Track equation results for current set (not stored in machine state)
  const currentEquationResultsRef = useRef<
    {
      equation: string;
      correctAnswer: boolean;
      playerAnswer: boolean;
      correct: boolean;
      responseTimeMs: number;
    }[]
  >([]);
  const scheduledTimeoutsRef = useRef<number[]>([]);
  const equationTimeoutRef = useRef<number | null>(null);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      scheduledTimeoutsRef.current = scheduledTimeoutsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delayMs);
    scheduledTimeoutsRef.current.push(timeoutId);
    return timeoutId;
  }, []);

  const clearScheduledTimeout = useCallback((timeoutId: number | null) => {
    if (timeoutId == null) return;
    window.clearTimeout(timeoutId);
    scheduledTimeoutsRef.current = scheduledTimeoutsRef.current.filter((id) => id !== timeoutId);
  }, []);

  const clearAllScheduledTimeouts = useCallback(() => {
    for (const timeoutId of scheduledTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    scheduledTimeoutsRef.current = [];
    equationTimeoutRef.current = null;
  }, []);

  // Handle machine transition (event persistence + completion)
  const handleMachineTransition = useCallback(
    (eventDrafts: readonly OspanSessionEventDraft[], completionDraft?: OspanCompletionDraft) => {
      const emitter = emitterRef.current;
      if (completionDraft?.reason === 'abandoned') {
        emitter.events = [];
        void cleanupAbandonedSession(persistence, emitter.sessionId).catch(() => {});
        window.history.back();
        return;
      }

      let endEventPersist: Promise<void> | null = null;

      for (const draft of eventDrafts) {
        const event = materializeOspanEvent(emitter, draft);
        emitter.events.push(event);

        if (draft.type === 'OSPAN_SESSION_STARTED') {
          track('session_started', {
            session_id: emitter.sessionId,
            mode: 'ospan',
            n_level: startSpan,
            modalities: ['position'],
            play_context: draft.playContext,
          });
          void persistEvent(emitter, event as unknown as Record<string, unknown>);
          continue;
        }

        if (draft.type === 'OSPAN_SET_COMPLETED') {
          void persistEvent(emitter, event as unknown as Record<string, unknown>);
          continue;
        }

        if (draft.type === 'OSPAN_SESSION_ENDED') {
          if (draft.reason === 'completed') {
            track('session_completed', {
              session_id: emitter.sessionId,
              mode: 'ospan',
              n_level: startSpan,
              modalities: ['position'],
              duration_ms: draft.durationMs,
              ups: completionDraft?.accuracy ?? 0,
              passed: completionDraft?.isValidMeasure ?? false,
              next_level: startSpan,
              level_change: 0,
              xp_earned: 0,
              badges_earned: 0,
              leveled_up: false,
              play_context: draft.playContext,
            });
          }
          endEventPersist = persistEvent(emitter, event as unknown as Record<string, unknown>);
        }
      }

      if (completionDraft) {
        void (async () => {
          if (endEventPersist) await endEventPersist;
          const completionInput: OspanCompletionInput = {
            mode: 'ospan',
            sessionId: emitter.sessionId,
            events: emitter.events,
            gameModeLabel: t('settings.gameMode.ospan', 'Operation Span'),
            reason: completionDraft.reason,
            accuracy: completionDraft.accuracy,
            maxSpan: completionDraft.maxSpan,
            absoluteScore: completionDraft.absoluteScore,
            correctSets: completionDraft.correctSets,
            totalSets: completionDraft.totalSets,
            processingAccuracy: completionDraft.processingAccuracy,
            isValidMeasure: completionDraft.isValidMeasure,
            durationMs: completionDraft.durationMs,
          };
          await complete(completionInput);
        })();
      }
    },
    [complete, persistence, track, startSpan, t],
  );

  const applyMachineAction = useCallback(
    (action: OspanSessionMachineAction) => {
      const transition = transitionOspanSessionMachine(
        machineStateRef.current,
        action,
        machineConfig,
      );
      machineStateRef.current = transition.state;
      setMachineState(transition.state);
      handleMachineTransition(transition.eventDrafts, transition.completionDraft);
      return transition;
    },
    [machineConfig, handleMachineTransition],
  );

  // -------------------------------------------------------------------------
  // Flow: equation → letter → equation → letter → ... → recall
  // -------------------------------------------------------------------------

  const showLetterAndAdvance = useCallback(
    (letter: string) => {
      setCurrentLetter(letter);
      setCurrentEquation(null);
      currentEquationRef.current = null;

      scheduleTimeout(() => {
        applyMachineAction({ type: 'SHOW_ITEM', letter, timestamp: Date.now() });
        const state = machineStateRef.current;

        if (state.itemIndex >= state.currentSpan) {
          applyMachineAction({ type: 'BEGIN_RECALL', timestamp: Date.now() });
          setCurrentLetter(null);
          setRecallSelection([]);
        } else {
          scheduleTimeout(() => {
            showEquationRef.current?.();
          }, ext.itemGapMs);
        }
      }, ext.itemDisplayMs);
    },
    [applyMachineAction, scheduleTimeout],
  );

  const showEquation = useCallback(() => {
    const eq = generateOspanEquation();
    setCurrentEquation(eq);
    currentEquationRef.current = eq;
    setCurrentLetter(null);
    setEquationAnswered(false);
    setEquationResult(null);
    applyMachineAction({
      type: 'SHOW_EQUATION',
      equation: eq.equation,
      correctAnswer: eq.correctAnswer,
      timestamp: Date.now(),
    });

    clearScheduledTimeout(equationTimeoutRef.current);
    equationTimeoutRef.current = scheduleTimeout(() => {
      const activeEquation = currentEquationRef.current;
      if (!activeEquation || equationAnsweredRef.current) return;

      equationAnsweredRef.current = true;
      setEquationAnswered(true);
      setEquationResult(false);

      const forcedAnswer = !activeEquation.correctAnswer;
      const responseTimeMs = Math.max(
        0,
        Date.now() - (machineStateRef.current.equationStartMs ?? Date.now()),
      );
      currentEquationResultsRef.current.push({
        equation: activeEquation.equation,
        correctAnswer: activeEquation.correctAnswer,
        playerAnswer: forcedAnswer,
        correct: false,
        responseTimeMs,
      });

      applyMachineAction({
        type: 'ANSWER_EQUATION',
        equation: activeEquation.equation,
        correctAnswer: activeEquation.correctAnswer,
        answer: forcedAnswer,
        timestamp: Date.now(),
      });

      scheduleTimeout(() => {
        const letter = lettersForSetRef.current[letterIndexRef.current];
        if (letter) {
          letterIndexRef.current++;
          showLetterAndAdvance(letter);
        }
      }, 600);
    }, ext.equationTimeoutMs);
  }, [applyMachineAction, clearScheduledTimeout, scheduleTimeout, showLetterAndAdvance]);
  showEquationRef.current = showEquation;

  // Start a new set: generate letters, show first equation
  const startSet = useCallback(
    (span: number, isFirst: boolean) => {
      const letters = selectOspanLetters(span, ext.letterPool);
      // Store letters for later use
      lettersForSetRef.current = letters;
      letterIndexRef.current = 0;
      currentEquationResultsRef.current = [];

      if (isFirst) {
        if (!sessionStartedRef.current) {
          sessionStartedRef.current = true;
          sessionStartMsRef.current = Date.now();
        }
        applyMachineAction({
          type: 'BEGIN_SET',
          timestamp: Date.now(),
          userId,
          device: getDeviceInfo(platformInfo),
          context: getTemporalContext(),
        });
      } else {
        applyMachineAction({
          type: 'BEGIN_SET',
          timestamp: Date.now(),
          userId,
          device: getDeviceInfo(platformInfo),
          context: getTemporalContext(),
        });
      }

      scheduleTimeout(() => {
        showEquation();
      }, 400);
    },
    [applyMachineAction, platformInfo, scheduleTimeout, showEquation, userId],
  );

  const lettersForSetRef = useRef<string[]>([]);
  const letterIndexRef = useRef(0);

  // Handle equation answer
  const handleEquationAnswer = useCallback(
    (answer: boolean) => {
      if (equationAnswered || !currentEquation) return;
      haptic.vibrate(30);
      clearScheduledTimeout(equationTimeoutRef.current);
      equationTimeoutRef.current = null;

      const correct = answer === currentEquation.correctAnswer;
      setEquationAnswered(true);
      setEquationResult(correct);

      const eqStartMs = machineStateRef.current.equationStartMs ?? Date.now();
      currentEquationResultsRef.current.push({
        equation: currentEquation.equation,
        correctAnswer: currentEquation.correctAnswer,
        playerAnswer: answer,
        correct,
        responseTimeMs: Date.now() - eqStartMs,
      });

      applyMachineAction({
        type: 'ANSWER_EQUATION',
        equation: currentEquation.equation,
        correctAnswer: currentEquation.correctAnswer,
        answer,
        timestamp: Date.now(),
      });

      scheduleTimeout(() => {
        const letter = lettersForSetRef.current[letterIndexRef.current];
        if (letter) {
          letterIndexRef.current++;
          showLetterAndAdvance(letter);
        }
      }, 600);
    },
    [
      applyMachineAction,
      clearScheduledTimeout,
      currentEquation,
      equationAnswered,
      haptic,
      scheduleTimeout,
      showLetterAndAdvance,
    ],
  );

  // Handle recall letter tap
  const handleRecallLetterTap = useCallback(
    (letter: string) => {
      haptic.vibrate(30);
      setRecallSelection((prev) => [...prev, letter]);
    },
    [haptic],
  );

  // Undo last recall letter
  const handleRecallUndo = useCallback(() => {
    setRecallSelection((prev) => prev.slice(0, -1));
  }, []);

  // Submit recall
  const handleSubmitRecall = useCallback(() => {
    haptic.vibrate(50);
    applyMachineAction({
      type: 'SUBMIT_RECALL',
      recalled: recallSelection,
      timestamp: Date.now(),
    });

    // Reset equation results for next set
    currentEquationResultsRef.current = [];
  }, [haptic, applyMachineAction, recallSelection]);

  // Start first set on mount
  useMountEffect(() => {
    if (!machineState.sessionStarted && machineState.trialPhase === 'idle') {
      startSet(setSequence[0] ?? 3, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    return () => {
      clearAllScheduledTimeouts();
    };
  }, [clearAllScheduledTimeouts]);

  // Auto-advance after feedback
  useEffect(() => {
    if (machineState.trialPhase !== 'feedback') return;

    const lastResult = machineState.results[machineState.results.length - 1];
    const delay = lastResult?.recallCorrect ? 1200 : 1500;

    const timer = scheduleTimeout(() => {
      const transition = applyMachineAction({ type: 'NEXT_SET', timestamp: Date.now() });
      if (transition.state.sessionPhase === 'playing' && transition.state.trialPhase === 'idle') {
        startSet(transition.state.currentSpan, false);
      }
    }, delay);

    return () => clearScheduledTimeout(timer);
  }, [
    applyMachineAction,
    clearScheduledTimeout,
    machineState.results,
    machineState.trialPhase,
    scheduleTimeout,
    startSet,
  ]);

  // -------------------------------------------------------------------------
  // Quit modal handlers
  // -------------------------------------------------------------------------

  const handleQuitClick = useCallback(() => {
    setShowQuitModal(true);
  }, []);

  const handleQuitCancel = useCallback(() => {
    setShowQuitModal(false);
  }, []);

  const handleQuitConfirm = useCallback(() => {
    setShowQuitModal(false);
    clearAllScheduledTimeouts();
    track('session_abandoned', {
      session_id: emitterRef.current.sessionId,
      mode: 'ospan',
      n_level: startSpan,
      trials_completed: machineState.results.length,
      total_trials: setSequence.length,
      progress_pct: Math.round((machineState.results.length / setSequence.length) * 100),
      play_context: 'free',
    });
    applyMachineAction({ type: 'ABANDON', timestamp: Date.now() });
  }, [
    applyMachineAction,
    clearAllScheduledTimeouts,
    machineState.results.length,
    startSpan,
    track,
  ]);

  // -------------------------------------------------------------------------
  // Session summary
  // -------------------------------------------------------------------------

  const summary = useMemo(() => {
    if (machineState.sessionPhase !== 'finished') return null;
    return buildOspanSessionSummary(machineState.results);
  }, [machineState.results, machineState.sessionPhase]);

  // -------------------------------------------------------------------------
  // Feedback state
  // -------------------------------------------------------------------------

  const lastResult =
    machineState.trialPhase === 'feedback'
      ? machineState.results[machineState.results.length - 1]
      : null;

  // -------------------------------------------------------------------------
  // Finished screen
  // -------------------------------------------------------------------------

  if (machineState.sessionPhase === 'finished') {
    const handleRestart = () => {
      track('report_action_clicked', {
        session_id: emitterRef.current.sessionId,
        action: 'play_again',
        mode: 'ospan',
        n_level: startSpan,
        play_context: 'free',
      });
      applyMachineAction({ type: 'RESTART' });
      clearAllScheduledTimeouts();
      sessionStartedRef.current = false;
      const newSequence = generateStandardOspanSequence();
      setSetSequence(newSequence);
      emitterRef.current = {
        sessionId: crypto.randomUUID(),
        userId,
        seq: 0,
        events: [],
        commandBus,
      };
      scheduleTimeout(() => {
        startSet(newSequence[0] ?? 3, true);
      }, 100);
    };

    const scoreColor =
      (summary?.accuracy ?? 0) >= 80
        ? 'text-woven-correct'
        : (summary?.accuracy ?? 0) >= 50
          ? 'text-amber-400'
          : 'text-woven-incorrect';

    const longestStreak = (() => {
      if (!summary) return 0;
      let max = 0;
      let cur = 0;
      for (const r of summary.results) {
        cur = r.recallCorrect ? cur + 1 : 0;
        if (cur > max) max = cur;
      }
      return max;
    })();

    return (
      <div className="game-report-scroll">
        <div className="w-full max-w-md mx-auto px-4 pt-6 pb-8">
          {/* ═══ Frame ═══ */}
          <Hatching id="ospan-frame-top" className="text-woven-text/70" />
          <div className="flex items-stretch gap-x-2">
            <Hatching
              id="ospan-frame-left"
              orientation="vertical"
              className="shrink-0 text-woven-text/70"
            />
            <div className="flex-1 min-w-0">
              {/* ═══ ZONE 1: HERO ═══ */}
              <div className="px-2 pt-4 pb-0 text-center">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-visual">
                  {machineState.endReason === 'abandoned'
                    ? t('game.cogTask.sessionInterrupted')
                    : t('settings.gameMode.ospan', 'Operation Span')}
                  {'\u00A0'}
                  <span className="inline-flex align-middle -translate-y-px items-center px-3 py-1.5 rounded-lg text-sm font-bold leading-none tabular-nums tracking-wide whitespace-nowrap bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm text-woven-text">
                    {t('game.cogTask.span')} {summary?.maxSpanReached ?? startSpan}
                  </span>
                </h2>
                <Hatching id="ospan-hero-title-hatch" className="mt-2 text-woven-text/70" />
              </div>

              {summary && summary.totalSets > 0 && (
                <>
                  {/* ═══ ZONE 2: SCORE CARD ═══ */}
                  <div className="px-2 mt-4 p-1">
                    <div className="flex items-stretch">
                      {/* Primary: Absolute Score */}
                      <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                          {t('game.cogTask.score')}
                        </p>
                        <span
                          className={cn(
                            'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                            scoreColor,
                          )}
                        >
                          {summary.absoluteScore}
                        </span>
                      </div>

                      <Hatching
                        id="ospan-hero-score-divider"
                        orientation="vertical"
                        className="text-woven-text/70"
                      />

                      {/* Secondary: Max Span */}
                      <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-woven-text-muted">
                          {t('game.cogTask.maxSpan')}
                        </p>
                        <span className="nd-secondary-metric-value text-woven-text">
                          {summary.maxSpanReached}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Processing accuracy warning */}
                  {summary.processingAccuracy < processingAccuracyThreshold && (
                    <div className="px-2 mt-2">
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-center">
                        <p className="text-xs font-medium text-amber-500">
                          {t(
                            'game.cogTask.ospan.processingWarning',
                            `Equation accuracy below ${processingAccuracyThreshold}% — results may not reflect true working memory capacity`,
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <Hatching id="ospan-hero-score-hatch" className="mt-3 text-woven-text/70" />

                  {/* ═══ ZONE 3: STATS ROW ═══ */}
                  <div className="px-2 mt-4 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                        {t('game.cogTask.sets')}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-woven-text">
                        {summary.totalSets}
                      </p>
                    </div>
                    <div className="rounded-xl bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                        {t('game.cogTask.correct')}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-woven-correct">
                        {summary.correctSets}
                      </p>
                    </div>
                    <div className="rounded-xl bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                        {t('game.cogTask.equations')}
                      </p>
                      <p
                        className={cn(
                          'text-lg font-bold tabular-nums',
                          summary.processingAccuracy < processingAccuracyThreshold
                            ? 'text-amber-500'
                            : 'text-woven-text',
                        )}
                      >
                        {summary.processingAccuracy}%
                      </p>
                    </div>
                    <div className="rounded-xl bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                        {t('game.cogTask.recall')}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-woven-text">
                        {summary.accuracy}%
                      </p>
                    </div>
                  </div>

                  <Hatching id="ospan-stats-hatch" className="mt-4 text-woven-text/70" />

                  {/* ═══ ZONE 4: ACCORDIONS ═══ */}
                  <div className="px-2 py-4 space-y-2">
                    {/* Performance accordion */}
                    <Disclosure
                      title={t('game.cogTask.performance')}
                      icon={<ChartBar size={18} weight="duotone" className="text-visual" />}
                      render={() => (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs text-woven-text-muted">
                              {t('game.cogTask.score')}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-visual">
                              {summary.absoluteScore}
                            </span>
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs text-woven-text-muted">
                              {t('game.cogTask.maxSpanReached')}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-visual">
                              {summary.maxSpanReached}
                            </span>
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs text-woven-text-muted">
                              {t('game.cogTask.equationAccuracy')}
                            </span>
                            <span
                              className={cn(
                                'text-sm font-bold tabular-nums',
                                summary.processingAccuracy < processingAccuracyThreshold
                                  ? 'text-amber-500'
                                  : 'text-woven-text',
                              )}
                            >
                              {summary.processingAccuracy}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs text-woven-text-muted">
                              {t('game.cogTask.longestStreak')}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-woven-text">
                              {longestStreak} {t('game.cogTask.sets').toLowerCase()}
                            </span>
                          </div>
                        </div>
                      )}
                    />

                    {/* Detail par set accordion */}
                    <Disclosure
                      title={t('game.cogTask.setDetail')}
                      icon={
                        <ListChecks size={18} weight="duotone" className="text-woven-text-muted" />
                      }
                      render={() => (
                        <div className="space-y-1.5">
                          {summary.results.map((r, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-lg bg-woven-surface/80 backdrop-blur-lg border border-woven-border/60 shadow-sm px-3 py-2"
                            >
                              <span className="text-xs font-bold text-woven-text-muted w-5 text-right tabular-nums">
                                {i + 1}
                              </span>
                              <span className="text-sm font-medium text-woven-text flex-1">
                                {t('game.cogTask.span')} {r.span}
                              </span>
                              <span className="text-xs tabular-nums text-woven-text-muted">
                                {r.recalled.join('')}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                  r.recallCorrect
                                    ? 'bg-woven-correct/15 text-woven-correct'
                                    : 'bg-woven-incorrect/15 text-woven-incorrect',
                                )}
                              >
                                {r.recallCorrect ? 'OK' : 'FAIL'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                  </div>
                </>
              )}

              {summary && summary.totalSets === 0 && (
                <div className="mt-8 text-center text-sm text-woven-text-muted">
                  {t('game.cogTask.noSets')}
                </div>
              )}

              {/* ═══ ZONE 5: ACTIONS ═══ */}
              <Hatching id="ospan-actions-hatch" className="text-woven-text/70" />
              <div className="px-2 py-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-soft-colored transition-all active:scale-[0.98]"
                  >
                    <ArrowClockwise size={18} weight="bold" />
                    <span>{t('game.cogTask.restart')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      track('report_action_clicked', {
                        session_id: emitterRef.current.sessionId,
                        action: 'home',
                        mode: 'ospan',
                        n_level: startSpan,
                        play_context: 'free',
                      });
                      window.history.back();
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-all hover:text-foreground active:scale-[0.98]"
                  >
                    <House size={18} />
                  </button>
                </div>
              </div>
            </div>
            <Hatching
              id="ospan-frame-right"
              orientation="vertical"
              className="shrink-0 text-woven-text/70"
            />
          </div>
          <Hatching id="ospan-frame-bottom" className="text-woven-text/70" />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Playing screen
  // -------------------------------------------------------------------------

  const trialPhase = machineState.trialPhase;
  const currentSpan = machineState.currentSpan;

  return (
    <div className="game-page-shell">
      {/* HUD */}
      <CognitiveTaskHUD
        trialIndex={machineState.setIndex}
        totalTrials={setSequence.length}
        onQuit={handleQuitClick}
        canPause={false}
      />

      {/* Status indicator */}
      <div className="text-center px-4 py-2">
        <p
          className={cn(
            'text-sm font-medium transition-colors',
            trialPhase === 'showing_equation'
              ? 'text-woven-text'
              : trialPhase === 'showing_item'
                ? 'text-visual'
                : trialPhase === 'recalling'
                  ? 'text-woven-text'
                  : trialPhase === 'feedback' && lastResult?.recallCorrect
                    ? 'text-woven-correct'
                    : trialPhase === 'feedback'
                      ? 'text-woven-incorrect'
                      : 'text-woven-text-muted',
          )}
        >
          {trialPhase === 'idle' && t('game.cogTask.preparing')}
          {trialPhase === 'showing_equation' &&
            (equationAnswered ? '' : t('game.cogTask.ospan.trueOrFalse'))}
          {trialPhase === 'showing_item' && t('game.cogTask.memorizeLetter')}
          {trialPhase === 'recalling' &&
            t('game.cogTask.recallLettersInOrder', { count: currentSpan })}
          {trialPhase === 'feedback' &&
            lastResult?.recallCorrect &&
            t('game.cogTask.feedbackCorrect')}
          {trialPhase === 'feedback' &&
            lastResult &&
            !lastResult.recallCorrect &&
            t('game.cogTask.feedbackIncorrect')}
        </p>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-6">
        {/* Equation phase */}
        {trialPhase === 'showing_equation' && currentEquation && (
          <div className="flex flex-col items-center gap-6 w-full max-w-[320px]">
            {/* Equation display */}
            <div
              className={cn(
                'relative w-full rounded-2xl border p-6 text-center transition-all duration-200 overflow-hidden shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)]',
                equationAnswered
                  ? equationResult
                    ? 'bg-woven-correct/10 border-woven-correct/40'
                    : 'bg-woven-incorrect/10 border-woven-incorrect/40'
                  : 'bg-woven-surface border-woven-border',
              )}
            >
              <CanvasWeave opacity={0.06} className="stroke-neutral-400" />
              <p className="relative z-10 text-3xl sm:text-4xl font-black tabular-nums text-woven-text tracking-wide">
                {currentEquation.display}
              </p>
              {equationAnswered && (
                <p
                  className={cn(
                    'relative z-10 mt-2 text-sm font-semibold',
                    equationResult ? 'text-woven-correct' : 'text-woven-incorrect',
                  )}
                >
                  {equationResult
                    ? t('game.cogTask.feedbackCorrect')
                    : t('game.cogTask.feedbackIncorrect')}
                </p>
              )}
            </div>

            {/* True / False buttons */}
            {!equationAnswered && (
              <div className="flex gap-4 w-full">
                <button
                  type="button"
                  onClick={() => handleEquationAnswer(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-woven-correct text-white text-lg font-semibold active:scale-95 transition-all hover:bg-woven-correct/90 active:bg-woven-correct/80"
                >
                  <Check size={20} weight="bold" />
                  {t('game.cogTask.true')}
                </button>
                <button
                  type="button"
                  onClick={() => handleEquationAnswer(false)}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-woven-incorrect text-white text-lg font-semibold active:scale-95 transition-all hover:bg-woven-incorrect/90 active:bg-woven-incorrect/80"
                >
                  <X size={20} weight="bold" />
                  {t('game.cogTask.false')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Letter display phase */}
        {trialPhase === 'showing_item' && currentLetter && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-28 h-28 rounded-2xl bg-woven-cell-rest border-2 border-visual/50 flex items-center justify-center">
              <span className="text-6xl font-black text-visual">{currentLetter}</span>
            </div>
          </div>
        )}

        {/* Recall phase */}
        {trialPhase === 'recalling' && (
          <div className="flex flex-col items-center gap-5 w-full max-w-[340px] sm:max-w-[380px]">
            {/* Selected letters display */}
            <div className="flex gap-2.5 min-h-[56px] items-center justify-center flex-wrap">
              {recallSelection.length === 0 ? (
                <p className="text-sm text-woven-text-muted">
                  {t('game.cogTask.ospan.typeLetters')}
                </p>
              ) : (
                recallSelection.map((letter, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 rounded-xl bg-woven-cell-rest border border-visual/40 flex items-center justify-center shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)]"
                  >
                    <span className="text-xl font-black text-visual">{letter}</span>
                  </div>
                ))
              )}
            </div>

            {/* Letter pool grid */}
            <div className="grid grid-cols-4 gap-2.5 w-full">
              {ext.letterPool.map((letter) => {
                const alreadyUsed = recallSelection.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => !alreadyUsed && handleRecallLetterTap(letter)}
                    disabled={alreadyUsed}
                    className={cn(
                      'aspect-square rounded-xl text-xl font-bold transition-all active:scale-95',
                      alreadyUsed
                        ? 'bg-woven-surface/50 border border-woven-border/50 text-woven-text-muted/30'
                        : 'bg-woven-cell-rest border border-woven-border text-woven-text shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)]',
                    )}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            {/* Undo + Submit buttons */}
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={handleRecallUndo}
                disabled={recallSelection.length === 0}
                className={cn(
                  'w-1/3 py-3.5 rounded-xl text-sm font-medium border transition-all active:scale-95',
                  recallSelection.length === 0
                    ? 'bg-woven-surface/50 border-woven-border/50 text-woven-text-muted/30'
                    : 'bg-woven-cell-rest border-woven-border text-woven-text-muted',
                )}
              >
                {t('game.cogTask.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmitRecall}
                disabled={recallSelection.length === 0}
                className={cn(
                  'flex-1 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95',
                  recallSelection.length === 0
                    ? 'bg-woven-surface/50 border border-woven-border/50 text-woven-text-muted/30'
                    : 'bg-visual text-white shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.25)]',
                )}
              >
                {t('game.cogTask.submit')} ({recallSelection.length}/{currentSpan})
              </button>
            </div>
          </div>
        )}

        {/* Feedback phase */}
        {trialPhase === 'feedback' && lastResult && (
          <div className="flex flex-col items-center gap-4 w-full max-w-[320px]">
            <div
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                lastResult.recallCorrect ? 'bg-woven-correct/20' : 'bg-woven-incorrect/20',
              )}
            >
              {lastResult.recallCorrect ? (
                <Check size={40} weight="bold" className="text-woven-correct" />
              ) : (
                <X size={40} weight="bold" className="text-woven-incorrect" />
              )}
            </div>

            {/* Show correct vs recalled */}
            <div className="w-full space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <span className="text-xs text-woven-text-muted w-16 text-right">
                  {t('game.cogTask.expected')}
                </span>
                <div className="flex gap-1">
                  {lastResult.letters.map((l: string, i: number) => (
                    <span
                      key={i}
                      className="w-8 h-8 rounded-md bg-woven-correct/15 border border-woven-correct/30 flex items-center justify-center text-sm font-bold text-woven-correct"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <span className="text-xs text-woven-text-muted w-16 text-right">
                  {t('game.cogTask.recall')}
                </span>
                <div className="flex gap-1">
                  {lastResult.recalled.map((l: string, i: number) => {
                    const isCorrectPos = l === lastResult.letters[i];
                    return (
                      <span
                        key={i}
                        className={cn(
                          'w-8 h-8 rounded-md border flex items-center justify-center text-sm font-bold',
                          isCorrectPos
                            ? 'bg-woven-correct/15 border-woven-correct/30 text-woven-correct'
                            : 'bg-woven-incorrect/15 border-woven-incorrect/30 text-woven-incorrect',
                        )}
                      >
                        {l}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Idle / loading */}
        {trialPhase === 'idle' && (
          <div className="text-center text-woven-text-muted text-sm">
            {t('game.cogTask.loading')}
          </div>
        )}
      </div>

      {/* Bottom spacer for safe area */}
      <div className="game-page-bottom-spacer" />

      <GameQuitModal
        open={showQuitModal}
        labels={{
          title: t('game.quitModal.title'),
          message: t('game.quitModal.message'),
          cancel: t('common.cancel'),
          confirm: t('game.quitModal.confirm'),
          close: t('common.close'),
        }}
        onCancel={handleQuitCancel}
        onConfirm={handleQuitConfirm}
      />
    </div>
  );
}
