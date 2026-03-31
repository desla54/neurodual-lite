/**
 * Modality System - Extensible Stimulus Types
 *
 * Permet d'ajouter de nouvelles modalités (forme, haptique, etc.)
 * sans modifier le code existant.
 */

import type { LureType, ModalityId } from '../types';
import {
  SPATIAL_DIRECTIONS,
  DIGIT_VALUES,
  EMOTION_VALUES,
  WORD_VALUES,
  TONE_VALUES,
} from '../../specs/thresholds';

// Re-export ModalityId for backwards compatibility
export type { ModalityId } from '../types';

/** Valeur d'un stimulus (position, son, couleur, etc.) */
export type StimulusValue = string | number;

// =============================================================================
// Définition d'une modalité
// =============================================================================

/**
 * Définit une modalité de stimulus.
 * Chaque modalité a un pool de valeurs possibles et des métadonnées.
 */
export interface ModalityDefinition<T extends StimulusValue = StimulusValue> {
  /** Identifiant unique (ex: 'position', 'audio', 'color', 'shape') */
  readonly id: ModalityId;

  /** Nom d'affichage */
  readonly displayName: string;

  /** Type de stimulus: visuel, auditif, haptique */
  readonly type: 'visual' | 'auditory' | 'haptic';

  /** Pool de valeurs possibles */
  readonly pool: readonly T[];

  /** Valeur par défaut (utilisée si modalité inactive) */
  readonly defaultValue?: T;

  /** Indique si cette modalité nécessite un rendu UI */
  readonly requiresRender: boolean;
}

// =============================================================================
// Stimulus - Données d'un stimulus pour une modalité
// =============================================================================

/**
 * Représente un stimulus pour une modalité donnée dans un trial.
 */
export interface Stimulus {
  /** Identifiant de la modalité */
  readonly modalityId: ModalityId;

  /** Valeur du stimulus */
  readonly value: StimulusValue;

  /** Est-ce une cible (match n-back) ? */
  readonly isTarget: boolean;

  /** Est-ce un leurre ? */
  readonly isLure: boolean;

  /** Type de leurre si applicable */
  readonly lureType?: LureType;
}

/**
 * Crée un stimulus
 */
export function createStimulus(
  modalityId: ModalityId,
  value: StimulusValue,
  isTarget: boolean,
  isLure: boolean,
  lureType?: LureType,
): Stimulus {
  return {
    modalityId,
    value,
    isTarget,
    isLure,
    lureType,
  };
}

// =============================================================================
// Registry des modalités
// =============================================================================

/**
 * Registry pour enregistrer et récupérer les définitions de modalités.
 */
export class ModalityRegistry {
  private modalities = new Map<ModalityId, ModalityDefinition>();

  register<T extends StimulusValue>(definition: ModalityDefinition<T>): this {
    this.modalities.set(definition.id, definition as ModalityDefinition);
    return this;
  }

  get(id: ModalityId): ModalityDefinition {
    const modality = this.modalities.get(id);
    if (!modality) {
      throw new Error(`Unknown modality: ${id}`);
    }
    return modality;
  }

  has(id: ModalityId): boolean {
    return this.modalities.has(id);
  }

  list(): ModalityId[] {
    return Array.from(this.modalities.keys());
  }

  getAll(): ModalityDefinition[] {
    return Array.from(this.modalities.values());
  }

  /**
   * Filtre les modalités par type
   */
  getByType(type: ModalityDefinition['type']): ModalityDefinition[] {
    return this.getAll().filter((m) => m.type === type);
  }
}

// =============================================================================
// Registry global + Modalités par défaut
// =============================================================================

export const modalityRegistry = new ModalityRegistry();

// Position (grille 3x3, 8 positions - centre exclu)
modalityRegistry.register({
  id: 'position',
  displayName: 'Position',
  type: 'visual',
  pool: [0, 1, 2, 3, 4, 5, 6, 7] as const,
  requiresRender: true,
});

// Audio (8 lettres)
modalityRegistry.register({
  id: 'audio',
  displayName: 'Audio',
  type: 'auditory',
  pool: ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T'] as const,
  requiresRender: false, // Audio est joué, pas rendu visuellement
});

// Couleur
modalityRegistry.register({
  id: 'color',
  displayName: 'Couleur',
  type: 'visual',
  pool: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'magenta'] as const,
  defaultValue: 'blue',
  requiresRender: true,
});

// Spatial (8 flèches directionnelles)
modalityRegistry.register({
  id: 'spatial',
  displayName: 'Spatial',
  type: 'visual',
  pool: [...SPATIAL_DIRECTIONS],
  requiresRender: true,
});

// Chiffres (0-9)
modalityRegistry.register({
  id: 'digits',
  displayName: 'Chiffres',
  type: 'visual',
  pool: [...DIGIT_VALUES],
  requiresRender: true,
});

// Émotions (8 émotions universelles)
modalityRegistry.register({
  id: 'emotions',
  displayName: 'Émotions',
  type: 'visual',
  pool: [...EMOTION_VALUES],
  requiresRender: true,
});

// Mots (8 mots courts)
modalityRegistry.register({
  id: 'words',
  displayName: 'Mots',
  type: 'visual',
  pool: [...WORD_VALUES],
  requiresRender: true,
});

// Tonalités (8 notes musicales sur 2 octaves)
modalityRegistry.register({
  id: 'tones',
  displayName: 'Tonalités',
  type: 'auditory',
  pool: [...TONE_VALUES],
  requiresRender: false, // Audio - played, not rendered visually
});
