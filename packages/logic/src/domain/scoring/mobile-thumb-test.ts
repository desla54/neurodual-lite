import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
import type { TempoResponseData } from '../../types/ups';

const createResponse = (
  trialIndex: number,
  rt: number,
  modality: 'audio' | 'position',
  inputMethod: 'keyboard' | 'touch',
): TempoResponseData => ({
  trialIndex,
  reactionTimeMs: rt,
  pressDurationMs: 100,
  responsePhase: 'during_stimulus',
  result: 'hit',
  modality,
  inputMethod,
});

function testDualMatchScenario() {
  console.log('--- Scenario: Dual Match (Audio + Visual at same time) ---');

  // 1. KEYBOARD (Parallel)
  const keyboardResponses: TempoResponseData[] = [];
  for (let i = 0; i < 20; i++) {
    const baseRT = 500;
    // Single Match
    keyboardResponses.push(createResponse(i * 2, baseRT, 'audio', 'keyboard'));

    // Dual Match (Parallel)
    keyboardResponses.push(createResponse(i * 2 + 1, baseRT, 'audio', 'keyboard'));
    keyboardResponses.push(createResponse(i * 2 + 1, baseRT + 10, 'position', 'keyboard'));
  }
  const kbResult = JaeggiConfidenceCalculator.calculateWithDebug(keyboardResponses, 1.0);
  console.log(`Keyboard Score (Parallel): ${kbResult.score}/100`);
  console.log(`Keyboard RT Stability: ${kbResult.components.rtStability}`);

  // 2. MOBILE (Single Thumb)
  const mobileResponses: TempoResponseData[] = [];
  const THUMB_TRAVEL_TIME = 150; // ms to move thumb

  for (let i = 0; i < 20; i++) {
    const baseRT = 500;
    // Single Match
    mobileResponses.push(createResponse(i * 2, baseRT, 'audio', 'touch'));

    // Dual Match (Sequential)
    mobileResponses.push(createResponse(i * 2 + 1, baseRT, 'audio', 'touch'));
    mobileResponses.push(
      createResponse(i * 2 + 1, baseRT + THUMB_TRAVEL_TIME, 'position', 'touch'),
    );
  }

  const mobileResult = JaeggiConfidenceCalculator.calculateWithDebug(mobileResponses, 1.0);
  console.log(`Mobile Score (Single Thumb): ${mobileResult.score}/100`);
  console.log(`Mobile RT Stability: ${mobileResult.components.rtStability}`);

  const penalty = kbResult.components.rtStability - mobileResult.components.rtStability;
  console.log(`Unfair Penalty: -${penalty} points on Stability just for using one thumb.`);
}

testDualMatchScenario();
