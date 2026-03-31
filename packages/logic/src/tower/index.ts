import { SeededRandom } from '../domain/random';

export const TOWER_DISC_COUNT_OPTIONS = [3, 4, 5] as const;
export const TOWER_DISCS = ['red', 'blue', 'green', 'yellow', 'purple'] as const;

export type TowerDisc = (typeof TOWER_DISCS)[number];
export type TowerPeg = TowerDisc[];
export type TowerPegs = [TowerPeg, TowerPeg, TowerPeg];
export type TowerPegIndex = 0 | 1 | 2;
export type TowerDiscCount = (typeof TOWER_DISC_COUNT_OPTIONS)[number];
export type TowerChallengeType = 'classic' | 'precision' | 'memory' | 'expert';
export type TowerTrainingProfileId = 'rookie' | 'standard' | 'expert';
export type TowerChallengeMode = 'mixed' | TowerChallengeType;
export type TowerDifficultyBand = 'warmup' | 'moderate' | 'hard' | 'elite';

export interface TowerMoveIntent {
  fromPeg: TowerPegIndex;
  toPeg: TowerPegIndex;
}

export interface TowerMove extends TowerMoveIntent {
  disc: TowerDisc;
}

export interface TowerSolution {
  optimalMoves: number;
  moves: TowerMove[];
}

export interface TowerPuzzlePair {
  start: TowerPegs;
  target: TowerPegs;
  startKey: string;
  targetKey: string;
  optimalMoves: number;
  discCount: TowerDiscCount;
}

export interface TowerPuzzle extends TowerPuzzlePair {
  id: string;
  challenge: TowerChallengeType;
  difficultyBand: TowerDifficultyBand;
  previewMs: number;
  goalVisibleDuringPlay: boolean;
  hintBudget: number;
  peekBudget: number;
  undoBudget: number;
  resetBudget: number;
  recommendedMoveBudget: number;
}

export interface TowerTrainingProfile {
  id: TowerTrainingProfileId;
  label: string;
  description: string;
  puzzleCount: number;
  moveSchedule: readonly number[];
  challengeSchedule: readonly TowerChallengeType[];
}

export interface TowerTrainingSession {
  id: string;
  profile: TowerTrainingProfile;
  puzzles: TowerPuzzle[];
}

export interface TowerPuzzleAttempt {
  optimalMoves: number;
  moves: number;
  totalTimeMs: number;
  planningTimeMs: number;
  invalidMoves: number;
  undosUsed: number;
  resetsUsed: number;
  hintsUsed: number;
  peeksUsed: number;
  solved: boolean;
  challenge: TowerChallengeType;
}

export interface TowerPuzzleEvaluation {
  extraMoves: number;
  efficiencyPercent: number;
  pacePercent: number;
  planningPercent: number;
  controlPercent: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  rating: 'optimal' | 'strong' | 'solid' | 'recovery';
}

export interface TowerSessionSummary {
  puzzleCount: number;
  solvedCount: number;
  optimalCount: number;
  accuracyPercent: number;
  masteryScore: number;
  avgMoves: number;
  avgPlanningTimeMs: number;
  avgTotalTimeMs: number;
  avgEfficiencyPercent: number;
  totalExtraMoves: number;
  totalHintsUsed: number;
  totalPeeksUsed: number;
  totalUndosUsed: number;
  totalResetsUsed: number;
  totalStars: number;
  maxStars: number;
}

interface TowerCatalog {
  readonly states: TowerPegs[];
  readonly stateByKey: Map<string, TowerPegs>;
  readonly adjacency: Map<string, TowerNeighbor[]>;
  readonly pairsByDistance: Map<number, TowerPuzzlePair[]>;
  readonly maxDistance: number;
  readonly discCount: TowerDiscCount;
  readonly capacities: readonly [number, number, number];
}

interface TowerNeighbor {
  readonly key: string;
  readonly move: TowerMove;
}

