/**
 * Tutorial lesson definitions for Visual Logic — 20 lessons.
 *
 * 4 blocs:
 * - Bloc 1 (1-7): Les bases — constant, progression, distribution, arithmétique
 * - Bloc 2 (8-13): Complexité structurelle — multi-règles, layouts, composants, angle
 * - Bloc 3 (14-17): Règles logiques — XOR, AND, OR, combinaisons
 * - Bloc 4 (18-20): Couches avancées — mesh, perceptuel, méta-règles
 *
 * Seeds are deterministic — the same seed always produces the same matrix.
 */

import type { ReferenceProfile } from './types';

// ---------------------------------------------------------------------------
// Lesson definition
// ---------------------------------------------------------------------------

export interface TutorialLesson {
  /** Unique lesson ID */
  id: string;
  /** Lesson number (1-based, for display) */
  step: number;
  /** Bloc number (1-4) */
  bloc: number;
  /** Short title */
  title: string;
  /** What this lesson teaches */
  description: string;
  /** Seed for deterministic matrix generation */
  seed: string;
  /** Difficulty level to generate at */
  level: number;
  /** Profile to use */
  profile: ReferenceProfile;
  /** Which rules to highlight in the explanation */
  focusRules: string[];
  /** Introductory text shown before the matrix */
  intro: string;
}

// ---------------------------------------------------------------------------
// Bloc 1 — Les bases (niveaux 1-5)
// ---------------------------------------------------------------------------

const BLOC_1: TutorialLesson[] = [
  {
    id: 'intro',
    step: 1,
    bloc: 1,
    title: "Qu'est-ce qu'une matrice ?",
    description: 'Comprendre la grille 3×3 et la case manquante.',
    seed: 'tut-1-0',
    level: 1,
    profile: 'neurodual',
    focusRules: [],
    intro:
      'Une matrice est une grille de 3 lignes × 3 colonnes. ' +
      'Chaque case contient des formes avec des propriétés : forme, taille, couleur. ' +
      "La dernière case (en bas à droite) est manquante — c'est celle que vous devez trouver.\n\n" +
      'Les formes suivent des RÈGLES régulières dans chaque ligne ET chaque colonne. ' +
      'Votre mission : identifier les règles et choisir la bonne réponse parmi les options.',
  },
  {
    id: 'constant',
    step: 2,
    bloc: 1,
    title: 'Règle constante',
    description: 'Un attribut reste identique dans toute la ligne.',
    seed: 'tut-2-0',
    level: 1,
    profile: 'neurodual',
    focusRules: ['constant'],
    intro:
      'La règle la plus simple : un attribut ne change pas. ' +
      "Si toutes les cases d'une ligne ont la même couleur, la case manquante a aussi cette couleur. " +
      'Repérez quels attributs sont constants — ils vous donnent des indices pour la réponse.',
  },
  {
    id: 'columns',
    step: 3,
    bloc: 1,
    title: 'Les colonnes aussi',
    description: "Les règles s'appliquent aux lignes ET aux colonnes.",
    seed: 'tut-3-0',
    level: 1,
    profile: 'neurodual',
    focusRules: ['constant', 'progression'],
    intro:
      "Attention : les règles ne s'appliquent pas qu'aux lignes. " +
      'Vérifiez aussi les COLONNES (de haut en bas). ' +
      'Parfois, la ligne seule ne suffit pas à éliminer toutes les options — ' +
      "la colonne vous donne l'indice décisif.",
  },
  {
    id: 'progression',
    step: 4,
    bloc: 1,
    title: 'Progression',
    description: 'Un attribut augmente ou diminue régulièrement.',
    seed: 'tut-4-1',
    level: 2,
    profile: 'neurodual',
    focusRules: ['progression'],
    intro:
      'Dans une progression, un attribut change de façon régulière. ' +
      "Par exemple, la taille augmente d'un cran à chaque case, " +
      "ou la couleur s'assombrit progressivement. " +
      'Identifiez le "pas" (combien ça change) et continuez la séquence.',
  },
  {
    id: 'distribute',
    step: 5,
    bloc: 1,
    title: 'Distribution',
    description: 'Chaque valeur apparaît exactement une fois par ligne.',
    seed: 'tut-5-1',
    level: 3,
    profile: 'neurodual',
    focusRules: ['distribute_three'],
    intro:
      'Comme un mini-sudoku : trois valeurs différentes, chacune présente exactement une fois par ligne. ' +
      'Regardez quelles valeurs sont déjà dans la dernière ligne — ' +
      'celle qui manque est la réponse.',
  },
  {
    id: 'arithmetic-add',
    step: 6,
    bloc: 1,
    title: 'Arithmétique : addition',
    description: 'La 3e case est la somme des 2 premières.',
    seed: 'tut-6-5',
    level: 4,
    profile: 'neurodual',
    focusRules: ['arithmetic'],
    intro:
      'La règle arithmétique combine les deux premières cases. ' +
      'En mode addition : la valeur de la case 3 = case 1 + case 2. ' +
      'Par exemple, si case 1 a 1 forme et case 2 en a 2, case 3 en aura 3.',
  },
  {
    id: 'arithmetic-sub',
    step: 7,
    bloc: 1,
    title: 'Arithmétique : soustraction',
    description: 'La 3e case est la différence des 2 premières.',
    seed: 'tut-7-3',
    level: 5,
    profile: 'neurodual',
    focusRules: ['arithmetic'],
    intro:
      'En mode soustraction : case 1 − case 2 = case 3. ' +
      'Par exemple, si la taille diminue entre case 1 et case 3, ' +
      "cherchez l'opération case 1 − case 2.",
  },
];

