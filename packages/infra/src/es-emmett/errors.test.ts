/**
 * Tests for Emmett Event Store Errors
 */

import { describe, expect, it } from 'bun:test';
import { ConcurrencyError, StreamNotFoundError, StreamAlreadyExistsError } from './errors';

describe('errors', () => {
  describe('ConcurrencyError', () => {
    it('should create error with correct properties', () => {
      const error = new ConcurrencyError('session:abc-123', 5n, 3n);

      expect(error.streamId).toBe('session:abc-123');
      expect(error.expectedVersion).toBe(5n);
      expect(error.actualVersion).toBe(3n);
      expect(error.name).toBe('ConcurrencyError');
    });

    it('should have correct error message', () => {
      const error = new ConcurrencyError('session:abc-123', 5n, 3n);

      expect(error.message).toBe(
        '[ConcurrencyError] Stream session:abc-123: expected version 5, got 3',
      );
    });

    it('should be instanceof Error', () => {
      const error = new ConcurrencyError('session:abc-123', 1n, 2n);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ConcurrencyError).toBe(true);
    });

    it('should handle large bigint versions', () => {
      const bigVersion = 9007199254740991n; // Larger than Number.MAX_SAFE_INTEGER

      const error = new ConcurrencyError('session:abc-123', bigVersion, bigVersion + 1n);

      expect(error.expectedVersion).toBe(bigVersion);
      expect(error.actualVersion).toBe(bigVersion + 1n);
    });

    it('should be throwable and catchable', () => {
      let caught = false;
      try {
        throw new ConcurrencyError('session:abc-123', 5n, 3n);
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(ConcurrencyError);
        expect((error as ConcurrencyError).streamId).toBe('session:abc-123');
      }
      expect(caught).toBe(true);
    });
  });

  describe('StreamNotFoundError', () => {
    it('should create error with streamId', () => {
      const error = new StreamNotFoundError('session:non-existent');

      expect(error.name).toBe('StreamNotFoundError');
      expect(error.message).toContain('session:non-existent');
    });

    it('should have correct error message', () => {
      const error = new StreamNotFoundError('session:abc-123');

      expect(error.message).toBe('[StreamNotFoundError] Stream session:abc-123 does not exist');
    });

    it('should be instanceof Error', () => {
      const error = new StreamNotFoundError('session:abc-123');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof StreamNotFoundError).toBe(true);
    });

    it('should be throwable and catchable', () => {
      let caught = false;
      try {
        throw new StreamNotFoundError('session:abc-123');
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(StreamNotFoundError);
        expect((error as StreamNotFoundError).message).toContain('session:abc-123');
      }
      expect(caught).toBe(true);
    });
  });

  describe('StreamAlreadyExistsError', () => {
    it('should create error with streamId', () => {
      const error = new StreamAlreadyExistsError('session:already-exists');

      expect(error.name).toBe('StreamAlreadyExistsError');
      expect(error.message).toContain('session:already-exists');
    });

    it('should have correct error message', () => {
      const error = new StreamAlreadyExistsError('session:abc-123');

      expect(error.message).toBe(
        '[StreamAlreadyExistsError] Stream session:abc-123 already exists',
      );
    });

    it('should be instanceof Error', () => {
      const error = new StreamAlreadyExistsError('session:abc-123');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof StreamAlreadyExistsError).toBe(true);
    });

    it('should be throwable and catchable', () => {
      let caught = false;
      try {
        throw new StreamAlreadyExistsError('session:abc-123');
      } catch (error) {
        caught = true;
        expect(error).toBeInstanceOf(StreamAlreadyExistsError);
        expect((error as StreamAlreadyExistsError).message).toContain('session:abc-123');
      }
      expect(caught).toBe(true);
    });
  });

  describe('Error interchangeability', () => {
    it('should be able to catch all error types as Error', () => {
      const errors = [
        new ConcurrencyError('session:abc', 1n, 2n),
        new StreamNotFoundError('session:def'),
        new StreamAlreadyExistsError('session:ghi'),
      ];

      for (const error of errors) {
        try {
          throw error;
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
        }
      }
    });

    it('should distinguish error types via instanceof', () => {
      const concurrencyError = new ConcurrencyError('session:abc', 1n, 2n);
      const notFoundError = new StreamNotFoundError('session:def');
      const existsError = new StreamAlreadyExistsError('session:ghi');

      expect(concurrencyError instanceof ConcurrencyError).toBe(true);
      expect(concurrencyError instanceof StreamNotFoundError).toBe(false);
      expect(concurrencyError instanceof StreamAlreadyExistsError).toBe(false);

      expect(notFoundError instanceof StreamNotFoundError).toBe(true);
      expect(notFoundError instanceof ConcurrencyError).toBe(false);

      expect(existsError instanceof StreamAlreadyExistsError).toBe(true);
      expect(existsError instanceof ConcurrencyError).toBe(false);
    });
  });

  describe('Error name property', () => {
    it('should have unique names for each error type', () => {
      const errors = [
        new ConcurrencyError('s', 1n, 2n),
        new StreamNotFoundError('s'),
        new StreamAlreadyExistsError('s'),
      ];

      const names = new Set(errors.map((e) => e.name));

      expect(names.size).toBe(3);
      expect(names).toContain('ConcurrencyError');
      expect(names).toContain('StreamNotFoundError');
      expect(names).toContain('StreamAlreadyExistsError');
    });
  });
});
