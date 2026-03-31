/**
 * Mode quality tiers — visual guidance for users browsing the catalog.
 *
 * Tiers are orthogonal to reliability (stable/beta/alpha). Reliability gates
 * whether a mode is *playable*; tiers communicate how polished / core the
 * experience is once the user can access it.
 *
 *  - incontournable → Gold   — flagship, most known/polished/sophisticated
 *  - notable        → Green  — solid experience, less mainstream
 *  - catalogue      → Indigo — completeness-driven, niche
 */

export type ModeTier = 'incontournable' | 'notable' | 'catalogue';

/** Numeric weight used for sorting (lower = shown first). */
export const TIER_SORT_ORDER: Record<ModeTier, number> = {
  incontournable: 0,
  notable: 1,
  catalogue: 2,
};

// ─── Incontournables ────────────────────────────────────────────────
const INCONTOURNABLE_MODES = new Set([
  // Core dual n-back family
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-trace',
  'dual-track',
  // Polished training games
  'stroop-flex',
  'corsi-block',
  'task-switching',
  'gridlock',
  'memory-match',
  'nonogram',
  'sokoban',
  'sudoku',
  'lights-out',
  'spot-diff',
  '2048',
  'untangle',
  'flood',
  // Gold-standard cognitive tests
  'stroop',
  'flanker',
  'go-nogo',
  'stop-signal',
  'ant',
  'wcst',
  'trail-making',
  'visual-logic',
  'digit-span',
  'ospan',
  'visual-search',
  'dsst',
]);

// ─── Notables ───────────────────────────────────────────────────────
const NOTABLE_MODES = new Set([
  // Training — solid experiences
  'dual-time',
  'dual-catch',
  'dual-place',
  'dual-pick',
  'dual-memo',
  'custom',
  'running-span',
  'swm',
  'symmetry-span',
  'mental-rotation',
  'speed-sort',
  'reflex',
  'mirror',
  'color-rush',
  'chain-recall',
  'tetris-mind',
  'rhythm-tap',
  'pipeline',
  'tangram',
  'maze',
  'pal',
  'word-list',
  'pattern-recognition',
  'word-flow',
  'word-chain',
  'promem',
  'time-promem',
  'dual-task',
  'binding',
  'soroban',
  'rhythm',
  'scene-crasher',
  'memobox',
  'route-planning',
  // Demoted from incontournable
  'tower',
  'pvt',
  'sart',
  'change-detection',
  'reading-span',
  'inspection-time',
  'pasat',
  // Puzzles — well-known, engaging
  'fifteen',
  'bridges',
  'keen',
  'unruly',
  'loopy',
  'pearl',
  'tents',
  'slant',
  'lightup',
  'inertia',
  'net',
  'pegs',
  'samegame',
  'guess',
  'towers',
  'filling',
  'signpost',
  // Tests — good implementations
  'simon',
  'antisaccade',
  'posner-cueing',
  'ax-cpt',
  'cpt',
  'ufov',
  'symbol-search',
  'letter-number',
  'sternberg',
  'gabor',
  'odd-one-out',
  'number-series',
  'analogies',
  'pattern-comparison',
  'double-decision',
  'time-estimation',
]);

// Everything else falls to 'catalogue' automatically.

export function getModeTier(mode: string): ModeTier {
  if (INCONTOURNABLE_MODES.has(mode)) return 'incontournable';
  if (NOTABLE_MODES.has(mode)) return 'notable';
  return 'catalogue';
}
