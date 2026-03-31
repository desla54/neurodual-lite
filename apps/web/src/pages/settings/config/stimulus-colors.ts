/**
 * Stimulus color configuration for visual settings.
 *
 * Color classes come from the single source of truth in @neurodual/ui.
 */

import {
  WOVEN_COLORS,
  type WovenColorName,
  type ColorModalityTheme,
  resolveThemeColor,
} from '@neurodual/ui';
import type { StimulusColor } from '../../../stores/settings-store';

export interface StimulusColorConfig {
  value: StimulusColor;
  labelKey: string;
  bgClass: string;
  ringClass: string;
}

const STIMULUS_COLOR_NAMES: WovenColorName[] = [
  'black',
  'gray',
  'blue',
  'red',
  'green',
  'yellow',
  'purple',
  'orange',
  'cyan',
  'magenta',
];

/** Get stimulus color configs with swatches matching the active color theme. */
export function getStimulusColors(theme: ColorModalityTheme = 'woven'): StimulusColorConfig[] {
  return STIMULUS_COLOR_NAMES.map((name) => {
    const resolved = resolveThemeColor(name, theme);
    return {
      value: name as StimulusColor,
      labelKey: `settings.visual.colors.${name}`,
      bgClass: WOVEN_COLORS[resolved].bg,
      ringClass: WOVEN_COLORS[resolved].ring,
    };
  });
}

/** @deprecated Use getStimulusColors(theme) instead */
export const STIMULUS_COLORS: StimulusColorConfig[] = getStimulusColors('woven');
