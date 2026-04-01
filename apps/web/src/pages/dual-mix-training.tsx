/**
 * Dual Mix Training Page
 *
 * Composite turn-based mode cycling 3 micro-tasks per round:
 * 1. N-Back stimulus display → user responds (Position / Audio match) → presses Next
 * 2. Stroop Flex trial (fixation → stimulus → color response)
 * 3. Gridlock move (one slide per round)
 *
 * Turn-based: no auto-timers for N-Back. The user controls the pace.
 * The HUD stays permanent; only the central stage cross-fades.
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
  cn,
  CanvasWeave,
  GameControls,
  Grid,
  useMountEffect,
  WOVEN_COLORS,
  resolveThemeColor,
} from '@neurodual/ui';
import {
  parseBoard,
  applyMove,
  isWon,
  listValidMoves,
  GRIDLOCK_PUZZLES,
  SOUNDS,
  type GridlockBoard,
  type GridlockMove,
  type Sound,
} from '@neurodual/logic';
import { CognitiveTaskHUD } from '../components/game/CognitiveTaskHUD';
import { GameQuitModal } from '../components/game/game-quit-modal';
import { useHaptic } from '../hooks/use-haptic';
import { useAppPorts } from '../providers';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSettingsStore } from '../stores';

// =============================================================================
// Constants
// =============================================================================

const BOARD_SIZE = 6;
const GRID_POSITIONS = 9;
const NBACK_STIMULUS_MS = 2500; // How long position + audio are shown
const STROOP_FIXATION_MS = 400;
const STROOP_STIMULUS_TIMEOUT_MS = 2500;
const STROOP_FEEDBACK_MS = 300;
const ISI_MS = 500;

// =============================================================================
// Types
// =============================================================================

type Phase =
  | 'idle'
  | 'nback-stimulus'   // showing position + playing audio (timed)
  | 'nback-response'   // grid empty, user responds + presses Next
  | 'stroop-fixation'
  | 'stroop-stimulus'
  | 'stroop-feedback'
  | 'gridlock-move'
  | 'round-isi'
  | 'paused'
  | 'finished';

type ColorId = 'red' | 'blue' | 'green' | 'yellow';
type StroopRule = 'ink' | 'word';

interface NBackStimulus {
  position: number;
  audio: string;
}

interface NBackResult {
  isPositionTarget: boolean;
  isAudioTarget: boolean;
  pressedPosition: boolean;
  pressedAudio: boolean;
  positionCorrect: boolean;
  audioCorrect: boolean;
}

interface StroopTrial {
  word: string;
  inkColor: ColorId;
  wordColor: ColorId;
  congruent: boolean;
  rule: StroopRule;
}

interface StroopResult {
  trial: StroopTrial;
  response: ColorId | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
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

// =============================================================================
// N-Back Sequence Generator
// =============================================================================

function generateNBackSequence(length: number, nLevel: number): NBackStimulus[] {
  const seq: NBackStimulus[] = [];
  const matchRate = 0.33;

  for (let i = 0; i < length; i++) {
    let pos: number;
    let audio: string;

    if (i >= nLevel && Math.random() < matchRate) {
      pos = seq[i - nLevel]!.position;
    } else {
      pos = Math.floor(Math.random() * GRID_POSITIONS);
      if (i >= nLevel && pos === seq[i - nLevel]!.position) {
        pos = (pos + 1 + Math.floor(Math.random() * (GRID_POSITIONS - 1))) % GRID_POSITIONS;
      }
    }

    if (i >= nLevel && Math.random() < matchRate) {
      audio = seq[i - nLevel]!.audio;
    } else {
      audio = SOUNDS[Math.floor(Math.random() * SOUNDS.length)]!;
      if (i >= nLevel && audio === seq[i - nLevel]!.audio) {
        const idx = SOUNDS.indexOf(audio as typeof SOUNDS[number]);
        audio = SOUNDS[(idx + 1) % SOUNDS.length]!;
      }
    }

    seq.push({ position: pos, audio });
  }
  return seq;
}

// =============================================================================
// Stroop Trial Generator
// =============================================================================

const COLOR_IDS: ColorId[] = ['red', 'blue', 'green', 'yellow'];

function generateStroopTrials(count: number, colors: { id: ColorId; word: string }[]): StroopTrial[] {
  const baseTrials: Omit<StroopTrial, 'rule'>[] = [];
  const half = Math.floor(count / 2);

  for (let i = 0; i < half; i++) {
    const c = colors[i % colors.length]!;
    baseTrials.push({ word: c.word, inkColor: c.id, wordColor: c.id, congruent: true });
  }
  for (let i = 0; i < count - half; i++) {
    const wordIdx = i % colors.length;
    let inkIdx = (wordIdx + 1 + (i % (colors.length - 1))) % colors.length;
    if (inkIdx === wordIdx) inkIdx = (inkIdx + 1) % colors.length;
    baseTrials.push({
      word: colors[wordIdx]!.word,
      inkColor: colors[inkIdx]!.id,
      wordColor: colors[wordIdx]!.id,
      congruent: false,
    });
  }
  for (let i = baseTrials.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [baseTrials[i], baseTrials[j]] = [baseTrials[j]!, baseTrials[i]!];
  }
  return baseTrials.map((trial, index) => ({
    ...trial,
    rule: (index % 4 === 0 ? 'word' : 'ink') as StroopRule,
  }));
}

// =============================================================================
// Gridlock Helpers
// =============================================================================

const PIECE_CSS_VARS: Record<string, string> = {
  A: '--woven-incorrect', B: '--woven-blue', C: '--woven-correct',
  D: '--woven-amber', E: '--woven-purple', F: '--woven-cyan',
  G: '--woven-magenta', H: '--woven-orange', I: '--woven-blue',
  J: '--woven-purple', K: '--woven-correct', L: '--woven-amber',
};

function getPieceColor(id: string): string {
  return `hsl(var(${PIECE_CSS_VARS[id] ?? '--woven-gray'}))`;
}
function getPieceBorderColor(id: string): string {
  return `hsl(var(${PIECE_CSS_VARS[id] ?? '--woven-gray'}) / 0.7)`;
}

function computeDeltaRange(board: GridlockBoard, pieceId: string) {
  const validMoves = listValidMoves(board);
  let minDelta = 0, maxDelta = 0;
  for (const move of validMoves) {
    if (move.pieceId === pieceId) {
      if (move.delta < minDelta) minDelta = move.delta;
      if (move.delta > maxDelta) maxDelta = move.delta;
    }
  }
  return { minDelta, maxDelta };
}

function pickRandomPuzzle(): GridlockBoard {
  const puzzle = GRIDLOCK_PUZZLES[Math.floor(Math.random() * GRIDLOCK_PUZZLES.length)]!;
  return parseBoard(puzzle.boardStr);
}

// =============================================================================
// Component
// =============================================================================

export function DualMixTrainingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const { audio } = useAppPorts();
  const colorModalityTheme = useSettingsStore((s) => s.ui.colorModalityTheme);

  const modeSettings = useSettingsStore((s) => s.modes['dual-mix'] as Record<string, unknown> | undefined) ?? {};
  const nLevel = typeof (modeSettings as any).nLevel === 'number' ? (modeSettings as any).nLevel : 2;
  const totalRounds = typeof (modeSettings as any).trialsCount === 'number'
    ? Math.max(5, Math.min(30, (modeSettings as any).trialsCount)) : 10;

  const COLORS = useMemo(
    () => COLOR_IDS.map((id) => {
      const resolved = resolveThemeColor(id, colorModalityTheme);
      return {
        id, cssVar: WOVEN_COLORS[resolved].cssVar, twClass: WOVEN_COLORS[resolved].bg,
        word: t(`game.cogTask.stroop.${id}Word`), label: t(`game.cogTask.stroop.${id}Label`),
      };
    }),
    [t, colorModalityTheme],
  );

  // --- State ---
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [runSeed, setRunSeed] = useState(0);
  const [showQuitModal, setShowQuitModal] = useState(false);

  // N-Back
  const nbackSeqRef = useRef<NBackStimulus[]>([]);
  const [nbackResults, setNbackResults] = useState<NBackResult[]>([]);
  const [pressedPosition, setPressedPosition] = useState(false);
  const [pressedAudio, setPressedAudio] = useState(false);

  // Stroop
  const stroopTrialsRef = useRef<StroopTrial[]>([]);
  const [stroopResults, setStroopResults] = useState<StroopResult[]>([]);
  const [lastStroopFeedback, setLastStroopFeedback] = useState<boolean | null>(null);
  const stroopRespondedRef = useRef(false);
  const stroopStimulusStartRef = useRef(0);

  // Gridlock
  const [gridlockBoard, setGridlockBoard] = useState<GridlockBoard>(() => pickRandomPuzzle());
  const [gridlockPuzzlesSolved, setGridlockPuzzlesSolved] = useState(0);
  const [gridlockTotalMoves, setGridlockTotalMoves] = useState(0);
  const gridlockMoveAllowedRef = useRef(false);

  // Timer (only for stroop auto-phases)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartMsRef = useRef(0);
  const startedSeedRef = useRef<number | null>(null);

  // Drag state for gridlock
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  // Fade key
  const [fadeKey, setFadeKey] = useState(0);

  useMountEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // --- N-Back: show stimulus (timed) → response phase (manual advance) ---
  const startNBackStimulus = useCallback((r: number) => {
    setPressedPosition(false);
    setPressedAudio(false);
    setFadeKey((k) => k + 1);
    setPhase('nback-stimulus');

    // Play audio letter
    const seq = nbackSeqRef.current;
    const stimulus = seq[r + nLevel];
    if (stimulus) {
      audio.play(stimulus.audio as Sound);
    }

    // After stimulus duration, switch to response phase (grid blank)
    timerRef.current = setTimeout(() => {
      setPhase('nback-response');
    }, NBACK_STIMULUS_MS);
  }, [nLevel, audio]);

  // User presses "Next" after responding to N-Back
  const handleNBackNext = useCallback(() => {
    if (phase !== 'nback-response') return;
    clearTimer();
    const seq = nbackSeqRef.current;
    const idx = round + nLevel;
    const isPositionTarget = idx >= nLevel && seq[idx]!.position === seq[round]!.position;
    const isAudioTarget = idx >= nLevel && seq[idx]!.audio === seq[round]!.audio;
    setNbackResults((prev) => [...prev, {
      isPositionTarget, isAudioTarget,
      pressedPosition, pressedAudio,
      positionCorrect: pressedPosition === isPositionTarget,
      audioCorrect: pressedAudio === isAudioTarget,
    }]);
    startStroopFixation(round);
  }, [phase, round, nLevel, pressedPosition, pressedAudio, clearTimer]);

  // --- Stroop (auto-timed) ---
  const startStroopFixation = useCallback((r: number) => {
    stroopRespondedRef.current = false;
    setFadeKey((k) => k + 1);
    setPhase('stroop-fixation');
    timerRef.current = setTimeout(() => {
      setPhase('stroop-stimulus');
      stroopStimulusStartRef.current = performance.now();
      timerRef.current = setTimeout(() => {
        if (!stroopRespondedRef.current) {
          stroopRespondedRef.current = true;
          const trial = stroopTrialsRef.current[r];
          if (trial) {
            setStroopResults((prev) => [...prev, { trial, response: null, correct: false, rt: STROOP_STIMULUS_TIMEOUT_MS, timedOut: true }]);
          }
          setLastStroopFeedback(false);
          setPhase('stroop-feedback');
          timerRef.current = setTimeout(() => startGridlockMove(), STROOP_FEEDBACK_MS);
        }
      }, STROOP_STIMULUS_TIMEOUT_MS);
    }, STROOP_FIXATION_MS);
  }, []);

  const startGridlockMove = useCallback(() => {
    gridlockMoveAllowedRef.current = true;
    setFadeKey((k) => k + 1);
    setPhase('gridlock-move');
  }, []);

  const advanceAfterGridlock = useCallback((r: number) => {
    setPhase('round-isi');
    timerRef.current = setTimeout(() => {
      const next = r + 1;
      if (next >= totalRounds) { setPhase('finished'); }
      else { setRound(next); startNBackStimulus(next); }
    }, ISI_MS);
  }, [totalRounds, startNBackStimulus]);

  // --- Initialize ---
  useEffect(() => {
    if (startedSeedRef.current === runSeed) return;
    startedSeedRef.current = runSeed;
    sessionStartMsRef.current = Date.now();
    nbackSeqRef.current = generateNBackSequence(totalRounds + nLevel, nLevel);
    stroopTrialsRef.current = generateStroopTrials(totalRounds, COLORS);
    setRound(0);
    setNbackResults([]);
    setStroopResults([]);
    setGridlockBoard(pickRandomPuzzle());
    setGridlockPuzzlesSolved(0);
    setGridlockTotalMoves(0);
    startNBackStimulus(0);
  }, [runSeed, totalRounds, nLevel, COLORS, startNBackStimulus]);

  // --- N-Back toggle handlers (active during both stimulus and response) ---
  const nbackActive = phase === 'nback-stimulus' || phase === 'nback-response';

  const handlePositionMatch = useCallback(() => {
    if (!nbackActive) return;
    haptic.vibrate(30);
    setPressedPosition((v) => !v);
  }, [nbackActive, haptic]);

  const handleAudioMatch = useCallback(() => {
    if (!nbackActive) return;
    haptic.vibrate(30);
    setPressedAudio((v) => !v);
  }, [nbackActive, haptic]);

  // --- Stroop response ---
  const handleStroopResponse = useCallback((colorId: ColorId) => {
    if (phase !== 'stroop-stimulus' || stroopRespondedRef.current) return;
    stroopRespondedRef.current = true;
    haptic.vibrate(30);
    clearTimer();
    const rt = performance.now() - stroopStimulusStartRef.current;
    const trial = stroopTrialsRef.current[round];
    if (!trial) return;
    const expected = trial.rule === 'ink' ? trial.inkColor : trial.wordColor;
    const correct = colorId === expected;
    setStroopResults((prev) => [...prev, { trial, response: colorId, correct, rt, timedOut: false }]);
    setLastStroopFeedback(correct);
    setPhase('stroop-feedback');
    timerRef.current = setTimeout(() => startGridlockMove(), STROOP_FEEDBACK_MS);
  }, [phase, round, haptic, clearTimer, startGridlockMove]);

  // --- Gridlock move ---
  const handleGridlockMove = useCallback((move: GridlockMove) => {
    if (!gridlockMoveAllowedRef.current) return;
    gridlockMoveAllowedRef.current = false;
    const newBoard = applyMove(gridlockBoard, move);
    if (!newBoard) return;
    setGridlockTotalMoves((n) => n + 1);
    setGridlockBoard(newBoard);
    if (isWon(newBoard)) {
      setGridlockPuzzlesSolved((n) => n + 1);
      setTimeout(() => setGridlockBoard(pickRandomPuzzle()), 300);
    }
    advanceAfterGridlock(round);
  }, [gridlockBoard, round, advanceAfterGridlock]);

  // --- Gridlock drag (window events, same pattern as gridlock-training) ---
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;
  const gridlockBoardRef = useRef(gridlockBoard);
  gridlockBoardRef.current = gridlockBoard;

  const getCellSize = useCallback(() => {
    const container = boardContainerRef.current;
    if (!container) return 53;
    return container.clientWidth / BOARD_SIZE;
  }, []);

  const handlePiecePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, pieceId: string) => {
      if (phase !== 'gridlock-move' || !gridlockMoveAllowedRef.current || dragState) return;

      const piece = gridlockBoard.pieces.find((p) => p.id === pieceId);
      if (!piece) return;

      event.preventDefault();
      event.stopPropagation();

      const { minDelta, maxDelta } = computeDeltaRange(gridlockBoard, pieceId);
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
      haptic.vibrate(10);
    },
    [phase, gridlockBoard, dragState, haptic],
  );

  useEffect(() => {
    if (!dragState) return;
    const activePointerId = dragState.pointerId;

    const onMove = (e: PointerEvent) => {
      const d = dragStateRef.current;
      if (!d || e.pointerId !== activePointerId) return;
      const cellSize = getCellSize();
      const raw = d.orientation === 'H'
        ? (e.clientX - d.startClientX) / cellSize
        : (e.clientY - d.startClientY) / cellSize;
      const clamped = Math.max(d.minDelta, Math.min(d.maxDelta, Math.round(raw)));
      setDragState((cur) => cur ? { ...cur, cellDelta: clamped } : cur);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragStateRef.current;
      if (!d || e.pointerId !== activePointerId) return;
      const cellSize = getCellSize();
      const raw = d.orientation === 'H'
        ? (e.clientX - d.startClientX) / cellSize
        : (e.clientY - d.startClientY) / cellSize;
      const finalDelta = Math.max(d.minDelta, Math.min(d.maxDelta, Math.round(raw)));
      setDragState(null);
      if (finalDelta !== 0) {
        handleGridlockMove({ pieceId: d.pieceId, delta: finalDelta });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragState?.pointerId, getCellSize, handleGridlockMove]);

  // --- Pause ---
  const handleTogglePause = useCallback(() => {
    if (phase === 'paused') {
      startNBackStimulus(round);
    } else if (phase !== 'idle' && phase !== 'finished') {
      clearTimer();
      stroopRespondedRef.current = true;
      gridlockMoveAllowedRef.current = false;
      setPhase('paused');
    }
  }, [phase, round, clearTimer, startNBackStimulus]);

  // --- Restart ---
  const handleRestart = useCallback(() => {
    clearTimer();
    setPhase('idle');
    setRunSeed((s) => s + 1);
  }, [clearTimer]);

  // --- Summary ---
  const summary = useMemo(() => {
    if (phase !== 'finished') return null;
    const nPosCorrect = nbackResults.filter((r) => r.positionCorrect).length;
    const nAudCorrect = nbackResults.filter((r) => r.audioCorrect).length;
    const nTotal = nbackResults.length;
    const nbackAcc = nTotal > 0 ? Math.round(((nPosCorrect + nAudCorrect) / (nTotal * 2)) * 100) : 0;

    const stroopCorrect = stroopResults.filter((r) => r.correct).length;
    const stroopAcc = stroopResults.length > 0 ? Math.round((stroopCorrect / stroopResults.length) * 100) : 0;
    const stroopRTs = stroopResults.filter((r) => !r.timedOut).map((r) => r.rt);
    const stroopAvgRT = stroopRTs.length > 0 ? Math.round(stroopRTs.reduce((a, b) => a + b, 0) / stroopRTs.length) : 0;

    return {
      nbackAcc, nPosCorrect, nAudCorrect, nTotal,
      stroopAcc, stroopAvgRT,
      gridlockMoves: gridlockTotalMoves, gridlockSolved: gridlockPuzzlesSolved,
      durationMs: Date.now() - sessionStartMsRef.current,
    };
  }, [phase, nbackResults, stroopResults, gridlockTotalMoves, gridlockPuzzlesSolved]);

  // --- Current data ---
  const currentStimulus = nbackSeqRef.current[round + nLevel];
  const currentStroopTrial = stroopTrialsRef.current[round];
  const inkCss = currentStroopTrial
    ? `hsl(${COLORS.find((c) => c.id === currentStroopTrial.inkColor)?.cssVar})`
    : undefined;
  const ruleLabel = currentStroopTrial?.rule === 'word'
    ? t('game.cogTask.stroopFlex.ruleWord') : t('game.cogTask.stroopFlex.ruleInk');

  const microTaskLabel =
    (phase === 'nback-stimulus' || phase === 'nback-response') ? `N-Back (N-${nLevel})` :
    phase.startsWith('stroop') ? 'Stroop Flex' :
    phase === 'gridlock-move' ? 'Gridlock' : null;

  const progressIndex = phase === 'finished' ? totalRounds * 3 : round * 3 + (
    (phase === 'nback-stimulus' || phase === 'nback-response') ? 0 :
    phase.startsWith('stroop') ? 1 :
    phase === 'gridlock-move' ? 2 : 0
  );

  // --- Render: Finished ---
  if (phase === 'finished' && summary) {
    return (
      <div className="game-page-shell">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-8">
          <h1 className="text-2xl font-bold text-foreground">Dual Mix</h1>
          <p className="text-sm text-muted-foreground">
            {totalRounds} rounds · N-{nLevel} · {Math.round(summary.durationMs / 1000)}s
          </p>
          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-xl border border-border/50 bg-card/80 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">N-Back</h3>
              <div className="flex justify-between"><span className="text-sm">Position</span><span className="text-sm font-mono font-bold">{summary.nPosCorrect}/{summary.nTotal}</span></div>
              <div className="flex justify-between"><span className="text-sm">Audio</span><span className="text-sm font-mono font-bold">{summary.nAudCorrect}/{summary.nTotal}</span></div>
              <div className="flex justify-between mt-1 pt-1 border-t border-border/30"><span className="text-sm font-semibold">Combined</span><span className="text-sm font-mono font-bold">{summary.nbackAcc}%</span></div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/80 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Stroop Flex</h3>
              <div className="flex justify-between"><span className="text-sm">Accuracy</span><span className="text-sm font-mono font-bold">{summary.stroopAcc}%</span></div>
              <div className="flex justify-between"><span className="text-sm">Mean RT</span><span className="text-sm font-mono font-bold">{summary.stroopAvgRT} ms</span></div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/80 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Gridlock</h3>
              <div className="flex justify-between"><span className="text-sm">Moves</span><span className="text-sm font-mono font-bold">{summary.gridlockMoves}</span></div>
              <div className="flex justify-between"><span className="text-sm">Puzzles solved</span><span className="text-sm font-mono font-bold">{summary.gridlockSolved}</span></div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={handleRestart} className="rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background active:scale-95 transition-transform">
              {t('game.report.playAgain', 'Play Again')}
            </button>
            <button type="button" onClick={() => navigate('/')} className="rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground active:scale-95 transition-transform">
              {t('game.report.backHome', 'Home')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Playing ---
  return (
    <div className="game-page-shell">
      <CognitiveTaskHUD
        trialIndex={progressIndex}
        totalTrials={totalRounds * 3}
        onQuit={() => setShowQuitModal(true)}
        isPaused={phase === 'paused'}
        canPause={phase !== 'idle' && phase !== 'finished'}
        onTogglePause={handleTogglePause}
      />

      {/* Micro-task indicator */}
      <div className="min-h-[clamp(1.1rem,3vh,1.8rem)] px-4 py-[clamp(0.1rem,0.45vh,0.35rem)] text-center">
        {microTaskLabel && (
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{microTaskLabel}</span>
            <span className="text-xs text-muted-foreground/60 font-mono">{round + 1}/{totalRounds}</span>
          </div>
        )}
      </div>

      {/* Central stage */}
      <div className="game-page-stage">
        <div
          key={fadeKey}
          className="relative flex aspect-square w-full max-w-[360px] items-center justify-center rounded-2xl border border-white/18 bg-woven-surface/52 shadow-[0_24px_60px_hsl(var(--foreground)/0.10)] backdrop-blur-2xl sm:max-w-[420px] animate-in fade-in duration-200"
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.40),hsl(var(--background)/0.18))]" />
          <CanvasWeave opacity={0.15} className="stroke-neutral-400" />

          <div className="relative z-10 flex h-full w-full items-center justify-center">
            {/* ═══ N-Back Stimulus (timed: shows position) ═══ */}
            {phase === 'nback-stimulus' && currentStimulus && (
              <Grid
                activePosition={currentStimulus.position}
                showStimulus
                className="w-full h-full"
              />
            )}

            {/* ═══ N-Back Response (grid blank, user responds + Next) ═══ */}
            {phase === 'nback-response' && (
              <Grid
                activePosition={null}
                showStimulus={false}
                className="w-full h-full"
              />
            )}

            {/* ═══ Stroop ═══ */}
            {phase === 'stroop-fixation' && (
              <span className="select-none text-4xl font-bold text-woven-text-muted">+</span>
            )}
            {phase === 'stroop-stimulus' && currentStroopTrial && (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                <div className="rounded-full border border-woven-border/70 bg-woven-bg/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-woven-text-muted">
                  {t('game.cogTask.stroopFlex.followRule')}: {ruleLabel}
                </div>
                <span className="select-none text-5xl font-black tracking-tight sm:text-6xl" style={{ color: inkCss }}>
                  {currentStroopTrial.word}
                </span>
              </div>
            )}
            {phase === 'stroop-feedback' && (
              <span className={cn('select-none text-3xl font-black', lastStroopFeedback ? 'text-woven-correct' : 'text-woven-incorrect')}>
                {lastStroopFeedback ? t('game.cogTask.feedbackCorrect') : t('game.cogTask.feedbackIncorrect')}
              </span>
            )}

            {/* ═══ Gridlock (exact copy from gridlock-training.tsx) ═══ */}
            {phase === 'gridlock-move' && (() => {
              const board = gridlockBoard;
              return (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="relative w-[85%] max-w-[320px] sm:max-w-[380px]">
                    <div
                      ref={boardContainerRef}
                      className="relative aspect-square w-full overflow-hidden rounded-2xl border border-woven-border bg-woven-surface"
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
                              className={cn(
                                'absolute select-none cursor-grab active:cursor-grabbing',
                                isDragging && 'z-20',
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
                                )}
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
                          backgroundColor: 'hsl(var(--woven-correct) / 0.18)',
                          borderColor: 'hsl(var(--woven-correct) / 0.7)',
                        }}
                      >
                        <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                          <path
                            d="M1 1L7 7L1 13"
                            stroke="hsl(var(--woven-correct))"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ISI / Paused / Idle */}
            {(phase === 'round-isi' || phase === 'idle') && (
              <span className="select-none text-sm text-woven-text-muted animate-pulse">···</span>
            )}
            {phase === 'paused' && (
              <span className="select-none text-xl font-bold uppercase tracking-wider text-woven-text-muted">
                {t('game.status.paused')}
              </span>
            )}
          </div>
        </div>

        {/* ═══ Buttons below stage ═══ */}

        {/* N-Back: Position + Audio (GameControls from classic page) + Next */}
        {(phase === 'nback-stimulus' || phase === 'nback-response') && (
          <div className="flex flex-col items-center gap-2 w-full max-w-[360px] sm:max-w-[420px] animate-in fade-in duration-200">
            <GameControls
              onVisualClick={handlePositionMatch}
              onAudioClick={handleAudioMatch}
              visualActive={pressedPosition}
              audioActive={pressedAudio}
              disabled={false}
              onHaptic={() => haptic.vibrate(30)}
            />
            {phase === 'nback-response' && (
              <button
                type="button"
                onClick={handleNBackNext}
                className="w-full py-2.5 text-sm font-medium text-muted-foreground rounded-lg border border-border/40 hover:bg-muted/30 active:scale-[0.98] transition-all touch-manipulation"
              >
                {t('common.next', 'Next')} →
              </button>
            )}
          </div>
        )}

        {/* Stroop: 4 color buttons */}
        {(phase === 'stroop-stimulus' || phase === 'stroop-fixation' || phase === 'stroop-feedback') && (
          <div className="grid w-full max-w-[360px] grid-cols-2 gap-3 sm:max-w-[420px] animate-in fade-in duration-200">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={phase !== 'stroop-stimulus'}
                onClick={() => handleStroopResponse(c.id)}
                className={cn(
                  'rounded-xl border border-white/20 py-4 text-base font-bold text-white transition-all active:scale-95 touch-manipulation',
                  c.twClass,
                  phase !== 'stroop-stimulus' ? 'opacity-40' : 'opacity-100',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <GameQuitModal
        open={showQuitModal}
        labels={{
          title: t('game.quitModal.title'),
          message: t('game.quitModal.message'),
          cancel: t('common.cancel'),
          confirm: t('game.quitModal.confirm'),
          close: t('common.close', 'Close'),
        }}
        onCancel={() => setShowQuitModal(false)}
        onConfirm={() => navigate('/')}
      />
    </div>
  );
}
