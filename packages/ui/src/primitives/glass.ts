/**
 * Glass design tokens — Centralized glassmorphism constants.
 *
 * Three opacity tiers:
 *   LIGHT  /60  — nested containers, subcards, low-emphasis surfaces
 *   NORMAL /75  — primary cards, stage cards, buttons
 *   DENSE  /85  — dialogs, modals, hover/expanded states
 *
 * All blurred tiers include `backdrop-saturate-150` to keep colors
 * behind the glass vibrant instead of washing out to grey.
 *
 * Shadows include an inner top-edge highlight that simulates light
 * refracting through the glass surface (Apple-style).
 *
 * Add the `.glass-grain` CSS class for a subtle noise overlay that
 * gives the glass a tactile, physical quality (requires `relative`
 * on the element).
 *
 * Shadows use CSS variables so they adapt to dark mode.
 * Game pages use the separate woven-* system (see game-hud.tsx).
 */

// ---------------------------------------------------------------------------
// Shared blur + saturate base (keeps glass vibrant)
// ---------------------------------------------------------------------------

/** Standard glass backdrop — blur + saturation boost */
const GLASS_BACKDROP = 'backdrop-blur-2xl backdrop-saturate-150';

/** Lighter glass backdrop for buttons */
const GLASS_BACKDROP_SM = 'backdrop-blur-xl backdrop-saturate-150';

// ---------------------------------------------------------------------------
// Shadows (dark-mode safe — uses --glass-shadow CSS variable)
// Each includes an inner top-edge highlight for light refraction.
// ---------------------------------------------------------------------------

/** Subtle shadow for small elements (badges, subcards) */
export const GLASS_SHADOW_SM =
  'shadow-[0_4px_12px_-6px_hsl(var(--glass-shadow)/0.25),inset_0_1px_0_0_var(--glass-highlight)]';

/** Standard shadow for cards and buttons */
export const GLASS_SHADOW =
  'shadow-[0_14px_32px_-24px_hsl(var(--glass-shadow)/0.35),inset_0_1px_0_0_var(--glass-highlight)]';

/** Elevated shadow for modals, popovers, current/focused elements */
export const GLASS_SHADOW_LG =
  'shadow-[0_18px_42px_-30px_hsl(var(--glass-shadow)/0.4),inset_0_1px_0_0_var(--glass-highlight-strong)]';

/** Deep shadow for primary containers (home card, command palette) */
export const GLASS_SHADOW_XL =
  'shadow-[0_24px_70px_-36px_hsl(var(--glass-shadow)/0.45),inset_0_1px_0_0_var(--glass-highlight-strong)]';

// ---------------------------------------------------------------------------
// Card presets (composable class strings)
// ---------------------------------------------------------------------------

/** Light glass — subcards, nested containers (no own blur — always inside a blurred parent) */
export const GLASS_LIGHT = 'rounded-xl border border-border/40 bg-card/60';

/** Normal glass — primary cards, stage cards, buttons */
export const GLASS_CARD = `rounded-2xl border border-border/50 bg-card/75 ${GLASS_BACKDROP} ${GLASS_SHADOW}`;

/** Dense glass — dialogs, modals, popovers */
export const GLASS_DENSE = `rounded-[22px] border border-border/50 bg-card/85 ${GLASS_BACKDROP} ${GLASS_SHADOW_XL}`;

/** Glass button — circular action buttons */
export const GLASS_BTN = `rounded-full border border-border/50 bg-card/75 ${GLASS_BACKDROP_SM} ${GLASS_SHADOW} transition-all hover:border-border/70 hover:bg-card/85`;
