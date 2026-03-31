import { describe, expect, it, mock } from 'bun:test';
import { AudioService, __setToneForTest } from './audio-service';

describe('AudioService scheduleMultiple', () => {
  it('does not play synchronized texture when sync presets are disabled', async () => {
    const toneStub = {
      now: () => 1,
      start: () => Promise.resolve(),
      getContext: () =>
        ({
          state: 'running',
          currentTime: 1,
          lookAhead: 0,
        }) as {
          state: 'running';
          currentTime: number;
          lookAhead: number;
        },
    };

    __setToneForTest(toneStub);

    const service = new AudioService();
    const state = service as unknown as {
      config: { audioPreset?: string; pinkNoiseLevel?: number };
      ensureStimulusPathReady: (canPlayAudio: boolean) => Promise<void>;
      playSynthCueAt: (sound: string, atTime: number) => void;
      playOscillatorTexture: (atTime: number) => (() => void) | null;
      playNoiseBurst: (atTime: number, durationOverride?: number) => (() => void) | null;
      startSyncLoop: () => void;
    };

    state.config.audioPreset = 'sync_binaural_gamma';
    state.config.pinkNoiseLevel = 0.15;
    state.ensureStimulusPathReady = mock(async () => {});
    state.playSynthCueAt = mock(() => {});
    state.playOscillatorTexture = mock(() => null);
    state.playNoiseBurst = mock(() => null);
    state.startSyncLoop = mock(() => {});

    service.scheduleMultiple(['C', 'H'], 0, () => {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    // isSyncPreset always returns false now — no texture should play
    expect(state.playOscillatorTexture).not.toHaveBeenCalled();
    expect(state.playNoiseBurst).not.toHaveBeenCalled();
  });
});
