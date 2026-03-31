import { useSessionCompletion, useEffectiveUserId } from '@neurodual/ui';
import { useCallback, useRef, type MutableRefObject } from 'react';
import type { PlatformInfoPort } from '@neurodual/logic';
import { useCloudSyncActions } from '../components/cloud-sync-provider';
import { type CogTaskEventEmitter, buildStartEvent } from '../lib/cognitive-task-events';
import { useAppPorts, useCommandBus } from '../providers';
import { cleanupAbandonedSession } from '../services/abandoned-session-cleanup';

interface UseCognitiveTaskSessionResult {
  readonly beginSession: (
    taskType: string,
    config: Record<string, unknown>,
    playContext?: 'journey' | 'free',
  ) => void;
  readonly complete: ReturnType<typeof useSessionCompletion>['complete'];
  readonly emitterRef: MutableRefObject<CogTaskEventEmitter>;
  readonly persistence: ReturnType<typeof useAppPorts>['persistence'];
  readonly platformInfo: PlatformInfoPort;
  readonly resetSession: () => CogTaskEventEmitter;
  readonly sessionStartMsRef: MutableRefObject<number>;
}

function createEmitter(
  userId: string,
  commandBus: CogTaskEventEmitter['commandBus'],
): CogTaskEventEmitter {
  return {
    sessionId: crypto.randomUUID(),
    userId,
    seq: 0,
    events: [],
    commandBus,
  };
}

export function useCognitiveTaskSession(): UseCognitiveTaskSessionResult {
  const commandBus = useCommandBus();
  const { platformInfo, persistence } = useAppPorts();
  const userId = useEffectiveUserId();
  const { syncEventsAndProgression } = useCloudSyncActions();
  const { complete } = useSessionCompletion({ syncToCloud: syncEventsAndProgression });

  const emitterRef = useRef<CogTaskEventEmitter>(createEmitter(userId, commandBus));
  const sessionStartMsRef = useRef(0);

  emitterRef.current.userId = userId;
  emitterRef.current.commandBus = commandBus;

  const resetSession = useCallback(() => {
    const nextEmitter = createEmitter(userId, commandBus);
    emitterRef.current = nextEmitter;
    sessionStartMsRef.current = Date.now();
    return nextEmitter;
  }, [userId, commandBus]);

  const beginSession = useCallback(
    (
      taskType: string,
      config: Record<string, unknown>,
      playContext: 'journey' | 'free' = 'free',
    ) => {
      sessionStartMsRef.current = Date.now();
      buildStartEvent(emitterRef.current, taskType, platformInfo, config, playContext);
    },
    [platformInfo],
  );

  return {
    beginSession,
    complete,
    emitterRef,
    persistence,
    platformInfo,
    resetSession,
    sessionStartMsRef,
  };
}

export function useAbandonCognitiveTaskSession() {
  const { persistence } = useAppPorts();

  return useCallback(
    async (sessionId: string) => {
      await cleanupAbandonedSession(persistence, sessionId).catch(() => {});
    },
    [persistence],
  );
}
