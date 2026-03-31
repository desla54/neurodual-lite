/**
 * Synergy Store — event-backed Zustand store for Synergy loop state.
 *
 * Tracks the current loop/step within a MOT ↔ N-Back alternation cycle and
 * rehydrates from the `synergy-loop` event stream when the command bus is ready.
 *
 * Each user gets their own stream (aggregateId = userId) so events are correctly
 * scoped per-user and compatible with RLS filtering on $.data.userId.
 */

import type { CommandBusPort, SessionEndReportModel, XPBreakdown } from '@neurodual/logic';
import { createStore } from 'zustand/vanilla';

export interface SynergyConfig {
  totalLoops: number;
  dualTrackIdentityMode:
    | 'classic'
    | 'color'
    | 'letter'
    | 'position'
    | 'image'
    | 'spatial'
    | 'digits'
    | 'emotions'
    | 'words';
  dualTrackNLevel: number;
  dualTrackTrialsCount: number;
  dualTrackTrackingDurationMs: number;
  dualTrackTrackingSpeedPxPerSec: number;
  dualTrackMotionComplexity: 'smooth' | 'standard' | 'agile';
  dualTrackCrowdingMode: 'low' | 'standard' | 'dense';
  dualTrackTotalObjects: number | null;
  /** Offset applied to auto ball count (e.g. -3 for easy, -1 for medium, 0 for hard) */
  dualTrackBallsOffset: number;
  nbackModality: 'position' | 'audio' | 'color' | 'image';
  nbackNLevel: number;
  nbackTrialsCount: number;
}

export interface SynergySessionResult {
  mode: string;
  score: number;
  nLevel: number;
  sessionId?: string;
  report?: SessionEndReportModel;
  xpBreakdown?: XPBreakdown;
}

export type SynergyPhase = 'idle' | 'running' | 'complete';

export interface SynergyState {
  phase: SynergyPhase;
  config: SynergyConfig;
  loopIndex: number;
  stepIndex: 0 | 1;
  sessionResults: SynergySessionResult[];
}

export interface SynergyActions {
  start: (config: Partial<SynergyConfig>) => void;
  completeStep: (result: SynergySessionResult) => void;
  reset: () => void;
  setConfig: (patch: Partial<SynergyConfig>) => void;
}

/** Exposed on the store (not part of event-sourced state). */
export interface SynergyMeta {
  lastPersistError: string | null;
}

type SynergyStreamEvent =
  | {
      type: 'SYNERGY_CONFIG_UPDATED';
      timestamp: number;
      patch: Partial<SynergyConfig>;
    }
  | {
      type: 'SYNERGY_LOOP_STARTED';
      timestamp: number;
      config: SynergyConfig;
    }
  | {
      type: 'SYNERGY_STEP_COMPLETED';
      timestamp: number;
      result: SynergySessionResult;
    }
  | {
      type: 'SYNERGY_LOOP_RESET';
      timestamp: number;
    };

const DEFAULT_CONFIG: SynergyConfig = {
  totalLoops: 5,
  dualTrackIdentityMode: 'classic',
  dualTrackNLevel: 2,
  dualTrackTrialsCount: 3,
  dualTrackTrackingDurationMs: 5000,
  dualTrackTrackingSpeedPxPerSec: 160,
  dualTrackMotionComplexity: 'standard',
  dualTrackCrowdingMode: 'standard',
  dualTrackTotalObjects: null,
  dualTrackBallsOffset: 0,
  nbackModality: 'position',
  nbackNLevel: 2,
  nbackTrialsCount: 10,
};

const DEFAULT_STATE: SynergyState = {
  phase: 'idle',
  config: { ...DEFAULT_CONFIG },
  loopIndex: 0,
  stepIndex: 0,
  sessionResults: [],
};

let boundCommandBus: CommandBusPort | null = null;
let boundGetUserId: (() => string) | null = null;
let persistChain = Promise.resolve();
let localMutationVersion = 0;

function getEffectiveUserId(): string {
  return boundGetUserId?.() ?? 'local';
}

function getSynergyStreamId(): { aggregateId: string; aggregateType: 'synergy-loop' } {
  return { aggregateId: getEffectiveUserId(), aggregateType: 'synergy-loop' };
}

function createCommandMetadata() {
  return {
    commandId: crypto.randomUUID(),
    timestamp: new Date(),
  };
}

function withLocalMutation(
  updater: (state: SynergyState) => SynergyState,
): (
  state: SynergyState & SynergyActions & SynergyMeta,
) => SynergyState & SynergyActions & SynergyMeta {
  return (state) => {
    localMutationVersion += 1;
    return { ...state, ...updater(state) };
  };
}

