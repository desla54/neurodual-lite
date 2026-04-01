/**
 * Gridlock Training Page
 *
 * Spatial reasoning block:
 * - Pre-generated puzzles from a 20K puzzle database
 * - Preview/planning phase before each puzzle
 * - Mixed challenge set (classic, precision, memory, timed)
 * - Undo, hints, resets, richer analytics and reporting
 * - Pointer-event drag interaction for sliding pieces
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  applyMove,
  buildGridlockTrainingSession,
  cloneBoard,
  evaluateGridlockPuzzle,
  generateContextualMessageData,
  getGridlockProfileForLevel,
  getHintMove,
  type GridlockAssistance,
  type GridlockDifficultyLock,
  type GridlockPreviewMode,
  type GridlockSessionVariant,
  isWon,
  listValidMoves,
  parseBoard,
  GRIDLOCK_PUZZLES,
  summarizeGridlockSession,
  type GridlockAttempt,
  type GridlockBoard,
  type GridlockEvaluation,
  type GridlockMove,
  type GridlockPuzzleConfig,
  type SessionEndReportModel,
} from '@neurodual/logic';
import {
  cn,
  CanvasWeave,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  Spinner,
  Toggle,
  UnifiedSessionReport,
  useSessionCompletion,
  useMountEffect,
  useEffectiveUserId,
} from '@neurodual/ui';
import { ArrowClockwise, ArrowCounterClockwise, Check, Lightbulb } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { GameQuitModal } from '../components/game';
import { CognitiveTaskHUD } from '../components/game/CognitiveTaskHUD';
import { useCloudSyncActions } from '../components/cloud-sync-provider';
import { useAnalytics } from '../hooks/use-analytics';
import { useHaptic } from '../hooks/use-haptic';
import { useUnifiedReportLabels } from '../hooks/use-unified-report-labels';
import {
  buildEndEvent,
  buildStartEvent,
  buildTrialEvent,
  type CogTaskEventEmitter,
} from '../lib/cognitive-task-events';
import { buildReportActionPayload } from '../lib/analytics-journey-props';
import { getStatsPresetForReport } from '../lib/stats-preset';
import { useAppPorts, useCommandBus } from '../providers';
import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';
import { useAdInterstitial } from '../hooks/use-ad-interstitial';
import { useSettingsStore } from '../stores';
import { translateContextualMessage } from '../utils/contextual-message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'preview' | 'playing' | 'solved-waiting' | 'finished';

interface PuzzleResult extends GridlockAttempt, GridlockEvaluation {
  config: GridlockPuzzleConfig;
}

interface DragState {
  pieceId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  cellDelta: number;
  orientation: 'H' | 'V';
  minDelta: number;
  maxDelta: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOARD_SIZE = 6;

/**
 * Piece colors use the woven theme CSS variables so they adapt to light/dark mode.
 * Format: `hsl(var(--woven-xxx))` → resolved by the browser at paint time.
 * A (target) = woven-incorrect (red). Others cycle through the palette.
 */
const PIECE_CSS_VARS: Record<string, string> = {
  A: '--woven-incorrect', // red — target car
  B: '--woven-blue',
  C: '--woven-correct', // green
  D: '--woven-amber',
  E: '--woven-purple',
  F: '--woven-cyan',
  G: '--woven-magenta',
  H: '--woven-orange',
  I: '--woven-blue', // recycle with slight opacity shift
  J: '--woven-purple',
  K: '--woven-correct',
  L: '--woven-amber',
  M: '--woven-cyan',
};

const PIECE_FALLBACK_VAR = '--woven-gray';

function getPieceColor(id: string): string {
  const cssVar = PIECE_CSS_VARS[id] ?? PIECE_FALLBACK_VAR;
  return `hsl(var(${cssVar}))`;
}

function getPieceBorderColor(id: string): string {
  const cssVar = PIECE_CSS_VARS[id] ?? PIECE_FALLBACK_VAR;
  return `hsl(var(${cssVar}) / 0.7)`;
}

