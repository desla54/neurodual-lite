/**
 * Stub — error types for backward compatibility.
 */

export class ConcurrencyError extends Error {
  constructor(streamId: string, expected: bigint, actual: bigint) {
    super(`Concurrency error on stream ${streamId}: expected ${expected}, got ${actual}`);
    this.name = 'ConcurrencyError';
  }
}

export class StreamNotFoundError extends Error {
  constructor(streamId: string) {
    super(`Stream not found: ${streamId}`);
    this.name = 'StreamNotFoundError';
  }
}

export class StreamAlreadyExistsError extends Error {
  constructor(streamId: string) {
    super(`Stream already exists: ${streamId}`);
    this.name = 'StreamAlreadyExistsError';
  }
}