export function advanceSynergyProgress(
  state: Pick<SynergyState, 'phase' | 'config' | 'loopIndex' | 'stepIndex'>,
): Pick<SynergyState, 'phase' | 'loopIndex' | 'stepIndex'> {
  if (state.phase !== 'running') {
    return {
      phase: state.phase,
      loopIndex: state.loopIndex,
      stepIndex: state.stepIndex,
    };
  }

  if (state.stepIndex === 0) {
    return {
      phase: 'running',
      loopIndex: state.loopIndex,
      stepIndex: 1,
    };
  }

  const nextLoop = state.loopIndex + 1;
  if (nextLoop >= state.config.totalLoops) {
    return {
      phase: 'complete',
      loopIndex: nextLoop,
      stepIndex: 0,
    };
  }

  return {
    phase: 'running',
    loopIndex: nextLoop,
    stepIndex: 0,
  };
}

export function getRemainingSynergyLoops(
  state: Pick<SynergyState, 'config' | 'loopIndex' | 'stepIndex'>,
): number {
  return Math.max(0, state.config.totalLoops - state.loopIndex - (state.stepIndex === 1 ? 0.5 : 0));
}

function applySynergyEvent(state: SynergyState, event: SynergyStreamEvent): SynergyState {
  switch (event.type) {
    case 'SYNERGY_CONFIG_UPDATED':
      return {
        ...state,
        config: { ...state.config, ...event.patch },
      };
    case 'SYNERGY_LOOP_STARTED':
      return {
        phase: 'running',
        config: { ...event.config },
        loopIndex: 0,
        stepIndex: 0,
        sessionResults: [],
      };
    case 'SYNERGY_STEP_COMPLETED': {
      const nextStateWithResult: SynergyState = {
        ...state,
        phase: state.phase === 'complete' ? 'complete' : 'running',
        sessionResults: [...state.sessionResults, event.result],
      };
      const progress = advanceSynergyProgress(nextStateWithResult);
      return {
        ...nextStateWithResult,
        ...progress,
      };
    }
    case 'SYNERGY_LOOP_RESET':
      return {
        ...state,
        phase: 'idle',
        loopIndex: 0,
        stepIndex: 0,
        sessionResults: [],
      };
  }
}

export function reduceSynergyEvents(events: readonly SynergyStreamEvent[]): SynergyState {
  return events.reduce<SynergyState>(
    (state, event) => applySynergyEvent(state, event),
    DEFAULT_STATE,
  );
}

type StoredSynergyEvent = {
  readonly type?: unknown;
  readonly data?: Record<string, unknown>;
};

function toSynergyEvent(event: unknown): SynergyStreamEvent | null {
  if (!event || typeof event !== 'object') return null;
  const candidate = event as StoredSynergyEvent;
  const type = candidate.type;
  const data = candidate.data;
  if (typeof type !== 'string' || !data || typeof data !== 'object') return null;

  switch (type) {
    case 'SYNERGY_CONFIG_UPDATED':
      return {
        type,
        timestamp: typeof data['timestamp'] === 'number' ? data['timestamp'] : Date.now(),
        patch: (data['patch'] as Partial<SynergyConfig> | undefined) ?? {},
      };
    case 'SYNERGY_LOOP_STARTED':
      return {
        type,
        timestamp: typeof data['timestamp'] === 'number' ? data['timestamp'] : Date.now(),
        config: {
          ...DEFAULT_CONFIG,
          ...((data['config'] as Partial<SynergyConfig> | undefined) ?? {}),
        },
      };
    case 'SYNERGY_STEP_COMPLETED': {
      const result = data['result'];
      const r = (typeof result === 'object' && result !== null ? result : {}) as Record<
        string,
        unknown
      >;
      return {
        type,
        timestamp: typeof data['timestamp'] === 'number' ? data['timestamp'] : Date.now(),
        result: {
          mode: typeof r['mode'] === 'string' ? String(r['mode']) : 'dual-track',
          score: typeof r['score'] === 'number' ? Number(r['score']) : 0,
          nLevel: typeof r['nLevel'] === 'number' ? Number(r['nLevel']) : 1,
          sessionId: typeof r['sessionId'] === 'string' ? String(r['sessionId']) : undefined,
          report:
            typeof r['report'] === 'object' && r['report'] !== null
              ? (r['report'] as SessionEndReportModel)
              : undefined,
          xpBreakdown:
            typeof r['xpBreakdown'] === 'object' && r['xpBreakdown'] !== null
              ? (r['xpBreakdown'] as XPBreakdown)
              : undefined,
        },
      };
    }
    // Legacy event types — map to reset so old streams don't crash
    case 'SYNERGY_REPORT_OPENED':
    case 'SYNERGY_LOOP_RESUMED':
      return null; // Skip legacy events during rehydration
    case 'SYNERGY_LOOP_RESET':
      return {
        type: 'SYNERGY_LOOP_RESET',
        timestamp: typeof data['timestamp'] === 'number' ? data['timestamp'] : Date.now(),
      };
    default:
      return null;
  }
}

