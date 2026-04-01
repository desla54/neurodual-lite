import type { GameMode } from '../../config';

export interface ModeSettingsNavCopy {
  readonly title: string;
  readonly titleDefault: string;
  readonly subtitle: string;
  readonly subtitleDefault: string;
}

export interface ModeSettingsNavigation {
  readonly sectionTitle: string;
  readonly sectionTitleDefault: string;
  readonly base: ModeSettingsNavCopy;
  readonly tempo: ModeSettingsNavCopy;
  readonly generator: ModeSettingsNavCopy;
  readonly advanced: ModeSettingsNavCopy;
}

const DEFAULT_NAVIGATION: ModeSettingsNavigation = {
  sectionTitle: 'settings.config.main',
  sectionTitleDefault: 'Reglages de session',
  base: {
    title: 'settings.config.main',
    titleDefault: 'Reglages principaux',
    subtitle: 'settings.freeTrainingCards.baseSubtitle',
    subtitleDefault: 'Niveau, modalites, duree',
  },
  tempo: {
    title: 'settings.brainworkshop.tempo',
    titleDefault: 'Tempo',
    subtitle: 'settings.freeTrainingCards.tempoSubtitle',
    subtitleDefault: 'Rythme et affichage',
  },
  generator: {
    title: 'settings.brainworkshop.generator',
    titleDefault: 'Generation',
    subtitle: 'settings.freeTrainingCards.generatorSubtitle',
    subtitleDefault: 'Generation des stimuli',
  },
  advanced: {
    title: 'settings.config.advanced',
    titleDefault: 'Avance',
    subtitle: 'settings.freeTrainingCards.advancedSubtitle',
    subtitleDefault: 'Progression et options',
  },
};

