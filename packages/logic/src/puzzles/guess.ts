/**
 * Guess (Mastermind) puzzle generator — faithful port of Simon Tatham's guess.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * Generates a secret code with configurable:
 * - Number of pegs (positions)
 * - Number of colours
 * - Whether duplicate colours are allowed
 *
 * Scoring uses Knuth's formula (via Mathworld) for computing bulls and cows.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GuessPuzzle {
  /** The hidden code, each element in 0..colours-1 */
  secret: number[];
  /** Number of peg positions */
  pegs: number;
  /** Number of available colours */
  colours: number;
  /** Whether duplicate colours are allowed in the code */
  allowDuplicates: boolean;
  /** Maximum number of guesses allowed */
  maxGuesses: number;
}

export interface GuessScore {
  /** Exact matches: right colour in right position */
  bulls: number;
  /** Right colour but wrong position */
  cows: number;
}

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------

export const GUESS_PRESETS = {
  easy: { pegs: 4, colours: 4, allowDuplicates: false },
  medium: { pegs: 4, colours: 6, allowDuplicates: false },
  hard: { pegs: 5, colours: 8, allowDuplicates: true },
} as const;

// ---------------------------------------------------------------------------
// Scoring — port of mark_pegs from guess.c
// ---------------------------------------------------------------------------

/**
 * Score a guess against the secret code.
 *
 * Uses the Knuth/Mathworld formula:
 *   cows = sum_over_colours(min(#secret, #guess)) - bulls
 *
 * @param secret - The hidden code (0-based colour indices)
 * @param guess  - The player's guess (0-based colour indices)
 * @returns Bulls (exact matches) and cows (right colour, wrong position)
 */
export function scoreGuess(secret: number[], guess: number[]): GuessScore {
  const npegs = secret.length;

  // Count exact matches (bulls)
  let bulls = 0;
  for (let i = 0; i < npegs; i++) {
    if (guess[i] === secret[i]) bulls++;
  }

  // Count total colour overlaps using Knuth's formula, then subtract bulls
  // to get cows. We need to know the max colour index to iterate.
  let maxCol = 0;
  for (let i = 0; i < npegs; i++) {
    if (secret[i]! > maxCol) maxCol = secret[i]!;
    if (guess[i]! > maxCol) maxCol = guess[i]!;
  }

  let totalOverlap = 0;
  for (let c = 0; c <= maxCol; c++) {
    let nGuess = 0;
    let nSecret = 0;
    for (let j = 0; j < npegs; j++) {
      if (guess[j] === c) nGuess++;
      if (secret[j] === c) nSecret++;
    }
    totalOverlap += Math.min(nGuess, nSecret);
  }

  return { bulls, cows: totalOverlap - bulls };
}

// ---------------------------------------------------------------------------
// Generation — port of new_game_desc from guess.c
// ---------------------------------------------------------------------------

/**
 * Compute the maximum number of guesses for given parameters.
 *
 * Tatham's defaults: 10 guesses for 6 colours / 4 pegs.
 * We scale proportionally: floor(npegs * 2.5) as a baseline,
 * but at least 6 and at most 20.
 */
function computeMaxGuesses(pegs: number, _colours: number, allowDuplicates: boolean): number {
  // Tatham uses fixed nguesses per preset. We derive a reasonable default:
  // More pegs/colours = more guesses needed.
  // Base formula inspired by Tatham's presets:
  //   {6 colours, 4 pegs} -> 10 guesses
  //   {8 colours, 5 pegs} -> 12 guesses
  if (!allowDuplicates) {
    // Without duplicates, slightly easier — fewer combinations
    return Math.min(20, Math.max(6, Math.ceil(pegs * 2.5)));
  }
  // With duplicates, harder — more combinations
  return Math.min(20, Math.max(8, Math.ceil(pegs * 2.5) + 1));
}

/**
 * Generate a Guess (Mastermind) puzzle.
 *
 * @param pegs - Number of positions in the code (minimum 2)
 * @param colours - Number of available colours (minimum 2)
 * @param allowDuplicates - Whether the same colour can appear more than once
 * @returns A GuessPuzzle with the secret code and game parameters
 */
export function generateGuess(
  pegs: number,
  colours: number,
  allowDuplicates: boolean,
): GuessPuzzle {
  if (colours < 2 || pegs < 2) {
    throw new Error('Must have at least 2 colours and 2 pegs');
  }
  if (!allowDuplicates && colours < pegs) {
    throw new Error('Disallowing duplicates requires at least as many colours as pegs');
  }
  if (colours > 10) {
    throw new Error('Too many colours (maximum 10)');
  }

  // Port of new_game_desc: pick random colours, rejecting duplicates
  // when allow_multiple is false.
  const secret: number[] = new Array(pegs);
  const colCount = new Uint8Array(colours);

  for (let i = 0; i < pegs; i++) {
    let c: number;
    do {
      c = Math.floor(Math.random() * colours);
    } while (!allowDuplicates && colCount[c]! > 0);
    colCount[c]!++;
    secret[i] = c;
  }

  return {
    secret,
    pegs,
    colours,
    allowDuplicates,
    maxGuesses: computeMaxGuesses(pegs, colours, allowDuplicates),
  };
}
