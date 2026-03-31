import { SeededRandom } from '../random';

export interface TrackReplayObjectState {
  readonly x: number;
  readonly y: number;
  readonly speedPxPerSec: number;
  readonly headingRad: number;
  readonly turnRateRadPerSec: number;
  readonly turnJitterTimerMs: number;
  readonly minTurnIntervalMs: number;
  readonly maxTurnIntervalMs: number;
  readonly maxTurnRateRadPerSec: number;
  readonly rngSeed: string;
}

export interface TrackReplayDefinition {
  readonly arenaWidthPx: number;
  readonly arenaHeightPx: number;
  readonly trackingDurationMs: number;
  readonly crowdingThresholdPx: number;
  readonly initialObjects: readonly TrackReplayObjectState[];
  readonly insetPx?: number;
}

export interface TrackReplaySnapshot {
  readonly timeMs: number;
  readonly crowdedPairs: readonly [number, number][];
  readonly crowdedObjectIds: readonly number[];
  readonly minDistancePx: number;
  readonly objects: readonly {
    readonly x: number;
    readonly y: number;
    readonly speedPxPerSec: number;
    readonly headingRad: number;
  }[];
}

export interface TrackCrowdingEpisode {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly peakPairCount: number;
  readonly minDistancePx: number;
}

export interface TrackReplayAnalysis {
  readonly episodeCount: number;
  readonly timeUnderCrowdingThresholdMs: number;
  readonly peakPairCount: number;
  readonly minDistancePx: number;
  readonly episodes: readonly TrackCrowdingEpisode[];
}

interface RuntimeReplayObjectState extends TrackReplayObjectState {
  readonly rng: SeededRandom;
}

interface MutableCrowdingEpisode {
  readonly startMs: number;
  readonly peakPairCount: number;
  readonly minDistancePx: number;
}

function reflectAxis(
  position: number,
  velocity: number,
  deltaSeconds: number,
  min: number,
  max: number,
): { position: number; velocity: number } {
  let next = position + velocity * deltaSeconds;
  let nextVelocity = velocity;

  while (next < min || next > max) {
    if (next < min) {
      next = min + (min - next);
      nextVelocity = Math.abs(nextVelocity);
      continue;
    }

    next = max - (next - max);
    nextVelocity = -Math.abs(nextVelocity);
  }

  return { position: next, velocity: nextVelocity };
}

function randomRange(min: number, max: number, rng: SeededRandom): number {
  return min + rng.next() * (max - min);
}

function createRuntimeObjects(
  objects: readonly TrackReplayObjectState[],
): RuntimeReplayObjectState[] {
  return objects.map((object) => ({
    ...object,
    rng: new SeededRandom(object.rngSeed),
  }));
}

function advanceReplayObject(
  object: RuntimeReplayObjectState,
  deltaSeconds: number,
  width: number,
  height: number,
  insetPx: number,
): RuntimeReplayObjectState {
  let headingRad = object.headingRad + object.turnRateRadPerSec * deltaSeconds;
  let turnRateRadPerSec = object.turnRateRadPerSec;
  let turnJitterTimerMs = object.turnJitterTimerMs - deltaSeconds * 1000;

  while (turnJitterTimerMs <= 0) {
    turnRateRadPerSec = randomRange(
      -object.maxTurnRateRadPerSec,
      object.maxTurnRateRadPerSec,
      object.rng,
    );
    turnJitterTimerMs += randomRange(
      object.minTurnIntervalMs,
      object.maxTurnIntervalMs,
      object.rng,
    );
  }

  const vx = Math.cos(headingRad) * object.speedPxPerSec;
  const vy = Math.sin(headingRad) * object.speedPxPerSec;
  const nextX = reflectAxis(object.x, vx, deltaSeconds, insetPx, width - insetPx);
  const nextY = reflectAxis(object.y, vy, deltaSeconds, insetPx, height - insetPx);
  headingRad = Math.atan2(nextY.velocity, nextX.velocity);

  return {
    ...object,
    x: nextX.position,
    y: nextY.position,
    headingRad,
    turnRateRadPerSec,
    turnJitterTimerMs,
  };
}

function measureCrowding(
  objects: readonly RuntimeReplayObjectState[],
  thresholdPx: number,
): {
  crowdedPairs: [number, number][];
  crowdedObjectIds: number[];
  minDistancePx: number;
} {
  const crowdedPairs: [number, number][] = [];
  const crowdedObjectIds = new Set<number>();
  let minDistancePx = Number.POSITIVE_INFINITY;

  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const first = objects[i];
      const second = objects[j];
      if (!first || !second) continue;

      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      minDistancePx = Math.min(minDistancePx, distance);

      if (distance <= thresholdPx) {
        crowdedPairs.push([i, j]);
        crowdedObjectIds.add(i);
        crowdedObjectIds.add(j);
      }
    }
  }

  return {
    crowdedPairs,
    crowdedObjectIds: [...crowdedObjectIds].sort((a, b) => a - b),
    minDistancePx: Number.isFinite(minDistancePx) ? minDistancePx : 0,
  };
}

