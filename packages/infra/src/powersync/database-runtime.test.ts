import { afterEach, describe, expect, it } from 'bun:test';
import {
  getPowerSyncRuntimeState,
  recordPowerSyncLifecycleSignal,
  recordPowerSyncReconnectResult,
  recordPowerSyncReconnectStart,
  samplePowerSyncRuntimeMemory,
} from './database';

type RuntimeGlobal = typeof globalThis & {
  __NEURODUAL_POWERSYNC_RUNTIME__?: unknown;
};

function resetRuntimeState(): void {
  delete (globalThis as RuntimeGlobal).__NEURODUAL_POWERSYNC_RUNTIME__;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('neurodual_powersync_runtime_v1');
    } catch {
      // ignore
    }
  }
}

describe('PowerSync runtime diagnostics', () => {
  afterEach(() => {
    resetRuntimeState();
  });

  it('tracks sleep and wake lifecycle signals', () => {
    resetRuntimeState();

    recordPowerSyncLifecycleSignal('hidden');
    recordPowerSyncLifecycleSignal('visible');
    recordPowerSyncLifecycleSignal('pageshow');
    recordPowerSyncLifecycleSignal('online');

    const state = getPowerSyncRuntimeState();
    expect(state).not.toBeNull();
    expect(state?.lifecycle.hiddenCount).toBe(1);
    expect(state?.lifecycle.visibleCount).toBe(1);
    expect(state?.lifecycle.pageshowCount).toBe(1);
    expect(state?.lifecycle.onlineCount).toBe(1);
    expect(state?.lifecycle.lastBackgroundDurationMs).not.toBeNull();
  });

  it('tracks reconnect outcomes and records a memory sample', async () => {
    resetRuntimeState();

    recordPowerSyncReconnectStart('visibilitychange');
    recordPowerSyncReconnectResult('visibilitychange', {
      ok: false,
      error: new Error('boom'),
    });
    await samplePowerSyncRuntimeMemory('test-sample', { force: true });

    const state = getPowerSyncRuntimeState();
    expect(state).not.toBeNull();
    expect(state?.reconnect.attempts).toBe(1);
    expect(state?.reconnect.failures).toBe(1);
    expect(state?.reconnect.lastReason).toBe('visibilitychange');
    expect(state?.reconnect.lastError).toContain('boom');
    expect(state?.memory?.reason).toBe('test-sample');
    expect(state?.memory?.sampledAt).toBeTruthy();
  });
});