const MODE_NAVIGATION_OVERRIDES: Partial<Record<GameMode, Partial<ModeSettingsNavigation>>> = {
  tower: {
    sectionTitle: 'settings.modeSections.tower.sectionTitle',
    sectionTitleDefault: 'Reglages Tower of London',
    base: {
      title: 'settings.modeSections.tower.base.title',
      titleDefault: 'Puzzles et difficulte',
      subtitle: 'settings.modeSections.tower.base.subtitle',
      subtitleDefault: 'Taille des tours, variantes et duree',
    },
  },
  gridlock: {
    sectionTitle: 'settings.modeSections.gridlock.sectionTitle',
    sectionTitleDefault: 'Reglages Gridlock',
    base: {
      title: 'settings.modeSections.gridlock.base.title',
      titleDefault: 'Structure de session',
      subtitle: 'settings.modeSections.gridlock.base.subtitle',
      subtitleDefault: 'Profil, variante, duree',
    },
    advanced: {
      title: 'settings.modeSections.gridlock.advanced.title',
      titleDefault: 'Aides et reperes',
      subtitle: 'settings.modeSections.gridlock.advanced.subtitle',
      subtitleDefault: 'Assistance, HUD, fin de puzzle',
    },
  },
  'memory-match': {
    base: {
      title: 'settings.modeSections.memoryMatch.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.memoryMatch.base.subtitle',
      subtitleDefault: 'Grille et plateaux',
    },
  },
  'lights-out': {
    base: {
      title: 'settings.modeSections.lightsOut.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.lightsOut.base.subtitle',
      subtitleDefault: 'Grille et puzzles',
    },
  },
  stroop: {
    base: {
      title: 'settings.modeSections.stroop.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.stroop.base.subtitle',
      subtitleDefault: 'Essais et duree',
    },
  },
  'stroop-flex': {
    base: {
      title: 'settings.modeSections.stroop.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.stroop.base.subtitle',
      subtitleDefault: 'Essais et duree',
    },
  },
  flanker: {
    base: {
      title: 'settings.modeSections.flanker.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.flanker.base.subtitle',
      subtitleDefault: 'Essais et duree',
    },
  },
  'digit-span': {
    base: {
      title: 'settings.modeSections.digitSpan.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.digitSpan.base.subtitle',
      subtitleDefault: 'Empan et essais',
    },
  },
  'symmetry-span': {
    base: {
      title: 'settings.modeSections.symmetrySpan.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.symmetrySpan.base.subtitle',
      subtitleDefault: 'Empan et series',
    },
  },
  'mental-rotation': {
    base: {
      title: 'settings.modeSections.mentalRotation.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.mentalRotation.base.subtitle',
      subtitleDefault: 'Essais et duree',
    },
  },
  mirror: {
    base: {
      title: 'settings.modeSections.mirror.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.mirror.base.subtitle',
      subtitleDefault: 'Axe et motifs',
    },
  },
  'visual-search': {
    base: {
      title: 'settings.modeSections.visualSearch.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.visualSearch.base.subtitle',
      subtitleDefault: 'Essais et duree',
    },
  },
  'spot-diff': {
    base: {
      title: 'settings.modeSections.spotDiff.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.spotDiff.base.subtitle',
      subtitleDefault: 'Difficulte et manches',
    },
  },
  tangram: {
    base: {
      title: 'settings.modeSections.tangram.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.tangram.base.subtitle',
      subtitleDefault: 'Difficulte et puzzles',
    },
  },
  'task-switching': {
    base: {
      title: 'settings.modeSections.taskSwitching.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.taskSwitching.base.subtitle',
      subtitleDefault: 'Essais et rythme',
    },
  },
  reflex: {
    base: {
      title: 'settings.modeSections.reflex.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.reflex.base.subtitle',
      subtitleDefault: 'Essais et vitesse',
    },
  },
  'speed-sort': {
    base: {
      title: 'settings.modeSections.speedSort.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.speedSort.base.subtitle',
      subtitleDefault: 'Regles et essais',
    },
  },
  nonogram: {
    base: {
      title: 'settings.modeSections.nonogram.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.nonogram.base.subtitle',
      subtitleDefault: 'Grille et puzzles',
    },
  },
  sokoban: {
    base: {
      title: 'settings.modeSections.sokoban.base.title',
      titleDefault: 'Reglages principaux',
      subtitle: 'settings.modeSections.sokoban.base.subtitle',
      subtitleDefault: 'Difficulte et puzzles',
    },
  },
  'sim-brainworkshop': {
    base: {
      title: 'settings.brainworkshop.sessionBase',
      titleDefault: 'Session de base',
      subtitle: 'settings.modeSections.brainworkshop.base.subtitle',
      subtitleDefault: 'Niveau, modalites et duree',
    },
    tempo: {
      title: 'settings.brainworkshop.tempo',
      titleDefault: 'Tempo',
      subtitle: 'settings.modeSections.brainworkshop.tempo.subtitle',
      subtitleDefault: 'Ticks, extinction et rythme de presentation',
    },
    generator: {
      title: 'settings.brainworkshop.generator',
      titleDefault: 'Generation',
      subtitle: 'settings.modeSections.brainworkshop.generator.subtitle',
      subtitleDefault: 'Matches garantis, interference et multi-stimulus',
    },
    advanced: {
      title: 'settings.config.advanced',
      titleDefault: 'Avance',
      subtitle: 'settings.modeSections.brainworkshop.advanced.subtitle',
      subtitleDefault: 'Formule de session, variable N et options expertes',
    },
  },
};

export function getModeSettingsNavigation(mode: GameMode): ModeSettingsNavigation {
  const override = MODE_NAVIGATION_OVERRIDES[mode];
  if (!override) return DEFAULT_NAVIGATION;

  return {
    sectionTitle: override.sectionTitle ?? DEFAULT_NAVIGATION.sectionTitle,
    sectionTitleDefault: override.sectionTitleDefault ?? DEFAULT_NAVIGATION.sectionTitleDefault,
    base: { ...DEFAULT_NAVIGATION.base, ...override.base },
    tempo: { ...DEFAULT_NAVIGATION.tempo, ...override.tempo },
    generator: { ...DEFAULT_NAVIGATION.generator, ...override.generator },
    advanced: { ...DEFAULT_NAVIGATION.advanced, ...override.advanced },
  };
}