const PROFILE_DEFINITIONS = {
  rookie: {
    id: 'rookie',
    label: 'Rookie',
    description: 'Longer previews, easier progression, more recovery tools.',
    moveSchedule: [2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6],
    challengeSchedule: [
      'classic',
      'classic',
      'classic',
      'precision',
      'classic',
      'memory',
      'classic',
      'precision',
      'memory',
      'precision',
      'memory',
      'expert',
    ],
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Progressive Tower block with precision, memory and expert rounds.',
    moveSchedule: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7],
    challengeSchedule: [
      'classic',
      'classic',
      'precision',
      'classic',
      'precision',
      'memory',
      'classic',
      'memory',
      'precision',
      'memory',
      'expert',
      'expert',
    ],
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    description: 'High-load session with harder starts, less assistance and tighter budgets.',
    moveSchedule: [3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7, 8],
    challengeSchedule: [
      'precision',
      'precision',
      'memory',
      'precision',
      'memory',
      'expert',
      'precision',
      'memory',
      'expert',
      'expert',
      'memory',
      'expert',
    ],
  },
} as const satisfies Record<TowerTrainingProfileId, Omit<TowerTrainingProfile, 'puzzleCount'>>;

export const TOWER_TRAINING_PROFILES = {
  rookie: {
    ...PROFILE_DEFINITIONS.rookie,
    puzzleCount: PROFILE_DEFINITIONS.rookie.moveSchedule.length,
  },
  standard: {
    ...PROFILE_DEFINITIONS.standard,
    puzzleCount: PROFILE_DEFINITIONS.standard.moveSchedule.length,
  },
  expert: {
    ...PROFILE_DEFINITIONS.expert,
    puzzleCount: PROFILE_DEFINITIONS.expert.moveSchedule.length,
  },
} satisfies Record<TowerTrainingProfileId, TowerTrainingProfile>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getTowerPegCapacity(discCount: TowerDiscCount): readonly [number, number, number] {
  return [discCount, discCount - 1, discCount - 2] as const;
}

export function inferTowerDiscCount(pegs: TowerPegs): TowerDiscCount {
  const discCount = pegs[0].length + pegs[1].length + pegs[2].length;
  if (discCount === 4 || discCount === 5) {
    return discCount;
  }
  return 3;
}

function listTowerDiscs(discCount: TowerDiscCount): TowerDisc[] {
  return TOWER_DISCS.slice(0, discCount) as TowerDisc[];
}

function createLengthCompositions(
  total: number,
  capacities: readonly [number, number, number],
): Array<readonly [number, number, number]> {
  const compositions: Array<readonly [number, number, number]> = [];
  for (let first = 0; first <= capacities[0]; first++) {
    for (let second = 0; second <= capacities[1]; second++) {
      const third = total - first - second;
      if (third < 0 || third > capacities[2]) {
        continue;
      }
      compositions.push([first, second, third] as const);
    }
  }
  return compositions;
}

function permuteDiscs(items: readonly TowerDisc[]): TowerDisc[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }

  const permutations: TowerDisc[][] = [];
  for (let index = 0; index < items.length; index++) {
    const head = items[index];
    const remaining = items.filter((_, itemIndex) => itemIndex !== index);
    for (const tail of permuteDiscs(remaining)) {
      permutations.push([head as TowerDisc, ...tail]);
    }
  }
  return permutations;
}

export function cloneTowerPegs(pegs: TowerPegs): TowerPegs {
  return [[...pegs[0]], [...pegs[1]], [...pegs[2]]];
}

export function serializeTowerPegs(pegs: TowerPegs): string {
  return pegs.map((peg) => peg.join(',')).join('|');
}

