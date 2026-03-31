/**
 * Soroban Journey — Stage definitions & trial generators
 *
 * 8 progressive stages from reading numbers to multi-digit operations.
 * Each stage has specific exercise types and trial generation logic.
 */

// =============================================================================
// Types
// =============================================================================

export type SorobanExerciseType =
  | 'reading' // beads shown → user enters the number
  | 'setting' // number shown → user sets beads (recognition)
  | 'direct-add' // add without crossing 5
  | 'complement-5' // add crossing the 5 boundary
  | 'complement-10' // add crossing 10 (carry)
  | 'direct-sub' // subtract without borrowing
  | 'sub-complement' // subtract with complements
  | 'multi-digit'; // chained multi-digit operations

export interface SorobanStage {
  readonly id: number;
  readonly key: string; // i18n suffix
  readonly exerciseType: SorobanExerciseType;
  readonly rodCount: number;
  readonly trialsPerSession: number;
  readonly requiredAccuracy: number; // 0–100
}

export interface SorobanJourneyTrial {
  readonly stageId: number;
  readonly exerciseType: SorobanExerciseType;
  readonly rodCount: number;
  readonly startValue: number; // initial soroban state (0 for reading/setting)
  readonly operand: number; // number to add/subtract (0 for reading/setting)
  readonly targetValue: number; // correct answer
  readonly prompt: string; // display text e.g. "+ 3" or "42"
}

export interface SorobanJourneyTrialResult {
  readonly trial: SorobanJourneyTrial;
  readonly response: number;
  readonly correct: boolean;
  readonly rt: number;
}

function pickRandom<T>(items: readonly T[]): T {
  const item = items[randInt(0, items.length - 1)];
  if (item === undefined) {
    throw new Error('Expected non-empty items array');
  }
  return item;
}

// =============================================================================
// Stage Definitions
// =============================================================================

export const SOROBAN_STAGES: readonly SorobanStage[] = [
  {
    id: 1,
    key: 'reading',
    exerciseType: 'reading',
    rodCount: 1,
    trialsPerSession: 10,
    requiredAccuracy: 80,
  },
  {
    id: 2,
    key: 'setting',
    exerciseType: 'setting',
    rodCount: 1,
    trialsPerSession: 10,
    requiredAccuracy: 80,
  },
  {
    id: 3,
    key: 'directAdd',
    exerciseType: 'direct-add',
    rodCount: 1,
    trialsPerSession: 10,
    requiredAccuracy: 80,
  },
  {
    id: 4,
    key: 'complement5',
    exerciseType: 'complement-5',
    rodCount: 1,
    trialsPerSession: 12,
    requiredAccuracy: 75,
  },
  {
    id: 5,
    key: 'complement10',
    exerciseType: 'complement-10',
    rodCount: 2,
    trialsPerSession: 12,
    requiredAccuracy: 75,
  },
  {
    id: 6,
    key: 'directSub',
    exerciseType: 'direct-sub',
    rodCount: 1,
    trialsPerSession: 10,
    requiredAccuracy: 80,
  },
  {
    id: 7,
    key: 'subComplement',
    exerciseType: 'sub-complement',
    rodCount: 2,
    trialsPerSession: 12,
    requiredAccuracy: 75,
  },
  {
    id: 8,
    key: 'multiDigit',
    exerciseType: 'multi-digit',
    rodCount: 3,
    trialsPerSession: 10,
    requiredAccuracy: 70,
  },
] as const;

// =============================================================================
// Progress Types
// =============================================================================

export interface SorobanStageProgress {
  bestAccuracy: number;
  completed: boolean;
}

export type SorobanJourneyProgress = Record<number, SorobanStageProgress>;

export function isStageUnlocked(stageId: number, progress: SorobanJourneyProgress): boolean {
  if (stageId === 1) return true;
  const prev = progress[stageId - 1];
  return prev?.completed === true;
}

export function getJourneyCompletedCount(progress: SorobanJourneyProgress): number {
  return Object.values(progress).filter((p) => p.completed).length;
}

// =============================================================================
// Trial Generators
// =============================================================================

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function generateReadingTrials(count: number): SorobanJourneyTrial[] {
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const target = randInt(0, 9);
    trials.push({
      stageId: 1,
      exerciseType: 'reading',
      rodCount: 1,
      startValue: target,
      operand: 0,
      targetValue: target,
      prompt: '?',
    });
  }
  return trials;
}

function generateSettingTrials(count: number): SorobanJourneyTrial[] {
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const target = randInt(0, 9);
    trials.push({
      stageId: 2,
      exerciseType: 'setting',
      rodCount: 1,
      startValue: 0,
      operand: 0,
      targetValue: target,
      prompt: String(target),
    });
  }
  return trials;
}

function generateDirectAddTrials(count: number): SorobanJourneyTrial[] {
  // Both operands and result < 5, single rod, earth beads only
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const start = randInt(0, 3);
    const addend = randInt(1, 4 - start);
    trials.push({
      stageId: 3,
      exerciseType: 'direct-add',
      rodCount: 1,
      startValue: start,
      operand: addend,
      targetValue: start + addend,
      prompt: `+ ${addend}`,
    });
  }
  return trials;
}

