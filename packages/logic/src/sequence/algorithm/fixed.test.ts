import { describe, expect, it } from 'bun:test';
import {
  FixedAlgorithm,
  createDualTempoAlgorithm,
  createDualMemoAlgorithm,
  createDualPlaceAlgorithm,
} from './fixed';
import { createSequenceSpec } from '../types';
import { createMockAlgorithmContext } from '../../test-utils/test-factories';

describe('FixedAlgorithm', () => {
  const spec = createSequenceSpec({
    nLevel: 2,
    modalities: [{ id: 'v', values: 9 }],
    targetProbabilities: { v: 0.3 },
  });

  const context = createMockAlgorithmContext();

  it('should return the provided spec', () => {
    const algo = new FixedAlgorithm(spec);
    expect(algo.getSpec(context)).toBe(spec);
  });

  it('should support serialization and restoration', () => {
    const algo = new FixedAlgorithm(spec);
    const state = algo.serialize();
    expect(state.algorithmType).toBe('fixed');

    const newSpec = { ...spec, nLevel: 5 };
    const newAlgo = new FixedAlgorithm(newSpec);
    newAlgo.restore(state);
    expect(newAlgo.getSpec(context).nLevel).toBe(2);
  });

  it('should allow manual spec updates', () => {
    const algo = new FixedAlgorithm(spec);
    const newSpec = { ...spec, nLevel: 3 };
    algo.setSpec(newSpec);
    expect(algo.getSpec(context).nLevel).toBe(3);
  });

  it('should throw when restoring from wrong type', () => {
    const algo = new FixedAlgorithm(spec);
    expect(() => algo.restore({ algorithmType: 'wrong', version: 1, data: {} })).toThrow();
  });
});

describe('Stub Factories', () => {
  const context = createMockAlgorithmContext();

  it('should create tempo algorithm with defaults', () => {
    const algo = createDualTempoAlgorithm();
    expect(algo.getSpec(context).nLevel).toBe(2);
  });

  it('should create memo algorithm with custom config', () => {
    const algo = createDualMemoAlgorithm({ initialNLevel: 4 });
    expect(algo.getSpec(context).nLevel).toBe(4);
  });

  it('should create flow algorithm', () => {
    const algo = createDualPlaceAlgorithm();
    expect(algo.getSpec(context).targetProbabilities.position).toBeDefined();
  });
});
