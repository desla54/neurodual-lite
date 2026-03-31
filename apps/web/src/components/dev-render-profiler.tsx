import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';

const DEV_RENDER_PROFILER_KEY = '__neurodual_dev_render_profiler__';
const MAX_RENDER_COMMITS = 40;
const SLOW_RENDER_THRESHOLD_MS = 50;

export interface DevRenderCommitRecord {
  readonly id: string;
  readonly route: string;
  readonly phase: 'mount' | 'update' | 'nested-update';
  readonly actualDurationMs: number;
  readonly baseDurationMs: number;
  readonly startTimeMs: number;
  readonly commitTimeMs: number;
  readonly at: string;
}

export interface DevRenderProfilerSnapshot {
  readonly lastSlowCommit: DevRenderCommitRecord | null;
  readonly recentCommits: readonly DevRenderCommitRecord[];
}

type DevRenderProfilerState = {
  recentCommits: DevRenderCommitRecord[];
  lastSlowCommit: DevRenderCommitRecord | null;
};

function getDevRenderProfilerState(): DevRenderProfilerState {
  const root = globalThis as typeof globalThis & {
    __neurodual_dev_render_profiler__?: DevRenderProfilerState;
  };

  if (!root[DEV_RENDER_PROFILER_KEY]) {
    root[DEV_RENDER_PROFILER_KEY] = {
      recentCommits: [],
      lastSlowCommit: null,
    };
  }

  return root[DEV_RENDER_PROFILER_KEY] as DevRenderProfilerState;
}

function currentRouteForProfiler(): string {
  if (typeof window === 'undefined') return 'unknown';
  return `${window.location.pathname}${window.location.search}`;
}

const onRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  const entry: DevRenderCommitRecord = {
    id,
    route: currentRouteForProfiler(),
    phase,
    actualDurationMs: actualDuration,
    baseDurationMs: baseDuration,
    startTimeMs: startTime,
    commitTimeMs: commitTime,
    at: new Date().toISOString(),
  };

  const state = getDevRenderProfilerState();
  state.recentCommits = [...state.recentCommits, entry].slice(-MAX_RENDER_COMMITS);

  if (actualDuration >= SLOW_RENDER_THRESHOLD_MS) {
    state.lastSlowCommit = entry;
  }
};

export function getDevRenderProfilerSnapshot(): DevRenderProfilerSnapshot {
  const state = getDevRenderProfilerState();
  return {
    lastSlowCommit: state.lastSlowCommit,
    recentCommits: [...state.recentCommits],
  };
}

export function DevRenderProfiler({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}): ReactNode {
  if (!import.meta.env.DEV) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
