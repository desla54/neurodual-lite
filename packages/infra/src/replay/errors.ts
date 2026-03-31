/**
 * Replay Error Types
 *
 * Custom error classes for replay operations.
 * Provides detailed error messages for debugging replay issues.
 */

/**
 * Base error class for replay operations.
 */
export class ReplayError extends Error {
  public readonly code: string;
  public readonly sessionId?: string;
  public readonly cause?: Error;

  constructor(
    message: string,
    options?: {
      code?: string;
      sessionId?: string;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'ReplayError';
    this.code = options?.code ?? 'REPLAY_ERROR';
    this.sessionId = options?.sessionId;
    this.cause = options?.cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReplayError);
    }
  }
}

/**
 * Error thrown when replay data cannot be loaded for a session.
 */
export class ReplayLoadError extends ReplayError {
  constructor(
    message: string,
    options?: {
      sessionId?: string;
      cause?: Error;
    },
  ) {
    super(message, {
      code: 'REPLAY_LOAD_ERROR',
      ...options,
    });
    this.name = 'ReplayLoadError';
  }
}

/**
 * Error thrown when replay data is corrupted or invalid.
 */
export class ReplayDataError extends ReplayError {
  constructor(
    message: string,
    options?: {
      sessionId?: string;
      eventCount?: number;
      cause?: Error;
    },
  ) {
    super(message, {
      code: 'REPLAY_DATA_ERROR',
      ...options,
    });
    this.name = 'ReplayDataError';
  }
}

/**
 * Error thrown when replay projection fails.
 */
export class ReplayProjectionError extends ReplayError {
  constructor(
    message: string,
    options?: {
      sessionId?: string;
      sessionType?: string;
      cause?: Error;
    },
  ) {
    super(message, {
      code: 'REPLAY_PROJECTION_ERROR',
      ...options,
    });
    this.name = 'ReplayProjectionError';
  }
}
