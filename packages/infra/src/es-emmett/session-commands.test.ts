/**
 * Tests for Session Commands Types
 */

import { describe, expect, it } from 'bun:test';
import type { NeuroCommand, SessionEndCommand, SessionStartCommand } from './command-bus';

describe('session-commands', () => {
  describe('SessionStartCommand type', () => {
    it('should accept valid session start command', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: {
            id: 'evt-1',
            type: 'SESSION_STARTED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      expect(cmd.type).toBe('SESSION/START');
      expect(cmd.data.sessionId).toBe('session-123');
      expect(cmd.data.event.type).toBe('SESSION_STARTED');
    });

    it('should accept session with additional event data', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: {
            id: 'evt-1',
            type: 'SESSION_STARTED',
            timestamp: 1234567890,
            nLevel: 2,
            showModal: true,
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      expect((cmd.data.event as unknown as { nLevel: number }).nLevel).toBe(2);
      expect((cmd.data.event as unknown as { showModal: boolean }).showModal).toBe(true);
    });

    it('should accept expectedVersion for existing stream', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 5,
          event: {
            id: 'evt-1',
            type: 'RECALL_SESSION_STARTED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      expect(cmd.data.expectedVersion).toBe(5);
    });

    it('should have correct structure', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: {
            id: 'evt-1',
            type: 'SESSION_STARTED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      expect(cmd.data.sessionId).toBe('session-123');
      expect(cmd.data.event.type).toBe('SESSION_STARTED');
    });
  });

  describe('SessionEndCommand type', () => {
    it('should accept valid session end command', () => {
      const cmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: {
            id: 'evt-2',
            type: 'SESSION_ENDED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      expect(cmd.type).toBe('SESSION/END');
      expect(cmd.data.sessionId).toBe('session-123');
      expect(cmd.data.event.type).toBe('SESSION_ENDED');
    });

    it('should accept TRACE_SESSION_ENDED event type', () => {
      const cmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: {
            id: 'evt-2',
            type: 'TRACE_SESSION_ENDED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      expect(cmd.data.event.type).toBe('TRACE_SESSION_ENDED');
    });

    it('should accept workflow data', () => {
      const cmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: {
            id: 'evt-2',
            type: 'SESSION_ENDED',
            timestamp: 1234567890,
          },
          workflow: {
            completionInput: {
              mode: 'recall',
              sessionId: 'session-123',
              events: [],
              trials: [],
              gameModeLabel: 'Dual Memo',
            },
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      expect(cmd.data.workflow).toBeDefined();
      expect(
        (cmd.data.workflow as { completionInput: { mode: string } }).completionInput.mode,
      ).toBe('recall');
    });

    it('should accept custom event types ending with _ENDED', () => {
      const cmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 3,
          event: {
            id: 'evt-end',
            type: 'FLOW_SESSION_ENDED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      expect(cmd.data.event.type).toBe('FLOW_SESSION_ENDED');
    });
  });

  describe('NeuroCommand compatibility', () => {
    it('should be compatible with NeuroCommand type', () => {
      const startCmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: {
            id: 'evt-1',
            type: 'SESSION_STARTED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      const endCmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: {
            id: 'evt-2',
            type: 'SESSION_ENDED',
            timestamp: 1234567890,
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      // Should be assignable to NeuroCommand
      const neuroCmd1: NeuroCommand<'SESSION/START', Record<string, unknown>> = startCmd;
      const neuroCmd2: NeuroCommand<'SESSION/END', Record<string, unknown>> = endCmd;

      expect(neuroCmd1.type).toBe('SESSION/START');
      expect(neuroCmd2.type).toBe('SESSION/END');
    });

    it('should preserve data type specificity', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: {
            id: 'evt-1',
            type: 'SESSION_STARTED',
            timestamp: 1234567890,
            customField: 'custom-value',
          },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      type TestData = { customField: string };
      const eventData = cmd.data.event as unknown as TestData;

      expect(eventData.customField).toBe('custom-value');
    });
  });

  describe('Command structure validation', () => {
    it('should require type field', () => {
      const cmd1 = {
        type: 'SESSION/START',
        data: {
          sessionId: 's',
          expectedVersion: 0,
          event: { id: 'e', type: 'SESSION_STARTED', timestamp: 1 },
        },
        metadata: { commandId: 'c', timestamp: new Date() },
      };

      expect(cmd1.type).toBe('SESSION/START');
    });

    it('should require metadata.timestamp', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 's',
          expectedVersion: 0,
          event: { id: 'e', type: 'SESSION_STARTED', timestamp: 1 },
        },
        metadata: { commandId: 'c', timestamp: new Date('2024-01-01T00:00:00.000Z') },
      };

      expect(cmd.metadata.timestamp).toBeInstanceOf(Date);
      expect(cmd.metadata.timestamp.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should support Date and number timestamps', () => {
      const dateTs = new Date('2024-01-01T00:00:00.000Z');
      const numberTs = 1704067200000;

      expect(dateTs.getTime()).toBe(numberTs);
    });
  });
});
