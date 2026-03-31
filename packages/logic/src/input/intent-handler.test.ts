/**
 * IntentHandler helper functions tests
 */

import { describe, expect, it } from 'bun:test';
import { accepted, error, ignored } from './intent-handler';

describe('IntentHandler Helpers', () => {
  describe('accepted', () => {
    it('should create an accepted result', () => {
      const result = accepted();
      expect(result.status).toBe('accepted');
    });
  });

  describe('ignored', () => {
    it('should create an ignored result with reason', () => {
      const result = ignored('session not started');
      expect(result.status).toBe('ignored');
      if (result.status === 'ignored') {
        expect(result.reason).toBe('session not started');
      }
    });

    it('should create ignored result with different reasons', () => {
      const reasons = ['wrong phase', 'already responded', 'session ended'];
      for (const reason of reasons) {
        const result = ignored(reason);
        expect(result.status).toBe('ignored');
        if (result.status === 'ignored') {
          expect(result.reason).toBe(reason);
        }
      }
    });
  });

  describe('error', () => {
    it('should create an error result with Error object', () => {
      const err = new Error('Something went wrong');
      const result = error(err);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBe(err);
        expect(result.error.message).toBe('Something went wrong');
      }
    });

    it('should preserve error stack trace', () => {
      const err = new Error('Test error');
      const result = error(err);
      if (result.status === 'error') {
        expect(result.error.stack).toBeDefined();
      }
    });
  });
});
