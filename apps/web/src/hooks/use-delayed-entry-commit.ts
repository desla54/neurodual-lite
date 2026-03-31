import { useEffectEvent, useLayoutEffect } from 'react';

interface UseDelayedEntryCommitOptions<TEntry> {
  readonly entries: readonly TEntry[];
  readonly shouldCommit: boolean;
  readonly delayMs: number;
  readonly onCommit: (entry: TEntry) => void;
}

export function useDelayedEntryCommit<TEntry>({
  entries,
  shouldCommit,
  delayMs,
  onCommit,
}: UseDelayedEntryCommitOptions<TEntry>): void {
  const runCommit = useEffectEvent(onCommit);

  useLayoutEffect(() => {
    if (!shouldCommit || entries.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      for (const entry of entries) {
        runCommit(entry);
      }
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [entries, shouldCommit, delayMs, runCommit]);
}