// ---------------------------------------------------------------------------
// Bloc 2 — Complexité structurelle (niveaux 6-14)
// ---------------------------------------------------------------------------

const BLOC_2: TutorialLesson[] = [
  {
    id: 'two-rules',
    step: 8,
    bloc: 2,
    title: 'Deux règles simultanées',
    description: 'Chaque attribut suit sa propre règle.',
    seed: 'tut-8-0',
    level: 6,
    profile: 'neurodual',
    focusRules: ['distribute_three', 'progression'],
    intro:
      'À partir de maintenant, plusieurs attributs varient en même temps. ' +
      'La forme peut suivre une progression pendant que la couleur fait une distribution. ' +
      'Analysez chaque attribut SÉPARÉMENT — ne mélangez pas les règles.',
  },
  {
    id: 'three-rules',
    step: 9,
    bloc: 2,
    title: 'Trois règles simultanées',
    description: "Tous les attributs varient — aucun n'est constant.",
    seed: 'tut-9-4',
    level: 7,
    profile: 'neurodual',
    focusRules: ['distribute_three', 'arithmetic', 'progression'],
    intro:
      'Ici, TOUS les attributs changent — forme, taille ET couleur suivent chacun une règle différente. ' +
      "La clé : analysez un attribut à la fois. Résolvez d'abord le plus facile, " +
      'puis utilisez-le pour éliminer des options.',
  },
  {
    id: 'grid4',
    step: 10,
    bloc: 2,
    title: 'Layout : grille 4 entités',
    description: 'Chaque case contient 4 entités disposées en grille.',
    seed: 'tut-10-3',
    level: 4,
    profile: 'neurodual',
    focusRules: ['distribute_three', 'progression'],
    intro:
      "Jusqu'ici, chaque case avait une seule forme. " +
      'Maintenant, chaque case contient PLUSIEURS entités disposées en grille (2×2). ' +
      "Les règles s'appliquent à toutes les entités de la case de façon uniforme — " +
      "toutes les formes d'une case partagent les mêmes attributs.",
  },
  {
    id: 'grid9',
    step: 11,
    bloc: 2,
    title: 'Layout : grille 9 entités',
    description: "Chaque case contient jusqu'à 9 entités.",
    seed: 'tut-11-3',
    level: 7,
    profile: 'neurodual',
    focusRules: ['distribute_three', 'arithmetic'],
    intro:
      "Même principe que la grille 4, mais avec jusqu'à 9 entités par case (3×3). " +
      'Ne vous laissez pas submerger — les règles sont les mêmes. ' +
      "Concentrez-vous sur les attributs, pas sur le nombre d'entités.",
  },
  {
    id: 'multi-component',
    step: 12,
    bloc: 2,
    title: 'Composants multiples',
    description: 'Deux groupes de formes indépendants dans chaque case.',
    seed: 'tut-12-11',
    level: 8,
    profile: 'neurodual',
    focusRules: ['distribute_three', 'arithmetic', 'progression'],
    intro:
      'Les matrices avancées ont DEUX groupes de formes dans chaque case ' +
      '(gauche/droite, ou intérieur/extérieur). ' +
      "Chaque groupe suit ses PROPRES règles, indépendamment de l'autre. " +
      'Analysez chaque groupe séparément, comme deux puzzles superposés.',
  },
  {
    id: 'angle',
    step: 13,
    bloc: 2,
    title: "L'angle comme attribut",
    description: "L'orientation des formes suit une règle.",
    seed: 'tut-13-0',
    level: 13,
    profile: 'neurodual',
    focusRules: ['distribute_three'],
    intro:
      "À partir du niveau 13, l'ANGLE (orientation) des formes devient un attribut gouverné par une règle. " +
      "Les formes peuvent être tournées — observez si l'angle suit une progression, " +
      'une distribution ou une autre règle.',
  },
];

// ---------------------------------------------------------------------------
// Bloc 3 — Règles logiques (niveaux 17-20)
// ---------------------------------------------------------------------------

