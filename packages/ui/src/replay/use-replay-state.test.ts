/**
 * useReplayState Tests
 *
 * Tests for the replay state store (playback controls, seek, speed, etc.).
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { useReplayState } from './use-replay-state';
import type { ReplaySession } from '@neurodual/logic';

// Mock session for testing
function createMockReplaySession(durationMs = 60000): ReplaySession {
  return {
    sessionId: 'test-session',
    sessionType: 'tempo',
    nLevel: 2,
    createdAt: new Date(),
    events: [],
    totalDurationMs: durationMs,
    activeModalities: ['position', 'audio'],
    hasTrajectoryData: false,
    config: {
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.3,
      lureProbability: 0,
      intervalSeconds: 2.5,
      stimulusDurationSeconds: 0.5,
      generator: 'BrainWorkshop',
    },
  };
}

describe('useReplayState', () => {
  beforeEach(() => {
    // Reset state before each test
    useReplayState.getState().reset();
  });

  describe('initial state', () => {
    it('should start with idle status', () => {
      const state = useReplayState.getState();
      expect(state.status).toBe('idle');
    });

    it('should have no session initially', () => {
      const state = useReplayState.getState();
      expect(state.session).toBeNull();
    });

    it('should start at time 0', () => {
      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0);
    });

    it('should have default speed of 1', () => {
      const state = useReplayState.getState();
      expect(state.speed).toBe(1);
    });

    it('should have 0 progress initially', () => {
      const state = useReplayState.getState();
      expect(state.progress).toBe(0);
    });
  });

  describe('setSession', () => {
    it('should set session and change status to ready', () => {
      const { setSession } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);

      const state = useReplayState.getState();
      expect(state.session).toBe(session);
      expect(state.status).toBe('ready');
    });

    it('should reset time and progress when setting new session', () => {
      const { setSession, seek } = useReplayState.getState();
      const session1 = createMockReplaySession(60000);

      setSession(session1);
      seek(30000);

      const session2 = createMockReplaySession(30000);
      setSession(session2);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0);
      expect(state.progress).toBe(0);
    });
  });

  describe('play/pause', () => {
    it('should transition to playing when play() is called from ready', () => {
      const { setSession, play } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      play();

      const state = useReplayState.getState();
      expect(state.status).toBe('playing');
    });

    it('should transition to paused when pause() is called from playing', () => {
      const { setSession, play, pause } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      play();
      pause();

      const state = useReplayState.getState();
      expect(state.status).toBe('paused');
    });

    it('should transition to playing when play() is called from paused', () => {
      const { setSession, play, pause } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      play();
      pause();
      play();

      const state = useReplayState.getState();
      expect(state.status).toBe('playing');
    });

    it('should restart from beginning when play() is called from finished', () => {
      const { setSession, seek, play } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seek(60000); // Seek to end
      play(); // Should restart

      const state = useReplayState.getState();
      expect(state.status).toBe('playing');
      expect(state.currentTimeMs).toBe(0);
    });
  });

  describe('togglePlayPause', () => {
    it('should toggle from ready to playing', () => {
      const { setSession, togglePlayPause } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      togglePlayPause();

      const state = useReplayState.getState();
      expect(state.status).toBe('playing');
    });

    it('should toggle from playing to paused', () => {
      const { setSession, play, togglePlayPause } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      play();
      togglePlayPause();

      const state = useReplayState.getState();
      expect(state.status).toBe('paused');
    });

    it('should toggle from paused to playing', () => {
      const { setSession, play, pause, togglePlayPause } = useReplayState.getState();
      const session = createMockReplaySession();

      setSession(session);
      play();
      pause();
      togglePlayPause();

      const state = useReplayState.getState();
      expect(state.status).toBe('playing');
    });
  });

  describe('seek', () => {
    it('should clamp to session duration when seeking past end', () => {
      const { setSession, seek } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seek(100000); // Past the 60 second duration

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(60000);
    });

    it('should clamp to 0 when seeking negative time', () => {
      const { setSession, seek } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seek(-1000);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0);
    });

    it('should update progress correctly when seeking', () => {
      const { setSession, seek } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seek(30000); // Halfway through

      const state = useReplayState.getState();
      expect(state.progress).toBe(0.5);
    });

    it('should change status to finished when seeking to end', () => {
      const { setSession, seek } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seek(60000);

      const state = useReplayState.getState();
      expect(state.status).toBe('finished');
    });
  });

  describe('seekToProgress', () => {
    it('should seek to correct time based on progress', () => {
      const { setSession, seekToProgress } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seekToProgress(0.5);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(30000);
    });

    it('should clamp progress to 1', () => {
      const { setSession, seekToProgress } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seekToProgress(1.5);

      const state = useReplayState.getState();
      expect(state.progress).toBe(1);
      expect(state.currentTimeMs).toBe(60000);
    });

    it('should clamp progress to 0', () => {
      const { setSession, seekToProgress } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      seekToProgress(-0.5);

      const state = useReplayState.getState();
      expect(state.progress).toBe(0);
      expect(state.currentTimeMs).toBe(0);
    });
  });

  describe('setSpeed', () => {
    it('should change playback speed', () => {
      const { setSpeed } = useReplayState.getState();
      setSpeed(2);

      const state = useReplayState.getState();
      expect(state.speed).toBe(2);
    });

    it('should accept 0.5x speed', () => {
      const { setSpeed } = useReplayState.getState();
      setSpeed(0.5);

      const state = useReplayState.getState();
      expect(state.speed).toBe(0.5);
    });
  });

  describe('tick', () => {
    it('should advance time when playing', () => {
      const { setSession, play, tick } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      play();
      tick(100); // 100ms at 1x speed

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(100);
    });

    it('should respect speed multiplier', () => {
      const { setSession, play, setSpeed, tick } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      play();
      setSpeed(0.5);
      tick(100); // 100ms at 0.5x speed = 50ms actual

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(50);
    });

    it('should not advance time when not playing', () => {
      const { setSession, tick } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      tick(100);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0);
    });

    it('should transition to finished when reaching end', () => {
      const { setSession, play, tick } = useReplayState.getState();
      const session = createMockReplaySession(100);

      setSession(session);
      play();
      tick(150); // Past the 100ms duration

      const state = useReplayState.getState();
      expect(state.status).toBe('finished');
      expect(state.currentTimeMs).toBe(100);
      expect(state.progress).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const { setSession, play, seek, reset } = useReplayState.getState();
      const session = createMockReplaySession(60000);

      setSession(session);
      play();
      seek(30000);
      reset();

      const state = useReplayState.getState();
      expect(state.session).toBeNull();
      expect(state.status).toBe('idle');
      expect(state.currentTimeMs).toBe(0);
      expect(state.progress).toBe(0);
      expect(state.speed).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle zero duration session', () => {
      const { setSession, seek } = useReplayState.getState();
      const session = createMockReplaySession(0);

      setSession(session);
      seek(100);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0);
      expect(state.progress).toBe(0); // Should handle division by zero
    });

    it('should handle very small duration session', () => {
      const { setSession, play, tick } = useReplayState.getState();
      const session = createMockReplaySession(10);

      setSession(session);
      play();
      tick(100);

      const state = useReplayState.getState();
      expect(state.status).toBe('finished');
    });

    it('should handle operations without session set', () => {
      const { pause, tick, seek } = useReplayState.getState();

      // These should not throw
      pause();
      tick(100);
      seek(1000);

      const state = useReplayState.getState();
      expect(state.currentTimeMs).toBe(0); // No change without session
    });
  });
});
