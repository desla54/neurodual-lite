/**
 * Default UI translations (English)
 */

import type { UITranslations } from './UITranslations';

export const defaultUITranslations: UITranslations = {
  modality: {
    position: 'Position',
    audio: 'Audio',
    dual: 'Dual',
    color: 'Color',
    arithmetic: 'Arithmetic',
    image: 'Image',
  },
  controls: {
    keyLabel: 'Key',
    groupLabel: 'Response buttons',
  },
  distractors: {
    addLabel: 'Add Distractor',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noDistractors: 'No distractors',
    sectionLabel: 'Distractors',
    timingLabel: 'Timing',
    enabledCheckmark: 'Enabled',
    timing: {
      synchronized: 'Synchronized',
      fixedOffset: 'Fixed Offset',
      independent: 'Independent',
      random: 'Random',
    },
    modalities: {
      position: 'Position',
      audio: 'Audio',
      color: 'Color',
    },
  },
  stimulusStyle: {
    fullSquare: 'Full Square',
    fullSquareDesc: 'Classic full square stimulus',
    nineDots: 'Nine Dots',
    nineDotsDesc: '9 dots pattern stimulus',
  },
  logo: {
    aria: 'Neurodual Logo',
    tagline: 'Brain Training',
  },
  grid: {
    fixationCross: 'Fixation cross',
    gridLabel: 'Position grid',
    cellLabel: 'Cell',
  },
  audioGate: {
    tapToEnable: 'Tap to enable sound',
    tapToResume: 'Tap to restore sound',
    loading: 'Loading audio...',
  },
};
