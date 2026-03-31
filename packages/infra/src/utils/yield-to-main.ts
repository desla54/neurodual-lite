/**
 * Main-thread yielding helpers.
 *
 * Goal: avoid long-task chains in browser builds (UI freezes) while keeping
 * server/test runtimes fast (no-op when `window` is undefined).
 */

export type YieldBudgetState = { lastYieldMs: number };

export const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const yieldToMain = async (): Promise<void> => {
  // Only yield in browsers where rendering is impacted by long task chains.
  if (typeof window === 'undefined') return;

  const schedulerApi = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;

  if (typeof schedulerApi?.yield === 'function') {
    await schedulerApi.yield();
    return;
  }

  // Avoid MessageChannel here: chaining posted-message tasks can still starve timers
  // and paint long enough for the freeze watchdog to report multi-second "blocks".
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

export const yieldIfOverBudget = async (state: YieldBudgetState, budgetMs = 8): Promise<void> => {
  const t = nowMs();
  if (t - state.lastYieldMs < budgetMs) return;
  await yieldToMain();
  state.lastYieldMs = nowMs();
};
