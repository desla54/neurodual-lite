/**
 * Model-Based Property Tests for Scoring
 *
 * Ces tests simulent de vraies séquences de jeu et vérifient
 * que le scoring est cohérent avec le comportement du joueur.
 *
 * INVARIANTS TESTÉS:
 * 1. Joueur parfait (tous hits, zéro FA) → doit passer
 * 2. Joueur inactif (zéro réponses) → ne doit PAS passer
 * 3. Spammer (répond à tout) → ne doit PAS passer
 * 4. Plus de hits = meilleur score (monotonie)
 * 5. Plus de FA = pire score (monotonie)
 * 6. Score cohérent entre SDT, Jaeggi, BrainWorkshop
 */

import { describe, it } from 'bun:test';
import * as fc from 'fast-check';
import { SDTCalculator } from './helpers/sdt-calculator';
import { calculateTempoSessionPassed, checkJaeggiErrorsBelow } from './session-passed';
import {
  SDT_DPRIME_PASS,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  BW_SCORE_PASS_NORMALIZED,
} from '../../specs/thresholds';

// =============================================================================
// Arbitraries - Générateurs de données réalistes
// =============================================================================

/**
 * Génère un nombre de trials réaliste pour une session
 * (entre 20 et 50 trials scorables, comme dans le vrai jeu)
 */
const arbTrialCount = fc.integer({ min: 20, max: 50 });

/**
 * Génère un ratio de targets réaliste (25-40% des trials sont des targets)
 */
const arbTargetRatio = fc.double({ min: 0.25, max: 0.4, noNaN: true });

/**
 * Génère un taux de réponse (0-100%)
 */
const arbResponseRate = fc.double({ min: 0, max: 1, noNaN: true });

/**
 * Simule une session de jeu et retourne les counts SDT.
 *
 * @param totalTrials - Nombre total de trials scorables
 * @param targetRatio - Ratio de trials qui sont des targets
 * @param hitRate - P(réponse | target) - probabilité de détecter un target
 * @param faRate - P(réponse | non-target) - probabilité de fausse alarme
 */
function simulateSession(
  totalTrials: number,
  targetRatio: number,
  hitRate: number,
  faRate: number,
): { hits: number; misses: number; falseAlarms: number; correctRejections: number } {
  const targetTrials = Math.round(totalTrials * targetRatio);
  const noiseTrials = totalTrials - targetTrials;

  // Simuler les réponses aux targets
  const hits = Math.round(targetTrials * hitRate);
  const misses = targetTrials - hits;

  // Simuler les réponses aux non-targets
  const falseAlarms = Math.round(noiseTrials * faRate);
  const correctRejections = noiseTrials - falseAlarms;

  return { hits, misses, falseAlarms, correctRejections };
}

/**
 * Crée un input pour calculateTempoSessionPassed
 */
function createTempoInput(
  counts: { hits: number; misses: number; falseAlarms: number; correctRejections: number },
  generator = 'standard',
) {
  const dPrime = SDTCalculator.calculateDPrime(
    counts.hits,
    counts.misses,
    counts.falseAlarms,
    counts.correctRejections,
  );

  return {
    generator,
    byModality: {
      position: counts,
      audio: counts, // Dual modality, same performance
    },
    globalDPrime: dPrime,
  };
}

// =============================================================================
// INVARIANT 1: Joueur parfait → DOIT passer
// =============================================================================

