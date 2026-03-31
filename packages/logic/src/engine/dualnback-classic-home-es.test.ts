import { describe, expect, test } from 'bun:test';
import type { GameEvent } from './events';
import { SessionProjector } from './session-projector';
import { SessionCompletionProjector } from './session-completion-projector';
import { projectDualnbackClassicTempoWithHomeEs } from './dualnback-classic-home-es';
import { createMockEvent } from '../test-utils/test-factories';

function createDualnbackClassicEvents(sessionId: string): GameEvent[] {
  return [
    createMockEvent('SESSION_STARTED', {
      sessionId,
      timestamp: 1000,
      userId: 'local',
      nLevel: 2,
      gameMode: 'dualnback-classic',
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: false,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
      config: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 20,
        targetProbability: 0.3,
        lureProbability: 0.1,
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
        generator: 'DualnbackClassic',
      },
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 2000,
      trial: {
        index: 0,
        isBuffer: false,
        position: 0,
        sound: 'C',
        color: 'ink-black',
        image: 'diamond',
        trialType: 'Dual',
        isPositionTarget: true,
        isSoundTarget: true,
        isColorTarget: false,
        isImageTarget: false,
        isPositionLure: false,
        isSoundLure: false,
        isColorLure: false,
        isImageLure: false,
        positionLureType: undefined,
        soundLureType: undefined,
        colorLureType: undefined,
        imageLureType: undefined,
      } as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 2400,
      trialIndex: 0,
      modality: 'position',
      reactionTimeMs: 400,
      pressDurationMs: 120,
      responsePhase: 'during_stimulus',
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 2450,
      trialIndex: 0,
      modality: 'audio',
      reactionTimeMs: 450,
      pressDurationMs: 110,
      responsePhase: 'during_stimulus',
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 5000,
      trial: {
        index: 1,
        isBuffer: false,
        position: 1,
        sound: 'H',
        color: 'ink-navy',
        image: 'star',
        trialType: 'Non-Cible',
        isPositionTarget: false,
        isSoundTarget: false,
        isColorTarget: false,
        isImageTarget: false,
        isPositionLure: false,
        isSoundLure: false,
        isColorLure: false,
        isImageLure: false,
        positionLureType: undefined,
        soundLureType: undefined,
        colorLureType: undefined,
        imageLureType: undefined,
      } as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('SESSION_ENDED', {
      sessionId,
      timestamp: 9000,
      reason: 'completed',
    }),
  ];
}

function createForeignTrialEvent(sessionId: string): GameEvent {
  return createMockEvent('TRIAL_PRESENTED', {
    sessionId,
    timestamp: 6500,
    trial: {
      index: 99,
      isBuffer: false,
      position: 3,
      sound: 'K',
      color: 'ink-burgundy',
      image: 'circle',
      trialType: 'Dual',
      isPositionTarget: true,
      isSoundTarget: true,
      isColorTarget: false,
      isImageTarget: false,
      isPositionLure: false,
      isSoundLure: false,
      isColorLure: false,
      isImageLure: false,
      positionLureType: undefined,
      soundLureType: undefined,
      colorLureType: undefined,
      imageLureType: undefined,
    } as any,
    isiMs: 3000,
    stimulusDurationMs: 500,
  });
}

describe('dualnback-classic home event sourcing projector', () => {
  test('matches legacy SessionProjector on a clean dualnback-classic stream', () => {
    const sessionId = 'session-clean';
    const events = createDualnbackClassicEvents(sessionId);

    const legacySummary = SessionProjector.project(events);
    const projection = projectDualnbackClassicTempoWithHomeEs({ sessionId, events });

    expect(legacySummary).not.toBeNull();
    expect(projection).not.toBeNull();
    expect(projection?.summary).toEqual(legacySummary as any);
    expect(projection?.eventsForProjection).toHaveLength(events.length);
  });

  test('isolates projected events by sessionId', () => {
    const sessionId = 'session-main';
    const events = [
      ...createDualnbackClassicEvents(sessionId),
      createForeignTrialEvent('session-other'),
    ];

    const projection = projectDualnbackClassicTempoWithHomeEs({ sessionId, events });
    expect(projection).not.toBeNull();
    expect(projection?.eventsForProjection.every((event) => event.sessionId === sessionId)).toBe(
      true,
    );
    expect(projection?.summary.totalTrials).toBe(2);
  });

  test('SessionCompletionProjector always uses home ES path for dualnback-classic', () => {
    const sessionId = 'session-flag';
    const noisyEvents = [
      ...createDualnbackClassicEvents(sessionId),
      createForeignTrialEvent('session-other'),
    ];

    const result = SessionCompletionProjector.project({
      mode: 'tempo',
      sessionId,
      gameModeLabel: 'Dual N-Back Classic',
      events: noisyEvents,
      gameMode: 'dualnback-classic',
      activeModalities: ['position', 'audio'],
    });

    expect(result).not.toBeNull();
    expect(result?.summary.totalTrials).toBe(2);
  });

  test('SessionCompletionProjector isolates events by sessionId for other tempo modes', () => {
    const sessionId = 'session-legacy';
    const noisyEvents = [
      ...createDualnbackClassicEvents(sessionId),
      createForeignTrialEvent('session-other'),
    ];
    const legacyModeResult = SessionCompletionProjector.project({
      mode: 'tempo',
      sessionId,
      gameModeLabel: 'Dual Catch',
      events: noisyEvents,
      gameMode: 'dual-catch',
      activeModalities: ['position', 'audio'],
    });

    expect(legacyModeResult).not.toBeNull();
    expect(legacyModeResult?.summary.totalTrials).toBe(2);
  });
});
