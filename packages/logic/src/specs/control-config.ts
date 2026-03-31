/**
 * Control Configuration - SSOT for modality controls
 *
 * Provides data-driven configuration for game control buttons.
 * Defines shortcuts, colors, and label keys for each modality.
 *
 * @example
 * ```ts
 * const config = getControlConfig('position2'); // { shortcut: 'S', color: 'position2', ... }
 * const modality = resolveModalityForKey('S', ['position', 'position2']); // 'position2'
 * ```
 */

import type { ControlColor } from './control-types';

/**
 * Configuration for a single control button.
 */
export interface ControlConfig {
  /** The modality ID */
  readonly modalityId: string;
  /** Keyboard shortcut (uppercase) */
  readonly shortcut: string;
  /** Color variant for the control button */
  readonly color: ControlColor;
  /** i18n key for the label (e.g., 'game.controls.position') */
  readonly labelKey: string;
}

/**
 * SSOT: Mapping of modality IDs to their default keyboard shortcuts.
 * Uses Brain Workshop defaults where applicable plus app-specific extensions
 * for the extended n-back modalities.
 */
export const MODALITY_SHORTCUTS: Readonly<Record<string, string>> = {
  position: 'A',
  position2: 'S',
  position3: 'D',
  position4: 'F',
  audio: 'L',
  audio2: ';',
  color: 'F',
  image: 'J',
  spatial: 'Q',
  digits: 'W',
  emotions: 'E',
  words: 'R',
  tones: 'U',
  vis1: 'G',
  vis2: 'H',
  vis3: 'J',
  vis4: 'K',
  visvis: 'S',
  visaudio: 'D',
  audiovis: 'J',
} as const;

/**
 * SSOT: Mapping of modality IDs to their control button colors.
 */
export const MODALITY_COLORS: Readonly<Record<string, ControlColor>> = {
  position: 'visual',
  position2: 'position2',
  position3: 'position3',
  position4: 'position4',
  audio: 'audio',
  audio2: 'audio2',
  color: 'color',
  image: 'image',
  spatial: 'spatial',
  digits: 'digits',
  emotions: 'emotions',
  words: 'words',
  tones: 'tones',
  vis1: 'vis1',
  vis2: 'vis2',
  vis3: 'vis3',
  vis4: 'vis4',
  visvis: 'position2',
  visaudio: 'position3',
  audiovis: 'image',
} as const;

/**
 * SSOT: Mapping of modality IDs to their i18n label keys.
 */
export const MODALITY_LABEL_KEYS: Readonly<Record<string, string>> = {
  position: 'game.controls.position',
  position2: 'game.controls.position2',
  position3: 'game.controls.position3',
  position4: 'game.controls.position4',
  audio: 'game.controls.audio',
  audio2: 'game.controls.audio2',
  color: 'game.controls.color',
  image: 'game.controls.image',
  spatial: 'common.spatial',
  digits: 'common.digits',
  emotions: 'common.emotions',
  words: 'common.words',
  tones: 'common.tones',
  vis1: 'game.controls.vis1',
  vis2: 'game.controls.vis2',
  vis3: 'game.controls.vis3',
  vis4: 'game.controls.vis4',
  visvis: 'game.controls.visvis',
  visaudio: 'game.controls.visaudio',
  audiovis: 'game.controls.audiovis',
} as const;

/**
 * Mapping from lowercase keys to modalities that can share that key.
 * Priority order matters: first match wins when resolving.
 *
 * BW key sharing rules:
 * - S: visvis (if active) > position2
 * - D: visaudio (if active) > position3
 * - F: position4 (if active) > color
 * - J: audiovis (if active) > vis3 (if active) > image
 */
const KEY_TO_MODALITIES: Readonly<Record<string, readonly string[]>> = {
  a: ['position'],
  q: ['spatial'],
  w: ['digits'],
  e: ['emotions'],
  r: ['words'],
  s: ['visvis', 'position2'],
  d: ['visaudio', 'position3'],
  f: ['position4', 'color'],
  g: ['vis1'],
  h: ['vis2'],
  j: ['audiovis', 'vis3', 'image'],
  k: ['vis4'],
  l: ['audio'],
  u: ['tones'],
  ';': ['audio2'],
} as const;

/**
 * Get the control configuration for a modality.
 *
 * @param modalityId The modality identifier (e.g., 'position', 'audio2')
 * @returns The control configuration, or undefined if unknown modality
 */
export function getControlConfig(modalityId: string): ControlConfig | undefined {
  const shortcut = MODALITY_SHORTCUTS[modalityId];
  const color = MODALITY_COLORS[modalityId];
  const labelKey = MODALITY_LABEL_KEYS[modalityId];

  if (!shortcut || !color || !labelKey) {
    return undefined;
  }

  return {
    modalityId,
    shortcut,
    color,
    labelKey,
  };
}

/**
 * Get all control configurations for a list of active modalities.
 * Returns them in the order provided.
 *
 * @param modalityIds Array of active modality IDs
 * @returns Array of control configurations (only for known modalities)
 */
export function getControlConfigs(modalityIds: readonly string[]): ControlConfig[] {
  return modalityIds
    .map((id) => getControlConfig(id))
    .filter((config): config is ControlConfig => config !== undefined);
}

/**
 * Resolve which modality should respond to a keyboard key.
 *
 * BW has shared keys (e.g., 'S' is position2 OR visvis depending on mode).
 * This function resolves the correct modality based on what's active.
 *
 * @param key The pressed key (case-insensitive)
 * @param activeModalities Array of currently active modalities
 * @returns The modality ID that should respond, or null if no match
 */
export function resolveModalityForKey(
  key: string,
  activeModalities: readonly string[],
): string | null {
  const normalizedKey = key.toLowerCase();
  const candidates = KEY_TO_MODALITIES[normalizedKey];

  if (!candidates) {
    return null;
  }

  // Return first candidate that is active (priority order in KEY_TO_MODALITIES)
  for (const modality of candidates) {
    if (activeModalities.includes(modality)) {
      return modality;
    }
  }

  return null;
}

/**
 * Get all modalities that could respond to a key release.
 * Used for clearing pressed state on keyup.
 *
 * @param key The released key (case-insensitive)
 * @returns Array of modality IDs that could have been pressed with this key
 */
export function getModalitiesForKey(key: string): readonly string[] {
  const normalizedKey = key.toLowerCase();
  return KEY_TO_MODALITIES[normalizedKey] ?? [];
}

/**
 * Check if a key is a valid game control key.
 *
 * @param key The key to check
 * @returns True if this key can trigger a modality response
 */
export function isGameControlKey(key: string): boolean {
  return key.toLowerCase() in KEY_TO_MODALITIES;
}
