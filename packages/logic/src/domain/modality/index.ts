/**
 * Modality System Exports
 */

// Core modality types and registry
export type { ModalityDefinition, ModalityId, Stimulus, StimulusValue } from './modality';
export { createStimulus, modalityRegistry, ModalityRegistry } from './modality';

// FlexibleTrial
export type { FlexibleTrial } from './flexible-trial';
export {
  FlexibleTrialBuilder,
  getActiveModalities,
  getLures,
  getStimulus,
  getStimulusValue,
  getTargets,
  isLure,
  isTarget,
} from './flexible-trial';

// Adapter
export type { FlexibleTrialInput } from './trial-adapter';
export {
  getColor,
  getHasResponse,
  getIsLure,
  getIsTarget,
  getLureType,
  getPosition,
  getResponseRT,
  getSound,
  isFlexibleTrial,
  isFlexibleTrialInput,
  toTrial,
  toTrials,
} from './trial-adapter';
