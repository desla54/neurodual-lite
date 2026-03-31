import { mock, type Mock } from 'bun:test';
import type { AudioPort, ClockPort, RandomPort } from '../ports';
import type { TrialGenerator } from '../coach/trial-generator';
import type { GameSessionContext } from '../session/machine/types';

// Alias for backwards compatibility
type SessionContext = GameSessionContext;
import { RunningStatsCalculator } from '../coach/running-stats';
import type { GameEvent } from '../engine/events';
import type { Constraint, WeightedConstraint } from '../sequence/types/constraints';
import type { AlgorithmContext, TrialResult } from '../sequence/types/algorithm';
import type { AlgorithmStatePort } from '../ports/algorithm-state-port';
import type { ModeSpec } from '../specs/types';
import type { TimerPort, WaitResult } from '../timing';

export interface MockAlgorithmStatePort extends AlgorithmStatePort {
  loadState: Mock<AlgorithmStatePort['loadState']>;
  saveState: Mock<AlgorithmStatePort['saveState']>;
  clearStates: Mock<AlgorithmStatePort['clearStates']>;
}

export function createMockAlgorithmStatePort(): MockAlgorithmStatePort {
  return {
    loadState: mock(() => Promise.resolve(null)),
    saveState: mock(() => Promise.resolve()),
    clearStates: mock(() => Promise.resolve()),
  };
}

// =============================================================================
// Individual Mock Factories (Strongly Typed)
// =============================================================================

export interface MockAudioPort extends AudioPort {
  play: Mock<AudioPort['play']>;
  resume: Mock<AudioPort['resume']>;
  schedule: Mock<AudioPort['schedule']>;
  scheduleMultiple: Mock<AudioPort['scheduleMultiple']>;
  scheduleCallback: Mock<AudioPort['scheduleCallback']>;
  cancelCallback: Mock<AudioPort['cancelCallback']>;
  stopAll: Mock<AudioPort['stopAll']>;
  init: Mock<AudioPort['init']>;
  setConfig: Mock<AudioPort['setConfig']>;
  getConfig: Mock<AudioPort['getConfig']>;
  getCurrentTime: Mock<AudioPort['getCurrentTime']>;
  isReady: Mock<AudioPort['isReady']>;
  playCorrect: Mock<AudioPort['playCorrect']>;
  playIncorrect: Mock<AudioPort['playIncorrect']>;
  playClick: Mock<AudioPort['playClick']>;
  playSwipe: Mock<AudioPort['playSwipe']>;
  getVolumeLevel: Mock<AudioPort['getVolumeLevel']>;
}

export function createMockAudio(): MockAudioPort {
  let callbackId = 1;
  const scheduledCallbacks = new Map<number, ReturnType<typeof setTimeout>>();

  return {
    play: mock(() => {}),
    resume: mock(() => Promise.resolve(true)),
    schedule: mock((_sound, _delay, onSync) => onSync()),
    scheduleMultiple: mock((_sounds, _delay, onSync) => onSync()),
    scheduleCallback: mock((delayMs: number, callback: () => void) => {
      const id = callbackId++;
      const timer = setTimeout(callback, delayMs);
      scheduledCallbacks.set(id, timer);
      return id;
    }),
    cancelCallback: mock((id: number) => {
      const timer = scheduledCallbacks.get(id);
      if (timer) {
        clearTimeout(timer);
        scheduledCallbacks.delete(id);
      }
    }),
    stopAll: mock(() => {
      for (const timer of scheduledCallbacks.values()) {
        clearTimeout(timer);
      }
      scheduledCallbacks.clear();
    }),
    init: mock(() => Promise.resolve()),
    setConfig: mock(() => {}),
    getConfig: mock(() => ({ language: 'fr', voice: 'default' })),
    getCurrentTime: mock(() => Date.now() / 1000), // Returns seconds to match AudioContext convention
    isReady: mock(() => true),
    playCorrect: mock(() => {}),
    playIncorrect: mock(() => {}),
    playClick: mock(() => {}),
    playSwipe: mock(() => {}),
    getVolumeLevel: mock(() => 1),
  };
}

export interface MockClockPort extends ClockPort {
  now: Mock<ClockPort['now']>;
  dateNow: Mock<ClockPort['dateNow']>;
  advance(ms: number): void;
  set(ms: number): void;
}

