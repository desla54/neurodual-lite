import type {
  AudioLifecyclePort,
  AudioLifecycleState,
  AudioLoadingProgress,
} from '@neurodual/logic';

class LazyAudioLifecycleAdapter implements AudioLifecyclePort {
  private inner: AudioLifecyclePort | null = null;
  private loadPromise: Promise<AudioLifecyclePort> | null = null;

  private loader: (() => Promise<AudioLifecyclePort>) | null = null;

  setLoader(loader: () => Promise<AudioLifecyclePort>): void {
    this.loader = loader;
  }

  private state: AudioLifecycleState = 'uninitialized';
  private progress: AudioLoadingProgress | null = null;

  private readonly stateListeners = new Set<(state: AudioLifecycleState) => void>();
  private readonly progressListeners = new Set<(progress: AudioLoadingProgress) => void>();

  private unsubState: (() => void) | null = null;
  private unsubProgress: (() => void) | null = null;

  private emitState(next: AudioLifecycleState): void {
    this.state = next;
    for (const listener of this.stateListeners) {
      listener(next);
    }
  }

  private emitProgress(next: AudioLoadingProgress | null): void {
    this.progress = next;
    if (!next) return;
    for (const listener of this.progressListeners) {
      listener(next);
    }
  }

  private attachInner(inner: AudioLifecyclePort): void {
    if (this.inner === inner) return;

    this.unsubState?.();
    this.unsubProgress?.();

    this.inner = inner;
    this.emitState(inner.getState());
    this.emitProgress(inner.getLoadingProgress());

    this.unsubState = inner.subscribe((nextState) => {
      this.emitState(nextState);
      if (nextState !== 'loading') {
        this.emitProgress(null);
      }
    });

    this.unsubProgress = inner.subscribeProgress((nextProgress) => {
      this.emitProgress(nextProgress);
    });
  }

  private async ensureInner(): Promise<AudioLifecyclePort> {
    if (this.inner) return this.inner;

    if (!this.loader) {
      throw new Error(
        'LazyAudioLifecycleAdapter loader not configured (call configureLazyAudioLifecycleMachine in app root)',
      );
    }

    if (!this.loadPromise) {
      this.loadPromise = this.loader().then((adapter) => {
        this.attachInner(adapter);
        return adapter;
      });
    }

    return this.loadPromise;
  }

  async ensureLoaded(): Promise<void> {
    await this.ensureInner();
  }

  getState(): AudioLifecycleState {
    return this.inner?.getState() ?? this.state;
  }

  getLoadingProgress(): AudioLoadingProgress | null {
    return this.inner?.getLoadingProgress() ?? this.progress;
  }

  isReady(): boolean {
    return this.inner?.isReady() ?? this.state === 'ready';
  }

  preload(): void {
    void this.ensureInner().then((adapter) => {
      adapter.preload();
    });
  }

  async unlock(): Promise<void> {
    const adapter = await this.ensureInner();
    await adapter.unlock();
  }

  subscribe(listener: (state: AudioLifecycleState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribeProgress(listener: (progress: AudioLoadingProgress) => void): () => void {
    this.progressListeners.add(listener);
    const current = this.getLoadingProgress();
    if (current) {
      listener(current);
    }
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  dispose(): void {
    this.unsubState?.();
    this.unsubState = null;
    this.unsubProgress?.();
    this.unsubProgress = null;

    this.inner?.dispose();
    this.inner = null;

    this.loadPromise = null;
    this.progress = null;
    this.state = 'uninitialized';
    this.stateListeners.clear();
    this.progressListeners.clear();
  }
}

export const lazyAudioLifecycleMachine = new LazyAudioLifecycleAdapter();

export function configureLazyAudioLifecycleMachine(
  loader: () => Promise<AudioLifecyclePort>,
): void {
  lazyAudioLifecycleMachine.setLoader(loader);
}

export async function preloadLazyAudioLifecycleMachine(): Promise<void> {
  await lazyAudioLifecycleMachine.ensureLoaded();
}
