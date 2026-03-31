/**
 * Tests for processor-errors
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { recordProcessorError, type ProcessorEvent } from './processor-errors';

describe('processor-errors', () => {
  let executedSql: string[];
  let executedParams: unknown[][];
  let mockDb: AbstractPowerSyncDatabase;

  beforeEach(() => {
    executedSql = [];
    executedParams = [];

    mockDb = {
      execute: async (sql: string, params: unknown[] = []) => {
        executedSql.push(sql);
        executedParams.push(params);
        return { rowsAffected: 1 };
      },
    } as AbstractPowerSyncDatabase;
  });

  it('should record an Error object with message and stack', async () => {
    const error = new Error('something went wrong');
    const event: ProcessorEvent = {
      type: 'SESSION_ENDED',
      data: { sessionId: 'sess-1' },
      globalPosition: 42n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'streak',
      event,
      error,
    });

    expect(executedSql.length).toBe(1);
    expect(executedSql[0]).toContain('INSERT OR REPLACE INTO es_projection_errors');

    const params = executedParams[0];
    // id = processorName:globalPosition
    expect(params![0]!).toBe('streak:42');
    // projector_name
    expect(params![1]!).toBe('streak');
    // event_global_position
    expect(params![2]!).toBe('42');
    // event_stream_id inferred from sessionId
    expect(params![3]!).toBe('session:sess-1');
    // event_type
    expect(params![4]!).toBe('SESSION_ENDED');
    // error_message
    expect(params![5]!).toBe('something went wrong');
    // error_stack should be a string
    expect(typeof params![6]!).toBe('string');
    // failed_at is an ISO string
    expect(typeof params![7]!).toBe('string');
  });

  it('should record a string error without stack', async () => {
    const event: ProcessorEvent = {
      type: 'TRIAL_COMPLETED',
      data: { sessionId: 'sess-2' },
      globalPosition: 10n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'daily-activity',
      event,
      error: 'plain string error',
    });

    const params = executedParams[0];
    expect(params![5]!).toBe('plain string error');
    // stack should be null for non-Error
    expect(params![6]!).toBeNull();
  });

  it('should infer event_stream_id from sessionId', async () => {
    const event: ProcessorEvent = {
      type: 'SESSION_ENDED',
      data: { sessionId: 'abc-123' },
      globalPosition: 1n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'test',
      event,
      error: new Error('fail'),
    });

    expect(executedParams[0]![3]).toBe('session:abc-123');
  });

  it('should infer event_stream_id from journeyId when no sessionId', async () => {
    const event: ProcessorEvent = {
      type: 'JOURNEY_COMPLETED',
      data: { journeyId: 'j-456' },
      globalPosition: 2n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'test',
      event,
      error: new Error('fail'),
    });

    expect(executedParams[0]![3]).toBe('journey:j-456');
  });

  it('should use unknown when neither sessionId nor journeyId present', async () => {
    const event: ProcessorEvent = {
      type: 'SOME_EVENT',
      data: { foo: 'bar' },
      globalPosition: 3n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'test',
      event,
      error: new Error('fail'),
    });

    expect(executedParams[0]![3]).toBe('unknown');
  });

  it('should use defaults when event is not provided', async () => {
    await recordProcessorError(mockDb, {
      processorName: 'orphan',
      error: new Error('no event'),
    });

    const params = executedParams[0];
    // id = processorName:0
    expect(params![0]!).toBe('orphan:0');
    // event_global_position
    expect(params![2]!).toBe('0');
    // event_stream_id
    expect(params![3]!).toBe('unknown');
    // event_type
    expect(params![4]!).toBe('unknown');
  });

  it('should include retry_count COALESCE in the SQL', async () => {
    await recordProcessorError(mockDb, {
      processorName: 'test',
      error: 'err',
    });

    expect(executedSql[0]).toContain('COALESCE');
    expect(executedSql[0]).toContain('retry_count + 1');
  });

  it('should pass the same id for both INSERT and retry_count subquery', async () => {
    const event: ProcessorEvent = {
      type: 'X',
      data: {},
      globalPosition: 99n,
    };

    await recordProcessorError(mockDb, {
      processorName: 'proc',
      event,
      error: 'e',
    });

    const params = executedParams[0];
    const id = params![0]!;
    // The retry_count subquery param (index 8) should match the id
    expect(params![8]!).toBe(id);
  });
});