export function createMockClock(): MockClockPort {
  let time = 1000;
  let dateTime = Date.now();

  return {
    now: mock(() => time),
    dateNow: mock(() => dateTime),
    advance: (ms: number) => {
      time += ms;
      dateTime += ms;
    },
    set: (ms: number) => {
      time = ms;
    },
  };
}

export interface MockRandomPort extends RandomPort {
  random: Mock<RandomPort['random']>;
  generateId: Mock<RandomPort['generateId']>;
}

export function createMockRandom(): MockRandomPort {
  let idCounter = 0;
  return {
    random: mock(() => 0.5),
    generateId: mock(() => {
      idCounter++;
      return `test-id-${idCounter}`;
    }),
  };
}

export interface MockTimerPort extends TimerPort {
  init: Mock<TimerPort['init']>;
  startTrial: Mock<TimerPort['startTrial']>;
  waitForStimulusEnd: Mock<TimerPort['waitForStimulusEnd']>;
  waitForResponseWindow: Mock<TimerPort['waitForResponseWindow']>;
  waitForFeedback: Mock<TimerPort['waitForFeedback']>;
  waitForDuration: Mock<TimerPort['waitForDuration']>;
  notifyUserAction: Mock<TimerPort['notifyUserAction']>;
  cancel: Mock<TimerPort['cancel']>;
  pause: Mock<TimerPort['pause']>;
  resume: Mock<TimerPort['resume']>;
  getCurrentTime: Mock<TimerPort['getCurrentTime']>;
  getElapsedTime: Mock<TimerPort['getElapsedTime']>;
  isPaused: Mock<TimerPort['isPaused']>;
}

export function createMockTimer(): MockTimerPort {
  const completedResult: WaitResult = { type: 'completed' };

  return {
    init: mock(() => {}),
    startTrial: mock(() => {}),
    waitForStimulusEnd: mock((_durationMs?: number) => Promise.resolve(completedResult)),
    waitForResponseWindow: mock((_remainingMs?: number) => Promise.resolve(completedResult)),
    waitForFeedback: mock(() => Promise.resolve(completedResult)),
    waitForDuration: mock((_durationMs: number) => Promise.resolve(completedResult)),
    notifyUserAction: mock(() => {}),
    cancel: mock(() => {}),
    pause: mock(() => {}),
    resume: mock(() => {}),
    getCurrentTime: mock(() => Date.now() / 1000), // Returns seconds to match AudioContext convention
    getElapsedTime: mock(() => 0),
    isPaused: mock(() => false),
  };
}

export interface MockTrialGenerator extends TrialGenerator {
  generateNext: Mock<TrialGenerator['generateNext']>;
  hasMore: Mock<TrialGenerator['hasMore']>;
  getTotalTrials: Mock<TrialGenerator['getTotalTrials']>;
  getNextIndex: Mock<TrialGenerator['getNextIndex']>;
  getGeneratedTrials: Mock<TrialGenerator['getGeneratedTrials']>;
  getGameParameters: Mock<TrialGenerator['getGameParameters']>;
  getDifficulty: Mock<TrialGenerator['getDifficulty']>;
  getLureProbability: Mock<TrialGenerator['getLureProbability']>;
  getTargetProbability: Mock<TrialGenerator['getTargetProbability']>;
  getISI: Mock<TrialGenerator['getISI']>;
  getPerformanceContext: Mock<TrialGenerator['getPerformanceContext']>;
  getZoneNumber: Mock<TrialGenerator['getZoneNumber']>;
  processFeedback: Mock<TrialGenerator['processFeedback']>;
  isAdaptive: Mock<TrialGenerator['isAdaptive']>;
  skipTo: Mock<TrialGenerator['skipTo']>;
}

export function createMockGenerator(): MockTrialGenerator {
  return {
    generateNext: mock(() => ({
      position: 1,
      sound: 'A',
      index: 0,
      timestamp: 0,
    })) as unknown as Mock<TrialGenerator['generateNext']>,
    hasMore: mock(() => true),
    getTotalTrials: mock(() => 20),
    getNextIndex: mock(() => 0),
    getGeneratedTrials: mock(() => []),
    getGameParameters: mock(() => null),
    getDifficulty: mock(() => null),
    getLureProbability: mock(() => null),
    getTargetProbability: mock(() => null),
    getISI: mock(() => null),
    getPerformanceContext: mock(() => null),
    getZoneNumber: mock(() => null),
    processFeedback: mock(() => {}),
    isAdaptive: mock(() => false),
    skipTo: mock(() => {}),
  };
}