function stepSimulation(
  objects: RuntimeReplayObjectState[],
  definition: TrackReplayDefinition,
  deltaMs: number,
): RuntimeReplayObjectState[] {
  const deltaSeconds = Math.max(0, deltaMs / 1000);
  if (deltaSeconds <= 0) return objects;
  const insetPx = definition.insetPx ?? 30;
  return objects.map((object) =>
    advanceReplayObject(
      object,
      deltaSeconds,
      definition.arenaWidthPx,
      definition.arenaHeightPx,
      insetPx,
    ),
  );
}

export function projectTrackReplaySnapshot(
  definition: TrackReplayDefinition,
  timeMs: number,
  stepMs: number = 1000 / 60,
): TrackReplaySnapshot {
  const boundedTimeMs = Math.max(0, Math.min(definition.trackingDurationMs, timeMs));
  let elapsedMs = 0;
  let objects = createRuntimeObjects(definition.initialObjects);

  while (elapsedMs < boundedTimeMs) {
    const deltaMs = Math.min(stepMs, boundedTimeMs - elapsedMs);
    objects = stepSimulation(objects, definition, deltaMs);
    elapsedMs += deltaMs;
  }

  const crowding = measureCrowding(objects, definition.crowdingThresholdPx);
  return {
    timeMs: boundedTimeMs,
    crowdedPairs: crowding.crowdedPairs,
    crowdedObjectIds: crowding.crowdedObjectIds,
    minDistancePx: crowding.minDistancePx,
    objects: objects.map((object) => ({
      x: object.x,
      y: object.y,
      speedPxPerSec: object.speedPxPerSec,
      headingRad: object.headingRad,
    })),
  };
}

export function analyzeTrackReplay(
  definition: TrackReplayDefinition,
  stepMs: number = 1000 / 60,
): TrackReplayAnalysis {
  let elapsedMs = 0;
  let objects = createRuntimeObjects(definition.initialObjects);
  let activeEpisode: MutableCrowdingEpisode | null = null;
  let peakPairCount = 0;
  let minDistancePx = Number.POSITIVE_INFINITY;
  let timeUnderCrowdingThresholdMs = 0;
  const episodes: TrackCrowdingEpisode[] = [];

  while (elapsedMs <= definition.trackingDurationMs) {
    const crowding = measureCrowding(objects, definition.crowdingThresholdPx);
    peakPairCount = Math.max(peakPairCount, crowding.crowdedPairs.length);
    minDistancePx = Math.min(minDistancePx, crowding.minDistancePx);

    if (crowding.crowdedPairs.length > 0) {
      timeUnderCrowdingThresholdMs += stepMs;
      if (!activeEpisode) {
        activeEpisode = {
          startMs: elapsedMs,
          peakPairCount: crowding.crowdedPairs.length,
          minDistancePx: crowding.minDistancePx,
        };
      } else {
        const currentEpisode: MutableCrowdingEpisode = activeEpisode;
        activeEpisode = {
          ...currentEpisode,
          peakPairCount: Math.max(currentEpisode.peakPairCount, crowding.crowdedPairs.length),
          minDistancePx: Math.min(currentEpisode.minDistancePx, crowding.minDistancePx),
        };
      }
    } else if (activeEpisode) {
      episodes.push({
        startMs: activeEpisode.startMs,
        endMs: elapsedMs,
        durationMs: Math.max(0, elapsedMs - activeEpisode.startMs),
        peakPairCount: activeEpisode.peakPairCount,
        minDistancePx: activeEpisode.minDistancePx,
      });
      activeEpisode = null;
    }

    if (elapsedMs >= definition.trackingDurationMs) break;
    const deltaMs = Math.min(stepMs, definition.trackingDurationMs - elapsedMs);
    objects = stepSimulation(objects, definition, deltaMs);
    elapsedMs += deltaMs;
  }

  if (activeEpisode) {
    episodes.push({
      startMs: activeEpisode.startMs,
      endMs: definition.trackingDurationMs,
      durationMs: Math.max(0, definition.trackingDurationMs - activeEpisode.startMs),
      peakPairCount: activeEpisode.peakPairCount,
      minDistancePx: activeEpisode.minDistancePx,
    });
  }

  return {
    episodeCount: episodes.length,
    timeUnderCrowdingThresholdMs: Math.min(
      definition.trackingDurationMs,
      Math.round(timeUnderCrowdingThresholdMs),
    ),
    peakPairCount,
    minDistancePx: Number.isFinite(minDistancePx) ? minDistancePx : 0,
    episodes,
  };
}