export function isTowerPegsEqual(left: TowerPegs, right: TowerPegs): boolean {
  for (let pegIndex = 0; pegIndex < 3; pegIndex++) {
    const tupleIndex = pegIndex as TowerPegIndex;
    const leftPeg = left[tupleIndex];
    const rightPeg = right[tupleIndex];
    if (!leftPeg || !rightPeg) {
      return false;
    }
    if (leftPeg.length !== rightPeg.length) {
      return false;
    }
    for (let discIndex = 0; discIndex < leftPeg.length; discIndex++) {
      if (leftPeg[discIndex] !== rightPeg[discIndex]) {
        return false;
      }
    }
  }
  return true;
}

export function listTowerValidMoves(
  pegs: TowerPegs,
  discCount: TowerDiscCount = inferTowerDiscCount(pegs),
): TowerMove[] {
  const capacities = getTowerPegCapacity(discCount);
  const moves: TowerMove[] = [];
  for (let fromPeg = 0; fromPeg < 3; fromPeg++) {
    const fromIndex = fromPeg as TowerPegIndex;
    const fromStack = pegs[fromIndex];
    if (!fromStack || fromStack.length === 0) {
      continue;
    }
    const disc = fromStack[fromStack.length - 1];
    if (!disc) {
      continue;
    }
    for (let toPeg = 0; toPeg < 3; toPeg++) {
      if (fromPeg === toPeg) {
        continue;
      }
      const toIndex = toPeg as TowerPegIndex;
      const toStack = pegs[toIndex];
      if (!toStack || toStack.length >= capacities[toIndex]) {
        continue;
      }
      moves.push({
        fromPeg: fromIndex,
        toPeg: toIndex,
        disc,
      });
    }
  }
  return moves;
}

export function applyTowerMove(
  pegs: TowerPegs,
  move: TowerMoveIntent,
  discCount: TowerDiscCount = inferTowerDiscCount(pegs),
): TowerPegs | null {
  const capacities = getTowerPegCapacity(discCount);
  const fromStack = pegs[move.fromPeg];
  const toStack = pegs[move.toPeg];
  if (!fromStack || !toStack || fromStack.length === 0) {
    return null;
  }
  if (toStack.length >= capacities[move.toPeg]) {
    return null;
  }

  const nextPegs = cloneTowerPegs(pegs);
  const disc = nextPegs[move.fromPeg].pop();
  if (!disc) {
    return null;
  }
  nextPegs[move.toPeg].push(disc);
  return nextPegs;
}

function createAllTowerStates(discCount: TowerDiscCount): TowerPegs[] {
  const capacities = getTowerPegCapacity(discCount);
  const permutations = permuteDiscs(listTowerDiscs(discCount));
  const compositions = createLengthCompositions(discCount, capacities);
  const seen = new Set<string>();
  const states: TowerPegs[] = [];

  for (const composition of compositions) {
    for (const permutation of permutations) {
      let cursor = 0;
      const pegs = composition.map((size) => {
        const next = permutation.slice(cursor, cursor + size);
        cursor += size;
        return next;
      }) as TowerPegs;
      const key = serializeTowerPegs(pegs);
      if (!seen.has(key)) {
        seen.add(key);
        states.push(pegs);
      }
    }
  }

  return states;
}

