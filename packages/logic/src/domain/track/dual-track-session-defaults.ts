export type DualTrackSessionMotionComplexity = 'smooth' | 'standard' | 'agile';
export type DualTrackSessionCrowdingMode = 'low' | 'standard' | 'dense';

export interface DualTrackSessionDefaults {
  readonly targetCount: number;
  readonly totalObjects: number;
  readonly trialsCount: number;
  readonly trackingDurationMs: number;
  readonly speedPxPerSec: number;
  readonly motionComplexity: DualTrackSessionMotionComplexity;
  readonly crowdingMode: DualTrackSessionCrowdingMode;
}

export function clampDualTrackTargetCount(targetCount: number): number {
  return Math.max(1, Math.min(5, Math.round(targetCount)));
}

export function deriveDualTrackTrialsCount(targetCount: number): number {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  return Math.max(6, 16 - safeTargetCount * 2);
}

export function deriveDualTrackTrackingDurationMs(targetCount: number): number {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  return 5000 + safeTargetCount * 1000;
}

export function deriveDualTrackSpeedPxPerSec(targetCount: number): number {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  return 110 + safeTargetCount * 20;
}

export function deriveDualTrackMotionComplexity(
  targetCount: number,
): DualTrackSessionMotionComplexity {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  if (safeTargetCount <= 2) return 'smooth';
  if (safeTargetCount <= 4) return 'standard';
  return 'agile';
}

export function deriveDualTrackCrowdingMode(targetCount: number): DualTrackSessionCrowdingMode {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  if (safeTargetCount <= 2) return 'low';
  if (safeTargetCount <= 4) return 'standard';
  return 'dense';
}

export function deriveDualTrackTotalObjects(
  targetCount: number,
  crowdingMode: DualTrackSessionCrowdingMode = 'standard',
): number {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  const crowdingOffset = crowdingMode === 'low' ? -1 : crowdingMode === 'dense' ? 1 : 0;
  // Base: targets + same number of distractors (1:1 ratio), +1 for standard, adjusted by crowding
  const base = safeTargetCount * 2 + 1 + crowdingOffset;
  return Math.min(10, Math.max(safeTargetCount + 2, base));
}

export function resolveDualTrackSessionDefaults(targetCount: number): DualTrackSessionDefaults {
  const safeTargetCount = clampDualTrackTargetCount(targetCount);
  const crowdingMode = deriveDualTrackCrowdingMode(safeTargetCount);

  return {
    targetCount: safeTargetCount,
    totalObjects: deriveDualTrackTotalObjects(safeTargetCount, crowdingMode),
    trialsCount: deriveDualTrackTrialsCount(safeTargetCount),
    trackingDurationMs: deriveDualTrackTrackingDurationMs(safeTargetCount),
    speedPxPerSec: deriveDualTrackSpeedPxPerSec(safeTargetCount),
    motionComplexity: deriveDualTrackMotionComplexity(safeTargetCount),
    crowdingMode,
  };
}
