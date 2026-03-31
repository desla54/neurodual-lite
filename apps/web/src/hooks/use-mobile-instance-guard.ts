import { Capacitor } from '@capacitor/core';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { logger } from '../lib';

type InstanceRole = 'disabled' | 'acquiring' | 'leader' | 'follower';

interface GuardState {
  enabled: boolean;
  role: InstanceRole;
  heartbeatAgeMs: number | null;
  hasPeerLeader: boolean;
  takeoverPending: boolean;
  lockSupported: boolean;
  storageSupported: boolean;
}

interface HeartbeatPayload {
  instanceId: string;
  ts: number;
}

export interface MobileInstanceGuardState {
  enabled: boolean;
  allowsSync: boolean;
  isLeader: boolean;
  isFollower: boolean;
  isAcquiring: boolean;
  heartbeatAgeMs: number | null;
  hasPeerLeader: boolean;
  takeoverPending: boolean;
  lockSupported: boolean;
  storageSupported: boolean;
  requestTakeover: () => void;
}

export interface MobileInstanceGuardOptions {
  /**
   * Opt-in toggle for the whole guard.
   * When false, the guard is fully disabled and never blocks sync.
   */
  enabled?: boolean;
}

const LOCK_NAME = 'neurodual:pwa:single-instance-lock:v1';
const HEARTBEAT_KEY = 'neurodual:pwa:single-instance-heartbeat:v1';
const ADVISORY_LOCK_KEY = 'neurodual:pwa:single-instance-advisory-lock:v1';
const CHANNEL_NAME = 'neurodual:pwa:single-instance-channel:v1';

const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_STALE_MS = 10000;
const TAKEOVER_RETRY_INTERVAL_MS = 1000;
const TAKEOVER_MAX_ATTEMPTS = 8;

function createInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function isMobileWebRuntime(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  const ua = navigator.userAgent ?? '';
  return /Android|iPhone|iPad|iPod|Mobile|FxiOS|CriOS/i.test(ua);
}

function isStorageSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = '__neurodual_instance_guard_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function getWebLocksApi(): {
  request: (
    name: string,
    options: { mode: 'exclusive'; ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<void>;
} | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: unknown }).locks;
  if (!locks) return null;
  const candidate = locks as {
    request?: (
      name: string,
      options: { mode: 'exclusive'; ifAvailable: boolean },
      callback: (lock: unknown) => Promise<void>,
    ) => Promise<void>;
  };
  if (typeof candidate.request !== 'function') return null;
  // Safari requires calling LockManager.request with the original LockManager as `this`.
  const request = candidate.request.bind(candidate) as (
    name: string,
    options: { mode: 'exclusive'; ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<void>;
  return { request };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort only
  }
}

function removeStorageKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best-effort only
  }
}

function readHeartbeat(): HeartbeatPayload | null {
  return readJson<HeartbeatPayload>(HEARTBEAT_KEY);
}

function peerHeartbeatInfo(
  currentInstanceId: string,
  now = Date.now(),
): { hasPeerLeader: boolean; ageMs: number | null } {
  const hb = readHeartbeat();
  if (!hb?.ts || typeof hb.ts !== 'number' || typeof hb.instanceId !== 'string') {
    return { hasPeerLeader: false, ageMs: null };
  }
  const ageMs = Math.max(0, now - hb.ts);
  const hasPeerLeader = hb.instanceId !== currentInstanceId && ageMs <= HEARTBEAT_STALE_MS;
  return { hasPeerLeader, ageMs };
}

function parseInstancePayload(
  raw: unknown,
): { requesterId?: string; ts?: number; type?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as { requesterId?: string; ts?: number; type?: string };
}

