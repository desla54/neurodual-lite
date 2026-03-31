/**
 * Tests for BrainWorkshopJudge
 *
 * Brain Workshop v5.0 scoring:
 *   score = hits / (hits + misses + falseAlarms)
 *
 * IMPORTANT: Correct rejections are ignored by this score (faithful to BW).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { BW_SCORE_DOWN_NORMALIZED, BW_SCORE_PASS_NORMALIZED } from '../specs/thresholds';
import type { Trial } from '../types/core';
import { BrainWorkshopJudge } from './brainworkshop-judge';
import type { EvaluationContext, TrialResponse } from './trial-judge';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTrial = (index: number, isPositionTarget = false, isSoundTarget = false): Trial => ({
  index,
  position: 0,
  sound: 'C',
  // @ts-expect-error test override
  color: 'blue',
  isBuffer: false,
  trialType: 'Non-Cible',
  isPositionTarget,
  isSoundTarget,
  isColorTarget: false,
});

const createResponse = (
  trialIndex: number,
  positionPressed: boolean,
  audioPressed: boolean,
  timestamp = new Date(),
): TrialResponse => ({
  trialIndex,
  timestamp,
  responses: new Map([
    [
      'position',
      {
        modalityId: 'position',
        pressed: positionPressed,
        reactionTimeMs: positionPressed ? 250 : undefined,
      },
    ],
    [
      'audio',
      {
        modalityId: 'audio',
        pressed: audioPressed,
        reactionTimeMs: audioPressed ? 250 : undefined,
      },
    ],
  ]),
});

const createContext = (): EvaluationContext => ({
  activeModalities: ['position', 'audio'],
  passThreshold: BW_SCORE_PASS_NORMALIZED,
  downThreshold: BW_SCORE_DOWN_NORMALIZED,
  strategy: 'brainworkshop',
});

// =============================================================================
// Tests
// =============================================================================

describe('BrainWorkshopJudge', () => {
  let judge: BrainWorkshopJudge;

  beforeEach(() => {
    judge = new BrainWorkshopJudge();
  });

  test('uses normalized BW thresholds', () => {
    expect(BW_SCORE_PASS_NORMALIZED).toBe(0.8);
    expect(BW_SCORE_DOWN_NORMALIZED).toBe(0.5);
  });

  test('perfect performance: score=1, passed=true, nLevelRec=up', () => {
    const context = createContext();

    // 5 target trials (position+audio targets) - all hit
    for (let i = 0; i < 5; i++) {
      judge.record(
        judge.evaluate(createTrial(i, true, true), createResponse(i, true, true), context),
      );
    }

    // 10 non-target trials - all correct rejections (ignored by BW score)
    for (let i = 5; i < 15; i++) {
      judge.record(
        judge.evaluate(createTrial(i, false, false), createResponse(i, false, false), context),
      );
    }

    const summary = judge.summarize(context);
    expect(summary.score).toBe(1);
    expect(summary.passed).toBe(true);
    expect(summary.nLevelRecommendation).toBe('up');
  });

  test('at pass threshold: 4/5 hits (both modalities) → score=0.8, passed=true', () => {
    const context = createContext();

    // 4 target trials hit (both modalities)
    for (let i = 0; i < 4; i++) {
      judge.record(
        judge.evaluate(createTrial(i, true, true), createResponse(i, true, true), context),
      );
    }

    // 1 target trial missed (both modalities) → 2 misses
    judge.record(
      judge.evaluate(createTrial(4, true, true), createResponse(4, false, false), context),
    );

    // Some non-target trials (ignored by BW score)
    for (let i = 5; i < 15; i++) {
      judge.record(
        judge.evaluate(createTrial(i, false, false), createResponse(i, false, false), context),
      );
    }

    const summary = judge.summarize(context);
    expect(summary.score).toBeCloseTo(0.8, 8);
    expect(summary.passed).toBe(true);
    expect(summary.nLevelRecommendation).toBe('up');
  });

  test('between thresholds: score=0.6 → passed=false, nLevelRec=maintain', () => {
    const context = createContext();

    // 3 hits, 2 misses among 5 target trials (both modalities)
    // hits=6, misses=4 => 6/(6+4)=0.6
    for (let i = 0; i < 3; i++) {
      judge.record(
        judge.evaluate(createTrial(i, true, true), createResponse(i, true, true), context),
      );
    }
    for (let i = 3; i < 5; i++) {
      judge.record(
        judge.evaluate(createTrial(i, true, true), createResponse(i, false, false), context),
      );
    }

    const summary = judge.summarize(context);
    expect(summary.score).toBeCloseTo(0.6, 8);
    expect(summary.passed).toBe(false);
    expect(summary.nLevelRecommendation).toBe('maintain');
  });

  test('below strike threshold: score=0 → nLevelRec=down', () => {
    const context = createContext();

    // All misses on target trials
    for (let i = 0; i < 5; i++) {
      judge.record(
        judge.evaluate(createTrial(i, true, true), createResponse(i, false, false), context),
      );
    }

    const summary = judge.summarize(context);
    expect(summary.score).toBe(0);
    expect(summary.passed).toBe(false);
    expect(summary.nLevelRecommendation).toBe('down');
  });
});
