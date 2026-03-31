/**
 * TrialVO - Value Object for Trial
 *
 * Encapsule un trial avec des méthodes sémantiques.
 * Remplace la logique conditionnelle dispersée.
 */

import type {
  Color,
  LureType,
  ModalityId,
  Position,
  Sound,
  Trial,
  TrialInput,
  TrialResult,
  TrialType,
} from './types';
import {
  getHasResponse,
  getIsLure,
  getIsTarget,
  getLureType as getLureTypeFromAdapter,
  getResponseRT,
} from './modality';

// =============================================================================
// Types pour le verdict
// =============================================================================

export interface ModalityVerdict {
  readonly modality: ModalityId;
  readonly isTarget: boolean;
  readonly responded: boolean;
  readonly result: TrialResult;
  readonly reactionTimeMs: number | null;
  readonly isLure: boolean;
  readonly lureType: LureType | null;
}

export interface TrialVerdict {
  readonly trialIndex: number;
  readonly position: ModalityVerdict;
  readonly audio: ModalityVerdict;
  readonly color: ModalityVerdict | null;
  readonly isFullyCorrect: boolean;
}

// =============================================================================
// TrialVO
// =============================================================================

export class TrialVO {
  constructor(private readonly trial: Trial) {}

  // ===========================================================================
  // Accesseurs de base
  // ===========================================================================

  get index(): number {
    return this.trial.index;
  }

  get isBuffer(): boolean {
    return this.trial.isBuffer;
  }

  get position(): Position {
    return this.trial.position;
  }

  get sound(): Sound {
    return this.trial.sound;
  }

  get color(): Color {
    return this.trial.color;
  }

  get trialType(): TrialType {
    return this.trial.trialType;
  }

  // ===========================================================================
  // Méthodes sémantiques - Target
  // ===========================================================================

  /** Ce trial est-il une cible pour cette modalité? */
  isTargetFor(modalityId: ModalityId): boolean {
    return getIsTarget(this.trial, modalityId);
  }

  /** Dual target (position ET audio) */
  isDualTarget(): boolean {
    return this.isTargetFor('position') && this.isTargetFor('audio');
  }

  /** Single target (une seule modalité) */
  isSingleTarget(): boolean {
    return this.targetCount === 1;
  }

  /** Aucune cible */
  isNoTarget(): boolean {
    return this.targetCount === 0;
  }

  /** Nombre de modalités cibles */
  get targetCount(): number {
    return [
      this.isTargetFor('position'),
      this.isTargetFor('audio'),
      this.isTargetFor('color'),
    ].filter(Boolean).length;
  }

  // ===========================================================================
  // Méthodes sémantiques - Lure
  // ===========================================================================

  /** Ce trial est-il un lure pour cette modalité? */
  isLureFor(modalityId: ModalityId): boolean {
    return getIsLure(this.trial, modalityId);
  }

  /** Type de lure pour cette modalité */
  getLureType(modalityId: ModalityId): LureType | null {
    return getLureTypeFromAdapter(this.trial, modalityId);
  }

  /** Ce trial contient-il un lure? */
  hasAnyLure(): boolean {
    return this.isLureFor('position') || this.isLureFor('audio') || this.isLureFor('color');
  }

  // ===========================================================================
  // Évaluation de la réponse utilisateur
  // ===========================================================================

  /** Évalue la réponse utilisateur et retourne un verdict complet */
  evaluate(input: TrialInput | undefined): TrialVerdict {
    const positionVerdict = this.evaluateModality('position', input);
    const audioVerdict = this.evaluateModality('audio', input);
    const colorVerdict =
      this.trial.isColorTarget !== undefined ? this.evaluateModality('color', input) : null;

    const isFullyCorrect =
      (positionVerdict.result === 'hit' || positionVerdict.result === 'correctRejection') &&
      (audioVerdict.result === 'hit' || audioVerdict.result === 'correctRejection') &&
      (colorVerdict === null ||
        colorVerdict.result === 'hit' ||
        colorVerdict.result === 'correctRejection');

    return {
      trialIndex: this.trial.index,
      position: positionVerdict,
      audio: audioVerdict,
      color: colorVerdict,
      isFullyCorrect,
    };
  }

  private evaluateModality(modalityId: ModalityId, input: TrialInput | undefined): ModalityVerdict {
    const isTarget = this.isTargetFor(modalityId);
    const responded = this.hasResponse(input, modalityId);
    const reactionTimeMs = this.getReactionTime(input, modalityId);
    const isLure = this.isLureFor(modalityId);
    const lureType = this.getLureType(modalityId);

    let result: TrialResult;
    if (isTarget) {
      result = responded ? 'hit' : 'miss';
    } else {
      result = responded ? 'falseAlarm' : 'correctRejection';
    }

    return {
      modality: modalityId,
      isTarget,
      responded,
      result,
      reactionTimeMs,
      isLure,
      lureType,
    };
  }

  private hasResponse(input: TrialInput | undefined, modalityId: ModalityId): boolean {
    return getHasResponse(input, modalityId);
  }

  private getReactionTime(input: TrialInput | undefined, modalityId: ModalityId): number | null {
    return getResponseRT(input, modalityId) ?? null;
  }

  // ===========================================================================
  // Factory
  // ===========================================================================

  /** Crée un TrialVO à partir d'un Trial brut */
  static from(trial: Trial): TrialVO {
    return new TrialVO(trial);
  }

  /** Retourne le Trial brut (pour sérialisation) */
  toRaw(): Trial {
    return this.trial;
  }
}
