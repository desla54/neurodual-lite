/**
 * Dual N-Back Classic Strategy
 *
 * Protocole clinique strict basé sur Jaeggi et al. (2008).
 * Distribution par défaut (20 trials) : 4 V-Seul + 4 A-Seul + 2 Dual + 10 Non-Cible
 * Supporte un trialsCount custom via config.trialsCount (ratios conservés).
 */

import { createStimulus, FlexibleTrialBuilder, toTrial } from '../modality';
import {
  type Color,
  POSITIONS,
  type Position,
  SOUNDS,
  type Sound,
  type Trial,
  type TrialType,
} from '../types';
import { LureDetector } from './helpers';
import { type GenerationContext, GeneratorStrategy, strategyRegistry } from './strategy';

/** Ratios Jaeggi : V-Seul 20%, A-Seul 20%, Dual 10%, Non-Cible 50% */
const DEFAULT_SCORABLE_COUNT = 20;

function buildDistribution(scorableCount: number): TrialType[] {
  if (scorableCount === DEFAULT_SCORABLE_COUNT) {
    // Fast path : distribution originale exacte
    return [
      'V-Seul',
      'V-Seul',
      'V-Seul',
      'V-Seul',
      'A-Seul',
      'A-Seul',
      'A-Seul',
      'A-Seul',
      'Dual',
      'Dual',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
      'Non-Cible',
    ];
  }
  // Scaled distribution — at least 1 of each target type
  const vSeul = Math.max(1, Math.round(0.2 * scorableCount));
  const aSeul = Math.max(1, Math.round(0.2 * scorableCount));
  const dual = Math.max(1, Math.round(0.1 * scorableCount));
  const nonCible = Math.max(0, scorableCount - vSeul - aSeul - dual);

  const dist: TrialType[] = [];
  for (let i = 0; i < vSeul; i++) dist.push('V-Seul');
  for (let i = 0; i < aSeul; i++) dist.push('A-Seul');
  for (let i = 0; i < dual; i++) dist.push('Dual');
  for (let i = 0; i < nonCible; i++) dist.push('Non-Cible');
  return dist;
}

const DEFAULT_COLOR: Color = 'ink-navy';

export class DualnbackClassicStrategy extends GeneratorStrategy {
  readonly name = 'DualnbackClassic';

  generate(context: GenerationContext): Trial[] {
    const { config, rng } = context;
    const { nLevel } = config;

    if (nLevel < 1) {
      throw new Error(`Invalid nLevel: ${nLevel}. Must be >= 1`);
    }

    const trials: Trial[] = [];
    const scorableCount = config.trialsCount > 0 ? config.trialsCount : DEFAULT_SCORABLE_COUNT;
    const distribution = rng.shuffle(buildDistribution(scorableCount));
    const builder = new FlexibleTrialBuilder();

    // Séquences pour le tracking N-back
    const posHistory: Position[] = [];
    const soundHistory: Sound[] = [];

    // Phase Buffer (non-scorable)
    for (let i = 0; i < nLevel; i++) {
      const position = rng.choice(POSITIONS);
      const sound = rng.choice(SOUNDS);

      posHistory.push(position);
      soundHistory.push(sound);

      builder
        .reset()
        .setIndex(i)
        .setBuffer(true)
        .addStimulus(createStimulus('position', position, false, false))
        .addStimulus(createStimulus('audio', sound, false, false))
        .addStimulus(createStimulus('color', DEFAULT_COLOR, false, false));

      trials.push(toTrial(builder.build()));
    }

    // Phase Scorable
    for (let i = 0; i < distribution.length; i++) {
      const currentIdx = nLevel + i;
      const type = distribution[i] as TrialType;
      const nBackIdx = currentIdx - nLevel;

      const nBackPos = posHistory[nBackIdx] as Position;
      const nBackSound = soundHistory[nBackIdx] as Sound;

      // Position : cible si V-Seul ou Dual
      const isPositionTarget = type === 'V-Seul' || type === 'Dual';
      const position = isPositionTarget ? nBackPos : rng.choiceExcluding(POSITIONS, nBackPos);

      // Sound : cible si A-Seul ou Dual
      const isSoundTarget = type === 'A-Seul' || type === 'Dual';
      const sound = isSoundTarget ? nBackSound : rng.choiceExcluding(SOUNDS, nBackSound);

      posHistory.push(position);
      soundHistory.push(sound);

      // Utiliser LureDetector centralisé
      const posLure = LureDetector.detect(
        position,
        posHistory,
        currentIdx,
        nLevel,
        isPositionTarget,
      );
      const soundLure = LureDetector.detect(sound, soundHistory, currentIdx, nLevel, isSoundTarget);

      builder
        .reset()
        .setIndex(currentIdx)
        .setBuffer(false)
        .addStimulus(
          createStimulus(
            'position',
            position,
            isPositionTarget,
            posLure !== null,
            posLure ?? undefined,
          ),
        )
        .addStimulus(
          createStimulus('audio', sound, isSoundTarget, soundLure !== null, soundLure ?? undefined),
        )
        .addStimulus(createStimulus('color', DEFAULT_COLOR, false, false));

      trials.push(toTrial(builder.build()));
    }

    return trials;
  }
}

// Auto-register
strategyRegistry.register(new DualnbackClassicStrategy());
