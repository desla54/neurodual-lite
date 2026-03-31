import { describe, it, expect } from 'bun:test';
import {
  type WordTrial,
  type WordTrialResult,
  shuffle,
  selectWords,
  generateTestTrials,
  isResponseCorrect,
  classifyResponse,
  computeSignalDetection,
  computeSerialPosition,
  computeLearningCurve,
  computeSummary,
  DEFAULT_WORD_POOL,
} from './word-list';

// =============================================================================
// Helpers
// =============================================================================

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function makeWordTrial(word: string, isOld: boolean, testIndex = 0): WordTrial {
  return { word, isOld, testIndex };
}

function makeResult(trial: WordTrial, response: 'old' | 'new' | null, rt: number): WordTrialResult {
  const correct = response != null && isResponseCorrect(trial, response);
  return { trial, response, correct, rt };
}

// =============================================================================
// 1. Shuffle
// =============================================================================

describe('Word List — Shuffle', () => {
  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the original', () => {
    const arr = [1, 2, 3, 4, 5] as const;
    const copy = [...arr];
    shuffle(arr);
    expect([...arr]).toEqual(copy);
  });

  it('uses provided RNG for reproducibility', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(42));
    expect(a).toEqual(b);
  });

  it('produces shuffled order (not always identity)', () => {
    let foundShuffled = false;
    for (let i = 0; i < 10; i++) {
      const result = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      if (JSON.stringify(result) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) {
        foundShuffled = true;
        break;
      }
    }
    expect(foundShuffled).toBe(true);
  });
});

// =============================================================================
// 2. Word selection
// =============================================================================

describe('Word List — Word selection', () => {
  it('selects correct number of study and distractor words', () => {
    const { studyWords, distractorWords } = selectWords(DEFAULT_WORD_POOL, 10, 10);
    expect(studyWords).toHaveLength(10);
    expect(distractorWords).toHaveLength(10);
  });

  it('study and distractor words do not overlap', () => {
    const { studyWords, distractorWords } = selectWords(DEFAULT_WORD_POOL, 10, 10);
    const overlap = studyWords.filter((w) => distractorWords.includes(w));
    expect(overlap).toHaveLength(0);
  });

  it('throws when pool is too small', () => {
    expect(() => selectWords(['a', 'b'], 5, 5)).toThrow();
  });

  it('all selected words come from the pool', () => {
    const { studyWords, distractorWords } = selectWords(DEFAULT_WORD_POOL, 10, 10);
    for (const w of [...studyWords, ...distractorWords]) {
      expect(DEFAULT_WORD_POOL).toContain(w as any);
    }
  });
});

// =============================================================================
// 3. Test trial generation
// =============================================================================

describe('Word List — Test trial generation', () => {
  it('generates correct total number of trials', () => {
    const study = ['apple', 'river', 'chair'];
    const distractors = ['tiger', 'cloud', 'bridge'];
    const trials = generateTestTrials(study, distractors);
    expect(trials).toHaveLength(6);
  });

  it('marks study words as old and distractors as new', () => {
    const study = ['apple', 'river'];
    const distractors = ['tiger', 'cloud'];
    const trials = generateTestTrials(study, distractors, seededRng(42));

    const oldTrials = trials.filter((t) => t.isOld);
    const newTrials = trials.filter((t) => !t.isOld);
    expect(oldTrials).toHaveLength(2);
    expect(newTrials).toHaveLength(2);
    expect(oldTrials.map((t) => t.word).sort()).toEqual(['apple', 'river']);
    expect(newTrials.map((t) => t.word).sort()).toEqual(['cloud', 'tiger']);
  });

  it('assigns sequential testIndex values', () => {
    const study = ['apple', 'river'];
    const distractors = ['tiger', 'cloud'];
    const trials = generateTestTrials(study, distractors);
    const indices = trials.map((t) => t.testIndex);
    expect(indices).toEqual([0, 1, 2, 3]);
  });
});

// =============================================================================
// 4. Response validation
// =============================================================================

describe('Word List — Response validation', () => {
  it('"old" response for old word = correct', () => {
    expect(isResponseCorrect(makeWordTrial('apple', true), 'old')).toBe(true);
  });

  it('"new" response for old word = incorrect', () => {
    expect(isResponseCorrect(makeWordTrial('apple', true), 'new')).toBe(false);
  });

  it('"new" response for new word = correct', () => {
    expect(isResponseCorrect(makeWordTrial('tiger', false), 'new')).toBe(true);
  });

  it('"old" response for new word = incorrect', () => {
    expect(isResponseCorrect(makeWordTrial('tiger', false), 'old')).toBe(false);
  });
});

