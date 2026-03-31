import { useSyncExternalStore } from 'react';

import type { Subscribable } from '@neurodual/logic';

/**
 * Subscribe to a framework-agnostic reactive source.
 */
export function useSubscribable<T>(store: Subscribable<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
