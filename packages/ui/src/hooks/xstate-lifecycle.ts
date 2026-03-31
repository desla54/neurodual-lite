import { useLayoutEffect, useRef, useState } from 'react';

interface ActorSnapshotLike {
  readonly status: string;
  readonly context?: {
    readonly sessionEvents?: unknown;
  };
  readonly value?: unknown;
}

interface RestartableActorKey {
  readonly sessionId: string;
  readonly commandBus: unknown;
}

interface StartableActorLike<TSnapshot extends ActorSnapshotLike = ActorSnapshotLike> {
  start(): void;
  stop(): void;
  getSnapshot(): TSnapshot;
}

interface FocusAwareActorLike {
  getSnapshot(): {
    readonly value: unknown;
  };
  send(event: { type: 'FOCUS_LOST' } | { type: 'FOCUS_REGAINED'; lostDurationMs: number }): void;
}

function hasSameActorKey(a: RestartableActorKey, b: RestartableActorKey): boolean {
  return a.sessionId === b.sessionId && a.commandBus === b.commandBus;
}

export function hasSessionEventType(events: unknown, type: string): boolean {
  if (!Array.isArray(events)) return false;
  for (const event of events) {
    if (typeof event !== 'object' || event === null) continue;
    if ((event as { type?: unknown }).type === type) return true;
  }
  return false;
}

export function useRestartableActor<TActor extends StartableActorLike>({
  actorKey,
  createActor,
  debugLabel,
}: {
  readonly actorKey: RestartableActorKey;
  readonly createActor: () => TActor;
  readonly debugLabel: string;
}): TActor {
  const actorKeyRef = useRef(actorKey);
  const [actorRef, setActorRef] = useState<TActor>(() => {
    const actor = createActor();
    actor.start();
    return actor;
  });

  useLayoutEffect(() => {
    const previousKey = actorKeyRef.current;
    if (hasSameActorKey(previousKey, actorKey)) {
      return;
    }

    if (import.meta.env.DEV) {
      console.log(`[${debugLabel}] Input key changed, recreating actor`, {
        prev: previousKey,
        next: actorKey,
      });
    }

    actorRef.stop();

    const nextActor = createActor();
    nextActor.start();
    setActorRef(nextActor);
    actorKeyRef.current = actorKey;
  }, [actorKey, actorRef, createActor, debugLabel]);

  return actorRef;
}

export function useActorUnmount<TActor>({
  actorRef,
  finalizeActor,
}: {
  readonly actorRef: TActor;
  readonly finalizeActor: (actorRef: TActor) => void;
}): void {
  useLayoutEffect(() => {
    return () => {
      finalizeActor(actorRef);
    };
  }, [actorRef, finalizeActor]);
}

export function useActorPageCloseFinalizer<TActor extends { getSnapshot(): ActorSnapshotLike }>({
  actorRef,
  endedEventType,
  finalizeActor,
  startedEventType,
}: {
  readonly actorRef: TActor;
  readonly endedEventType: string;
  readonly finalizeActor: (actorRef: TActor) => void;
  readonly startedEventType: string;
}): void {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let didFinalize = false;

    const finalizeIfStarted = () => {
      if (didFinalize) return;

      const snapshot = actorRef.getSnapshot();
      if (snapshot.status === 'done') return;

      const events = snapshot.context?.sessionEvents;
      if (!hasSessionEventType(events, startedEventType)) return;
      if (hasSessionEventType(events, endedEventType)) return;

      didFinalize = true;
      finalizeActor(actorRef);
    };

    window.addEventListener('pagehide', finalizeIfStarted);
    window.addEventListener('beforeunload', finalizeIfStarted);
    return () => {
      window.removeEventListener('pagehide', finalizeIfStarted);
      window.removeEventListener('beforeunload', finalizeIfStarted);
    };
  }, [actorRef, endedEventType, finalizeActor, startedEventType]);
}

export function useActorVisibilityPause<TActor extends FocusAwareActorLike>(
  actorRef: TActor,
): void {
  useLayoutEffect(() => {
    const hiddenAtRef = { current: null as number | null };

    const handleVisibilityChange = () => {
      const state = actorRef.getSnapshot();

      if (document.hidden) {
        const value = state.value;
        const isActive = typeof value === 'object' && value !== null && 'active' in value;
        if (isActive) {
          hiddenAtRef.current = Date.now();
          actorRef.send({ type: 'FOCUS_LOST' });
        } else {
          hiddenAtRef.current = null;
        }
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (state.value === 'paused' && hiddenAt !== null) {
        const lostDurationMs = Math.max(0, Date.now() - hiddenAt);
        actorRef.send({ type: 'FOCUS_REGAINED', lostDurationMs });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [actorRef]);
}