const BLOC_3: TutorialLesson[] = [
  {
    id: 'xor',
    step: 14,
    bloc: 3,
    title: 'XOR : ou exclusif',
    description: "Ce qui est dans l'une OU l'autre, mais pas les deux.",
    seed: 'tut-14-0',
    level: 17,
    profile: 'neurodual',
    focusRules: ['xor'],
    intro:
      'Le XOR compare les cases 1 et 2 : ' +
      "la case 3 prend ce qui est dans l'UNE ou l'AUTRE, mais PAS dans les deux. " +
      'Exemple : si case 1 = cercle et case 2 = carré, case 3 = triangle ' +
      '(ni cercle ni carré). Si les deux cases ont la même chose, case 3 est "vide" pour cet attribut.',
  },
  {
    id: 'and',
    step: 15,
    bloc: 3,
    title: 'AND : intersection',
    description: 'Ce qui est commun aux 2 premières cases.',
    seed: 'tut-15-8',
    level: 18,
    profile: 'neurodual',
    focusRules: ['and'],
    intro:
      'Le AND (ET) filtre : la case 3 ne garde que ce qui est COMMUN aux cases 1 et 2. ' +
      'Exemple : si case 1 a [cercle, carré] et case 2 a [carré, triangle], ' +
      'case 3 a [carré] — le seul élément commun.',
  },
  {
    id: 'or',
    step: 16,
    bloc: 3,
    title: 'OR : union',
    description: 'Tout ce qui apparaît dans les 2 premières cases.',
    seed: 'tut-16-12',
    level: 18,
    profile: 'neurodual',
    focusRules: ['or'],
    intro:
      'Le OR (OU) réunit : la case 3 combine TOUT ce qui apparaît dans les cases 1 OU 2. ' +
      'Exemple : si case 1 a [cercle] et case 2 a [carré], ' +
      "case 3 a [cercle, carré]. C'est l'inverse du AND.",
  },
  {
    id: 'logic-combo',
    step: 17,
    bloc: 3,
    title: 'Logique + classique',
    description: 'Règles logiques et classiques mélangées.',
    seed: 'tut-17-0',
    level: 19,
    profile: 'neurodual',
    focusRules: ['xor', 'distribute_three', 'arithmetic'],
    intro:
      'Le vrai défi : certains attributs suivent des règles classiques (progression, distribution) ' +
      "pendant que d'autres suivent des règles logiques (XOR, AND, OR). " +
      'Identifiez le type de règle pour CHAQUE attribut avant de chercher la réponse.',
  },
];

// ---------------------------------------------------------------------------
// Bloc 4 — Couches avancées (niveaux 21-30)
// ---------------------------------------------------------------------------

const BLOC_4: TutorialLesson[] = [
  {
    id: 'mesh',
    step: 18,
    bloc: 4,
    title: 'Overlay mesh',
    description: 'Des lignes parallèles superposées avec leurs propres règles.',
    seed: 'tut-18-0',
    level: 21,
    profile: 'neurodual',
    focusRules: ['constant'],
    intro:
      'À partir du niveau 21, des lignes parallèles (mesh) sont superposées aux formes. ' +
      'Le mesh a 3 attributs indépendants : nombre de lignes, orientation, espacement. ' +
      "Chaque attribut du mesh suit sa propre règle — c'est une couche supplémentaire à analyser.",
  },
  {
    id: 'perceptual',
    step: 19,
    bloc: 4,
    title: 'Complexité perceptive',
    description: "Overlay, fusion et distorsion rendent l'observation plus difficile.",
    seed: 'tut-19-0',
    level: 26,
    profile: 'neurodual',
    focusRules: ['progression', 'and'],
    intro:
      "Au-delà du niveau 25, la complexité n'est plus seulement logique — elle devient PERCEPTIVE. " +
      'Les formes peuvent se superposer (overlay), fusionner visuellement (fusion), ' +
      'ou être légèrement déformées (distortion). Les règles sont les mêmes, mais plus difficiles à voir.',
  },
  {
    id: 'meta',
    step: 20,
    bloc: 4,
    title: 'Méta-règles',
    description: 'Les règles elles-mêmes changent entre les lignes.',
    seed: 'tut-20-0',
    level: 29,
    profile: 'neurodual',
    focusRules: ['cross_attribute', 'meta_cycle'],
    intro:
      "Le niveau ultime. Cross-attribute : un attribut dépend d'un AUTRE attribut " +
      '(ex: la couleur de case 3 dépend de la forme des cases 1 et 2). ' +
      'Méta-cycle : la règle elle-même change à chaque ligne. ' +
      "C'est le plus difficile — prenez le temps d'observer.",
  },
];

// ---------------------------------------------------------------------------
// All lessons
// ---------------------------------------------------------------------------

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  ...BLOC_1,
  ...BLOC_2,
  ...BLOC_3,
  ...BLOC_4,
];

export function getLessonById(id: string): TutorialLesson | undefined {
  return TUTORIAL_LESSONS.find((l) => l.id === id);
}

export function getLessonByStep(step: number): TutorialLesson | undefined {
  return TUTORIAL_LESSONS.find((l) => l.step === step);
}

export const TUTORIAL_BLOC_LABELS = [
  { bloc: 1, title: 'Les bases', range: '1-7' },
  { bloc: 2, title: 'Complexité structurelle', range: '8-13' },
  { bloc: 3, title: 'Règles logiques', range: '14-17' },
  { bloc: 4, title: 'Couches avancées', range: '18-20' },
] as const;
