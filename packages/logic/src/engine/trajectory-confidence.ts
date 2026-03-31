import type { TrajectoryPoint } from '../types/trajectory';
import { TRAJECTORY_SAMPLE_INTERVAL_MS } from '../types/trajectory';
import {
  TRAJECTORY_MIN_POINTS,
  TRAJECTORY_MIN_DIRECT_DISTANCE_PX,
  TRAJECTORY_RESAMPLE_TOLERANCE_MS,
  TRAJECTORY_MAX_IRREGULAR_RATIO,
  TRAJECTORY_PAUSE_MIN_MS,
  TRAJECTORY_MIN_VSTOP,
  TRAJECTORY_DIRECTNESS_GOOD,
  TRAJECTORY_DIRECTNESS_BAD,
  TRAJECTORY_AUC_GOOD,
  TRAJECTORY_AUC_BAD,
  TRAJECTORY_MD_GOOD,
  TRAJECTORY_MD_BAD,
  TRAJECTORY_BACKTRACK_BAD,
  TRAJECTORY_PAUSE_BAD_MS,
  // Weights for confidence calculation
  TRAJECTORY_WEIGHT_DIRECTNESS,
  TRAJECTORY_WEIGHT_DEVIATION,
  TRAJECTORY_WEIGHT_BACKTRACK,
  TRAJECTORY_WEIGHT_PAUSE,
  TRAJECTORY_DEVIATION_AUC_WEIGHT,
  TRAJECTORY_DEVIATION_MD_WEIGHT,
  // Penalties for slot shopping
  TRAJECTORY_PENALTY_PER_WRONG_SLOT,
  TRAJECTORY_PENALTY_PER_BACK_AND_FORTH,
  TRAJECTORY_PENALTY_CAP,
  // Velocity ratios (relative to peak speed)
  TRAJECTORY_VSTOP_PEAK_RATIO,
  TRAJECTORY_VBACKTRACK_PEAK_RATIO,
  TRAJECTORY_VMOVE_PEAK_RATIO,
  // Wrong dwell penalty
  TRAJECTORY_WRONG_DWELL_THRESHOLD_MS,
  TRAJECTORY_WRONG_DWELL_DIVISOR_MS,
  TRAJECTORY_WRONG_DWELL_MAX_PENALTY,
  // Sigmoid transform parameters
  TRAJECTORY_SIGMOID_STEEPNESS,
  TRAJECTORY_SIGMOID_CENTER,
} from '../specs/thresholds';

type ContainerSize = { w: number; h: number };

export interface TrajectoryConfidenceMetrics {
  readonly directnessTransport: number;
  readonly aucNorm: number;
  readonly mdNorm: number;
  readonly backtrackCount: number;
  readonly pauseTimeMs: number;
  readonly speedCv: number;
}

export interface TrajectoryConfidenceResult {
  readonly score: number;
  readonly metrics: TrajectoryConfidenceMetrics;
}

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

const MIN_POINTS = TRAJECTORY_MIN_POINTS;
const MIN_DIRECT_DISTANCE_PX = TRAJECTORY_MIN_DIRECT_DISTANCE_PX;
const RESAMPLE_TOLERANCE_MS = TRAJECTORY_RESAMPLE_TOLERANCE_MS;
const MAX_IRREGULAR_RATIO = TRAJECTORY_MAX_IRREGULAR_RATIO;
const PAUSE_MIN_MS = TRAJECTORY_PAUSE_MIN_MS;
const MIN_VSTOP = TRAJECTORY_MIN_VSTOP;

const DIRECTNESS_GOOD = TRAJECTORY_DIRECTNESS_GOOD;
const DIRECTNESS_BAD = TRAJECTORY_DIRECTNESS_BAD;
const AUC_GOOD = TRAJECTORY_AUC_GOOD;
const AUC_BAD = TRAJECTORY_AUC_BAD;
const MD_GOOD = TRAJECTORY_MD_GOOD;
const MD_BAD = TRAJECTORY_MD_BAD;
const BACKTRACK_BAD = TRAJECTORY_BACKTRACK_BAD;
const PAUSE_BAD_MS = TRAJECTORY_PAUSE_BAD_MS;

