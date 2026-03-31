/**
 * FlexibleTrial - Generic Trial Structure
 *
 * Remplace l'interface Trial rigide par une structure générique
 * qui supporte n'importe quelle combinaison de modalités.
 */

import type { TrialType } from '../types';
import type { ModalityId, Stimulus, StimulusValue } from './modality';

// =============================================================================
// FlexibleTrial
// =============================================================================

/**
 * Trial générique supportant n'importe quelle modalité.
 */
export interface FlexibleTrial {
  /** Index du trial dans le bloc */
  readonly index: number;

  /** Est-ce un trial tampon (buffer) ? */
  readonly isBuffer: boolean;

  /** Stimuli par modalité */
  readonly stimuli: ReadonlyMap<ModalityId, Stimulus>;

  /** Type de trial calculé */
  readonly trialType: TrialType;
}

// =============================================================================
// Builder pour FlexibleTrial
// =============================================================================

export class FlexibleTrialBuilder {
  private index = 0;
  private isBuffer = false;
  private stimuli = new Map<ModalityId, Stimulus>();

  setIndex(index: number): this {
    this.index = index;
    return this;
  }

  setBuffer(isBuffer: boolean): this {
    this.isBuffer = isBuffer;
    return this;
  }

  addStimulus(stimulus: Stimulus): this {
    this.stimuli.set(stimulus.modalityId, stimulus);
    return this;
  }

  build(): FlexibleTrial {
    const trialType = this.computeTrialType();
    return {
      index: this.index,
      isBuffer: this.isBuffer,
      stimuli: new Map(this.stimuli),
      trialType,
    };
  }

  private computeTrialType(): TrialType {
    if (this.isBuffer) return 'Tampon';

    const targets = Array.from(this.stimuli.values()).filter((s) => s.isTarget);
    const hasVisualTarget = targets.some(
      (s) =>
        s.modalityId.startsWith('position') ||
        s.modalityId.startsWith('vis') ||
        s.modalityId === 'color' ||
        s.modalityId === 'image' ||
        s.modalityId === 'spatial' ||
        s.modalityId === 'digits' ||
        s.modalityId === 'emotions' ||
        s.modalityId === 'words' ||
        s.modalityId === 'arithmetic',
    );
    const hasAudioTarget = targets.some(
      (s) =>
        s.modalityId.startsWith('audio') || s.modalityId === 'audiovis' || s.modalityId === 'tones',
    );

    if (targets.length >= 2) return 'Dual';
    if (hasVisualTarget) return 'V-Seul';
    if (hasAudioTarget) return 'A-Seul';
    return 'Non-Cible';
  }

  /**
   * Reset pour réutilisation
   */
  reset(): this {
    this.index = 0;
    this.isBuffer = false;
    this.stimuli.clear();
    return this;
  }
}

// =============================================================================
// Helpers pour FlexibleTrial
// =============================================================================

/**
 * Récupère le stimulus d'une modalité
 */
export function getStimulus(trial: FlexibleTrial, modalityId: ModalityId): Stimulus | undefined {
  return trial.stimuli.get(modalityId);
}

/**
 * Récupère la valeur d'un stimulus
 */
export function getStimulusValue(
  trial: FlexibleTrial,
  modalityId: ModalityId,
): StimulusValue | undefined {
  return trial.stimuli.get(modalityId)?.value;
}

/**
 * Vérifie si une modalité est une cible
 */
export function isTarget(trial: FlexibleTrial, modalityId: ModalityId): boolean {
  return trial.stimuli.get(modalityId)?.isTarget ?? false;
}

/**
 * Vérifie si une modalité est un leurre
 */
export function isLure(trial: FlexibleTrial, modalityId: ModalityId): boolean {
  return trial.stimuli.get(modalityId)?.isLure ?? false;
}

/**
 * Récupère toutes les modalités actives
 */
export function getActiveModalities(trial: FlexibleTrial): ModalityId[] {
  return Array.from(trial.stimuli.keys());
}

/**
 * Récupère toutes les cibles
 */
export function getTargets(trial: FlexibleTrial): Stimulus[] {
  return Array.from(trial.stimuli.values()).filter((s) => s.isTarget);
}

/**
 * Récupère tous les leurres
 */
export function getLures(trial: FlexibleTrial): Stimulus[] {
  return Array.from(trial.stimuli.values()).filter((s) => s.isLure);
}