// =============================================================================
// Context Mock Factories
// =============================================================================

/** @deprecated Legacy mock — GameSessionContext is now a data interface, not method-based. */
export interface MockSessionContext {
  audio: MockAudioPort;
  timer: MockTimerPort;
  generator: MockTrialGenerator;
  [key: string]: unknown;
}

export function createMockSessionContext(
  overrides: Partial<SessionContext> = {},
): MockSessionContext {
  const mockAudio = createMockAudio();
  const mockTimer = createMockTimer();
  const mockGenerator = createMockGenerator();
  const mockStatsCalculator = new RunningStatsCalculator(['position', 'audio'], 20);
  mockStatsCalculator.record = mock(() => {});
  mockStatsCalculator.calculate = mock(() => ({
    trialsCompleted: 0,
    trialsTotal: 20,
    byModality: new Map(),
    currentDPrime: 0,
    trend: 'stable' as const,
    estimatedFinalDPrime: 0,
  }));

  return {
    audio: mockAudio,
    timer: mockTimer,
    sessionId: 'test-session',
    generator: mockGenerator,
    statsCalculator: mockStatsCalculator,
    judge: null, // Default to null (legacy sessions)
    getTrialHistory: mock(() => []),
    computeISI: mock(() => 3000),
    computeStimulusDuration: mock(() => 2000),
    getConfig: mock(() => ({
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'] as const,
      stimulusDurationMs: 500,
      intervalMs: 3000,
      gameMode: 'dual-n-back' as const,
    })),
    getUserId: mock(() => 'test-user'),
    getCurrentTrial: mock(() => null),
    getTrialIndex: mock(() => 0),
    getTotalTrials: mock(() => 20),
    getISI: mock(() => 3000),
    getStimulusDuration: mock(() => 2000),
    getGameMode: mock(() => 'dual-n-back'),
    getJourneyStageId: mock(() => undefined),
    getJourneyId: mock(() => undefined),
    getTrialsSeed: mock(() => 'test-seed'),
    getFeedbackConfig: mock(() => ({ visualFeedback: true, audioFeedback: true })),
    getSpec: mock(() => undefined),
    setTrial: mock(() => {}),
    setTrialIndex: mock(() => {}),
    setStimulusDuration: mock(() => {}),
    setISI: mock(() => {}),
    setMessage: mock(() => {}),
    setFinalSummary: mock(() => {}),
    recordResponse: mock(() => {}),
    releaseResponse: mock(() => {}),
    getResponses: mock(() => new Map()),
    getResponse: mock(() => ({ pressed: false, rt: null, timestamp: 0, type: 'none' })),
    resetResponses: mock(() => {}),
    getActiveModalities: mock(() => ['position', 'audio']),
    getPendingInputMethod: mock(() => 'keyboard'),
    emitEvent: mock(() => {}),
    transitionTo: mock(() => {}),
    notify: mock(() => {}),
    getStimulusStartTime: mock(() => 0),
    setStimulusStartTime: mock(() => {}),
    getSessionStartTime: mock(() => 0),
    setSessionStartTime: mock(() => {}),
    getNextTrialTargetTime: mock(() => 0),
    advanceTrialTargetTime: mock(() => {}),
    adjustTargetTimeForPause: mock(() => {}),
    getPauseElapsedTime: mock(() => 0),
    setPauseElapsedTime: mock(() => {}),
    isResuming: mock(() => false),
    setResuming: mock(() => {}),
    ...overrides,
  } as unknown as MockSessionContext;
}

// =============================================================================
// Event Mock Factories
// =============================================================================

