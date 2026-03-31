/**
 * Golden tests for BrainWorkshopStrategy.
 *
 * Goal: detect unintended behavioral drift (sequence generation, targets/lures,
 * crab back effective N, arithmetic metadata) across refactors.
 *
 * To update the golden fixture intentionally:
 *   bun run scripts/generate-brainworkshop-golden.ts > packages/logic/src/domain/generator/__fixtures__/brainworkshop-golden.fixture.ts
 */

import { describe, expect, test } from 'bun:test';
import { BRAINWORKSHOP_GOLDEN } from './__fixtures__/brainworkshop-golden.fixture';
import { BrainWorkshopStrategy } from './brainworkshop';
import { SeededRandom } from '../random';
import type { BlockConfig } from '../types';

type BWTestConfig = BlockConfig & {
  extensions?: Record<string, unknown>;
};

type ModalitySnapshot = {
  value: unknown;
  isTarget: boolean | null;
  isLure: boolean | null;
  lureType: string | null;
};

type TrialSnapshot = {
  index: number;
  isBuffer: boolean;
  effectiveNBack: number | null;
  modalities: Record<string, ModalitySnapshot>;
  arithmeticNumber: number | null;
  arithmeticOperation: string | null;
};

function getPositionVariantValue(trial: any, id: string): unknown {
  if (id === 'position') return trial.position;
  const pairs: ReadonlyArray<readonly [string, unknown]> | undefined = trial.positions;
  if (!pairs) return null;
  const hit = pairs.find((p) => p[0] === id);
  return hit ? hit[1] : null;
}

function getVisVariantValue(trial: any, id: string): unknown {
  const pairs: ReadonlyArray<readonly [string, unknown]> | undefined = trial.visValues;
  if (!pairs) return null;
  const hit = pairs.find((p) => p[0] === id);
  return hit ? hit[1] : null;
}

function snapshotModality(trial: any, id: string): ModalitySnapshot {
  switch (id) {
    case 'position':
      return {
        value: trial.position,
        isTarget: trial.isPositionTarget ?? null,
        isLure: trial.isPositionLure ?? null,
        lureType: trial.positionLureType ?? null,
      };
    case 'position2':
      return {
        value: getPositionVariantValue(trial, id),
        isTarget: trial.isPosition2Target ?? null,
        isLure: trial.isPosition2Lure ?? null,
        lureType: trial.position2LureType ?? null,
      };
    case 'position3':
      return {
        value: getPositionVariantValue(trial, id),
        isTarget: trial.isPosition3Target ?? null,
        isLure: trial.isPosition3Lure ?? null,
        lureType: trial.position3LureType ?? null,
      };
    case 'position4':
      return {
        value: getPositionVariantValue(trial, id),
        isTarget: trial.isPosition4Target ?? null,
        isLure: trial.isPosition4Lure ?? null,
        lureType: trial.position4LureType ?? null,
      };
    case 'audio':
      return {
        value: trial.sound,
        isTarget: trial.isSoundTarget ?? null,
        isLure: trial.isSoundLure ?? null,
        lureType: trial.soundLureType ?? null,
      };
    case 'audio2':
      return {
        value: trial.sound2 ?? null,
        isTarget: trial.isSound2Target ?? null,
        isLure: trial.isSound2Lure ?? null,
        lureType: trial.sound2LureType ?? null,
      };
    case 'color':
      return {
        value: trial.color,
        isTarget: trial.isColorTarget ?? null,
        isLure: trial.isColorLure ?? null,
        lureType: trial.colorLureType ?? null,
      };
    case 'image':
      return {
        value: trial.image,
        isTarget: trial.isImageTarget ?? null,
        isLure: trial.isImageLure ?? null,
        lureType: trial.imageLureType ?? null,
      };
    case 'vis1':
      return {
        value: getVisVariantValue(trial, id),
        isTarget: trial.isVis1Target ?? null,
        isLure: trial.isVis1Lure ?? null,
        lureType: trial.vis1LureType ?? null,
      };
    case 'vis2':
      return {
        value: getVisVariantValue(trial, id),
        isTarget: trial.isVis2Target ?? null,
        isLure: trial.isVis2Lure ?? null,
        lureType: trial.vis2LureType ?? null,
      };
    case 'vis3':
      return {
        value: getVisVariantValue(trial, id),
        isTarget: trial.isVis3Target ?? null,
        isLure: trial.isVis3Lure ?? null,
        lureType: trial.vis3LureType ?? null,
      };
    case 'vis4':
      return {
        value: getVisVariantValue(trial, id),
        isTarget: trial.isVis4Target ?? null,
        isLure: trial.isVis4Lure ?? null,
        lureType: trial.vis4LureType ?? null,
      };
    case 'visvis':
      return {
        value: trial.vis ?? null,
        isTarget: trial.isVisVisTarget ?? null,
        isLure: trial.isVisVisLure ?? null,
        lureType: trial.visvisLureType ?? null,
      };
    case 'visaudio':
      return {
        value: trial.vis ?? null,
        isTarget: trial.isVisAudioTarget ?? null,
        isLure: trial.isVisAudioLure ?? null,
        lureType: trial.visaudioLureType ?? null,
      };
    case 'audiovis':
      return {
        value: trial.sound,
        isTarget: trial.isAudioVisTarget ?? null,
        isLure: trial.isAudioVisLure ?? null,
        lureType: trial.audiovisLureType ?? null,
      };
    case 'arithmetic':
      return {
        value: trial.arithmeticNumber ?? null,
        isTarget: trial.isArithmeticTarget ?? null,
        isLure: trial.isArithmeticLure ?? null,
        lureType: trial.arithmeticLureType ?? null,
      };
    default:
      return { value: null, isTarget: null, isLure: null, lureType: null };
  }
}

