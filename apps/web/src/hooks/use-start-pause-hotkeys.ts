import { useMountEffect } from '@neurodual/ui';
import { useEffectEvent, type Dispatch, type SetStateAction } from 'react';

interface UseStartPauseHotkeysOptions<TStartEvent> {
  readonly phase: string | null | undefined;
  readonly isPaused: boolean;
  readonly setIsPaused: Dispatch<SetStateAction<boolean>>;
  readonly canStart: boolean;
  readonly dispatch: (event: TStartEvent) => void;
  readonly startEvent: TStartEvent;
  readonly pausePhases: readonly string[];
}

export function useStartPauseHotkeys<TStartEvent>({
  phase,
  isPaused,
  setIsPaused,
  canStart,
  dispatch,
  startEvent,
  pausePhases,
}: UseStartPauseHotkeysOptions<TStartEvent>): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (isPaused) {
        setIsPaused(false);
      } else if (phase && pausePhases.includes(phase)) {
        setIsPaused(true);
      }
      return;
    }

    if (event.key === ' ' && phase === 'idle') {
      event.preventDefault();
      if (!canStart) return;
      dispatch(startEvent);
    }
  });

  useMountEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
}
