/**
 * Progression algorithm configuration
 */

import type { ProgressionAlgorithmId } from '../../../stores/settings-store';

export interface AlgorithmOption {
  id: ProgressionAlgorithmId;
  labelKey: string;
  descKey: string;
  requiresSessions?: number;
}

export const ALGORITHM_OPTIONS: AlgorithmOption[] = [
  {
    id: 'adaptive',
    labelKey: 'settings.progression.adaptive',
    descKey: 'settings.progression.adaptiveDesc',
  },
  {
    id: 'meta-learning',
    labelKey: 'settings.progression.metaLearning',
    descKey: 'settings.progression.metaLearningDesc',
  },
  {
    id: 'jitter-adaptive',
    labelKey: 'settings.progression.jitterAdaptive',
    descKey: 'settings.progression.jitterAdaptiveDesc',
  },
];