export function useMobileInstanceGuard(
  options: MobileInstanceGuardOptions = {},
): MobileInstanceGuardState {
  const optInEnabled = options.enabled ?? true;
  const runtimeEnabled = optInEnabled && isMobileWebRuntime();
  const lockSupported = runtimeEnabled && getWebLocksApi() !== null;
  const storageSupported = runtimeEnabled && isStorageSupported();
  const enabled = runtimeEnabled && (lockSupported || storageSupported);

  const [state, setState] = useState<GuardState>(() => ({
    enabled,
    role: enabled ? 'acquiring' : 'disabled',
    heartbeatAgeMs: null,
    hasPeerLeader: false,
    takeoverPending: false,
    lockSupported,
    storageSupported,
  }));

  const mountedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const instanceIdRef = useRef<string>(createInstanceId());
  const acquiringRef = useRef(false);
  const releaseRequestedRef = useRef(false);
  const lockReleaseRef = useRef<(() => void) | null>(null);
  const advisoryLockOwnedRef = useRef(false);

  const heartbeatTimerRef = useRef<number | null>(null);
  const followerPollTimerRef = useRef<number | null>(null);
  const takeoverTimerRef = useRef<number | null>(null);
  const takeoverAttemptsRef = useRef(0);
  const takeoverPendingRef = useRef(false);

  const channelRef = useRef<BroadcastChannel | null>(null);

  const updateState = useCallback((partial: Partial<GuardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearHeartbeatLoop = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearFollowerPolling = useCallback(() => {
    if (followerPollTimerRef.current !== null) {
      window.clearInterval(followerPollTimerRef.current);
      followerPollTimerRef.current = null;
    }
  }, []);

  const clearTakeoverRetry = useCallback(() => {
    if (takeoverTimerRef.current !== null) {
      window.clearInterval(takeoverTimerRef.current);
      takeoverTimerRef.current = null;
    }
    takeoverAttemptsRef.current = 0;
    takeoverPendingRef.current = false;
    updateState({ takeoverPending: false });
  }, [updateState]);

  const writeHeartbeatNow = useCallback(() => {
    const payload: HeartbeatPayload = {
      instanceId: instanceIdRef.current,
      ts: Date.now(),
    };
    writeJson(HEARTBEAT_KEY, payload);

    if (advisoryLockOwnedRef.current) {
      writeJson(ADVISORY_LOCK_KEY, payload);
    }

    channelRef.current?.postMessage({
      type: 'leader-heartbeat',
      leaderId: instanceIdRef.current,
      ts: payload.ts,
    });
  }, []);

  const startHeartbeatLoop = useCallback(() => {
    clearHeartbeatLoop();
    writeHeartbeatNow();
    heartbeatTimerRef.current = window.setInterval(() => {
      writeHeartbeatNow();
    }, HEARTBEAT_INTERVAL_MS);
  }, [clearHeartbeatLoop, writeHeartbeatNow]);

  const releaseLeadership = useCallback(
    (reason: string) => {
      clearHeartbeatLoop();
      advisoryLockOwnedRef.current = false;

      const advisory = readJson<HeartbeatPayload>(ADVISORY_LOCK_KEY);
      if (advisory?.instanceId === instanceIdRef.current) {
        removeStorageKey(ADVISORY_LOCK_KEY);
      }

      const releaseLock = lockReleaseRef.current;
      if (releaseLock) {
        lockReleaseRef.current = null;
        releaseLock();
      } else {
        releaseRequestedRef.current = true;
      }

      logger.debug('[InstanceGuard] Leadership released:', reason);
    },
    [clearHeartbeatLoop],
  );

  const tryAcquireAdvisoryLock = useCallback((): boolean => {
    const now = Date.now();
    const existing = readJson<HeartbeatPayload>(ADVISORY_LOCK_KEY);
    const stale = !existing || now - existing.ts > HEARTBEAT_STALE_MS;
    if (!stale && existing.instanceId !== instanceIdRef.current) {
      return false;
    }

    writeJson(ADVISORY_LOCK_KEY, { instanceId: instanceIdRef.current, ts: now });
    const verify = readJson<HeartbeatPayload>(ADVISORY_LOCK_KEY);
    const owned = verify?.instanceId === instanceIdRef.current;
    advisoryLockOwnedRef.current = owned;
    return owned;
  }, []);

  const startFollowerPolling = useCallback(
    (tryAcquireLeadership: (reason: string) => Promise<void>) => {
      clearFollowerPolling();
      followerPollTimerRef.current = window.setInterval(() => {
        const peer = peerHeartbeatInfo(instanceIdRef.current);
        updateState({ heartbeatAgeMs: peer.ageMs, hasPeerLeader: peer.hasPeerLeader });

        if (!peer.hasPeerLeader) {
          void tryAcquireLeadership('stale-heartbeat');
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    [clearFollowerPolling, updateState],
  );

  const tryAcquireLeadership = useCallback(
    async (reason: string) => {
      if (!enabled) return;
      if (acquiringRef.current) return;

      const peerBefore = peerHeartbeatInfo(instanceIdRef.current);
      acquiringRef.current = true;
      updateState({
        role: 'acquiring',
        heartbeatAgeMs: peerBefore.ageMs,
        hasPeerLeader: peerBefore.hasPeerLeader,
      });

      let acquired = false;
      const locksApi = getWebLocksApi();

      if (locksApi) {
        acquired = await new Promise<boolean>((resolve) => {
          let resolved = false;
          locksApi
            .request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
              if (!lock) {
                if (!resolved) {
                  resolved = true;
                  resolve(false);
                }
                return;
              }

              advisoryLockOwnedRef.current = false;

              if (!resolved) {
                resolved = true;
                resolve(true);
              }

              await new Promise<void>((release) => {
                lockReleaseRef.current = release;
                if (releaseRequestedRef.current) {
                  releaseRequestedRef.current = false;
                  release();
                }
              });
              lockReleaseRef.current = null;
            })
            .catch((error: unknown) => {
              logger.warn('[InstanceGuard] WebLock acquire failed:', error);
              if (!resolved) {
                resolved = true;
                resolve(false);
              }
            });
        });
      } else if (storageSupported) {
        acquired = tryAcquireAdvisoryLock();
      } else {
        acquired = false;
      }

      if (!mountedRef.current) return;

      if (acquired) {
        clearFollowerPolling();
        clearTakeoverRetry();
        updateState({
          role: 'leader',
          heartbeatAgeMs: 0,
          hasPeerLeader: false,
          takeoverPending: false,
        });
        startHeartbeatLoop();
        logger.debug('[InstanceGuard] Leadership acquired:', reason);
      } else {
        const peer = peerHeartbeatInfo(instanceIdRef.current);
        updateState({
          role: 'follower',
          heartbeatAgeMs: peer.ageMs,
          hasPeerLeader: peer.hasPeerLeader,
        });
        startFollowerPolling(tryAcquireLeadership);
      }

      acquiringRef.current = false;
    },
    [
      clearFollowerPolling,
      clearTakeoverRetry,
      enabled,
      startFollowerPolling,
      startHeartbeatLoop,
      storageSupported,
      tryAcquireAdvisoryLock,
      updateState,
    ],
  );

  const requestTakeover = useCallback(() => {
    if (!enabled) return;
    if (stateRef.current.role === 'leader') return;

    takeoverPendingRef.current = true;
    takeoverAttemptsRef.current = 0;
    updateState({ takeoverPending: true });

    const sendRequest = () => {
      channelRef.current?.postMessage({
        type: 'takeover-request',
        requesterId: instanceIdRef.current,
        ts: Date.now(),
      });
    };

    sendRequest();
    void tryAcquireLeadership('manual-takeover');

    if (takeoverTimerRef.current !== null) {
      window.clearInterval(takeoverTimerRef.current);
    }

    takeoverTimerRef.current = window.setInterval(() => {
      if (!takeoverPendingRef.current) {
        clearTakeoverRetry();
        return;
      }

      if (stateRef.current.role === 'leader') {
        clearTakeoverRetry();
        return;
      }

      takeoverAttemptsRef.current += 1;
      sendRequest();

      const peer = peerHeartbeatInfo(instanceIdRef.current);
      updateState({ heartbeatAgeMs: peer.ageMs, hasPeerLeader: peer.hasPeerLeader });
      if (!peer.hasPeerLeader) {
        void tryAcquireLeadership('manual-takeover-stale-heartbeat');
      }

      if (takeoverAttemptsRef.current >= TAKEOVER_MAX_ATTEMPTS) {
        clearTakeoverRetry();
      }
    }, TAKEOVER_RETRY_INTERVAL_MS);
  }, [clearTakeoverRetry, enabled, tryAcquireLeadership, updateState]);

  useLayoutEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      updateState({
        enabled: false,
        role: 'disabled',
        heartbeatAgeMs: null,
        hasPeerLeader: false,
        takeoverPending: false,
        lockSupported,
        storageSupported,
      });
      return () => {
        mountedRef.current = false;
      };
    }

    updateState({
      enabled: true,
      role: 'acquiring',
      hasPeerLeader: false,
      lockSupported,
      storageSupported,
    });

    // BroadcastChannel accelerator (best effort)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channelRef.current = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current.onmessage = (event: MessageEvent<unknown>) => {
          const payload = parseInstancePayload(event.data);
          if (!payload?.type) return;

          if (payload.type === 'leader-heartbeat' && stateRef.current.role === 'follower') {
            const peer = peerHeartbeatInfo(instanceIdRef.current);
            updateState({ heartbeatAgeMs: peer.ageMs, hasPeerLeader: peer.hasPeerLeader });
            return;
          }

          if (payload.type === 'takeover-request' && stateRef.current.role === 'leader') {
            // Hidden instance yields leadership to improve UX on Android.
            if (document.visibilityState === 'hidden') {
              releaseLeadership('takeover-request-while-hidden');
            }
          }
        };
      }
    } catch (error) {
      logger.warn('[InstanceGuard] BroadcastChannel unavailable:', error);
      channelRef.current = null;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== HEARTBEAT_KEY && event.key !== ADVISORY_LOCK_KEY) return;
      if (stateRef.current.role === 'follower' || stateRef.current.role === 'acquiring') {
        const peer = peerHeartbeatInfo(instanceIdRef.current);
        updateState({ heartbeatAgeMs: peer.ageMs, hasPeerLeader: peer.hasPeerLeader });
      }
    };

    const onPageHide = () => {
      releaseLeadership('pagehide');
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (stateRef.current.role !== 'leader') {
          void tryAcquireLeadership('visibilitychange-visible');
        }
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    void tryAcquireLeadership('init');

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);

      clearFollowerPolling();
      clearHeartbeatLoop();
      clearTakeoverRetry();
      releaseLeadership('cleanup');

      try {
        channelRef.current?.close();
      } catch {
        // Ignore
      }
      channelRef.current = null;
    };
  }, [
    clearFollowerPolling,
    clearHeartbeatLoop,
    clearTakeoverRetry,
    enabled,
    lockSupported,
    storageSupported,
    releaseLeadership,
    tryAcquireLeadership,
    updateState,
  ]);

  const isLeader = state.role === 'leader' || state.role === 'disabled';
  const isFollower = state.role === 'follower';
  const isAcquiring = state.role === 'acquiring';
  const allowsSync = isLeader || !state.hasPeerLeader;

  return {
    enabled: state.enabled,
    allowsSync,
    isLeader,
    isFollower,
    isAcquiring,
    heartbeatAgeMs: state.heartbeatAgeMs,
    hasPeerLeader: state.hasPeerLeader,
    takeoverPending: state.takeoverPending,
    lockSupported: state.lockSupported,
    storageSupported: state.storageSupported,
    requestTakeover,
  };
}
