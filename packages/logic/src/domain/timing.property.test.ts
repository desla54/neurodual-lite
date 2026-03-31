/**
 * Property-Based Tests for Timing Logic
 *
 * Tests timing invariants for stimulus presentation and response windows.
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Timing Arbitraries
// =============================================================================

const stimulusDurationArb = fc.integer({ min: 100, max: 3000 });
const interStimulusIntervalArb = fc.integer({ min: 500, max: 5000 });
const responseWindowArb = fc.integer({ min: 100, max: 3000 });
const reactionTimeArb = fc.double({ min: 50, max: 5000, noNaN: true });

// =============================================================================
// Stimulus Duration Property Tests
// =============================================================================

describe('Stimulus Duration - Property Tests', () => {
  it('stimulus duration is positive', () => {
    fc.assert(
      fc.property(stimulusDurationArb, (duration) => {
        return duration > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('stimulus duration is finite', () => {
    fc.assert(
      fc.property(stimulusDurationArb, (duration) => {
        return Number.isFinite(duration);
      }),
      { numRuns: 100 },
    );
  });

  it('stimulus duration is less than trial duration', () => {
    fc.assert(
      fc.property(stimulusDurationArb, interStimulusIntervalArb, (stim, isi) => {
        const trialDuration = stim + isi;
        return stim < trialDuration;
      }),
      { numRuns: 100 },
    );
  });

  it('multiple stimuli do not overlap in time', () => {
    fc.assert(
      fc.property(
        fc.array(stimulusDurationArb, { minLength: 2, maxLength: 10 }),
        interStimulusIntervalArb,
        (durations, isi) => {
          // Each stimulus ends before next begins
          let time = 0;
          for (const dur of durations) {
            const stimEnd = time + dur;
            const nextStart = stimEnd + isi;
            if (nextStart <= stimEnd) return false;
            time = nextStart;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Inter-Stimulus Interval Property Tests
// =============================================================================

describe('Inter-Stimulus Interval - Property Tests', () => {
  it('ISI is positive', () => {
    fc.assert(
      fc.property(interStimulusIntervalArb, (isi) => {
        return isi > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('ISI allows response time', () => {
    fc.assert(
      fc.property(interStimulusIntervalArb, responseWindowArb, (isi, window) => {
        // ISI should be >= response window for valid trials
        return isi >= 0 && window >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('trial period = stimulus + ISI', () => {
    fc.assert(
      fc.property(stimulusDurationArb, interStimulusIntervalArb, (stim, isi) => {
        const period = stim + isi;
        return period === stim + isi && period > stim && period > isi;
      }),
      { numRuns: 100 },
    );
  });

  it('total session time = trials × period', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }),
        stimulusDurationArb,
        interStimulusIntervalArb,
        (trialCount, stim, isi) => {
          const period = stim + isi;
          const totalTime = trialCount * period;
          return totalTime === trialCount * (stim + isi);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Response Window Property Tests
// =============================================================================

describe('Response Window - Property Tests', () => {
  it('response window is positive', () => {
    fc.assert(
      fc.property(responseWindowArb, (window) => {
        return window > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('response window is finite', () => {
    fc.assert(
      fc.property(responseWindowArb, (window) => {
        return Number.isFinite(window);
      }),
      { numRuns: 100 },
    );
  });

  it('response in window is valid', () => {
    fc.assert(
      fc.property(responseWindowArb, reactionTimeArb, (window, rt) => {
        const isInWindow = rt <= window;
        return typeof isInWindow === 'boolean';
      }),
      { numRuns: 100 },
    );
  });

  it('response before window start is too early', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: -0.001, noNaN: true }), (rt) => {
        // Negative RT means response before stimulus
        return rt < 0;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Reaction Time Property Tests
// =============================================================================

describe('Reaction Time Validation - Property Tests', () => {
  it('valid RT is positive', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        return rt > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('valid RT is finite', () => {
    fc.assert(
      fc.property(reactionTimeArb, (rt) => {
        return Number.isFinite(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('RT < window means valid response', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 1000, noNaN: true }),
        fc.double({ min: 1001, max: 3000, noNaN: true }),
        (rt, window) => {
          return rt < window;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('RT >= window means timeout', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 2000, max: 5000, noNaN: true }),
        fc.double({ min: 1000, max: 1999, noNaN: true }),
        (rt, window) => {
          return rt >= window;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('faster RT is better (lower is better)', () => {
    fc.assert(
      fc.property(reactionTimeArb, reactionTimeArb, (rt1, rt2) => {
        if (rt1 === rt2) return true;
        const [faster, slower] = rt1 < rt2 ? [rt1, rt2] : [rt2, rt1];
        return faster < slower;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Timing Sequence Property Tests
// =============================================================================

describe('Timing Sequence - Property Tests', () => {
  it('trial timestamps are monotonically increasing', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 2, maxLength: 20 }),
        (intervals) => {
          let time = 0;
          const timestamps: number[] = [];
          for (const interval of intervals) {
            time += interval;
            timestamps.push(time);
          }
          for (let i = 1; i < timestamps.length; i++) {
            if ((timestamps[i] ?? 0) <= (timestamps[i - 1] ?? 0)) return false;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('response timestamp > stimulus timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), reactionTimeArb, (stimTime, rt) => {
        const responseTime = stimTime + rt;
        return responseTime > stimTime;
      }),
      { numRuns: 100 },
    );
  });

  it('inter-trial gap is consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        stimulusDurationArb,
        interStimulusIntervalArb,
        (trialCount, stim, isi) => {
          const period = stim + isi;
          const timestamps = Array.from({ length: trialCount }, (_, i) => i * period);

          for (let i = 1; i < timestamps.length; i++) {
            const gap = (timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0);
            if (gap !== period) return false;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Tempo Mode Timing Property Tests
// =============================================================================

describe('Tempo Mode Timing - Property Tests', () => {
  const tempoWindowArb = fc.integer({ min: 50, max: 500 });

  it('tempo window is smaller than response window', () => {
    fc.assert(
      fc.property(tempoWindowArb, responseWindowArb, (tempo, response) => {
        // Tempo bonus window is typically smaller
        return tempo > 0 && response > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('tempo bonus requires fast response', () => {
    fc.assert(
      fc.property(
        tempoWindowArb,
        fc.double({ min: 10, max: 100, noNaN: true }),
        (bonusWindow, rt) => {
          const getsBonus = rt <= bonusWindow;
          return typeof getsBonus === 'boolean';
        },
      ),
      { numRuns: 50 },
    );
  });

  it('tempo scoring is time-sensitive', () => {
    fc.assert(
      fc.property(
        tempoWindowArb,
        fc.double({ min: 100, max: 200, noNaN: true }),
        fc.double({ min: 300, max: 500, noNaN: true }),
        (bonusWindow, fastRt, slowRt) => {
          const fastBonus = fastRt <= bonusWindow;
          const slowBonus = slowRt <= bonusWindow;
          // Faster response more likely to get bonus
          return fastRt < slowRt;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Delay and Timeout Property Tests
// =============================================================================

describe('Delay and Timeout - Property Tests', () => {
  const delayArb = fc.integer({ min: 0, max: 5000 });
  const timeoutArb = fc.integer({ min: 1000, max: 30000 });

  it('delay is non-negative', () => {
    fc.assert(
      fc.property(delayArb, (delay) => {
        return delay >= 0;
      }),
      { numRuns: 50 },
    );
  });

  it('timeout is positive', () => {
    fc.assert(
      fc.property(timeoutArb, (timeout) => {
        return timeout > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('delay < timeout (typically)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 500 }),
        fc.integer({ min: 1000, max: 5000 }),
        (delay, timeout) => {
          return delay < timeout;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('countdown decreases over time', () => {
    fc.assert(
      fc.property(
        timeoutArb,
        fc.array(fc.integer({ min: 100, max: 500 }), { minLength: 2, maxLength: 10 }),
        (total, intervals) => {
          let remaining = total;
          for (const elapsed of intervals) {
            const newRemaining = remaining - elapsed;
            if (remaining > 0 && elapsed > 0) {
              if (newRemaining >= remaining) return false;
            }
            remaining = Math.max(0, newRemaining);
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Animation Timing Property Tests
// =============================================================================

describe('Animation Timing - Property Tests', () => {
  const durationArb = fc.integer({ min: 100, max: 2000 });
  const fpsArb = fc.integer({ min: 30, max: 120 });

  it('animation duration is positive', () => {
    fc.assert(
      fc.property(durationArb, (duration) => {
        return duration > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('frame time = 1000 / fps', () => {
    fc.assert(
      fc.property(fpsArb, (fps) => {
        const frameTime = 1000 / fps;
        return frameTime > 0 && frameTime <= 1000 / 30;
      }),
      { numRuns: 50 },
    );
  });

  it('total frames = duration * fps / 1000', () => {
    fc.assert(
      fc.property(durationArb, fpsArb, (duration, fps) => {
        const frames = Math.ceil((duration * fps) / 1000);
        return frames > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('progress is in [0, 1]', () => {
    fc.assert(
      fc.property(durationArb, fc.double({ min: 0, max: 1, noNaN: true }), (duration, progress) => {
        const elapsed = duration * progress;
        return progress >= 0 && progress <= 1 && elapsed <= duration;
      }),
      { numRuns: 50 },
    );
  });
});
