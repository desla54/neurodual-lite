/**
 * Word List Learning — pure game logic extracted from the training page.
 *
 * Rey AVLT / CVLT-inspired verbal memory task:
 * - Study phase: words presented one at a time
 * - Test phase: old + new words, classify each as OLD or NEW
 * - Multi-trial learning: supports multiple study-test cycles
 * - Scoring: signal detection (hits, misses, FA, CR), learning curve,
 *   serial position effects (primacy, recency)
 */

// =============================================================================
// Types
// =============================================================================

export interface WordTrial {
  word: string;
  isOld: boolean;
  testIndex: number;
}

export interface WordTrialResult {
  trial: WordTrial;
  response: 'old' | 'new' | null;
  correct: boolean;
  rt: number;
}

export interface SignalDetection {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** 0-100 — hits / oldTrials */
  hitRate: number;
  /** 0-100 — falseAlarms / newTrials */
  falseAlarmRate: number;
}

export interface SerialPositionAnalysis {
  /** Array of 0|1 for each study position: 1 = correctly recognized */
  curve: number[];
  /** 0-1 — mean accuracy for first `windowSize` items */
  primacyEffect: number;
  /** 0-1 — mean accuracy for last `windowSize` items */
  recencyEffect: number;
}

export interface LearningCurve {
  /** Total correct per trial (array index = trial number) */
  correctPerTrial: number[];
  /** Learning slope: linear regression slope across trials */
  slope: number;
  /** Total correct summed across all trials */
  totalCorrect: number;
}

export interface WordListSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for correct responses */
  avgRT: number;
  wordsRecalled: number;
  totalWords: number;
  signalDetection: SignalDetection;
  serialPosition: SerialPositionAnalysis;
}

// =============================================================================
// Default Word Pool
// =============================================================================

export const DEFAULT_WORD_POOL = [
  'apple',
  'river',
  'chair',
  'storm',
  'piano',
  'garden',
  'bottle',
  'shadow',
  'castle',
  'forest',
  'tiger',
  'cloud',
  'bridge',
  'candle',
  'ocean',
  'marble',
  'silver',
  'window',
  'dragon',
  'harbor',
] as const;

// =============================================================================
// Shuffle
// =============================================================================

/**
 * Fisher-Yates shuffle, returns a new array.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Select study words and distractor words from a pool.
 */
export function selectWords(
  pool: readonly string[],
  studyCount: number,
  distractorCount: number,
  rng: () => number = Math.random,
): { studyWords: string[]; distractorWords: string[] } {
  if (studyCount + distractorCount > pool.length) {
    throw new Error(`Need ${studyCount + distractorCount} words but pool only has ${pool.length}`);
  }
  const shuffled = shuffle(pool, rng);
  return {
    studyWords: shuffled.slice(0, studyCount),
    distractorWords: shuffled.slice(studyCount, studyCount + distractorCount),
  };
}

/**
 * Generate test trials mixing study words (old) and distractors (new).
 * Returns shuffled array with correct testIndex assigned.
 */
