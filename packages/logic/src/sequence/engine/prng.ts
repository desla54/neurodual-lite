/**
 * PRNG - Pseudo-Random Number Generator
 *
 * Générateur aléatoire déterministe pour reproductibilité.
 * Utilise mulberry32, rapide et de bonne qualité.
 */

import type { RandomState } from '../types';

/**
 * Interface du générateur aléatoire.
 */
export interface PRNG {
  /** Retourne un nombre entre 0 et 1 (exclusif) */
  random(): number;
  /** Retourne un entier entre 0 et max (exclusif) */
  randomInt(max: number): number;
  /** Retourne un élément aléatoire du tableau */
  randomElement<T>(array: readonly T[]): T;
  /** Mélange un tableau (Fisher-Yates) */
  shuffle<T>(array: readonly T[]): T[];
  /** Retourne l'état actuel (pour persistence) */
  getState(): RandomState;
}

/**
 * Crée un hash 32-bit depuis une string (djb2).
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Crée un PRNG depuis une seed et un état optionnel.
 */
export function createPRNG(seed: string, state?: RandomState): PRNG {
  let currentState = hashString(seed);
  let callCount = state?.callCount ?? 0;

  // Si on restaure un état, avancer le générateur
  if (state && state.callCount > 0) {
    for (let i = 0; i < state.callCount; i++) {
      mulberry32Step();
    }
  }

  /**
   * Mulberry32 - un pas de génération.
   */
  function mulberry32Step(): number {
    currentState += 0x6d2b79f5;
    let t = currentState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function random(): number {
    callCount++;
    return mulberry32Step();
  }

  function randomInt(max: number): number {
    return Math.floor(random() * max);
  }

  function randomElement<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const element = array[randomInt(array.length)];
    if (element === undefined) {
      throw new Error('Unexpected undefined element');
    }
    return element;
  }

  function shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const temp = result[i];
      const swapVal = result[j];
      if (temp !== undefined && swapVal !== undefined) {
        result[i] = swapVal;
        result[j] = temp;
      }
    }
    return result;
  }

  function getState(): RandomState {
    return { seed, callCount };
  }

  return {
    random,
    randomInt,
    randomElement,
    shuffle,
    getState,
  };
}