export interface SlotEnter {
  readonly slot: number;
  readonly type: 'position' | 'audio' | 'unified';
  readonly mirror?: boolean;
  readonly atMs: number;
}

export function computeTrajectoryConfidence(input: {
  points: readonly TrajectoryPoint[];
  directDistancePx?: number;
  containerSize?: ContainerSize;
  wrongSlotDwellMs?: number; // Time spent hovering over wrong slots
  slotEnters?: readonly SlotEnter[]; // Slots visited during drag
  finalSlot?: number; // The slot where the card was dropped
  proposalType?: 'position' | 'audio' | 'unified'; // Type of card being dragged (to filter relevant slots)
}): TrajectoryConfidenceResult | null {
  const normalized = normalizePoints(input.points);
  if (!normalized || normalized.length < MIN_POINTS) return null;

  const points = preprocessPoints(normalized);
  if (points.length < MIN_POINTS) return null;

  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return null;

  const L = distance(start, end);
  if (L <= 0) return null;

  const directDistancePx =
    input.directDistancePx ??
    (input.containerSize ? distancePx(start, end, input.containerSize) : undefined);
  if (directDistancePx !== undefined && directDistancePx < MIN_DIRECT_DISTANCE_PX) {
    return null;
  }

  const dir = {
    x: (end.x - start.x) / L,
    y: (end.y - start.y) / L,
  };

  // Use ALL points - no slicing. We want to capture all hesitations.
  const transport = points;
  if (transport.length < 2) return null;

  const progress = transport.map((p) => clamp(progressAlongLine(p, start, dir, L), 0, 1));
  const pathLength = computePathLength(transport);

  // Use direct distance L, not LTransport based on progress
  // This measures actual path efficiency: how much longer than necessary was the path?
  const directnessTransport = pathLength > 0 ? L / pathLength : 1;

  const deviations = transport.map((p) => perpendicularDistance(p, start, dir));
  const md = deviations.length > 0 ? Math.max(...deviations) : 0;
  const mdNorm = L > 0 ? md / L : 0;

  let auc = 0;
  for (let i = 0; i < transport.length - 1; i++) {
    const currProgress = progress[i];
    const nextProgress = progress[i + 1];
    const currDeviation = deviations[i];
    const nextDeviation = deviations[i + 1];
    if (
      currProgress === undefined ||
      nextProgress === undefined ||
      currDeviation === undefined ||
      nextDeviation === undefined
    )
      continue;
    const deltaProgress = nextProgress - currProgress;
    if (deltaProgress <= 0) continue;
    const avgDeviation = (currDeviation + nextDeviation) * 0.5;
    auc += avgDeviation * deltaProgress * L;
  }
  const aucNorm = L > 0 ? auc / (L * L) : 0;

  const segments = buildSegments(transport);
  const vPeak = segments.length > 0 ? Math.max(...segments.map((s) => s.speed)) : 0;
  // Use absolute floor to catch pauses even for slow users (@see thresholds.ts SSOT)
  const vStop = Math.max(vPeak * TRAJECTORY_VSTOP_PEAK_RATIO, MIN_VSTOP);
  const vBacktrack = vPeak > 0 ? vPeak * TRAJECTORY_VBACKTRACK_PEAK_RATIO : 0;

  const backtrackCount = countBacktracks(segments, vBacktrack);
  const pauseTimeMs = computePauseTimeMs(segments, vStop, PAUSE_MIN_MS);
  const speedCv = computeSpeedCv(segments, vStop);

  const directnessScore = scoreHigherIsBetter(directnessTransport, DIRECTNESS_GOOD, DIRECTNESS_BAD);
  const aucScore = scoreLowerIsBetter(aucNorm, AUC_GOOD, AUC_BAD);
  const mdScore = scoreLowerIsBetter(mdNorm, MD_GOOD, MD_BAD);
  const deviationScore =
    TRAJECTORY_DEVIATION_AUC_WEIGHT * aucScore + TRAJECTORY_DEVIATION_MD_WEIGHT * mdScore;
  const backtrackScore = scoreLowerIsBetter(backtrackCount, 0, BACKTRACK_BAD);
  const pauseScore = scoreLowerIsBetter(pauseTimeMs, 0, PAUSE_BAD_MS);
  // speedCvScore removed - measures dexterity, not confidence

  // Confidence = knowing where to go, not mouse dexterity
  // speedCV removed - it penalizes hardware/dexterity, not hesitation
  // directness is THE key signal: did you go straight to target?
  let score =
    TRAJECTORY_WEIGHT_DIRECTNESS * directnessScore + // Dominant: did you know where to go?
    TRAJECTORY_WEIGHT_DEVIATION * deviationScore + // Secondary: how direct was the path?
    TRAJECTORY_WEIGHT_BACKTRACK * backtrackScore + // Did you change your mind?
    TRAJECTORY_WEIGHT_PAUSE * pauseScore; // Did you stop to think?
  // speedCV intentionally excluded - measures dexterity, not confidence

  // Apply wrong slot dwell penalty
  if (input.wrongSlotDwellMs !== undefined) {
    score -= computeWrongDwellPenalty(input.wrongSlotDwellMs);
  }

  // SLOT SHOPPING PENALTY - the strongest hesitation signal
  // If user visited multiple different slots before deciding, that's hesitation
  // Only count slots of the same type as the card being dragged
  const slotShoppingPenalty = computeSlotShoppingPenalty(
    input.slotEnters,
    input.finalSlot,
    input.proposalType,
  );
  score -= slotShoppingPenalty;

  score = clamp(score, 0, 100);

  // DEBUG: Log all metrics
  const durationMs =
    points.length > 0 ? (points[points.length - 1]?.t ?? 0) - (points[0]?.t ?? 0) : 0;
  console.log('[TrajectoryConfidence] DEBUG:', {
    score: Math.round(score),
    pts: points.length,
    durationMs: Math.round(durationMs),
    dir: directnessTransport.toFixed(3),
    pauseMs: Math.round(pauseTimeMs),
    slotShop: Math.round(slotShoppingPenalty),
    slotsVisited: input.slotEnters?.length ?? 0,
    sub: `D:${Math.round(directnessScore)} V:${Math.round(deviationScore)} B:${Math.round(backtrackScore)} P:${Math.round(pauseScore)}`,
  });

  return {
    score,
    metrics: {
      directnessTransport,
      aucNorm,
      mdNorm,
      backtrackCount,
      pauseTimeMs,
      speedCv,
    },
  };
}