describe('Model-Based: Joueur parfait', () => {
  it('détecte tous les targets sans fausses alarmes → passe (SDT)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Joueur parfait: hitRate=100%, faRate=0%
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 0.0);

        // Doit avoir des targets ET des non-targets pour que le test soit valide
        if (counts.hits === 0 || counts.correctRejections === 0) return true;

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        // Un joueur parfait DOIT avoir un d' élevé (bien au-dessus du seuil)
        return dPrime >= SDT_DPRIME_PASS;
      }),
      { numRuns: 500 },
    );
  });

  it('détecte tous les targets sans fausses alarmes → passe (Jaeggi)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 0.0);

        // Jaeggi: errors = misses + FA, joueur parfait a 0 erreurs
        const errors = counts.misses + counts.falseAlarms;
        return errors <= JAEGGI_MAX_ERRORS_PER_MODALITY;
      }),
      { numRuns: 500 },
    );
  });

  it('détecte tous les targets sans fausses alarmes → passe (BrainWorkshop)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 0.0);

        if (counts.hits === 0) return true; // Pas de targets = edge case

        // BW: H / (H + M + FA) = H / H = 1.0 (parfait)
        const bwScore = counts.hits / (counts.hits + counts.misses + counts.falseAlarms);
        return bwScore >= BW_SCORE_PASS_NORMALIZED;
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// INVARIANT 2: Joueur inactif → ne doit PAS passer
// =============================================================================

describe('Model-Based: Joueur inactif (anti-gaming)', () => {
  it('ne répond jamais → d-prime = 0', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Joueur inactif: hitRate=0%, faRate=0%
        const counts = simulateSession(totalTrials, targetRatio, 0.0, 0.0);

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        // Anti-gaming: joueur inactif doit avoir d' = 0
        return dPrime === 0;
      }),
      { numRuns: 500 },
    );
  });

  it('ne répond jamais → ne passe pas (SDT)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 0.0, 0.0);
        const input = createTempoInput(counts, 'standard');

        return !calculateTempoSessionPassed(input);
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// INVARIANT 3: Spammer → ne doit PAS passer
// =============================================================================

describe('Model-Based: Spammer (anti-gaming)', () => {
  it('répond à tout → d-prime = 0', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Spammer: hitRate=100%, faRate=100%
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 1.0);

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        // Anti-gaming: spammer doit avoir d' = 0 (CR = 0)
        return dPrime === 0;
      }),
      { numRuns: 500 },
    );
  });

  it('répond à tout → ne passe pas (SDT)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 1.0);
        const input = createTempoInput(counts, 'standard');

        return !calculateTempoSessionPassed(input);
      }),
      { numRuns: 500 },
    );
  });

  it('répond à tout → échoue Jaeggi (trop de FA)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 1.0, 1.0);

        // Spammer a beaucoup de FA (tous les non-targets)
        const noiseTrials = totalTrials - Math.round(totalTrials * targetRatio);

        // Si assez de non-targets, les FA dépassent le seuil Jaeggi
        if (noiseTrials > JAEGGI_MAX_ERRORS_PER_MODALITY) {
          return !checkJaeggiErrorsBelow({ position: counts });
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// INVARIANT 4: Monotonie - Plus de hits = meilleur score
// =============================================================================

describe('Model-Based: Monotonie des hits', () => {
  it('augmenter hitRate (à faRate constant) → d-prime augmente ou reste stable', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        arbTargetRatio,
        fc.double({ min: 0, max: 0.5, noNaN: true }), // hitRate1
        fc.double({ min: 0.5, max: 1, noNaN: true }), // hitRate2 > hitRate1
        fc.double({ min: 0, max: 0.3, noNaN: true }), // faRate constant
        (totalTrials, targetRatio, hitRate1, hitRate2, faRate) => {
          const counts1 = simulateSession(totalTrials, targetRatio, hitRate1, faRate);
          const counts2 = simulateSession(totalTrials, targetRatio, hitRate2, faRate);

          // Skip si pas de données valides
          if (counts1.hits + counts1.misses === 0 || counts2.hits + counts2.misses === 0)
            return true;
          if (counts1.falseAlarms + counts1.correctRejections === 0) return true;
          if (counts2.falseAlarms + counts2.correctRejections === 0) return true;

          const dPrime1 = SDTCalculator.calculateDPrime(
            counts1.hits,
            counts1.misses,
            counts1.falseAlarms,
            counts1.correctRejections,
          );
          const dPrime2 = SDTCalculator.calculateDPrime(
            counts2.hits,
            counts2.misses,
            counts2.falseAlarms,
            counts2.correctRejections,
          );

          // Plus de hits (hitRate2 > hitRate1) → d' plus élevé
          // Tolérance pour les arrondis
          return dPrime2 >= dPrime1 - 0.1;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('augmenter hitRate → BW score augmente', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        arbTargetRatio,
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        (totalTrials, targetRatio, hitRate1, hitRate2, faRate) => {
          const counts1 = simulateSession(totalTrials, targetRatio, hitRate1, faRate);
          const counts2 = simulateSession(totalTrials, targetRatio, hitRate2, faRate);

          const denom1 = counts1.hits + counts1.misses + counts1.falseAlarms;
          const denom2 = counts2.hits + counts2.misses + counts2.falseAlarms;

          if (denom1 === 0 || denom2 === 0) return true;

          const bw1 = counts1.hits / denom1;
          const bw2 = counts2.hits / denom2;

          // Plus de hits → meilleur score BW
          return bw2 >= bw1 - 0.01;
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// =============================================================================
// INVARIANT 5: Monotonie - Plus de FA = pire score
// =============================================================================

describe('Model-Based: Monotonie des fausses alarmes', () => {
  it('augmenter faRate (à hitRate constant) → d-prime diminue ou reste stable', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        arbTargetRatio,
        fc.double({ min: 0.5, max: 1, noNaN: true }), // hitRate constant (bon joueur)
        fc.double({ min: 0, max: 0.3, noNaN: true }), // faRate1 (peu de FA)
        fc.double({ min: 0.3, max: 0.8, noNaN: true }), // faRate2 > faRate1
        (totalTrials, targetRatio, hitRate, faRate1, faRate2) => {
          const counts1 = simulateSession(totalTrials, targetRatio, hitRate, faRate1);
          const counts2 = simulateSession(totalTrials, targetRatio, hitRate, faRate2);

          // Skip edge cases
          if (counts1.hits === 0 || counts2.hits === 0) return true;
          if (counts1.correctRejections === 0 || counts2.correctRejections === 0) return true;

          const dPrime1 = SDTCalculator.calculateDPrime(
            counts1.hits,
            counts1.misses,
            counts1.falseAlarms,
            counts1.correctRejections,
          );
          const dPrime2 = SDTCalculator.calculateDPrime(
            counts2.hits,
            counts2.misses,
            counts2.falseAlarms,
            counts2.correctRejections,
          );

          // Plus de FA (faRate2 > faRate1) → d' plus bas
          return dPrime1 >= dPrime2 - 0.1;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('augmenter faRate → Jaeggi errors augmentent', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        arbTargetRatio,
        fc.double({ min: 0.8, max: 1, noNaN: true }), // hitRate constant
        fc.double({ min: 0, max: 0.2, noNaN: true }), // faRate1
        fc.double({ min: 0.5, max: 1, noNaN: true }), // faRate2 > faRate1
        (totalTrials, targetRatio, hitRate, faRate1, faRate2) => {
          const counts1 = simulateSession(totalTrials, targetRatio, hitRate, faRate1);
          const counts2 = simulateSession(totalTrials, targetRatio, hitRate, faRate2);

          const errors1 = counts1.misses + counts1.falseAlarms;
          const errors2 = counts2.misses + counts2.falseAlarms;

          // Plus de FA → plus d'erreurs Jaeggi
          return errors2 >= errors1;
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// =============================================================================
// INVARIANT 6: Cohérence entre stratégies
// =============================================================================

describe('Model-Based: Cohérence entre stratégies de scoring', () => {
  /**
   * DÉCOUVERTE: BrainWorkshop est plus strict que SDT pour les joueurs
   * avec un faible ratio de targets. La formule H/(H+M+FA) pénalise
   * fortement les FA quand il y a peu de targets.
   *
   * Pour passer BW à 80%: H >= 4*(M+FA)
   * Avec 1 miss et 2 FA, il faut au moins 12 hits.
   */
  it('joueur quasi-parfait passe SDT', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Joueur quasi-parfait: 98% hitRate, 2% faRate
        const counts = simulateSession(totalTrials, targetRatio, 0.98, 0.02);

        if (counts.hits + counts.misses < 10) return true;
        if (counts.falseAlarms + counts.correctRejections < 10) return true;

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        // SDT devrait passer pour un joueur quasi-parfait
        return dPrime >= SDT_DPRIME_PASS;
      }),
      { numRuns: 500 },
    );
  });

  it('BW est plus strict que SDT quand targetRatio est bas', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        fc.double({ min: 0.25, max: 0.3, noNaN: true }), // Bas ratio de targets
        (totalTrials, targetRatio) => {
          // Joueur "bon" mais pas parfait
          const counts = simulateSession(totalTrials, targetRatio, 0.9, 0.1);

          if (counts.hits + counts.misses < 10) return true;
          if (counts.falseAlarms + counts.correctRejections < 10) return true;

          const dPrime = SDTCalculator.calculateDPrime(
            counts.hits,
            counts.misses,
            counts.falseAlarms,
            counts.correctRejections,
          );

          const bwScore = counts.hits / (counts.hits + counts.misses + counts.falseAlarms);

          // Avec un bas targetRatio, BW peut échouer même si SDT passe
          // C'est un comportement ATTENDU, pas un bug
          const passSDT = dPrime >= SDT_DPRIME_PASS;
          const passBW = bwScore >= BW_SCORE_PASS_NORMALIZED;

          // Si SDT passe et BW échoue, c'est normal avec bas targetRatio
          // Si BW passe, SDT devrait aussi passer
          if (passBW) {
            return passSDT;
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('joueur médiocre échoue avec TOUTES les stratégies', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Joueur médiocre: 30% hitRate, 40% faRate
        const counts = simulateSession(totalTrials, targetRatio, 0.3, 0.4);

        if (counts.hits + counts.misses < 10) return true;
        if (counts.falseAlarms + counts.correctRejections < 10) return true;

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        const bwScore = counts.hits / (counts.hits + counts.misses + counts.falseAlarms);

        // Joueur médiocre ne devrait pas passer
        const failSDT = dPrime < SDT_DPRIME_PASS;
        const failBW = bwScore < BW_SCORE_PASS_NORMALIZED;

        return failSDT && failBW;
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// INVARIANT 7: Réponses aléatoires → proche du hasard
// =============================================================================

describe('Model-Based: Joueur aléatoire', () => {
  it('répond au hasard (50/50) → d-prime proche de 0', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        // Joueur aléatoire: 50% hitRate, 50% faRate
        const counts = simulateSession(totalTrials, targetRatio, 0.5, 0.5);

        if (counts.hits === 0 || counts.correctRejections === 0) return true;

        const dPrime = SDTCalculator.calculateDPrime(
          counts.hits,
          counts.misses,
          counts.falseAlarms,
          counts.correctRejections,
        );

        // Joueur aléatoire devrait avoir d' proche de 0 (entre -0.5 et 0.5)
        return Math.abs(dPrime) < 0.5;
      }),
      { numRuns: 500 },
    );
  });

  it('répond au hasard → ne passe pas (SDT)', () => {
    fc.assert(
      fc.property(arbTrialCount, arbTargetRatio, (totalTrials, targetRatio) => {
        const counts = simulateSession(totalTrials, targetRatio, 0.5, 0.5);

        if (counts.hits === 0 || counts.correctRejections === 0) return true;

        const input = createTempoInput(counts, 'standard');
        return !calculateTempoSessionPassed(input);
      }),
      { numRuns: 500 },
    );
  });
});

// =============================================================================
// INVARIANT 8: Progression réaliste
// =============================================================================

describe('Model-Based: Progression réaliste du joueur', () => {
  it('amélioration graduelle → scores progressent', () => {
    fc.assert(
      fc.property(
        arbTrialCount,
        arbTargetRatio,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 5, maxLength: 10 }),
        (totalTrials, targetRatio, improvements) => {
          // Simuler une progression: hitRate augmente, faRate diminue
          const sortedImprovements = [...improvements].sort((a, b) => a - b);

          const scores: number[] = [];

          for (const improvement of sortedImprovements) {
            const hitRate = 0.3 + improvement * 0.6; // 30% → 90%
            const faRate = 0.4 - improvement * 0.35; // 40% → 5%

            const counts = simulateSession(totalTrials, targetRatio, hitRate, Math.max(0, faRate));

            if (counts.hits === 0 || counts.correctRejections === 0) continue;

            const dPrime = SDTCalculator.calculateDPrime(
              counts.hits,
              counts.misses,
              counts.falseAlarms,
              counts.correctRejections,
            );

            scores.push(dPrime);
          }

          if (scores.length < 2) return true;

          // Les scores devraient globalement augmenter
          // (avec tolérance pour les variations dues aux arrondis)
          const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
          const secondHalf = scores.slice(Math.floor(scores.length / 2));

          const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

          return avgSecond >= avgFirst - 0.2;
        },
      ),
      { numRuns: 300 },
    );
  });
});