/** Compute valid delta range for a piece given the current board. */
function computeDeltaRange(
  board: GridlockBoard,
  pieceId: string,
): { minDelta: number; maxDelta: number } {
  const validMoves = listValidMoves(board);
  let minDelta = 0;
  let maxDelta = 0;
  for (const move of validMoves) {
    if (move.pieceId === pieceId) {
      if (move.delta < minDelta) minDelta = move.delta;
      if (move.delta > maxDelta) maxDelta = move.delta;
    }
  }
  return { minDelta, maxDelta };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridlockTrainingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const { track } = useAnalytics();
  const commandBus = useCommandBus();
  const { platformInfo, persistence } = useAppPorts();
  const setModeSettingFor = useSettingsStore((s) => s.setModeSettingFor);
  const gridlockNLevel = useSettingsStore((s) => s.modes['gridlock']?.nLevel ?? 1);
  const gridlockProfileId = useSettingsStore((s) => s.modes['gridlock']?.gridlockProfileId);
  const gridlockVariant: GridlockSessionVariant = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockSessionVariant ?? 'mixed',
  );
  const gridlockPuzzleCount = useSettingsStore((s) => s.modes['gridlock']?.trialsCount || 12);
  const gridlockDifficultyLock: GridlockDifficultyLock = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockDifficultyLock ?? 'auto',
  );
  const gridlockAssistance: GridlockAssistance = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockAssistance ?? 'balanced',
  );
  const gridlockPreviewMode: GridlockPreviewMode = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockPreviewDuration ?? 'auto',
  );
  const gridlockShowMoveCounter = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockShowMoveCounter ?? true,
  );
  const gridlockShowOptimal = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockShowOptimal ?? true,
  );
  const gridlockAutoAdvance = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockAutoAdvance ?? true,
  );
  const gridlockShowSolutionOnFail = useSettingsStore(
    (s) => s.modes['gridlock']?.gridlockShowSolutionOnFail ?? true,
  );
  const setStatsTab = useSettingsStore((state) => state.setStatsTab);
  const setStatsMode = useSettingsStore((state) => state.setStatsMode);
  const setStatsJourneyFilter = useSettingsStore((state) => state.setStatsJourneyFilter);
  const userId = useEffectiveUserId();
  const { syncEventsAndProgression } = useCloudSyncActions();
  const { complete, result: completionResult } = useSessionCompletion({
    syncToCloud: syncEventsAndProgression,
  });
  const unifiedReportLabels = useUnifiedReportLabels();
  const { maybeShowAd } = useAdInterstitial();

  const emitterRef = useRef<CogTaskEventEmitter>({
    sessionId: crypto.randomUUID(),
    userId,
    seq: 0,
    events: [],
    commandBus,
  });
  emitterRef.current.commandBus = commandBus;
  emitterRef.current.userId = userId;

  // -------------------------------------------------------------------------
  // Training session
  // -------------------------------------------------------------------------

  const trainingSession = useMemo(
    () =>
      buildGridlockTrainingSession({
        seed: emitterRef.current.sessionId,
        profileId: gridlockProfileId ?? getGridlockProfileForLevel(gridlockNLevel),
        puzzleDb: GRIDLOCK_PUZZLES as GridlockPuzzleConfig['puzzle'][],
        puzzleCount: gridlockPuzzleCount,
        sessionVariant: gridlockVariant,
        difficultyLock: gridlockDifficultyLock,
        assistance: gridlockAssistance,
        previewMode: gridlockPreviewMode,
      }),
    [
      gridlockNLevel,
      gridlockProfileId,
      gridlockPuzzleCount,
      gridlockVariant,
      gridlockDifficultyLock,
      gridlockAssistance,
      gridlockPreviewMode,
    ],
  );
  const totalPuzzles = trainingSession.puzzles.length;
  const initialConfig = trainingSession.puzzles[0];

  if (!initialConfig) {
    throw new Error('Gridlock training session requires at least one puzzle');
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('preview');
  const [isPaused, setIsPaused] = useState(false);
  const [results, setResults] = useState<PuzzleResult[]>([]);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [board, setBoard] = useState<GridlockBoard>(() =>
    parseBoard(initialConfig.puzzle.boardStr),
  );
  const [moveCount, setMoveCount] = useState(0);
  const [undosUsed, setUndosUsed] = useState(0);
  const [resetsUsed, setResetsUsed] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [history, setHistory] = useState<GridlockBoard[]>([]);
  const [hintMove, setHintMove] = useState<GridlockMove | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSolvedFlash, setShowSolvedFlash] = useState(false);
  const [previewEndsAt, setPreviewEndsAt] = useState<number | null>(null);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const [hideHudProgressBar, setHideHudProgressBar] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 380 && window.innerHeight <= 760;
  });

  const sessionStartMsRef = useRef(0);
  const puzzleStartMsRef = useRef(0);
  const firstMoveMsRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedRef = useRef(false);
  const stableReportRef = useRef<{ sessionId: string; report: SessionEndReportModel } | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const boardRef = useRef<GridlockBoard>(board);
  const moveCountRef = useRef(moveCount);

  const currentConfig = trainingSession.puzzles[puzzleIndex] ?? null;
  dragStateRef.current = dragState;
  boardRef.current = board;
  moveCountRef.current = moveCount;

  // -------------------------------------------------------------------------
  // Timer cleanup
  // -------------------------------------------------------------------------

  const clearTimers = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    setDragState(null);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Preview countdown tick
  useEffect(() => {
    if (phase !== 'preview' || previewEndsAt === null) return;
    const intervalId = window.setInterval(() => setPreviewNow(Date.now()), 100);
    return () => window.clearInterval(intervalId);
  }, [phase, previewEndsAt]);

  // -------------------------------------------------------------------------
  // Puzzle lifecycle
  // -------------------------------------------------------------------------

  const startPuzzle = useCallback(
    (index: number) => {
      clearTimers();
      if (index >= totalPuzzles) {
        setPreviewEndsAt(null);
        setPhase('finished');
        return;
      }

      const config = trainingSession.puzzles[index];
      if (!config) {
        setPreviewEndsAt(null);
        setPhase('finished');
        return;
      }
      const nextPreviewEndsAt = Date.now() + config.previewMs;

      setPuzzleIndex(index);
      setBoard(parseBoard(config.puzzle.boardStr));
      setMoveCount(0);
      setIsPaused(false);
      setUndosUsed(0);
      setResetsUsed(0);
      setHintsUsed(0);
      setHistory([]);
      setHintMove(null);
      setStatusMessage(null);
      setPreviewEndsAt(nextPreviewEndsAt);
      setPreviewNow(Date.now());
      firstMoveMsRef.current = null;
      puzzleStartMsRef.current = performance.now();
      setPhase('preview');

      transitionTimerRef.current = setTimeout(() => {
        setPhase('playing');
        setPreviewEndsAt(null);
        setStatusMessage(null);
      }, config.previewMs);
    },
    [clearTimers, totalPuzzles, trainingSession.puzzles],
  );

  // -------------------------------------------------------------------------
  // Session start
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    sessionStartMsRef.current = Date.now();

    const emitter = emitterRef.current;
    buildStartEvent(emitter, 'gridlock', platformInfo, {
      trialsCount: totalPuzzles,
      profileId: trainingSession.profile.id,
      challenges: trainingSession.profile.challengeSchedule,
    });
    track('session_started', {
      session_id: emitter.sessionId,
      mode: 'cognitive-task',
      n_level: 1,
      modalities: ['position'],
      play_context: 'free',
    });
    startPuzzle(0);
  }, [platformInfo, startPuzzle, totalPuzzles, track, trainingSession.profile]);

  // -------------------------------------------------------------------------
  // Finish puzzle
  // -------------------------------------------------------------------------

  const finishPuzzle = useCallback(
    (nextBoard: GridlockBoard, nextMoveCount: number) => {
      if (!currentConfig || !isWon(nextBoard)) return;

      clearTimers();
      const totalTimeMs = Math.round(performance.now() - puzzleStartMsRef.current);
      const planningTimeMs = Math.round(firstMoveMsRef.current ?? totalTimeMs);
      const attempt: GridlockAttempt = {
        optimalMoves: currentConfig.puzzle.optimalMoves,
        playerMoves: nextMoveCount,
        totalTimeMs,
        planningTimeMs,
        hintsUsed,
        undosUsed,
        resetsUsed,
        solved: true,
        challenge: currentConfig.challenge,
      };
      const evaluation = evaluateGridlockPuzzle(attempt);
      const result: PuzzleResult = {
        config: currentConfig,
        ...attempt,
        ...evaluation,
      };

      setResults((previous) => [...previous, result]);
      setHintMove(null);
      setShowSolvedFlash(true);
      setTimeout(() => setShowSolvedFlash(false), 1100);
      setStatusMessage(
        evaluation.extraMoves === 0
          ? `Optimal solve. Score ${evaluation.score}.`
          : `Solved in ${nextMoveCount} moves (+${evaluation.extraMoves}). Score ${evaluation.score}.`,
      );
      haptic.vibrate(30);

      buildTrialEvent(
        emitterRef.current,
        'gridlock',
        puzzleIndex,
        evaluation.extraMoves === 0,
        totalTimeMs,
        currentConfig.challenge,
        {
          optimalMoves: currentConfig.puzzle.optimalMoves,
          playerMoves: nextMoveCount,
          extraMoves: evaluation.extraMoves,
          planningTimeMs,
          undosUsed,
          resetsUsed,
          hintsUsed,
          score: evaluation.score,
          stars: evaluation.stars,
          difficulty: currentConfig.puzzle.difficulty,
        },
      );

      if (gridlockAutoAdvance) {
        transitionTimerRef.current = setTimeout(() => {
          startPuzzle(puzzleIndex + 1);
        }, 1400);
      } else {
        transitionTimerRef.current = setTimeout(() => {
          setPhase('solved-waiting');
        }, 800);
      }
    },
    [
      clearTimers,
      currentConfig,
      gridlockAutoAdvance,
      haptic,
      hintsUsed,
      puzzleIndex,
      resetsUsed,
      startPuzzle,
      undosUsed,
    ],
  );

  // -------------------------------------------------------------------------
  // Grid cell size helper
  // -------------------------------------------------------------------------

  const getCellSize = useCallback(() => {
    const container = gridContainerRef.current;
    if (!container) return 53;
    return container.clientWidth / BOARD_SIZE;
  }, []);

  // -------------------------------------------------------------------------
  // Drag interaction
  // -------------------------------------------------------------------------

  const handlePiecePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, pieceId: string) => {
      if (phase !== 'playing' || isPaused || dragState) return;

      const piece = board.pieces.find((p) => p.id === pieceId);
      if (!piece) return;

      event.preventDefault();
      event.stopPropagation();

      const { minDelta, maxDelta } = computeDeltaRange(board, pieceId);
      if (minDelta === 0 && maxDelta === 0) return;

      setDragState({
        pieceId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        cellDelta: 0,
        orientation: piece.orientation,
        minDelta,
        maxDelta,
      });
      setHintMove(null);
      setStatusMessage(null);
      haptic.vibrate(10);
    },
    [board, dragState, haptic, isPaused, phase],
  );

  useEffect(() => {
    if (!dragState) return;

    const activePointerId = dragState.pointerId;

    const handlePointerMove = (event: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag || event.pointerId !== activePointerId) return;

      const cellSize = getCellSize();
      const rawDelta =
        currentDrag.orientation === 'H'
          ? (event.clientX - currentDrag.startClientX) / cellSize
          : (event.clientY - currentDrag.startClientY) / cellSize;

      const clamped = Math.max(
        currentDrag.minDelta,
        Math.min(currentDrag.maxDelta, Math.round(rawDelta)),
      );

      setDragState((current) => (current ? { ...current, cellDelta: clamped } : current));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag || event.pointerId !== activePointerId) return;

      const cellSize = getCellSize();
      const rawDelta =
        currentDrag.orientation === 'H'
          ? (event.clientX - currentDrag.startClientX) / cellSize
          : (event.clientY - currentDrag.startClientY) / cellSize;

      const finalDelta = Math.max(
        currentDrag.minDelta,
        Math.min(currentDrag.maxDelta, Math.round(rawDelta)),
      );

      setDragState(null);

      if (finalDelta !== 0) {
        const currentBoard = boardRef.current;
        const move: GridlockMove = { pieceId: currentDrag.pieceId, delta: finalDelta };
        const nextBoard = applyMove(currentBoard, move);
        if (nextBoard) {
          if (firstMoveMsRef.current === null) {
            firstMoveMsRef.current = performance.now() - puzzleStartMsRef.current;
          }
          const nextMoveCount = moveCountRef.current + 1;
          setHistory((previous) => [...previous, cloneBoard(currentBoard)]);
          setBoard(nextBoard);
          setMoveCount(nextMoveCount);
          setHintMove(null);
          setStatusMessage(null);
          haptic.vibrate(20);
          if (isWon(nextBoard)) {
            // Defer to allow state to settle before finishing
            setTimeout(() => finishPuzzle(nextBoard, nextMoveCount), 16);
          }
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState?.pointerId, getCellSize, haptic, finishPuzzle]);

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    if (phase !== 'playing' || isPaused || !currentConfig || history.length === 0 || dragState) {
      return;
    }
    if (undosUsed >= currentConfig.undoBudget) return;

    const previousBoard = history[history.length - 1];
    if (!previousBoard) return;

    setHistory((previous) => previous.slice(0, -1));
    setBoard(cloneBoard(previousBoard));
    setMoveCount((previous) => Math.max(0, previous - 1));
    setUndosUsed((previous) => previous + 1);
    setHintMove(null);
    setStatusMessage(t('game.gridlock.undone', 'Last move undone.'));
    haptic.vibrate(15);
  }, [currentConfig, dragState, history, haptic, isPaused, phase, undosUsed]);

  const handleReset = useCallback(() => {
    if (
      phase !== 'playing' ||
      isPaused ||
      !currentConfig ||
      resetsUsed >= currentConfig.resetBudget ||
      dragState
    ) {
      return;
    }

    setBoard(parseBoard(currentConfig.puzzle.boardStr));
    setMoveCount(0);
    setHintMove(null);
    setHistory([]);
    setResetsUsed((previous) => previous + 1);
    setStatusMessage(t('game.gridlock.resetMessage', 'Puzzle reset.'));
    haptic.vibrate(15);
  }, [currentConfig, dragState, haptic, isPaused, phase, resetsUsed]);

  const handleHint = useCallback(() => {
    if (
      phase !== 'playing' ||
      isPaused ||
      !currentConfig ||
      hintsUsed >= currentConfig.hintBudget ||
      dragState
    ) {
      return;
    }

    const nextHintMove = getHintMove(board);
    if (!nextHintMove) return;

    setHintMove(nextHintMove);
    setHintsUsed((previous) => previous + 1);
    const dir =
      nextHintMove.delta > 0
        ? board.pieces.find((p) => p.id === nextHintMove.pieceId)?.orientation === 'H'
          ? 'right'
          : 'down'
        : board.pieces.find((p) => p.id === nextHintMove.pieceId)?.orientation === 'H'
          ? 'left'
          : 'up';
    setStatusMessage(
      t('game.gridlock.hintMessage', 'Hint: slide {{pieceId}} {{dir}} {{delta}}.', {
        pieceId: nextHintMove.pieceId,
        dir,
        delta: Math.abs(nextHintMove.delta),
      }),
    );
    haptic.vibrate(10);
  }, [board, currentConfig, dragState, hintsUsed, haptic, isPaused, phase]);

  // -------------------------------------------------------------------------
  // Pause / Quit
  // -------------------------------------------------------------------------

  useMountEffect(() => {
    const updateHudDensity = () => {
      setHideHudProgressBar(window.innerWidth <= 380 && window.innerHeight <= 760);
    };
    updateHudDensity();
    window.addEventListener('resize', updateHudDensity);
    return () => window.removeEventListener('resize', updateHudDensity);
  });

  const canPauseNow = (phase === 'playing' || isPaused) && !dragState;

  const handleTogglePause = useCallback(() => {
    if (!canPauseNow) return;
    setIsPaused((previous) => !previous);
  }, [canPauseNow]);

  const handleQuitClick = useCallback(() => {
    if (phase === 'playing' && !isPaused) setIsPaused(true);
    setShowQuitModal(true);
  }, [isPaused, phase]);

  const handleQuitCancel = useCallback(() => {
    setShowQuitModal(false);
  }, []);

  const handleQuitConfirm = useCallback(() => {
    clearTimers();
    track('session_abandoned', {
      session_id: emitterRef.current.sessionId,
      mode: 'cognitive-task',
      n_level: 1,
      trials_completed: results.length,
      total_trials: totalPuzzles,
      progress_pct: Math.round((results.length / totalPuzzles) * 100),
      play_context: 'free',
    });
    emitterRef.current.events = [];
    void cleanupAbandonedSession(persistence, emitterRef.current.sessionId).catch(() => {});
    window.history.back();
  }, [clearTimers, persistence, results.length, totalPuzzles, track]);

  const handleRestart = useCallback(() => {
    track('report_action_clicked', {
      session_id: emitterRef.current.sessionId,
      action: 'play_again',
      mode: 'cognitive-task',
      n_level: 1,
      play_context: 'free',
    });
    window.location.reload();
  }, [track]);

  // -------------------------------------------------------------------------
  // Session end
  // -------------------------------------------------------------------------

  const summary = useMemo(() => {
    if (phase !== 'finished') return null;
    return summarizeGridlockSession(results);
  }, [phase, results]);

  useEffect(() => {
    if (phase !== 'finished' || !summary) return;

    const emitter = emitterRef.current;
    const durationMs = Date.now() - sessionStartMsRef.current;

    buildEndEvent(emitter, 'gridlock', {
      reason: 'completed',
      totalTrials: summary.puzzleCount,
      correctTrials: summary.optimalCount,
      accuracy: summary.accuracyPercent / 100,
      durationMs,
      meanRtMs: summary.avgPlanningTimeMs,
      metrics: {
        masteryScore: summary.masteryScore,
        avgMoves: summary.avgMoves,
        avgEfficiencyPercent: summary.avgEfficiencyPercent,
        totalExtraMoves: summary.totalExtraMoves,
        totalHintsUsed: summary.totalHintsUsed,
        totalUndosUsed: summary.totalUndosUsed,
        totalResetsUsed: summary.totalResetsUsed,
        totalStars: summary.totalStars,
      },
    });

    track('session_completed', {
      session_id: emitter.sessionId,
      mode: 'cognitive-task',
      n_level: 1,
      modalities: ['position'],
      duration_ms: durationMs,
      ups: summary.masteryScore,
      passed: summary.masteryScore >= 75,
      next_level: 1,
      level_change: 0,
      xp_earned: 0,
      badges_earned: 0,
      leveled_up: false,
      play_context: 'free',
    });

    void (async () => {
      void complete({
        mode: 'cognitive-task',
        taskType: 'gridlock',
        sessionId: emitter.sessionId,
        events: emitter.events,
        gameModeLabel: t('settings.gameMode.gridlock', 'Gridlock'),
        reason: 'completed',
        accuracy: summary.accuracyPercent,
        correctTrials: summary.optimalCount,
        totalTrials: summary.puzzleCount,
        durationMs,
        meanRtMs: summary.avgPlanningTimeMs,
      });
    })();
  }, [complete, phase, summary, track, trainingSession.profile.id]);

  // -------------------------------------------------------------------------
  // Computed values
  // -------------------------------------------------------------------------

  const canUndo =
    !!currentConfig &&
    phase === 'playing' &&
    history.length > 0 &&
    undosUsed < currentConfig.undoBudget &&
    !isPaused &&
    !dragState;
  const canHint =
    !!currentConfig &&
    phase === 'playing' &&
    hintsUsed < currentConfig.hintBudget &&
    !isPaused &&
    !dragState;
  const canReset =
    !!currentConfig &&
    phase === 'playing' &&
    resetsUsed < currentConfig.resetBudget &&
    !isPaused &&
    !dragState;

  const previewSeconds = previewEndsAt
    ? Math.max(1, Math.ceil((previewEndsAt - previewNow) / 1000))
    : 0;

  const feedbackText = currentConfig
    ? phase === 'preview'
      ? t('game.gridlock.previewCountdown', 'Study the board. Starts in {{seconds}}s.', {
          seconds: previewSeconds,
        })
      : statusMessage
    : null;

  // -------------------------------------------------------------------------
  // Render: Finished screen
  // -------------------------------------------------------------------------

  if (phase === 'finished' && summary) {
    if (!completionResult?.report) {
      return (
        <div className="game-page-center px-4">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-woven-border bg-woven-surface px-5 py-4 text-center shadow-sm">
            <Spinner size={18} className="text-woven-text-muted" />
            <span className="text-sm font-semibold text-woven-text">
              {t('common.loading', 'Loading...')}
            </span>
            <span className="text-[11px] leading-none text-woven-text-muted">
              {t('stats.report.loadingReport', 'Loading report...')}
            </span>
          </div>
        </div>
      );
    }

    if (stableReportRef.current?.sessionId !== completionResult.report.sessionId) {
      stableReportRef.current = {
        sessionId: completionResult.report.sessionId,
        report: completionResult.report,
      };
    }

    const stableReport = stableReportRef.current.report;
    const contextMessage = translateContextualMessage(
      t,
      generateContextualMessageData(stableReport, {
        style: 'simple',
        variant: 'stable',
      }),
    );

    return (
      <div className="game-report-scroll">
        <div className="relative space-y-6 px-0 pt-0 pb-8 md:px-4 md:py-8">
          <UnifiedSessionReport
            data={stableReport}
            message={contextMessage}
            labels={{
              ...unifiedReportLabels,
              modeScoreLabel: t(stableReport.modeScore.labelKey),
              modeScoreTooltip: stableReport.modeScore.tooltipKey
                ? t(stableReport.modeScore.tooltipKey)
                : undefined,
            }}
            xpData={{
              xpBreakdown: completionResult.xpBreakdown,
              leveledUp: completionResult.leveledUp,
              newLevel: completionResult.newLevel,
              newBadges: completionResult.newBadges,
            }}
            onPlayAgain={async () => {
              track('report_action_clicked', buildReportActionPayload(stableReport, 'play_again'));
              await maybeShowAd();
              handleRestart();
            }}
            onBackToHome={async () => {
              track('report_action_clicked', buildReportActionPayload(stableReport, 'home'));
              await maybeShowAd();
              window.history.back();
            }}
            onGoToStats={(report) => {
              track('report_action_clicked', buildReportActionPayload(report, 'go_to_stats'));
              const preset = getStatsPresetForReport(report);
              setStatsTab(preset.tab);
              setStatsMode(preset.mode);
              setStatsJourneyFilter(preset.journeyFilter);
              navigate('/stats');
            }}
            showFloatingCloseButton
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Game
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 page-inset-bottom flex-col overflow-hidden overscroll-none bg-woven-bg">
      <CognitiveTaskHUD
        label={t('settings.gameMode.gridlock', 'Gridlock')}
        trialIndex={puzzleIndex}
        totalTrials={totalPuzzles}
        showProgressBar={!hideHudProgressBar}
        isPaused={isPaused}
        canPause={canPauseNow}
        onTogglePause={handleTogglePause}
        onQuit={handleQuitClick}
        settingsMenuTitle={t('settings.gameMode.gridlock', 'Gridlock')}
        settingsMenuContent={
          <div className="divide-y divide-border/60">
            <SettingRow
              label={t('settings.gridlock.assistance', 'Assistance level')}
              description={t(
                'settings.gridlock.quickAssistanceDesc',
                'Immediately adjusts the amount of help available during solving.',
              )}
            >
              <Select
                value={gridlockAssistance}
                onValueChange={(value) =>
                  setModeSettingFor('gridlock', 'gridlockAssistance', value as GridlockAssistance)
                }
              >
                <SelectTrigger className="h-10 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generous">
                    {t('settings.gridlock.assistanceGenerous', 'Generous')}
                  </SelectItem>
                  <SelectItem value="balanced">
                    {t('settings.gridlock.assistanceBalanced', 'Balanced')}
                  </SelectItem>
                  <SelectItem value="strict">
                    {t('settings.gridlock.assistanceStrict', 'Strict')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <Toggle
              label={t('settings.gridlock.showMoveCounter', 'Show move counter')}
              description={t(
                'settings.gridlock.quickShowMoveCounterDesc',
                'Shows or hides the move counter during play.',
              )}
              checked={gridlockShowMoveCounter}
              onChange={(enabled) =>
                setModeSettingFor('gridlock', 'gridlockShowMoveCounter', enabled)
              }
            />

            <Toggle
              label={t('settings.gridlock.showOptimal', 'Show optimal moves')}
              description={t(
                'settings.gridlock.quickShowOptimalDesc',
                'Shows or hides the optimal move count for the current puzzle.',
              )}
              checked={gridlockShowOptimal}
              onChange={(enabled) => setModeSettingFor('gridlock', 'gridlockShowOptimal', enabled)}
            />

            <Toggle
              label={t('settings.gridlock.autoAdvance', 'Auto-advance')}
              description={t(
                'settings.gridlock.quickAutoAdvanceDesc',
                'Automatically goes to the next puzzle after solving.',
              )}
              checked={gridlockAutoAdvance}
              onChange={(enabled) => setModeSettingFor('gridlock', 'gridlockAutoAdvance', enabled)}
            />

            <Toggle
              label={t('settings.gridlock.showSolution', 'Show solution on fail')}
              description={t(
                'settings.gridlock.quickShowSolutionDesc',
                'Shows the optimal solution after failure or exceeding budget.',
              )}
              checked={gridlockShowSolutionOnFail}
              onChange={(enabled) =>
                setModeSettingFor('gridlock', 'gridlockShowSolutionOnFail', enabled)
              }
            />
          </div>
        }
      />

      {/* Puzzle info bar */}
      {currentConfig && (
        <div
          className={cn(
            'mx-auto grid w-full max-w-[24rem] gap-[clamp(0.3rem,0.8vw,0.45rem)] px-4 pt-[clamp(0.4rem,1.2vh,0.8rem)] pb-0 text-center sm:max-w-[30rem]',
            gridlockShowOptimal && gridlockShowMoveCounter
              ? 'grid-cols-3'
              : gridlockShowOptimal || gridlockShowMoveCounter
                ? 'grid-cols-2'
                : 'grid-cols-1',
          )}
        >
          <div
            className="rounded-xl border border-woven-border bg-woven-surface px-2 py-[clamp(0.35rem,0.9vh,0.55rem)]"
            data-capture-surface="game-card"
          >
            <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
              {t('game.gridlock.challenge', 'Challenge')}
            </p>
            <p className="mt-1 text-xs font-bold text-woven-text">
              {t(
                (
                  {
                    classic: 'game.gridlock.challengeClassic',
                    precision: 'game.gridlock.challengePrecision',
                    memory: 'game.gridlock.challengeMemory',
                    timed: 'game.gridlock.challengeTimed',
                  } as const
                )[currentConfig.challenge],
                currentConfig.challenge,
              )}
            </p>
          </div>
          {gridlockShowOptimal && (
            <div
              className="rounded-xl border border-woven-border bg-woven-surface px-2 py-[clamp(0.35rem,0.9vh,0.55rem)]"
              data-capture-surface="game-card"
            >
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.gridlock.optimal', 'Optimal')}
              </p>
              <p className="mt-1 text-xs font-bold tabular-nums text-woven-text">
                {currentConfig.puzzle.optimalMoves}
              </p>
            </div>
          )}
          {gridlockShowMoveCounter && (
            <div
              className="rounded-xl border border-woven-border bg-woven-surface px-2 py-[clamp(0.35rem,0.9vh,0.55rem)]"
              data-capture-surface="game-card"
            >
              <p className="text-[10px] uppercase tracking-wide text-woven-text-muted">
                {t('game.gridlock.moves', 'Moves')}
              </p>
              <p className="mt-1 text-xs font-bold tabular-nums text-woven-text">
                {moveCount} / {currentConfig.moveBudget}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feedback area — fixed height to avoid layout shift */}
      <div className="h-[clamp(1.4rem,3.5vh,2rem)] px-4 text-center flex items-center justify-center">
        {feedbackText ? (
          <p
            className={cn(
              'text-sm font-medium transition-colors',
              phase === 'preview'
                ? 'text-primary'
                : statusMessage?.startsWith('Optimal')
                  ? 'text-woven-correct'
                  : statusMessage?.startsWith('Hint')
                    ? 'text-woven-amber'
                    : 'text-woven-text-muted',
            )}
          >
            {feedbackText}
          </p>
        ) : null}
      </div>

      {/* Main game area — grid + buttons grouped together, upper portion on mobile, centered on desktop */}
      <div className="flex flex-1 min-h-0 flex-col items-center justify-start gap-[clamp(0.5rem,1.5vh,1rem)] px-4 pt-[clamp(0.5rem,2vh,1.5rem)] page-inset-bottom md:justify-center md:gap-5 md:px-6 md:pt-0 md:pb-6">
        {/* Grid */}
        {currentConfig && (
          <div className="relative w-full max-w-[320px] sm:max-w-[380px] md:max-w-[400px]">
            <div
              ref={gridContainerRef}
              className="relative aspect-square w-full overflow-hidden rounded-2xl border border-woven-border bg-woven-surface"
              data-capture-surface="game-board"
              style={{ touchAction: 'none' }}
            >
              <CanvasWeave opacity={0.06} className="stroke-neutral-400" />

              {/* Grid lines */}
              <div className="absolute inset-0 z-[1]">
                {Array.from({ length: BOARD_SIZE - 1 }, (_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute left-0 right-0 border-t border-woven-border/30"
                    style={{ top: `${((i + 1) / BOARD_SIZE) * 100}%` }}
                  />
                ))}
                {Array.from({ length: BOARD_SIZE - 1 }, (_, i) => (
                  <div
                    key={`v-${i}`}
                    className="absolute top-0 bottom-0 border-l border-woven-border/30"
                    style={{ left: `${((i + 1) / BOARD_SIZE) * 100}%` }}
                  />
                ))}
              </div>

              {/* Wall cells */}
              <div className="absolute inset-0 z-[3]">
                {Array.from(board.walls).map((wallIdx) => {
                  const row = Math.floor(wallIdx / BOARD_SIZE);
                  const col = wallIdx % BOARD_SIZE;
                  const cellPercent = 100 / BOARD_SIZE;
                  return (
                    <div
                      key={wallIdx}
                      className="absolute rounded-sm bg-woven-text/10"
                      style={{
                        left: `calc(${col * cellPercent}% + 2px)`,
                        top: `calc(${row * cellPercent}% + 2px)`,
                        width: `calc(${cellPercent}% - 4px)`,
                        height: `calc(${cellPercent}% - 4px)`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Pieces */}
              <div className="absolute inset-0 z-[5]">
                {board.pieces.map((piece) => {
                  const isDragging = dragState?.pieceId === piece.id;
                  const isHinted = hintMove?.pieceId === piece.id;
                  const color = getPieceColor(piece.id);
                  const cellPercent = 100 / BOARD_SIZE;

                  let displayCol = piece.col;
                  let displayRow = piece.row;

                  if (isDragging && dragState) {
                    if (piece.orientation === 'H') {
                      displayCol += dragState.cellDelta;
                    } else {
                      displayRow += dragState.cellDelta;
                    }
                  }

                  const widthCells = piece.orientation === 'H' ? piece.length : 1;
                  const heightCells = piece.orientation === 'V' ? piece.length : 1;
                  const padding = 3;

                  return (
                    <div
                      key={piece.id}
                      role="button"
                      tabIndex={-1}
                      aria-label={
                        piece.isTarget
                          ? t('game.gridlock.targetPiece', 'Piece {{id}} (target - red car)', {
                              id: piece.id,
                            })
                          : t('game.gridlock.piece', 'Piece {{id}}', { id: piece.id })
                      }
                      className={cn(
                        'absolute select-none',
                        phase === 'playing' && !isPaused
                          ? 'cursor-grab active:cursor-grabbing'
                          : 'cursor-default',
                        isDragging && 'z-20',
                        isHinted && !isDragging && 'z-15',
                      )}
                      style={{
                        left: `${displayCol * cellPercent}%`,
                        top: `${displayRow * cellPercent}%`,
                        width: `${widthCells * cellPercent}%`,
                        height: `${heightCells * cellPercent}%`,
                        padding: `${padding}px`,
                        transition: isDragging ? 'none' : 'left 0.15s ease-out, top 0.15s ease-out',
                      }}
                      onPointerDown={(event) => handlePiecePointerDown(event, piece.id)}
                    >
                      <div
                        className={cn(
                          'flex h-full w-full items-center justify-center rounded-lg border-2 shadow-sm',
                          isDragging && 'shadow-lg ring-2 ring-white/30',
                          isHinted && !isDragging && 'ring-2 ring-yellow-400/70 animate-pulse',
                        )}
                        data-capture-surface="game-piece"
                        style={{
                          backgroundColor: color,
                          borderColor: getPieceBorderColor(piece.id),
                        }}
                      >
                        {/* Grip lines */}
                        <div
                          className={cn(
                            'flex gap-[2px]',
                            piece.orientation === 'H' ? 'flex-col' : 'flex-row',
                          )}
                        >
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="rounded-full bg-white/25"
                              style={{
                                width: piece.orientation === 'H' ? 12 : 2,
                                height: piece.orientation === 'H' ? 2 : 12,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Solved flash — above all pieces */}
              {showSolvedFlash && (
                <div className="absolute inset-0 z-[30] flex items-center justify-center bg-black/15 animate-[gridlock-solved_1.1s_ease-out_forwards]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-woven-correct shadow-lg shadow-woven-correct/30">
                    <Check size={32} weight="bold" className="text-white" />
                  </div>
                </div>
              )}
            </div>

            {/* Exit marker — fully outside the grid */}
            <div
              className="absolute z-10 flex items-center"
              style={{
                top: `${(2 / BOARD_SIZE) * 100}%`,
                left: '100%',
                width: '16px',
                height: `${(1 / BOARD_SIZE) * 100}%`,
              }}
            >
              <div
                className="flex h-full w-full items-center justify-center rounded-r-lg border-y-2 border-r-2"
                style={{
                  backgroundColor: 'hsl(var(--woven-incorrect) / 0.18)',
                  borderColor: 'hsl(var(--woven-incorrect) / 0.7)',
                }}
              >
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                  <path
                    d="M1 1L7 7L1 13"
                    stroke="hsl(var(--woven-incorrect))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons — directly below grid, no flex push */}
        {currentConfig && phase !== 'solved-waiting' && (
          <div className="grid w-full max-w-[320px] grid-cols-3 gap-[clamp(0.35rem,0.9vh,0.55rem)] sm:max-w-[380px] md:max-w-[400px] md:gap-3">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              data-capture-control="game-button"
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-full border px-3 py-[clamp(0.45rem,1.1vh,0.7rem)] text-center shadow-sm transition-all active:scale-95 [@media(max-height:820px)]:px-2.5 [@media(max-height:820px)]:py-2',
                canUndo
                  ? 'border-border bg-card text-card-foreground hover:border-primary/20 hover:bg-primary/5'
                  : 'border-woven-border/60 bg-woven-surface/50 text-woven-text-muted opacity-50',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground [@media(max-height:820px)]:h-7 [@media(max-height:820px)]:w-7">
                <ArrowCounterClockwise size={15} weight="bold" />
              </span>
              <span className="text-xs font-semibold leading-tight">
                {t('game.gridlock.undo', 'Undo')}
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums text-foreground">
                {currentConfig.undoBudget - undosUsed}/{currentConfig.undoBudget}
              </span>
            </button>
            <button
              type="button"
              disabled={!canHint}
              onClick={handleHint}
              data-capture-control="game-button"
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-full border px-3 py-[clamp(0.45rem,1.1vh,0.7rem)] text-center shadow-sm transition-all active:scale-95 [@media(max-height:820px)]:px-2.5 [@media(max-height:820px)]:py-2',
                canHint
                  ? 'border-woven-amber/25 bg-woven-amber/12 text-woven-amber'
                  : 'border-woven-border/60 bg-woven-surface/50 text-woven-text-muted opacity-50',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-woven-amber/15 text-woven-amber [@media(max-height:820px)]:h-7 [@media(max-height:820px)]:w-7">
                <Lightbulb size={15} weight="bold" />
              </span>
              <span className="text-xs font-semibold leading-tight">
                {t('game.gridlock.hint', 'Hint')}
              </span>
              <span className="rounded-full bg-woven-amber/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-woven-amber">
                {currentConfig.hintBudget - hintsUsed}/{currentConfig.hintBudget}
              </span>
            </button>
            <button
              type="button"
              disabled={!canReset}
              onClick={handleReset}
              data-capture-control="game-button"
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-full border px-3 py-[clamp(0.45rem,1.1vh,0.7rem)] text-center shadow-sm transition-all active:scale-95 [@media(max-height:820px)]:px-2.5 [@media(max-height:820px)]:py-2',
                canReset
                  ? 'border-border bg-card text-card-foreground hover:border-primary/20 hover:bg-primary/5'
                  : 'border-woven-border/60 bg-woven-surface/50 text-woven-text-muted opacity-50',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground [@media(max-height:820px)]:h-7 [@media(max-height:820px)]:w-7">
                <ArrowClockwise size={15} weight="bold" />
              </span>
              <span className="text-xs font-semibold leading-tight">
                {t('game.gridlock.reset', 'Reset')}
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tabular-nums text-foreground">
                {currentConfig.resetBudget - resetsUsed}/{currentConfig.resetBudget}
              </span>
            </button>
          </div>
        )}

        {/* Next puzzle button (manual advance) */}
        {phase === 'solved-waiting' && (
          <button
            type="button"
            onClick={() => startPuzzle(puzzleIndex + 1)}
            data-capture-control="game-button"
            className="mt-1 w-full max-w-[320px] rounded-full border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition-all hover:bg-primary/20 active:scale-95 sm:max-w-[380px] md:max-w-[400px]"
          >
            {t('gridlock.nextPuzzle', 'Next puzzle →')}
          </button>
        )}
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
        onCancel={handleQuitCancel}
        onConfirm={handleQuitConfirm}
      />
    </div>
  );
}