// =============================================================================
// 5. Response classification
// =============================================================================

describe('Word List — Response classification', () => {
  it('old word + old response = hit', () => {
    expect(classifyResponse(makeWordTrial('a', true), 'old')).toBe('hit');
  });

  it('old word + new response = miss', () => {
    expect(classifyResponse(makeWordTrial('a', true), 'new')).toBe('miss');
  });

  it('new word + old response = falseAlarm', () => {
    expect(classifyResponse(makeWordTrial('a', false), 'old')).toBe('falseAlarm');
  });

  it('new word + new response = correctRejection', () => {
    expect(classifyResponse(makeWordTrial('a', false), 'new')).toBe('correctRejection');
  });

  it('null response = noResponse', () => {
    expect(classifyResponse(makeWordTrial('a', true), null)).toBe('noResponse');
  });
});

// =============================================================================
// 6. Signal detection
// =============================================================================

describe('Word List — Signal detection', () => {
  it('computes hits, misses, FA, CR correctly', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500), // hit
      makeResult(makeWordTrial('river', true), 'new', 600), // miss
      makeResult(makeWordTrial('tiger', false), 'old', 700), // FA
      makeResult(makeWordTrial('cloud', false), 'new', 800), // CR
    ];
    const sd = computeSignalDetection(results);
    expect(sd.hits).toBe(1);
    expect(sd.misses).toBe(1);
    expect(sd.falseAlarms).toBe(1);
    expect(sd.correctRejections).toBe(1);
    expect(sd.hitRate).toBe(50); // 1/2
    expect(sd.falseAlarmRate).toBe(50); // 1/2
  });

  it('100% hit rate when all old words recognized', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500),
      makeResult(makeWordTrial('river', true), 'old', 600),
    ];
    const sd = computeSignalDetection(results);
    expect(sd.hitRate).toBe(100);
    expect(sd.hits).toBe(2);
    expect(sd.misses).toBe(0);
  });

  it('0% false alarm rate when no new words falsely recognized', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('tiger', false), 'new', 500),
      makeResult(makeWordTrial('cloud', false), 'new', 600),
    ];
    const sd = computeSignalDetection(results);
    expect(sd.falseAlarmRate).toBe(0);
    expect(sd.correctRejections).toBe(2);
  });
});

// =============================================================================
// 7. Serial position analysis
// =============================================================================

describe('Word List — Serial position', () => {
  it('computes curve from study word order', () => {
    const studyWords = ['a', 'b', 'c', 'd', 'e'];
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'old', 500), // correct
      makeResult(makeWordTrial('b', true), 'new', 600), // miss
      makeResult(makeWordTrial('c', true), 'old', 700), // correct
      makeResult(makeWordTrial('d', true), 'old', 800), // correct
      makeResult(makeWordTrial('e', true), 'old', 900), // correct
    ];
    const sp = computeSerialPosition(studyWords, results);
    expect(sp.curve).toEqual([1, 0, 1, 1, 1]);
  });

  it('computes primacy effect from first N items', () => {
    const studyWords = ['a', 'b', 'c', 'd', 'e'];
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'old', 500), // correct
      makeResult(makeWordTrial('b', true), 'old', 500), // correct
      makeResult(makeWordTrial('c', true), 'old', 500), // correct
      makeResult(makeWordTrial('d', true), 'new', 500), // miss
      makeResult(makeWordTrial('e', true), 'new', 500), // miss
    ];
    const sp = computeSerialPosition(studyWords, results, 3);
    expect(sp.primacyEffect).toBe(1); // all 3 first correct
    expect(sp.recencyEffect).toBeCloseTo(1 / 3); // 1 of last 3
  });

  it('computes recency effect from last N items', () => {
    const studyWords = ['a', 'b', 'c', 'd', 'e'];
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'new', 500), // miss
      makeResult(makeWordTrial('b', true), 'new', 500), // miss
      makeResult(makeWordTrial('c', true), 'old', 500), // correct
      makeResult(makeWordTrial('d', true), 'old', 500), // correct
      makeResult(makeWordTrial('e', true), 'old', 500), // correct
    ];
    const sp = computeSerialPosition(studyWords, results, 3);
    expect(sp.recencyEffect).toBe(1); // all 3 last correct
    expect(sp.primacyEffect).toBeCloseTo(1 / 3); // 1 of first 3
  });

  it('handles missing words in results', () => {
    const studyWords = ['a', 'b', 'c'];
    // Only 'a' appears in results
    const results: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const sp = computeSerialPosition(studyWords, results, 2);
    expect(sp.curve).toEqual([1, 0, 0]);
  });
});

