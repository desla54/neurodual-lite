/**
 * Journey Config - Stub for backward compatibility
 * Journey system has been removed in NeuroDual Lite.
 */

import type { JourneyConfig } from '@neurodual/logic';

export function buildJourneyConfigSnapshot(_opts: {
  journeyId: string;
  savedJourney?: { startLevel?: number; targetLevel?: number } | undefined;
  startLevel: number;
  targetLevel: number;
  legacyJourneyModeSettings?: unknown;
}): JourneyConfig {
  return {
    journeyId: _opts.journeyId,
    startLevel: _opts.startLevel,
    targetLevel: _opts.targetLevel,
  };
}
