/**
 * Reactive combinator: merge N Subscribables into a single Subscribable.
 *
 * When any source fires, the combined snapshot is recomputed by calling `combine()`
 * with the latest snapshot from every source. The combined `isPending` is true
 * while ANY source is pending; `error` is the first non-null error found.
 *
 * The combinator is lazy: it subscribes to sources on first listener and
 * unsubscribes when the last listener leaves (same lifecycle as individual stores).
 */

import type { ReadModelSnapshot, Subscribable, Unsubscribe } from './reactive';

// Helper type: extract the data type from a Subscribable<ReadModelSnapshot<T>>
type ExtractData<S> = S extends Subscribable<ReadModelSnapshot<infer U>> ? U : never;

export function combineSubscribables<
  TSources extends readonly Subscribable<ReadModelSnapshot<unknown>>[],
  TOut,
>(
  sources: TSources,
  combine: (snapshots: { [K in keyof TSources]: ExtractData<TSources[K]> }) => TOut,
): Subscribable<ReadModelSnapshot<TOut>> {
  type Listener = () => void;

  let snapshot: ReadModelSnapshot<TOut> = computeSnapshot();
  const listeners = new Set<Listener>();
  let disposers: Unsubscribe[] = [];

  function computeSnapshot(): ReadModelSnapshot<TOut> {
    let isPending = false;
    let error: string | null = null;
    const datas: unknown[] = [];

    for (const source of sources) {
      const snap = source.getSnapshot();
      datas.push(snap.data);
      if (snap.isPending) isPending = true;
      if (!error && snap.error) error = snap.error;
    }

    const combined = combine(datas as never);
    return { data: combined, isPending, error };
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
    disposers = sources.map((source) => source.subscribe(onSourceChange));
    snapshot = computeSnapshot();
  }

  function stop(): void {
    for (const dispose of disposers) dispose();
    disposers = [];
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
    getSnapshot(): ReadModelSnapshot<TOut> {
      return snapshot;
    },
  };
}
