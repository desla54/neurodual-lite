/**
 * Chain Recall — French word pool organized by semantic category.
 *
 * ~300 common, concrete, highly imageable French nouns.
 * Each word is mono- or bisyllabic for controlled phonological loop load.
 *
 * Design principles:
 * - Words are short (1-3 syllables) to minimize word-length effect variance
 * - All words are concrete nouns (high imageability) for fair encoding
 * - 15 semantic categories with ~20 words each
 * - Session pool is drawn to avoid same-category clustering (proactive interference control)
 */

// =============================================================================
// Types
// =============================================================================

export interface PoolWord {
  readonly text: string;
  readonly category: WordCategory;
}

export type WordCategory =
  | 'animal'
  | 'food'
  | 'body'
  | 'home'
  | 'nature'
  | 'clothing'
  | 'tool'
  | 'vehicle'
  | 'music'
  | 'weather'
  | 'sport'
  | 'sea'
  | 'color'
  | 'shape'
  | 'city';

// =============================================================================
// Full word pool (~300 words)
// =============================================================================

const pool = (category: WordCategory, words: string[]): PoolWord[] =>
  words.map((text) => ({ text, category }));

export const FULL_WORD_POOL: readonly PoolWord[] = [
  // ── Animals ──
  ...pool('animal', [
    'chat',
    'chien',
    'loup',
    'ours',
    'cerf',
    'lion',
    'tigre',
    'aigle',
    'hibou',
    'poule',
    'coq',
    'canard',
    'chèvre',
    'vache',
    'cochon',
    'lapin',
    'souris',
    'renard',
    'singe',
    'phoque',
  ]),
  // ── Food ──
  ...pool('food', [
    'pomme',
    'poire',
    'pain',
    'lait',
    'riz',
    'noix',
    'miel',
    'sel',
    'sucre',
    'beurre',
    'fromage',
    'olive',
    'prune',
    'cerise',
    'pêche',
    'figue',
    'raisin',
    'citron',
    'soupe',
    'crêpe',
  ]),
  // ── Body ──
  ...pool('body', [
    'main',
    'pied',
    'bras',
    'dos',
    'nez',
    'bouche',
    'dent',
    'joue',
    'front',
    'cou',
    'genou',
    'doigt',
    'ongle',
    'coude',
    'hanche',
    'ventre',
    'gorge',
    'pouce',
    'langue',
    'menton',
  ]),
  // ── Home ──
  ...pool('home', [
    'maison',
    'porte',
    'clé',
    'lampe',
    'chaise',
    'table',
    'lit',
    'miroir',
    'mur',
    'toit',
    'sol',
    'four',
    'verre',
    'tasse',
    'nappe',
    'balai',
    'rideau',
    'tiroir',
    'coussin',
    'étagère',
  ]),
  // ── Nature ──
  ...pool('nature', [
    'arbre',
    'fleur',
    'herbe',
    'feuille',
    'mousse',
    'pierre',
    'sable',
    'terre',
    'lac',
    'fleuve',
    'source',
    'rocher',
    'colline',
    'forêt',
    'champ',
    'grotte',
    'île',
    'marais',
    'dune',
    'vallée',
  ]),
  // ── Clothing ──
  ...pool('clothing', [
    'chapeau',
    'gant',
    'botte',
    'jupe',
    'robe',
    'ceinture',
    'écharpe',
    'bonnet',
    'gilet',
    'cape',
    'voile',
    'col',
    'poche',
    'bouton',
    'lacet',
    'manche',
    'talon',
    'semelle',
    'châle',
    'casque',
  ]),
  // ── Tools ──
  ...pool('tool', [
    'clou',
    'vis',
    'scie',
    'lime',
    'pince',
    'marteau',
    'corde',
    'chaîne',
    'roue',
    'levier',
    'lame',
    'hache',
    'bêche',
    'pelle',
    'râteau',
    'pioche',
    'ciseau',
    'tournevis',
    'boulon',
    'échelle',
  ]),
  // ── Vehicles ──
  ...pool('vehicle', [
    'bus',
    'train',
    'vélo',
    'moto',
    'camion',
    'bateau',
    'avion',
    'fusée',
    'barque',
    'canot',
    'voile',
    'char',
    'traîneau',
    'wagon',
    'kayak',
    'radeau',
    'métro',
    'tram',
    'jet',
    'cargo',
  ]),
  // ── Music ──
  ...pool('music', [
    'piano',
    'violon',
    'flûte',
    'harpe',
    'tambour',
    'guitare',
    'orgue',
    'cor',
    'gong',
    'luth',
    'banjo',
    'hautbois',
    'tuba',
    'cymbal',
    'cloche',
    'sifflet',
    'bongo',
    'lyre',
    'accord',
    'archet',
  ]),
  // ── Weather / sky ──
  ...pool('weather', [
    'soleil',
    'lune',
    'étoile',
    'nuage',
    'pluie',
    'neige',
    'vent',
    'brume',
    'givre',
    'grêle',
    'foudre',
    'arc',
    'gel',
    'rosée',
    'éclair',
    'orage',
    'brouillard',
    'aurore',
    'crépuscule',
    'averse',
  ]),
  // ── Sport ──
  ...pool('sport', [
    'ballon',
    'filet',
    'raquette',
    'cible',
    'arc',
    'piste',
    'ring',
    'cage',
    'but',
    'gant',
    'saut',
    'course',
    'plongeon',
    'luge',
    'ski',
    'surf',
    'tir',
    'javelot',
    'disque',
    'perche',
  ]),
  // ── Sea ──
  ...pool('sea', [
    'mer',
    'vague',
    'algue',
    'corail',
    'ancre',
    'phare',
    'quai',
    'port',
    'digue',
    'écume',
    'marée',
    'récif',
    'crique',
    'falaise',
    'golfe',
    'baie',
    'mouette',
    'crabe',
    'huître',
    'coquille',
  ]),
  // ── Colors / materials ──
  ...pool('color', [
    'rouge',
    'bleu',
    'vert',
    'jaune',
    'blanc',
    'noir',
    'gris',
    'rose',
    'brun',
    'or',
    'argent',
    'bronze',
    'cuivre',
    'jade',
    'ivoire',
    'rubis',
    'perle',
    'saphir',
    'ambre',
    'opale',
  ]),
  // ── Shapes / geometry ──
  ...pool('shape', [
    'cercle',
    'carré',
    'cube',
    'ligne',
    'point',
    'angle',
    'courbe',
    'spirale',
    'croix',
    'losange',
    'cône',
    'sphère',
    'prisme',
    'arc',
    'nœud',
    'tresse',
    'boucle',
    'ruban',
    'fil',
    'bobine',
  ]),
  // ── Cities / places ──
  ...pool('city', [
    'pont',
    'tour',
    'place',
    'rue',
    'parc',
    'jardin',
    'église',
    'gare',
    'marché',
    'fontaine',
    'statue',
    'dôme',
    'arche',
    'rampe',
    'dalle',
    'banc',
    'kiosque',
    'phare',
    'beffroi',
    'clocher',
  ]),
];

