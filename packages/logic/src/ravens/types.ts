export type RuleId =
  | 'constant'
  | 'progression'
  | 'arithmetic'
  | 'distribute_three'
  | 'xor'
  | 'and'
  | 'or'
  | 'cross_attribute'
  | 'meta_cycle';
export type AttributeId = 'shape' | 'size' | 'color' | 'number' | 'position' | 'angle';

export type ConfigId =
  | 'center'
  | 'grid4'
  | 'grid5'
  | 'grid9'
  | 'left_right'
  | 'up_down'
  | 'out_in_center'
  | 'out_in_grid';

export interface EntitySpec {
  shape: number;
  size: number;
  color: number;
  angle: number;
}

export interface CellSpec {
  entities: EntitySpec[];
  positions: number[];
  /** S5: optional mesh overlay */
  mesh?: MeshComponent;
}

export interface RuleBinding {
  ruleId: RuleId;
  attributeId: AttributeId;
  params?: {
    step?: number;
    op?: 'add' | 'sub';
    offset?: number;
    /** S8: source attribute for cross_attribute rule */
    sourceAttribute?: AttributeId;
    /** S8: sub-rule sequence for meta_cycle [row0, row1, row2] */
    ruleSequence?: [RuleId, RuleId, RuleId];
  };
}

export interface ComponentBinding {
  ruleBindings: RuleBinding[];
}

export interface RavensMatrix {
  configId: ConfigId;
  /** 3 rows × 3 columns of cells */
  grid: CellSpec[][];
  answer: CellSpec;
  distractors: CellSpec[];
  ruleBindings: RuleBinding[];
  /** Per-component bindings for multi-component configs */
  componentBindings?: ComponentBinding[];
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
  difficulty: number;
  seed: string;
  optionCount: number;
}

export interface AttributeDomain {
  readonly values: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly cardinality: number;
}

export interface RuleEngineContext {
  /** S8: row index (0-2) for meta_cycle */
  rowIndex?: number;
  /** S8: source attribute values for cross_attribute [col0, col1, col2] */
  sourceValues?: [number, number, number];
}

export interface RuleEngine {
  generateRow(
    domain: { min: number; max: number },
    rng: import('../domain/random').SeededRandom,
    params?: RuleBinding['params'],
    context?: RuleEngineContext,
  ): [number, number, number];
  validate(
    values: [number, number, number],
    params?: RuleBinding['params'],
    context?: RuleEngineContext,
  ): boolean;
  deriveThird(
    a: number,
    b: number,
    params?: RuleBinding['params'],
    context?: RuleEngineContext,
  ): number;
  enumerateValid(
    domain: { min: number; max: number },
    a: number,
    b: number,
    params?: RuleBinding['params'],
    context?: RuleEngineContext,
  ): number[];
}

export interface DifficultyConfig {
  minRules: number;
  maxRules: number;
  minVaryingAttrs: number;
  maxVaryingAttrs: number;
  allowedConfigs: ConfigId[];
  optionCount: number;
  /** S2: use extended rule attributes (angle rule-governed) */
  useExtendedAttrs?: boolean;
  /** S3: per-component difficulty overrides */
  componentProfiles?: ComponentDifficultyProfile[];
  /** S4: force at least N logic rules (xor/and/or) */
  minLogicRules?: number;
  /** S5: generate mesh overlay component */
  hasMesh?: boolean;
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
}

// =============================================================================
// Component Difficulty Profile (S3)
// =============================================================================

export interface ComponentDifficultyProfile {
  minRules: number;
  maxRules: number;
  forcedRules?: Partial<Record<AttributeId, RuleId>>;
}

// =============================================================================
// Perceptual Complexity (S7)
// =============================================================================

export interface PerceptualComplexity {
  overlay: boolean;
  fusion: boolean;
  distortion: number;
}

// =============================================================================
// Profile Max Levels
// =============================================================================

export const PROFILE_MAX_LEVELS: Record<ReferenceProfile, number> = {
  iraven: 10,
  neurodual: 30,
};

// =============================================================================
// Reference Profile
// =============================================================================

/**
 * 'iraven' = strict I-RAVEN baseline (7 canonical configs, no grid5)
 * 'neurodual' = product mode (all configs including grid5, product distractors)
 */
export type ReferenceProfile = 'iraven' | 'neurodual';

// =============================================================================
// Structured Internal Model (Slice 2)
// =============================================================================

/**
 * A single entity within a component, with all attribute values.
 */
export interface StructuredEntity {
  shape: number;
  size: number;
  color: number;
  angle: number;
}

/**
 * A component within a cell: owns a layout (number of entities, positions)
 * and entity attribute values. Mirrors I-RAVEN's AoT component structure.
 *
 * Each component has its own independent rule group.
 */
export interface StructuredComponent {
  /** How many entities are present */
  numEntities: number;
  /** Which slot indices are occupied */
  positions: number[];
  /** Entity attribute values (length = numEntities) */
  entities: StructuredEntity[];
  /** Whether all entities share the same attribute values */
  uniform: boolean;
}

// =============================================================================
// Mesh Component (S5)
// =============================================================================

/**
 * A line-based mesh overlay for a cell. Independent 3rd visual layer
 * with its own rule-governed attributes. Inspired by I-RAVEN-Mesh (2024).
 */
export interface MeshComponent {
  /** Number of parallel lines (1-5) */
  lineCount: number;
  /** Orientation index (0-7, same as angle: -135°..180°) */
  lineOrientation: number;
  /** Spacing level (0-3: tight→wide) */
  lineSpacing: number;
}

/**
 * A cell (panel) in the matrix. Contains one component per rule group.
 * For single-component configs (center, grid4, grid9), length = 1.
 * For multi-component configs (left_right, up_down, out_in_*), length = 2.
 */
export interface StructuredCell {
  components: StructuredComponent[];
  /** S5: optional mesh overlay */
  mesh?: MeshComponent;
}

/**
 * The full structured matrix before flattening.
 * The generator works with this internally, then projects to RavensMatrix.
 */
export interface StructuredRavensMatrix {
  configId: ConfigId;
  /** 3 rows × 3 columns */
  grid: StructuredCell[][];
  answer: StructuredCell;
  distractors: StructuredCell[];
  /** Per-component rule bindings */
  componentBindings: ComponentBinding[];
  /** Number rule binding per component (null if N/A) */
  numberBindings: (RuleBinding | null)[];
  /** S5: mesh overlay rule bindings (null if no mesh) */
  meshBindings?: RuleBinding[];
  /** S7: perceptual complexity parameters */
  perceptual?: PerceptualComplexity;
  difficulty: number;
  seed: string;
  optionCount: number;
  referenceProfile: ReferenceProfile;
}
