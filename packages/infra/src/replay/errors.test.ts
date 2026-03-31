import { describe, expect, it } from 'bun:test';
import { ReplayError, ReplayLoadError, ReplayDataError, ReplayProjectionError } from './errors';

describe('replay errors', () => {
  describe('ReplayError', () => {
    it('creates error with correct message and defaults', () => {
      const error = new ReplayError('something went wrong');

      expect(error.message).toBe('something went wrong');
      expect(error.name).toBe('ReplayError');
      expect(error.code).toBe('REPLAY_ERROR');
      expect(error.sessionId).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('accepts custom code and sessionId', () => {
      const error = new ReplayError('fail', {
        code: 'CUSTOM_CODE',
        sessionId: 'sess-123',
      });

      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.sessionId).toBe('sess-123');
    });

    it('chains cause error', () => {
      const cause = new Error('root cause');
      const error = new ReplayError('wrapper', { cause });

      expect(error.cause).toBe(cause);
      expect(error.cause!.message).toBe('root cause');
    });

    it('is instanceof Error', () => {
      const error = new ReplayError('test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ReplayError);
    });

    it('is throwable and catchable', () => {
      let caught: ReplayError | null = null;
      try {
        throw new ReplayError('thrown');
      } catch (e) {
        caught = e as ReplayError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.message).toBe('thrown');
      expect(caught).toBeInstanceOf(ReplayError);
    });
  });

  describe('ReplayLoadError', () => {
    it('creates error with REPLAY_LOAD_ERROR code', () => {
      const error = new ReplayLoadError('cannot load session');

      expect(error.name).toBe('ReplayLoadError');
      expect(error.code).toBe('REPLAY_LOAD_ERROR');
      expect(error.message).toBe('cannot load session');
    });

    it('accepts sessionId', () => {
      const error = new ReplayLoadError('not found', { sessionId: 'sess-42' });

      expect(error.sessionId).toBe('sess-42');
    });

    it('chains cause', () => {
      const cause = new Error('fetch failed');
      const error = new ReplayLoadError('load error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('is instanceof ReplayError and Error', () => {
      const error = new ReplayLoadError('test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ReplayError);
      expect(error).toBeInstanceOf(ReplayLoadError);
    });
  });

  describe('ReplayDataError', () => {
    it('creates error with REPLAY_DATA_ERROR code', () => {
      const error = new ReplayDataError('corrupted data');

      expect(error.name).toBe('ReplayDataError');
      expect(error.code).toBe('REPLAY_DATA_ERROR');
      expect(error.message).toBe('corrupted data');
    });

    it('accepts sessionId and cause', () => {
      const cause = new Error('parse error');
      const error = new ReplayDataError('bad data', {
        sessionId: 'sess-99',
        cause,
      });

      expect(error.sessionId).toBe('sess-99');
      expect(error.cause).toBe(cause);
    });

    it('is instanceof ReplayError and Error', () => {
      const error = new ReplayDataError('test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ReplayError);
      expect(error).toBeInstanceOf(ReplayDataError);
    });
  });

  describe('ReplayProjectionError', () => {
    it('creates error with REPLAY_PROJECTION_ERROR code', () => {
      const error = new ReplayProjectionError('projection failed');

      expect(error.name).toBe('ReplayProjectionError');
      expect(error.code).toBe('REPLAY_PROJECTION_ERROR');
      expect(error.message).toBe('projection failed');
    });

    it('accepts sessionId and cause', () => {
      const cause = new Error('projector crash');
      const error = new ReplayProjectionError('failed', {
        sessionId: 'sess-77',
        sessionType: 'nback',
        cause,
      });

      expect(error.sessionId).toBe('sess-77');
      expect(error.cause).toBe(cause);
    });

    it('is instanceof ReplayError and Error', () => {
      const error = new ReplayProjectionError('test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ReplayError);
      expect(error).toBeInstanceOf(ReplayProjectionError);
    });
  });

  describe('cross-type discrimination', () => {
    it('ReplayLoadError is not instanceof ReplayDataError', () => {
      const error = new ReplayLoadError('test');

      expect(error).not.toBeInstanceOf(ReplayDataError);
      expect(error).not.toBeInstanceOf(ReplayProjectionError);
    });

    it('errors can be distinguished by code', () => {
      const errors = [
        new ReplayError('a'),
        new ReplayLoadError('b'),
        new ReplayDataError('c'),
        new ReplayProjectionError('d'),
      ];

      expect(errors.map((e) => e.code)).toEqual([
        'REPLAY_ERROR',
        'REPLAY_LOAD_ERROR',
        'REPLAY_DATA_ERROR',
        'REPLAY_PROJECTION_ERROR',
      ]);
    });
  });
});
