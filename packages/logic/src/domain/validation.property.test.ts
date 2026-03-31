/**
 * Property-Based Tests for Validation Logic
 *
 * Tests input validation invariants for game inputs.
 */
import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Validation Helpers
// =============================================================================

const isValidNLevel = (n: number): boolean => {
  return Number.isInteger(n) && n >= 1 && n <= 9;
};

const isValidTrialIndex = (index: number, totalTrials: number): boolean => {
  return Number.isInteger(index) && index >= 0 && index < totalTrials;
};

const isValidScore = (score: number): boolean => {
  return Number.isFinite(score) && score >= 0 && score <= 1;
};

const isValidDPrime = (d: number): boolean => {
  return Number.isFinite(d) && d >= -5 && d <= 5;
};

const isValidReactionTime = (rt: number): boolean => {
  return Number.isFinite(rt) && rt > 0 && rt < 30000;
};

const isValidProbability = (p: number): boolean => {
  return Number.isFinite(p) && p >= 0 && p <= 1;
};

const isValidTimestamp = (ts: number): boolean => {
  return Number.isInteger(ts) && ts >= 0;
};

const isValidUUID = (uuid: string): boolean => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return pattern.test(uuid);
};

// =============================================================================
// N-Level Validation Tests
// =============================================================================

describe('N-Level Validation - Property Tests', () => {
  it('valid n-levels pass validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (n) => {
        return isValidNLevel(n);
      }),
      { numRuns: 50 },
    );
  });

  it('n-level < 1 fails validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 0 }), (n) => {
        return !isValidNLevel(n);
      }),
      { numRuns: 50 },
    );
  });

  it('n-level > 9 fails validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (n) => {
        return !isValidNLevel(n);
      }),
      { numRuns: 50 },
    );
  });

  it('non-integer n-level fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.1, max: 8.9, noNaN: true }), (n) => {
        return !isValidNLevel(n);
      }),
      { numRuns: 50 },
    );
  });

  it('NaN n-level fails validation', () => {
    expect(isValidNLevel(NaN)).toBe(false);
  });

  it('Infinity n-level fails validation', () => {
    expect(isValidNLevel(Infinity)).toBe(false);
    expect(isValidNLevel(-Infinity)).toBe(false);
  });
});

// =============================================================================
// Trial Index Validation Tests
// =============================================================================

describe('Trial Index Validation - Property Tests', () => {
  it('valid indices pass validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (totalTrials) => {
        for (let i = 0; i < totalTrials; i++) {
          if (!isValidTrialIndex(i, totalTrials)) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('negative index fails validation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 10, max: 100 }),
        (index, total) => {
          return !isValidTrialIndex(index, total);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('index >= total fails validation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 0, max: 50 }),
        (total, offset) => {
          const index = total + offset;
          return !isValidTrialIndex(index, total);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('non-integer index fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 9.9, noNaN: true }), (index) => {
        return !isValidTrialIndex(index, 20);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Score Validation Tests
// =============================================================================

describe('Score Validation - Property Tests', () => {
  it('valid scores pass validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (score) => {
        return isValidScore(score);
      }),
      { numRuns: 100 },
    );
  });

  it('negative score fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.001, noNaN: true }), (score) => {
        return !isValidScore(score);
      }),
      { numRuns: 50 },
    );
  });

  it('score > 1 fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.001, max: 100, noNaN: true }), (score) => {
        return !isValidScore(score);
      }),
      { numRuns: 50 },
    );
  });

  it('NaN score fails validation', () => {
    expect(isValidScore(NaN)).toBe(false);
  });

  it('Infinity score fails validation', () => {
    expect(isValidScore(Infinity)).toBe(false);
    expect(isValidScore(-Infinity)).toBe(false);
  });

  it('boundary values pass validation', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(1)).toBe(true);
    expect(isValidScore(0.5)).toBe(true);
  });
});

// =============================================================================
// D-Prime Validation Tests
// =============================================================================

describe('D-Prime Validation - Property Tests', () => {
  it('valid d-prime values pass validation', () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (d) => {
        return isValidDPrime(d);
      }),
      { numRuns: 100 },
    );
  });

  it('d-prime < -5 fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -5.001, noNaN: true }), (d) => {
        return !isValidDPrime(d);
      }),
      { numRuns: 50 },
    );
  });

  it('d-prime > 5 fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 5.001, max: 100, noNaN: true }), (d) => {
        return !isValidDPrime(d);
      }),
      { numRuns: 50 },
    );
  });

  it('NaN d-prime fails validation', () => {
    expect(isValidDPrime(NaN)).toBe(false);
  });

  it('boundary values pass validation', () => {
    expect(isValidDPrime(-5)).toBe(true);
    expect(isValidDPrime(5)).toBe(true);
    expect(isValidDPrime(0)).toBe(true);
  });
});

// =============================================================================
// Reaction Time Validation Tests
// =============================================================================

