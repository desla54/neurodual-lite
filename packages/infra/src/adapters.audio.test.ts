import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { audioAdapter } from './adapters';
import { audioService } from './audio/audio-service';

describe('audioAdapter.setConfig', () => {
  afterEach(() => {
    mock.restore();
  });

  it('forwards binauralCarrierHz to the audio service', () => {
    const setConfigSpy = spyOn(audioService, 'setConfig').mockImplementation(() => {});

    audioAdapter.setConfig({
      audioPreset: 'sync_binaural_theta',
      pinkNoiseLevel: 0.1,
      binauralCarrierHz: 200,
    });

    expect(setConfigSpy).toHaveBeenCalledWith({
      audioPreset: 'sync_binaural_theta',
      pinkNoiseLevel: 0.1,
      binauralCarrierHz: 200,
    });
  });
});
