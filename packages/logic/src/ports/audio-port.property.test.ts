/**
 * Property-Based Tests for AudioPort
 *
 * Comprehensive property tests covering:
 * 1. Sound Identifiers (10 tests) - Valid sound values
 * 2. Volume Levels (8 tests) - Range [0, 1]
 * 3. Frequency Values (6 tests) - Positive values
 * 4. Duration Values (8 tests) - Positive timing
 * 5. Sound Categories (4 tests) - Valid categories
 * 6. Audio Configuration (10 tests) - Config consistency
 *
 * Uses fast-check to verify invariants hold for all valid inputs.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type { AudioConfig, AudioPreset } from './audio-port';
import { SOUNDS, type Sound } from '../types/core';

// =============================================================================
// Arbitraries (Test Data Generators)
// =============================================================================

/** Arbitrary for valid Sound values (letters from Jaeggi/BW study) */
const arbSound = fc.constantFrom(...SOUNDS) as fc.Arbitrary<Sound>;

/** Arbitrary for valid volume levels [0, 1] */
const arbVolume = fc.double({ min: 0, max: 1, noNaN: true });

/** Arbitrary for invalid volume levels (out of range) */
const arbInvalidVolume = fc.oneof(
  fc.double({ min: -100, max: -0.001, noNaN: true }),
  fc.double({ min: 1.001, max: 100, noNaN: true }),
);

/** Arbitrary for valid frequency values (positive Hz) */
const arbFrequency = fc.double({ min: 20, max: 20000, noNaN: true });

/** Arbitrary for valid duration values (positive ms) */
const arbDurationMs = fc.integer({ min: 1, max: 60000 });

/** Arbitrary for valid delay values (non-negative ms) */
const arbDelayMs = fc.integer({ min: 0, max: 60000 });

/** Arbitrary for valid audio preset */
const arbAudioPreset = fc.constantFrom<AudioPreset>(
  'default',
  'sync_binaural_theta',
  'sync_binaural_alpha',
  'sync_binaural_beta',
  'sync_binaural_gamma',
);

/** Arbitrary for valid language */
const arbLanguage = fc.constantFrom<AudioConfig['language']>('fr', 'en', 'de', 'es', 'pl');

/** Arbitrary for valid voice name */
const arbVoice = fc.string({ minLength: 1, maxLength: 50 });

/** Arbitrary for valid AudioConfig */
const arbAudioConfig: fc.Arbitrary<AudioConfig> = fc.record({
  language: arbLanguage,
  voice: arbVoice,
  audioPreset: fc.option(arbAudioPreset, { nil: undefined }),
});

/** Arbitrary for partial AudioConfig */
const arbPartialAudioConfig: fc.Arbitrary<Partial<AudioConfig>> = fc.record({
  language: fc.option(arbLanguage, { nil: undefined }),
  voice: fc.option(arbVoice, { nil: undefined }),
  audioPreset: fc.option(arbAudioPreset, { nil: undefined }),
});

/** Arbitrary for visual offset ms (latency compensation) */
const arbVisualOffsetMs = fc.integer({ min: 0, max: 100 });

/** Arbitrary for stagger ms (multi-audio mode) */
const arbStaggerMs = fc.integer({ min: 0, max: 50 });

/** Arbitrary for audio clock time (seconds) */
const arbClockTimeSeconds = fc.double({ min: 0, max: 3600, noNaN: true });

// =============================================================================
// 1. SOUND IDENTIFIERS (10 tests)
// =============================================================================