export function computeWrongDwellPenalty(wrongSlotDwellMs: number): number {
  if (wrongSlotDwellMs <= TRAJECTORY_WRONG_DWELL_THRESHOLD_MS) return 0;
  return clamp(
    ((wrongSlotDwellMs - TRAJECTORY_WRONG_DWELL_THRESHOLD_MS) / TRAJECTORY_WRONG_DWELL_DIVISOR_MS) *
      TRAJECTORY_WRONG_DWELL_MAX_PENALTY,
    0,
    TRAJECTORY_WRONG_DWELL_MAX_PENALTY,
  );
}

/**
 * Compute penalty for "slot shopping" - visiting multiple slots before deciding.
 * This is the strongest hesitation signal: user didn't know where to place the card.
 *
 * IMPORTANT: Only counts slots of the SAME TYPE as the card being dragged.
 * Passing through audio slots while dragging a position card doesn't count as hesitation.
 *
 * Penalty based on:
 * 1. Number of unique wrong slots visited (not the final slot, same type only)
 * 2. Number of slot changes (back-and-forth between slots of same type)
 *
 * Examples:
 * - Direct to correct slot: 0 penalty
 * - Visited 1 wrong slot then correct: 15 penalty
 * - Visited 2+ wrong slots: 30+ penalty
 * - Multiple back-and-forth: up to 60 penalty
 */
