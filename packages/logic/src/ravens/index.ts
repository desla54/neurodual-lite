export type {
  RuleId,
  AttributeId,
  ConfigId,
  EntitySpec,
  CellSpec,
  RuleBinding,
  ComponentBinding,
  RavensMatrix,
  AttributeDomain,
  RuleEngine,
  DifficultyConfig,
  ReferenceProfile,
  StructuredEntity,
  StructuredComponent,
  StructuredCell,
  StructuredRavensMatrix,
  ComponentDifficultyProfile,
  PerceptualComplexity,
  MeshComponent,
  RuleEngineContext,
} from './types';
export { PROFILE_MAX_LEVELS } from './types';

export {
  ATTRIBUTE_DOMAINS,
  MESH_DOMAINS,
  SHAPE_NAMES,
  SIZE_SCALES,
  COLOR_VALUES as RAVENS_COLOR_VALUES,
  ANGLE_DEGREES,
  COLOR_FILL_PATTERNS,
  type FillPatternId,
} from './attributes';
export { CONFIGURATIONS, getSlotPositions } from './configurations';
export { RULES, pruneConstraints } from './rules';
export { generateMatrix, generateStructuredMatrix } from './generator';
export { generateDistractors, generateReferenceDistractors } from './distractors';
export { flattenCell, flattenMatrix } from './flatten';
export {
  adaptDifficulty,
  type AdaptiveState,
  createAdaptiveState,
  createProfileAdaptiveState,
  isConverged,
  getCeilingEstimate,
  computeMeasureResult,
  type MeasureResult,
  type TrialRecord,
} from './adaptive';
export {
  startProtocol,
  nextTrial,
  nextStep,
  submitResponse,
  dismissTutorial,
  getResult,
  type MeasureMode,
  type MeasureProtocolConfig,
  type MeasureProtocolState,
  type MeasureTrial,
  type MeasureNextStep,
  type TrialOutcome,
  type SpmResult,
  type StandardResult,
  type TierScore,
  type MeasureProtocolResult,
} from './measure-protocol';
export {
  TUTORIAL_GATES,
  DEFAULT_TUTORIAL_CONTENT,
  getPendingTutorial,
  getTutorialContent,
  getAllTutorialIds,
  type RuleTutorialGate,
  type RuleTutorialContent,
} from './rule-tutorials';
export {
  explainRules,
  summarizeRules,
  explainComponentBindings,
} from './rule-explainer';
export {
  TUTORIAL_LESSONS,
  TUTORIAL_BLOC_LABELS,
  getLessonById,
  getLessonByStep,
  type TutorialLesson,
} from './tutorial-lessons';