export function generateTestTrials(
  studyWords: string[],
  distractorWords: string[],
  rng: () => number = Math.random,
): WordTrial[] {
  const oldTrials: WordTrial[] = studyWords.map((w) => ({
    word: w,
    isOld: true,
    testIndex: 0,
  }));
  const newTrials: WordTrial[] = distractorWords.map((w) => ({
    word: w,
    isOld: false,
    testIndex: 0,
  }));
  const all = shuffle([...oldTrials, ...newTrials], rng);
  return all.map((t, i) => ({ ...t, testIndex: i }));
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Check if a response to a word trial is correct.
 */
export function isResponseCorrect(trial: WordTrial, response: 'old' | 'new'): boolean {
  return (response === 'old' && trial.isOld) || (response === 'new' && !trial.isOld);
}

/**
 * Classify a trial result into signal detection category.
 */
export function classifyResponse(
  trial: WordTrial,
  response: 'old' | 'new' | null,
): 'hit' | 'miss' | 'falseAlarm' | 'correctRejection' | 'noResponse' {
  if (response == null) return 'noResponse';
  if (trial.isOld && response === 'old') return 'hit';
  if (trial.isOld && response === 'new') return 'miss';
  if (!trial.isOld && response === 'old') return 'falseAlarm';
  return 'correctRejection';
}

// =============================================================================
// Signal Detection
// =============================================================================

/**
 * Compute signal detection metrics from trial results.
 */
export function computeSignalDetection(results: WordTrialResult[]): SignalDetection {
  const hits = results.filter((r) => r.trial.isOld && r.response === 'old').length;
  const misses = results.filter((r) => r.trial.isOld && r.response === 'new').length;
  const falseAlarms = results.filter((r) => !r.trial.isOld && r.response === 'old').length;
  const correctRejections = results.filter((r) => !r.trial.isOld && r.response === 'new').length;

  const oldTrials = results.filter((r) => r.trial.isOld).length;
  const newTrials = results.filter((r) => !r.trial.isOld).length;

  const hitRate = oldTrials > 0 ? Math.round((hits / oldTrials) * 100) : 0;
  const falseAlarmRate = newTrials > 0 ? Math.round((falseAlarms / newTrials) * 100) : 0;

  return { hits, misses, falseAlarms, correctRejections, hitRate, falseAlarmRate };
}

// =============================================================================
// Serial Position Analysis
// =============================================================================

/**
 * Compute serial position curve and primacy/recency effects.
 *
 * @param studyWords  The original study list in presentation order
 * @param results     Test results to search through
 * @param windowSize  Number of items for primacy/recency window (default 3)
 */
export function computeSerialPosition(
  studyWords: string[],
  results: WordTrialResult[],
  windowSize = 3,
): SerialPositionAnalysis {
  const curve = studyWords.map((word) => {
    const r = results.find((res) => res.trial.word === word && res.trial.isOld);
    return r?.correct ? 1 : 0;
  });

  const primacySlice = curve.slice(0, windowSize);
  const recencySlice = curve.slice(-windowSize);

  const mean = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    curve,
    primacyEffect: mean(primacySlice),
    recencyEffect: mean(recencySlice),
  };
}

// =============================================================================
// Learning Curve (multi-trial)
// =============================================================================

/**
 * Compute learning curve across multiple study-test trials.
 * Each entry in `trialResults` is the set of results for one trial.
 */
export function computeLearningCurve(trialResults: WordTrialResult[][]): LearningCurve {
  const correctPerTrial = trialResults.map((results) => results.filter((r) => r.correct).length);

  const totalCorrect = correctPerTrial.reduce((a, b) => a + b, 0);

  // Linear regression slope: y = correct count, x = trial index
  const n = correctPerTrial.length;
  if (n <= 1) {
    return { correctPerTrial, slope: 0, totalCorrect };
  }

  const xMean = (n - 1) / 2;
  const yMean = totalCorrect / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = correctPerTrial[i]! - yMean;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  return { correctPerTrial, slope: Math.round(slope * 100) / 100, totalCorrect };
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from single-trial test results.
 */
export function computeSummary(results: WordTrialResult[], studyWords: string[]): WordListSummary {
  if (results.length === 0) {
    return {
      correctTrials: 0,
      totalTrials: 0,
      accuracy: 0,
      avgRT: 0,
      wordsRecalled: 0,
      totalWords: studyWords.length,
      signalDetection: {
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
        hitRate: 0,
        falseAlarmRate: 0,
      },
      serialPosition: {
        curve: studyWords.map(() => 0),
        primacyEffect: 0,
        recencyEffect: 0,
      },
    };
  }

  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = Math.round((correctTrials / results.length) * 100);

  const correctRTs = results.filter((r) => r.correct).map((r) => r.rt);
  const avgRT =
    correctRTs.length > 0
      ? Math.round(correctRTs.reduce((a, b) => a + b, 0) / correctRTs.length)
      : 0;

  const signalDetection = computeSignalDetection(results);
  const serialPosition = computeSerialPosition(studyWords, results);

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    wordsRecalled: signalDetection.hits,
    totalWords: studyWords.length,
    signalDetection,
    serialPosition,
  };
}
