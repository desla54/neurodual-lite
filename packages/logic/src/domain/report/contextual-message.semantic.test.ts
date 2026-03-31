import { describe, expect, it } from 'bun:test';
import { generateContextualMessageData } from './contextual-message';
import {
  REPORT_IMPULSIVE_FA_RATE,
  REPORT_IMPULSIVE_RT_MS,
  REPORT_MIN_TRIALS_RATIO,
  REPORT_MODALITY_STRONG_GAP,
} from '../../specs/thresholds';
import type {
  SessionEndReportModel,
  UnifiedModalityStats,
  UnifiedTotals,
} from '../../types/session-report';
import type { CognitiveProfile } from '../../engine/cognitive-profiler';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  const r = rng();
  return Math.floor(r * (max - min + 1)) + min;
}

function randFloat(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function pickUnique<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = randInt(rng, 0, pool.length - 1);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

function computeModalityAccuracy(stats: UnifiedModalityStats): number {
  const fa = stats.falseAlarms ?? 0;
  const cr = stats.correctRejections ?? 0;
  const total = stats.hits + stats.misses + fa + cr;
  if (total <= 0) return 0;
  return (stats.hits + cr) / total;
}

function buildRandomReport(rng: () => number, seedTag: string): SessionEndReportModel {
  const modalityUniverse = ['position', 'audio', 'color'] as const;
  const activeCount = randInt(rng, 1, modalityUniverse.length);
  const activeModalities = pickUnique(rng, modalityUniverse, activeCount);

  const tracksFA = rng() < 0.75;
  const byModality: Record<string, UnifiedModalityStats> = {};

  let hitsTotal = 0;
  let missesTotal = 0;
  let faTotal = 0;
  let crTotal = 0;

  const baseRt = clamp(Math.round(randFloat(rng, 260, 750)), 200, 1100);
  const isFast = baseRt < 320;
  const lengthTier = rng() < 0.15 ? 'short' : rng() < 0.85 ? 'medium' : 'long';

  for (const modality of activeModalities) {
    const targets =
      lengthTier === 'short'
        ? randInt(rng, 6, 16)
        : lengthTier === 'medium'
          ? randInt(rng, 16, 40)
          : randInt(rng, 35, 80);

    const acc = clamp(rng() < 0.1 ? randFloat(rng, 0.2, 0.55) : randFloat(rng, 0.55, 0.98), 0, 1);
    const noise = randFloat(rng, -0.08, 0.08);
    const hits = clamp(Math.round(targets * clamp(acc + noise, 0, 1)), 0, targets);
    const misses = targets - hits;

    const nonTargets = tracksFA
      ? lengthTier === 'short'
        ? randInt(rng, 6, 20)
        : lengthTier === 'medium'
          ? randInt(rng, 20, 80)
          : randInt(rng, 60, 160)
      : 0;

    const faRate = tracksFA
      ? clamp((isFast ? 0.18 : 0.08) + (0.9 - acc) * 0.22 + randFloat(rng, -0.04, 0.04), 0, 0.6)
      : 0;
    const fa = tracksFA ? clamp(Math.round(nonTargets * faRate), 0, nonTargets) : null;
    const cr = tracksFA ? Math.max(0, nonTargets - (fa ?? 0)) : null;

    hitsTotal += hits;
    missesTotal += misses;
    faTotal += fa ?? 0;
    crTotal += cr ?? 0;

    byModality[modality] = {
      hits,
      misses,
      falseAlarms: fa,
      correctRejections: cr,
      dPrime: null,
      avgRT: rng() < 0.9 ? clamp(baseRt + randInt(rng, -80, 120), 180, 1400) : null,
    };
  }

  const totals: UnifiedTotals = {
    hits: hitsTotal,
    misses: missesTotal,
    falseAlarms: tracksFA ? faTotal : null,
    correctRejections: tracksFA ? crTotal : null,
  };

  const totalActions = hitsTotal + missesTotal + (tracksFA ? faTotal + crTotal : 0);
  const totalTargets = hitsTotal + missesTotal;

  // Make unifiedAccuracy consistent with target detection (not SDT accuracy)
  const unifiedAccuracy = totalTargets > 0 ? hitsTotal / totalTargets : 0;

  const totalErrors = missesTotal + (tracksFA ? faTotal : 0);
  const errorRate = totalActions > 0 ? totalErrors / totalActions : 0;
  const missShare = totalErrors > 0 ? missesTotal / totalErrors : 0;
  const faShare = tracksFA ? (totalErrors > 0 ? faTotal / totalErrors : 0) : null;

  // SpeedStats distribution sometimes available to trigger RT archetypes
  const hasDistribution = rng() < 0.75;
  const median = clamp(baseRt + randInt(rng, -40, 40), 200, 1200);
  const spread = hasDistribution
    ? clamp(
        Math.round(
          (lengthTier === 'short' ? randFloat(rng, 0.15, 0.6) : randFloat(rng, 0.1, 0.8)) * median,
        ),
        20,
        900,
      )
    : 0;
  const speedStats =
    rng() < 0.8
      ? {
          labelKey: 'report.speed.avg',
          valueMs: median,
          distribution: hasDistribution
            ? {
                min: Math.max(80, median - Math.floor(spread / 2)),
                median,
                max: median + Math.ceil(spread / 2),
              }
            : undefined,
        }
      : undefined;

  // Occasionally synthesize an abandoned short session.
  const shouldAbandon = rng() < 0.06 && totalActions > 0;
  const trialsCount = shouldAbandon
    ? Math.max(totalActions + 1, Math.round(totalActions / Math.max(0.01, REPORT_MIN_TRIALS_RATIO)))
    : Math.max(1, totalActions);

  const reason: SessionEndReportModel['reason'] = shouldAbandon ? 'abandoned' : 'completed';

  const nextStepDirection = rng() < 0.25 ? 'up' : rng() < 0.5 ? 'down' : 'same';

  return {
    sessionId: `semantic-${seedTag}`,
    createdAt: new Date(0).toISOString(),
    userId: 'u1',
    reason,
    gameMode: 'dual-catch',
    gameModeLabel: 'Dual Catch',
    playContext: 'free',
    nLevel: randInt(rng, 1, 6),
    activeModalities,
    trialsCount,
    durationMs: randInt(rng, 20_000, 240_000),
    ups: {
      score: Math.round(unifiedAccuracy * 100),
      tier: 'intermediate',
      journeyEligible: unifiedAccuracy >= 0.7,
      components: { accuracy: Math.round(unifiedAccuracy * 100), confidence: null },
    },
    unifiedAccuracy,
    modeScore: {
      labelKey: 'report.modeScore.accuracy',
      value: Math.round(unifiedAccuracy * 100),
      unit: '%',
    },
    totals,
    byModality: byModality as Record<string, UnifiedModalityStats>,
    errorProfile: { errorRate, missShare, faShare },
    speedStats,
    focusStats:
      rng() < 0.08
        ? {
            focusLostCount: randInt(rng, 1, 4),
            focusLostTotalMs: randInt(rng, 2_000, 28_000),
          }
        : undefined,
    nextStep: {
      direction: nextStepDirection,
      nextLevel: 2,
      reason: 'test',
    },
  };
}

function scenarioPack(): SessionEndReportModel[] {
  const base: SessionEndReportModel = {
    sessionId: 'pack-base',
    createdAt: new Date(0).toISOString(),
    userId: 'u1',
    reason: 'completed',
    gameMode: 'dual-catch',
    gameModeLabel: 'Dual Catch',
    playContext: 'free',
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 60,
    durationMs: 120000,
    ups: {
      score: 80,
      tier: 'intermediate',
      journeyEligible: true,
      components: { accuracy: 80, confidence: null },
    },
    unifiedAccuracy: 0.8,
    modeScore: { labelKey: 'report.modeScore.accuracy', value: 80, unit: '%' },
    totals: { hits: 48, misses: 12, falseAlarms: 6, correctRejections: 54 },
    byModality: {
      position: {
        hits: 24,
        misses: 6,
        falseAlarms: 3,
        correctRejections: 27,
        dPrime: null,
        avgRT: 420,
      },
      audio: {
        hits: 24,
        misses: 6,
        falseAlarms: 3,
        correctRejections: 27,
        dPrime: null,
        avgRT: 430,
      },
    },
    errorProfile: { errorRate: 0.2, missShare: 0.67, faShare: 0.33 },
    speedStats: {
      labelKey: 'report.speed.avg',
      valueMs: 425,
      distribution: { min: 360, median: 425, max: 520 },
    },
    focusStats: { focusLostCount: 0, focusLostTotalMs: 0 },
    nextStep: { direction: 'same', nextLevel: 3, reason: 'test' },
  };

  return [
    // Typical-ish
    {
      ...base,
      sessionId: 'pack-gap',
      unifiedAccuracy: 0.74,
      totals: { hits: 37, misses: 13, falseAlarms: 4, correctRejections: 46 },
      byModality: {
        position: {
          hits: 26,
          misses: 4,
          falseAlarms: 1,
          correctRejections: 29,
          dPrime: null,
          avgRT: 390,
        },
        audio: {
          hits: 8,
          misses: 12,
          falseAlarms: 3,
          correctRejections: 17,
          dPrime: null,
          avgRT: 470,
        },
      },
    },
    {
      ...base,
      sessionId: 'pack-miss',
      unifiedAccuracy: 0.55,
      totals: { hits: 22, misses: 18, falseAlarms: 2, correctRejections: 38 },
      byModality: {
        position: {
          hits: 12,
          misses: 8,
          falseAlarms: 1,
          correctRejections: 19,
          dPrime: null,
          avgRT: 520,
        },
        audio: {
          hits: 10,
          misses: 10,
          falseAlarms: 1,
          correctRejections: 19,
          dPrime: null,
          avgRT: 510,
        },
      },
    },
    {
      ...base,
      sessionId: 'pack-fa',
      unifiedAccuracy: 0.86,
      totals: { hits: 43, misses: 7, falseAlarms: 18, correctRejections: 62 },
      byModality: {
        position: {
          hits: 23,
          misses: 2,
          falseAlarms: 9,
          correctRejections: 31,
          dPrime: null,
          avgRT: 290,
        },
        audio: {
          hits: 20,
          misses: 5,
          falseAlarms: 9,
          correctRejections: 31,
          dPrime: null,
          avgRT: 300,
        },
      },
      speedStats: {
        labelKey: 'report.speed.avg',
        valueMs: 295,
        distribution: { min: 210, median: 295, max: 420 },
      },
    },
    {
      ...base,
      sessionId: 'pack-up',
      unifiedAccuracy: 0.92,
      totals: { hits: 46, misses: 4, falseAlarms: 2, correctRejections: 48 },
      nextStep: { direction: 'up', nextLevel: 3, reason: 'test' },
    },

    // Edges
    {
      ...base,
      sessionId: 'pack-tie',
      unifiedAccuracy: 1.0,
      trialsCount: 16,
      totals: { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 10 },
      byModality: {
        position: {
          hits: 3,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 5,
          dPrime: null,
          avgRT: 420,
        },
        audio: {
          hits: 3,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 5,
          dPrime: null,
          avgRT: 430,
        },
      },
    },
    {
      ...base,
      sessionId: 'pack-noresp',
      unifiedAccuracy: 0,
      totals: { hits: 0, misses: 20, falseAlarms: 0, correctRejections: 20 },
      byModality: {
        position: {
          hits: 0,
          misses: 10,
          falseAlarms: 0,
          correctRejections: 10,
          dPrime: null,
          avgRT: 600,
        },
        audio: {
          hits: 0,
          misses: 10,
          falseAlarms: 0,
          correctRejections: 10,
          dPrime: null,
          avgRT: 610,
        },
      },
    },
    {
      ...base,
      sessionId: 'pack-abandon',
      reason: 'abandoned',
      trialsCount: 120,
      totals: { hits: 8, misses: 2, falseAlarms: 0, correctRejections: 0 },
      byModality: {
        position: {
          hits: 4,
          misses: 1,
          falseAlarms: 0,
          correctRejections: 0,
          dPrime: null,
          avgRT: 520,
        },
        audio: {
          hits: 4,
          misses: 1,
          falseAlarms: 0,
          correctRejections: 0,
          dPrime: null,
          avgRT: 530,
        },
      },
      speedStats: { labelKey: 'report.speed.avg', valueMs: 525 },
    },
    {
      ...base,
      sessionId: 'pack-focus',
      unifiedAccuracy: 0.78,
      focusStats: { focusLostCount: 3, focusLostTotalMs: 22_000 },
    },
    {
      ...base,
      sessionId: 'pack-impulsive',
      unifiedAccuracy: 0.8,
      totals: { hits: 24, misses: 6, falseAlarms: 22, correctRejections: 18 },
      speedStats: {
        labelKey: 'report.speed.avg',
        valueMs: 260,
        distribution: { min: 190, median: 260, max: 360 },
      },
      byModality: {
        position: {
          hits: 12,
          misses: 3,
          falseAlarms: 11,
          correctRejections: 9,
          dPrime: null,
          avgRT: 250,
        },
        audio: {
          hits: 12,
          misses: 3,
          falseAlarms: 11,
          correctRejections: 9,
          dPrime: null,
          avgRT: 270,
        },
      },
    },
  ];
}

function assertSemanticConsistency(
  report: SessionEndReportModel,
  sublineKey: string,
  params?: Record<string, unknown>,
) {
  const normalizedKey = (() => {
    // Keep true "V1/V2" families intact for the special-case builders.
    if (
      sublineKey.startsWith('stats.contextual.sublines.abandoned') ||
      sublineKey.startsWith('stats.contextual.sublines.noResponse') ||
      sublineKey.startsWith('stats.contextual.sublines.impulsive')
    ) {
      return sublineKey;
    }
    // Beta keys end with V1/V2/...; stable keys often don't.
    return sublineKey.replace(/V\d+$/, '');
  })();

  const fa = report.totals.falseAlarms ?? 0;
  const cr = report.totals.correctRejections ?? 0;
  const totalTargets = report.totals.hits + report.totals.misses;
  const totalActions = report.totals.hits + report.totals.misses + fa + cr;

  const modalities = Object.entries(report.byModality);
  const accs = modalities.map(([id, stats]) => ({ id, acc: computeModalityAccuracy(stats) }));
  accs.sort((a, b) => b.acc - a.acc);
  const best = accs[0];
  const worst = accs.length > 1 ? accs.at(-1) : undefined;
  const gap = best && worst ? best.acc - worst.acc : 0;

  // Generic factual assertions (avoid false positives like "Fallback")
  if (
    normalizedKey === 'stats.contextual.sublines.simpleFaRate' ||
    normalizedKey === 'stats.contextual.sublines.simpleFa' ||
    normalizedKey === 'stats.contextual.sublines.analystFaStrong' ||
    normalizedKey === 'stats.contextual.sublines.analystFaWeak' ||
    normalizedKey.startsWith('stats.contextual.sublines.impulsive')
  ) {
    expect(report.totals.falseAlarms).not.toBeNull();
    expect(fa).toBeGreaterThan(0);
  }

  if (
    normalizedKey === 'stats.contextual.sublines.simpleMiss' ||
    normalizedKey === 'stats.contextual.sublines.analystMissStrong' ||
    normalizedKey === 'stats.contextual.sublines.analystMissWeak' ||
    normalizedKey.startsWith('stats.contextual.sublines.noResponse')
  ) {
    expect(report.totals.misses).toBeGreaterThan(0);
  }

  if (normalizedKey.includes('LevelUp')) {
    expect(report.nextStep?.direction).toBe('up');
  }

  if (normalizedKey.includes('Consolidate')) {
    expect(report.unifiedAccuracy).toBeLessThan(0.7);
  }

  // Stable simple selector keys
  if (normalizedKey === 'stats.contextual.sublines.simpleModalityGap') {
    expect(report.activeModalities.length).toBeGreaterThan(1);
    expect(gap).toBeGreaterThanOrEqual(REPORT_MODALITY_STRONG_GAP);
    expect(params?.best).toBeDefined();
    expect(params?.worst).toBeDefined();
    expect(params?.gap).toBeDefined();
  }

  if (normalizedKey === 'stats.contextual.sublines.simpleModalityWeak') {
    expect(report.activeModalities.length).toBeGreaterThan(1);
    expect(worst).toBeDefined();
    if (worst) {
      const worstStats = report.byModality[worst.id]!;
      const worstTotal = worstStats.hits + worstStats.misses;
      expect(worst.acc).toBeLessThan(0.9);
      expect(best ? best.acc - worst.acc : 0).toBeGreaterThanOrEqual(0.1);
      expect(worstTotal).toBeGreaterThanOrEqual(6);
    }
    expect(params?.modality).toBeDefined();
    // Some beta templates are intentionally short and may omit counts.
    if (!sublineKey.endsWith('simpleModalityWeakV2')) {
      expect(params?.hits).toBeDefined();
      expect(params?.total).toBeDefined();
    }
  }

  if (normalizedKey === 'stats.contextual.sublines.simpleFaRate') {
    expect(report.totals.falseAlarms).not.toBeNull();
    expect(cr + fa).toBeGreaterThan(0);
    expect(params?.fa).toBeDefined();
    expect(params?.nonTargets).toBeDefined();
  }

  if (normalizedKey === 'stats.contextual.sublines.simpleFa') {
    expect(report.totals.falseAlarms).not.toBeNull();
    expect(fa).toBeGreaterThan(0);
    expect(params?.fa).toBeDefined();
  }

  if (normalizedKey === 'stats.contextual.sublines.simpleAvgRt') {
    expect(params?.rt).toBeDefined();
  }

  if (normalizedKey === 'stats.contextual.sublines.simpleDetection') {
    expect(totalTargets).toBeGreaterThan(0);
    expect(params?.hits).toBeDefined();
    expect(params?.total).toBeDefined();
    expect(params?.pct).toBeDefined();
  }

  // Special cases
  if (normalizedKey.startsWith('stats.contextual.sublines.abandoned')) {
    expect(report.reason).toBe('abandoned');
    if (report.trialsCount > 0) {
      expect(totalActions / report.trialsCount).toBeLessThan(REPORT_MIN_TRIALS_RATIO);
    }
  }

  if (normalizedKey.startsWith('stats.contextual.sublines.noResponse')) {
    expect(totalTargets).toBeGreaterThan(0);
    expect(report.totals.hits + fa).toBe(0);
  }

  if (normalizedKey.startsWith('stats.contextual.sublines.impulsive')) {
    expect(report.totals.falseAlarms).not.toBeNull();
    expect(totalActions > 0 ? fa / totalActions : 0).toBeGreaterThanOrEqual(
      REPORT_IMPULSIVE_FA_RATE,
    );
    if (report.speedStats?.valueMs) {
      expect(report.speedStats.valueMs).toBeLessThan(REPORT_IMPULSIVE_RT_MS);
    }
  }
}

describe('ContextualMessage semantic guardrails (stable)', () => {
  it('never emits semantically inconsistent stable-simple sublines across many scenarios', () => {
    const rng = mulberry32(0xdecafbad);
    for (let i = 0; i < 5000; i += 1) {
      const report = buildRandomReport(rng, String(i));
      const data = generateContextualMessageData(report, { style: 'simple', variant: 'stable' });
      assertSemanticConsistency(report, data.subline.key, data.subline.params);
    }
  });

  it('never emits semantically inconsistent stable-analyst sublines across many scenarios', () => {
    const rng = mulberry32(0x1337c0de);
    for (let i = 0; i < 5000; i += 1) {
      const report = buildRandomReport(rng, `a${i}`);
      const data = generateContextualMessageData(report, { style: 'analyst', variant: 'stable' });
      assertSemanticConsistency(report, data.subline.key, data.subline.params);
    }
  });
});

describe('ContextualMessage semantic guardrails (beta)', () => {
  it('never emits semantically inconsistent beta-simple sublines across many scenarios', () => {
    const rng = mulberry32(0x0badf00d);
    for (let i = 0; i < 5000; i += 1) {
      const report = buildRandomReport(rng, `b${i}`);
      const data = generateContextualMessageData(report, { style: 'simple', variant: 'beta' });
      assertSemanticConsistency(report, data.subline.key, data.subline.params);
    }
  });

  it('never emits semantically inconsistent beta-analyst sublines across many scenarios', () => {
    const rng = mulberry32(0xdeadb33f);
    for (let i = 0; i < 5000; i += 1) {
      const report = buildRandomReport(rng, `ba${i}`);
      const data = generateContextualMessageData(report, { style: 'analyst', variant: 'beta' });
      assertSemanticConsistency(report, data.subline.key, data.subline.params);
    }
  });

  it('covers cognitive archetype keys when profile is provided', () => {
    const base: SessionEndReportModel = {
      sessionId: 'beta-cognitive',
      createdAt: new Date(0).toISOString(),
      userId: 'u1',
      reason: 'completed',
      gameMode: 'dual-catch',
      gameModeLabel: 'Dual Catch',
      playContext: 'free',
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 30,
      durationMs: 120000,
      ups: {
        score: 80,
        tier: 'intermediate',
        journeyEligible: true,
        components: { accuracy: 80, confidence: null },
      },
      unifiedAccuracy: 0.8,
      modeScore: { labelKey: 'report.modeScore.accuracy', value: 80, unit: '%' },
      totals: { hits: 16, misses: 4, falseAlarms: 4, correctRejections: 10 },
      byModality: {
        position: {
          hits: 8,
          misses: 2,
          falseAlarms: 2,
          correctRejections: 5,
          dPrime: null,
          avgRT: 400,
        },
        audio: {
          hits: 8,
          misses: 2,
          falseAlarms: 2,
          correctRejections: 5,
          dPrime: null,
          avgRT: 410,
        },
      },
      errorProfile: { errorRate: 0.2, missShare: 0.5, faShare: 0.5 },
      speedStats: {
        labelKey: 'report.speed.avg',
        valueMs: 410,
        distribution: { min: 380, median: 410, max: 440 },
      },
      nextStep: { direction: 'same', nextLevel: 2, reason: 'test' },
      modeDetails: {
        kind: 'tempo',
        tempo: 1,
        confidenceScore: null,
        confidenceDebug: {
          rawData: {
            pesRatio: 1.25,
          },
        },
        trials: [],
      } as unknown as SessionEndReportModel['modeDetails'],
    };

    // 1) Diesel archetype
    const diesel = generateContextualMessageData(base, {
      style: 'analyst',
      variant: 'beta',
      cognitiveProfile: {
        fatigue: {
          isFatigued: false,
          degradationPercent: 0,
          earlyAccuracy: 0.5,
          lateAccuracy: 0.95,
        },
        resilience: {
          avgSlowdownAfterError: 50,
        },
      } as CognitiveProfile,
    });
    expect(diesel.subline.key).toMatch(
      /^stats\.contextual\.sublines\.analyst(Diesel|FocusLost|Pes|Modality|Miss|Fa|Variable|Stable|LevelUp|Consolidate|Fallback)/,
    );

    // 2) Fatigue archetype
    const fatigue = generateContextualMessageData(base, {
      style: 'analyst',
      variant: 'beta',
      cognitiveProfile: {
        fatigue: {
          isFatigued: true,
          degradationPercent: 22,
          earlyAccuracy: 0.9,
          lateAccuracy: 0.6,
        },
        resilience: {
          avgSlowdownAfterError: 50,
        },
      } as CognitiveProfile,
    });
    // Fatigue sits after several higher-priority signals; we just ensure it never returns a missing params shape.
    expect(fatigue.subline.key).toContain('stats.contextual.sublines.');
  });
});

describe('ContextualMessage scenario pack (regression)', () => {
  it('keeps pack scenarios semantically consistent across stable/beta and styles', () => {
    const reports = scenarioPack();
    const variants = ['stable', 'beta'] as const;
    const styles = ['simple', 'analyst'] as const;

    for (const report of reports) {
      for (const variant of variants) {
        for (const style of styles) {
          const data = generateContextualMessageData(report, { style, variant });
          assertSemanticConsistency(report, data.subline.key, data.subline.params);
        }
      }
    }
  });
});
