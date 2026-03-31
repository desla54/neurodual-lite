import type { ToneValue } from '@neurodual/logic';
import { useEffectEvent, useLayoutEffect, useRef } from 'react';

interface UseSelectionToneCueOptions {
  readonly active: boolean;
  readonly cueKey: string | null;
  readonly tone: ToneValue | null | undefined;
  readonly playTone: (tone: ToneValue) => void;
}

export function useSelectionToneCue({
  active,
  cueKey,
  tone,
  playTone,
}: UseSelectionToneCueOptions): void {
  const lastSelectionToneCueRef = useRef<string | null>(null);
  const runPlayTone = useEffectEvent(playTone);

  useLayoutEffect(() => {
    if (!active || !tone || !cueKey) {
      lastSelectionToneCueRef.current = null;
      return;
    }

    if (lastSelectionToneCueRef.current === cueKey) return;
    lastSelectionToneCueRef.current = cueKey;
    runPlayTone(tone);
  }, [active, cueKey, tone, runPlayTone]);
}