describe('Reaction Time Validation - Property Tests', () => {
  it('valid reaction times pass validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 5000, noNaN: true }), (rt) => {
        return isValidReactionTime(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('zero or negative RT fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 0, noNaN: true }), (rt) => {
        return !isValidReactionTime(rt);
      }),
      { numRuns: 50 },
    );
  });

  it('very long RT fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 30000, max: 100000, noNaN: true }), (rt) => {
        return !isValidReactionTime(rt);
      }),
      { numRuns: 50 },
    );
  });

  it('NaN RT fails validation', () => {
    expect(isValidReactionTime(NaN)).toBe(false);
  });

  it('typical human RT range passes validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 150, max: 2000, noNaN: true }), (rt) => {
        return isValidReactionTime(rt);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Probability Validation Tests
// =============================================================================

describe('Probability Validation - Property Tests', () => {
  it('valid probabilities pass validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
        return isValidProbability(p);
      }),
      { numRuns: 100 },
    );
  });

  it('negative probability fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: -0.001, noNaN: true }), (p) => {
        return !isValidProbability(p);
      }),
      { numRuns: 50 },
    );
  });

  it('probability > 1 fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.001, max: 100, noNaN: true }), (p) => {
        return !isValidProbability(p);
      }),
      { numRuns: 50 },
    );
  });

  it('boundary values pass validation', () => {
    expect(isValidProbability(0)).toBe(true);
    expect(isValidProbability(1)).toBe(true);
  });
});

// =============================================================================
// Timestamp Validation Tests
// =============================================================================

describe('Timestamp Validation - Property Tests', () => {
  it('valid timestamps pass validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Date.now() + 1000000 }), (ts) => {
        return isValidTimestamp(ts);
      }),
      { numRuns: 100 },
    );
  });

  it('negative timestamp fails validation', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: -1 }), (ts) => {
        return !isValidTimestamp(ts);
      }),
      { numRuns: 50 },
    );
  });

  it('non-integer timestamp fails validation', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1000000, noNaN: true }), (ts) => {
        // Only fails if not an integer
        return Number.isInteger(ts) || !isValidTimestamp(ts);
      }),
      { numRuns: 50 },
    );
  });

  it('zero timestamp passes validation', () => {
    expect(isValidTimestamp(0)).toBe(true);
  });
});

// =============================================================================
// UUID Validation Tests
// =============================================================================

describe('UUID Validation - Property Tests', () => {
  it('valid UUIDs pass validation', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        return isValidUUID(uuid);
      }),
      { numRuns: 100 },
    );
  });

  it('empty string fails UUID validation', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('random string fails UUID validation', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (str) => {
        // Most random strings should fail (unless they happen to be valid UUIDs)
        const isValid = isValidUUID(str);
        // If it passes, verify it matches the pattern
        if (isValid) {
          return str.length === 36;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('UUID with wrong separator fails', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const wrongSeparator = uuid.replace(/-/g, '_');
        return !isValidUUID(wrongSeparator);
      }),
      { numRuns: 50 },
    );
  });

  it('UUID with extra characters fails', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const extended = `${uuid}x`;
        return !isValidUUID(extended);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Composite Validation Tests
// =============================================================================

describe('Composite Validation - Property Tests', () => {
  it('valid game config passes all validations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 10, max: 50 }),
        fc.double({ min: 0.1, max: 0.5, noNaN: true }),
        fc.double({ min: 0.05, max: 0.25, noNaN: true }),
        (nLevel, trialCount, targetProb, lureProb) => {
          return (
            isValidNLevel(nLevel) &&
            trialCount > 0 &&
            isValidProbability(targetProb) &&
            isValidProbability(lureProb)
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid trial response passes all validations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 49 }),
        fc.double({ min: 100, max: 2000, noNaN: true }),
        fc.integer({ min: 0, max: Date.now() + 1000000 }),
        (trialIndex, rt, timestamp) => {
          return (
            isValidTrialIndex(trialIndex, 50) &&
            isValidReactionTime(rt) &&
            isValidTimestamp(timestamp)
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid session result passes all validations', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -3, max: 4, noNaN: true }),
        fc.integer({ min: 1, max: 9 }),
        (sessionId, score, dPrime, nLevel) => {
          return (
            isValidUUID(sessionId) &&
            isValidScore(score) &&
            isValidDPrime(dPrime) &&
            isValidNLevel(nLevel)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Validation Edge Cases - Property Tests', () => {
  it('handles type coercion gracefully', () => {
    // These should fail validation, not crash
    expect(isValidNLevel('5' as unknown as number)).toBe(false);
    expect(isValidScore('0.5' as unknown as number)).toBe(false);
  });

  it('handles null/undefined gracefully', () => {
    expect(isValidNLevel(null as unknown as number)).toBe(false);
    expect(isValidNLevel(undefined as unknown as number)).toBe(false);
  });

  it('very small positive numbers pass appropriate validations', () => {
    const verySmall = 1e-10;
    expect(isValidScore(verySmall)).toBe(true);
    expect(isValidProbability(verySmall)).toBe(true);
    // Very small but still > 0, so technically valid RT (just unrealistically fast)
    expect(isValidReactionTime(verySmall)).toBe(true);
  });

  it('very large numbers fail appropriate validations', () => {
    const veryLarge = 1e15;
    expect(isValidScore(veryLarge)).toBe(false);
    expect(isValidDPrime(veryLarge)).toBe(false);
    expect(isValidNLevel(veryLarge)).toBe(false);
  });
});