export function computeSlotShoppingPenalty(
  slotEnters?: readonly SlotEnter[],
  finalSlot?: number,
  proposalType?: 'position' | 'audio' | 'unified',
): number {
  if (!slotEnters || slotEnters.length === 0) return 0;

  // Filter to only slots of the same type as the card being dragged
  // If no proposalType provided, consider all slots (legacy behavior)
  const relevantEnters = proposalType
    ? slotEnters.filter((e) => e.type === proposalType)
    : slotEnters;

  if (relevantEnters.length === 0) return 0;

  // Count unique slots visited (excluding the final slot)
  const uniqueSlots = new Set<number>();
  let slotChanges = 0;
  let lastSlot: number | null = null;

  for (const enter of relevantEnters) {
    // Track slot changes (transitions between different slots)
    if (lastSlot !== null && lastSlot !== enter.slot) {
      slotChanges++;
    }
    lastSlot = enter.slot;

    // Don't count the final slot as "wrong"
    if (finalSlot !== undefined && enter.slot === finalSlot) {
      continue;
    }

    uniqueSlots.add(enter.slot);
  }

  const wrongSlotsVisited = uniqueSlots.size;

  // Penalty calculation:
  // - Each wrong slot visited: penalty points (from thresholds.ts)
  // - Each slot change beyond 1: penalty points (back-and-forth is bad)
  const wrongSlotPenalty = wrongSlotsVisited * TRAJECTORY_PENALTY_PER_WRONG_SLOT;
  const backAndForthPenalty = Math.max(0, slotChanges - 1) * TRAJECTORY_PENALTY_PER_BACK_AND_FORTH;

  const totalPenalty = wrongSlotPenalty + backAndForthPenalty;

  return clamp(totalPenalty, 0, TRAJECTORY_PENALTY_CAP); // Cap to leave room for other factors
}

export function computePathLength(points: readonly TrajectoryPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    sum += distance(a, b);
  }
  return sum;
}

export function computeDirectDistance(points: readonly TrajectoryPoint[]): number {
  if (points.length === 0) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return 0;
  return distance(start, end);
}

export function computeDirectnessRatioFromPoints(points: readonly TrajectoryPoint[]): number {
  const path = computePathLength(points);
  if (path <= 0) return 1;
  const direct = computeDirectDistance(points);
  return direct / path;
}

/**
 * Trim static phases at the beginning and end of the trajectory.
 * These are the moments when:
 * - User has touched the card but hasn't started moving yet
 * - User is hovering over the target before releasing
 * These aren't hesitations - just natural drag start/end.
 */
function trimStaticPhases(points: TrajectoryPoint[]): TrajectoryPoint[] {
  if (points.length < 3) return points;

  // Compute speeds for each segment
  const speeds: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) {
      speeds.push(0);
      continue;
    }
    const dt = b.t - a.t;
    if (dt <= 0) {
      speeds.push(0);
      continue;
    }
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);
  }

  // Find peak speed to set threshold
  const vPeak = Math.max(...speeds, 0);
  if (vPeak <= 0) return points;

  // Movement threshold: ratio of peak speed - generous to catch real movement start (@see thresholds.ts)
  const vMove = vPeak * TRAJECTORY_VMOVE_PEAK_RATIO;

  // Find first segment with real movement
  let startIdx = 0;
  for (let i = 0; i < speeds.length; i++) {
    if ((speeds[i] ?? 0) >= vMove) {
      startIdx = i;
      break;
    }
  }

  // Find last segment with real movement
  let endIdx = speeds.length;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if ((speeds[i] ?? 0) >= vMove) {
      endIdx = i + 1; // Include the point after this segment
      break;
    }
  }

  // Ensure we have enough points
  if (endIdx - startIdx < 2) return points;

  // Include one extra point at end to complete the trajectory
  const trimmed = points.slice(startIdx, Math.min(endIdx + 1, points.length));

  return trimmed.length >= 2 ? trimmed : points;
}

