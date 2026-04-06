import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WOVEN_COLORS,
  resolveThemeColor,
  useEffectiveUserId,
  useMountEffect,
  useSessionCompletion,
} from '@neurodual/ui';
import {
  applyMove,
  isWon,
  type GridlockMove,
  type SessionEndReportModel,
} from '@neurodual/logic';
import { useAnalytics } from './use-analytics';
import { useAudioPrewarm } from './use-audio-prewarm';
import { useHaptic } from './use-haptic';
import { useAppPorts, useCommandBus } from '../providers';
import {
  buildEndEvent,
  buildStartEvent,
  buildTrialEvent,
  type CogTaskEventEmitter,
} from '../lib/cognitive-task-events';
import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';
import { useSettingsStore } from '../stores';
import {
  buildDualMixSummary,
  deriveStroopTiming,
  generateNBackSequence,
  generateStroopTrials,
  DUAL_MIX_COLOR_IDS,
  DUAL_MIX_DEFAULT_LEVEL,
  DUAL_MIX_DEFAULT_ROUNDS,
  DUAL_MIX_MAX_LEVEL,
  DUAL_MIX_MAX_ROUNDS,
  DUAL_MIX_MIN_LEVEL,
  DUAL_MIX_MIN_ROUNDS,
  DUAL_MIX_PREP_DELAY_MS,
  ISI_MS,
  NBACK_RESPONSE_WINDOW_MS,
  NBACK_STIMULUS_MS,
  STROOP_FEEDBACK_MS,
  pickRandomPuzzle,
  type DualMixColorId,
  type DualMixPhase,
  type DualMixSummary,
  type NBackResult,
  type NBackStimulus,
  type StroopResult,
  type StroopTrial,
} from '../lib/dual-mix-session';

export interface DualMixColorMeta {
  readonly id: DualMixColorId;
  readonly cssVar: string;
  readonly twClass: string;
  readonly word: string;
  readonly label: string;
}

export interface UseDualMixSessionResult {
  readonly phase: DualMixPhase;
  readonly round: number;
  readonly totalRounds: number;
  readonly nLevel: number;
  readonly includeGridlock: boolean;
  readonly canPause: boolean;
  readonly isStarting: boolean;
  readonly manualAdvance: boolean;
  readonly pressedPosition: boolean;
  readonly pressedAudio: boolean;
  readonly colors: readonly DualMixColorMeta[];
  readonly currentStimulus: NBackStimulus | undefined;
  readonly currentStroopTrial: StroopTrial | undefined;
  readonly currentInkCss: string | undefined;
  readonly currentRuleLabel: string;
  readonly currentMicroTaskLabel: string | null;
  readonly lastStroopFeedback: boolean | null;
  readonly gridlockBoard: ReturnType<typeof pickRandomPuzzle>;
  readonly summary: DualMixSummary | null;
  readonly completionReport: SessionEndReportModel | null | undefined;
  readonly modeLabel: string;
  readonly startSession: () => void;
  readonly togglePause: () => void;
  readonly restartSession: () => void;
  readonly abandonSession: () => void;
  readonly togglePositionMatch: () => void;
  readonly toggleAudioMatch: () => void;
  readonly submitNBackRound: () => void;
  readonly submitStroopResponse: (colorId: DualMixColorId) => void;
  readonly submitGridlockMove: (move: GridlockMove) => void;
}

