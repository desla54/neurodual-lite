/**
 * Generator Helpers
 *
 * Classes utilitaires OOP partagées par les stratégies de génération.
 * Élimine la duplication de code entre BrainWorkshop, Jaeggi, et Libre.
 */

export {
  formatProblemForDisplay,
  generateProblemForAnswer,
  generateRandomProblem,
  getAnswerPoolSize,
  isValidProblem,
} from './arithmetic-generator';
export {
  checkInterferenceAnswer,
  formatInterferenceProblem,
  generateInterferenceArithmetic,
  verifyInterferenceProblem,
  type InterferenceArithmeticConfig,
  type InterferenceArithmeticProblem,
  type InterferenceArithmeticTerm,
  DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG,
} from './interference-arithmetic';
export { LureDetector } from './lure-detector';
export { ModalityStreamGenerator, type StreamMode } from './modality-stream-generator';
export { TrialClassifier } from './trial-classifier';
