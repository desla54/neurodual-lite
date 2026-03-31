/**
 * Journey Constants - Parcours d'Entraînement
 *
 * Génère dynamiquement les étapes du parcours selon l'objectif de niveau.
 * 4 modes par niveau: Label → Flow → Rappel → Réflexe
 *
 * Les constantes de base sont dans specs/journey.spec.ts (Single Source of Truth).
 */

import type { JourneyStageDefinition, JourneyModeType } from '../../types/journey';
import {
  JOURNEY_MODES_PER_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_MAX_LEVEL,
} from '../../types/journey';

// Re-export depuis la spec (Single Source of Truth)
export {
  ALTERNATING_JOURNEY_FIRST_MODE,
  ALTERNATING_JOURNEY_SECOND_MODE,
  getAcceptedGameModesForJourney,
  JOURNEY_MIN_PASSING_SCORE,
  JOURNEY_SCORE_THRESHOLDS,
  getSessionsRequired,
  getFirstPremiumStage,
  getTotalStages as getTotalStagesFromSpec,
  isAlternatingJourneyMode,
  isSimulatorMode,
} from '../../specs/journey.spec';

// Import pour utilisation locale
import { JOURNEY_PREMIUM_N_THRESHOLD } from '../../specs/journey.spec';
export { JOURNEY_PREMIUM_N_THRESHOLD };

// =============================================================================
// Génération dynamique des étapes
// =============================================================================

/**
 * Génère les étapes pour un parcours simulateur.
 * 1 stage par niveau N (mode 'simulator').
 *
 * @param targetLevel - Niveau N cible (1-10)
 * @param startLevel - Niveau N de départ (1-10, défaut: 1)
 * @param _isSimulator - Ignoré (toujours simulateur). Gardé pour compat signature.
 * @returns Liste des étapes du parcours
 *
 * Exemple pour startLevel=2, targetLevel=5:
 * - 4 niveaux × 1 mode = 4 étapes
 * - Étape 1: N-2 (simulator)
 * - Étape 2: N-3 (simulator)
 * - Étape 3: N-4 (simulator)
 * - Étape 4: N-5 (simulator)
 */
export function generateJourneyStages(
  targetLevel: number,
  startLevel: number = JOURNEY_DEFAULT_START_LEVEL,
  isSimulator: boolean = false,
): JourneyStageDefinition[] {
  const validTarget = Math.max(1, Math.min(targetLevel, JOURNEY_MAX_LEVEL));
  const validStart = Math.max(1, Math.min(startLevel, validTarget));
  const stages: JourneyStageDefinition[] = [];

  let stageId = 1;
  const modes: JourneyModeType[] = isSimulator ? ['simulator'] : ['pick', 'place', 'memo', 'catch'];

  for (let nLevel = validStart; nLevel <= validTarget; nLevel++) {
    for (const mode of modes) {
      stages.push({ stageId, nLevel, mode });
      stageId++;
    }
  }

  return stages;
}

/**
 * Calcule le nombre total d'étapes pour un parcours.
 * @param isSimulator - Si true, 1 stage par niveau; sinon 4 stages par niveau
 */
export function getTotalStagesForTarget(
  targetLevel: number,
  startLevel: number = JOURNEY_DEFAULT_START_LEVEL,
  isSimulator: boolean = false,
): number {
  const validTarget = Math.max(1, Math.min(targetLevel, JOURNEY_MAX_LEVEL));
  const validStart = Math.max(1, Math.min(startLevel, validTarget));
  const stagesPerLevel = isSimulator ? 1 : JOURNEY_MODES_PER_LEVEL;
  return (validTarget - validStart + 1) * stagesPerLevel;
}

/**
 * Récupère la définition d'une étape par son ID pour un parcours donné.
 */
export function getStageDefinition(
  stageId: number,
  targetLevel: number = JOURNEY_DEFAULT_TARGET_LEVEL,
  startLevel: number = JOURNEY_DEFAULT_START_LEVEL,
  isSimulator: boolean = false,
): JourneyStageDefinition | undefined {
  const stages = generateJourneyStages(targetLevel, startLevel, isSimulator);
  return stages.find((s) => s.stageId === stageId);
}

/**
 * Vérifie si une étape nécessite le premium.
 * Premium est requis pour les niveaux N >= JOURNEY_PREMIUM_N_THRESHOLD (N-4+).
 * @param stageDef - Définition de l'étape (contient nLevel)
 */
export function isStageRequiresPremium(stageIdOrDef: number | JourneyStageDefinition): boolean {
  if (typeof stageIdOrDef === 'object') {
    return stageIdOrDef.nLevel >= JOURNEY_PREMIUM_N_THRESHOLD;
  }
  // Legacy fallback: stageId = nLevel in simulator journey (1 stage/level)
  return stageIdOrDef >= JOURNEY_PREMIUM_N_THRESHOLD;
}
