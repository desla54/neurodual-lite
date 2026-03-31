import { useLayoutEffect } from 'react';

interface UseJourneyActivationOptions {
  readonly journeyId: string | null | undefined;
  readonly activeJourneyId: string | null | undefined;
  readonly activateJourney: (journeyId: string) => void;
}

export function useJourneyActivation({
  journeyId,
  activeJourneyId,
  activateJourney,
}: UseJourneyActivationOptions): void {
  useLayoutEffect(() => {
    if (typeof journeyId !== 'string') return;
    if (journeyId === activeJourneyId) return;
    activateJourney(journeyId);
  }, [journeyId, activeJourneyId, activateJourney]);
}
