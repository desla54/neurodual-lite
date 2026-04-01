/**
 * Session event helpers — pure utility functions for extracting data from raw event arrays.
 * Extracted from es-emmett/session-event-utils.ts during ES removal.
 */

import { SESSION_START_EVENT_TYPES, type JourneyMeta } from '@neurodual/logic';

export function findSessionStartEvent(events: readonly unknown[]): Record<string, unknown> | null {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (typeof e !== 'object' || e === null) continue;
    const t = (e as Record<string, unknown>)['type'];
    if (typeof t === 'string' && SESSION_START_EVENT_TYPES.has(t)) {
      return e as Record<string, unknown>;
    }
  }
  return null;
}

export function getPlayContextFromEvents(
  events: readonly unknown[],
): 'journey' | 'free' | 'synergy' | 'calibration' | 'profile' | null {
  const start = findSessionStartEvent(events);
  const value = start?.['playContext'];
  return value === 'journey' ||
    value === 'free' ||
    value === 'synergy' ||
    value === 'calibration' ||
    value === 'profile'
    ? value
    : null;
}

export function requireJourneySnapshotFromEvents(events: readonly unknown[]): {
  stageId: number;
  journeyMeta: JourneyMeta;
} {
  const start = findSessionStartEvent(events);
  if (!start) {
    throw new Error('[SessionEventHelpers] Missing session start event');
  }
  if (start['playContext'] !== 'journey') {
    throw new Error('[SessionEventHelpers] requireJourneySnapshotFromEvents for non-journey session');
  }

  const stageId = start['journeyStageId'];
  const journeyId = start['journeyId'];
  const startLevel = start['journeyStartLevel'];
  const targetLevel = start['journeyTargetLevel'];

  if (typeof stageId !== 'number') {
    throw new Error('[SessionEventHelpers] Missing journeyStageId');
  }
  if (typeof journeyId !== 'string' || journeyId.trim().length === 0) {
    throw new Error('[SessionEventHelpers] Missing journeyId');
  }
  if (typeof startLevel !== 'number' || typeof targetLevel !== 'number') {
    throw new Error('[SessionEventHelpers] Missing journeyStartLevel/journeyTargetLevel');
  }

  const journeyGameMode =
    typeof start['journeyGameMode'] === 'string' ? start['journeyGameMode'] : undefined;
  const journeyName = typeof start['journeyName'] === 'string' ? start['journeyName'] : undefined;
  const journeyStrategyConfig =
    start['journeyStrategyConfig'] && typeof start['journeyStrategyConfig'] === 'object'
      ? (start['journeyStrategyConfig'] as JourneyMeta['strategyConfig'])
      : undefined;

  return {
    stageId,
    journeyMeta: {
      journeyId,
      startLevel,
      targetLevel,
      gameMode: journeyGameMode,
      journeyName,
      strategyConfig: journeyStrategyConfig,
    },
  };
}
