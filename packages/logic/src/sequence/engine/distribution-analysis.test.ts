/**
 * Test de distribution du SequenceEngine
 * Analyse 1000 séquences pour vérifier la variété des valeurs générées
 */

import { describe, it, expect } from 'bun:test';
import { createSequenceEngine } from './sequence-engine';
import { createSequenceSpec, type GeneratedTrial } from '../types';
import { createAdaptiveControllerAlgorithm } from '../algorithm/adaptive-controller';
import { createMetaLearningAlgorithm } from '../algorithm/meta-learning';
import { SequenceTrialGenerator } from '../../coach/sequence-trial-generator';

describe('SequenceEngine Distribution Analysis', () => {
  const engine = createSequenceEngine();

  // Spec similaire à dual-flow
  const placeSpec = createSequenceSpec({
    nLevel: 2,
    modalities: [
      { id: 'position', values: 8 }, // 0-7
      { id: 'audio', values: ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T'] },
    ],
    targetProbabilities: {
      position: 0.3,
      audio: 0.3,
    },
    lureProbabilities: {
      position: { 'n-1': 0.1 },
      audio: { 'n-1': 0.1 },
    },
    // @ts-expect-error test override
    totalTrials: 1000,
    seed: 'distribution-test-seed',
  });

  it('should analyze distribution over 1000 trials', () => {
    let state = engine.createInitialState(placeSpec);
    const trials: GeneratedTrial[] = [];

    // Generate 1000 trials
    for (let i = 0; i < 1000; i++) {
      const result = engine.generateNext(placeSpec, state);
      trials.push(result.trial);
      state = result.newState;
    }

    // Analyze position distribution
    const positionCounts = new Map<number | string, number>();
    const audioCounts = new Map<number | string, number>();
    const positionIntentions = { target: 0, neutral: 0, 'lure-n-1': 0, 'lure-n+1': 0 };
    const audioIntentions = { target: 0, neutral: 0, 'lure-n-1': 0, 'lure-n+1': 0 };

    // Track consecutive repeats
    let positionRepeats = 0;
    let audioRepeats = 0;
    let maxPositionRepeatStreak = 0;
    let maxAudioRepeatStreak = 0;
    let currentPositionStreak = 1;
    let currentAudioStreak = 1;

    for (let i = 0; i < trials.length; i++) {
      const trial = trials[i];

      // Position
      // @ts-expect-error test: nullable access
      const posValue = trial!.values.position.value;
      // @ts-expect-error test: nullable access
      const posIntention = trial!.values.position.intention;
      positionCounts.set(posValue, (positionCounts.get(posValue) ?? 0) + 1);
      positionIntentions[posIntention as keyof typeof positionIntentions]++;

      // Audio
      // @ts-expect-error test: nullable access
      const audioValue = trial!.values.audio.value;
      // @ts-expect-error test: nullable access
      const audioIntention = trial!.values.audio.intention;
      audioCounts.set(audioValue, (audioCounts.get(audioValue) ?? 0) + 1);
      audioIntentions[audioIntention as keyof typeof audioIntentions]++;

      // Check for consecutive repeats
      if (i > 0) {
        const prevTrial = trials[i - 1];
        // @ts-expect-error test: nullable access
        if (trial!.values.position.value === prevTrial!.values.position.value) {
          positionRepeats++;
          currentPositionStreak++;
          maxPositionRepeatStreak = Math.max(maxPositionRepeatStreak, currentPositionStreak);
        } else {
          currentPositionStreak = 1;
        }

        // @ts-expect-error test: nullable access
        if (trial!.values.audio.value === prevTrial!.values.audio.value) {
          audioRepeats++;
          currentAudioStreak++;
          maxAudioRepeatStreak = Math.max(maxAudioRepeatStreak, currentAudioStreak);
        } else {
          currentAudioStreak = 1;
        }
      }
    }

    // Print results
    console.log('\n========== DISTRIBUTION ANALYSIS (1000 trials) ==========\n');

    console.log('--- Position Values (0-7) ---');
    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      const pct = ((count / 1000) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 20));
      console.log(`  ${i}: ${count.toString().padStart(3)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Audio Values (C,H,K,L,P,Q,R,T) ---');
    for (const letter of ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T']) {
      const count = audioCounts.get(letter) ?? 0;
      const pct = ((count / 1000) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 20));
      console.log(`  ${letter}: ${count.toString().padStart(3)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Position Intentions ---');
    console.log(
      `  Target:   ${positionIntentions.target} (${((positionIntentions.target / 1000) * 100).toFixed(1)}%) - expected ~30%`,
    );
    console.log(
      `  Lure n-1: ${positionIntentions['lure-n-1']} (${((positionIntentions['lure-n-1'] / 1000) * 100).toFixed(1)}%) - expected ~10%`,
    );
    console.log(
      `  Neutral:  ${positionIntentions.neutral} (${((positionIntentions.neutral / 1000) * 100).toFixed(1)}%) - expected ~60%`,
    );

    console.log('\n--- Audio Intentions ---');
    console.log(
      `  Target:   ${audioIntentions.target} (${((audioIntentions.target / 1000) * 100).toFixed(1)}%) - expected ~30%`,
    );
    console.log(
      `  Lure n-1: ${audioIntentions['lure-n-1']} (${((audioIntentions['lure-n-1'] / 1000) * 100).toFixed(1)}%) - expected ~10%`,
    );
    console.log(
      `  Neutral:  ${audioIntentions.neutral} (${((audioIntentions.neutral / 1000) * 100).toFixed(1)}%) - expected ~60%`,
    );

    console.log('\n--- Consecutive Repeats ---');
    console.log(
      `  Position: ${positionRepeats} repeats (${((positionRepeats / 999) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Audio:    ${audioRepeats} repeats (${((audioRepeats / 999) * 100).toFixed(1)}%)`,
    );
    console.log(`  Max position repeat streak: ${maxPositionRepeatStreak}`);
    console.log(`  Max audio repeat streak:    ${maxAudioRepeatStreak}`);

    // Check first 20 trials for patterns
    console.log('\n--- First 20 trials (checking for obvious patterns) ---');
    for (let i = 0; i < 20; i++) {
      const t = trials[i];
      // @ts-expect-error test: nullable access
      const posIntent = t!.values.position.intention.substring(0, 3).toUpperCase();
      // @ts-expect-error test: nullable access
      const audIntent = t!.values.audio.intention.substring(0, 3).toUpperCase();
      console.log(
        // @ts-expect-error test: nullable access
        `  ${i.toString().padStart(2)}: pos=${t!.values.position.value} (${posIntent}) | audio=${t!.values.audio.value} (${audIntent})`,
      );
    }

    console.log('\n==========================================================\n');

    // Assertions - each value should appear roughly equally (12.5% for 8 values)
    // Allow 5-20% range to account for randomness
    const minExpected = 50; // 5% of 1000
    const maxExpected = 200; // 20% of 1000

    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      expect(count).toBeGreaterThan(minExpected);
      expect(count).toBeLessThan(maxExpected);
    }

    // Target intentions should be roughly 30%
    expect(positionIntentions.target).toBeGreaterThan(200);
    expect(positionIntentions.target).toBeLessThan(400);
  });

  it('should analyze REAL flow mode generator (SequenceTrialGenerator + AdaptiveController)', () => {
    // This simulates actual flow mode usage
    const algorithm = createAdaptiveControllerAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'flow',
    });

    const generator = new SequenceTrialGenerator({
      // @ts-expect-error test override
      blockConfig: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 100, // 100 trials to analyze
      },
      algorithm,
      totalTrials: 100,
      gameMode: 'flow',
    });

    const positionCounts = new Map<number, number>();
    const audioCounts = new Map<string, number>();
    let positionRepeats = 0;
    let audioRepeats = 0;
    let lastPosition: number | null = null;
    let lastAudio: string | null = null;

    const trials: Array<{ position: number; sound: string }> = [];

    // Generate 100 trials
    for (let i = 0; i < 100; i++) {
      const trial = generator.generateNext();
      trials.push({ position: trial.position, sound: trial.sound });

      // Count positions
      positionCounts.set(trial.position, (positionCounts.get(trial.position) ?? 0) + 1);
      audioCounts.set(trial.sound, (audioCounts.get(trial.sound) ?? 0) + 1);

      // Check repeats
      if (trial.position === lastPosition) positionRepeats++;
      if (trial.sound === lastAudio) audioRepeats++;

      lastPosition = trial.position;
      lastAudio = trial.sound;
    }

    console.log('\n========== FLOW MODE - REAL GENERATOR (100 trials) ==========\n');

    console.log('--- Position Distribution ---');
    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      const pct = ((count / 100) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 2));
      console.log(`  ${i}: ${count.toString().padStart(2)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Audio Distribution ---');
    for (const letter of ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T']) {
      const count = audioCounts.get(letter) ?? 0;
      const pct = ((count / 100) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 2));
      console.log(`  ${letter}: ${count.toString().padStart(2)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Consecutive Repeats ---');
    console.log(
      `  Position: ${positionRepeats} / 99 = ${((positionRepeats / 99) * 100).toFixed(1)}%`,
    );
    console.log(`  Audio:    ${audioRepeats} / 99 = ${((audioRepeats / 99) * 100).toFixed(1)}%`);

    console.log('\n--- First 30 trials (check for patterns) ---');
    for (let i = 0; i < 30; i++) {
      const t = trials[i];
      const posMarker = i > 0 && trials[i - 1]!.position === t!.position ? '🔴' : '  ';
      const audMarker = i > 0 && trials[i - 1]!.sound === t!.sound ? '🔴' : '  ';
      console.log(
        `  ${i.toString().padStart(2)}: pos=${t!.position} ${posMarker} | audio=${t!.sound} ${audMarker}`,
      );
    }

    console.log('\n=============================================================\n');

    // Each position should appear at least once (with 100 trials and 8 values)
    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      expect(count).toBeGreaterThan(0);
    }

    // Repeat rate should be reasonable (<25%)
    expect(positionRepeats / 99).toBeLessThan(0.25);
    expect(audioRepeats / 99).toBeLessThan(0.25);
  });

  it('should analyze META-LEARNING algorithm (3-layer ML)', () => {
    // This is the algorithm the user is complaining about
    const algorithm = createMetaLearningAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      mode: 'flow',
    });

    const generator = new SequenceTrialGenerator({
      // @ts-expect-error test override
      blockConfig: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 100,
      },
      algorithm,
      totalTrials: 100,
      gameMode: 'flow',
    });

    const positionCounts = new Map<number, number>();
    const audioCounts = new Map<string, number>();
    let positionRepeats = 0;
    let audioRepeats = 0;
    let lastPosition: number | null = null;
    let lastAudio: string | null = null;

    const trials: Array<{ position: number; sound: string }> = [];

    // Generate 100 trials
    for (let i = 0; i < 100; i++) {
      const trial = generator.generateNext();
      trials.push({ position: trial.position, sound: trial.sound });

      positionCounts.set(trial.position, (positionCounts.get(trial.position) ?? 0) + 1);
      audioCounts.set(trial.sound, (audioCounts.get(trial.sound) ?? 0) + 1);

      if (trial.position === lastPosition) positionRepeats++;
      if (trial.sound === lastAudio) audioRepeats++;

      lastPosition = trial.position;
      lastAudio = trial.sound;
    }

    console.log('\n========== META-LEARNING ALGORITHM (100 trials) ==========\n');

    console.log('--- Position Distribution ---');
    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      const pct = ((count / 100) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 2));
      console.log(`  ${i}: ${count.toString().padStart(2)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Audio Distribution ---');
    for (const letter of ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T']) {
      const count = audioCounts.get(letter) ?? 0;
      const pct = ((count / 100) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / 2));
      console.log(`  ${letter}: ${count.toString().padStart(2)} (${pct}%) ${bar}`);
    }

    console.log('\n--- Consecutive Repeats ---');
    console.log(
      `  Position: ${positionRepeats} / 99 = ${((positionRepeats / 99) * 100).toFixed(1)}%`,
    );
    console.log(`  Audio:    ${audioRepeats} / 99 = ${((audioRepeats / 99) * 100).toFixed(1)}%`);

    console.log('\n--- First 30 trials ---');
    for (let i = 0; i < 30; i++) {
      const t = trials[i];
      const posMarker = i > 0 && trials[i - 1]!.position === t!.position ? '🔴' : '  ';
      const audMarker = i > 0 && trials[i - 1]!.sound === t!.sound ? '🔴' : '  ';
      console.log(
        `  ${i.toString().padStart(2)}: pos=${t!.position} ${posMarker} | audio=${t!.sound} ${audMarker}`,
      );
    }

    console.log('\n=============================================================\n');

    // Each position should appear at least once
    for (let i = 0; i < 8; i++) {
      const count = positionCounts.get(i) ?? 0;
      expect(count).toBeGreaterThan(0);
    }

    // Repeat rate should be reasonable (<25%)
    expect(positionRepeats / 99).toBeLessThan(0.25);
    expect(audioRepeats / 99).toBeLessThan(0.25);
  });

  it('should not have excessive consecutive repeats', () => {
    let state = engine.createInitialState(placeSpec);
    let positionRepeats = 0;
    let lastPosition: number | string | null = null;

    for (let i = 0; i < 1000; i++) {
      const result = engine.generateNext(placeSpec, state);
      state = result.newState;

      // @ts-expect-error test: nullable access
      const pos = result!.trial.values.position.value;
      if (pos === lastPosition) {
        positionRepeats++;
      }
      lastPosition = pos;
    }

    // With 8 values, random chance of repeat is 1/8 = 12.5%
    // With constraints, should be lower. Definitely not >30%
    const repeatRate = positionRepeats / 999;
    console.log(`Repeat rate: ${(repeatRate * 100).toFixed(1)}%`);

    expect(repeatRate).toBeLessThan(0.3); // Max 30% repeats
  });
});
