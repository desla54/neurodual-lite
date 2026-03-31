/**
 * Deep readonly utility for Zod-inferred types.
 *
 * Goal: keep `readonly`-style contracts without hand-writing interfaces.
 * Note: implemented as distributive over unions.
 */
export type Immutable<T> = T extends unknown
  ? T extends (...args: never[]) => unknown
    ? T
    : T extends readonly [infer A, ...infer R]
      ? readonly [Immutable<A>, ...{ [K in keyof R]: Immutable<R[K]> }]
      : T extends readonly (infer U)[]
        ? readonly Immutable<U>[]
        : T extends object
          ? { readonly [K in keyof T]: Immutable<T[K]> }
          : T
  : never;
