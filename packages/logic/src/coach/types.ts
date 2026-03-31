/**
 * Coach Types - Re-export depuis types/ + helpers
 *
 * @deprecated Importer les types directement depuis '../types' à la place.
 */

import type { ModalityId, ResponseRecord } from '../types';

// Re-export tous les types depuis types/coach
export * from '../types/coach';

// =============================================================================
// Helpers (restent ici car contiennent de la logique)
// =============================================================================

import type { TrialResponse } from '../types/coach';

export function getResponseForModality(
  response: TrialResponse,
  modalityId: ModalityId,
): ResponseRecord {
  return response.responses.get(modalityId) ?? { pressed: false, rt: null };
}
