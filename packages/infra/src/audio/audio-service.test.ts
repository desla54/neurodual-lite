import { describe, it, expect, mock } from 'bun:test';
import { AudioService } from './audio-service';

describe('AudioService', () => {
  it('does not call onEnded immediately when buffer is missing', async () => {
    const service = new AudioService();
    const onSync = mock(() => {});
    const onEnded = mock(() => {});

    service.schedule('C', 0, onSync, { onEnded });

    // onSync should happen quickly, but onEnded should respect a fallback duration.
    await new Promise((r) => setTimeout(r, 50));
    expect(onSync).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 700));
    expect(onEnded).toHaveBeenCalled();
  });

  it('does not call onEnded immediately when scheduleMultiple has no buffers', async () => {
    const service = new AudioService();
    const onSync = mock(() => {});
    const onEnded = mock(() => {});

    service.scheduleMultiple(['C', 'H'], 0, onSync, { onEnded, staggerMs: 10 });

    await new Promise((r) => setTimeout(r, 50));
    expect(onSync).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 750));
    expect(onEnded).toHaveBeenCalled();
  });

  it('stops active texture handlers during stopAll', () => {
    const service = new AudioService();
    const stopTexture = mock(() => {});
    const state = service as unknown as { activeNoiseStop: (() => void) | null };
    state.activeNoiseStop = stopTexture;

    service.stopAll();

    expect(stopTexture).toHaveBeenCalledTimes(1);
    expect(state.activeNoiseStop).toBeNull();
  });

  it('awaits warmup for stimulus path when audio can play and warmup is stale', async () => {
    const service = new AudioService();
    const state = service as unknown as {
      hasWarmedUp: boolean;
      warmupAudioPipelineOnce: () => Promise<void>;
      ensureStimulusPathReady: (canPlayAudio: boolean) => Promise<void>;
    };

    let warmed = false;
    state.hasWarmedUp = false;
    state.warmupAudioPipelineOnce = mock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      warmed = true;
      state.hasWarmedUp = true;
    });

    await state.ensureStimulusPathReady(true);

    expect(state.warmupAudioPipelineOnce).toHaveBeenCalledTimes(1);
    expect(warmed).toBe(true);
    expect(state.hasWarmedUp).toBe(true);
  });

  it('does not re-schedule callbacks after stopAll during warmup', async () => {
    const service = new AudioService();
    const state = service as unknown as {
      ensureStimulusPathReady: (canPlayAudio: boolean) => Promise<void>;
      scheduledCallbacks: Array<{ targetTime: number; callback: () => void }>;
      isStopped: boolean;
    };
    const onSync = mock(() => {});

    state.ensureStimulusPathReady = mock(async (_canPlayAudio: boolean): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    service.schedule('C', 0, onSync);
    service.stopAll();

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(state.ensureStimulusPathReady).toHaveBeenCalledTimes(1);
    expect(onSync).not.toHaveBeenCalled();
    expect(state.scheduledCallbacks).toHaveLength(0);
    expect(state.isStopped).toBe(true);
  });

  it('startSynchronizedTexture is a no-op when sync presets are disabled', () => {
    const service = new AudioService();
    const state = service as unknown as {
      config: { audioPreset?: string; pinkNoiseLevel?: number };
      activeNoiseStop: (() => void) | null;
      playNoiseBurst: (atTime: number, durationOverride?: number) => (() => void) | null;
      startSynchronizedTexture: (canPlayAudio: boolean, tone: { now: () => number } | null) => void;
    };

    state.config.audioPreset = 'sync_soft';
    state.config.pinkNoiseLevel = 0.15;
    state.playNoiseBurst = mock(() => null);

    // isSyncPreset always returns false now — texture should not start
    state.startSynchronizedTexture(true, { now: () => 1 });
    expect(state.playNoiseBurst).not.toHaveBeenCalled();
    expect(state.activeNoiseStop).toBeNull();
  });
});