export function useDualMixSession(): UseDualMixSessionResult {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const { track } = useAnalytics();
  const commandBus = useCommandBus();
  const { audio, platformInfo, persistence } = useAppPorts();
  const userId = useEffectiveUserId();
  const colorModalityTheme = useSettingsStore((store) => store.ui.colorModalityTheme);
  const { complete, result: completionResult } = useSessionCompletion({});
  const modeLabel = t('settings.gameMode.dualMix', 'Dual Mix');

  const modeSettings =
    useSettingsStore((store) => store.modes['dual-mix'] as Record<string, unknown> | undefined) ??
    {};
  const liveNLevel =
    typeof modeSettings['nLevel'] === 'number'
      ? Math.max(
          DUAL_MIX_MIN_LEVEL,
          Math.min(DUAL_MIX_MAX_LEVEL, Math.round(modeSettings['nLevel'])),
        )
      : DUAL_MIX_DEFAULT_LEVEL;
  const liveTotalRounds =
    typeof modeSettings['trialsCount'] === 'number'
      ? Math.max(
          DUAL_MIX_MIN_ROUNDS,
          Math.min(DUAL_MIX_MAX_ROUNDS, Math.round(modeSettings['trialsCount'])),
        )
      : DUAL_MIX_DEFAULT_ROUNDS;
  const liveIncludeGridlock =
    typeof modeSettings['dualMixIncludeGridlock'] === 'boolean'
      ? modeSettings['dualMixIncludeGridlock']
      : true;
  const liveManualAdvance =
    typeof modeSettings['dualMixManualAdvance'] === 'boolean'
      ? modeSettings['dualMixManualAdvance']
      : false;
  const [sessionConfig, setSessionConfig] = useState(() => ({
    nLevel: liveNLevel,
    totalRounds: liveTotalRounds,
    includeGridlock: liveIncludeGridlock,
    manualAdvance: liveManualAdvance,
  }));
  const nLevel = sessionConfig.nLevel;
  const totalRounds = sessionConfig.totalRounds;
  const includeGridlock = sessionConfig.includeGridlock;
  const manualAdvance = sessionConfig.manualAdvance;
  const stroopTiming = useMemo(() => deriveStroopTiming(nLevel), [nLevel]);

  useAudioPrewarm(audio);

  const colors = useMemo(
    () =>
      DUAL_MIX_COLOR_IDS.map((id) => {
        const resolved = resolveThemeColor(id, colorModalityTheme);
        return {
          id,
          cssVar: WOVEN_COLORS[resolved].cssVar,
          twClass: WOVEN_COLORS[resolved].bg,
          word: t(`game.cogTask.stroop.${id}Word`),
          label: t(`game.cogTask.stroop.${id}Label`),
        };
      }),
    [colorModalityTheme, t],
  );
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const emitterRef = useRef<CogTaskEventEmitter>({
    sessionId: crypto.randomUUID(),
    userId,
    seq: 0,
    events: [],
    commandBus,
  });
  emitterRef.current.userId = userId;
  emitterRef.current.commandBus = commandBus;

  const [phase, setPhase] = useState<DualMixPhase>('idle');
  const [round, setRound] = useState(0);
  const [runSeed, setRunSeed] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [pressedPosition, setPressedPosition] = useState(false);
  const [pressedAudio, setPressedAudio] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState(false);
  const [nbackResults, setNbackResults] = useState<NBackResult[]>([]);
  const [stroopResults, setStroopResults] = useState<StroopResult[]>([]);
  const [lastStroopFeedback, setLastStroopFeedback] = useState<boolean | null>(null);
  const [gridlockBoard, setGridlockBoard] = useState(() => pickRandomPuzzle());
  const [gridlockPuzzlesSolved, setGridlockPuzzlesSolved] = useState(0);
  const [gridlockTotalMoves, setGridlockTotalMoves] = useState(0);

  const nbackSequenceRef = useRef<NBackStimulus[]>([]);
  const stroopTrialsRef = useRef<StroopTrial[]>([]);
  const phaseRef = useRef<DualMixPhase>('idle');
  const roundRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puzzleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTokenRef = useRef(0);
  const sessionStartMsRef = useRef(0);
  const startedSeedRef = useRef<number | null>(null);
  const pausedPhaseRef = useRef<Exclude<DualMixPhase, 'paused'> | null>(null);
  const stroopRespondedRef = useRef(false);
  const stroopStimulusStartRef = useRef(0);
  const gridlockMoveAllowedRef = useRef(false);
  const emittedTrialIndexRef = useRef(0);
  const completionSessionIdRef = useRef<string | null>(null);
  const selectedPositionRef = useRef(false);
  const selectedAudioRef = useRef(false);
  const pressedPositionRef = useRef(false);
  const pressedAudioRef = useRef(false);
  phaseRef.current = phase;
  roundRef.current = round;
  selectedPositionRef.current = selectedPosition;
  selectedAudioRef.current = selectedAudio;
  pressedPositionRef.current = pressedPosition;
  pressedAudioRef.current = pressedAudio;

  useMountEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (puzzleResetTimerRef.current) clearTimeout(puzzleResetTimerRef.current);
      if (positionFlashTimerRef.current) clearTimeout(positionFlashTimerRef.current);
      if (audioFlashTimerRef.current) clearTimeout(audioFlashTimerRef.current);
    };
  });

  useEffect(() => {
    if (phase !== 'idle') return;
    setSessionConfig((current) => {
      if (
        current.nLevel === liveNLevel &&
        current.totalRounds === liveTotalRounds &&
        current.includeGridlock === liveIncludeGridlock &&
        current.manualAdvance === liveManualAdvance
      ) {
        return current;
      }
      return {
        nLevel: liveNLevel,
        totalRounds: liveTotalRounds,
        includeGridlock: liveIncludeGridlock,
        manualAdvance: liveManualAdvance,
      };
    });
  }, [liveIncludeGridlock, liveManualAdvance, liveNLevel, liveTotalRounds, phase]);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearPuzzleResetTimer = useCallback(() => {
    if (!puzzleResetTimerRef.current) return;
    clearTimeout(puzzleResetTimerRef.current);
    puzzleResetTimerRef.current = null;
  }, []);

  const clearFlashTimers = useCallback(() => {
    if (positionFlashTimerRef.current) {
      clearTimeout(positionFlashTimerRef.current);
      positionFlashTimerRef.current = null;
    }
    if (audioFlashTimerRef.current) {
      clearTimeout(audioFlashTimerRef.current);
      audioFlashTimerRef.current = null;
    }
  }, []);

  const invalidateTransitions = useCallback(() => {
    transitionTokenRef.current += 1;
    clearTimer();
  }, [clearTimer]);

  const scheduleTimer = useCallback(
    (callback: () => void, delayMs: number) => {
      const token = transitionTokenRef.current;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (transitionTokenRef.current !== token) return;
        callback();
      }, delayMs);
    },
    [clearTimer],
  );

  const nextTrialIndex = useCallback((): number => {
    const next = emittedTrialIndexRef.current;
    emittedTrialIndexRef.current += 1;
    return next;
  }, []);

  function commitNBackRound(roundIndex: number): void {
      if (phaseRef.current !== 'nback-response' || roundRef.current !== roundIndex) return;
      invalidateTransitions();
      const sequence = nbackSequenceRef.current;
      const targetIndex = roundIndex + nLevel;
      const currentStimulus = sequence[targetIndex];
      const previousStimulus = sequence[roundIndex];
      if (!currentStimulus || !previousStimulus) return;

      const isPositionTarget = currentStimulus.position === previousStimulus.position;
      const isAudioTarget = currentStimulus.audio === previousStimulus.audio;
      const committedPressedPosition = selectedPositionRef.current;
      const committedPressedAudio = selectedAudioRef.current;
      const result: NBackResult = {
        isPositionTarget,
        isAudioTarget,
        pressedPosition: committedPressedPosition,
        pressedAudio: committedPressedAudio,
        positionCorrect: committedPressedPosition === isPositionTarget,
        audioCorrect: committedPressedAudio === isAudioTarget,
      };

      setNbackResults((previous) => [...previous, result]);
      buildTrialEvent(
        emitterRef.current,
        'dual-mix',
        nextTrialIndex(),
        result.positionCorrect && result.audioCorrect,
        NBACK_RESPONSE_WINDOW_MS,
        'nback',
        {
          roundIndex,
          targetPosition: currentStimulus.position,
          targetAudio: currentStimulus.audio,
          isPositionTarget,
          isAudioTarget,
          stimulusType: currentStimulus.type,
          pressedPosition: committedPressedPosition,
          pressedAudio: committedPressedAudio,
          positionCorrect: result.positionCorrect,
          audioCorrect: result.audioCorrect,
          responseWindowMs: NBACK_RESPONSE_WINDOW_MS,
        },
      );
      startStroopFixation(roundIndex);
  }

  function startNBackStimulus(roundIndex: number): void {
      invalidateTransitions();
      clearFlashTimers();
      setSelectedPosition(false);
      setSelectedAudio(false);
      setPressedPosition(false);
      setPressedAudio(false);
      gridlockMoveAllowedRef.current = false;
      setPhase('nback-stimulus');

      const stimulus = nbackSequenceRef.current[roundIndex + nLevel];
      if (stimulus) {
        audio.play(stimulus.audio as never);
      }

      scheduleTimer(() => {
        setPhase('nback-response');
        if (!manualAdvance) {
          scheduleTimer(() => {
            commitNBackRound(roundIndex);
          }, NBACK_RESPONSE_WINDOW_MS);
        }
      }, NBACK_STIMULUS_MS);
  }

  function advanceAfterRound(roundIndex: number): void {
      invalidateTransitions();
      gridlockMoveAllowedRef.current = false;
      setPhase('round-isi');
      scheduleTimer(() => {
        const nextRound = roundIndex + 1;
        if (nextRound >= totalRounds) {
          setPhase('finished');
        } else {
          setRound(nextRound);
          startNBackStimulus(nextRound);
        }
      }, ISI_MS);
  }

  function startGridlockMove(): void {
    invalidateTransitions();
    gridlockMoveAllowedRef.current = true;
    setPhase('gridlock-move');
  }

  function startStroopFeedback(correct: boolean, roundIndex: number): void {
      setLastStroopFeedback(correct);
      setPhase('stroop-feedback');
      scheduleTimer(() => {
        if (includeGridlock) {
          startGridlockMove();
        } else {
          advanceAfterRound(roundIndex);
        }
      }, STROOP_FEEDBACK_MS);
  }

  function startStroopFixation(roundIndex: number): void {
      invalidateTransitions();
      stroopRespondedRef.current = false;
      setLastStroopFeedback(null);
      setPhase('stroop-fixation');
      scheduleTimer(() => {
        setPhase('stroop-stimulus');
        stroopStimulusStartRef.current = performance.now();
        scheduleTimer(() => {
          if (stroopRespondedRef.current) return;
          stroopRespondedRef.current = true;
          const trial = stroopTrialsRef.current[roundIndex];
          if (!trial) return;
          setStroopResults((previous) => [
            ...previous,
            {
              trial,
              response: null,
              correct: false,
              rt: stroopTiming.stimulusTimeoutMs,
              timedOut: true,
            },
          ]);
          buildTrialEvent(
            emitterRef.current,
            'dual-mix',
            nextTrialIndex(),
            false,
            stroopTiming.stimulusTimeoutMs,
            'stroop-flex',
            {
              roundIndex,
              timedOut: true,
              response: null,
              word: trial.word,
              inkColor: trial.inkColor,
              wordColor: trial.wordColor,
              rule: trial.rule,
            },
          );
          startStroopFeedback(false, roundIndex);
        }, stroopTiming.stimulusTimeoutMs);
      }, stroopTiming.fixationMs);
  }

  useEffect(() => {
    if (startedSeedRef.current === runSeed) return;
    startedSeedRef.current = runSeed;
    invalidateTransitions();
    clearPuzzleResetTimer();
    clearFlashTimers();
    nbackSequenceRef.current = generateNBackSequence(totalRounds, nLevel);
    stroopTrialsRef.current = generateStroopTrials(totalRounds, colorsRef.current);
    emittedTrialIndexRef.current = 0;
    completionSessionIdRef.current = null;
    setRound(0);
    setNbackResults([]);
    setStroopResults([]);
    setLastStroopFeedback(null);
    setGridlockBoard(pickRandomPuzzle());
    setGridlockPuzzlesSolved(0);
    setGridlockTotalMoves(0);
    setSelectedPosition(false);
    setSelectedAudio(false);
    setPressedPosition(false);
    setPressedAudio(false);
    setIsStarting(false);
    setPhase('idle');
  }, [clearPuzzleResetTimer, invalidateTransitions, nLevel, runSeed, totalRounds]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    invalidateTransitions();
    scheduleTimer(() => {
      setRound(0);
      startNBackStimulus(0);
    }, DUAL_MIX_PREP_DELAY_MS);
  }, [invalidateTransitions, phase, scheduleTimer, startNBackStimulus]);

  const startSession = useCallback(() => {
    if (phase !== 'idle') return;
    setIsStarting(true);
    setPhase('starting');
    haptic.vibrate(30);
    void audio
      .init()
      .catch(() => {})
      .finally(() => {
        const sessionStartMs = Date.now();
        sessionStartMsRef.current = sessionStartMs;
        buildStartEvent(emitterRef.current, 'dual-mix', platformInfo, {
          nLevel,
          rounds: totalRounds,
          includeGridlock,
          manualAdvance,
          activeModalities: includeGridlock ? ['position', 'audio', 'color'] : ['position', 'audio'],
          nbackStimulusMs: NBACK_STIMULUS_MS,
          nbackResponseWindowMs: NBACK_RESPONSE_WINDOW_MS,
          stroopFixationMs: stroopTiming.fixationMs,
          stroopStimulusTimeoutMs: stroopTiming.stimulusTimeoutMs,
        });
        track('session_started', {
          session_id: emitterRef.current.sessionId,
          mode: 'dual-mix',
          n_level: nLevel,
          modalities: includeGridlock ? ['position', 'audio', 'color'] : ['position', 'audio'],
          play_context: 'free',
        });
        setRound(0);
        setIsStarting(false);
        setPhase('countdown');
      });
  }, [
    audio,
    haptic,
    includeGridlock,
    manualAdvance,
    nLevel,
    phase,
    platformInfo,
    stroopTiming.fixationMs,
    stroopTiming.stimulusTimeoutMs,
    totalRounds,
    track,
  ]);

  const flashPosition = useCallback(() => {
    if (positionFlashTimerRef.current) clearTimeout(positionFlashTimerRef.current);
    setPressedPosition(true);
    positionFlashTimerRef.current = setTimeout(() => {
      positionFlashTimerRef.current = null;
      setPressedPosition(false);
    }, 220);
  }, []);

  const flashAudio = useCallback(() => {
    if (audioFlashTimerRef.current) clearTimeout(audioFlashTimerRef.current);
    setPressedAudio(true);
    audioFlashTimerRef.current = setTimeout(() => {
      audioFlashTimerRef.current = null;
      setPressedAudio(false);
    }, 220);
  }, []);

  const togglePositionMatch = useCallback(() => {
    if (phase !== 'nback-stimulus' && phase !== 'nback-response') return;
    haptic.vibrate(30);
    setSelectedPosition((value) => !value);
    flashPosition();
  }, [flashPosition, haptic, phase]);

  const toggleAudioMatch = useCallback(() => {
    if (phase !== 'nback-stimulus' && phase !== 'nback-response') return;
    haptic.vibrate(30);
    setSelectedAudio((value) => !value);
    flashAudio();
  }, [flashAudio, haptic, phase]);

  const submitNBackRound = useCallback(() => {
    if (!manualAdvance) return;
    commitNBackRound(round);
  }, [commitNBackRound, manualAdvance, round]);

  const submitStroopResponse = useCallback(
    (colorId: DualMixColorId) => {
      if (phase !== 'stroop-stimulus' || stroopRespondedRef.current) return;
      stroopRespondedRef.current = true;
      haptic.vibrate(30);
      invalidateTransitions();

      const trial = stroopTrialsRef.current[round];
      if (!trial) return;
      const responseTimeMs = performance.now() - stroopStimulusStartRef.current;
      const expected = trial.rule === 'ink' ? trial.inkColor : trial.wordColor;
      const correct = colorId === expected;

      setStroopResults((previous) => [
        ...previous,
        {
          trial,
          response: colorId,
          correct,
          rt: responseTimeMs,
          timedOut: false,
        },
      ]);
      buildTrialEvent(
        emitterRef.current,
        'dual-mix',
        nextTrialIndex(),
        correct,
        responseTimeMs,
        'stroop-flex',
        {
          roundIndex: round,
          timedOut: false,
          response: colorId,
          word: trial.word,
          inkColor: trial.inkColor,
          wordColor: trial.wordColor,
          rule: trial.rule,
        },
      );
      startStroopFeedback(correct, round);
    },
    [haptic, invalidateTransitions, nextTrialIndex, phase, round, startStroopFeedback],
  );

  const submitGridlockMove = useCallback(
    (move: GridlockMove) => {
      if (!gridlockMoveAllowedRef.current) return;
      const updatedBoard = applyMove(gridlockBoard, move);
      if (!updatedBoard) return;

      gridlockMoveAllowedRef.current = false;
      const solved = isWon(updatedBoard);
      setGridlockTotalMoves((value) => value + 1);
      setGridlockBoard(updatedBoard);
      buildTrialEvent(
        emitterRef.current,
        'dual-mix',
        nextTrialIndex(),
        true,
        0,
        'gridlock',
        {
          roundIndex: round,
          pieceId: move.pieceId,
          delta: move.delta,
          solved,
        },
      );

      if (solved) {
        setGridlockPuzzlesSolved((value) => value + 1);
        clearPuzzleResetTimer();
        const token = transitionTokenRef.current;
        puzzleResetTimerRef.current = setTimeout(() => {
          puzzleResetTimerRef.current = null;
          if (transitionTokenRef.current !== token) return;
          setGridlockBoard(pickRandomPuzzle());
        }, 300);
      }

      advanceAfterRound(round);
    },
    [advanceAfterRound, clearPuzzleResetTimer, gridlockBoard, nextTrialIndex, round],
  );

  const canPause = phase === 'nback-response' || phase === 'gridlock-move';

  const togglePause = useCallback(() => {
    if (!canPause && phase !== 'paused') return;
    if (phase === 'paused') {
      const pausedPhase = pausedPhaseRef.current;
      if (pausedPhase === 'nback-response') {
        setPhase('nback-response');
      } else if (
        pausedPhase === 'stroop-fixation' ||
        pausedPhase === 'stroop-stimulus' ||
        pausedPhase === 'stroop-feedback'
      ) {
        startStroopFixation(round);
      } else if (pausedPhase === 'gridlock-move') {
        startGridlockMove();
      } else {
        startNBackStimulus(round);
      }
      return;
    }

    pausedPhaseRef.current = phase;
    invalidateTransitions();
    stroopRespondedRef.current = true;
    gridlockMoveAllowedRef.current = false;
    setPhase('paused');
  }, [
    canPause,
    invalidateTransitions,
    phase,
    round,
    startGridlockMove,
    startNBackStimulus,
    startStroopFixation,
  ]);

  const restartSession = useCallback(() => {
    invalidateTransitions();
    clearPuzzleResetTimer();
    clearFlashTimers();
    pausedPhaseRef.current = null;
    emitterRef.current = {
      sessionId: crypto.randomUUID(),
      userId,
      seq: 0,
      events: [],
      commandBus,
    };
    setPhase('idle');
    setRunSeed((value) => value + 1);
  }, [clearFlashTimers, clearPuzzleResetTimer, commandBus, invalidateTransitions, userId]);

  const summary = useMemo(() => {
    if (phase !== 'finished') return null;
    return buildDualMixSummary({
      nbackResults,
      stroopResults,
      includeGridlock,
      gridlockPuzzlesSolved,
      gridlockTotalMoves,
      totalRounds,
      durationMs: Date.now() - sessionStartMsRef.current,
    });
  }, [
    gridlockPuzzlesSolved,
    gridlockTotalMoves,
    includeGridlock,
    nbackResults,
    phase,
    stroopResults,
    totalRounds,
  ]);

  useEffect(() => {
    if (phase !== 'finished' || !summary) return;
    if (completionSessionIdRef.current === emitterRef.current.sessionId) return;
    completionSessionIdRef.current = emitterRef.current.sessionId;

    buildEndEvent(emitterRef.current, 'dual-mix', {
      reason: 'completed',
      totalTrials: totalRounds,
      correctTrials: Math.round((summary.overallScore / 100) * totalRounds),
      accuracy: summary.overallScore / 100,
      durationMs: summary.durationMs,
      meanRtMs: summary.stroopAvgRT,
      metrics: {
        rounds: totalRounds,
        reportedLevel: nLevel,
        manualAdvance,
        nbackRounds: nbackResults.length,
        nbackAccuracy: summary.nbackAcc,
        stroopRounds: stroopResults.length,
        stroopAccuracy: summary.stroopAcc,
        stroopMeanRtMs: summary.stroopAvgRT,
        gridlockScore: summary.gridlockScore,
        gridlockMoves: summary.gridlockMoves,
        gridlockSolved: summary.gridlockSolved,
        includeGridlock,
        overallScore: summary.overallScore,
      },
    });

    track('session_completed', {
      session_id: emitterRef.current.sessionId,
      mode: 'dual-mix',
      n_level: nLevel,
      modalities: includeGridlock ? ['position', 'audio', 'color'] : ['position', 'audio'],
      duration_ms: summary.durationMs,
      ups: summary.overallScore,
      passed: summary.overallScore >= 80,
      next_level: nLevel,
      level_change: 0,
      xp_earned: 0,
      badges_earned: 0,
      leveled_up: false,
      play_context: 'free',
    });

    void complete({
      mode: 'cognitive-task',
      taskType: 'dual-mix',
      sessionId: emitterRef.current.sessionId,
      events: emitterRef.current.events,
      gameModeLabel: modeLabel,
      reason: 'completed',
      accuracy: summary.overallScore,
      correctTrials: Math.round((summary.overallScore / 100) * totalRounds),
      totalTrials: totalRounds,
      durationMs: summary.durationMs,
      meanRtMs: summary.stroopAvgRT,
    });
  }, [complete, modeLabel, nLevel, phase, summary, totalRounds, track]);

  const abandonSession = useCallback(() => {
    invalidateTransitions();
    clearPuzzleResetTimer();
    clearFlashTimers();
    track('session_abandoned', {
      session_id: emitterRef.current.sessionId,
      mode: 'dual-mix',
      n_level: nLevel,
      trials_completed: round,
      total_trials: totalRounds,
      progress_pct: Math.round((round / Math.max(1, totalRounds)) * 100),
      play_context: 'free',
    });
    emitterRef.current.events = [];
    void cleanupAbandonedSession(persistence, emitterRef.current.sessionId).catch(() => {});
  }, [
    clearFlashTimers,
    clearPuzzleResetTimer,
    invalidateTransitions,
    nLevel,
    persistence,
    round,
    totalRounds,
    track,
  ]);

  const currentStimulus = nbackSequenceRef.current[round + nLevel];
  const currentStroopTrial = stroopTrialsRef.current[round];
  const currentInkCss = currentStroopTrial
    ? `hsl(${colors.find((color) => color.id === currentStroopTrial.inkColor)?.cssVar})`
    : undefined;
  const currentRuleLabel =
    currentStroopTrial?.rule === 'word'
      ? t('game.cogTask.stroopFlex.ruleWord')
      : t('game.cogTask.stroopFlex.ruleInk');
  const currentMicroTaskLabel =
    phase === 'nback-stimulus' || phase === 'nback-response'
      ? 'N-Back'
      : phase.startsWith('stroop')
        ? 'Stroop Flex'
        : phase === 'gridlock-move'
          ? 'Gridlock'
          : null;

  return {
    phase,
    round,
    totalRounds,
    nLevel,
    includeGridlock,
    canPause,
    isStarting,
    manualAdvance,
    pressedPosition,
    pressedAudio,
    colors,
    currentStimulus,
    currentStroopTrial,
    currentInkCss,
    currentRuleLabel,
    currentMicroTaskLabel,
    lastStroopFeedback,
    gridlockBoard,
    summary,
    completionReport: completionResult?.report,
    modeLabel,
    startSession,
    togglePause,
    restartSession,
    abandonSession,
    togglePositionMatch,
    toggleAudioMatch,
    submitNBackRound,
    submitStroopResponse,
    submitGridlockMove,
  };
}
