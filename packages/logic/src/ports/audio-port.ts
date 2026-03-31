/**
 * AudioPort
 *
 * Interface for audio services.
 * Allows GameSession to use audio without depending on infra.
 */

import type { BWArithmeticOperation, Sound, ToneValue } from '../types';

/**
 * Audio preset type (determines which audio files to use).
 * Sync presets (binaural) were removed — only 'default' (varied_aac) remains.
 */
export type AudioPreset = 'default';

/** @deprecated Sync presets removed — always returns false. */
export function isSyncPreset(_preset: AudioPreset | undefined): boolean {
  return false;
}

/**
 * Configuration audio (langue, voix et preset)
 */
export interface AudioConfig {
  language: 'fr' | 'en' | 'de' | 'es' | 'pl' | 'ar';
  voice: string;
  audioPreset?: AudioPreset;
  /** Runtime pink noise level (0.0–1.0, default ~0.15). Used with any sync_* preset. */
  pinkNoiseLevel?: number;
  /** Binaural carrier frequency in Hz. Fixed to 200 for mobile compatibility. */
  binauralCarrierHz?: 200;
}

export interface AudioPort {
  /**
   * Configure language and voice
   */
  setConfig(config: Partial<AudioConfig>): void;

  /**
   * Get current configuration
   */
  getConfig(): AudioConfig;

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  init(): Promise<void>;

  /**
   * Resume the audio context after suspension (e.g., iOS background).
   * Handles the non-standard "interrupted" state used by iOS Safari.
   * Returns true if successfully resumed, false otherwise.
   */
  resume(): Promise<boolean>;

  /**
   * Play a sound immediately
   */
  play(sound: Sound): void;

  /**
   * Play a tone stimulus immediately.
   * Optional while tone-capable adapters are rolled out.
   */
  playToneValue?(tone: ToneValue): void;

  /**
   * Schedule a sound to play after a delay, with synchronized callbacks.
   * The onSync callback is executed when AudioContext.currentTime reaches the target time,
   * ensuring precise audio-visual synchronization.
   *
   * VISUAL LATENCY COMPENSATION: If onPreSync is provided with visualOffsetMs,
   * it will be called before the audio to compensate for React render delay.
   *
   * @param sound The sound to play
   * @param delayMs Delay before playback (sync buffer)
   * @param onSync Callback executed at the exact moment the sound starts (for RT reference)
   * @param options Optional configuration
   * @param options.onEnded Callback executed when the sound finishes playing
   * @param options.onPreSync Visual callback triggered before audio (latency compensation)
   * @param options.visualOffsetMs How early to trigger onPreSync (default: 0)
   */
  schedule(
    sound: Sound,
    delayMs: number,
    onSync: () => void,
    options?: {
      onEnded?: () => void;
      onPreSync?: () => void;
      visualOffsetMs?: number;
      /**
       * Optional callback executed at a fixed delay after the audio sync time.
       * Useful to drive stimulus HIDE from the audio clock (e.g. 500ms window)
       * while still compensating for visual rendering latency via postVisualOffsetMs.
       */
      onPostSync?: () => void;
      /** Delay after the audio sync time (ms) before triggering onPostSync. */
      postDelayMs?: number;
      /** How early to trigger onPostSync to compensate render delay (ms). */
      postVisualOffsetMs?: number;
    },
  ): void;

  /**
   * Schedule multiple sounds to play with stagger delay (multi-audio mode).
   * Used for Brain Workshop dual-audio mode where two sounds play nearly simultaneously.
   *
   * @param sounds Array of sounds to play
   * @param delayMs Base delay before first sound
   * @param onSync Callback executed when first sound starts (for RT reference)
   * @param options Optional configuration
   * @param options.staggerMs Delay between successive sounds (default: 10ms)
   * @param options.onEnded Callback executed when all sounds finish
   * @param options.onPreSync Visual callback triggered before audio
   * @param options.visualOffsetMs How early to trigger onPreSync
   */
  scheduleMultiple(
    sounds: Sound[],
    delayMs: number,
    onSync: () => void,
    options?: {
      staggerMs?: number;
      onEnded?: () => void;
      onPreSync?: () => void;
      visualOffsetMs?: number;
      onPostSync?: () => void;
      postDelayMs?: number;
      postVisualOffsetMs?: number;
    },
  ): void;

  /**
   * Brain Workshop arithmetic: schedule the operation cue (add/subtract/multiply/divide).
   * Implementations may synthesize or use recorded samples.
   *
   * BW behavior: played when arithmetic is active and trial_number > back.
   */
  scheduleOperation?(operation: BWArithmeticOperation, delayMs: number): void;

  /**
   * Schedule a callback synchronized with the audio clock (without playing a sound).
   * Useful for visual-only trials that need consistent timing.
   * Returns an ID that can be used to cancel the callback.
   *
   * @param delayMs Delay before callback execution
   * @param callback Callback to execute
   * @returns Callback ID for cancellation
   */
  scheduleCallback(delayMs: number, callback: () => void): number;

  /**
   * Cancel a scheduled callback by its ID.
   *
   * @param callbackId ID returned by scheduleCallback
   */
  cancelCallback(callbackId: number): void;

  /**
   * Get the current audio clock time in seconds.
   * Uses AudioContext.currentTime for high-precision timing.
   * Falls back to a monotonic wall clock (performance.now/Date.now) if AudioContext
   * is not available or not advancing (e.g. suspended/not unlocked).
   *
   * Note: Returns seconds (not milliseconds) to match AudioContext.currentTime convention.
   */
  getCurrentTime(): number;

  /**
   * Stop all currently playing sounds and cancel pending scheduled events
   */
  stopAll(): void;

  /**
   * Check if audio is ready to play
   */
  isReady(): boolean;

  // =============================================================================
  // Sound Effects (UI feedback)
  // =============================================================================

  /**
   * Play a correct feedback sound (high tone)
   */
  playCorrect(): void;

  /**
   * Play an incorrect feedback sound (low tone)
   */
  playIncorrect(): void;

  /**
   * Play a button click sound (subtle)
   */
  playClick(): void;

  /**
   * Play a swipe gesture sound (soft whoosh/ink drop)
   * Used for Dual Trace swipe responses
   */
  playSwipe(): void;

  /**
   * Play a countdown tick cue with urgency shaping.
   * Intended for short pre-game countdowns (3,2,1,0).
   *
   * @param value Countdown value (0..3). Implementations may accentuate lower values.
   */
  playCountdownTick?(value: 3 | 2 | 1 | 0): void;

  /**
   * Get current audio volume level (0-1).
   * Returns null if volume cannot be determined.
   */
  getVolumeLevel(): number | null;
}
