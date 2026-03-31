import { useLayoutEffect } from 'react';
import type { NavigateFunction } from 'react-router';

interface UseJourneyStageRedirectOptions {
  readonly shouldRedirect: boolean;
  readonly navigate: NavigateFunction;
  readonly path: string;
  readonly journeyStageId: number | undefined;
  readonly journeyId: string | null | undefined;
}

export function useJourneyStageRedirect({
  shouldRedirect,
  navigate,
  path,
  journeyStageId,
  journeyId,
}: UseJourneyStageRedirectOptions): void {
  useLayoutEffect(() => {
    if (!shouldRedirect) return;

    navigate(path, {
      replace: true,
      state: {
        playMode: 'journey',
        journeyStageId,
        journeyId,
      },
    });
  }, [shouldRedirect, navigate, path, journeyStageId, journeyId]);
}