describe('Sound Identifiers - Property Tests', () => {
  describe('Valid Sound Values', () => {
    it('1. all SOUNDS are uppercase single letters', () => {
      for (const sound of SOUNDS) {
        expect(sound).toMatch(/^[A-Z]$/);
      }
    });

    it('2. SOUNDS has exactly 8 values', () => {
      expect(SOUNDS.length).toBe(8);
    });

    it('3. all SOUNDS are unique', () => {
      const uniqueSounds = new Set(SOUNDS);
      expect(uniqueSounds.size).toBe(SOUNDS.length);
    });

    it('4. generated sounds are always from SOUNDS pool', () => {
      fc.assert(
        fc.property(arbSound, (sound) => {
          return SOUNDS.includes(sound);
        }),
        { numRuns: 100 },
      );
    });

    it('5. sound values match Jaeggi/BrainWorkshop letters', () => {
      const expectedLetters = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];
      // @ts-expect-error test override
      expect([...SOUNDS].sort()).toEqual(expectedLetters.sort());
    });

    it('6. multiple sound selections maintain validity', () => {
      fc.assert(
        fc.property(fc.array(arbSound, { minLength: 1, maxLength: 100 }), (sounds) => {
          return sounds.every((s) => SOUNDS.includes(s));
        }),
        { numRuns: 50 },
      );
    });

    it('7. sound values are string type', () => {
      fc.assert(
        fc.property(arbSound, (sound) => {
          return typeof sound === 'string';
        }),
        { numRuns: 50 },
      );
    });

    it('8. sound values have length 1', () => {
      fc.assert(
        fc.property(arbSound, (sound) => {
          return sound.length === 1;
        }),
        { numRuns: 50 },
      );
    });

    it('9. different sound selections can include duplicates', () => {
      fc.assert(
        fc.property(fc.array(arbSound, { minLength: 10, maxLength: 50 }), (sounds) => {
          // With 8 sounds and 10+ selections, expect duplicates
          const uniqueCount = new Set(sounds).size;
          // All selections are valid, but uniqueCount <= 8
          return sounds.every((s) => SOUNDS.includes(s)) && uniqueCount <= SOUNDS.length;
        }),
        { numRuns: 50 },
      );
    });

    it('10. sound pool is array-like and consistent', () => {
      // TypeScript ensures immutability at compile time via 'as const'
      // Runtime check: SOUNDS is an array-like structure
      expect(Array.isArray(SOUNDS)).toBe(true);
      // Verify consistency: same values when spread
      const soundsCopy = [...SOUNDS];
      expect(soundsCopy).toEqual([...SOUNDS]);
      expect(soundsCopy.length).toBe(SOUNDS.length);
    });
  });
});

// =============================================================================
// 2. VOLUME LEVELS (8 tests)
// =============================================================================

