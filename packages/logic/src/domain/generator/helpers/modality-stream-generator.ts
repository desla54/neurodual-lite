/**
 * ModalityStreamGenerator - Génération de flux pour les modalités N-Back
 *
 * Classe utilitaire OOP pour générer des séquences de valeurs
 * avec gestion des cibles et leurres.
 *
 * Modes de génération:
 * - 'exclusive': Cibles et leurres mutuellement exclusifs (BrainWorkshop)
 * - 'independent': Cibles et leurres décidés indépendamment (Libre)
 *
 * Utilisée par: BrainWorkshopStrategy, LibreStrategy
 */

import type { SeededRandom } from '../../random';

/**
 * Mode de génération du flux
 * - exclusive: Si cible, pas de lure (BrainWorkshop classique)
 * - independent: Cible et lure peuvent coexister (mode Libre)
 */
export type StreamMode = 'exclusive' | 'independent';

/**
 * Générateur de flux pour une modalité unique.
 * Encapsule la logique de génération avec gestion des cibles et leurres.
 */
export class ModalityStreamGenerator {
  constructor(private readonly rng: SeededRandom) {}

  /**
   * Génère un flux de valeurs pour une modalité.
   *
   * @param pool - Ensemble des valeurs possibles (POSITIONS, SOUNDS, COLORS)
   * @param length - Longueur totale du flux (nLevel + trialsCount)
   * @param nLevel - Niveau N du jeu (1-back, 2-back, etc.)
   * @param isActive - Si la modalité est active dans cette session
   * @param targetProb - Probabilité de cible (0-1)
   * @param lureProb - Probabilité de leurre (0-1)
   * @param mode - Mode de génération (exclusive ou independent)
   * @param defaultValue - Valeur par défaut si modalité inactive
   * @returns Flux de valeurs générées
   *
   * @example
   * ```ts
   * const generator = new ModalityStreamGenerator(rng);
   * const posStream = generator.generateStream(
   *   POSITIONS,
   *   25, // 2 + 23 trials
   *   2,  // 2-back
   *   true,
   *   0.25, // 25% targets
   *   0.15, // 15% lures
   *   'exclusive'
   * );
   * ```
   */
  generateStream<T>(
    pool: readonly T[],
    length: number,
    nLevel: number,
    isActive: boolean,
    targetProb: number,
    lureProb: number,
    mode: StreamMode = 'exclusive',
    defaultValue?: T,
  ): T[] {
    // Modalité inactive : valeur constante
    if (!isActive) {
      return this.generateInactiveStream(pool, length, defaultValue);
    }

    const stream: T[] = [];

    for (let i = 0; i < length; i++) {
      const value = this.generateValue(stream, pool, i, nLevel, targetProb, lureProb, mode);
      stream.push(value);
    }

    return stream;
  }

  /**
   * Génère un flux constant pour une modalité inactive
   */
  private generateInactiveStream<T>(pool: readonly T[], length: number, defaultValue?: T): T[] {
    const fixed = defaultValue ?? pool[0];
    if (fixed === undefined) {
      throw new Error('Empty pool and no default value');
    }
    return Array(length).fill(fixed);
  }

  /**
   * Génère une valeur unique à l'index donné
   */
  private generateValue<T>(
    stream: readonly T[],
    pool: readonly T[],
    index: number,
    nLevel: number,
    targetProb: number,
    lureProb: number,
    mode: StreamMode,
  ): T {
    const isBuffer = index < nLevel;
    const nBackIdx = index - nLevel;
    const nBackVal = stream[nBackIdx];

    // Buffer ou pas d'historique n-back : aléatoire
    if (isBuffer || nBackVal === undefined) {
      return this.rng.choice(pool);
    }

    // Génération selon le mode
    if (mode === 'exclusive') {
      return this.generateExclusiveValue(stream, pool, index, nBackVal, targetProb, lureProb);
    }
    return this.generateIndependentValue(stream, pool, index, nBackVal, targetProb, lureProb);
  }

  /**
   * Mode exclusif: cibles et leurres mutuellement exclusifs (BrainWorkshop)
   */
  private generateExclusiveValue<T>(
    stream: readonly T[],
    pool: readonly T[],
    index: number,
    nBackVal: T,
    targetProb: number,
    lureProb: number,
  ): T {
    // Décision target
    if (this.rng.next() < targetProb) {
      return nBackVal;
    }

    // Décision lure (n-1) seulement si pas target
    if (lureProb > 0 && this.rng.next() < lureProb) {
      const lureVal = stream[index - 1];
      if (lureVal !== undefined && lureVal !== nBackVal) {
        return lureVal;
      }
    }

    // Non-cible : valeur différente de nBack
    return this.rng.choiceExcluding(pool, nBackVal);
  }

  /**
   * Mode indépendant: cibles et leurres décidés séparément (Libre)
   */
  private generateIndependentValue<T>(
    stream: readonly T[],
    pool: readonly T[],
    index: number,
    nBackVal: T,
    targetProb: number,
    lureProb: number,
  ): T {
    // Décisions INDÉPENDANTES
    const shouldBeTarget = this.rng.next() < targetProb;
    const shouldBeLure = this.rng.next() < lureProb;

    // Priorité 1: Target (répète n-back)
    if (shouldBeTarget) {
      return nBackVal;
    }

    // Priorité 2: Lure (répète n-1)
    if (shouldBeLure && index >= 1) {
      const lureVal = stream[index - 1];
      if (lureVal !== undefined) {
        // En mode indépendant, on accepte même si lureVal === nBackVal
        return lureVal;
      }
    }

    // Sinon: Non-cible aléatoire (différent de nBack si possible)
    if (pool.length > 1) {
      return this.rng.choiceExcluding(pool, nBackVal);
    }
    return this.rng.choice(pool);
  }
}
