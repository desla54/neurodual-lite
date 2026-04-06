import {
  GRIDLOCK_PUZZLES,
  SOUNDS,
  parseBoard,
  type GridlockBoard,
} from '@neurodual/logic';

export const BOARD_SIZE = 6;
export const GRID_POSITIONS = 8;
export const DUAL_MIX_DEFAULT_LEVEL = 2;
export const DUAL_MIX_MIN_LEVEL = 1;
export const DUAL_MIX_MAX_LEVEL = 9;
export const DUAL_MIX_DEFAULT_ROUNDS = 20;
export const DUAL_MIX_MIN_ROUNDS = 10;
export const DUAL_MIX_MAX_ROUNDS = 60;
export const DUAL_MIX_PREP_DELAY_MS = 4000;
export const NBACK_STIMULUS_MS = 500;
export const NBACK_RESPONSE_WINDOW_MS = 3000;
export const STROOP_BASE_FIXATION_MS = 400;
export const STROOP_BASE_STIMULUS_TIMEOUT_MS = 2500;
export const STROOP_FEEDBACK_MS = 300;
export const ISI_MS = 250;

export type DualMixPhase =
  | 'idle'
  | 'starting'
  | 'countdown'
  | 'nback-stimulus'
  | 'nback-response'
  | 'stroop-fixation'
  | 'stroop-stimulus'
  | 'stroop-feedback'
  | 'gridlock-move'
  | 'round-isi'
  | 'paused'
  | 'finished';

export type DualMixColorId = 'red' | 'blue' | 'green' | 'yellow';
export type DualMixStroopRule = 'ink' | 'word';

export interface NBackStimulus {
  readonly position: number;
  readonly audio: string;
  readonly type: 'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible';
}

export interface NBackResult {
  readonly isPositionTarget: boolean;
  readonly isAudioTarget: boolean;
  readonly pressedPosition: boolean;
  readonly pressedAudio: boolean;
  readonly positionCorrect: boolean;
  readonly audioCorrect: boolean;
}

export interface StroopTrial {
  readonly word: string;
  readonly inkColor: DualMixColorId;
  readonly wordColor: DualMixColorId;
  readonly congruent: boolean;
  readonly rule: DualMixStroopRule;
}

export interface StroopResult {
  readonly trial: StroopTrial;
  readonly response: DualMixColorId | null;
  readonly correct: boolean;
  readonly rt: number;
  readonly timedOut: boolean;
}

export interface StroopTiming {
  readonly fixationMs: number;
  readonly stimulusTimeoutMs: number;
}

export interface DualMixSummary {
  readonly nbackAcc: number;
  readonly nPosCorrect: number;
  readonly nAudCorrect: number;
  readonly nTotal: number;
  readonly stroopAcc: number;
  readonly stroopCorrect: number;
  readonly stroopAvgRT: number;
  readonly gridlockMoves: number;
  readonly gridlockSolved: number;
  readonly gridlockScore: number | null;
  readonly overallScore: number;
  readonly durationMs: number;
  readonly correctUnits: number;
  readonly totalUnits: number;
}

export const DUAL_MIX_COLOR_IDS: readonly DualMixColorId[] = ['red', 'blue', 'green', 'yellow'];

export function deriveStroopTiming(nLevel: number): StroopTiming {
  const levelOffset = Math.max(0, nLevel - 1);
  return {
    fixationMs: Math.max(250, STROOP_BASE_FIXATION_MS - levelOffset * 20),
    stimulusTimeoutMs: Math.max(1000, STROOP_BASE_STIMULUS_TIMEOUT_MS - levelOffset * 150),
  };
}

export function getPerformanceBand(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: 'Strong', tone: 'text-woven-correct' };
  if (score >= 70) return { label: 'Solid', tone: 'text-woven-amber' };
  return { label: 'Needs work', tone: 'text-woven-incorrect' };
}

function shuffleInPlace<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
  return values;
}

function buildClassicDistribution(rounds: number): NBackStimulus['type'][] {
  if (rounds === 20) {
    return shuffleInPlace([
      'V-Seul',
      'V-Seul',
      'V-Seul',
      'V-Seul',
      'A-Seul',
      'A-Seul',
      'A-Seul',
      'A-Seul',
      'Dual',
      'Dual',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
    ]);
  }

  const visualOnly = Math.max(1, Math.round(0.2 * rounds));
  const audioOnly = Math.max(1, Math.round(0.2 * rounds));
  const dual = Math.max(1, Math.round(0.1 * rounds));
  const nonTarget = Math.max(0, rounds - visualOnly - audioOnly - dual);
  const distribution: NBackStimulus['type'][] = [];

  for (let index = 0; index < visualOnly; index++) distribution.push('V-Seul');
  for (let index = 0; index < audioOnly; index++) distribution.push('A-Seul');
  for (let index = 0; index < dual; index++) distribution.push('Dual');
  for (let index = 0; index < nonTarget; index++) distribution.push('Non-Cible');

  return shuffleInPlace(distribution);
}

function randomPositionExcluding(excluded: number): number {
  let value = Math.floor(Math.random() * GRID_POSITIONS);
  if (value === excluded) {
    value = (value + 1 + Math.floor(Math.random() * (GRID_POSITIONS - 1))) % GRID_POSITIONS;
  }
  return value;
}