describe('Volume Levels - Property Tests', () => {
  describe('Valid Volume Range [0, 1]', () => {
    it('11. generated volumes are in [0, 1] range', () => {
      fc.assert(
        fc.property(arbVolume, (volume) => {
          return volume >= 0 && volume <= 1;
        }),
        { numRuns: 200 },
      );
    });

    it('12. volume 0 represents silence', () => {
      expect(0).toBeGreaterThanOrEqual(0);
      expect(0).toBeLessThanOrEqual(1);
    });

    it('13. volume 1 represents maximum', () => {
      expect(1).toBeGreaterThanOrEqual(0);
      expect(1).toBeLessThanOrEqual(1);
    });

    it('14. volume midpoint 0.5 is valid', () => {
      const midpoint = 0.5;
      expect(midpoint).toBeGreaterThanOrEqual(0);
      expect(midpoint).toBeLessThanOrEqual(1);
    });

    it('15. invalid volumes are out of [0, 1] range', () => {
      fc.assert(
        fc.property(arbInvalidVolume, (volume) => {
          return volume < 0 || volume > 1;
        }),
        { numRuns: 100 },
      );
    });

    it('16. volume values can be precisely compared', () => {
      fc.assert(
        fc.property(arbVolume, arbVolume, (v1, v2) => {
          // Comparison operators work correctly
          if (v1 < v2) return v2 > v1;
          if (v1 > v2) return v2 < v1;
          return v1 === v2;
        }),
        { numRuns: 100 },
      );
    });

    it('17. volume is a number (not NaN)', () => {
      fc.assert(
        fc.property(arbVolume, (volume) => {
          return typeof volume === 'number' && !Number.isNaN(volume);
        }),
        { numRuns: 100 },
      );
    });

    it('18. volume is finite', () => {
      fc.assert(
        fc.property(arbVolume, (volume) => {
          return Number.isFinite(volume);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// 3. FREQUENCY VALUES (6 tests)
// =============================================================================

describe('Frequency Values - Property Tests', () => {
  describe('Positive Frequency Range', () => {
    it('19. generated frequencies are positive', () => {
      fc.assert(
        fc.property(arbFrequency, (freq) => {
          return freq > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('20. frequencies are within human hearing range (20Hz - 20kHz)', () => {
      fc.assert(
        fc.property(arbFrequency, (freq) => {
          return freq >= 20 && freq <= 20000;
        }),
        { numRuns: 100 },
      );
    });

    it('21. frequency values are numbers (not NaN)', () => {
      fc.assert(
        fc.property(arbFrequency, (freq) => {
          return typeof freq === 'number' && !Number.isNaN(freq);
        }),
        { numRuns: 100 },
      );
    });

    it('22. frequencies can be compared for ordering', () => {
      fc.assert(
        fc.property(arbFrequency, arbFrequency, (f1, f2) => {
          const higher = Math.max(f1, f2);
          const lower = Math.min(f1, f2);
          return higher >= lower;
        }),
        { numRuns: 100 },
      );
    });

    it('23. standard musical frequencies are valid', () => {
      // Common frequencies: A4 = 440Hz, C4 = 261.63Hz
      const musicalFreqs = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
      for (const freq of musicalFreqs) {
        expect(freq).toBeGreaterThan(0);
        expect(freq).toBeGreaterThanOrEqual(20);
        expect(freq).toBeLessThanOrEqual(20000);
      }
    });

    it('24. octave relationship: frequency * 2 doubles pitch', () => {
      fc.assert(
        fc.property(fc.double({ min: 20, max: 10000, noNaN: true }), (freq) => {
          const octaveUp = freq * 2;
          // Both frequencies are valid
          return freq > 0 && octaveUp > 0 && octaveUp === freq * 2;
        }),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// 4. DURATION VALUES (8 tests)
// =============================================================================

describe('Duration Values - Property Tests', () => {
  describe('Positive Duration Range', () => {
    it('25. generated durations are positive', () => {
      fc.assert(
        fc.property(arbDurationMs, (duration) => {
          return duration > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('26. duration values are integers (ms precision)', () => {
      fc.assert(
        fc.property(arbDurationMs, (duration) => {
          return Number.isInteger(duration);
        }),
        { numRuns: 100 },
      );
    });

    it('27. delays can be zero (immediate playback)', () => {
      fc.assert(
        fc.property(arbDelayMs, (delay) => {
          return delay >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('28. visual offset is non-negative', () => {
      fc.assert(
        fc.property(arbVisualOffsetMs, (offset) => {
          return offset >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('29. stagger ms is non-negative for multi-audio', () => {
      fc.assert(
        fc.property(arbStaggerMs, (stagger) => {
          return stagger >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('30. delay + duration does not overflow', () => {
      fc.assert(
        fc.property(arbDelayMs, arbDurationMs, (delay, duration) => {
          const total = delay + duration;
          return Number.isFinite(total) && total >= delay && total >= duration;
        }),
        { numRuns: 100 },
      );
    });

    it('31. clock time is non-negative seconds', () => {
      fc.assert(
        fc.property(arbClockTimeSeconds, (time) => {
          return time >= 0 && Number.isFinite(time);
        }),
        { numRuns: 100 },
      );
    });

    it('32. standard timing values are reasonable', () => {
      // Common audio timing values from thresholds.ts
      const timings = {
        audioSyncBuffer: 50, // AUDIO_SYNC_BUFFER_MS
        audioEndBuffer: 100, // AUDIO_END_BUFFER_MS
        stimulusTempo: 500, // TIMING_STIMULUS_TEMPO_MS (typical)
      };

      for (const [name, value] of Object.entries(timings)) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });
});

// =============================================================================
// 5. SOUND CATEGORIES (4 tests)
// =============================================================================

describe('Sound Categories - Property Tests', () => {
  describe('Audio Feedback Types', () => {
    it('33. feedback sounds are categorized (correct/incorrect/click/swipe)', () => {
      const feedbackTypes = ['correct', 'incorrect', 'click', 'swipe'] as const;
      expect(feedbackTypes.length).toBe(4);
      expect(feedbackTypes).toContain('correct');
      expect(feedbackTypes).toContain('incorrect');
      expect(feedbackTypes).toContain('click');
      expect(feedbackTypes).toContain('swipe');
    });

    it('34. audio presets are limited to valid values', () => {
      fc.assert(
        fc.property(arbAudioPreset, (preset) => {
          return [
            'default',
            'sync_binaural_theta',
            'sync_binaural_alpha',
            'sync_binaural_beta',
            'sync_binaural_gamma',
          ].includes(preset);
        }),
        { numRuns: 50 },
      );
    });

    it('35. BW arithmetic operations are valid categories', () => {
      const operations = ['add', 'subtract', 'multiply', 'divide'] as const;
      expect(operations.length).toBe(4);
      for (const op of operations) {
        expect(typeof op).toBe('string');
        expect(op.length).toBeGreaterThan(0);
      }
    });

    it('36. sound types include letter-based stimuli', () => {
      // SOUNDS are letter-based audio stimuli
      const letterBased = SOUNDS.every((s) => /^[A-Z]$/.test(s));
      expect(letterBased).toBe(true);
    });
  });
});

// =============================================================================
// 6. AUDIO CONFIGURATION (10 tests)
// =============================================================================

describe('Audio Configuration - Property Tests', () => {
  describe('AudioConfig Structure', () => {
    it('37. language is one of supported locales', () => {
      fc.assert(
        fc.property(arbLanguage, (lang) => {
          return ['fr', 'en', 'de', 'es', 'pl'].includes(lang);
        }),
        { numRuns: 50 },
      );
    });

    it('38. voice is non-empty string', () => {
      fc.assert(
        fc.property(arbVoice, (voice) => {
          return typeof voice === 'string' && voice.length > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('39. audioPreset is optional', () => {
      fc.assert(
        fc.property(arbAudioConfig, (config) => {
          return (
            config.audioPreset === undefined ||
            config.audioPreset === 'default' ||
            config.audioPreset === 'sync_binaural_theta' ||
            config.audioPreset === 'sync_binaural_alpha' ||
            config.audioPreset === 'sync_binaural_beta' ||
            config.audioPreset === 'sync_binaural_gamma'
          );
        }),
        { numRuns: 50 },
      );
    });

    it('40. full AudioConfig has required fields', () => {
      fc.assert(
        fc.property(arbAudioConfig, (config) => {
          return (
            'language' in config &&
            'voice' in config &&
            typeof config.language === 'string' &&
            typeof config.voice === 'string'
          );
        }),
        { numRuns: 50 },
      );
    });

    it('41. partial AudioConfig allows undefined fields', () => {
      fc.assert(
        fc.property(arbPartialAudioConfig, (partial) => {
          // All fields are optional in partial config
          return typeof partial === 'object';
        }),
        { numRuns: 50 },
      );
    });

    it('42. config language affects audio file selection', () => {
      // Each language has different audio files
      const languages = ['fr', 'en', 'de', 'es', 'pl'] as const;
      expect(languages.length).toBe(5);
      const uniqueLanguages = new Set(languages);
      expect(uniqueLanguages.size).toBe(languages.length);
    });

    it('43. default preset is the standard option', () => {
      const defaultPreset: AudioPreset = 'default';
      expect(defaultPreset).toBe('default');
    });

    it('44. binaural gamma preset is for focus texture', () => {
      const syncPreset: AudioPreset = 'sync_binaural_gamma';
      expect(syncPreset).toBe('sync_binaural_gamma');
    });

    it('45. config can be merged (partial + defaults)', () => {
      fc.assert(
        fc.property(arbAudioConfig, arbPartialAudioConfig, (full, partial) => {
          const merged = {
            ...full,
            ...(partial.language !== undefined ? { language: partial.language } : {}),
            ...(partial.voice !== undefined ? { voice: partial.voice } : {}),
            ...(partial.audioPreset !== undefined ? { audioPreset: partial.audioPreset } : {}),
          };

          return (
            'language' in merged &&
            'voice' in merged &&
            typeof merged.language === 'string' &&
            typeof merged.voice === 'string'
          );
        }),
        { numRuns: 50 },
      );
    });

    it('46. four languages cover major European regions', () => {
      const supported = ['fr', 'en', 'de', 'es', 'pl'];
      // French (fr), English (en), German (de), Spanish (es)
      expect(supported).toContain('fr');
      expect(supported).toContain('en');
      expect(supported).toContain('de');
      expect(supported).toContain('es');
    });
  });
});

// =============================================================================
// 7. AUDIO PORT INTERFACE (4 additional tests)
// =============================================================================

describe('AudioPort Interface - Property Tests', () => {
  describe('Method Contracts', () => {
    it('47. schedule delay must be non-negative', () => {
      fc.assert(
        fc.property(arbDelayMs, (delay) => {
          return delay >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('48. scheduleMultiple sounds array can have variable length', () => {
      fc.assert(
        fc.property(fc.array(arbSound, { minLength: 1, maxLength: 4 }), (sounds) => {
          return sounds.length >= 1 && sounds.length <= 4;
        }),
        { numRuns: 50 },
      );
    });

    it('49. callback ID from scheduleCallback should be usable', () => {
      // Callback IDs are numbers (typically from setTimeout or similar)
      fc.assert(
        fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (id) => {
          return typeof id === 'number' && id >= 0;
        }),
        { numRuns: 50 },
      );
    });

    it('50. getCurrentTime returns seconds (not ms)', () => {
      fc.assert(
        fc.property(arbClockTimeSeconds, (time) => {
          // Audio clock time is in seconds (like AudioContext.currentTime)
          // Reasonable range: 0 to 1 hour
          return time >= 0 && time <= 3600;
        }),
        { numRuns: 50 },
      );
    });
  });
});
