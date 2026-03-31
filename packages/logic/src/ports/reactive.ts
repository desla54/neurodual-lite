/**
 * Reactive primitives (framework-agnostic)
 *
 * Used to expose reactive read-models from infra without coupling the UI
 * to a specific persistence/reactivity engine (PowerSync, RxJS, etc.).
 */

export type Unsubscribe = () => void;

/**
 * Minimal observable-like interface compatible with React useSyncExternalStore.
 */
export interface Subscribable<T> {
  subscribe(listener: () => void): Unsubscribe;
  getSnapshot(): T;
}

/**
 * Standard envelope for reactive read-model snapshots.
 */
export interface ReadModelSnapshot<T> {
  readonly data: T;
  readonly isPending: boolean;
  readonly error: string | null;
}
