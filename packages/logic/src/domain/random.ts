/**
 * Seeded Random Number Generator
 *
 * Permet la reproductibilité des séquences générées.
 * Utilise l'algorithme Mulberry32 (rapide, bonne distribution).
 */

export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    this.state = this.hashString(seed);
  }

  /**
   * Hash une string en un nombre (djb2 algorithm)
   */
  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  /**
   * Génère un nombre entre 0 et 1 (exclusif)
   * Mulberry32 algorithm
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Génère un entier entre min (inclus) et max (exclus)
   */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Sélectionne un élément aléatoire d'un tableau
   */
  choice<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.int(0, array.length)] as T;
  }

  /**
   * Sélectionne un élément différent de `exclude`
   */
  choiceExcluding<T>(array: readonly T[], exclude?: T): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    if (array.length === 1) {
      return array[0] as T;
    }

    let attempts = 0;
    let choice = this.choice(array);

    while (exclude !== undefined && choice === exclude && attempts < 100) {
      choice = this.choice(array);
      attempts++;
    }

    return choice;
  }

  /**
   * Mélange un tableau en place (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [array[i], array[j]] = [array[j] as T, array[i] as T];
    }
    return array;
  }

  /**
   * Génère une valeur selon la distribution Beta(alpha, beta).
   *
   * Utilisé par Brain Workshop pour Variable N-Back:
   * - alpha = n/2, beta = 1
   * - Génère des valeurs biaisées vers le bas
   *
   * Implementation:
   * - Si beta = 1: utilise la formule simplifiée u^(1/alpha)
   * - Sinon: utilise l'algorithme de Jöhnk ou Gamma variates
   *
   * @param alpha Premier paramètre (> 0)
   * @param beta Deuxième paramètre (> 0)
   * @returns Valeur entre 0 et 1
   */
  beta(alpha: number, beta: number): number {
    if (alpha <= 0 || beta <= 0) {
      throw new Error('Beta distribution parameters must be positive');
    }

    // Cas spécial optimisé: beta = 1 (très courant pour BW Variable N-Back)
    // B(a, 1) a une CDF inverse simple: u^(1/a)
    if (beta === 1) {
      return this.next() ** (1 / alpha);
    }

    // Cas spécial: alpha = 1
    // B(1, b) a une CDF inverse simple: 1 - (1-u)^(1/b)
    if (alpha === 1) {
      return 1 - (1 - this.next()) ** (1 / beta);
    }

    // Cas général: Algorithme basé sur les variates Gamma
    // Beta(a, b) = Gamma(a) / (Gamma(a) + Gamma(b))
    const gammaA = this.gamma(alpha);
    const gammaB = this.gamma(beta);
    return gammaA / (gammaA + gammaB);
  }

  /**
   * Génère une valeur selon la distribution Gamma(shape, scale=1).
   *
   * Implémentation de l'algorithme de Marsaglia et Tsang (2000).
   * Rapide et précis pour shape >= 1.
   * Pour shape < 1, utilise la transformation: Gamma(a) = Gamma(a+1) * U^(1/a)
   *
   * @param shape Paramètre de forme (> 0)
   * @returns Valeur >= 0
   */
  private gamma(shape: number): number {
    if (shape <= 0) {
      throw new Error('Gamma shape parameter must be positive');
    }

    // Pour shape < 1, utilise la transformation
    if (shape < 1) {
      return this.gamma(shape + 1) * this.next() ** (1 / shape);
    }

    // Algorithme de Marsaglia et Tsang pour shape >= 1
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      // Générer une normale standard via Box-Muller
      do {
        x = this.standardNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this.next();

      // Test d'acceptation principal (très efficace)
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      // Test d'acceptation secondaire
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Génère une valeur normale standard (moyenne=0, écart-type=1).
   * Utilise l'algorithme Box-Muller.
   */
  private standardNormal(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Génère un UUID v4 standard via crypto.randomUUID()
 */
export function generateId(): string {
  return crypto.randomUUID();
}
