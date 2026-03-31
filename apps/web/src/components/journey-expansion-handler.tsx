/**
 * JourneyExpansionHandler
 *
 * Handles dynamic journey expansion for BrainWorkshop mode.
 * When a player fails 3 times and goes below the startLevel,
 * this component updates the saved journey to include the new level.
 *
 * Architecture:
 * - Watches JourneyState via REACTIVE PowerSync hook (instant updates)
 * - Detects suggestedStartLevel < current startLevel
 * - Updates savedJourney in settings store
 * - Settings store auto-saves to SQLite
 */

import { useEffect, useRef } from 'react';
import { useJourneyStateWithContext, useJourneyConfig } from '@neurodual/ui';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Invisible component that handles journey expansion.
 * Mount this where journey is active (e.g., in AppContent or a journey-aware layout).
 */
export function JourneyExpansionHandler(): null {
  const { state: journeyState } = useJourneyStateWithContext();
  const config = useJourneyConfig();
  const expandJourneyStartLevel = useSettingsStore((s) => s.expandJourneyStartLevel);

  // Track the last startLevel we've processed to avoid re-triggering
  const lastProcessedRef = useRef<{ journeyId: string; startLevel: number } | null>(null);

  useEffect(() => {
    if (!journeyState) return;

    const { suggestedStartLevel } = journeyState;
    const { journeyId, startLevel } = config;

    // Check if we need to expand the journey
    if (
      suggestedStartLevel !== undefined &&
      suggestedStartLevel < startLevel &&
      suggestedStartLevel >= 1
    ) {
      // Avoid processing the same expansion multiple times
      if (
        lastProcessedRef.current?.journeyId === journeyId &&
        lastProcessedRef.current?.startLevel === suggestedStartLevel
      ) {
        return;
      }

      // Update the journey to start from the lower level
      console.log(
        `[JourneyExpansion] Expanding journey ${journeyId}: startLevel ${startLevel} → ${suggestedStartLevel}`,
      );
      expandJourneyStartLevel(journeyId, suggestedStartLevel);

      // Mark as processed
      lastProcessedRef.current = { journeyId, startLevel: suggestedStartLevel };
    }
  }, [journeyState, config, expandJourneyStartLevel]);

  return null;
}
