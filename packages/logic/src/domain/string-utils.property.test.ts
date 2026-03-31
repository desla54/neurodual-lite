/**
 * Property-Based Tests for String Utilities
 *
 * Tests string manipulation invariants.
 */
import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// String Length Invariants
// =============================================================================

describe('String Length - Property Tests', () => {
  it('length is non-negative', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.length >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('empty string has length 0', () => {
    expect(''.length).toBe(0);
  });

  it('concatenation length = sum of lengths', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (s1, s2) => {
        return (s1 + s2).length === s1.length + s2.length;
      }),
      { numRuns: 100 },
    );
  });

  it('substring length <= original length', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (str) => {
        const start = Math.floor(str.length / 2);
        return str.substring(start).length <= str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('repeat(n) length = original length * n', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.integer({ min: 0, max: 10 }), (str, n) => {
        return str.repeat(n).length === str.length * n;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Case Transformation Invariants
// =============================================================================

describe('Case Transformation - Property Tests', () => {
  it('toLowerCase preserves length (for ASCII)', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.toLowerCase().length === str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('toUpperCase preserves length (for ASCII)', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.toUpperCase().length === str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('toLowerCase is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const lower = str.toLowerCase();
        return lower.toLowerCase() === lower;
      }),
      { numRuns: 100 },
    );
  });

  it('toUpperCase is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const upper = str.toUpperCase();
        return upper.toUpperCase() === upper;
      }),
      { numRuns: 100 },
    );
  });

  it('case transformations are inverses for letters', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom('a', 'b', 'c', 'x', 'y', 'z'), { minLength: 0, maxLength: 20 })
          .map((arr) => arr.join('')),
        (str) => {
          return str.toLowerCase() === str.toUpperCase().toLowerCase();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Trim Invariants
// =============================================================================

describe('Trim - Property Tests', () => {
  it('trim length <= original length', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.trim().length <= str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('trim is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const trimmed = str.trim();
        return trimmed.trim() === trimmed;
      }),
      { numRuns: 100 },
    );
  });

  it('trimmed string has no leading/trailing whitespace', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        const trimmed = str.trim();
        if (trimmed.length === 0) return true;
        return trimmed[0] !== ' ' && trimmed[trimmed.length - 1] !== ' ';
      }),
      { numRuns: 100 },
    );
  });

  it('trim preserves content without whitespace', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom('a', 'b', '1', '2'), { minLength: 0, maxLength: 20 })
          .map((arr) => arr.join('')),
        (str) => {
          return str.trim() === str;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Split/Join Invariants
// =============================================================================

describe('Split/Join - Property Tests', () => {
  it('split then join with same separator returns original', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(',', ';', '|'), (str, sep) => {
        return str.split(sep).join(sep) === str;
      }),
      { numRuns: 100 },
    );
  });

  it('split length >= 1', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(',', ';', '|'), (str, sep) => {
        return str.split(sep).length >= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('split with empty separator returns chars', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (str) => {
        const chars = str.split('');
        return chars.length === str.length;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Replace Invariants
// =============================================================================

describe('Replace - Property Tests', () => {
  it('replace with same value returns same string', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), (str, pattern) => {
        return str.replace(pattern, pattern) === str || !str.includes(pattern);
      }),
      { numRuns: 100 },
    );
  });

  it('replaceAll removes all occurrences', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('a', 'b', 'x'), (str, char) => {
        const replaced = str.replaceAll(char, '');
        return !replaced.includes(char);
      }),
      { numRuns: 100 },
    );
  });

  it('replace with empty removes first occurrence', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('a', 'b', 'x'), (str, char) => {
        const replaced = str.replace(char, '');
        const occurrences = (str.match(new RegExp(char, 'g')) ?? []).length;
        const newOccurrences = (replaced.match(new RegExp(char, 'g')) ?? []).length;
        if (occurrences === 0) return replaced === str;
        return newOccurrences === occurrences - 1;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Index/Search Invariants
// =============================================================================

describe('Index/Search - Property Tests', () => {
  it('indexOf returns -1 for missing substring', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom('a', 'b', 'c'), { minLength: 0, maxLength: 20 })
          .map((arr) => arr.join('')),
        (str) => {
          return str.indexOf('z') === -1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('indexOf <= lastIndexOf', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom('a', 'b', 'x'), (str, char) => {
        const first = str.indexOf(char);
        const last = str.lastIndexOf(char);
        if (first === -1) return last === -1;
        return first <= last;
      }),
      { numRuns: 100 },
    );
  });

  it('includes is consistent with indexOf', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1, maxLength: 5 }), (str, sub) => {
        return str.includes(sub) === (str.indexOf(sub) !== -1);
      }),
      { numRuns: 100 },
    );
  });

  it('startsWith is consistent with substring', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (str) => {
        const prefix = str.substring(0, Math.min(3, str.length));
        return str.startsWith(prefix);
      }),
      { numRuns: 100 },
    );
  });

  it('endsWith is consistent with substring', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (str) => {
        const suffix = str.substring(Math.max(0, str.length - 3));
        return str.endsWith(suffix);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Slice Invariants
// =============================================================================

describe('Slice - Property Tests', () => {
  it('slice(0) returns same string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.slice(0) === str;
      }),
      { numRuns: 100 },
    );
  });

  it('slice(0, length) returns same string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.slice(0, str.length) === str;
      }),
      { numRuns: 100 },
    );
  });

  it('slice preserves character order', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 2 }), (str) => {
        const start = Math.floor(str.length / 4);
        const end = Math.floor((3 * str.length) / 4);
        const sliced = str.slice(start, end);
        for (let i = 0; i < sliced.length; i++) {
          if (sliced[i] !== str[start + i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('negative slice counts from end', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3 }), (str) => {
        return str.slice(-1) === str[str.length - 1];
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Pad Invariants
// =============================================================================

describe('Pad - Property Tests', () => {
  it('padStart length >= target length', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.integer({ min: 0, max: 30 }), (str, len) => {
        return str.padStart(len).length >= str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('padEnd length >= target length', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.integer({ min: 0, max: 30 }), (str, len) => {
        return str.padEnd(len).length >= str.length;
      }),
      { numRuns: 100 },
    );
  });

  it('padStart with length <= string length returns same', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5 }), (str) => {
        return str.padStart(3) === str;
      }),
      { numRuns: 100 },
    );
  });

  it('padEnd with length <= string length returns same', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 5 }), (str) => {
        return str.padEnd(3) === str;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Repeat Invariants
// =============================================================================

describe('Repeat - Property Tests', () => {
  it('repeat(0) returns empty string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.repeat(0) === '';
      }),
      { numRuns: 100 },
    );
  });

  it('repeat(1) returns same string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.repeat(1) === str;
      }),
      { numRuns: 100 },
    );
  });

  it('repeat(2) is string + string', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (str) => {
        return str.repeat(2) === str + str;
      }),
      { numRuns: 100 },
    );
  });

  it('repeated string contains original', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (str, n) => {
          return str.repeat(n).includes(str);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Character Access Invariants
// =============================================================================

describe('Character Access - Property Tests', () => {
  it('charAt returns empty for invalid index', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.charAt(str.length + 10) === '';
      }),
      { numRuns: 100 },
    );
  });

  it('charAt(0) equals first character', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (str) => {
        return str.charAt(0) === str[0];
      }),
      { numRuns: 100 },
    );
  });

  it('charCodeAt returns NaN for invalid index', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return Number.isNaN(str.charCodeAt(str.length + 10));
      }),
      { numRuns: 100 },
    );
  });

  it('charCodeAt returns valid code for valid index', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (str) => {
        const code = str.charCodeAt(0);
        return Number.isInteger(code) && code >= 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Comparison Invariants
// =============================================================================

describe('String Comparison - Property Tests', () => {
  it('string equals itself', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str === str;
      }),
      { numRuns: 100 },
    );
  });

  it('localeCompare is reflexive', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return str.localeCompare(str) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('localeCompare is antisymmetric', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (s1, s2) => {
        const cmp1 = s1.localeCompare(s2);
        const cmp2 = s2.localeCompare(s1);
        if (cmp1 === 0) return cmp2 === 0;
        return Math.sign(cmp1) === -Math.sign(cmp2);
      }),
      { numRuns: 100 },
    );
  });
});