function preprocessPoints(points: TrajectoryPoint[]): TrajectoryPoint[] {
  if (points.length < 2) return points;

  const dtValues: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    if (!curr || !next) continue;
    const dt = next.t - curr.t;
    if (dt > 0) dtValues.push(dt);
  }

  const irregularCount = dtValues.filter(
    (dt) => Math.abs(dt - TRAJECTORY_SAMPLE_INTERVAL_MS) > RESAMPLE_TOLERANCE_MS,
  ).length;
  const irregularRatio = dtValues.length > 0 ? irregularCount / dtValues.length : 0;

  let processed = points;
  if (irregularRatio > MAX_IRREGULAR_RATIO) {
    processed = resamplePoints(processed, TRAJECTORY_SAMPLE_INTERVAL_MS);
  }

  // Trim static phases at start and end (user touching but not moving yet,
  // or hovering over target before releasing)
  processed = trimStaticPhases(processed);

  // Smoothing disabled - preserve micro-hesitations for stricter scoring
  // if (processed.length >= 3) {
  //   processed = smoothPoints(processed);
  // }

  return processed;
}

function normalizePoints(points: readonly TrajectoryPoint[]): TrajectoryPoint[] | null {
  if (points.length < 2) return null;
  const normalized: TrajectoryPoint[] = [];
  let lastT = -Infinity;

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.t)) continue;
    if (p.t <= lastT) continue;
    normalized.push({ x: p.x, y: p.y, t: p.t });
    lastT = p.t;
  }

  if (normalized.length < 2) return null;

  const t0 = normalized[0]?.t ?? 0;
  if (t0 !== 0) {
    for (let i = 0; i < normalized.length; i++) {
      const point = normalized[i];
      if (!point) continue;
      normalized[i] = { x: point.x, y: point.y, t: point.t - t0 };
    }
  }

  return normalized;
}

function resamplePoints(points: TrajectoryPoint[], intervalMs: number): TrajectoryPoint[] {
  if (points.length < 2) return points;
  const endTime = points[points.length - 1]?.t ?? 0;
  if (endTime <= 0) return points;

  const result: TrajectoryPoint[] = [];
  let index = 0;

  for (let t = 0; t <= endTime; t += intervalMs) {
    while (index < points.length - 2 && (points[index + 1]?.t ?? Infinity) < t) {
      index += 1;
    }
    const p0 = points[index];
    const p1 = points[index + 1];
    if (!p0 || !p1) break;
    const dt = p1.t - p0.t;
    const ratio = dt > 0 ? (t - p0.t) / dt : 0;
    result.push({
      x: p0.x + (p1.x - p0.x) * ratio,
      y: p0.y + (p1.y - p0.y) * ratio,
      t,
    });
  }

  const last = points[points.length - 1];
  if (last && (result.length === 0 || (result[result.length - 1]?.t ?? -Infinity) < last.t)) {
    result.push({ x: last.x, y: last.y, t: last.t });
  }

  return result;
}

// Smoothing disabled for stricter scoring - keeping for potential future use
// function smoothPoints(points: TrajectoryPoint[]): TrajectoryPoint[] {
//   const smoothed: TrajectoryPoint[] = [];
//   for (let i = 0; i < points.length; i++) {
//     const prev = points[i - 1];
//     const curr = points[i];
//     const next = points[i + 1];
//     if (!curr) continue;
//     const count = (prev ? 1 : 0) + 1 + (next ? 1 : 0);
//     const x = ((prev?.x ?? 0) + curr.x + (next?.x ?? 0)) / count;
//     const y = ((prev?.y ?? 0) + curr.y + (next?.y ?? 0)) / count;
//     smoothed.push({ x, y, t: curr.t });
//   }
//   return smoothed;
// }

// sliceUntilProgress removed - we now use ALL points to capture all hesitations
// The old approach was cutting the trajectory when progress reached a threshold,
// which ignored hesitations that happened AFTER reaching the target.

