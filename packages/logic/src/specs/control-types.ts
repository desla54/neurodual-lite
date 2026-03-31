/**
 * Control Types - Type definitions for game controls
 *
 * Defines types shared between logic specs and UI components.
 */

/**
 * Control button color variants.
 * Standard: visual, audio, accent, warning
 * Multi-stimulus: position2, position3, position4, audio2
 * Extended modalities: arithmetic, image, color, spatial, digits, emotions, words, tones
 * Multi-vis: vis1, vis2, vis3, vis4
 */
export type ControlColor =
  | 'visual'
  | 'audio'
  | 'accent'
  | 'warning'
  | 'position2'
  | 'position3'
  | 'position4'
  | 'vis1'
  | 'vis2'
  | 'vis3'
  | 'vis4'
  | 'audio2'
  | 'arithmetic'
  | 'image'
  | 'color'
  | 'spatial'
  | 'digits'
  | 'emotions'
  | 'words'
  | 'tones';