// =============================================================================
// Deduplicated text index (some words appear in multiple categories)
// =============================================================================

/** All unique word texts in the pool. */
export const ALL_WORD_TEXTS: readonly string[] = [...new Set(FULL_WORD_POOL.map((w) => w.text))];

/** Category lookup: word text → set of categories it belongs to. */
export const WORD_CATEGORIES: ReadonlyMap<string, ReadonlySet<WordCategory>> = (() => {
  const map = new Map<string, Set<WordCategory>>();
  for (const w of FULL_WORD_POOL) {
    const existing = map.get(w.text);
    if (existing) {
      existing.add(w.category);
    } else {
      map.set(w.text, new Set([w.category]));
    }
  }
  return map;
})();

// =============================================================================
// Session pool builder
// =============================================================================

/**
 * Draw a session pool of `size` unique words, spread across categories.
 *
 * Strategy: round-robin across shuffled categories, picking one unused word
 * per category per pass, until the pool is full. This ensures semantic variety
 * and limits proactive interference from category clustering.
 */
export function drawSessionPool(size: number, rng: () => number = Math.random): string[] {
  // Deduplicate: pick each word text only once, assigned to its first category
  const byCategory = new Map<WordCategory, string[]>();
  const seen = new Set<string>();
  for (const w of FULL_WORD_POOL) {
    if (seen.has(w.text)) continue;
    seen.add(w.text);
    const list = byCategory.get(w.category);
    if (list) {
      list.push(w.text);
    } else {
      byCategory.set(w.category, [w.text]);
    }
  }

  // Shuffle each category's words
  for (const words of byCategory.values()) {
    shuffleInPlace(words, rng);
  }

  // Shuffle category order
  const categories = shuffleInPlace([...byCategory.keys()], rng);

  const result: string[] = [];
  const indices = new Map<WordCategory, number>();
  for (const cat of categories) {
    indices.set(cat, 0);
  }

  // Round-robin across categories
  let passes = 0;
  while (result.length < size) {
    let addedThisPass = false;
    for (const cat of categories) {
      if (result.length >= size) break;
      // biome-ignore lint/style/noNonNullAssertion: categories derived from same Map keys
      const words = byCategory.get(cat)!;
      // biome-ignore lint/style/noNonNullAssertion: categories derived from same Map keys
      const idx = indices.get(cat)!;
      if (idx < words.length) {
        result.push(words[idx] as string);
        indices.set(cat, idx + 1);
        addedThisPass = true;
      }
    }
    if (!addedThisPass) break; // All categories exhausted
    passes++;
    if (passes > 30) break; // Safety
  }

  // Final shuffle so words aren't in category-round-robin order
  shuffleInPlace(result, rng);

  return result;
}

