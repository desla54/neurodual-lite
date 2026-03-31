/**
 * mapSubscribable — transform a Subscribable<ReadModelSnapshot<A>> into Subscribable<ReadModelSnapshot<B>>.
 *
 * Pure, synchronous transform applied on every snapshot change.
 * Shares the same lifecycle as the source (lazy start/stop).
 */

import type { ReadModelSnapshot, Subscribable, Unsubscribe } from './reactive';

export function mapSubscribable<A, B>(
  source: Subscribable<ReadModelSnapshot<A>>,
  fn: (a: A) => B,
): Subscribable<ReadModelSnapshot<B>> {
  type Listener = () => void;

  let snapshot: ReadModelSnapshot<B> = computeSnapshot();
  const listeners = new Set<Listener>();
  let disposer: Unsubscribe | null = null;

  function computeSnapshot(): ReadModelSnapshot<B> {
    const s = source.getSnapshot();
    return { data: fn(s.data), isPending: s.isPending, error: s.error };
  }

  function onSourceChange(): void {
    const next = computeSnapshot();
    if (
      next.isPending === snapshot.isPending &&
      next.error === snapshot.error &&
      next.data === snapshot.data
    ) {
      return;
    }
    snapshot = next;
    for (const l of listeners) l();
  }

  function start(): void {
    disposer = source.subscribe(onSourceChange);
    snapshot = computeSnapshot();
  }

  function stop(): void {
    disposer?.();
    disposer = null;
  }

  return {
    subscribe(listener: Listener): Unsubscribe {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot(): ReadModelSnapshot<B> {
      return snapshot;
    },
  };
}
