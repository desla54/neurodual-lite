export const NAVIGATION_ORIGIN_KEY = '__ndReturnTo';

type NavigationStateRecord = Record<string, unknown>;

function isRecord(value: unknown): value is NavigationStateRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function attachNavigationOrigin(state: unknown, returnTo: string): unknown {
  if (isRecord(state)) {
    if (typeof state[NAVIGATION_ORIGIN_KEY] === 'string') {
      return state;
    }
    return { ...state, [NAVIGATION_ORIGIN_KEY]: returnTo };
  }

  return { [NAVIGATION_ORIGIN_KEY]: returnTo };
}

export function resolveNavigationOrigin(state: unknown, fallback = '/'): string {
  if (isRecord(state) && typeof state[NAVIGATION_ORIGIN_KEY] === 'string') {
    return state[NAVIGATION_ORIGIN_KEY] as string;
  }

  return fallback;
}
