/**
 * GameSessionManager Tests
 *
 * Tests for the game session manager: lifecycle, singleton pattern,
 * pause/resume, platform lifecycle integration, event subscriptions.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Mock logger before importing the module under test
mock.module('../logger', () => ({
  sessionManagerLog: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import {
  GameSessionManager,
  getSessionManager,
  resetSessionManager,
  type PausableSession,
} from './game-session-manager';
import type {
  AppLifecyclePort,
  GameSessionManagerEvent,
  PlatformLifecycleSource,
} from '@neurodual/logic';

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockSession(overrides: Partial<PausableSession> = {}): PausableSession {
  return {
    sessionId: `session-${Date.now()}`,
    pause: mock(() => {}),
    resume: mock(() => {}),
    stop: mock(() => {}),
    subscribe: mock(() => () => {}),
    ...overrides,
  };
}

function createMockAppLifecycle(): AppLifecyclePort {
  return {
    getState: mock(() => 'ready' as const),
    getProgress: mock(() => null),
    getError: mock(() => null),
    isReady: mock(() => true),
    enterSession: mock(() => {}),
    exitSession: mock(() => {}),
    initialize: mock(async () => {}),
    shutdown: mock(async () => {}),
    subscribe: mock(() => () => {}),
  } as unknown as AppLifecyclePort;
}

type PlatformEventListener = (event: 'BACKGROUNDED' | 'FOREGROUNDED') => void;

function createMockPlatformLifecycle(): PlatformLifecycleSource & {
  emit: (event: 'BACKGROUNDED' | 'FOREGROUNDED') => void;
} {
  const listeners = new Set<PlatformEventListener>();
  return {
    subscribe: mock((listener: PlatformEventListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }) as any,
    emit(event: 'BACKGROUNDED' | 'FOREGROUNDED') {
      for (const l of listeners) l(event);
    },
  } as any;
}

// =============================================================================
// Tests
// =============================================================================

describe('GameSessionManager', () => {
  let manager: GameSessionManager;

  beforeEach(() => {
    resetSessionManager();
    manager = new GameSessionManager();
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(manager.getState()).toBe('idle');
    });

    it('has no active session', () => {
      expect(manager.hasActiveSession()).toBe(false);
    });

    it('getActiveSession returns null', () => {
      expect(manager.getActiveSession()).toBeNull();
    });
  });

  describe('registerSession', () => {
    it('registers a session and transitions to active', () => {
      const session = createMockSession({ sessionId: 'abc-123' });

      const info = manager.registerSession(session, 'tempo', 'dualnback-classic');

      expect(manager.hasActiveSession()).toBe(true);
      expect(manager.getState()).toBe('active');
      expect(info.sessionId).toBe('abc-123');
      expect(info.mode).toBe('tempo');
      expect(info.gameMode).toBe('dualnback-classic');
      expect(info.state).toBe('active');
    });

    it('subscribes to session updates', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      expect(session.subscribe).toHaveBeenCalledTimes(1);
    });

    it('stores journey context', () => {
      const session = createMockSession();
      const info = manager.registerSession(session, 'tempo', 'dualnback-classic', 'journey-1', 3);

      expect(info.journeyId).toBe('journey-1');
      expect(info.journeyStageId).toBe(3);
    });

    it('replaces existing session if one is active', () => {
      const session1 = createMockSession({ sessionId: 'first' });
      const session2 = createMockSession({ sessionId: 'second' });

      manager.registerSession(session1, 'tempo', 'dualnback-classic');
      manager.registerSession(session2, 'flow', 'dual-place');

      expect(manager.getActiveSession()?.sessionId).toBe('second');
      expect(session1.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('spawn', () => {
    it('creates a pending session info', async () => {
      const info = await manager.spawn({
        gameMode: 'dualnback-classic',
        userId: 'user-1',
      });

      expect(info.sessionId).toMatch(/^pending-/);
      expect(info.mode).toBe('tempo');
      expect(info.gameMode).toBe('dualnback-classic');
      expect(info.state).toBe('starting');
    });

    it('throws if a session is already active', async () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      await expect(manager.spawn({ gameMode: 'dual-place', userId: 'user-1' })).rejects.toThrow(
        /another session is already active/,
      );
    });

    it('maps game modes to correct session modes', async () => {
      const cases: Array<[string, string]> = [
        ['dualnback-classic', 'tempo'],
        ['dual-place', 'flow'],
        ['dual-memo', 'recall'],
        ['dual-pick', 'pick'],
        ['dual-trace', 'trace'],
        ['dualnback-classic', 'tempo'],
        ['custom', 'tempo'],
      ];

      for (const [gameMode, expectedMode] of cases) {
        resetSessionManager();
        const mgr = new GameSessionManager();
        const info = await mgr.spawn({
          gameMode: gameMode as import('@neurodual/logic').GameModeId,
          userId: 'user-1',
        });
        expect(info.mode).toBe(expectedMode as any);
        mgr.dispose();
      }
    });

    it('stores journey context from spawn options', async () => {
      const info = await manager.spawn({
        gameMode: 'dualnback-classic',
        userId: 'user-1',
        journeyId: 'j-1',
        journeyStageId: 5,
      });

      expect(info.journeyId).toBe('j-1');
      expect(info.journeyStageId).toBe(5);
    });
  });

  describe('pause / resume', () => {
    it('pauses an active session', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.pause('user');

      expect(manager.getState()).toBe('paused');
      expect(session.pause).toHaveBeenCalledTimes(1);
    });

    it('resumes a paused session', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.pause('user');
      manager.resume();

      expect(manager.getState()).toBe('active');
      expect(session.resume).toHaveBeenCalledTimes(1);
    });

    it('pause is no-op when no session is active', () => {
      manager.pause('user');
      expect(manager.getState()).toBe('idle');
    });

    it('resume is no-op when not paused', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.resume(); // already active, not paused
      expect(manager.getState()).toBe('active');
      expect(session.resume).not.toHaveBeenCalled();
    });

    it('pause is no-op when session has no pause method', () => {
      const session = createMockSession({ pause: undefined });
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.pause('user');
      // State remains active because session cannot be paused
      expect(manager.getState()).toBe('active');
    });
  });

  describe('stop', () => {
    it('stops an active session and returns to idle', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.stop('user');

      expect(manager.hasActiveSession()).toBe(false);
      expect(manager.getActiveSession()).toBeNull();
      expect(manager.getState()).toBe('idle');
      expect(session.stop).toHaveBeenCalledTimes(1);
    });

    it('stop is no-op when no session is active', () => {
      manager.stop('user');
      expect(manager.getState()).toBe('idle');
    });

    it('handles session.stop() throwing', () => {
      const session = createMockSession({
        stop: mock(() => {
          throw new Error('stop failed');
        }),
      });
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      // Should not throw
      manager.stop('error');

      expect(manager.hasActiveSession()).toBe(false);
      expect(manager.getState()).toBe('idle');
    });
  });

  describe('session finished detection', () => {
    it('detects session finished via phase=finished snapshot', () => {
      let snapshotListener: ((snapshot: unknown) => void) | undefined;
      const session = createMockSession({
        subscribe: mock((listener: (snapshot: unknown) => void) => {
          snapshotListener = listener;
          return () => {};
        }),
      });

      manager.registerSession(session, 'tempo', 'dualnback-classic');
      expect(snapshotListener).toBeDefined();

      // Simulate session finishing
      snapshotListener!({ phase: 'finished' });

      expect(manager.hasActiveSession()).toBe(false);
      expect(manager.getState()).toBe('idle');
    });

    it('detects session finished via value=finished snapshot', () => {
      let snapshotListener: ((snapshot: unknown) => void) | undefined;
      const session = createMockSession({
        subscribe: mock((listener: (snapshot: unknown) => void) => {
          snapshotListener = listener;
          return () => {};
        }),
      });

      manager.registerSession(session, 'tempo', 'dualnback-classic');
      snapshotListener!({ value: 'finished' });

      expect(manager.hasActiveSession()).toBe(false);
    });

    it('ignores non-finish snapshots', () => {
      let snapshotListener: ((snapshot: unknown) => void) | undefined;
      const session = createMockSession({
        subscribe: mock((listener: (snapshot: unknown) => void) => {
          snapshotListener = listener;
          return () => {};
        }),
      });

      manager.registerSession(session, 'tempo', 'dualnback-classic');
      snapshotListener!({ phase: 'playing' });

      expect(manager.hasActiveSession()).toBe(true);
      expect(manager.getState()).toBe('active');
    });
  });

  describe('event subscriptions', () => {
    it('emits SESSION_STARTED on registerSession', () => {
      const events: GameSessionManagerEvent[] = [];
      manager.subscribe((e) => events.push(e));

      const session = createMockSession({ sessionId: 'test-id' });
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      expect(events.some((e) => e.type === 'SESSION_STARTED')).toBe(true);
      const started = events.find((e) => e.type === 'SESSION_STARTED');
      expect(started).toEqual({ type: 'SESSION_STARTED', sessionId: 'test-id' });
    });

    it('emits SESSION_PAUSED on pause', () => {
      const events: GameSessionManagerEvent[] = [];
      const session = createMockSession({ sessionId: 'pause-test' });
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.subscribe((e) => events.push(e));
      manager.pause('backgrounded');

      expect(events).toEqual([
        { type: 'SESSION_PAUSED', sessionId: 'pause-test', reason: 'backgrounded' },
      ]);
    });

    it('emits SESSION_RESUMED on resume', () => {
      const events: GameSessionManagerEvent[] = [];
      const session = createMockSession({ sessionId: 'resume-test' });
      manager.registerSession(session, 'tempo', 'dualnback-classic');
      manager.pause('user');

      manager.subscribe((e) => events.push(e));
      manager.resume();

      expect(events).toEqual([{ type: 'SESSION_RESUMED', sessionId: 'resume-test' }]);
    });

    it('emits SESSION_STOPPED on stop', () => {
      const events: GameSessionManagerEvent[] = [];
      const session = createMockSession({ sessionId: 'stop-test' });
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.subscribe((e) => events.push(e));
      manager.stop('error');

      expect(events).toEqual([
        { type: 'SESSION_STOPPED', sessionId: 'stop-test', reason: 'error' },
      ]);
    });

    it('unsubscribe stops receiving events', () => {
      const events: GameSessionManagerEvent[] = [];
      const unsubscribe = manager.subscribe((e) => events.push(e));

      unsubscribe();

      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      expect(events).toHaveLength(0);
    });

    it('handles listener errors gracefully', () => {
      manager.subscribe(() => {
        throw new Error('listener boom');
      });

      const session = createMockSession();
      // Should not throw
      manager.registerSession(session, 'tempo', 'dualnback-classic');
    });
  });

  describe('AppLifecycle integration', () => {
    it('calls enterSession on registerSession', () => {
      const appLifecycle = createMockAppLifecycle();
      const mgr = new GameSessionManager({ appLifecycle });

      const session = createMockSession();
      mgr.registerSession(session, 'tempo', 'dualnback-classic');

      expect(appLifecycle.enterSession).toHaveBeenCalledTimes(1);
      mgr.dispose();
    });

    it('calls exitSession on stop', () => {
      const appLifecycle = createMockAppLifecycle();
      const mgr = new GameSessionManager({ appLifecycle });

      const session = createMockSession();
      mgr.registerSession(session, 'tempo', 'dualnback-classic');
      mgr.stop('user');

      expect(appLifecycle.exitSession).toHaveBeenCalledTimes(1);
      mgr.dispose();
    });

    it('calls enterSession on spawn', async () => {
      const appLifecycle = createMockAppLifecycle();
      const mgr = new GameSessionManager({ appLifecycle });

      await mgr.spawn({ gameMode: 'dualnback-classic', userId: 'user-1' });

      expect(appLifecycle.enterSession).toHaveBeenCalledTimes(1);
      mgr.dispose();
    });
  });

  describe('PlatformLifecycle integration', () => {
    it('pauses session on BACKGROUNDED', () => {
      const platform = createMockPlatformLifecycle();
      const mgr = new GameSessionManager({ platformLifecycle: platform });

      const session = createMockSession();
      mgr.registerSession(session, 'tempo', 'dualnback-classic');

      platform.emit('BACKGROUNDED');

      expect(mgr.getState()).toBe('paused');
      expect(session.pause).toHaveBeenCalledTimes(1);
      mgr.dispose();
    });

    it('resumes session on FOREGROUNDED after BACKGROUNDED', () => {
      const platform = createMockPlatformLifecycle();
      const mgr = new GameSessionManager({ platformLifecycle: platform });

      const session = createMockSession();
      mgr.registerSession(session, 'tempo', 'dualnback-classic');

      platform.emit('BACKGROUNDED');
      platform.emit('FOREGROUNDED');

      expect(mgr.getState()).toBe('active');
      expect(session.resume).toHaveBeenCalledTimes(1);
      mgr.dispose();
    });
  });

  describe('dispose', () => {
    it('stops active session on dispose', () => {
      const session = createMockSession();
      manager.registerSession(session, 'tempo', 'dualnback-classic');

      manager.dispose();

      expect(session.stop).toHaveBeenCalledTimes(1);
      expect(manager.hasActiveSession()).toBe(false);
    });

    it('clears listeners on dispose', () => {
      const events: GameSessionManagerEvent[] = [];
      manager.subscribe((e) => events.push(e));

      manager.dispose();

      // After dispose, no events should be emitted
      // (manager is in a broken state, but listeners are cleared)
      expect(events).toHaveLength(0);
    });

    it('unsubscribes from platform lifecycle on dispose', () => {
      const platform = createMockPlatformLifecycle();
      const mgr = new GameSessionManager({ platformLifecycle: platform });

      const session = createMockSession();
      mgr.registerSession(session, 'tempo', 'dualnback-classic');

      mgr.dispose();

      // After dispose, platform events should not affect manager
      // (This verifies unsubscribe was called)
      platform.emit('BACKGROUNDED');
      // No crash = success (session is already cleared)
    });
  });
});

describe('Singleton pattern', () => {
  beforeEach(() => {
    resetSessionManager();
  });

  it('getSessionManager returns the same instance', () => {
    const a = getSessionManager();
    const b = getSessionManager();

    expect(a).toBe(b);
  });

  it('getSessionManager uses config only on first call', () => {
    const appLifecycle = createMockAppLifecycle();
    const mgr1 = getSessionManager({ appLifecycle });
    const mgr2 = getSessionManager(); // config ignored

    expect(mgr1).toBe(mgr2);
  });

  it('resetSessionManager disposes and clears instance', () => {
    const mgr1 = getSessionManager();
    const session = createMockSession();
    mgr1.registerSession(session, 'tempo', 'dualnback-classic');

    resetSessionManager();

    expect(session.stop).toHaveBeenCalledTimes(1);

    const mgr2 = getSessionManager();
    expect(mgr2).not.toBe(mgr1);
    expect(mgr2.hasActiveSession()).toBe(false);
  });

  it('resetSessionManager is safe to call when no instance exists', () => {
    resetSessionManager();
    resetSessionManager();
    // No crash = success
  });
});
