/**
 * Rule tutorials for Visual Logic.
 *
 * Defines interstitial tutorials shown before the first encounter
 * of advanced rule types during an adaptive measure session.
 *
 * Three tutorial gates:
 * - Level 17: Logic rules (XOR, AND, OR)
 * - Level 21: Mesh overlay (line patterns)
 * - Level 29: Meta-rules (cross_attribute, meta_cycle)
 *
 * The UI layer is responsible for:
 * - Persisting which tutorials have been seen (localStorage / PowerSync)
 * - Rendering the tutorial content using i18n keys
 * - Pausing the protocol while the tutorial is displayed
 */

import type { RuleId } from './types';

// ---------------------------------------------------------------------------
// Tutorial definitions
// ---------------------------------------------------------------------------

export interface RuleTutorialGate {
  /** Unique ID for persistence */
  readonly id: string;
  /** Level at which this tutorial triggers (first time reaching this level) */
  readonly triggerLevel: number;
  /** Rules introduced at this gate */
  readonly rules: readonly RuleId[];
  /** Whether this tutorial is mandatory (must be dismissed to continue) */
  readonly mandatory: boolean;
  /** i18n key prefix for title, description, and rule explanations */
  readonly i18nPrefix: string;
}

export const TUTORIAL_GATES: readonly RuleTutorialGate[] = [
  {
    id: 'logic-rules',
    triggerLevel: 17,
    rules: ['xor', 'and', 'or'],
    mandatory: true,
    i18nPrefix: 'visualLogic.tutorial.logicRules',
  },
  {
    id: 'mesh-overlay',
    triggerLevel: 21,
    rules: [],
    mandatory: false,
    i18nPrefix: 'visualLogic.tutorial.meshOverlay',
  },
  {
    id: 'meta-rules',
    triggerLevel: 29,
    rules: ['cross_attribute', 'meta_cycle'],
    mandatory: true,
    i18nPrefix: 'visualLogic.tutorial.metaRules',
  },
] as const;

// ---------------------------------------------------------------------------
// Tutorial content (default French, used as i18n fallback)
// ---------------------------------------------------------------------------

export interface RuleTutorialContent {
  readonly title: string;
  readonly description: string;
  readonly ruleExplanations: readonly {
    readonly name: string;
    readonly explanation: string;
    /** Example: "Si A=1 et B=0, alors C=1 (XOR)" */
    readonly example?: string;
  }[];
}

/**
 * Default content (French). The UI should use i18n keys with these as fallbacks.
 * Keys follow the pattern: `{i18nPrefix}.title`, `{i18nPrefix}.description`,
 * `{i18nPrefix}.rules.{ruleId}.name`, etc.
 */
export const DEFAULT_TUTORIAL_CONTENT: Record<string, RuleTutorialContent> = {
  'logic-rules': {
    title: 'Nouvelles règles : opérations logiques',
    description:
      'À partir du niveau 17, les matrices peuvent utiliser des opérations logiques sur les attributs. ' +
      'Ces règles combinent les valeurs de deux cellules pour déterminer la troisième.',
    ruleExplanations: [
      {
        name: 'XOR (ou exclusif)',
        explanation:
          'La troisième cellule prend la valeur qui est dans l\u2019une OU l\u2019autre des deux premières, mais pas les deux.',
        example: 'Si A a un cercle et B un carré → C aura un triangle (ni cercle ni carré).',
      },
      {
        name: 'AND (et)',
        explanation: 'La troisième cellule ne garde que ce qui est commun aux deux premières.',
        example: 'Si A a [cercle, carré] et B a [carré, triangle] → C aura [carré].',
      },
      {
        name: 'OR (ou)',
        explanation: 'La troisième cellule combine tout ce qui apparaît dans les deux premières.',
        example: 'Si A a [cercle] et B a [carré] → C aura [cercle, carré].',
      },
    ],
  },
  'mesh-overlay': {
    title: 'Nouvelle couche : overlay mesh',
    description:
      'À partir du niveau 21, une couche de lignes parallèles (mesh) est superposée aux formes. ' +
      'Le mesh a ses propres règles : le nombre de lignes, leur orientation et leur espacement varient selon des patterns réguliers.',
    ruleExplanations: [
      {
        name: 'Lignes parallèles',
        explanation:
          'Observez le nombre de lignes (1-5), leur direction (8 orientations) et leur espacement (4 niveaux). ' +
          'Chaque attribut du mesh suit une règle indépendante.',
      },
    ],
  },
  'meta-rules': {
    title: 'Règles avancées : méta-règles',
    description:
      'Les niveaux 29-30 introduisent deux règles qui opèrent sur les règles elles-mêmes. ' +
      'C\u2019est le niveau de difficulté le plus élevé.',
    ruleExplanations: [
      {
        name: 'Cross-attribute',
        explanation:
          'La valeur d\u2019un attribut dans la troisième cellule dépend de la valeur d\u2019un AUTRE attribut dans les deux premières.',
        example: 'La taille en C dépend de la couleur en A et B.',
      },
      {
        name: 'Meta-cycle',
        explanation:
          'La règle elle-même change d\u2019une ligne à l\u2019autre. Par exemple, ligne 1 = progression, ligne 2 = constant, ligne 3 = arithmétique.',
        example: 'Chaque ligne de la matrice suit une règle différente pour le même attribut.',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tutorial resolution (pure functions)
// ---------------------------------------------------------------------------

/**
 * Given the current level and a set of already-seen tutorial IDs,
 * returns the tutorial gate to show, or null if none is needed.
 *
 * A tutorial triggers when:
 * 1. The current level >= triggerLevel
 * 2. The tutorial ID is NOT in seenTutorials
 *
 * Only one tutorial is returned at a time (the lowest-level unseen one).
 */
export function getPendingTutorial(
  currentLevel: number,
  seenTutorials: ReadonlySet<string>,
): RuleTutorialGate | null {
  for (const gate of TUTORIAL_GATES) {
    if (currentLevel >= gate.triggerLevel && !seenTutorials.has(gate.id)) {
      return gate;
    }
  }
  return null;
}

/**
 * Get the content for a tutorial gate.
 */
export function getTutorialContent(gateId: string): RuleTutorialContent | null {
  return DEFAULT_TUTORIAL_CONTENT[gateId] ?? null;
}

/**
 * Get all tutorial gate IDs (for persistence initialization).
 */
export function getAllTutorialIds(): string[] {
  return TUTORIAL_GATES.map((g) => g.id);
}