function generateComplement5Trials(count: number): SorobanJourneyTrial[] {
  // Addition that crosses the 5 boundary on a single rod (result 5–9)
  // e.g. 3+4=7, 2+4=6, 1+5=6, 4+3=7
  const pairs: [number, number][] = [];
  for (let start = 1; start <= 4; start++) {
    for (let add = 1; add <= 9 - start; add++) {
      if (start + add >= 5 && start < 5) {
        pairs.push([start, add]);
      }
    }
  }
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const pair = pickRandom(pairs);
    trials.push({
      stageId: 4,
      exerciseType: 'complement-5',
      rodCount: 1,
      startValue: pair[0],
      operand: pair[1],
      targetValue: pair[0] + pair[1],
      prompt: `+ ${pair[1]}`,
    });
  }
  return trials;
}

function generateComplement10Trials(count: number): SorobanJourneyTrial[] {
  // Addition that carries to next rod (result >= 10), 2 rods
  const pairs: [number, number][] = [];
  for (let start = 1; start <= 9; start++) {
    for (let add = 1; add <= 9; add++) {
      if (start + add >= 10 && start + add <= 18) {
        pairs.push([start, add]);
      }
    }
  }
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const pair = pickRandom(pairs);
    trials.push({
      stageId: 5,
      exerciseType: 'complement-10',
      rodCount: 2,
      startValue: pair[0],
      operand: pair[1],
      targetValue: pair[0] + pair[1],
      prompt: `+ ${pair[1]}`,
    });
  }
  return trials;
}

function generateDirectSubTrials(count: number): SorobanJourneyTrial[] {
  // Simple subtraction, no borrowing needed
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const start = randInt(1, 9);
    const sub = randInt(1, Math.min(start, start < 5 ? start : start - 5 > 0 ? start - 5 : 1));
    // Ensure we can subtract without complement (result same "group")
    const result = start - sub;
    if (result < 0) continue;
    trials.push({
      stageId: 6,
      exerciseType: 'direct-sub',
      rodCount: 1,
      startValue: start,
      operand: sub,
      targetValue: result,
      prompt: `− ${sub}`,
    });
  }
  // Pad if we skipped any
  while (trials.length < count) {
    const start = randInt(2, 4);
    const sub = randInt(1, start);
    trials.push({
      stageId: 6,
      exerciseType: 'direct-sub',
      rodCount: 1,
      startValue: start,
      operand: sub,
      targetValue: start - sub,
      prompt: `− ${sub}`,
    });
  }
  return trials;
}

function generateSubComplementTrials(count: number): SorobanJourneyTrial[] {
  // Subtraction requiring borrow from next rod (complement of 10)
  const pairs: [number, number][] = [];
  for (let start = 10; start <= 18; start++) {
    for (let sub = 1; sub <= 9; sub++) {
      const result = start - sub;
      if (result >= 1 && result <= 9 && sub > start % 10) {
        pairs.push([start, sub]);
      }
    }
  }
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const pair = pickRandom(pairs);
    trials.push({
      stageId: 7,
      exerciseType: 'sub-complement',
      rodCount: 2,
      startValue: pair[0],
      operand: pair[1],
      targetValue: pair[0] - pair[1],
      prompt: `− ${pair[1]}`,
    });
  }
  return trials;
}

function generateMultiDigitTrials(count: number): SorobanJourneyTrial[] {
  // 2-digit addition/subtraction
  const trials: SorobanJourneyTrial[] = [];
  for (let i = 0; i < count; i++) {
    const isAdd = Math.random() > 0.4;
    if (isAdd) {
      const start = randInt(10, 50);
      const add = randInt(10, 99 - start);
      trials.push({
        stageId: 8,
        exerciseType: 'multi-digit',
        rodCount: 3,
        startValue: start,
        operand: add,
        targetValue: start + add,
        prompt: `+ ${add}`,
      });
    } else {
      const start = randInt(20, 99);
      const sub = randInt(10, start - 1);
      trials.push({
        stageId: 8,
        exerciseType: 'multi-digit',
        rodCount: 3,
        startValue: start,
        operand: sub,
        targetValue: start - sub,
        prompt: `− ${sub}`,
      });
    }
  }
  return trials;
}

// =============================================================================
// Public API
// =============================================================================

export function generateTrialsForStage(stage: SorobanStage): SorobanJourneyTrial[] {
  const count = stage.trialsPerSession;
  switch (stage.exerciseType) {
    case 'reading':
      return generateReadingTrials(count);
    case 'setting':
      return generateSettingTrials(count);
    case 'direct-add':
      return generateDirectAddTrials(count);
    case 'complement-5':
      return generateComplement5Trials(count);
    case 'complement-10':
      return generateComplement10Trials(count);
    case 'direct-sub':
      return generateDirectSubTrials(count);
    case 'sub-complement':
      return generateSubComplementTrials(count);
    case 'multi-digit':
      return generateMultiDigitTrials(count);
  }
}