function snapshotTrial(trial: any, activeModalities: readonly string[]): TrialSnapshot {
  const modalities: Record<string, ModalitySnapshot> = {};
  for (const id of activeModalities) {
    modalities[id] = snapshotModality(trial, id);
  }

  return {
    index: trial.index,
    isBuffer: !!trial.isBuffer,
    effectiveNBack: typeof trial.effectiveNBack === 'number' ? trial.effectiveNBack : null,
    modalities,
    arithmeticNumber: typeof trial.arithmeticNumber === 'number' ? trial.arithmeticNumber : null,
    arithmeticOperation:
      typeof trial.arithmeticOperation === 'string' ? trial.arithmeticOperation : null,
  };
}

function makeConfig(input: {
  nLevel: number;
  activeModalities: readonly string[];
  extensions: Record<string, unknown>;
}): BWTestConfig {
  return {
    nLevel: input.nLevel,
    generator: 'BrainWorkshop',
    activeModalities: [...input.activeModalities],
    trialsCount: 0,
    targetProbability: 0,
    lureProbability: 0,
    intervalSeconds: 3,
    stimulusDurationSeconds: 0.5,
    extensions: input.extensions,
  };
}

describe('BrainWorkshopStrategy golden fixtures', () => {
  test('snapshots match fixtures (first trials)', () => {
    const strategy = new BrainWorkshopStrategy();

    for (const entry of BRAINWORKSHOP_GOLDEN) {
      const config = makeConfig({
        nLevel: entry.config.nLevel,
        activeModalities: entry.config.activeModalities,
        extensions: entry.config.extensions,
      });
      const rng = new SeededRandom(entry.seed);
      const trials = strategy.generate({ config: config as any, rng });

      expect(trials.length).toBe(entry.totalTrials);
      const snapshots = trials
        .slice(0, entry.snapshots.length)
        .map((t) => snapshotTrial(t as any, entry.config.activeModalities));

      expect(snapshots).toEqual(entry.snapshots as any);
    }
  });
});
