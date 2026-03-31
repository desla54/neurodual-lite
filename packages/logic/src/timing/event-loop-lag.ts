/**
 * Event Loop Lag Measurement
 *
 * Measures main thread congestion by tracking the delay between
 * scheduled and actual execution of setTimeout callbacks.
 *
 * This helps identify sessions with potentially unreliable timing data.
 */

const EVENT_LOOP_LAG_STATE_KEY = '__neurodual_event_loop_lag_state__';

type EventLoopLagState = {
  lastMeasuredLagMs: number | undefined;
  samplerInterval: ReturnType<typeof setInterval> | null;
};

function getEventLoopLagState(): EventLoopLagState {
  const root = globalThis as typeof globalThis & {
    __neurodual_event_loop_lag_state__?: EventLoopLagState;
  };

  if (!root[EVENT_LOOP_LAG_STATE_KEY]) {
    root[EVENT_LOOP_LAG_STATE_KEY] = {
      lastMeasuredLagMs: undefined,
      samplerInterval: null,
    };
  }

  return root[EVENT_LOOP_LAG_STATE_KEY] as EventLoopLagState;
}

/**
 * Measure event loop lag asynchronously.
 * Uses setTimeout(0) to detect main thread congestion.
 *
 * @returns Promise resolving to lag in milliseconds
 */
export function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    setTimeout(() => {
      const lag = performance.now() - start;
      resolve(lag);
    }, 0);
  });
}

/**
 * Start the background lag sampler.
 * Measures event loop lag every 500ms and stores the last value.
 *
 * Call this at app startup to have a baseline when sessions start.
 */
export function startLagSampler(): void {
  const state = getEventLoopLagState();
  if (state.samplerInterval !== null) return; // Already running

  // Initial measurement
  measureEventLoopLag().then((lag) => {
    getEventLoopLagState().lastMeasuredLagMs = lag;
  });

  // Periodic sampling
  state.samplerInterval = setInterval(() => {
    measureEventLoopLag().then((lag) => {
      getEventLoopLagState().lastMeasuredLagMs = lag;
    });
  }, 500);
}

/**
 * Stop the background lag sampler.
 * Call this when the app is shutting down.
 */
export function stopLagSampler(): void {
  const state = getEventLoopLagState();
  if (state.samplerInterval !== null) {
    clearInterval(state.samplerInterval);
    state.samplerInterval = null;
  }
}

/**
 * Get the last measured event loop lag.
 * Returns undefined if the sampler hasn't run yet.
 *
 * Use this when creating SESSION_STARTED events to capture
 * the main thread health at session start.
 */
export function getLastMeasuredLag(): number | undefined {
  return getEventLoopLagState().lastMeasuredLagMs;
}

/**
 * Check if the sampler is currently running.
 */
export function isLagSamplerRunning(): boolean {
  return getEventLoopLagState().samplerInterval !== null;
}