export function createMockEvent<T extends GameEvent['type']>(
  type: T,
  overrides: Partial<Extract<GameEvent, { type: T }>> = {},
): Extract<GameEvent, { type: T }> {
  const needsModeEnvelope =
    type.startsWith('RECALL_') ||
    type.startsWith('FLOW_') ||
    type.startsWith('DUAL_PICK_') ||
    type.startsWith('TRACE_') ||
    type.startsWith('TIME_') ||
    type.startsWith('MOT_');

  const needsPlayContext =
    type === 'SESSION_STARTED' ||
    type === 'SESSION_ENDED' ||
    type === 'SESSION_IMPORTED' ||
    type.endsWith('_SESSION_STARTED') ||
    type.endsWith('_SESSION_ENDED');

  const base = {
    id: 'test-event-id',
    timestamp: Date.now(),
    sessionId: 'test-session-id',
    schemaVersion: 1,
    type,
  } as unknown as Extract<GameEvent, { type: T }>;

  const withPlayContext = needsPlayContext
    ? ({ playContext: 'free' as const } as Partial<Extract<GameEvent, { type: T }>>)
    : {};

  const withModeEnvelope = needsModeEnvelope
    ? ({
        eventId: 'test-eventId',
        seq: 0,
        occurredAtMs: 0,
        monotonicMs: 0,
      } as Partial<Extract<GameEvent, { type: T }>>)
    : {};

  return { ...base, ...withPlayContext, ...withModeEnvelope, ...overrides };
}

// =============================================================================
// Sequence Mock Factories
// =============================================================================

export function createMockConstraint(overrides: Partial<Constraint> = {}): Constraint {
  return {
    id: 'mock-constraint',
    type: 'hard',
    isSatisfied: mock(() => true),
    getForbiddenIntentions: mock(
      () => new Set(),
    ) as unknown as Constraint['getForbiddenIntentions'],
    getForbiddenValues: mock(() => new Set()) as unknown as Constraint['getForbiddenValues'],
    ...overrides,
  };
}

export function createMockWeightedConstraint(
  overrides: Partial<WeightedConstraint> = {},
): WeightedConstraint {
  return {
    id: 'mock-weighted-constraint',
    type: 'soft',
    weight: 1.0,
    isSatisfied: mock(() => true),
    getForbiddenIntentions: mock(
      () => new Set(),
    ) as unknown as Constraint['getForbiddenIntentions'],
    getForbiddenValues: mock(() => new Set()) as unknown as Constraint['getForbiddenValues'],
    getSatisfactionScore: mock(() => 1),
    ...overrides,
  };
}

export function createMockAlgorithmContext(
  overrides: Partial<AlgorithmContext> = {},
): AlgorithmContext {
  return {
    trialIndex: 0,
    history: [],
    ...overrides,
  };
}

export function createMockTrialResult(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    trialIndex: 0,
    responses: {
      position: { pressed: true, wasTarget: true, result: 'hit', reactionTimeMs: 500 },
      audio: { pressed: false, wasTarget: false, result: 'correct-rejection' },
    },
    ...overrides,
  };
}

// =============================================================================
// Spec Mock Factory
// =============================================================================

/**
 * Creates a mock ModeSpec for testing.
 *
 * Use this factory when testing code that consumes ModeSpec.
 * Override specific fields as needed for your test case.
 */
export function createMockSpec(overrides: Partial<ModeSpec> = {}): ModeSpec {
  const defaultSpec: ModeSpec = {
    metadata: {
      id: 'test-mode',
      displayName: 'Test Mode',
      description: 'A test mode for unit tests',
      tags: ['test'],
      difficultyLevel: 2,
      version: '1.0.0',
      ...overrides.metadata,
    },
    sessionType: overrides.sessionType ?? 'GameSession',
    scoring: {
      strategy: 'sdt',
      passThreshold: 0.7,
      downThreshold: 0.5,
      ...overrides.scoring,
    },
    timing: {
      stimulusDurationMs: 2000,
      intervalMs: 500,
      responseWindowMs: 2000,
      feedbackDurationMs: 500,
      warmupStimulusDurationMs: 3000,
      ...overrides.timing,
    },
    generation: {
      generator: 'Sequence',
      targetProbability: 0.3,
      lureProbability: 0.1,
      sequenceMode: 'tempo',
      ...overrides.generation,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
      ...overrides.defaults,
    },
    adaptivity: {
      algorithm: 'none',
      nLevelSource: 'user',
      configurableSettings: ['nLevel', 'trialsCount'],
      ...overrides.adaptivity,
    },
    report: {
      sections: ['HERO', 'PERFORMANCE', 'SPEED'],
      display: {
        modeScoreKey: 'report.modeScore.dprime',
        modeScoreTooltipKey: 'report.modeScore.dprime.tooltip',
        speedStatKey: 'report.speed.reactionTime',
        colors: {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          accent: 'blue-500',
        },
      },
      ...overrides.report,
    },
    extensions: overrides.extensions,
  };

  return defaultSpec;
}