// =============================================================================
// 8. Learning curve (multi-trial)
// =============================================================================

describe('Word List — Learning curve', () => {
  it('computes correct per trial', () => {
    const trial1: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'old', 500), // correct
      makeResult(makeWordTrial('b', true), 'new', 500), // wrong
    ];
    const trial2: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'old', 500), // correct
      makeResult(makeWordTrial('b', true), 'old', 500), // correct
    ];
    const lc = computeLearningCurve([trial1, trial2]);
    expect(lc.correctPerTrial).toEqual([1, 2]);
    expect(lc.totalCorrect).toBe(3);
  });

  it('positive slope indicates learning', () => {
    const trial1: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'new', 500)];
    const trial2: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const trial3: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const lc = computeLearningCurve([trial1, trial2, trial3]);
    expect(lc.slope).toBeGreaterThan(0);
  });

  it('zero slope for flat performance', () => {
    const trial1: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const trial2: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const lc = computeLearningCurve([trial1, trial2]);
    expect(lc.slope).toBe(0);
  });

  it('negative slope for declining performance', () => {
    const trial1: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'old', 500),
      makeResult(makeWordTrial('b', true), 'old', 500),
    ];
    const trial2: WordTrialResult[] = [
      makeResult(makeWordTrial('a', true), 'new', 500),
      makeResult(makeWordTrial('b', true), 'new', 500),
    ];
    const lc = computeLearningCurve([trial1, trial2]);
    expect(lc.slope).toBeLessThan(0);
  });

  it('handles single trial (slope = 0)', () => {
    const trial1: WordTrialResult[] = [makeResult(makeWordTrial('a', true), 'old', 500)];
    const lc = computeLearningCurve([trial1]);
    expect(lc.slope).toBe(0);
    expect(lc.totalCorrect).toBe(1);
  });
});

// =============================================================================
// 9. Summary computation
// =============================================================================

describe('Word List — Summary', () => {
  const studyWords = ['apple', 'river', 'chair'];
  const distractorWords = ['tiger', 'cloud'];

  it('handles empty results', () => {
    const summary = computeSummary([], studyWords);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.wordsRecalled).toBe(0);
    expect(summary.totalWords).toBe(3);
  });

  it('computes accuracy correctly', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500), // correct
      makeResult(makeWordTrial('river', true), 'new', 600), // wrong
      makeResult(makeWordTrial('chair', true), 'old', 700), // correct
      makeResult(makeWordTrial('tiger', false), 'new', 800), // correct
      makeResult(makeWordTrial('cloud', false), 'old', 900), // wrong
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(5);
    expect(summary.accuracy).toBe(60);
  });

  it('computes avgRT from correct trials only', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 400), // correct
      makeResult(makeWordTrial('river', true), 'new', 9999), // wrong — excluded
      makeResult(makeWordTrial('tiger', false), 'new', 600), // correct
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.avgRT).toBe(500); // (400 + 600) / 2
  });

  it('wordsRecalled equals signal detection hits', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500),
      makeResult(makeWordTrial('river', true), 'old', 500),
      makeResult(makeWordTrial('chair', true), 'new', 500),
      makeResult(makeWordTrial('tiger', false), 'new', 500),
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.wordsRecalled).toBe(2);
    expect(summary.signalDetection.hits).toBe(2);
  });

  it('includes serial position analysis', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500),
      makeResult(makeWordTrial('river', true), 'new', 500),
      makeResult(makeWordTrial('chair', true), 'old', 500),
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.serialPosition.curve).toEqual([1, 0, 1]);
  });

  it('100% accuracy when all correct', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'old', 500),
      makeResult(makeWordTrial('tiger', false), 'new', 500),
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.accuracy).toBe(100);
  });

  it('0% accuracy when all wrong', () => {
    const results: WordTrialResult[] = [
      makeResult(makeWordTrial('apple', true), 'new', 500),
      makeResult(makeWordTrial('tiger', false), 'old', 500),
    ];
    const summary = computeSummary(results, studyWords);
    expect(summary.accuracy).toBe(0);
  });
});
