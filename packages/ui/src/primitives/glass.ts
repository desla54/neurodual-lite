/**
 * Flat design tokens — Centralized surface/shadow constants.
 *
 * Replaces the former glassmorphism system with clean, opaque surfaces
 * and simple warm-tinted shadows.
 *
 * Naming kept as GLASS_* for backwards compatibility across the codebase.
 */

// ---------------------------------------------------------------------------
// Shadows (warm-tinted, no inner highlight)
// ---------------------------------------------------------------------------

/** Subtle shadow for small elements (badges, subcards) */
export const GLASS_SHADOW_SM =
  'shadow-[0_2px_6px_-3px_hsla(30,10%,10%,0.08)]';

/** Standard shadow for cards and buttons */
export const GLASS_SHADOW =
  'shadow-[0_4px_16px_-8px_hsla(30,10%,10%,0.10)]';

/** Elevated shadow for modals, popovers, current/focused elements */
export const GLASS_SHADOW_LG =
  'shadow-[0_8px_24px_-12px_hsla(30,10%,10%,0.14)]';

/** Deep shadow for primary containers (home card, command palette) */
export const GLASS_SHADOW_XL =
  'shadow-[0_12px_40px_-16px_hsla(30,10%,10%,0.16)]';

// ---------------------------------------------------------------------------
// Card presets (composable class strings)
// ---------------------------------------------------------------------------

/** Light surface — subcards, nested containers */
export const GLASS_LIGHT = 'rounded-xl border border-border/40 bg-card';

/** Normal surface — primary cards, stage cards, buttons */
export const GLASS_CARD = `rounded-2xl border border-border/50 bg-card ${GLASS_SHADOW}`;

/** Dense surface — dialogs, modals, popovers */
export const GLASS_DENSE = `rounded-[22px] border border-border/50 bg-card ${GLASS_SHADOW_XL}`;

/** Surface button — circular action buttons */
export const GLASS_BTN = `rounded-full border border-border/50 bg-card ${GLASS_SHADOW} transition-all hover:border-border/70 hover:bg-card`;
