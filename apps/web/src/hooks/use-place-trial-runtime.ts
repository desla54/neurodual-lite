import { useLayoutEffect } from 'react';

interface UsePlaceTrialRuntimeOptions {
  readonly trialIndex: number | null | undefined;
  readonly proposals: readonly { id: string }[] | null | undefined;
  readonly placementOrderMode: string;
  readonly mirrorTimeline: boolean;
  readonly resetForNewTrial: () => void;
  readonly generateUnifiedOrder: (proposalIds: string[]) => void;
}

export function usePlaceTrialRuntime({
  trialIndex,
  proposals,
  placementOrderMode,
  mirrorTimeline,
  resetForNewTrial,
  generateUnifiedOrder,
}: UsePlaceTrialRuntimeOptions): void {
  useLayoutEffect(() => {
    resetForNewTrial();

    if (proposals && placementOrderMode !== 'free' && mirrorTimeline) {
      generateUnifiedOrder(proposals.map((proposal) => proposal.id));
    }
  }, [
    trialIndex,
    proposals,
    placementOrderMode,
    mirrorTimeline,
    resetForNewTrial,
    generateUnifiedOrder,
  ]);
}