async function enqueuePersist(command: {
  readonly type: string;
  readonly event: SynergyStreamEvent;
}): Promise<void> {
  const commandBus = boundCommandBus;
  if (!commandBus) return;

  const userId = getEffectiveUserId();
  const streamId = getSynergyStreamId();

  persistChain = persistChain
    .then(async () => {
      await commandBus.handle({
        type: command.type,
        data: {
          loopId: streamId.aggregateId,
          event: {
            id: crypto.randomUUID(),
            type: command.event.type,
            timestamp: command.event.timestamp,
            userId,
            ...('patch' in command.event ? { patch: command.event.patch } : {}),
            ...('config' in command.event ? { config: command.event.config } : {}),
            ...('result' in command.event ? { result: command.event.result } : {}),
          },
        },
        metadata: createCommandMetadata(),
      });
      // Clear any previous error on success
      useSynergyStore.setState({ lastPersistError: null });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SynergyStore] Persist failed:', message);
      useSynergyStore.setState({ lastPersistError: message });
    });

  return persistChain;
}

export async function hydrateSynergyStore(): Promise<void> {
  const commandBus = boundCommandBus;
  if (!commandBus?.readStream) return;

  const requestMutationVersion = localMutationVersion;
  const streamId = getSynergyStreamId();
  const result = await commandBus.readStream({ streamId });
  if (requestMutationVersion !== localMutationVersion) {
    return;
  }

  const events = result.events
    .map(toSynergyEvent)
    .filter((event): event is SynergyStreamEvent => event !== null);
  useSynergyStore.setState((state) => {
    if (requestMutationVersion !== localMutationVersion) {
      return state;
    }
    return {
      ...state,
      ...reduceSynergyEvents(events),
    };
  });
}

export function bindSynergyCommandBus(
  commandBus: CommandBusPort | null,
  getUserId?: (() => string) | null,
): void {
  boundCommandBus = commandBus;
  boundGetUserId = getUserId ?? null;
}

export const useSynergyStore = createStore<SynergyState & SynergyActions & SynergyMeta>((set) => ({
  ...DEFAULT_STATE,
  lastPersistError: null,

  start: (configPatch) => {
    const config = {
      ...useSynergyStore.getState().config,
      ...configPatch,
    };
    const event: SynergyStreamEvent = {
      type: 'SYNERGY_LOOP_STARTED',
      timestamp: Date.now(),
      config,
    };
    set(withLocalMutation((state) => applySynergyEvent(state, event)));
    void enqueuePersist({ type: 'SYNERGY_LOOP/START', event });
  },

  completeStep: (result) => {
    const event: SynergyStreamEvent = {
      type: 'SYNERGY_STEP_COMPLETED',
      timestamp: Date.now(),
      result,
    };
    set(withLocalMutation((state) => applySynergyEvent(state, event)));
    void enqueuePersist({ type: 'SYNERGY_LOOP/COMPLETE_STEP', event });
  },

  reset: () => {
    const event: SynergyStreamEvent = {
      type: 'SYNERGY_LOOP_RESET',
      timestamp: Date.now(),
    };
    set(withLocalMutation((state) => applySynergyEvent(state, event)));
    void enqueuePersist({ type: 'SYNERGY_LOOP/RESET', event });
  },

  setConfig: (patch) => {
    const event: SynergyStreamEvent = {
      type: 'SYNERGY_CONFIG_UPDATED',
      timestamp: Date.now(),
      patch,
    };
    set(withLocalMutation((state) => applySynergyEvent(state, event)));
    void enqueuePersist({ type: 'SYNERGY_LOOP/CONFIGURE', event });
  },
}));

/** Derived: which game mode should play at the current step. */
export function getActiveGameMode(state: SynergyState): 'dual-track' | 'sim-brainworkshop' {
  return state.stepIndex === 0 ? 'dual-track' : 'sim-brainworkshop';
}
