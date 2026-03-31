/**
 * Flexible Generator Strategy
 *
 * Base pour les générateurs utilisant FlexibleTrial.
 * Supporte n'importe quelle combinaison de modalités.
 */

import type { FlexibleTrial, ModalityId, StimulusValue } from '../modality';
import { createStimulus, FlexibleTrialBuilder, modalityRegistry } from '../modality';
import type { SeededRandom } from '../random';
import { LureDetector } from './helpers/lure-detector';

// =============================================================================
// Helpers pour génération de flux
// =============================================================================

/**
 * Génère un flux de valeurs pour une modalité
 */
export function generateModalityStream(
  rng: SeededRandom,
  modalityId: ModalityId,
  length: number,
  nLevel: number,
  isActive: boolean,
  targetProb: number,
  lureProb: number,
): StimulusValue[] {
  const modality = modalityRegistry.get(modalityId);
  const pool = modality.pool;

  // Modalité inactive : valeur constante
  if (!isActive) {
    const fixed = modality.defaultValue ?? pool[0];
    if (fixed === undefined) {
      throw new Error(`Empty pool and no default value for modality: ${modalityId}`);
    }
    return Array(length).fill(fixed);
  }

  const stream: StimulusValue[] = [];

  for (let i = 0; i < length; i++) {
    const isBuffer = i < nLevel;
    const nBackIdx = i - nLevel;
    const nBackVal = stream[nBackIdx];

    // Buffer ou pas d'historique : aléatoire
    if (isBuffer || nBackVal === undefined) {
      stream.push(rng.choice(pool));
      continue;
    }

    // Décision target
    if (rng.next() < targetProb) {
      stream.push(nBackVal);
      continue;
    }

    // Décision lure (n-1)
    if (lureProb > 0 && rng.next() < lureProb) {
      const lureVal = stream[i - 1];
      if (lureVal !== undefined && lureVal !== nBackVal) {
        stream.push(lureVal);
        continue;
      }
    }

    // Non-cible : valeur différente de nBack
    stream.push(rng.choiceExcluding(pool, nBackVal));
  }

  return stream;
}

/**
 * Assemble un FlexibleTrial à partir des flux
 */
export function assembleFlexibleTrial(
  index: number,
  nLevel: number,
  activeModalities: ModalityId[],
  streams: Map<ModalityId, StimulusValue[]>,
): FlexibleTrial {
  const isBuffer = index < nLevel;
  const nBackIdx = index - nLevel;
  const builder = new FlexibleTrialBuilder().setIndex(index).setBuffer(isBuffer);

  for (const modalityId of activeModalities) {
    const stream = streams.get(modalityId);
    if (!stream) continue;

    const value = stream[index];
    if (value === undefined) continue;

    const nBackVal = stream[nBackIdx];
    const isTarget = !isBuffer && value === nBackVal;
    const lureType = isBuffer ? null : LureDetector.detect(value, stream, index, nLevel, isTarget);

    builder.addStimulus(
      createStimulus(modalityId, value, isTarget, lureType !== null, lureType ?? undefined),
    );
  }

  return builder.build();
}
