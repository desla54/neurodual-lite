import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
import type { TempoResponseData } from '../../types/ups';

// Helpers
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

// SLC (Sequential Latency Correction) Logic Simulation
function applySLC(responses: TempoResponseData[]): TempoResponseData[] {
  const sorted = [...responses].sort(
    (a, b) => a.trialIndex - b.trialIndex || a.reactionTimeMs - b.reactionTimeMs,
  );
  const corrected: TempoResponseData[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (!current) continue;
    const prev = i > 0 ? sorted[i - 1] : undefined;

    let correctedRT = current.reactionTimeMs;

    // Check for Sequential Pattern
    if (prev && prev.trialIndex === current.trialIndex && current.inputMethod === 'touch') {
      const delta = Math.abs(current.reactionTimeMs - prev.reactionTimeMs);

      // If delay is within "Thumb Travel Time" range (50-300ms)
      if (delta > 50 && delta < 300) {
        // Align RT2 with RT1 for stability calculation
        correctedRT = prev.reactionTimeMs;
        console.log(
          ` -> Correcting Trial ${current.trialIndex}: RT ${current.reactionTimeMs} -> ${correctedRT} (Delta: ${delta}ms)`,
        );
      }
    }

    corrected.push({
      ...current,
      reactionTimeMs: correctedRT,
    });
  }
  return corrected;
}

function testSLC() {
  console.log('--- Testing SLC (Sequential Latency Correction) ---');

  // MOBILE (Single Thumb) - Raw Data
  const mobileResponses: TempoResponseData[] = [];
  const THUMB_TRAVEL_TIME = 150;

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

  // 1. Before Correction
  const rawResult = JaeggiConfidenceCalculator.calculateWithDebug(mobileResponses, 1.0);
  console.log(`Raw Mobile Stability: ${rawResult.components.rtStability}`);

  // 2. After Correction
  const correctedResponses = applySLC(mobileResponses);
  const slcResult = JaeggiConfidenceCalculator.calculateWithDebug(correctedResponses, 1.0);
  console.log(`Corrected (SLC) Stability: ${slcResult.components.rtStability}`);

  if (slcResult.components.rtStability > 95) {
    console.log('\x1b[32mSUCCESS: Mobile player is no longer penalized!\x1b[0m');
  } else {
    console.log('\x1b[31mFAIL: Correction insufficient.\x1b[0m');
  }
}

// Only run when executed directly (dev simulation)
if (import.meta.main) {
  testSLC();
}
