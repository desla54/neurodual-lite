import type { JourneyStrategyConfig } from '../../types/journey';
import { resolveHybridJourneyStrategyConfig } from './strategy-config';

export interface JourneyPresentationText {
  readonly key?: string;
  readonly defaultValue: string;
  readonly values?: Readonly<Record<string, number | string>>;
}

export interface JourneyPresentationRule {
  readonly tone: 'info' | 'up' | 'stay' | 'down' | 'neutral';
  readonly text: JourneyPresentationText;
}

export interface JourneyPresentationModel {
  readonly title: JourneyPresentationText;
  readonly iconModeIds: readonly string[];
  readonly selectorDescription?: JourneyPresentationText;
  readonly rulesDescription: JourneyPresentationText;
  readonly rules: readonly JourneyPresentationRule[];
}

interface ResolveJourneyPresentationInput {
  readonly gameMode?: string;
  readonly strategyConfig?: JourneyStrategyConfig;
}

const GENERIC_JOURNEY_RULES: readonly JourneyPresentationRule[] = [
  {
    tone: 'up',
    text: {
      key: 'journey.progression.excellent',
      defaultValue: '95% or higher → 1 session',
    },
  },
  {
    tone: 'stay',
    text: {
      key: 'journey.progression.good',
      defaultValue: '85% or higher → 2 sessions',
    },
  },
  {
    tone: 'info',
    text: {
      key: 'journey.progression.passing',
      defaultValue: '80% or higher → 3 sessions',
    },
  },
];

