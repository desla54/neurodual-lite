/**
 * Modality UI Helpers - Spec-Driven UI Configuration
 *
 * Provides helpers for modality display in reports and UI.
 * Derives colors and labels from SSOT (thresholds.ts, core.ts).
 *
 * @example
 * ```ts
 * const color = getModalityColor('position2');  // '#EF4444' (red)
 * const info = getModalityLabelInfo('audio2');  // { key: 'modality.audio', index: 2 }
 * const layout = getOptimalModalityLayout(5);   // 'scroll'
 * ```
 */

import { MULTI_STIMULUS_COLORS } from './thresholds';
import {
  isPositionModality,
  isAudioModality,
  isArithmeticModality,
  getPositionModalityIndex,
  getAudioModalityIndex,
} from '../types/core';

// =============================================================================
// Types
// =============================================================================

/**
 * Famille de modalité pour regroupement UI.
 * Chaque variante (position2, audio2) appartient à une famille.
 */
export type ModalityFamily =
  | 'position'
  | 'audio'
  | 'color'
  | 'arithmetic'
  | 'image'
  | 'spatial'
  | 'digits'
  | 'emotions'
  | 'words'
  | 'tones'
  | 'shape'
  | 'vis'
  | 'visvis'
  | 'visaudio'
  | 'audiovis';

/**
 * Layout pour l'affichage des modalités dans le rapport.
 */
export type ModalityLayout = 'auto' | 'scroll' | 'grid-2' | 'grid-3';

/**
 * Configuration UI du rapport.
 */
export interface ReportUISpec {
  /** Layout pour les modalités */
  readonly modalityLayout?: ModalityLayout;
  /** Override des couleurs par famille */
  readonly familyColors?: Partial<Record<ModalityFamily, string>>;
}

/**
 * Information pour générer un label de modalité.
 */
export interface ModalityLabelInfo {
  /** Clé i18n (ex: 'modality.position') */
  readonly key: string;
  /** Index pour variantes (2 pour position2, null pour position) */
  readonly index: number | null;
  /** Famille de la modalité */
  readonly family: ModalityFamily;
}

// =============================================================================
// Constants - Derived from SSOT
// =============================================================================

/**
 * Couleurs CSS de base par famille de modalité.
 * Les variantes (position2, position3...) utilisent MULTI_STIMULUS_COLORS.
 */
const FAMILY_BASE_COLORS: Record<ModalityFamily, string> = {
  position: 'text-visual', // CSS class (Tailwind)
  audio: 'text-audio', // CSS class (Tailwind)
  color: 'text-pink-500',
  arithmetic: 'text-amber-600',
  image: 'text-emerald-500',
  spatial: 'text-emerald-500',
  digits: 'text-cyan-500',
  emotions: 'text-rose-500',
  words: 'text-lime-500',
  tones: 'text-violet-500',
  shape: 'text-purple-500',
  vis: 'text-sky-500',
  visvis: 'text-sky-500',
  visaudio: 'text-teal-500',
  audiovis: 'text-indigo-500',
};

/**
 * Variantes de couleur pour audio (opacity-based).
 */
const AUDIO_VARIANTS = ['text-audio', 'text-audio/70'] as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Détermine la famille d'une modalité.
 * Utilise les helpers existants de core.ts.
 *
 * @example
 * getModalityFamily('position')   // 'position'
 * getModalityFamily('position2')  // 'position'
 * getModalityFamily('audio2')     // 'audio'
 */
export function getModalityFamily(modalityId: string): ModalityFamily {
  if (modalityId === 'visvis' || modalityId === 'visaudio' || modalityId === 'audiovis') {
    return modalityId;
  }
  if (/^vis[1-4]$/.test(modalityId)) return 'vis';
  if (isPositionModality(modalityId)) return 'position';
  if (isAudioModality(modalityId)) return 'audio';
  if (isArithmeticModality(modalityId)) return 'arithmetic';
  // Direct checks for modalities without dedicated helpers
  if (modalityId === 'color') return 'color';
  if (modalityId === 'image') return 'image';
  if (modalityId === 'spatial') return 'spatial';
  if (modalityId === 'digits') return 'digits';
  if (modalityId === 'emotions') return 'emotions';
  if (modalityId === 'words') return 'words';
  if (modalityId === 'tones') return 'tones';
  if (modalityId === 'shape') return 'shape';
  return 'position'; // fallback
}

