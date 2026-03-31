/**
 * Rule explainer — transforms RuleBindings into human-readable explanations.
 *
 * Used by the interactive tutorial to annotate matrices and explain
 * why the correct answer is correct.
 */

import type { RuleBinding, RuleId, AttributeId, ComponentBinding } from './types';

// ---------------------------------------------------------------------------
// Attribute display names
// ---------------------------------------------------------------------------

const ATTR_NAMES_FR: Record<AttributeId, string> = {
  shape: 'forme',
  size: 'taille',
  color: 'couleur',
  number: 'nombre',
  position: 'position',
  angle: 'angle',
};

const ATTR_NAMES_EN: Record<AttributeId, string> = {
  shape: 'shape',
  size: 'size',
  color: 'color',
  number: 'number',
  position: 'position',
  angle: 'angle',
};

// ---------------------------------------------------------------------------
// Rule explanations
// ---------------------------------------------------------------------------

interface RuleExplanation {
  /** Short rule name (e.g. "Constant") */
  ruleName: string;
  /** Attribute concerned (e.g. "couleur") */
  attribute: string;
  /** Full explanation sentence */
  explanation: string;
  /** How to find the answer */
  hint: string;
}

const RULE_EXPLAIN_FR: Record<
  RuleId,
  (attr: string, params?: RuleBinding['params']) => { explanation: string; hint: string }
> = {
  constant: (attr) => ({
    explanation: `La ${attr} reste identique dans chaque ligne.`,
    hint: `La case manquante a la même ${attr} que les autres cases de sa ligne.`,
  }),
  progression: (attr, params) => {
    const dir = params?.step && params.step > 0 ? 'augmente' : 'diminue';
    return {
      explanation: `La ${attr} ${dir} régulièrement de gauche à droite.`,
      hint: `Continuez la progression : la ${attr} de la 3e case suit le pattern.`,
    };
  },
  arithmetic: (attr, params) => {
    const op = params?.op === 'sub' ? 'soustraction' : 'addition';
    return {
      explanation: `La ${attr} suit une règle d'${op} : case 1 ${params?.op === 'sub' ? '−' : '+'} case 2 = case 3.`,
      hint: `Calculez : appliquez l'${op} des deux premières cases pour trouver la 3e.`,
    };
  },
  distribute_three: (attr) => ({
    explanation: `Chaque valeur de ${attr} apparaît exactement une fois par ligne.`,
    hint: `Trouvez quelle valeur de ${attr} manque dans la dernière ligne.`,
  }),
  xor: (attr) => ({
    explanation: `La ${attr} suit un OU exclusif (XOR) : la 3e case a ce qui est dans l'une OU l'autre des 2 premières, mais pas les deux.`,
    hint: `Comparez les cases 1 et 2 : ce qui est exclusif à l'une d'elles donne la case 3.`,
  }),
  and: (attr) => ({
    explanation: `La ${attr} suit un ET (AND) : la 3e case ne garde que ce qui est commun aux 2 premières.`,
    hint: `Cherchez ce qui est présent dans les cases 1 ET 2 — c'est la réponse.`,
  }),
  or: (attr) => ({
    explanation: `La ${attr} suit un OU (OR) : la 3e case combine tout ce qui apparaît dans les 2 premières.`,
    hint: `Réunissez les éléments des cases 1 et 2 — c'est la réponse.`,
  }),
  cross_attribute: (attr, params) => ({
    explanation: `La ${attr} de la 3e case dépend d'un AUTRE attribut (${params?.sourceAttribute ?? '?'}) des 2 premières cases.`,
    hint: `Regardez l'attribut source dans les cases 1 et 2, puis déduisez la ${attr} de la case 3.`,
  }),
  meta_cycle: (attr) => ({
    explanation: `La règle elle-même change d'une ligne à l'autre pour la ${attr}. Chaque ligne suit une règle différente.`,
    hint: `Identifiez quelle règle s'applique à chaque ligne, puis appliquez celle de la 3e ligne.`,
  }),
};

const RULE_NAMES_FR: Record<RuleId, string> = {
  constant: 'Constant',
  progression: 'Progression',
  arithmetic: 'Arithmétique',
  distribute_three: 'Distribution',
  xor: 'XOR (ou exclusif)',
  and: 'AND (et)',
  or: 'OR (ou)',
  cross_attribute: 'Cross-attribut',
  meta_cycle: 'Méta-cycle',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate human-readable explanations for a set of rule bindings.
 */
export function explainRules(
  bindings: readonly RuleBinding[],
  lang: 'fr' | 'en' = 'fr',
): RuleExplanation[] {
  const attrNames = lang === 'fr' ? ATTR_NAMES_FR : ATTR_NAMES_EN;
  const ruleNames = RULE_NAMES_FR; // TODO: add EN when needed
  const explainers = RULE_EXPLAIN_FR; // TODO: add EN when needed

  return bindings.map((binding) => {
    const attr = attrNames[binding.attributeId];
    const { explanation, hint } = explainers[binding.ruleId](attr, binding.params);
    return {
      ruleName: ruleNames[binding.ruleId],
      attribute: attr,
      explanation,
      hint,
    };
  });
}

/**
 * Generate a one-line summary of the rules in play.
 */
export function summarizeRules(bindings: readonly RuleBinding[]): string {
  const ruleNames = RULE_NAMES_FR;
  const attrNames = ATTR_NAMES_FR;
  const parts = bindings
    .filter((b) => b.ruleId !== 'constant')
    .map((b) => `${ruleNames[b.ruleId]} (${attrNames[b.attributeId]})`);
  if (parts.length === 0) return 'Toutes les valeurs sont constantes.';
  return parts.join(' + ');
}

/**
 * Explain multi-component bindings (for configs like left_right, up_down, etc.)
 */
export function explainComponentBindings(
  componentBindings: readonly ComponentBinding[],
  lang: 'fr' | 'en' = 'fr',
): { componentIndex: number; explanations: RuleExplanation[] }[] {
  return componentBindings.map((comp, i) => ({
    componentIndex: i,
    explanations: explainRules(comp.ruleBindings, lang),
  }));
}
