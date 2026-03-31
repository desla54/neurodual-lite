/**
 * Tests for session-event-utils
 */

import { describe, expect, it } from 'bun:test';
import {
  findSessionStartEvent,
  getPlayContextFromEvents,
  requireJourneySnapshotFromEvents,
} from './session-event-utils';

describe('session-event-utils', () => {
  describe('findSessionStartEvent', () => {
    it('should find SESSION_STARTED event', () => {
      const events = [
        { type: 'SESSION_STARTED', playContext: 'free' },
        { type: 'TRIAL_1', data: {} },
      ];
      const result = findSessionStartEvent(events);
      expect(result).not.toBeNull();
      expect(result!['type']).toBe('SESSION_STARTED');
    });

    it('should find RECALL_SESSION_STARTED event', () => {
      const events = [{ type: 'RECALL_SESSION_STARTED', playContext: 'journey' }];
      const result = findSessionStartEvent(events);
      expect(result).not.toBeNull();
      expect(result!['type']).toBe('RECALL_SESSION_STARTED');
    });

    it('should find COGNITIVE_TASK_SESSION_STARTED event', () => {
      const events = [{ type: 'COGNITIVE_TASK_SESSION_STARTED', playContext: 'free' }];
      const result = findSessionStartEvent(events);
      expect(result).not.toBeNull();
      expect(result!['type']).toBe('COGNITIVE_TASK_SESSION_STARTED');
    });

    it('should return null when no start event exists', () => {
      const events = [
        { type: 'TRIAL_1', data: {} },
        { type: 'SESSION_ENDED', data: {} },
      ];
      expect(findSessionStartEvent(events)).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(findSessionStartEvent([])).toBeNull();
    });

    it('should skip non-object values', () => {
      const events = [null, undefined, 42, 'string', { type: 'SESSION_STARTED' }] as unknown[];
      const result = findSessionStartEvent(events);
      expect(result).not.toBeNull();
      expect(result!['type']).toBe('SESSION_STARTED');
    });

    it('should return the first start event if multiple exist', () => {
      const events = [
        { type: 'SESSION_STARTED', id: 'first' },
        { type: 'SESSION_STARTED', id: 'second' },
      ];
      const result = findSessionStartEvent(events);
      expect(result!['id']).toBe('first');
    });
  });

  describe('getPlayContextFromEvents', () => {
    it('should return journey when playContext is journey', () => {
      const events = [{ type: 'SESSION_STARTED', playContext: 'journey' }];
      expect(getPlayContextFromEvents(events)).toBe('journey');
    });

    it('should return free when playContext is free', () => {
      const events = [{ type: 'SESSION_STARTED', playContext: 'free' }];
      expect(getPlayContextFromEvents(events)).toBe('free');
    });

    it('should return synergy when playContext is synergy', () => {
      const events = [{ type: 'SESSION_STARTED', playContext: 'synergy' }];
      expect(getPlayContextFromEvents(events)).toBe('synergy');
    });

    it('should return null when playContext is missing', () => {
      const events = [{ type: 'SESSION_STARTED' }];
      expect(getPlayContextFromEvents(events)).toBeNull();
    });

    it('should return null when playContext is an unexpected value', () => {
      const events = [{ type: 'SESSION_STARTED', playContext: 'other' }];
      expect(getPlayContextFromEvents(events)).toBeNull();
    });

    it('should return null when no start event exists', () => {
      const events = [{ type: 'TRIAL_1' }];
      expect(getPlayContextFromEvents(events)).toBeNull();
    });

    it('should return null for empty events', () => {
      expect(getPlayContextFromEvents([])).toBeNull();
    });
  });

  describe('requireJourneySnapshotFromEvents', () => {
    const validJourneyStart = {
      type: 'SESSION_STARTED',
      playContext: 'journey',
      journeyStageId: 3,
      journeyId: 'journey-abc',
      journeyStartLevel: 2,
      journeyTargetLevel: 5,
    };

    it('should return stageId and journeyMeta for valid journey event', () => {
      const result = requireJourneySnapshotFromEvents([validJourneyStart]);
      expect(result.stageId).toBe(3);
      expect(result.journeyMeta.journeyId).toBe('journey-abc');
      expect(result.journeyMeta.startLevel).toBe(2);
      expect(result.journeyMeta.targetLevel).toBe(5);
    });

    it('should include optional gameMode when present', () => {
      const events = [{ ...validJourneyStart, journeyGameMode: 'nback' }];
      const result = requireJourneySnapshotFromEvents(events);
      expect(result.journeyMeta.gameMode).toBe('nback');
    });

    it('should include optional journeyName when present', () => {
      const events = [{ ...validJourneyStart, journeyName: 'My Journey' }];
      const result = requireJourneySnapshotFromEvents(events);
      expect(result.journeyMeta.journeyName).toBe('My Journey');
    });

    it('should include optional strategyConfig when present', () => {
      const config = { type: 'linear' };
      const events = [{ ...validJourneyStart, journeyStrategyConfig: config }];
      const result = requireJourneySnapshotFromEvents(events);
      expect(result.journeyMeta.strategyConfig as any).toEqual(config);
    });

    it('should omit optional fields when not present', () => {
      const result = requireJourneySnapshotFromEvents([validJourneyStart]);
      expect(result.journeyMeta.gameMode).toBeUndefined();
      expect(result.journeyMeta.journeyName).toBeUndefined();
      expect(result.journeyMeta.strategyConfig).toBeUndefined();
    });

    it('should throw when no start event exists', () => {
      expect(() => requireJourneySnapshotFromEvents([])).toThrow('Missing session start event');
    });

    it('should throw when playContext is not journey', () => {
      const events = [{ type: 'SESSION_STARTED', playContext: 'free' }];
      expect(() => requireJourneySnapshotFromEvents(events)).toThrow('non-journey session');
    });

    it('should throw when journeyStageId is missing', () => {
      const events = [
        {
          type: 'SESSION_STARTED',
          playContext: 'journey',
          journeyId: 'j1',
          journeyStartLevel: 1,
          journeyTargetLevel: 2,
        },
      ];
      expect(() => requireJourneySnapshotFromEvents(events)).toThrow('Missing journeyStageId');
    });

    it('should throw when journeyId is missing', () => {
      const events = [
        {
          type: 'SESSION_STARTED',
          playContext: 'journey',
          journeyStageId: 1,
          journeyStartLevel: 1,
          journeyTargetLevel: 2,
        },
      ];
      expect(() => requireJourneySnapshotFromEvents(events)).toThrow('Missing journeyId');
    });

    it('should throw when journeyId is empty string', () => {
      const events = [
        {
          type: 'SESSION_STARTED',
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: '  ',
          journeyStartLevel: 1,
          journeyTargetLevel: 2,
        },
      ];
      expect(() => requireJourneySnapshotFromEvents(events)).toThrow('Missing journeyId');
    });

    it('should throw when journeyStartLevel or journeyTargetLevel is missing', () => {
      const events = [
        {
          type: 'SESSION_STARTED',
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: 'j1',
        },
      ];
      expect(() => requireJourneySnapshotFromEvents(events)).toThrow(
        'Missing journeyStartLevel/journeyTargetLevel',
      );
    });
  });
});
