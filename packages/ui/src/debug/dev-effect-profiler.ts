const DEV_EFFECT_PROFILER_KEY = '__neurodual_dev_effect_profiler__';
const MAX_EFFECT_RECORDS = 40;
const SLOW_EFFECT_THRESHOLD_MS = 50;

export interface DevEffectRecord {
  readonly label: string;
  readonly kind: 'sync' | 'async';
  readonly durationMs: number;
  readonly route: string;
  readonly at: string;
}

export interface DevEffectProfilerSnapshot {
  readonly lastSlowEffect: DevEffectRecord | null;
  readonly recentEffects: readonly DevEffectRecord[];
}

type DevEffectProfilerState = {
  recentEffects: DevEffectRecord[];
  lastSlowEffect: DevEffectRecord | null;
};

function getDevEffectProfilerState(): DevEffectProfilerState {
  const root = globalThis as typeof globalThis & {
    __neurodual_dev_effect_profiler__?: DevEffectProfilerState;
  };

  if (!root[DEV_EFFECT_PROFILER_KEY]) {
    root[DEV_EFFECT_PROFILER_KEY] = {
      recentEffects: [],
      lastSlowEffect: null,
    };
  }

  return root[DEV_EFFECT_PROFILER_KEY] as DevEffectProfilerState;
}

function currentRouteForEffectProfiler(): string {
  if (typeof window === 'undefined') return 'unknown';
  return `${window.location.pathname}${window.location.search}`;
}

function recordEffect(entry: DevEffectRecord): void {
  const state = getDevEffectProfilerState();
  state.recentEffects.push(entry);
  if (state.recentEffects.length > MAX_EFFECT_RECORDS) {
    state.recentEffects.splice(0, state.recentEffects.length - MAX_EFFECT_RECORDS);
  }
  if (entry.durationMs >= SLOW_EFFECT_THRESHOLD_MS) {
    state.lastSlowEffect = entry;
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function profileDevEffectSync<T>(label: string, fn: () => T): T {
  if (!import.meta.env.DEV) return fn();
  const start = nowMs();
  const result = fn();
  const durationMs = nowMs() - start;
  recordEffect({
    label,
    kind: 'sync',
    durationMs,
    route: currentRouteForEffectProfiler(),
    at: new Date().toISOString(),
  });
  return result;
}

export async function profileDevEffectAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) return fn();
  const start = nowMs();
  try {
    return await fn();
  } finally {
    const durationMs = nowMs() - start;
    recordEffect({
      label,
      kind: 'async',
      durationMs,
      route: currentRouteForEffectProfiler(),
      at: new Date().toISOString(),
    });
  }
}

export function getDevEffectProfilerSnapshot(): DevEffectProfilerSnapshot {
  const state = getDevEffectProfilerState();
  return {
    lastSlowEffect: state.lastSlowEffect,
    recentEffects: [...state.recentEffects],
  };
}