function buildTowerCatalog(discCount: TowerDiscCount): TowerCatalog {
  const capacities = getTowerPegCapacity(discCount);
  const states = createAllTowerStates(discCount);
  const stateByKey = new Map(states.map((state) => [serializeTowerPegs(state), state]));
  const adjacency = new Map<string, TowerNeighbor[]>();
  const pairsByDistance = new Map<number, TowerPuzzlePair[]>();
  let maxDistance = 0;

  for (const state of states) {
    const stateKey = serializeTowerPegs(state);
    const neighbors = listTowerValidMoves(state, discCount)
      .map((move) => {
        const nextPegs = applyTowerMove(state, move, discCount);
        if (!nextPegs) {
          return null;
        }
        return {
          key: serializeTowerPegs(nextPegs),
          move,
        } satisfies TowerNeighbor;
      })
      .filter((neighbor): neighbor is TowerNeighbor => neighbor !== null);

    adjacency.set(stateKey, neighbors);
  }

  for (const start of states) {
    const startKey = serializeTowerPegs(start);
    const queue: string[] = [startKey];
    const visited = new Set<string>([startKey]);
    const distanceByKey = new Map<string, number>([[startKey, 0]]);

    while (queue.length > 0) {
      const currentKey = queue.shift();
      if (!currentKey) {
        continue;
      }
      const currentDistance = distanceByKey.get(currentKey) ?? 0;
      const neighbors = adjacency.get(currentKey) ?? [];

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.key)) {
          continue;
        }
        visited.add(neighbor.key);
        distanceByKey.set(neighbor.key, currentDistance + 1);
        queue.push(neighbor.key);
      }
    }

    for (const [targetKey, distance] of distanceByKey.entries()) {
      if (distance === 0) {
        continue;
      }
      maxDistance = Math.max(maxDistance, distance);
      const target = stateByKey.get(targetKey);
      if (!target) {
        continue;
      }
      const bucket = pairsByDistance.get(distance) ?? [];
      bucket.push({
        start: cloneTowerPegs(start),
        target: cloneTowerPegs(target),
        startKey,
        targetKey,
        optimalMoves: distance,
        discCount,
      });
      pairsByDistance.set(distance, bucket);
    }
  }

  return {
    states,
    stateByKey,
    adjacency,
    pairsByDistance,
    maxDistance,
    discCount,
    capacities,
  };
}

const TOWER_CATALOGS = new Map<TowerDiscCount, TowerCatalog>();

function getTowerCatalog(discCount: TowerDiscCount): TowerCatalog {
  const existing = TOWER_CATALOGS.get(discCount);
  if (existing) {
    return existing;
  }
  const created = buildTowerCatalog(discCount);
  TOWER_CATALOGS.set(discCount, created);
  return created;
}

export const TOWER_STATE_COUNT = getTowerCatalog(3).states.length;
export const TOWER_MAX_DISTANCE = getTowerCatalog(3).maxDistance;

export function solveTowerPuzzle(start: TowerPegs, target: TowerPegs): TowerSolution | null {
  const discCount = inferTowerDiscCount(start);
  const catalog = getTowerCatalog(discCount);
  const startKey = serializeTowerPegs(start);
  const targetKey = serializeTowerPegs(target);

  if (startKey === targetKey) {
    return {
      optimalMoves: 0,
      moves: [],
    };
  }

  if (!catalog.stateByKey.has(startKey) || !catalog.stateByKey.has(targetKey)) {
    return null;
  }

  const queue: string[] = [startKey];
  const visited = new Set<string>([startKey]);
  const parents = new Map<string, { previousKey: string; move: TowerMove }>();

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) {
      continue;
    }

    const neighbors = catalog.adjacency.get(currentKey) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.key)) {
        continue;
      }
      parents.set(neighbor.key, {
        previousKey: currentKey,
        move: neighbor.move,
      });

      if (neighbor.key === targetKey) {
        const moves: TowerMove[] = [];
        let cursor = targetKey;
        while (cursor !== startKey) {
          const parent = parents.get(cursor);
          if (!parent) {
            break;
          }
          moves.push(parent.move);
          cursor = parent.previousKey;
        }
        moves.reverse();
        return {
          optimalMoves: moves.length,
          moves,
        };
      }

      visited.add(neighbor.key);
      queue.push(neighbor.key);
    }
  }

  return null;
}

export function getTowerHintMove(pegs: TowerPegs, target: TowerPegs): TowerMove | null {
  return solveTowerPuzzle(pegs, target)?.moves[0] ?? null;
}

function getTowerDifficultyBand(optimalMoves: number): TowerDifficultyBand {
  if (optimalMoves <= 3) {
    return 'warmup';
  }
  if (optimalMoves <= 5) {
    return 'moderate';
  }
  if (optimalMoves <= 6) {
    return 'hard';
  }
  return 'elite';
}

