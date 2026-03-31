/**
 * Journey Router - Navigation centralisée par mode de jeu
 *
 * Ce module gère le mapping entre les modes de jeu et les routes.
 * Utilisé pour naviguer correctement vers la prochaine étape du parcours.
 *
 * Les mappings sont dans specs/journey.spec.ts (Single Source of Truth).
 */

import type { JourneyStageDefinition, JourneyConfig } from '../../types/journey';
import { GAME_MODE_TO_ROUTE } from '../../specs/journey.spec';

// =============================================================================
// Types
// =============================================================================

/**
 * Routes disponibles pour les sessions de jeu.
 */
export type JourneyRoute =
  | '/nback'
  | '/dual-place'
  | '/dual-memo'
  | '/dual-pick'
  | '/dual-trace'
  | '/dual-track'
  | '/dual-time'
  | '/corsi-block'
  | '/ospan'
  | '/running-span'
  | '/pasat'
  | '/swm';

/**
 * Paramètres de navigation pour une étape.
 */
export interface JourneyNavigationParams {
  /** Route cible */
  route: JourneyRoute;
  /** État à passer à la navigation (React Router state) */
  state: {
    journeyId: string;
    stageId: number;
    nLevel: number;
    gameMode?: string;
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Détermine la route pour une étape du parcours.
 *
 * @param stage - Définition de l'étape
 * @param gameMode - Mode de jeu optionnel (pour simulateurs)
 * @returns Route cible
 *
 * @example
 * ```ts
 * const stage = { stageId: 1, nLevel: 2, mode: 'place' };
 * const route = getJourneyRoute(stage);
 * // route === '/dual-place'
 * ```
 */
export function getJourneyRoute(_stage: JourneyStageDefinition, gameMode?: string): JourneyRoute {
  // Simulateurs: route déterminée par gameMode
  if (gameMode) {
    return GAME_MODE_TO_ROUTE[gameMode] ?? '/nback';
  }
  // Fallback: tous les modes journey actifs vont sur /nback
  return '/nback';
}

/**
 * Construit les paramètres de navigation complets pour une étape.
 *
 * @param stage - Définition de l'étape
 * @param config - Configuration du journey (avec journeyId)
 * @returns Paramètres de navigation (route + state)
 *
 * @example
 * ```ts
 * const params = buildNavigationParams(stage, { journeyId: 'abc', startLevel: 1, targetLevel: 5 });
 * navigate(params.route, { state: params.state });
 * ```
 */
export function buildNavigationParams(
  stage: JourneyStageDefinition,
  config: JourneyConfig,
): JourneyNavigationParams {
  const route = getJourneyRoute(stage, config.gameMode);

  return {
    route,
    state: {
      journeyId: config.journeyId,
      stageId: stage.stageId,
      nLevel: stage.nLevel,
      gameMode: config.gameMode,
    },
  };
}

/**
 * Vérifie si un gameMode nécessite une route spécifique.
 *
 * @param gameMode - Mode de jeu
 * @returns true si le mode a une route dédiée
 */
export function hasSpecificRoute(gameMode: string): boolean {
  return gameMode in GAME_MODE_TO_ROUTE;
}

/**
 * Retourne la route pour un gameMode donné.
 *
 * @param gameMode - Mode de jeu
 * @returns Route correspondante, ou '/nback' par défaut
 */
export function getRouteForGameMode(gameMode: string): JourneyRoute {
  return GAME_MODE_TO_ROUTE[gameMode] ?? '/nback';
}
