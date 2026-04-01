import { describe, it, expect } from 'bun:test';
import { RecoveryProjector } from './recovery-projector';
import type {
  GameEvent,
  SessionStartedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
  TraceSessionStartedEvent,
  TraceStimulusShownEvent,
  PlaceSessionStartedEvent,
  PlaceStimulusShownEvent,
  DualPickSessionStartedEvent,
  DualPickStimulusShownEvent,
  MemoSessionStartedEvent,
  MemoStimulusShownEvent,
} from './events';
import { generateId } from '../domain';

describe('RecoveryProjector', () => {
  const sessionId = 'test-session-123';
  const userId = 'user-456';
  const baseTimestamp = Date.now();

  const createSessionStarted = (): SessionStartedEvent => ({
    type: 'SESSION_STARTED',
    id: generateId(),
    sessionId,
    timestamp: baseTimestamp,
    userId,
    nLevel: 2,
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: false,
    },
    context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'Europe/Paris' },
    config: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
      intervalSeconds: 3,
      // @ts-expect-error test override
      stimulusDurationMs: 500,
      generator: 'Sequence',
    },
    gameMode: 'dualnback-classic',
    trialsSeed: 'seed-123',
  });

  const createTrialPresented = (index: number): TrialPresentedEvent => ({
    type: 'TRIAL_PRESENTED',
    id: generateId(),
    sessionId,
    timestamp: baseTimestamp + index * 3000,
    trial: {
      index,
      // @ts-expect-error test override
      position: index % 9,
      sound: 'C',
      isBuffer: index < 2,
      isPositionTarget: false,
      isAudioTarget: false,
      isPositionLure: false,
      isAudioLure: false,
    },
    isiMs: 3000,
    stimulusDurationMs: 500,
  });

  const createUserResponse = (
    trialIndex: number,
    modality: 'position' | 'audio',
    // @ts-expect-error test override
  ): UserResponseEvent => ({
    type: 'USER_RESPONDED',
    id: generateId(),
    sessionId,
    timestamp: baseTimestamp + trialIndex * 3000 + 400,
    trialIndex,
    modality,
    reactionTimeMs: 400,
    pressDurationMs: 100,
    responsePhase: 'during_stimulus',
    inputMethod: 'keyboard',
  });

  it('projects recoverable state from events', () => {
    const events: GameEvent[] = [
      createSessionStarted(),
      createTrialPresented(0),
      createTrialPresented(1),
      createTrialPresented(2),
      createUserResponse(2, 'position'),
      createTrialPresented(3),
      createUserResponse(3, 'audio'),
      createTrialPresented(4),
      // Session interrupted here - no SESSION_ENDED
    ];

    const result = RecoveryProjector.project(events);

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(sessionId);
    expect(result!.userId).toBe(userId);
    expect(result!.lastTrialIndex).toBe(4);
    expect(result!.config.nLevel).toBe(2);
    expect(result!.trialHistory).toHaveLength(5);
    expect(result!.responses).toHaveLength(2);
  });

  it('returns null if session already ended', () => {
    const events: GameEvent[] = [
      createSessionStarted(),
      createTrialPresented(0),
      // @ts-expect-error test override
      {
        type: 'SESSION_ENDED',
        id: generateId(),
        sessionId,
        timestamp: baseTimestamp + 10000,
        reason: 'completed',
      },
    ];

    const result = RecoveryProjector.project(events);
    expect(result).toBeNull();
  });

  it('returns null if no SESSION_STARTED event', () => {
    const events: GameEvent[] = [createTrialPresented(0)];
    const result = RecoveryProjector.project(events);
    expect(result).toBeNull();
  });

  it('returns null for empty events array', () => {
    const result = RecoveryProjector.project([]);
    expect(result).toBeNull();
  });

  it('extracts spec and gameMode from SESSION_STARTED', () => {
    const startEvent = createSessionStarted();
    const events: GameEvent[] = [startEvent, createTrialPresented(0)];

    const result = RecoveryProjector.project(events);

    expect(result).not.toBeNull();
    expect(result!.gameMode).toBe('dualnback-classic');
    expect(result!.trialsSeed).toBe('seed-123');
  });

  it('handles session with only buffer trials', () => {
    const events: GameEvent[] = [
      createSessionStarted(),
      createTrialPresented(0), // isBuffer = true
      createTrialPresented(1), // isBuffer = true
      // Interrupted during buffer phase
    ];

    const result = RecoveryProjector.project(events);

    expect(result).not.toBeNull();
    expect(result!.lastTrialIndex).toBe(1);
    expect(result!.trialHistory).toHaveLength(2);
    expect(result!.responses).toHaveLength(0);
  });

  // ==========================================================================
  // Trace Session Tests
  // ==========================================================================

  describe('Trace sessions', () => {
    const traceSessionId = 'trace-session-789';

    // @ts-expect-error test override
    const createTraceSessionStarted = (): TraceSessionStartedEvent => ({
      type: 'TRACE_SESSION_STARTED',
      id: generateId(),
      sessionId: traceSessionId,
      timestamp: baseTimestamp,
      schemaVersion: 1,
      userId,
      config: {
        nLevel: 2,
        trialsCount: 20,
        rhythmMode: 'timed',
        stimulusDurationMs: 500,
        responseWindowMs: 2000,
      },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'Europe/Paris' },
      gameMode: 'dual-trace',
    });

    // @ts-expect-error test override
    const createTraceStimulusShown = (trialIndex: number): TraceStimulusShownEvent => ({
      type: 'TRACE_STIMULUS_SHOWN',
      id: generateId(),
      sessionId: traceSessionId,
      timestamp: baseTimestamp + trialIndex * 3000,
      schemaVersion: 1,
      trialIndex,
      position: trialIndex % 8,
      isWarmup: trialIndex < 2,
      stimulusDurationMs: 500,
    });

    it('projects recoverable state from Trace events', () => {
      const events: GameEvent[] = [
        createTraceSessionStarted(),
        createTraceStimulusShown(0),
        createTraceStimulusShown(1),
        createTraceStimulusShown(2),
        createTraceStimulusShown(3),
        // Session interrupted here - no TRACE_SESSION_ENDED
      ];

      const result = RecoveryProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(traceSessionId);
      expect(result!.userId).toBe(userId);
      expect(result!.lastTrialIndex).toBe(3);
      expect(result!.gameMode).toBe('dual-trace');
      expect(result!.config.nLevel).toBe(2);
      expect(result!.config.trialsCount).toBe(20);
    });

    it('returns null if Trace session already ended', () => {
      const events: GameEvent[] = [
        createTraceSessionStarted(),
        createTraceStimulusShown(0),
        // @ts-expect-error test override
        {
          type: 'TRACE_SESSION_ENDED',
          id: generateId(),
          sessionId: traceSessionId,
          timestamp: baseTimestamp + 10000,
          schemaVersion: 1,
          reason: 'completed',
          totalTrials: 20,
          trialsCompleted: 20,
          score: 85,
          durationMs: 60000,
        },
      ];

      const result = RecoveryProjector.project(events);
      expect(result).toBeNull();
    });

    it('returns null if no TRACE_SESSION_STARTED event', () => {
      const events: GameEvent[] = [createTraceStimulusShown(0)];
      const result = RecoveryProjector.project(events);
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Flow (Place) Session Tests
  // ==========================================================================

  describe('Flow (Place) sessions', () => {
    const flowSessionId = 'flow-session-101';

    const createFlowSessionStarted = (): PlaceSessionStartedEvent => ({
      type: 'FLOW_SESSION_STARTED',
      id: generateId(),
      sessionId: flowSessionId,
      timestamp: baseTimestamp,
      schemaVersion: 1,
      userId,
      config: {
        nLevel: 2,
        trialsCount: 15,
        stimulusDurationMs: 600,
        // @ts-expect-error test override
        responseWindowMs: 5000,
      },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'afternoon', localHour: 14, dayOfWeek: 2, timezone: 'Europe/Paris' },
      gameMode: 'dual-place',
    });

    const createFlowStimulusShown = (trialIndex: number): PlaceStimulusShownEvent => ({
      type: 'FLOW_STIMULUS_SHOWN',
      id: generateId(),
      sessionId: flowSessionId,
      timestamp: baseTimestamp + trialIndex * 4000,
      schemaVersion: 1,
      trialIndex,
      // @ts-expect-error test override
      position: trialIndex % 8,
      sound: 'C',
      stimulusDurationMs: 600,
    });

    it('projects recoverable state from Flow events', () => {
      const events: GameEvent[] = [
        createFlowSessionStarted(),
        createFlowStimulusShown(0),
        createFlowStimulusShown(1),
        createFlowStimulusShown(2),
        // Session interrupted
      ];

      const result = RecoveryProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(flowSessionId);
      expect(result!.userId).toBe(userId);
      expect(result!.lastTrialIndex).toBe(2);
      expect(result!.gameMode).toBe('dual-place');
      expect(result!.config.nLevel).toBe(2);
    });

    it('returns null if Flow session already ended', () => {
      const events: GameEvent[] = [
        createFlowSessionStarted(),
        createFlowStimulusShown(0),
        {
          type: 'FLOW_SESSION_ENDED',
          id: generateId(),
          sessionId: flowSessionId,
          timestamp: baseTimestamp + 10000,
          schemaVersion: 1,
          reason: 'completed',
          // @ts-expect-error test override
          turnsCompleted: 15,
          totalDrops: 30,
          correctDrops: 27,
          score: 90,
          durationMs: 60000,
        },
      ];

      const result = RecoveryProjector.project(events);
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // DualPick Session Tests
  // ==========================================================================

  describe('DualPick sessions', () => {
    const dualPickSessionId = 'dual-pick-session-202';

    const createDualPickSessionStarted = (): DualPickSessionStartedEvent => ({
      type: 'DUAL_PICK_SESSION_STARTED',
      id: generateId(),
      sessionId: dualPickSessionId,
      timestamp: baseTimestamp,
      schemaVersion: 1,
      userId,
      config: {
        nLevel: 2,
        trialsCount: 12,
        stimulusDurationMs: 500,
        // @ts-expect-error test override
        responseWindowMs: 4000,
      },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'evening', localHour: 18, dayOfWeek: 3, timezone: 'Europe/Paris' },
      gameMode: 'dual-pick',
    });

    const createDualPickStimulusShown = (trialIndex: number): DualPickStimulusShownEvent => ({
      type: 'DUAL_PICK_STIMULUS_SHOWN',
      id: generateId(),
      sessionId: dualPickSessionId,
      timestamp: baseTimestamp + trialIndex * 3500,
      schemaVersion: 1,
      trialIndex,
      // @ts-expect-error test override
      position: trialIndex % 8,
      // @ts-expect-error test override
      sound: 'D',
      stimulusDurationMs: 500,
    });

    it('projects recoverable state from DualPick events', () => {
      const events: GameEvent[] = [
        createDualPickSessionStarted(),
        createDualPickStimulusShown(0),
        createDualPickStimulusShown(1),
        createDualPickStimulusShown(2),
        createDualPickStimulusShown(3),
        // Session interrupted
      ];

      const result = RecoveryProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(dualPickSessionId);
      expect(result!.lastTrialIndex).toBe(3);
      expect(result!.gameMode).toBe('dual-pick');
      expect(result!.config.nLevel).toBe(2);
    });

    it('returns null if DualPick session already ended', () => {
      const events: GameEvent[] = [
        createDualPickSessionStarted(),
        createDualPickStimulusShown(0),
        {
          type: 'DUAL_PICK_SESSION_ENDED',
          id: generateId(),
          sessionId: dualPickSessionId,
          timestamp: baseTimestamp + 10000,
          schemaVersion: 1,
          reason: 'completed',
          // @ts-expect-error test override
          turnsCompleted: 12,
          totalDrops: 24,
          correctDrops: 22,
          score: 92,
          durationMs: 50000,
        },
      ];

      const result = RecoveryProjector.project(events);
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Memo Session Tests
  // ==========================================================================

  describe('Memo sessions', () => {
    const memoSessionId = 'memo-session-303';

    const createMemoSessionStarted = (): MemoSessionStartedEvent => ({
      type: 'RECALL_SESSION_STARTED',
      id: generateId(),
      sessionId: memoSessionId,
      timestamp: baseTimestamp,
      schemaVersion: 1,
      userId,
      config: {
        nLevel: 2,
        trialsCount: 10,
        // @ts-expect-error test override
        stimulusDurationMs: 600,
        responseWindowMs: 8000,
      },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 4, timezone: 'Europe/Paris' },
      gameMode: 'dual-memo',
    });

    const createMemoStimulusShown = (trialIndex: number): MemoStimulusShownEvent => ({
      type: 'RECALL_STIMULUS_SHOWN',
      id: generateId(),
      sessionId: memoSessionId,
      timestamp: baseTimestamp + trialIndex * 5000,
      schemaVersion: 1,
      trialIndex,
      // @ts-expect-error test override
      stimulusSequence: [
        { modality: 'position', value: trialIndex % 8 },
        { modality: 'audio', value: 'E' },
      ],
      stimulusDurationMs: 600,
    });

    it('projects recoverable state from Memo events', () => {
      const events: GameEvent[] = [
        createMemoSessionStarted(),
        createMemoStimulusShown(0),
        createMemoStimulusShown(1),
        createMemoStimulusShown(2),
        // Session interrupted
      ];

      const result = RecoveryProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(memoSessionId);
      expect(result!.lastTrialIndex).toBe(2);
      expect(result!.gameMode).toBe('dual-memo');
      expect(result!.config.nLevel).toBe(2);
    });

    it('returns null if Memo session already ended', () => {
      const events: GameEvent[] = [
        createMemoSessionStarted(),
        createMemoStimulusShown(0),
        {
          type: 'RECALL_SESSION_ENDED',
          id: generateId(),
          sessionId: memoSessionId,
          timestamp: baseTimestamp + 10000,
          schemaVersion: 1,
          reason: 'completed',
          totalTrials: 10,
          // @ts-expect-error test override
          trialsCompleted: 10,
          accuracy: 0.85,
          durationMs: 45000,
        },
      ];

      const result = RecoveryProjector.project(events);
      expect(result).toBeNull();
    });
  });
});