function getTowerMoveSchedule(
  profileId: TowerTrainingProfileId,
  discCount: TowerDiscCount,
): readonly number[] {
  if (discCount === 3) {
    return TOWER_TRAINING_PROFILES[profileId].moveSchedule;
  }

  if (discCount === 4) {
    switch (profileId) {
      case 'rookie':
        return [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
      case 'expert':
        return [4, 5, 5, 6, 6, 7, 8, 8, 9, 9, 10, 10];
      default:
        return [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10];
    }
  }

  switch (profileId) {
    case 'rookie':
      return [4, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10, 11];
    case 'expert':
      return [5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 13, 13];
    default:
      return [4, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13];
  }
}

function buildChallengeConfig(
  challenge: TowerChallengeType,
  optimalMoves: number,
): Omit<
  TowerPuzzle,
  | 'id'
  | 'start'
  | 'target'
  | 'discCount'
  | 'startKey'
  | 'targetKey'
  | 'optimalMoves'
  | 'challenge'
  | 'difficultyBand'
> {
  switch (challenge) {
    case 'classic':
      return {
        previewMs: 2000 + optimalMoves * 140,
        goalVisibleDuringPlay: true,
        hintBudget: 1,
        peekBudget: 0,
        undoBudget: 2,
        resetBudget: 1,
        recommendedMoveBudget: optimalMoves + 2,
      };
    case 'precision':
      return {
        previewMs: 1750 + optimalMoves * 120,
        goalVisibleDuringPlay: true,
        hintBudget: 1,
        peekBudget: 0,
        undoBudget: 1,
        resetBudget: 1,
        recommendedMoveBudget: optimalMoves + 1,
      };
    case 'memory':
      return {
        previewMs: 2800 + optimalMoves * 180,
        goalVisibleDuringPlay: false,
        hintBudget: 1,
        peekBudget: 2,
        undoBudget: 1,
        resetBudget: 1,
        recommendedMoveBudget: optimalMoves + 2,
      };
    case 'expert':
      return {
        previewMs: 1400 + optimalMoves * 100,
        goalVisibleDuringPlay: true,
        hintBudget: 0,
        peekBudget: 0,
        undoBudget: 0,
        resetBudget: 0,
        recommendedMoveBudget: optimalMoves,
      };
  }
}

function normalizeDistanceBounds(
  opts: {
    exactMoves?: number;
    minMoves?: number;
    maxMoves?: number;
  },
  discCount: TowerDiscCount,
): { minDistance: number; maxDistance: number } {
  const maxDistance = getTowerCatalog(discCount).maxDistance;
  if (opts.exactMoves !== undefined) {
    return {
      minDistance: opts.exactMoves,
      maxDistance: opts.exactMoves,
    };
  }

  return {
    minDistance: clamp(opts.minMoves ?? 2, 1, maxDistance),
    maxDistance: clamp(opts.maxMoves ?? maxDistance, 1, maxDistance),
  };
}

export function generateTowerPuzzle(
  opts: {
    seed?: string;
    rng?: SeededRandom;
    discCount?: TowerDiscCount;
    exactMoves?: number;
    minMoves?: number;
    maxMoves?: number;
    excludePairKeys?: readonly string[];
  } = {},
): TowerPuzzlePair {
  const discCount = opts.discCount ?? 3;
  const catalog = getTowerCatalog(discCount);
  const rng = opts.rng ?? new SeededRandom(opts.seed ?? 'tower');
  const excludePairKeys = new Set(opts.excludePairKeys ?? []);
  const { minDistance, maxDistance } = normalizeDistanceBounds(opts, discCount);

  const candidates: TowerPuzzlePair[] = [];
  for (let distance = minDistance; distance <= maxDistance; distance++) {
    const bucket = catalog.pairsByDistance.get(distance) ?? [];
    for (const pair of bucket) {
      const pairKey = `${pair.startKey}->${pair.targetKey}`;
      if (excludePairKeys.has(pairKey)) {
        continue;
      }
      candidates.push(pair);
    }
  }

  if (candidates.length === 0) {
    throw new Error('No Tower puzzle available for the requested difficulty range');
  }

  const chosen = rng.choice(candidates);
  return {
    ...chosen,
    start: cloneTowerPegs(chosen.start),
    target: cloneTowerPegs(chosen.target),
  };
}

export function buildTowerTrainingSession(opts: {
  seed: string;
  profileId?: TowerTrainingProfileId;
  puzzleCount?: number;
  challengeMode?: TowerChallengeMode;
  discCount?: TowerDiscCount;
}): TowerTrainingSession {
  const profile = TOWER_TRAINING_PROFILES[opts.profileId ?? 'standard'];
  const discCount = opts.discCount ?? 3;
  const rng = new SeededRandom(`${profile.id}:${opts.seed}`);
  const usedPairKeys = new Set<string>();
  const puzzleCount = clamp(opts.puzzleCount ?? profile.puzzleCount, 4, 24);
  const moveSchedule = getTowerMoveSchedule(profile.id, discCount);

  const puzzles = Array.from({ length: puzzleCount }, (_, index) => {
    const optimalMoves = moveSchedule[index % moveSchedule.length] ?? 2;
    const challenge =
      opts.challengeMode && opts.challengeMode !== 'mixed'
        ? opts.challengeMode
        : (profile.challengeSchedule[index % profile.challengeSchedule.length] ?? 'classic');
    const puzzlePair = generateTowerPuzzle({
      rng,
      discCount,
      exactMoves: optimalMoves,
      excludePairKeys: [...usedPairKeys],
    });
    const pairKey = `${puzzlePair.startKey}->${puzzlePair.targetKey}`;
    usedPairKeys.add(pairKey);

    return {
      id: `${index + 1}:${challenge}:${pairKey}`,
      ...puzzlePair,
      challenge,
      difficultyBand: getTowerDifficultyBand(optimalMoves),
      ...buildChallengeConfig(challenge, optimalMoves),
    } satisfies TowerPuzzle;
  });

  return {
    id: `tower:${discCount}:${profile.id}:${opts.seed}`,
    profile,
    puzzles,
  };
}

export function evaluateTowerPuzzle(attempt: TowerPuzzleAttempt): TowerPuzzleEvaluation {
  const extraMoves = Math.max(0, attempt.moves - attempt.optimalMoves);
  const efficiencyPercent = attempt.solved
    ? Math.round((attempt.optimalMoves / Math.max(attempt.moves, attempt.optimalMoves)) * 100)
    : 0;

  const paceBudgetMs =
    2200 +
    attempt.optimalMoves * 2000 +
    (attempt.challenge === 'memory' ? 1800 : 0) +
    (attempt.challenge === 'expert' ? 600 : 0);
  const pacePercent = attempt.solved
    ? clamp(Math.round((paceBudgetMs / Math.max(attempt.totalTimeMs, 700)) * 100), 25, 100)
    : 0;

  const planningBudgetMs =
    900 +
    attempt.optimalMoves * 650 +
    (attempt.challenge === 'memory' ? 1200 : 0) +
    (attempt.challenge === 'expert' ? 250 : 0);
  const planningPercent = attempt.solved
    ? clamp(Math.round((planningBudgetMs / Math.max(attempt.planningTimeMs, 300)) * 100), 25, 100)
    : 0;

  const controlPenalty =
    extraMoves * 8 +
    attempt.invalidMoves * 6 +
    attempt.undosUsed * 5 +
    attempt.resetsUsed * 12 +
    attempt.hintsUsed * 14 +
    attempt.peeksUsed * 8;
  const controlPercent = attempt.solved ? clamp(100 - controlPenalty, 0, 100) : 0;

  const score = attempt.solved
    ? clamp(
        Math.round(
          efficiencyPercent * 0.45 +
            pacePercent * 0.2 +
            controlPercent * 0.25 +
            planningPercent * 0.1,
        ),
        0,
        100,
      )
    : 0;

  let stars: 0 | 1 | 2 | 3 = 0;
  if (attempt.solved) {
    stars = 1;
  }
  if (attempt.solved && score >= 70) {
    stars = 2;
  }
  if (
    attempt.solved &&
    extraMoves === 0 &&
    attempt.hintsUsed === 0 &&
    attempt.peeksUsed === 0 &&
    attempt.resetsUsed === 0
  ) {
    stars = 3;
  }

  const rating = !attempt.solved
    ? 'recovery'
    : extraMoves === 0 && controlPercent >= 90
      ? 'optimal'
      : score >= 80
        ? 'strong'
        : score >= 60
          ? 'solid'
          : 'recovery';

  return {
    extraMoves,
    efficiencyPercent,
    pacePercent,
    planningPercent,
    controlPercent,
    score,
    stars,
    rating,
  };
}

export function summarizeTowerSession(
  attempts: readonly TowerPuzzleAttempt[],
): TowerSessionSummary {
  if (attempts.length === 0) {
    return {
      puzzleCount: 0,
      solvedCount: 0,
      optimalCount: 0,
      accuracyPercent: 0,
      masteryScore: 0,
      avgMoves: 0,
      avgPlanningTimeMs: 0,
      avgTotalTimeMs: 0,
      avgEfficiencyPercent: 0,
      totalExtraMoves: 0,
      totalHintsUsed: 0,
      totalPeeksUsed: 0,
      totalUndosUsed: 0,
      totalResetsUsed: 0,
      totalStars: 0,
      maxStars: 0,
    };
  }

  const evaluations = attempts.map((attempt) => evaluateTowerPuzzle(attempt));
  const solvedCount = attempts.filter((attempt) => attempt.solved).length;
  const optimalCount = evaluations.filter((evaluation) => evaluation.extraMoves === 0).length;
  const totalMoves = attempts.reduce((sum, attempt) => sum + attempt.moves, 0);
  const totalPlanningTimeMs = attempts.reduce((sum, attempt) => sum + attempt.planningTimeMs, 0);
  const totalTimeMs = attempts.reduce((sum, attempt) => sum + attempt.totalTimeMs, 0);
  const totalEfficiency = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.efficiencyPercent,
    0,
  );
  const totalScore = evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0);
  const totalExtraMoves = evaluations.reduce((sum, evaluation) => sum + evaluation.extraMoves, 0);
  const totalHintsUsed = attempts.reduce((sum, attempt) => sum + attempt.hintsUsed, 0);
  const totalPeeksUsed = attempts.reduce((sum, attempt) => sum + attempt.peeksUsed, 0);
  const totalUndosUsed = attempts.reduce((sum, attempt) => sum + attempt.undosUsed, 0);
  const totalResetsUsed = attempts.reduce((sum, attempt) => sum + attempt.resetsUsed, 0);
  const totalStars = evaluations.reduce((sum, evaluation) => sum + evaluation.stars, 0);

  return {
    puzzleCount: attempts.length,
    solvedCount,
    optimalCount,
    accuracyPercent: Math.round((optimalCount / attempts.length) * 100),
    masteryScore: Math.round(totalScore / attempts.length),
    avgMoves: Math.round((totalMoves / attempts.length) * 10) / 10,
    avgPlanningTimeMs: Math.round(totalPlanningTimeMs / attempts.length),
    avgTotalTimeMs: Math.round(totalTimeMs / attempts.length),
    avgEfficiencyPercent: Math.round(totalEfficiency / attempts.length),
    totalExtraMoves,
    totalHintsUsed,
    totalPeeksUsed,
    totalUndosUsed,
    totalResetsUsed,
    totalStars,
    maxStars: attempts.length * 3,
  };
}
