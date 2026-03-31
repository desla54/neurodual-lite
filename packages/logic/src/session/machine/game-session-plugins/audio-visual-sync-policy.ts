/**
 * AudioVisualSyncPolicy Plugin
 *
 * Determines audio-visual synchronization configuration.
 * Handles multi-audio mode (BrainWorkshop), visual offset, etc.
 *
 * Data in / Data out: Pure configuration, no side effects.
 */

import type { ModeSpec } from '../../../specs/types';
import type { Trial } from '../../../domain';
import {
  MULTI_AUDIO_STAGGER_MS,
  AUDIO_SYNC_BUFFER_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS,
} from '../../../specs/thresholds';
import type { SyncMode, AudioVisualSyncPolicy } from './types';

/**
 * Configuration for AudioVisualSyncPolicy.
 */
export interface AudioVisualSyncPolicyConfig {
  readonly spec: ModeSpec;
  /** User's configured modalities (may differ from spec.defaults) */
  readonly activeModalities: readonly string[];
}

/**
 * Default AudioVisualSyncPolicy implementation.
 */
export class DefaultAudioVisualSyncPolicy implements AudioVisualSyncPolicy {
  private readonly activeModalities: readonly string[];
  private readonly visualOffsetMs: number;
  private readonly postVisualOffsetMs: number;
  private readonly multiAudioStaggerMs: number;
  private readonly audioSyncBufferMs: number;

  constructor(config: AudioVisualSyncPolicyConfig) {
    // Use user's configured modalities, not spec defaults
    this.activeModalities = config.activeModalities;
    // Keep sync deterministic by default: no implicit visual offset.
    // If a mode explicitly provides visualOffsetMs, it is respected.
    this.visualOffsetMs = config.spec.timing.visualOffsetMs ?? TIMING_VISUAL_OFFSET_DEFAULT_MS;
    this.postVisualOffsetMs = TIMING_POST_VISUAL_OFFSET_MS;
    this.multiAudioStaggerMs = MULTI_AUDIO_STAGGER_MS;
    this.audioSyncBufferMs = AUDIO_SYNC_BUFFER_MS;
  }

  /**
   * Check if multi-audio mode (BrainWorkshop).
   *
   * Multi-audio = both 'audio' and 'audio2' in active modalities.
   */
  hasMultiAudio(): boolean {
    return this.activeModalities.includes('audio') && this.activeModalities.includes('audio2');
  }

  /**
   * Get visual offset delay from spec (start).
   *
   * This is the time before audio to trigger visual for latency compensation.
   */
  getVisualOffsetMs(): number {
    return this.visualOffsetMs;
  }

  /**
   * Get post-visual offset (end): compensates render delay at extinction
   * so the hide paint lands at the same time as the audio end.
   */
  getPostVisualOffsetMs(): number {
    return this.postVisualOffsetMs;
  }

  /**
   * Get multi-audio stagger delay.
   *
   * Time between first and second audio in multi-audio mode.
   */
  getMultiAudioStaggerMs(): number {
    return this.multiAudioStaggerMs;
  }

  /**
   * Determine sync mode based on trial and active modalities.
   *
   * - 'multi-audio': Both audio and audio2 active, trial has sound2
   * - 'single-audio': Only audio active
   * - 'visual-only': No audio modalities
   */
  getSyncMode(trial: Trial | null): SyncMode {
    const hasAudio = this.activeModalities.includes('audio');
    const hasAudio2 = this.activeModalities.includes('audio2');

    if (hasAudio && hasAudio2 && trial?.sound2) {
      return 'multi-audio';
    }

    if (hasAudio) {
      return 'single-audio';
    }

    return 'visual-only';
  }

  /**
   * Get audio sync buffer (time before audio for scheduling).
   */
  getAudioSyncBufferMs(): number {
    return this.audioSyncBufferMs;
  }
}
