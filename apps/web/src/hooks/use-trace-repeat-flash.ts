import { useLayoutEffect, useRef, useState } from 'react';

interface UseTraceRepeatFlashOptions {
  readonly phase: string;
  readonly position: number | null;
  readonly flashOffMs: number;
}

export function useTraceRepeatFlash({
  phase,
  position,
  flashOffMs,
}: UseTraceRepeatFlashOptions): boolean {
  const prevPositionRef = useRef<number | null>(null);
  const [flashOff, setFlashOff] = useState(false);

  useLayoutEffect(() => {
    if (phase === 'stimulus' && position !== null && prevPositionRef.current === position) {
      setFlashOff(true);
      const timer = window.setTimeout(() => setFlashOff(false), flashOffMs);
      return () => {
        clearTimeout(timer);
        setFlashOff(false);
      };
    }

    setFlashOff(false);
    prevPositionRef.current = position;
  }, [phase, position, flashOffMs]);

  return flashOff;
}