// =============================================================================
// Distractor strategy
// =============================================================================

/**
 * Compute how many distractors to show for a given chain length.
 *
 * Ratio ≈ 1:1 (distractors ≈ chain length), with:
 * - minimum 3 (so there's always meaningful choice)
 * - maximum 12 (grid shouldn't overflow)
 */
export function distractorCount(chainLength: number): number {
  return Math.min(12, Math.max(3, chainLength));
}

/**
 * Pick distractor words that maximize semantic interference.
 *
 * Priority: same-category words first (harder), then random fill.
 */
export function pickSmartDistractors(
  chain: readonly string[],
  count: number,
  sessionPool: readonly string[],
  rng: () => number = Math.random,
): string[] {
  const chainSet = new Set(chain);
  const available = sessionPool.filter((w) => !chainSet.has(w));

  if (available.length === 0) return [];
  if (available.length <= count) return shuffleInPlace([...available], rng);

  // Find chain categories
  const chainCategories = new Set<WordCategory>();
  for (const word of chain) {
    const cats = WORD_CATEGORIES.get(word);
    if (cats) {
      for (const c of cats) chainCategories.add(c);
    }
  }

  // Split available into same-category (hard) and different-category (easy)
  const sameCategory: string[] = [];
  const diffCategory: string[] = [];
  for (const word of available) {
    const cats = WORD_CATEGORIES.get(word);
    if (cats) {
      let overlap = false;
      for (const c of cats) {
        if (chainCategories.has(c)) {
          overlap = true;
          break;
        }
      }
      if (overlap) {
        sameCategory.push(word);
      } else {
        diffCategory.push(word);
      }
    } else {
      diffCategory.push(word);
    }
  }

  shuffleInPlace(sameCategory, rng);
  shuffleInPlace(diffCategory, rng);

  // Take as many same-category as possible, fill remainder with diff-category
  const result: string[] = [];
  for (const word of sameCategory) {
    if (result.length >= count) break;
    result.push(word);
  }
  for (const word of diffCategory) {
    if (result.length >= count) break;
    result.push(word);
  }

  return shuffleInPlace(result, rng);
}

// =============================================================================
// Utility
// =============================================================================

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}