function randomSoundExcluding(excluded: string): string {
  let value = SOUNDS[Math.floor(Math.random() * SOUNDS.length)]!;
  if (value === excluded) {
    const excludedIndex = SOUNDS.indexOf(excluded as (typeof SOUNDS)[number]);
    value = SOUNDS[(excludedIndex + 1 + Math.floor(Math.random() * (SOUNDS.length - 1))) % SOUNDS.length]!;
  }
  return value;
}

export function generateNBackSequence(rounds: number, nLevel: number): NBackStimulus[] {
  const sequence: NBackStimulus[] = [];

  for (let index = 0; index < nLevel; index++) {
    sequence.push({
      position: Math.floor(Math.random() * GRID_POSITIONS),
      audio: SOUNDS[Math.floor(Math.random() * SOUNDS.length)]!,
      type: 'Non-Cible',
    });
  }

  const distribution = buildClassicDistribution(rounds);

  for (let roundIndex = 0; roundIndex < distribution.length; roundIndex++) {
    const absoluteIndex = nLevel + roundIndex;
    const nBackStimulus = sequence[absoluteIndex - nLevel]!;
    const type = distribution[roundIndex]!;
    const isPositionTarget = type === 'V-Seul' || type === 'Dual';
    const isAudioTarget = type === 'A-Seul' || type === 'Dual';

    sequence.push({
      position: isPositionTarget
        ? nBackStimulus.position
        : randomPositionExcluding(nBackStimulus.position),
      audio: isAudioTarget ? nBackStimulus.audio : randomSoundExcluding(nBackStimulus.audio),
      type,
    });
  }

  return sequence;
}

export function generateStroopTrials(
  count: number,
  colors: readonly { id: DualMixColorId; word: string }[],
): StroopTrial[] {
  const baseTrials: Omit<StroopTrial, 'rule'>[] = [];
  const half = Math.floor(count / 2);

  for (let index = 0; index < half; index++) {
    const color = colors[index % colors.length]!;
    baseTrials.push({
      word: color.word,
      inkColor: color.id,
      wordColor: color.id,
      congruent: true,
    });
  }

  for (let index = 0; index < count - half; index++) {
    const wordIndex = index % colors.length;
    let inkIndex = (wordIndex + 1 + (index % (colors.length - 1))) % colors.length;
    if (inkIndex === wordIndex) inkIndex = (inkIndex + 1) % colors.length;
    baseTrials.push({
      word: colors[wordIndex]!.word,
      inkColor: colors[inkIndex]!.id,
      wordColor: colors[wordIndex]!.id,
      congruent: false,
    });
  }

  for (let index = baseTrials.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [baseTrials[index], baseTrials[swapIndex]] = [baseTrials[swapIndex]!, baseTrials[index]!];
  }

  return baseTrials.map((trial, index) => ({
    ...trial,
    rule: (index % 4 === 0 ? 'word' : 'ink') as DualMixStroopRule,
  }));
}

export function pickRandomPuzzle(): GridlockBoard {
  const puzzle = GRIDLOCK_PUZZLES[Math.floor(Math.random() * GRIDLOCK_PUZZLES.length)]!;
  return parseBoard(puzzle.boardStr);
}

export function buildDualMixSummary(input: {
  readonly nbackResults: readonly NBackResult[];
  readonly stroopResults: readonly StroopResult[];
  readonly includeGridlock: boolean;
  readonly gridlockPuzzlesSolved: number;
  readonly gridlockTotalMoves: number;
  readonly totalRounds: number;
  readonly durationMs: number;
}): DualMixSummary {
  const nPosCorrect = input.nbackResults.filter((result) => result.positionCorrect).length;
  const nAudCorrect = input.nbackResults.filter((result) => result.audioCorrect).length;
  const nTotal = input.nbackResults.length;
  const nbackAcc =
    nTotal > 0 ? Math.round(((nPosCorrect + nAudCorrect) / (nTotal * 2)) * 100) : 0;

  const stroopCorrect = input.stroopResults.filter((result) => result.correct).length;
  const stroopAcc =
    input.stroopResults.length > 0
      ? Math.round((stroopCorrect / input.stroopResults.length) * 100)
      : 0;
  const stroopRTs = input.stroopResults
    .filter((result) => !result.timedOut)
    .map((result) => result.rt);
  const stroopAvgRT =
    stroopRTs.length > 0
      ? Math.round(stroopRTs.reduce((sum, value) => sum + value, 0) / stroopRTs.length)
      : 0;

  const gridlockScore = input.includeGridlock
    ? Math.min(100, input.gridlockPuzzlesSolved * 25 + Math.max(0, 30 - input.gridlockTotalMoves))
    : null;
  const overallScore = input.includeGridlock
    ? Math.round((nbackAcc + stroopAcc + (gridlockScore ?? 0)) / 3)
    : Math.round((nbackAcc + stroopAcc) / 2);
  const totalUnits = input.totalRounds * (input.includeGridlock ? 4 : 3);
  const correctUnits = Math.round((overallScore / 100) * totalUnits);

  return {
    nbackAcc,
    nPosCorrect,
    nAudCorrect,
    nTotal,
    stroopAcc,
    stroopCorrect,
    stroopAvgRT,
    gridlockMoves: input.gridlockTotalMoves,
    gridlockSolved: input.gridlockPuzzlesSolved,
    gridlockScore,
    overallScore,
    durationMs: input.durationMs,
    correctUnits,
    totalUnits,
  };
}
