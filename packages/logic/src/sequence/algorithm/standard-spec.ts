import type { ConstraintSpec, LureSpec, ModalitySpec, SequenceSpec } from '../types';
import { COLORS, POSITIONS, SOUNDS } from '../../types/core';

export function buildStandardModalities(modalityIds: readonly string[]): ModalitySpec[] {
  const result: ModalitySpec[] = [];

  for (const id of modalityIds) {
    switch (id) {
      case 'position':
        result.push({ id, values: POSITIONS.length });
        break;
      case 'audio':
        result.push({ id, values: SOUNDS });
        break;
      case 'color':
        result.push({ id, values: COLORS });
        break;
      default:
      // Ignore unknown modalities (not supported by legacy Trial adapter)
    }
  }

  // Fallback to classic dual if empty
  if (result.length === 0) {
    return [
      { id: 'position', values: POSITIONS.length },
      { id: 'audio', values: SOUNDS },
    ];
  }

  return result;
}

export function buildUniformTargetProbabilities(
  modalityIds: readonly string[],
  pTarget: number,
): SequenceSpec['targetProbabilities'] {
  const targetProbabilities: Record<string, number> = {};
  for (const id of modalityIds) {
    targetProbabilities[id] = pTarget;
  }
  return targetProbabilities;
}

export function buildUniformLureProbabilities(
  modalityIds: readonly string[],
  pLureN1: number,
  pLureN2 = 0,
): SequenceSpec['lureProbabilities'] {
  const lureProbabilities: Record<string, LureSpec> = {};
  for (const id of modalityIds) {
    lureProbabilities[id] = {
      ...(pLureN1 > 0 ? { 'n-1': pLureN1 } : {}),
      ...(pLureN2 > 0 ? { 'n+1': pLureN2 } : {}),
    };
  }
  return lureProbabilities;
}

export function buildNoImmediateRepeatConstraints(
  modalityIds: readonly string[],
): ConstraintSpec[] {
  return modalityIds.map((modalityId) => ({
    type: 'no-immediate-repeat',
    params: { modalityId },
  }));
}
