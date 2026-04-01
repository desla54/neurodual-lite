/**
 * Stroop pages
 *
 * - /stroop: classic assessment mode
 * - /stroop-flex: training variant with dynamic rule switching
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StroopFlexIntro } from '../components/game/stroop-flex-intro';
import {
  cn,
  CanvasWeave,
  Toggle,
  useSessionCompletion,
  WOVEN_COLORS,
  resolveThemeColor,
  useMountEffect,
  useEffectiveUserId,
} from '@neurodual/ui';
import { CognitiveTaskHUD } from '../components/game/CognitiveTaskHUD';
import { GameQuitModal } from '../components/game/game-quit-modal';
import { StroopSessionReport } from '../components/reports/stroop-session-report';
import { useHaptic } from '../hooks/use-haptic';
import { useAnalytics } from '../hooks/use-analytics';
import { useAlphaEnabled } from '../hooks/use-beta-features';
import { useAppPorts, useCommandBus } from '../providers';

import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  type CogTaskEventEmitter,
  buildStartEvent,
  buildTrialEvent,
  buildEndEvent,
} from '../lib/cognitive-task-events';
import { useSettingsStore } from '../stores';

const DEFAULT_TOTAL_TRIALS = 96;
const MIN_TOTAL_TRIALS = 5;
const MAX_TOTAL_TRIALS = 160;
const STIMULUS_TIMEOUT_MS = 2500;
const FIXATION_MS = 500;
const FEEDBACK_MS = 300;
const ISI_MIN_MS = 900;
const ISI_MAX_MS = 1300;
const BUFFER_ISI_MS = 3000;
const EMPTY_MODE_SETTINGS: Readonly<Record<string, unknown>> = Object.freeze({});

function getJitteredItiMs(): number {
  return Math.round(ISI_MIN_MS + Math.random() * (ISI_MAX_MS - ISI_MIN_MS));
}

/** RT trimming bounds (Stroop protocol) */
const RT_MIN_MS = 100; // anticipatory
const RT_MAX_MS = 2500; // inattention

type StroopModeId = 'stroop' | 'stroop-flex';
type ColorId = 'red' | 'blue' | 'green' | 'yellow';
type StroopRule = 'ink' | 'word';
type Phase = 'idle' | 'fixation' | 'stimulus' | 'feedback' | 'isi' | 'paused' | 'finished';
type StatusTone = 'default' | 'muted';

const COLOR_IDS: ColorId[] = ['red', 'blue', 'green', 'yellow'];

interface StroopTrial {
  word: string;
  inkColor: ColorId;
  wordColor: ColorId;
  congruent: boolean;
  rule: StroopRule;
}

