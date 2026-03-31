import { useMemo } from 'react';
import {
  WOVEN_COLORS,
  resolveThemeColor,
  type ColorModalityTheme,
  type WovenColorName,
} from '@neurodual/ui';
import { useSettingsStore } from '../stores';

type BaseColor =
  | 'black'
  | 'gray'
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'magenta';

interface ThemedColors {
  /** Current theme value */
  theme: ColorModalityTheme;
  /** Resolve a base color name to its CSS hsl() string for inline styles */
  css: (color: BaseColor) => string;
  /** Resolve a base color name to its Tailwind bg class */
  bg: (color: BaseColor) => string;
  /** Resolve a base color name to its Tailwind text class */
  text: (color: BaseColor) => string;
  /** Resolve a base color name to its Tailwind ring class */
  ring: (color: BaseColor) => string;
  /** Resolve a base color name to the resolved WovenColorName */
  resolve: (color: BaseColor) => WovenColorName;
}

/**
 * Hook that provides theme-aware color resolution.
 *
 * Reads `colorModalityTheme` from the settings store and returns helpers
 * that map base color names (e.g. 'red') to vivid variants when the theme
 * is 'vivid'.
 */
export function useThemedColors(): ThemedColors {
  const theme = useSettingsStore((s) => s.ui.colorModalityTheme);

  return useMemo(() => {
    const resolve = (color: BaseColor): WovenColorName => resolveThemeColor(color, theme);
    return {
      theme,
      resolve,
      css: (color: BaseColor) => `hsl(${WOVEN_COLORS[resolve(color)].cssVar})`,
      bg: (color: BaseColor) => WOVEN_COLORS[resolve(color)].bg,
      text: (color: BaseColor) => WOVEN_COLORS[resolve(color)].text,
      ring: (color: BaseColor) => WOVEN_COLORS[resolve(color)].ring,
    };
  }, [theme]);
}
