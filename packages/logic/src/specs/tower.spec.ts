/**
 * Tower (Tower of London) Specification
 *
 * SINGLE SOURCE OF TRUTH for the Tower task.
 *
 * Shallice (1982) / Owen et al. (1990), productized as a generated planning block:
 * - 3 pegs with colored discs/balls
 * - Match a target configuration in minimum moves
 * - Mixed challenge set (classic, precision, memory, expert)
 * - Measures planning, problem-solving, executive control
 * - Key metrics: optimality, planning latency, support usage, composite mastery
 */

import type { ModeSpec } from './types';
import {
  ACCURACY_PASS_NORMALIZED,
  TOWER_DEFAULT_PROBLEMS,
  TOWER_TIME_LIMIT_MS,
  MODE_COLOR_TOWER,
} from './thresholds';

// =============================================================================
// Tower Specification
// =============================================================================

export const TowerSpec: ModeSpec = {
  metadata: {
    id: 'tower',
    displayName: 'Tower of London',
    description:
      'Generated planning puzzles with classic, memory and expert variants. Measures planning ability.',
    tags: ['training', 'executive', 'planning', 'generated'],
    difficultyLevel: 4,
    version: '1.0.0',
  },

  sessionType: 'GameSession',

  scoring: {
    strategy: 'accuracy',
    passThreshold: ACCURACY_PASS_NORMALIZED,
  },

  timing: {
    stimulusDurationMs: TOWER_TIME_LIMIT_MS,
    intervalMs: 1,
  },

  generation: {
    generator: 'Sequence',
    targetProbability: 1.0,
    lureProbability: 0,
    sequenceMode: 'tempo',
  },

  defaults: {
    nLevel: 1,
    trialsCount: TOWER_DEFAULT_PROBLEMS,
    activeModalities: ['position'],
  },

  adaptivity: {
    algorithm: 'none',
    nLevelSource: 'user',
    configurableSettings: ['trialsCount'],
  },

  report: {
    sections: ['HERO', 'PERFORMANCE', 'DETAILS', 'RECENT_TREND'],
    display: {
      modeScoreKey: 'report.modeScore.accuracy',
      modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
      speedStatKey: 'report.speed.reactionTime',
      colors: MODE_COLOR_TOWER,
    },
  },

  stats: {
    simple: {
      sections: ['ACTIVITY_KPIS', 'SESSIONS_PER_DAY', 'PERFORMANCE_KPIS'],
    },
    advanced: {
      sections: ['UPS_SUMMARY', 'DISTRIBUTION'],
    },
  },
};

// =============================================================================
// All Tower Specs
// =============================================================================

export const TowerSpecs = {
  tower: TowerSpec,
} as const;