function buildSegments(points: TrajectoryPoint[]): Array<{
  readonly dt: number;
  readonly speed: number;
  readonly vPar: number;
}> {
  if (points.length < 2) return [];
  const start = points[0];
  const end = points.at(-1);
  if (!start || !end) return [];
  const L = distance(start, end);
  if (L <= 0) return [];

  const dir = {
    x: (end.x - start.x) / L,
    y: (end.y - start.y) / L,
  };

  const segments: Array<{ dt: number; speed: number; vPar: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const speed = Math.hypot(dx, dy) / dt;
    const vPar = (dx * dir.x + dy * dir.y) / dt;
    segments.push({ dt, speed, vPar });
  }
  return segments;
}

function countBacktracks(
  segments: Array<{ dt: number; speed: number; vPar: number }>,
  vBacktrack: number,
): number {
  if (segments.length === 0 || vBacktrack <= 0) return 0;

  let count = 0;
  let streak = 0;

  for (const seg of segments) {
    if (seg.vPar < -vBacktrack) {
      streak += 1;
    } else {
      if (streak >= 2) count += 1;
      streak = 0;
    }
  }

  if (streak >= 2) count += 1;
  return count;
}

function computePauseTimeMs(
  segments: Array<{ dt: number; speed: number; vPar: number }>,
  vStop: number,
  minPauseMs: number,
): number {
  if (segments.length === 0 || vStop <= 0) return 0;

  let pauseTime = 0;
  let streakMs = 0;

  for (const seg of segments) {
    if (seg.speed < vStop) {
      streakMs += seg.dt;
    } else {
      if (streakMs >= minPauseMs) pauseTime += streakMs;
      streakMs = 0;
    }
  }

  if (streakMs >= minPauseMs) pauseTime += streakMs;
  return pauseTime;
}

function computeSpeedCv(
  segments: Array<{ dt: number; speed: number; vPar: number }>,
  vStop: number,
): number {
  if (segments.length === 0) return 0;
  const speeds = segments.filter((s) => s.speed >= vStop).map((s) => s.speed);
  if (speeds.length < 2) return 0;

  const mean = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  if (mean <= 0) return 0;

  const variance = speeds.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / speeds.length;
  const std = Math.sqrt(variance);
  return std / mean;
}

function progressAlongLine(
  p: TrajectoryPoint,
  start: TrajectoryPoint,
  dir: { x: number; y: number },
  L: number,
): number {
  const dx = p.x - start.x;
  const dy = p.y - start.y;
  return (dx * dir.x + dy * dir.y) / L;
}

function perpendicularDistance(
  p: TrajectoryPoint,
  start: TrajectoryPoint,
  dir: { x: number; y: number },
): number {
  const dx = p.x - start.x;
  const dy = p.y - start.y;
  const cross = dx * dir.y - dy * dir.x;
  return Math.abs(cross);
}

// interpolatePoint removed - was only used by sliceUntilProgress

function distance(a: TrajectoryPoint, b: TrajectoryPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distancePx(a: TrajectoryPoint, b: TrajectoryPoint, size: ContainerSize): number {
  return Math.hypot((a.x - b.x) * size.w, (a.y - b.y) * size.h);
}

// Sigmoid curve for stricter scoring - penalizes mediocre values more harshly
function sigmoidTransform(x: number): number {
  // Sigmoid centered at TRAJECTORY_SIGMOID_CENTER, steepness k=TRAJECTORY_SIGMOID_STEEPNESS
  // x=0 → ~0.05, x=0.5 → 0.5, x=1 → ~0.95
  return 1 / (1 + Math.exp(-TRAJECTORY_SIGMOID_STEEPNESS * (x - TRAJECTORY_SIGMOID_CENTER)));
}

function scoreLowerIsBetter(value: number, good: number, bad: number): number {
  if (bad <= good) return 0;
  const x = (bad - value) / (bad - good); // 0 (bad) to 1 (good)
  const sigmoid = sigmoidTransform(x);
  return clamp(sigmoid * 100, 0, 100);
}

function scoreHigherIsBetter(value: number, good: number, bad: number): number {
  if (good <= bad) return 0;
  const x = (value - bad) / (good - bad); // 0 (bad) to 1 (good)
  const sigmoid = sigmoidTransform(x);
  return clamp(sigmoid * 100, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
