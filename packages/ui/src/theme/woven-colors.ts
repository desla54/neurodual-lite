/**
 * Single source of truth for Woven Ink stimulus colors.
 *
 * Every UI consumer that needs a color name → Tailwind class / CSS var mapping
 * should import from here instead of defining its own local map.
 *
 * The CSS variables (--woven-*) are defined in `apps/web/src/styles.css`
 * with light/dark mode variants.  The Tailwind tokens (bg-woven-*, text-woven-*)
 * are wired in `apps/web/tailwind.config.ts`.
 */

export interface WovenColor {
  /** Tailwind background class, e.g. `'bg-woven-blue'` */
  readonly bg: string;
  /** Tailwind text class, e.g. `'text-woven-blue'` */
  readonly text: string;
  /** CSS variable reference for inline styles, e.g. `'var(--woven-blue)'` */
  readonly cssVar: string;
  /** Tailwind ring class, e.g. `'ring-woven-blue/50'` */
  readonly ring: string;
}

/**
 * All named stimulus colors available in the app.
 *
 * Keys match the `StimulusColor` type from the settings store.
 * Vivid variants (vivid-*) are high-saturation alternatives for the color modality.
 */
export const WOVEN_COLORS = {
  black: {
    bg: 'bg-foreground',
    text: 'text-foreground',
    cssVar: 'var(--foreground)',
    ring: 'ring-foreground/50',
  },
  gray: {
    bg: 'bg-woven-gray',
    text: 'text-woven-gray',
    cssVar: 'var(--woven-gray)',
    ring: 'ring-woven-gray/50',
  },
  red: {
    bg: 'bg-woven-incorrect',
    text: 'text-woven-incorrect',
    cssVar: 'var(--woven-incorrect)',
    ring: 'ring-woven-incorrect/50',
  },
  blue: {
    bg: 'bg-woven-blue',
    text: 'text-woven-blue',
    cssVar: 'var(--woven-blue)',
    ring: 'ring-woven-blue/50',
  },
  green: {
    bg: 'bg-woven-correct',
    text: 'text-woven-correct',
    cssVar: 'var(--woven-correct)',
    ring: 'ring-woven-correct/50',
  },
  yellow: {
    bg: 'bg-woven-amber',
    text: 'text-woven-amber',
    cssVar: 'var(--woven-amber)',
    ring: 'ring-woven-amber/50',
  },
  purple: {
    bg: 'bg-woven-purple',
    text: 'text-woven-purple',
    cssVar: 'var(--woven-purple)',
    ring: 'ring-woven-purple/50',
  },
  orange: {
    bg: 'bg-woven-orange',
    text: 'text-woven-orange',
    cssVar: 'var(--woven-orange)',
    ring: 'ring-woven-orange/50',
  },
  cyan: {
    bg: 'bg-woven-cyan',
    text: 'text-woven-cyan',
    cssVar: 'var(--woven-cyan)',
    ring: 'ring-woven-cyan/50',
  },
  magenta: {
    bg: 'bg-woven-magenta',
    text: 'text-woven-magenta',
    cssVar: 'var(--woven-magenta)',
    ring: 'ring-woven-magenta/50',
  },
  // Vivid variants — high-saturation colors for color modality distinguishability.
  // Use raw HSL values (no CSS variables needed). wovenCssVar wraps in hsl().
  'vivid-black': {
    bg: 'bg-foreground',
    text: 'text-foreground',
    cssVar: 'var(--foreground)',
    ring: 'ring-foreground/50',
  },
  'vivid-gray': {
    bg: 'bg-vivid-gray',
    text: 'text-vivid-gray',
    cssVar: 'var(--vivid-gray)',
    ring: 'ring-vivid-gray/50',
  },
  'vivid-blue': {
    bg: 'bg-vivid-blue',
    text: 'text-vivid-blue',
    cssVar: 'var(--vivid-blue)',
    ring: 'ring-vivid-blue/50',
  },
  'vivid-red': {
    bg: 'bg-vivid-red',
    text: 'text-vivid-red',
    cssVar: 'var(--vivid-red)',
    ring: 'ring-vivid-red/50',
  },
  'vivid-green': {
    bg: 'bg-vivid-green',
    text: 'text-vivid-green',
    cssVar: 'var(--vivid-green)',
    ring: 'ring-vivid-green/50',
  },
  'vivid-yellow': {
    bg: 'bg-vivid-yellow',
    text: 'text-vivid-yellow',
    cssVar: 'var(--vivid-yellow)',
    ring: 'ring-vivid-yellow/50',
  },
  'vivid-purple': {
    bg: 'bg-vivid-purple',
    text: 'text-vivid-purple',
    cssVar: 'var(--vivid-purple)',
    ring: 'ring-vivid-purple/50',
  },
  'vivid-orange': {
    bg: 'bg-vivid-orange',
    text: 'text-vivid-orange',
    cssVar: 'var(--vivid-orange)',
    ring: 'ring-vivid-orange/50',
  },
  'vivid-cyan': {
    bg: 'bg-vivid-cyan',
    text: 'text-vivid-cyan',
    cssVar: 'var(--vivid-cyan)',
    ring: 'ring-vivid-cyan/50',
  },
  'vivid-magenta': {
    bg: 'bg-vivid-magenta',
    text: 'text-vivid-magenta',
    cssVar: 'var(--vivid-magenta)',
    ring: 'ring-vivid-magenta/50',
  },
} as const satisfies Record<string, WovenColor>;

