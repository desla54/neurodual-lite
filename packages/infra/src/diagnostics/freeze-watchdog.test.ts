import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  getWatchdogContext,
  getPendingWatchdogStepContext,
  startFreezeWatchdog,
  stopFreezeWatchdog,
  withWatchdogContextAsync,
  withWatchdogStepAsync,
} from './freeze-watchdog';

function resetWatchdogState(): void {
  startFreezeWatchdog();
  stopFreezeWatchdog();
}

describe('freeze watchdog async context instrumentation', () => {
  beforeEach(() => {
    resetWatchdogState();
  });

  afterEach(() => {
    resetWatchdogState();
  });

  it('clears async context before a later macrotask resumes', async () => {
    let resumedContext: string | null = 'pending';

    const run = withWatchdogContextAsync('test.async-context', async () => {
      expect(getWatchdogContext()).toBe('test.async-context');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      resumedContext = getWatchdogContext();
    });

    await Promise.resolve();
    expect(getWatchdogContext()).toBeNull();

    await run;
    expect(resumedContext).toBeNull();
  });

  it('measures async steps without keeping their context active across awaits', async () => {
    let resumedContext: string | null = 'pending';

    const run = withWatchdogStepAsync(
      'test.async-step',
      async () => {
        expect(getWatchdogContext()).toBe('test.async-step');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        resumedContext = getWatchdogContext();
        return 42;
      },
      { warnAfterMs: 10_000 },
    );

    await Promise.resolve();
    expect(getWatchdogContext()).toBeNull();
    expect(getPendingWatchdogStepContext()).toBe('test.async-step');

    await expect(run).resolves.toBe(42);
    expect(resumedContext).toBeNull();
    expect(getPendingWatchdogStepContext()).toBeNull();
  });
});
