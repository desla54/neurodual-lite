/**
 * MiniStimulus.tsx - Mini composants pour afficher les stimuli
 *
 * Composants réutilisables pour afficher position (grille) et audio (lettre)
 * en format compact pour les timelines, cartes, et drop zones.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MiniGridProps {
  /** Position dans la grille (0-7, sans le centre) */
  position: number;
  /** Variant de couleur */
  variant?: 'normal' | 'mirror';
  /** Afficher comme vide (grisé) */
  isEmpty?: boolean;
  /** Couleur personnalisée (override variant) */
  color?: string;
  /** Number of grid columns (3 for classic, 4 for mirror grid). Default: 3 */
  gridCols?: number;
}

export interface MiniLetterProps {
  /** Lettre à afficher */
  letter: string;
  /** Variant de couleur */
  variant?: 'normal' | 'mirror';
}

// =============================================================================
// GRID MAP
// =============================================================================

/**
 * Mapping des positions logiques (0-7) vers les indices de la grille visuelle 3x3.
 * Le centre (index 4) est toujours null (croix).
 */
const GRID_MAP_3 = [0, 1, 2, 3, null, 4, 5, 6, 7];
const GRID_MAP_4 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// =============================================================================
// MINI GRID
// =============================================================================

/**
 * Affiche une mini grille 3x3 ou 3x4 avec une position active.
 */
export function MiniGrid({
  position,
  variant = 'normal',
  isEmpty = false,
  color,
  gridCols = 3,
}: MiniGridProps) {
  // Couleur active basée sur le variant ou color override
  const activeColor = color ?? (variant === 'mirror' ? '#b45309' : '#3b82f6'); // amber-700 vs blue-500
  const inactiveColor = isEmpty ? '#e2e8f0' : '#f1f5f9'; // slate-200 vs slate-100
  const bgClass = isEmpty ? 'bg-slate-100' : 'bg-white';
  const gridMap = gridCols === 4 ? GRID_MAP_4 : GRID_MAP_3;

  return (
    <div className={`${bgClass} rounded-lg border border-woven-border p-1 lg:p-1.5`}>
      <div
        className={
          gridCols === 4
            ? 'grid grid-cols-4 gap-[1px] w-9 h-7 lg:w-11 lg:h-9'
            : 'grid grid-cols-3 gap-[1px] w-7 h-7 [@media(max-height:700px)]:w-6 [@media(max-height:700px)]:h-6 lg:w-9 lg:h-9'
        }
      >
        {gridMap.map((logicPos, idx) => {
          if (logicPos === null) {
            // Centre avec croix
            return (
              <div
                key="center"
                className="relative flex items-center justify-center bg-transparent"
              >
                <div className="absolute w-1/2 h-[1px] bg-slate-400" />
                <div className="absolute h-1/2 w-[1px] bg-slate-400" />
              </div>
            );
          }
          const isActive = logicPos === position && !isEmpty;
          return (
            <div
              key={idx}
              className="rounded-sm"
              style={{ backgroundColor: isActive ? activeColor : inactiveColor }}
            />
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MINI LETTER
// =============================================================================

/**
 * Affiche une mini lettre pour le stimulus audio.
 */
export function MiniLetter({ letter, variant = 'normal' }: MiniLetterProps) {
  // Couleur basée sur le variant
  const colorClass = variant === 'mirror' ? 'text-orange-500' : 'text-audio';

  return (
    <div className="bg-white rounded-lg border border-woven-border w-9 h-9 [@media(max-height:700px)]:w-8 [@media(max-height:700px)]:h-8 lg:w-12 lg:h-12 flex items-center justify-center">
      <span className={`font-bold ${colorClass} text-sm lg:text-base`}>{letter.toUpperCase()}</span>
    </div>
  );
}
