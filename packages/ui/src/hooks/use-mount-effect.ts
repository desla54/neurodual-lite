import * as React from 'react';
import type { EffectCallback } from 'react';

/**
 * Explicit mount-only effect for external synchronization.
 * Prefer derived state, query hooks, and event handlers before reaching for this.
 */
export function useMountEffect(effect: EffectCallback): void {
  React.useEffect(effect, []);
}
