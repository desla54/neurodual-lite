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
  'dualnback-classic',
  'sim-brainworkshop',
  'stroop-flex',
  'stroop',
]);

// ─── Notables ───────────────────────────────────────────────────────
const NOTABLE_MODES = new Set<string>([
  // (none for lite)
]);

// Everything else falls to 'catalogue' automatically.

export function getModeTier(mode: string): ModeTier {
  if (INCONTOURNABLE_MODES.has(mode)) return 'incontournable';
  if (NOTABLE_MODES.has(mode)) return 'notable';
  return 'catalogue';
}