export function resolveJourneyPresentation(
  input: ResolveJourneyPresentationInput,
): JourneyPresentationModel {
  const gameMode = input.gameMode ?? 'dualnback-classic';

  switch (gameMode) {
    case 'dual-track-dnb-hybrid': {
      const hybrid = resolveHybridJourneyStrategyConfig({
        gameMode,
        strategyConfig: input.strategyConfig,
      });

      return {
        title: {
          key: 'stats.journey.dualTrackDnbHybrid',
          defaultValue: 'Dual Track + Dual N-Back',
        },
        iconModeIds: ['dual-track', 'dualnback-classic'],
        selectorDescription: {
          key: 'home.journeySelector.hybridDesc',
          defaultValue:
            'A hybrid path that alternates Dual Track and Dual N-Back within the same progression.',
        },
        rulesDescription: {
          key: 'journey.progression.hybrid.description',
          defaultValue:
            'This journey loops through {{trackCount}} Dual Track session(s), then {{dnbCount}} Dual N-Back session(s) at the same level.',
          values: {
            trackCount: hybrid.trackSessionsPerBlock,
            dnbCount: hybrid.dnbSessionsPerBlock,
          },
        },
        rules: [
          {
            tone: 'info',
            text: {
              key: 'journey.progression.hybrid.alternation',
              defaultValue: 'The loop always restarts with Dual Track when a decision is reached.',
            },
          },
          {
            tone: 'up',
            text: {
              key: 'journey.progression.hybrid.authority',
              defaultValue: 'Only Dual N-Back sessions decide up, stay, or down.',
            },
          },
          {
            tone: 'up',
            text: {
              key: 'journey.progression.hybrid.up',
              defaultValue: '0-1 error → Level up',
            },
          },
          {
            tone: 'stay',
            text: {
              key: 'journey.progression.hybrid.stay',
              defaultValue: '2-3 errors → Stay',
            },
          },
          {
            tone: 'down',
            text: {
              key: 'journey.progression.hybrid.down',
              defaultValue: '4+ errors → Level down',
            },
          },
          {
            tone: 'neutral',
            text: {
              key: 'journey.progression.hybrid.streakRule',
              defaultValue: 'Two sessions in a row in the same zone trigger the decision.',
            },
          },
        ],
      };
    }

    case 'sim-brainworkshop':
      return {
        title: {
          key: 'journey.modeBw',
          defaultValue: 'Brain Workshop',
        },
        iconModeIds: ['sim-brainworkshop'],
        rulesDescription: {
          key: 'journey.progression.brainworkshop.description',
          defaultValue: 'Brain Workshop protocol:',
        },
        rules: [
          {
            tone: 'up',
            text: {
              key: 'journey.progression.brainworkshop.up',
              defaultValue: '80% or higher → Level up',
            },
          },
          {
            tone: 'stay',
            text: {
              key: 'journey.progression.brainworkshop.stay',
              defaultValue: '50% to 79% → Stay',
            },
          },
          {
            tone: 'down',
            text: {
              key: 'journey.progression.brainworkshop.strike',
              defaultValue: '3 scores in a row under 50% → Level down',
            },
          },
        ],
      };

    case 'dual-trace':
      return {
        title: {
          key: 'stats.mode.dualTrace',
          defaultValue: 'Dual Trace',
        },
        iconModeIds: ['dual-trace'],
        rulesDescription: {
          key: 'journey.progression.brainworkshop.description',
          defaultValue: 'Brain Workshop protocol:',
        },
        rules: [
          {
            tone: 'up',
            text: {
              key: 'journey.progression.brainworkshop.up',
              defaultValue: '80% or higher → Level up',
            },
          },
          {
            tone: 'stay',
            text: {
              key: 'journey.progression.brainworkshop.stay',
              defaultValue: '50% to 79% → Stay',
            },
          },
          {
            tone: 'down',
            text: {
              key: 'journey.progression.brainworkshop.strike',
              defaultValue: '3 scores in a row under 50% → Level down',
            },
          },
        ],
      };

    case 'dual-track':
      return {
        title: {
          key: 'stats.mode.dualTrack',
          defaultValue: 'Dual Track',
        },
        iconModeIds: ['dual-track'],
        rulesDescription: {
          key: 'journey.progression.dualTrack.description',
          defaultValue: 'Dual Track uses a continuous mastery bar for each target-count stage:',
        },
        rules: [
          {
            tone: 'info',
            text: {
              key: 'journey.progression.dualTrack.calibration',
              defaultValue: 'A first calibration estimates your starting target count',
            },
          },
          {
            tone: 'up',
            text: {
              key: 'journey.progression.dualTrack.goodSession',
              defaultValue: 'Each good session fills the current stage a little',
            },
          },
          {
            tone: 'stay',
            text: {
              key: 'journey.progression.dualTrack.mastery',
              defaultValue:
                'Near-perfect sessions fill it faster, but ordinary sessions stay modest',
            },
          },
          {
            tone: 'down',
            text: {
              key: 'journey.progression.dualTrack.regression',
              defaultValue: 'Weak sessions can also make the current mastery bar go down',
            },
          },
          {
            tone: 'info',
            text: {
              key: 'journey.progression.dualTrack.unlock',
              defaultValue:
                'The next target count unlocks only when the current stage reaches 100%',
            },
          },
        ],
      };

    case 'dual-catch':
      return {
        title: {
          key: 'settings.gameMode.dualCatch',
          defaultValue: 'Dual Catch',
        },
        iconModeIds: ['dual-catch'],
        rulesDescription: {
          key: 'journey.progression.description',
          defaultValue: 'To advance to the next level, get a good score:',
        },
        rules: GENERIC_JOURNEY_RULES,
      };

    case 'dualnback-classic':
      return {
        title: {
          key: 'journey.modeDnb',
          defaultValue: 'Dual N-Back Classic',
        },
        iconModeIds: ['dualnback-classic'],
        rulesDescription: {
          key: 'journey.progression.jaeggi.description',
          defaultValue: 'Based on your weakest modality:',
        },
        rules: [
          {
            tone: 'up',
            text: {
              key: 'journey.progression.jaeggi.up',
              defaultValue: 'Fewer than 3 errors → Level up',
            },
          },
          {
            tone: 'stay',
            text: {
              key: 'journey.progression.jaeggi.stay',
              defaultValue: '3 to 5 errors → Stay at this level',
            },
          },
          {
            tone: 'down',
            text: {
              key: 'journey.progression.jaeggi.down',
              defaultValue: 'More than 5 errors → Level down',
            },
          },
        ],
      };

    default:
      return {
        title: {
          defaultValue: gameMode,
        },
        iconModeIds: [gameMode],
        rulesDescription: {
          key: 'journey.progression.description',
          defaultValue: 'To advance to the next level, get a good score:',
        },
        rules: GENERIC_JOURNEY_RULES,
      };
  }
}