/**
 * Obtient la couleur pour une modalité.
 *
 * Retourne soit:
 * - Une classe CSS Tailwind (ex: 'text-visual')
 * - Une couleur hex (ex: '#EF4444' pour position2)
 *
 * Pour les variantes position (position2, position3, position4),
 * utilise MULTI_STIMULUS_COLORS depuis thresholds.ts.
 *
 * @example
 * getModalityColor('position')   // 'text-visual' (CSS class)
 * getModalityColor('position2')  // '#EF4444' (hex - rouge)
 * getModalityColor('audio')      // 'text-audio' (CSS class)
 * getModalityColor('audio2')     // 'text-audio/70' (CSS class avec opacity)
 */
export function getModalityColor(modalityId: string): string {
  const family = getModalityFamily(modalityId);

  if (family === 'vis') {
    const match = modalityId.match(/^vis(\d+)$/);
    const idx = match?.[1] ? Number.parseInt(match[1], 10) - 1 : 0;
    if (idx >= 0 && idx < MULTI_STIMULUS_COLORS.length) {
      return MULTI_STIMULUS_COLORS[idx] as string;
    }
    return FAMILY_BASE_COLORS.vis;
  }

  if (family === 'position') {
    const index = getPositionModalityIndex(modalityId);
    // Position 1 (index 0) utilise la couleur de base (CSS class)
    // Position 2-4 (index 1-3) utilisent MULTI_STIMULUS_COLORS (hex)
    if (index > 0 && index < MULTI_STIMULUS_COLORS.length) {
      // Safe: bounds checked above
      return MULTI_STIMULUS_COLORS[index] as string;
    }
    return FAMILY_BASE_COLORS.position;
  }

  if (family === 'audio') {
    const index = getAudioModalityIndex(modalityId);
    // Audio 1 (index 0) utilise la couleur de base
    // Audio 2 (index 1) utilise une variante avec opacity
    if (index > 0 && index < AUDIO_VARIANTS.length) {
      // Safe: bounds checked above
      return AUDIO_VARIANTS[index] as string;
    }
    return FAMILY_BASE_COLORS.audio;
  }

  return FAMILY_BASE_COLORS[family] ?? 'text-muted-foreground';
}

/**
 * Génère les informations pour afficher le label d'une modalité.
 *
 * Permet de construire dynamiquement "Position 2", "Audio 2", etc.
 * en utilisant une clé i18n + un index optionnel.
 *
 * @example
 * getModalityLabelInfo('position')
 * // { key: 'modality.position', index: null, family: 'position' }
 *
 * getModalityLabelInfo('position2')
 * // { key: 'modality.position', index: 2, family: 'position' }
 *
 * getModalityLabelInfo('audio2')
 * // { key: 'modality.audio', index: 2, family: 'audio' }
 */
export function getModalityLabelInfo(modalityId: string): ModalityLabelInfo {
  const family = getModalityFamily(modalityId);

  if (family === 'position') {
    const index = getPositionModalityIndex(modalityId);
    // index 0 = position (pas de suffix), index 1 = position2 (afficher "2")
    return {
      key: 'modality.position',
      index: index > 0 ? index + 1 : null,
      family,
    };
  }

  if (family === 'audio') {
    const index = getAudioModalityIndex(modalityId);
    return {
      key: 'modality.audio',
      index: index > 0 ? index + 1 : null,
      family,
    };
  }

  if (family === 'vis') {
    const match = modalityId.match(/^vis(\d+)$/);
    const index = match?.[1] ? Number.parseInt(match[1], 10) : null;
    return {
      key: 'modality.vis',
      index,
      family,
    };
  }

  return {
    key: `modality.${family}`,
    index: null,
    family,
  };
}

/**
 * Détermine le layout optimal pour N modalités.
 *
 * - 1-2 modalités: grille 2 colonnes
 * - 3 modalités: grille 3 colonnes
 * - 4+ modalités: scroll horizontal sur mobile, grille sur desktop
 *
 * @example
 * getOptimalModalityLayout(2)  // 'grid-2'
 * getOptimalModalityLayout(3)  // 'grid-3'
 * getOptimalModalityLayout(5)  // 'scroll'
 */
export function getOptimalModalityLayout(
  count: number,
  override?: ModalityLayout,
): 'grid-2' | 'grid-3' | 'scroll' {
  if (override && override !== 'auto') {
    return override as 'grid-2' | 'grid-3' | 'scroll';
  }

  if (count <= 2) return 'grid-2';
  if (count <= 3) return 'grid-3';
  return 'scroll';
}

/**
 * Vérifie si une couleur est une couleur hex (commence par #).
 * Utile pour décider entre style inline et className.
 */
export function isHexColor(color: string): boolean {
  return color.startsWith('#');
}