interface TrialResult {
  trial: StroopTrial;
  response: ColorId | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

function generateTrials(
  count: number,
  colors: { id: ColorId; word: string }[],
  variant: StroopModeId,
): StroopTrial[] {
  const baseTrials: Omit<StroopTrial, 'rule'>[] = [];
  const half = Math.floor(count / 2);

  for (let i = 0; i < half; i++) {
    const colorIdx = i % colors.length;
    const c = colors[colorIdx];
    if (!c) continue;
    baseTrials.push({ word: c.word, inkColor: c.id, wordColor: c.id, congruent: true });
  }

  for (let i = 0; i < count - half; i++) {
    const wordIdx = i % colors.length;
    let inkIdx = (wordIdx + 1 + (i % (colors.length - 1))) % colors.length;
    if (inkIdx === wordIdx) inkIdx = (inkIdx + 1) % colors.length;
    const wordC = colors[wordIdx];
    const inkC = colors[inkIdx];
    if (!wordC || !inkC) continue;
    baseTrials.push({
      word: wordC.word,
      inkColor: inkC.id,
      wordColor: wordC.id,
      congruent: false,
    });
  }

  for (let i = baseTrials.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = baseTrials[i];
    const swapped = baseTrials[j];
    if (!current || !swapped) continue;
    [baseTrials[i], baseTrials[j]] = [swapped, current];
  }

  return baseTrials.map((trial, index) => ({
    ...trial,
    rule: variant === 'stroop-flex' && index % 4 === 0 ? 'word' : 'ink',
  }));
}

function StroopPage({ variant }: { variant: StroopModeId }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isFlex = variant === 'stroop-flex';
  const modeLabel = isFlex ? t('settings.gameMode.stroopFlex') : t('settings.gameMode.stroop');
  const modeSettings = useSettingsStore((state) => state.modes[variant] ?? EMPTY_MODE_SETTINGS);
  const colorModalityTheme = useSettingsStore((s) => s.ui.colorModalityTheme);
  const hapticEnabled = useSettingsStore((s) => s.ui.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const buttonSoundsEnabled = useSettingsStore((s) => s.ui.buttonSoundsEnabled);
  const setButtonSoundsEnabled = useSettingsStore((s) => s.setButtonSoundsEnabled);
  const soundEnabled = useSettingsStore((s) => s.ui.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const alphaEnabled = useAlphaEnabled();
  const dyslatEnabled =
    variant === 'stroop' && alphaEnabled && modeSettings.stroopDyslatEnabled === true;

  const COLORS = useMemo(
    () =>
      COLOR_IDS.map((id) => {
        const resolved = resolveThemeColor(id, colorModalityTheme);
        return {
          id,
          cssVar: WOVEN_COLORS[resolved].cssVar,
          twClass: WOVEN_COLORS[resolved].bg,
          word: t(`game.cogTask.stroop.${id}Word`),
          label: t(`game.cogTask.stroop.${id}Label`),
        };
      }),
    [t, colorModalityTheme],
  );

  const haptic = useHaptic();
  const { track } = useAnalytics();
  const commandBus = useCommandBus();
  const { platformInfo, persistence } = useAppPorts();
  const { complete } = useSessionCompletion({});
  const userId = useEffectiveUserId();

  const emitterRef = useRef<CogTaskEventEmitter>({
    sessionId: crypto.randomUUID(),
    userId,
    seq: 0,
    events: [],
    commandBus,
  });
  emitterRef.current.commandBus = commandBus;
  emitterRef.current.userId = userId;

  const totalTrials =
    typeof modeSettings.trialsCount === 'number' && Number.isFinite(modeSettings.trialsCount)
      ? Math.max(MIN_TOTAL_TRIALS, Math.min(MAX_TOTAL_TRIALS, Math.round(modeSettings.trialsCount)))
      : DEFAULT_TOTAL_TRIALS;
  const stimulusTimeoutMs = (() => {
    const v = (modeSettings as Record<string, unknown>)['stimulusTimeoutMs'];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.max(1500, Math.min(6000, Math.round(v)))
      : STIMULUS_TIMEOUT_MS;
  })();
  const nLevel = (() => {
    if (!isFlex) return 1;
    const v = (modeSettings as Record<string, unknown>)['nLevel'];
    return typeof v === 'number' && Number.isFinite(v)
      ? Math.max(1, Math.min(9, Math.round(v)))
      : 1;
  })();
  /** Number of buffer trials at the start (observe only, no response expected). */
  const bufferCount = nLevel - 1;

  // ── Intro state (Stroop Flex only) ──
  const introSeenKey = `stroopFlexIntroSeen_n${nLevel}`;
  const forceIntro = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('intro') === '1';
  const [showIntro, setShowIntro] = useState(() => {
    if (!isFlex) return false;
    if (forceIntro) return true;
    try { return localStorage.getItem(introSeenKey) !== 'true'; }
    catch { return true; }
  });
  const handleIntroDone = useCallback(() => {
    setShowIntro(false);
    try { localStorage.setItem(introSeenKey, 'true'); } catch {}
  }, [introSeenKey]);

  const [runSeed, setRunSeed] = useState(0);
  const trials = useMemo(
    () => generateTrials(totalTrials, COLORS, variant),
    [COLORS, totalTrials, variant, runSeed],
  );
  const [trialIndex, setTrialIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<TrialResult[]>([]);
  const [lastFeedback, setLastFeedback] = useState<boolean | null>(null);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const stimulusStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartMsRef = useRef(0);
  const respondedRef = useRef(false);
  const startedSeedRef = useRef<number | null>(null);

  useMountEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  });

  const isBufferTrial = useCallback((idx: number) => idx < bufferCount, [bufferCount]);

  const startTrial = useCallback(
    (idx: number) => {
      if (idx >= trials.length) {
        setPhase('finished');
        return;
      }
      setTrialIndex(idx);
      setPhase('fixation');
      respondedRef.current = false;

      // Buffer trials (first nLevel-1): show stimulus then auto-advance, no response expected
      if (isBufferTrial(idx)) {
        timerRef.current = setTimeout(() => {
          setPhase('stimulus');
          timerRef.current = setTimeout(() => {
            setPhase('isi');
            timerRef.current = setTimeout(() => startTrial(idx + 1), BUFFER_ISI_MS);
          }, stimulusTimeoutMs);
        }, FIXATION_MS);
        return;
      }

      timerRef.current = setTimeout(() => {
        setPhase('stimulus');
        stimulusStartRef.current = performance.now();

        timerRef.current = setTimeout(() => {
          if (!respondedRef.current) {
            respondedRef.current = true;
            const trial = trials[idx];
            if (!trial) return;
            const result: TrialResult = {
              trial,
              response: null,
              correct: false,
              rt: stimulusTimeoutMs,
              timedOut: true,
            };
            setResults((prev) => [...prev, result]);
            setLastFeedback(false);
            setPhase('feedback');

            buildTrialEvent(
              emitterRef.current,
              variant,
              idx,
              false,
              stimulusTimeoutMs,
              trial.congruent ? 'congruent' : 'incongruent',
              {
                timedOut: true,
                response: null,
                word: trial.word,
                inkColor: trial.inkColor,
                wordColor: trial.wordColor,
                rule: trial.rule,
              },
            );

            timerRef.current = setTimeout(() => {
              setPhase('isi');
              timerRef.current = setTimeout(() => startTrial(idx + 1), getJitteredItiMs());
            }, FEEDBACK_MS);
          }
        }, stimulusTimeoutMs);
      }, FIXATION_MS);
    },
    [trials, variant, stimulusTimeoutMs, isBufferTrial],
  );

  useEffect(() => {
    if (showIntro) return; // wait for intro to complete
    if (startedSeedRef.current === runSeed) return;
    startedSeedRef.current = runSeed;
    sessionStartMsRef.current = Date.now();
    buildStartEvent(emitterRef.current, variant, platformInfo, {
      trialsCount: totalTrials,
      fixationMs: FIXATION_MS,
      stimulusDurationMs: stimulusTimeoutMs,
      itiMinMs: ISI_MIN_MS,
      itiMaxMs: ISI_MAX_MS,
    });
    track('session_started', {
      session_id: emitterRef.current.sessionId,
      mode: 'cognitive-task',
      n_level: nLevel,
      modalities: ['visual'],
      play_context: 'free',
    });
    startTrial(0);
  }, [platformInfo, runSeed, startTrial, stimulusTimeoutMs, totalTrials, variant]);

  const handleTogglePause = useCallback(() => {
    if (phase === 'paused') {
      startTrial(trialIndex);
    } else if (phase !== 'idle' && phase !== 'finished') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      respondedRef.current = true;
      setPhase('paused');
    }
  }, [phase, startTrial, trialIndex]);

  const handleResponse = useCallback(
    (colorId: ColorId) => {
      if (phase !== 'stimulus' || respondedRef.current) return;
      if (isBufferTrial(trialIndex)) return; // buffer trials don't accept responses
      respondedRef.current = true;
      haptic.vibrate(30);
      if (timerRef.current) clearTimeout(timerRef.current);

      const rt = performance.now() - stimulusStartRef.current;
      const trial = trials[trialIndex];
      if (!trial) return;
      // N-back: evaluate the stimulus from (nLevel-1) trials ago with the current rule
      const targetTrial = bufferCount > 0 ? trials[trialIndex - bufferCount] : trial;
      if (!targetTrial) return;
      const expectedResponse = trial.rule === 'ink' ? targetTrial.inkColor : targetTrial.wordColor;
      const correct = colorId === expectedResponse;
      const result: TrialResult = { trial, response: colorId, correct, rt, timedOut: false };

      setResults((prev) => [...prev, result]);
      setLastFeedback(correct);
      setPhase('feedback');

      buildTrialEvent(
        emitterRef.current,
        variant,
        trialIndex,
        correct,
        rt,
        trial.congruent ? 'congruent' : 'incongruent',
        {
          timedOut: false,
          response: colorId,
          word: trial.word,
          inkColor: trial.inkColor,
          wordColor: trial.wordColor,
          rule: trial.rule,
        },
      );

      timerRef.current = setTimeout(() => {
        setPhase('isi');
        timerRef.current = setTimeout(() => startTrial(trialIndex + 1), getJitteredItiMs());
      }, FEEDBACK_MS);
    },
    [haptic, phase, startTrial, trialIndex, trials, variant, isBufferTrial, bufferCount],
  );

  const summary = useMemo(() => {
    if (phase !== 'finished' || results.length === 0) return null;
    const correctTrials = results.filter((r) => r.correct).length;
    const accuracy = Math.round((correctTrials / results.length) * 100);
    const rtsAll = results.filter((r) => !r.timedOut).map((r) => r.rt);
    const avgRT =
      rtsAll.length > 0 ? Math.round(rtsAll.reduce((a, b) => a + b, 0) / rtsAll.length) : 0;

    /** RT trimming: exclude anticipatory (<100ms) and inattention (>2500ms) trials */
    const isValidRT = (rt: number) => rt >= RT_MIN_MS && rt <= RT_MAX_MS;
    const congruencyPool = isFlex ? results.filter((r) => r.trial.rule === 'ink') : results;
    const congruentRTs = congruencyPool
      .filter((r) => r.trial.congruent && !r.timedOut && r.correct && isValidRT(r.rt))
      .map((r) => r.rt);
    const incongruentRTs = congruencyPool
      .filter((r) => !r.trial.congruent && !r.timedOut && r.correct && isValidRT(r.rt))
      .map((r) => r.rt);
    const meanCongruent =
      congruentRTs.length > 0 ? congruentRTs.reduce((a, b) => a + b, 0) / congruentRTs.length : 0;
    const meanIncongruent =
      incongruentRTs.length > 0
        ? incongruentRTs.reduce((a, b) => a + b, 0) / incongruentRTs.length
        : 0;
    const congruencyEffect = Math.round(meanIncongruent - meanCongruent);

    const durationMs = Date.now() - sessionStartMsRef.current;

    return {
      correctTrials,
      totalTrials: results.length,
      accuracy,
      avgRT,
      congruencyEffect,
      durationMs,
    };
  }, [isFlex, phase, results]);

  useEffect(() => {
    if (phase !== 'finished' || !summary) return;

    const durationMs = summary.durationMs;
    buildEndEvent(emitterRef.current, variant, {
      reason: 'completed',
      accuracy: summary.accuracy / 100,
      correctTrials: summary.correctTrials,
      totalTrials: summary.totalTrials,
      durationMs,
      meanRtMs: summary.avgRT,
      metrics: { congruencyEffectMs: summary.congruencyEffect },
    });

    track('session_completed', {
      session_id: emitterRef.current.sessionId,
      mode: variant,
      n_level: nLevel,
      modalities: ['position'],
      duration_ms: durationMs,
      ups: summary.accuracy,
      passed: summary.accuracy >= 80,
      next_level: 1,
      level_change: 0,
      xp_earned: 0,
      badges_earned: 0,
      leveled_up: false,
      play_context: 'free',
    });

    void complete({
      mode: 'cognitive-task',
      taskType: variant,
      sessionId: emitterRef.current.sessionId,
      events: emitterRef.current.events,
      gameModeLabel: modeLabel,
      reason: 'completed',
      accuracy: summary.accuracy,
      correctTrials: summary.correctTrials,
      totalTrials: summary.totalTrials,
      durationMs,
      meanRtMs: summary.avgRT,
    });
  }, [complete, modeLabel, phase, summary, track, variant]);

  const handleQuit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    track('session_abandoned', {
      session_id: emitterRef.current.sessionId,
      mode: variant,
      n_level: nLevel,
      trials_completed: results.length,
      total_trials: totalTrials,
      progress_pct: Math.round((results.length / Math.max(1, totalTrials)) * 100),
      play_context: 'free',
    });
    emitterRef.current.events = [];
    void cleanupAbandonedSession(persistence, emitterRef.current.sessionId).catch(() => {});
    window.history.back();
  }, [persistence, results.length, totalTrials, track, variant]);

  const handleRestart = useCallback(() => {
    track('report_action_clicked', {
      session_id: emitterRef.current.sessionId,
      action: 'play_again',
      mode: variant,
      n_level: nLevel,
      play_context: 'free',
    });
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    emitterRef.current = {
      sessionId: crypto.randomUUID(),
      userId,
      seq: 0,
      events: [],
      commandBus,
    };
    setTrialIndex(0);
    setPhase('idle');
    setResults([]);
    setLastFeedback(null);
    respondedRef.current = false;
    setShowQuitModal(false);
    setRunSeed((seed) => seed + 1);
  }, [commandBus, track, userId, variant]);

  if (phase === 'finished' && summary) {
    return (
      <div className="game-report-scroll">
        <div className="px-0 pb-8 pt-0 md:px-4 md:py-8">
          <StroopSessionReport
            modeLabel={modeLabel}
            trials={results.map((result, index) => ({
              index: index + 1,
              word: result.trial.word,
              inkColor: result.trial.inkColor,
              wordColor: result.trial.wordColor,
              response: result.response,
              correct: result.correct,
              timedOut: result.timedOut,
              responseTimeMs: result.rt,
              congruent: result.trial.congruent,
              rule: result.trial.rule,
              wordTrap:
                result.trial.rule === 'ink' &&
                !result.correct &&
                !result.timedOut &&
                !result.trial.congruent &&
                result.response === result.trial.wordColor,
            }))}
            totalTrials={summary.totalTrials}
            accuracy={summary.accuracy}
            avgRtMs={summary.avgRT}
            congruencyEffectMs={summary.congruencyEffect}
            onPlayAgain={() => handleRestart()}
            onBackToHome={() => navigate('/')}
          />
        </div>
      </div>
    );
  }

  const currentTrial = trials[trialIndex];
  const inkCss = currentTrial
    ? `hsl(${COLORS.find((c) => c.id === currentTrial.inkColor)?.cssVar})`
    : undefined;
  const ruleLabel =
    currentTrial?.rule === 'word'
      ? t('game.cogTask.stroopFlex.ruleWord')
      : t('game.cogTask.stroopFlex.ruleInk');
  const isCurrentBuffer = isBufferTrial(trialIndex);
  const statusLine =
    phase === 'paused'
      ? {
          text: t('game.status.paused'),
          tone: 'muted' as StatusTone,
        }
      : isCurrentBuffer
        ? {
            text: t('game.cogTask.stroopFlex.observe', 'Observe'),
            tone: 'muted' as StatusTone,
          }
        : {
            text: isFlex
              ? t('game.cogTask.stroopFlex.pressMatchingRuleButton')
              : t('game.cogTask.stroop.pressInkColorButton'),
            tone: 'default' as StatusTone,
          };

  return (
    <div className="game-page-shell">
      {/* Stroop Flex intro overlay */}
      {showIntro && isFlex && (
        <StroopFlexIntro
          nLevel={nLevel}
          totalTrials={totalTrials}
          colors={COLORS}
          onComplete={handleIntroDone}
        />
      )}

      <CognitiveTaskHUD
        trialIndex={trialIndex}
        totalTrials={totalTrials}
        onQuit={() => setShowQuitModal(true)}
        isPaused={phase === 'paused'}
        canPause={phase !== 'idle' && phase !== 'finished'}
        onTogglePause={handleTogglePause}
        settingsMenuTitle={modeLabel}
        settingsMenuContent={
          <div className="divide-y divide-border/60">
            <Toggle
              label={t('settings.audio.haptic', 'Haptic feedback')}
              checked={hapticEnabled}
              onChange={setHapticEnabled}
            />
            <Toggle
              label={t('settings.audio.buttonSounds', 'Button sounds')}
              checked={buttonSoundsEnabled}
              onChange={setButtonSoundsEnabled}
            />
            <Toggle
              label={t('settings.audio.gameplaySounds', 'Gameplay sounds')}
              checked={soundEnabled}
              onChange={setSoundEnabled}
            />
          </div>
        }
      />

      <div className="min-h-[clamp(1.1rem,3vh,1.8rem)] px-4 py-[clamp(0.1rem,0.45vh,0.35rem)] text-center">
        <p
          className={cn(
            'text-sm font-medium transition-colors',
            statusLine.tone === 'default' ? 'text-woven-text' : 'text-woven-text-muted',
          )}
        >
          {statusLine.text}
        </p>
      </div>

      <div className="game-page-stage">
        <div className="relative flex aspect-square w-full max-w-[360px] items-center justify-center overflow-hidden rounded-2xl border border-white/18 bg-woven-surface shadow-[0_24px_60px_hsl(var(--foreground)/0.10)] shadow-[inset_0_0_0_1px_hsl(var(--woven-border)/0.32)] sm:max-w-[420px]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.40),hsl(var(--background)/0.18))]" />
          <div className="absolute inset-[1px] rounded-[15px] bg-white/8" />
          <CanvasWeave opacity={0.15} className="stroke-neutral-400" />
          <div className="relative z-10 flex h-full w-full items-center justify-center">
            {phase === 'fixation' && (
              <span className="select-none text-4xl font-bold text-woven-text-muted">+</span>
            )}
            {phase === 'stimulus' && currentTrial && (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                {isFlex && (
                  <div className="rounded-full border border-woven-border/70 bg-woven-bg/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-woven-text-muted">
                    {isCurrentBuffer
                      ? t('game.cogTask.stroopFlex.observe', 'Observe')
                      : `${t('game.cogTask.stroopFlex.followRule')}: ${ruleLabel}`}
                  </div>
                )}
                <span
                  className="select-none text-5xl font-black tracking-tight sm:text-6xl"
                  style={{
                    color: inkCss,
                    ...(dyslatEnabled && trialIndex % 2 === 0
                      ? { transform: 'scaleX(-1)', display: 'inline-block' }
                      : {}),
                  }}
                >
                  {currentTrial.word}
                </span>
              </div>
            )}
            {phase === 'feedback' && (
              <span
                className={cn(
                  'select-none text-3xl font-black',
                  lastFeedback ? 'text-woven-correct' : 'text-woven-incorrect',
                )}
              >
                {lastFeedback
                  ? t('game.cogTask.feedbackCorrect')
                  : t('game.cogTask.feedbackIncorrect')}
              </span>
            )}
            {phase === 'paused' && (
              <span className="select-none text-xl font-bold uppercase tracking-wider text-woven-text-muted">
                {t('game.status.paused')}
              </span>
            )}
            {phase === 'idle' && (
              <span className="select-none text-xl text-woven-text-muted">
                {t('game.cogTask.preparing')}
              </span>
            )}
          </div>
        </div>

        <div className="grid w-full max-w-[360px] grid-cols-2 gap-3 sm:max-w-[420px]">
          {COLORS.map((c, i) => {
            const isLeftCol = i % 2 === 0;
            const mirrorThis =
              dyslatEnabled &&
              ((trialIndex % 2 === 0 && isLeftCol) || (trialIndex % 2 === 1 && !isLeftCol));
            return (
              <button
                key={c.id}
                type="button"
                disabled={phase !== 'stimulus' || isCurrentBuffer}
                onClick={() => handleResponse(c.id)}
                className={cn(
                  'rounded-xl border border-white/20 py-4 text-base font-bold text-white transition-all active:scale-95 touch-manipulation',
                  c.twClass,
                  phase !== 'stimulus' || isCurrentBuffer ? 'opacity-40' : 'opacity-100',
                )}
              >
                <span
                  style={
                    mirrorThis ? { transform: 'scaleX(-1)', display: 'inline-block' } : undefined
                  }
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <GameQuitModal
        open={showQuitModal}
        labels={{
          title: t('game.quitModal.title'),
          message: t('game.quitModal.message'),
          cancel: t('common.cancel'),
          confirm: t('game.quitModal.confirm'),
          close: t('common.close'),
        }}
        onConfirm={() => {
          setShowQuitModal(false);
          handleQuit();
        }}
        onCancel={() => setShowQuitModal(false)}
      />
    </div>
  );
}

export function StroopTrainingPage() {
  return <StroopPage variant="stroop" />;
}

export function StroopFlexTrainingPage() {
  return <StroopPage variant="stroop-flex" />;
}
