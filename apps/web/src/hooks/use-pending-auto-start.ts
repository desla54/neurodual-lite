import { useLayoutEffect, type Dispatch, type SetStateAction } from 'react';

interface UsePendingAutoStartOptions<TStartEvent> {
  readonly pendingAutoStart: boolean;
  readonly phase: string;
  readonly dispatch: (event: TStartEvent) => void;
  readonly startEvent: TStartEvent;
  readonly setPendingAutoStart: Dispatch<SetStateAction<boolean>>;
}

export function usePendingAutoStart<TStartEvent>({
  pendingAutoStart,
  phase,
  dispatch,
  startEvent,
  setPendingAutoStart,
}: UsePendingAutoStartOptions<TStartEvent>): void {
  useLayoutEffect(() => {
    if (!pendingAutoStart || phase !== 'idle') return;
    setPendingAutoStart(false);
    dispatch(startEvent);
  }, [pendingAutoStart, phase, dispatch, startEvent, setPendingAutoStart]);
}
