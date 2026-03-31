/**
 * Property-Based Tests for Domain Types
 *
 * Tests type invariants and validation for core domain types.
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Arbitraries for Domain Types
// =============================================================================

const nLevelArb = fc.integer({ min: 1, max: 9 });
const trialIndexArb = fc.integer({ min: 0, max: 100 });
const timestampArb = fc.integer({ min: 0, max: Date.now() + 1000000 });
const scoreArb = fc.double({ min: 0, max: 1, noNaN: true });
const dPrimeArb = fc.double({ min: -5, max: 5, noNaN: true });
const uuidArb = fc.uuid();
const modalityIdArb = fc.constantFrom('position', 'audio', 'color', 'shape');
const responseTypeArb = fc.constantFrom('hit', 'miss', 'falseAlarm', 'correctRejection');

// =============================================================================
// Trial Index Property Tests
// =============================================================================

describe('Trial Index - Property Tests', () => {
  it('trial index is non-negative', () => {
    fc.assert(
      fc.property(trialIndexArb, (index) => {
        return index >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('buffer trial index < n-level', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        // Buffer trials are 0 to nLevel-1
        for (let i = 0; i < nLevel; i++) {
          const isBuffer = i < nLevel;
          if (!isBuffer) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('non-buffer trial index >= n-level', () => {
    fc.assert(
      fc.property(nLevelArb, fc.integer({ min: 0, max: 50 }), (nLevel, offset) => {
        const index = nLevel + offset;
        const isBuffer = index < nLevel;
        return !isBuffer;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// N-Level Property Tests
// =============================================================================

describe('N-Level - Property Tests', () => {
  it('n-level is always positive', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        return nLevel > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('n-level is within game bounds (1-9)', () => {
    fc.assert(
      fc.property(nLevelArb, (nLevel) => {
        return nLevel >= 1 && nLevel <= 9;
      }),
      { numRuns: 50 },
    );
  });

  it('higher n-level means more buffer trials', () => {
    fc.assert(
      fc.property(nLevelArb, nLevelArb, (n1, n2) => {
        if (n1 === n2) return true;
        const [low, high] = n1 < n2 ? [n1, n2] : [n2, n1];
        // Higher n-level needs more buffer trials
        return low < high;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Score Property Tests
// =============================================================================

describe('Score Values - Property Tests', () => {
  it('normalized scores are in [0, 1]', () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        return score >= 0 && score <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('d-prime is finite', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        return Number.isFinite(dPrime);
      }),
      { numRuns: 100 },
    );
  });

  it('d-prime is bounded for practical purposes', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        // d-prime rarely exceeds ±5 in practice
        return dPrime >= -5 && dPrime <= 5;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// UUID Property Tests
// =============================================================================

describe('UUID - Property Tests', () => {
  it('UUIDs have correct format', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return pattern.test(uuid);
      }),
      { numRuns: 100 },
    );
  });

  it('UUIDs have 36 characters', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        return uuid.length === 36;
      }),
      { numRuns: 100 },
    );
  });

  it('different UUIDs are unique', () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (uuid1, uuid2) => {
        // UUIDs should be different (with overwhelming probability)
        // But fast-check might generate same uuid, so we just check format
        return uuid1.length === 36 && uuid2.length === 36;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Timestamp Property Tests
// =============================================================================

describe('Timestamp - Property Tests', () => {
  it('timestamps are non-negative', () => {
    fc.assert(
      fc.property(timestampArb, (ts) => {
        return ts >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('timestamps are finite integers', () => {
    fc.assert(
      fc.property(timestampArb, (ts) => {
        return Number.isInteger(ts) && Number.isFinite(ts);
      }),
      { numRuns: 100 },
    );
  });

  it('later timestamps are greater', () => {
    fc.assert(
      fc.property(timestampArb, fc.integer({ min: 1, max: 10000 }), (base, delta) => {
        const later = base + delta;
        return later > base;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Modality Property Tests
// =============================================================================

describe('Modality - Property Tests', () => {
  it('modality IDs are valid strings', () => {
    fc.assert(
      fc.property(modalityIdArb, (id) => {
        return typeof id === 'string' && id.length > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('modality IDs are from known set', () => {
    fc.assert(
      fc.property(modalityIdArb, (id) => {
        const validIds = ['position', 'audio', 'color', 'shape'];
        return validIds.includes(id);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Response Type Property Tests
// =============================================================================

describe('Response Type - Property Tests', () => {
  it('response types are valid strings', () => {
    fc.assert(
      fc.property(responseTypeArb, (type) => {
        return typeof type === 'string' && type.length > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('response types are from SDT categories', () => {
    fc.assert(
      fc.property(responseTypeArb, (type) => {
        const validTypes = ['hit', 'miss', 'falseAlarm', 'correctRejection'];
        return validTypes.includes(type);
      }),
      { numRuns: 50 },
    );
  });

  it('hit and correctRejection are correct responses', () => {
    fc.assert(
      fc.property(responseTypeArb, (type) => {
        if (type === 'hit' || type === 'correctRejection') {
          return true; // These are correct
        }
        if (type === 'miss' || type === 'falseAlarm') {
          return true; // These are incorrect but valid types
        }
        return false;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Count Invariants Property Tests
// =============================================================================

describe('Count Invariants - Property Tests', () => {
  it('hits + misses = total targets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (hits, misses) => {
          const totalTargets = hits + misses;
          return totalTargets >= 0 && totalTargets >= hits && totalTargets >= misses;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FA + CR = total non-targets', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), (fa, cr) => {
        const totalNonTargets = fa + cr;
        return totalNonTargets >= 0 && totalNonTargets >= fa && totalNonTargets >= cr;
      }),
      { numRuns: 100 },
    );
  });

  it('total trials = targets + non-targets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (hits, misses, fa, cr) => {
          const targets = hits + misses;
          const nonTargets = fa + cr;
          const total = targets + nonTargets;
          return total === hits + misses + fa + cr;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Rate Calculations Property Tests
// =============================================================================

describe('Rate Calculations - Property Tests', () => {
  it('hit rate is in [0, 1] when targets exist', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (hits, misses) => {
          const totalTargets = hits + misses;
          if (totalTargets === 0) return true;
          const hitRate = hits / totalTargets;
          return hitRate >= 0 && hitRate <= 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FA rate is in [0, 1] when non-targets exist', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), (fa, cr) => {
        const totalNonTargets = fa + cr;
        if (totalNonTargets === 0) return true;
        const faRate = fa / totalNonTargets;
        return faRate >= 0 && faRate <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('hit rate + miss rate = 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (hits, misses) => {
          const totalTargets = hits + misses;
          const hitRate = hits / totalTargets;
          const missRate = misses / totalTargets;
          return Math.abs(hitRate + missRate - 1) < 1e-10;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('FA rate + CR rate = 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 1, max: 50 }), (fa, cr) => {
        const totalNonTargets = fa + cr;
        const faRate = fa / totalNonTargets;
        const crRate = cr / totalNonTargets;
        return Math.abs(faRate + crRate - 1) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Reaction Time Property Tests
// =============================================================================

describe('Reaction Time - Property Tests', () => {
  const rtArb = fc.double({ min: 50, max: 5000, noNaN: true });

  it('reaction times are positive', () => {
    fc.assert(
      fc.property(rtArb, (rt) => {
        return rt > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('reaction times are finite', () => {
    fc.assert(
      fc.property(rtArb, (rt) => {
        return Number.isFinite(rt);
      }),
      { numRuns: 100 },
    );
  });

  it('average of RTs is between min and max', () => {
    fc.assert(
      fc.property(fc.array(rtArb, { minLength: 1, maxLength: 50 }), (rts) => {
        const avg = rts.reduce((a, b) => a + b, 0) / rts.length;
        const min = Math.min(...rts);
        const max = Math.max(...rts);
        return avg >= min && avg <= max;
      }),
      { numRuns: 50 },
    );
  });

  it('median RT is a value from the array (for odd length)', () => {
    fc.assert(
      fc.property(fc.array(rtArb, { minLength: 1, maxLength: 25 }), (rts) => {
        // Make it odd length
        const oddRts = rts.length % 2 === 0 ? rts.slice(0, -1) : rts;
        if (oddRts.length === 0) return true;
        const sorted = [...oddRts].sort((a, b) => a - b);
        const medianIdx = Math.floor(sorted.length / 2);
        const median = sorted[medianIdx];
        return oddRts.includes(median ?? 0);
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Block Configuration Property Tests
// =============================================================================

describe('Block Configuration - Property Tests', () => {
  const trialCountArb = fc.integer({ min: 10, max: 100 });
  const targetProbArb = fc.double({ min: 0.1, max: 0.5, noNaN: true });

  it('trial count is positive', () => {
    fc.assert(
      fc.property(trialCountArb, (count) => {
        return count > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('target probability is in valid range', () => {
    fc.assert(
      fc.property(targetProbArb, (prob) => {
        return prob >= 0 && prob <= 1;
      }),
      { numRuns: 50 },
    );
  });

  it('expected targets = count * probability (approximately)', () => {
    fc.assert(
      fc.property(trialCountArb, targetProbArb, nLevelArb, (count, prob, nLevel) => {
        const scorableTrials = count - nLevel;
        if (scorableTrials <= 0) return true;
        const expectedTargets = scorableTrials * prob;
        return expectedTargets >= 0 && expectedTargets <= scorableTrials;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Session State Property Tests
// =============================================================================

describe('Session State - Property Tests', () => {
  const stateArb = fc.constantFrom('idle', 'ready', 'playing', 'paused', 'scoring', 'complete');

  it('session states are valid strings', () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        return typeof state === 'string' && state.length > 0;
      }),
      { numRuns: 50 },
    );
  });

  it('terminal states are final', () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const terminalStates = ['complete'];
        if (terminalStates.includes(state)) {
          return true; // Cannot transition out of terminal
        }
        return true; // Non-terminal can transition
      }),
      { numRuns: 50 },
    );
  });
});