export type WovenColorName = keyof typeof WOVEN_COLORS;

// =============================================================================
// Color Modality Theme — maps ink-* trial colors to renderable color names
// =============================================================================

export type ColorModalityTheme = 'woven' | 'vivid';

/**
 * Maps ink-* color values (from trial generation) to WOVEN_COLORS keys.
 * Woven = muted/desaturated, Vivid = bright/saturated.
 */
const INK_TO_WOVEN: Record<string, WovenColorName> = {
  'ink-black': 'black',
  'ink-navy': 'blue',
  'ink-burgundy': 'red',
  'ink-forest': 'green',
  'ink-burnt': 'orange',
  'ink-plum': 'purple',
  'ink-teal': 'cyan',
  'ink-mustard': 'yellow',
};

const INK_TO_VIVID: Record<string, WovenColorName> = {
  'ink-black': 'vivid-black',
  'ink-navy': 'vivid-blue',
  'ink-burgundy': 'vivid-red',
  'ink-forest': 'vivid-green',
  'ink-burnt': 'vivid-orange',
  'ink-plum': 'vivid-purple',
  'ink-teal': 'vivid-cyan',
  'ink-mustard': 'vivid-yellow',
};

/**
 * Resolve an ink-* trial color to a renderable WOVEN_COLORS key.
 * Falls through to the input if it's already a valid woven color name.
 */
export function resolveModalityColor(
  inkColor: string | undefined,
  theme: ColorModalityTheme = 'woven',
): WovenColorName {
  if (!inkColor) return 'black';
  const map = theme === 'vivid' ? INK_TO_VIVID : INK_TO_WOVEN;
  const mapped = map[inkColor];
  if (mapped) return mapped;
  // Already a woven color name (e.g., 'blue', 'vivid-blue')
  if (inkColor in WOVEN_COLORS) return inkColor as WovenColorName;
  return 'black';
}

/** Resolve a color name to its bg class, falling back to `'bg-visual'`. */
export function wovenBg(color?: string): string {
  if (!color) return 'bg-visual';
  return (WOVEN_COLORS as Record<string, WovenColor>)[color]?.bg ?? 'bg-visual';
}

/** Resolve a color name to its text class, falling back to `'text-visual'`. */
export function wovenText(color?: string): string {
  if (!color) return 'text-visual';
  return (WOVEN_COLORS as Record<string, WovenColor>)[color]?.text ?? 'text-visual';
}

/**
 * Resolve a base stimulus color name (e.g. 'blue') to its vivid variant
 * when the theme is 'vivid'. Falls back to the base name if no vivid variant exists.
 */
export function resolveThemeColor(
  color: string,
  theme: ColorModalityTheme = 'woven',
): WovenColorName {
  if (theme !== 'vivid') return (color in WOVEN_COLORS ? color : 'black') as WovenColorName;
  const vividKey = `vivid-${color}`;
  if (vividKey in WOVEN_COLORS) return vividKey as WovenColorName;
  // No vivid variant (e.g. 'gray') — fall back to base
  return (color in WOVEN_COLORS ? color : 'black') as WovenColorName;
}

/** Resolve a color name to its CSS variable for inline styles, or `null`. */
export function wovenCssVar(color?: string): string | null {
  if (!color) return null;
  const entry = (WOVEN_COLORS as Record<string, WovenColor>)[color];
  return entry ? `hsl(${entry.cssVar})` : null;
}
