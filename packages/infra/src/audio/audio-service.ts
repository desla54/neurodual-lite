/**
 * AudioService
 *
 * Gestion audio via Tone.js avec scheduling sample-accurate.
 *
 * Synchronisation audio-visuelle:
 * - Planifie l'audio avec Tone.Player.start(targetTime)
 * - Boucle RAF pour déclencher les callbacks visuels au bon moment
 * - Filet de sécurité: horloge monotone si Tone.context ne progresse pas
 */

import type { Gain, Player, Synth, ToneAudioBuffer } from 'tone';
import { getToneSync, loadTone } from './tone-loader';
import {
  MULTI_AUDIO_STAGGER_MS,
  SOUNDS,
  TONE_VALUES,
  isSyncPreset,
  type AudioPreset,
  type Sound,
  type ToneValue,
} from '@neurodual/logic';
import { audioLog } from '../logger';

type ToneModule = typeof import('tone');

// Tone is intentionally loaded on-demand to avoid paying the (large) parse/compile
// cost on app startup when audio isn't used yet.
let Tone = null as unknown as ToneModule;
let toneLoaded = false;

async function ensureToneLoaded(): Promise<ToneModule> {
  if (toneLoaded) {
    // Dev/HMR edge-cases can leave a truthy flag with a cleared module ref.
    if (Tone) return Tone;
    toneLoaded = false;
  }

  const loaded = (getToneSync() ?? (await loadTone())) as ToneModule | null;
  if (!loaded) {
    throw new Error('[AudioService] Tone module failed to load');
  }

  Tone = loaded;
  toneLoaded = true;
  return Tone;
}

function getToneLoadedSync(): ToneModule | null {
  const tone = toneLoaded ? Tone : getToneSync();
  if (!tone) return null;
  if (!toneLoaded) {
    Tone = tone as ToneModule;
    toneLoaded = true;
  }
  return Tone;
}

/** @internal Test-only: inject a Tone stub so tests bypass module-cache issues. */
export function __setToneForTest(stub: unknown): void {
  Tone = stub as ToneModule;
  toneLoaded = true;
}

// =============================================================================
// iOS PWA Audio Unlock via HTML Audio Element
// =============================================================================

/**
 * Minimal silent WAV file encoded as base64.
 * This is used to unlock audio on iOS PWA standalone mode.
 * The HTML <audio> element can bypass restrictions that block Web Audio API.
 *
 * Format: 8-bit mono WAV, 1 sample, 8000Hz
 * This produces no audible sound but satisfies iOS audio session requirements.
 */
// Note: keep WAV here for iOS PWA unlock. This is not related to stimulus assets.
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// =============================================================================
// Types
// =============================================================================

export type { AudioPreset };

type BWArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide';

export type Language = 'fr' | 'en' | 'de' | 'es' | 'pl' | 'ar';

export type Voice =
  | 'voice1_femme_standard'
  | 'voice2_homme_standard'
  | 'voice3_femme_aigue'
  | 'voice4_homme_grave'
  | 'voice5_femme_rapide'
  | 'voice6_femme_douce'
  | 'voice7_homme_lent'
  | 'voice8_femme_mature'
  | 'voice9_homme_dynamique'
  | 'voice10_femme_quebecoise';

interface AudioConfig {
  language: Language;
  voice: Voice;
  useVariants?: boolean;
  audioPreset?: AudioPreset;
  pinkNoiseLevel?: number;
  binauralCarrierHz?: 200;
}

interface LoadingState {
  total: number;
  loaded: number;
  failed: string[];
}

interface ScheduledCallback {
  id: number;
  targetTime: number;
  callback: () => void;
}

interface ResolvedSoundAsset {
  sound: Sound;
  key: string;
  url: string;
  durationSeconds: number | null;
}

async function yieldToMainThread(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

// =============================================================================
// AudioService
// =============================================================================

export class AudioService {
  private static readonly TONE_BUFFER_KEY_PREFIX = 'tone:';

  // Store buffers, not players - create players on-the-fly for each playback
  private buffers = new Map<string, ToneAudioBuffer>();
  private activePlayers = new Set<Player>();
  private activeDisposables = new Set<() => void>();
  private feedbackSynth: Synth | null = null;
  private masterGain: Gain | null = null;
  // Runtime pink noise — pre-generated buffer (Paul Kellet algorithm), played via native Web Audio API
  private brownNoiseBuffer: AudioBuffer | null = null;
  private binauralBuffers = new Map<string, AudioBuffer>();
  /** Stop function for the currently playing noise burst (callback-driven lifecycle). */
  private activeNoiseStop: (() => void) | null = null;
  private startPromise: Promise<boolean> | null = null;
  private hasWarmedUp = false;
  private warmupPromise: Promise<void> | null = null;
  private iosHtmlAudioUnlocked = false;
  private iosHtmlAudioUnlockPromise: Promise<boolean> | null = null;
  /**
   * Indicates whether init() has been called at least once.
   * Used to avoid triggering preloads before the required user gesture.
   */
  private hasInitializedOnce = false;
  private loading = false;
  private initPromise: Promise<void> | null = null;
  private earlyAudioContext: AudioContext | null = null;

  private configRevision = 0;
  private loadedRevision = -1;
  private preloadRevision: number | null = null;
  private preloadPromise: Promise<void> | null = null;
  private preloadAbortController: AbortController | null = null;

  private lastKnownSoundDurationSeconds = 0.5;

  private config: AudioConfig = {
    language: 'fr',
    voice: 'voice1_femme_standard',
    useVariants: true,
    audioPreset: 'default',
    pinkNoiseLevel: 0,
  };

  private readonly GAME_SOUNDS: readonly Sound[] = SOUNDS;
  private readonly NUM_VARIANTS = 10;
  private readonly VARIANT_LABELS = [
    'v01',
    'v02',
    'v03',
    'v04',
    'v05',
    'v06',
    'v07',
    'v08',
    'v09',
    'v10',
  ];

  // RAF sync loop for visual callbacks
  private scheduledCallbacks: ScheduledCallback[] = [];
  private rafId: number | null = null;
  private nextCallbackId = 1;
  private isStopped = false;
  private syncOffsetSeconds: number | null = null;
  private lastSyncNowSeconds = 0;
  private forcedNowSeconds: number | null = null;
  private timingSamples: Array<{ kind: string; lateMs: number }> = [];
  private timingSampleLimit = 200;
  private timingLogEvery = 50;
  private timingLoggedCount = 0;
  private adaptiveVisualOffsetDeltaMs = 0;
  // Adaptive visual offset: refines the static visualOffsetMs per-device at runtime.
  private autoVisualCalibrationEnabled = true;
  private visualPreScheduledCount = 0;
  private visualOffsetClampedCount = 0;
  private rafFrameMsEstimate = 16.7;
  private lastRafPerfNowMs: number | null = null;
  private lastToneScheduleTimeSeconds = Number.NEGATIVE_INFINITY;
  private lastFeedbackScheduleTimeSeconds = Number.NEGATIVE_INFINITY;

  private cueMode: 'buffers' | 'synth' = 'buffers';
  private cueFallbackReason: string | null = null;

  /**
   * Minimum "schedule-ahead" when lookAhead is forced to 0.
   * Some devices/webviews can clip or "muffle" attacks when starting exactly at now().
   */
  private static readonly MIN_START_AHEAD_SECONDS = 0.04;

  private static readonly SYNTH_FREQUENCY_BY_SOUND: Readonly<Record<Sound, number>> = {
    C: 523.25, // C5
    H: 587.33, // D5
    K: 659.25, // E5
    L: 698.46, // F5
    Q: 783.99, // G5
    R: 880, // A5
    S: 987.77, // B5
    T: 1046.5, // C6
  };

  private static readonly SYNTH_FREQUENCY_BY_TONE_VALUE: Readonly<Record<ToneValue, number>> = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392,
    A4: 440,
    B4: 493.88,
    C5: 523.25,
  };

  private static readonly SAMPLE_URL_BY_TONE_VALUE: Readonly<Record<ToneValue, string>> = {
    C4: '/sounds/dual-track-tones/fm-piano1/C4.wav',
    D4: '/sounds/dual-track-tones/fm-piano1/D4.wav',
    E4: '/sounds/dual-track-tones/fm-piano1/E4.wav',
    F4: '/sounds/dual-track-tones/fm-piano1/F4.wav',
    G4: '/sounds/dual-track-tones/fm-piano1/G4.wav',
    A4: '/sounds/dual-track-tones/fm-piano1/A4.wav',
    B4: '/sounds/dual-track-tones/fm-piano1/B4.wav',
    C5: '/sounds/dual-track-tones/fm-piano1/C5.wav',
  };

  private static readonly MIME_SUPPORT_CACHE = new Map<string, boolean | null>();

  private static canPlayMimeType(mime: string): boolean | null {
    try {
      const cached = AudioService.MIME_SUPPORT_CACHE.get(mime);
      if (cached !== undefined) return cached;
      if (typeof document === 'undefined') return null;
      const el = document.createElement('audio');
      const res = el.canPlayType(mime);
      const supported = res === 'probably' || res === 'maybe';
      AudioService.MIME_SUPPORT_CACHE.set(mime, supported);
      return supported;
    } catch {
      return null;
    }
  }

  private static supportsAacM4a(): boolean | null {
    return (
      AudioService.canPlayMimeType('audio/mp4; codecs="mp4a.40.2"') ??
      AudioService.canPlayMimeType('audio/mp4; codecs=mp4a.40.2') ??
      AudioService.canPlayMimeType('audio/mp4')
    );
  }

  // Stimulus assets: AAC/M4a only (WAV stimulus preset removed).

  private enableSynthCues(reason: string): void {
    if (this.cueMode === 'synth') return;
    this.cueMode = 'synth';
    this.cueFallbackReason = reason;
    audioLog.warn(`[AudioService] Falling back to synth audio cues: ${reason}`);
  }

  private disableSynthCues(): void {
    this.cueMode = 'buffers';
    this.cueFallbackReason = null;
  }

  private getCueDurationSeconds(): number {
    return isSyncPreset(this.config.audioPreset) ? 0.5 : 0.35;
  }

  private async ensureStimulusPathReady(canPlayAudio: boolean): Promise<void> {
    if (!canPlayAudio) return;
    if (this.hasWarmedUp) return;
    await this.warmupAudioPipelineOnce();
  }

  private shouldPlaySynchronizedTexture(): boolean {
    return isSyncPreset(this.config.audioPreset) && (this.config.pinkNoiseLevel ?? 0) > 0;
  }

  private startSynchronizedTexture(canPlayAudio: boolean, tone: ToneModule | null): void {
    if (!this.shouldPlaySynchronizedTexture() || !canPlayAudio || !tone) return;
    const isOscPreset = AudioService.isOscillatorPreset(this.config.audioPreset ?? '');
    if (this.activeNoiseStop) this.activeNoiseStop();
    const texTime = tone.now();
    this.activeNoiseStop = isOscPreset
      ? this.playOscillatorTexture(texTime)
      : this.playNoiseBurst(texTime, 10);
  }

  private stopSynchronizedTexture(): void {
    if (!this.activeNoiseStop) return;
    this.activeNoiseStop();
    this.activeNoiseStop = null;
  }

  private markWarmupStale(): void {
    this.hasWarmedUp = false;
    // Do not clear warmupPromise: if a warmup is currently running, let it finish.
  }

  private getSafeAudioStartTimeSeconds(
    tone: ToneModule,
    requestedStartTimeSeconds: number,
    minStartAheadSeconds = AudioService.MIN_START_AHEAD_SECONDS,
  ): { startTimeSeconds: number; shiftSeconds: number } {
    const now = tone.now();
    const minStart = now + minStartAheadSeconds;
    const safe = Math.max(requestedStartTimeSeconds, minStart);
    return { startTimeSeconds: safe, shiftSeconds: safe - requestedStartTimeSeconds };
  }

  private getStrictlyIncreasingToneTimeSeconds(
    tone: ToneModule,
    requestedStartTimeSeconds?: number,
  ): number {
    const now = tone.now();
    const requested =
      requestedStartTimeSeconds !== undefined && Number.isFinite(requestedStartTimeSeconds)
        ? requestedStartTimeSeconds
        : now;
    // Tone.js / WebAudio scheduling can quantize times at a small granularity depending on the platform.
    // If two events land on the same effective start time, Tone can throw:
    // "Start time must be strictly greater than previous start time".
    // Use a conservative gap (~ one audio block at 48kHz is ~2.7ms).
    const epsilonSeconds = 0.003;
    const safe = Math.max(requested, now, this.lastToneScheduleTimeSeconds + epsilonSeconds);
    this.lastToneScheduleTimeSeconds = safe;
    return safe;
  }

  private getStrictlyIncreasingFeedbackTime(tone: ToneModule): number {
    const now = tone.now();
    const epsilonSeconds = 0.003;
    const safe = Math.max(now, this.lastFeedbackScheduleTimeSeconds + epsilonSeconds);
    this.lastFeedbackScheduleTimeSeconds = safe;
    return safe;
  }

  // =============================================================================
  // Public API
  // =============================================================================

  private configureToneForLowLatency(): void {
    // Tone.Context has a default lookAhead of 0.1s. For RT-grade stimulus sync, we keep it at 0.
    // Safe to call even when the context is suspended/locked.
    try {
      const tone = getToneLoadedSync();
      if (!tone) return;
      const ctx = tone.getContext();
      if (ctx.lookAhead !== 0) {
        ctx.lookAhead = 0;
      }
    } catch {
      // ignore
    }
  }

  setConfig(nextConfig: Partial<AudioConfig>): void {
    // Backward compatibility: legacy sync presets → default.
    const legacyAudioPreset = (nextConfig as unknown as { audioPreset?: unknown }).audioPreset;
    let config: Partial<AudioConfig>;
    if (typeof legacyAudioPreset === 'string' && legacyAudioPreset.startsWith('sync_')) {
      config = { ...nextConfig, audioPreset: 'default' } as Partial<AudioConfig>;
    } else {
      config = nextConfig;
    }

    const soundsChanged =
      (config.language !== undefined && config.language !== this.config.language) ||
      (config.voice !== undefined && config.voice !== this.config.voice) ||
      (config.audioPreset !== undefined && config.audioPreset !== this.config.audioPreset);

    // Filter out undefined values to avoid overwriting defaults
    const defined = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined));
    this.config = { ...this.config, ...defined };
    // pinkNoiseLevel is read at burst time from this.config — no live-update needed.

    if (!soundsChanged) return;

    // New buffers / different voice can reintroduce "first sound is muffled" on some devices.
    this.markWarmupStale();

    this.configRevision++;
    this.loadedRevision = -1;
    this.preloadAbortController?.abort();
    this.preloadAbortController = null;
    this.preloadPromise = null;
    this.preloadRevision = null;

    // Do not start fetching/decoding until init() has been called (user gesture).
    if (this.hasInitializedOnce) {
      this.stopAll();
      this.unloadAll();
      void this.ensureBuffersLoaded();
    }
  }

  getConfig(): AudioConfig {
    return { ...this.config };
  }

  async init(): Promise<void> {
    if (this.isReady()) {
      await this.resume();
      this.maybeExposeDebugApi();
      return;
    }

    if (this.loading && this.initPromise) {
      return this.initPromise;
    }

    this.loading = true;
    this.hasInitializedOnce = true;

    this.initPromise = (async () => {
      try {
        // iOS Safari/Web: attempt HTML audio unlock within the user-gesture call stack.
        // This helps route audio to the speaker and avoids "works on headphones only" reports.
        const iosUnlockPromise = AudioService.isIOS() ? this.unlockIOSHtmlAudioIfNeeded() : null;

        // AudioContext MUST be created/resumed within the synchronous user-gesture call stack.
        // If Tone is preloaded, start it now. Only iOS needs the raw AudioContext placeholder:
        // adopting a plain AudioContext via Tone.setContext() is fragile on Firefox.
        try {
          const toneSync = getToneSync();
          if (toneSync && toneSync.getContext().state !== 'running') {
            toneSync.start().catch(() => {});
          } else if (!toneSync && AudioService.isIOS() && typeof AudioContext !== 'undefined') {
            // iOS/WebKit: create a raw context NOW within the user gesture.
            // Tone.setContext() will adopt it after the dynamic import resolves.
            this.earlyAudioContext = new AudioContext();
          }
        } catch {
          // ignore
        }

        await ensureToneLoaded();
        this.configureToneForLowLatency();

        // If we kicked off iOS unlock, wait for it before starting Tone so iOS picks a sane audio session.
        if (iosUnlockPromise) {
          try {
            await iosUnlockPromise;
          } catch {
            // ignore
          }
        }

        // If we created a raw AudioContext in the user-gesture path, hand it to Tone.
        if (this.earlyAudioContext) {
          try {
            Tone.setContext(this.earlyAudioContext);
          } catch {
            // ignore — Tone may already have a context
          }
          this.earlyAudioContext = null;
        }

        // Start Tone.js context (may already be running if early context was adopted)
        let didStart = false;
        try {
          await Tone.start();
          didStart = Tone.getContext().state === 'running';
        } catch {
          // Autoplay policies can reject; still allow buffer preloading so the app can enter "locked" state.
        }
        this.ensureMasterGain();
        this.ensureFeedbackSynth();
        await this.ensureBuffersLoaded();

        // Warmup: play a silent tone to prime the audio pipeline
        if (didStart) {
          await this.warmupAudioPipelineOnce();
        }

        this.maybeExposeDebugApi();
      } finally {
        this.loading = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  play(sound: Sound): void {
    this.configureToneForLowLatency();
    void this.ensureAudioRunningAndWarmed().then((ok) => {
      if (!ok) return;

      const resolved = this.resolveBufferForSound(sound);
      if (resolved?.buffer) {
        this.playBufferNow(resolved.buffer);
        return;
      }

      // Avoid silent stimuli when a subset of files failed to load (404 / transient network / decode).
      // If we can't play the real buffer, fall back to synth cue to preserve timing and feedback.
      if (this.cueMode === 'buffers' && this.buffers.size > 0) {
        audioLog.warn(`Sound not loaded (falling back to synth): ${resolved?.key ?? sound}`);
      }
      this.playSynthCueNow(sound);
    });
  }

  playToneValue(toneValue: ToneValue): void {
    this.configureToneForLowLatency();
    void this.ensureAudioRunningAndWarmed().then((ok) => {
      if (!ok) return;

      const resolved = this.resolveBufferForToneValue(toneValue);
      if (resolved) {
        this.playBufferNow(resolved, 0.012);
        return;
      }

      const frequency = AudioService.SYNTH_FREQUENCY_BY_TONE_VALUE[toneValue];
      if (!Number.isFinite(frequency)) return;
      this.fireFeedbackSound(frequency, 0.28, 0.22, `playToneValue:${toneValue}`);
    });
  }

  private resolveBufferForToneValue(toneValue: ToneValue): ToneAudioBuffer | null {
    return this.buffers.get(`${AudioService.TONE_BUFFER_KEY_PREFIX}${toneValue}`) ?? null;
  }

  private getRandomSoundKey(sound: Sound): string {
    if (this.config.useVariants) {
      const variant = this.VARIANT_LABELS[Math.floor(Math.random() * this.NUM_VARIANTS)];
      return `${sound}_${variant}`;
    }
    return sound;
  }

  private resolveBufferForSound(
    sound: Sound,
  ): { key: string; buffer: ToneAudioBuffer; variant?: string } | null {
    if (!this.config.useVariants) {
      const buffer = this.buffers.get(sound);
      return buffer ? { key: sound, buffer } : null;
    }

    // Try a random variant first, then fall back to any loaded variant.
    const preferredKey = this.getRandomSoundKey(sound);
    const preferred = this.buffers.get(preferredKey);
    if (preferred) {
      const match = preferredKey.match(/_(v\d{2})$/);
      return { key: preferredKey, buffer: preferred, variant: match ? match[1] : undefined };
    }

    for (const variant of this.VARIANT_LABELS) {
      const key = `${sound}_${variant}`;
      const buffer = this.buffers.get(key);
      if (buffer) {
        return { key, buffer, variant };
      }
    }

    return null;
  }

  private playSynthCueNow(sound: Sound): void {
    const frequency = AudioService.SYNTH_FREQUENCY_BY_SOUND[sound];
    if (!Number.isFinite(frequency)) return;
    this.playSynthFrequencyNow(frequency);
  }

  private playSynthFrequencyNow(frequency: number): void {
    const tone = getToneLoadedSync();
    if (!tone) return;
    if (tone.getContext().state !== 'running') return;

    const requested = tone.now();
    const { startTimeSeconds } = this.getSafeAudioStartTimeSeconds(tone, requested);
    this.playSynthFrequencyAt(frequency, startTimeSeconds);
  }

  private playSynthCueAt(
    sound: Sound,
    audioTargetTimeSeconds: number,
    options?: { pan?: number; onStop?: () => void },
  ): void {
    const frequency = AudioService.SYNTH_FREQUENCY_BY_SOUND[sound];
    if (!Number.isFinite(frequency)) return;
    this.playSynthFrequencyAt(frequency, audioTargetTimeSeconds, options);
  }

  private playSynthFrequencyAt(
    frequency: number,
    audioTargetTimeSeconds: number,
    options?: { pan?: number; onStop?: () => void },
  ): void {
    const tone = getToneLoadedSync();
    if (!tone) return;
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return;

    const durationSeconds = this.getCueDurationSeconds();
    const volume = 0.14;

    const panner =
      options?.pan !== undefined && Number.isFinite(options.pan)
        ? new tone.Panner(Math.max(-1, Math.min(1, options.pan))).connect(masterGain)
        : null;
    const destination = panner ?? masterGain;

    const synth = new tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.03 },
    }).connect(destination);

    const dispose = () => {
      try {
        synth.dispose();
      } catch {
        // ignore
      }
      try {
        panner?.dispose();
      } catch {
        // ignore
      }
    };

    this.activeDisposables.add(dispose);
    try {
      synth.triggerAttackRelease(frequency, durationSeconds, audioTargetTimeSeconds, volume);
    } catch {
      // ignore
    }

    // Tie cleanup/onStop to the synced clock.
    const ctx = tone.getContext();
    const offset = this.getSyncNowSeconds() - ctx.currentTime;
    const endTargetTime = audioTargetTimeSeconds + offset + durationSeconds;
    this.scheduledCallbacks.push({
      id: this.nextCallbackId++,
      targetTime: endTargetTime,
      callback: () => {
        this.activeDisposables.delete(dispose);
        dispose();
        if (this.isStopped) return;
        try {
          options?.onStop?.();
        } catch {
          // ignore
        }
      },
    });
    this.startSyncLoop();
  }

  schedule(
    sound: Sound,
    delayMs: number,
    onSync: () => void,
    options?: {
      onEnded?: () => void;
      onPreSync?: () => void;
      visualOffsetMs?: number;
      onPostSync?: () => void;
      postDelayMs?: number;
      postVisualOffsetMs?: number;
      onResolvedAsset?: (asset: ResolvedSoundAsset) => void;
    },
  ): void {
    this.configureToneForLowLatency();
    const tone = getToneLoadedSync();
    const {
      onEnded,
      onPreSync,
      onPostSync,
      visualOffsetMs = 0,
      postDelayMs,
      postVisualOffsetMs,
      onResolvedAsset,
    } = options ?? {};
    const resolved = this.resolveBufferForSound(sound);
    const key = resolved?.key ?? (this.config.useVariants ? `${sound}_v01` : sound);
    const buffer = resolved?.buffer ?? null;
    const variant = resolved?.variant;
    const url = this.getSoundUrl(sound, variant);
    onResolvedAsset?.({
      sound,
      key,
      url,
      durationSeconds:
        buffer && Number.isFinite(buffer.duration) && buffer.duration > 0
          ? buffer.duration
          : this.getCueDurationSeconds(),
    });

    void (async () => {
      let activeTone = tone;
      let ctx = activeTone?.getContext?.();
      if (ctx?.state === 'suspended') {
        activeTone?.start().catch((error: unknown) => {
          audioLog.debug('Tone.start failed (ignored)', error);
        });
      }
      let canPlayAudio = ctx?.state === 'running';
      await this.ensureStimulusPathReady(canPlayAudio);
      if (this.isStopped) return;
      activeTone = getToneLoadedSync();
      ctx = activeTone?.getContext?.();
      canPlayAudio = ctx?.state === 'running';

      const delaySeconds = delayMs / 1000;
      let syncTargetTime = this.getSyncNowSeconds() + delaySeconds;
      const { effectiveMs: effectiveVisualOffsetMs, clamped: visualOffsetClamped } =
        this.getEffectiveVisualOffsetMs(visualOffsetMs, delayMs);
      const postDelayMsSafe = postDelayMs !== undefined ? Math.max(0, postDelayMs) : null;
      const postDelaySeconds = postDelayMsSafe !== null ? postDelayMsSafe / 1000 : null;
      const postOffsetBase = postVisualOffsetMs !== undefined ? postVisualOffsetMs : visualOffsetMs;
      const { effectiveMs: effectivePostOffsetMs } =
        postDelayMsSafe !== null
          ? this.getEffectiveVisualOffsetMs(postOffsetBase, postDelayMsSafe)
          : { effectiveMs: 0 };

      let onEndedBoundToPlayerStop = false;
      if (canPlayAudio && activeTone && buffer) {
        const requestedAudioTargetTime = activeTone.now() + delaySeconds;
        const { startTimeSeconds: audioTargetTime, shiftSeconds } =
          this.getSafeAudioStartTimeSeconds(activeTone, requestedAudioTargetTime);
        if (shiftSeconds > 0) {
          syncTargetTime += shiftSeconds;
        }
        this.playBufferAt(buffer, audioTargetTime, { onStop: onEnded });
        onEndedBoundToPlayerStop = typeof onEnded === 'function';
      } else if (canPlayAudio && activeTone && !buffer) {
        const requestedAudioTargetTime = activeTone.now() + delaySeconds;
        const { startTimeSeconds: audioTargetTime, shiftSeconds } =
          this.getSafeAudioStartTimeSeconds(activeTone, requestedAudioTargetTime);
        if (shiftSeconds > 0) {
          syncTargetTime += shiftSeconds;
        }
        this.playSynthCueAt(sound, audioTargetTime, { onStop: onEnded });
        onEndedBoundToPlayerStop = typeof onEnded === 'function';
      }

      if (onPreSync) {
        this.visualPreScheduledCount++;
        if (visualOffsetClamped) this.visualOffsetClampedCount++;
        const visualTargetTime = syncTargetTime - effectiveVisualOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: visualTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_pre', (now - visualTargetTime) * 1000);
            this.startSynchronizedTexture(canPlayAudio, activeTone);
            onPreSync();
          },
        });
        this.startSyncLoop();
      }

      if (onPostSync && postDelaySeconds !== null) {
        const postTargetTime = syncTargetTime + postDelaySeconds - effectivePostOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: postTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_post', (now - postTargetTime) * 1000);
            this.stopSynchronizedTexture();
            onPostSync();
          },
        });
        this.startSyncLoop();
      } else if (this.shouldPlaySynchronizedTexture() && canPlayAudio && activeTone) {
        const isOscPreset = AudioService.isOscillatorPreset(this.config.audioPreset ?? '');
        if (isOscPreset) {
          const handle = this.playOscillatorTexture(activeTone.now() + delaySeconds);
          if (handle) {
            const dur = postDelaySeconds ?? this.getCueDurationSeconds();
            setTimeout(handle, dur * 1000);
          }
        } else {
          const fallbackDuration = postDelaySeconds ?? this.getCueDurationSeconds();
          this.playNoiseBurst(activeTone.now() + delaySeconds, fallbackDuration);
        }
      }

      this.scheduledCallbacks.push({
        id: this.nextCallbackId++,
        targetTime: syncTargetTime,
        callback: () => {
          const now = this.getUnforcedSyncNowSeconds();
          this.recordTimingSample('audio_sync', (now - syncTargetTime) * 1000);
          onSync();
        },
      });

      if (onEnded && !onEndedBoundToPlayerStop) {
        const durationSeconds =
          buffer && Number.isFinite(buffer.duration) && buffer.duration > 0
            ? buffer.duration
            : this.cueMode === 'synth' || this.buffers.size === 0
              ? this.getCueDurationSeconds()
              : this.getFallbackSoundDurationSeconds();
        const endTargetTime = syncTargetTime + durationSeconds;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: endTargetTime,
          callback: onEnded,
        });
      }

      this.startSyncLoop();
    })();
  }

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
      onResolvedAsset?: (asset: ResolvedSoundAsset) => void;
    },
  ): void {
    this.configureToneForLowLatency();
    if (sounds.length === 0) {
      const {
        onPreSync,
        onPostSync,
        visualOffsetMs = 0,
        postDelayMs,
        postVisualOffsetMs,
      } = options ?? {};
      const delaySeconds = delayMs / 1000;
      const syncTargetTime = this.getSyncNowSeconds() + delaySeconds;
      const { effectiveMs: effectiveVisualOffsetMs, clamped: visualOffsetClamped } =
        this.getEffectiveVisualOffsetMs(visualOffsetMs, delayMs);
      const postDelayMsSafe = postDelayMs !== undefined ? Math.max(0, postDelayMs) : null;
      const postDelaySeconds = postDelayMsSafe !== null ? postDelayMsSafe / 1000 : null;
      const postOffsetBase = postVisualOffsetMs !== undefined ? postVisualOffsetMs : visualOffsetMs;
      const { effectiveMs: effectivePostOffsetMs } =
        postDelayMsSafe !== null
          ? this.getEffectiveVisualOffsetMs(postOffsetBase, postDelayMsSafe)
          : { effectiveMs: 0 };

      if (onPreSync) {
        this.visualPreScheduledCount++;
        if (visualOffsetClamped) this.visualOffsetClampedCount++;
        const visualTargetTime = syncTargetTime - effectiveVisualOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: visualTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_pre', (now - visualTargetTime) * 1000);
            onPreSync();
          },
        });
      }

      if (onPostSync && postDelaySeconds !== null) {
        const postTargetTime = syncTargetTime + postDelaySeconds - effectivePostOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: postTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_post', (now - postTargetTime) * 1000);
            onPostSync();
          },
        });
      }

      this.scheduledCallbacks.push({
        id: this.nextCallbackId++,
        targetTime: syncTargetTime,
        callback: () => {
          const now = this.getUnforcedSyncNowSeconds();
          this.recordTimingSample('audio_sync', (now - syncTargetTime) * 1000);
          onSync();
        },
      });

      if (options?.onEnded) {
        const fallbackMs = Math.round(this.getFallbackSoundDurationSeconds() * 1000);
        const endTargetTime = syncTargetTime + Math.max(0.001, fallbackMs / 1000);
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: endTargetTime,
          callback: options.onEnded,
        });
      }
      this.startSyncLoop();
      return;
    }

    if (sounds.length === 1 && sounds[0]) {
      this.schedule(sounds[0], delayMs, onSync, {
        onEnded: options?.onEnded,
        onPreSync: options?.onPreSync,
        visualOffsetMs: options?.visualOffsetMs,
        onPostSync: options?.onPostSync,
        postDelayMs: options?.postDelayMs,
        postVisualOffsetMs: options?.postVisualOffsetMs,
      });
      return;
    }

    const {
      staggerMs = MULTI_AUDIO_STAGGER_MS,
      onEnded,
      onPreSync,
      visualOffsetMs = 0,
      onPostSync,
      postDelayMs,
      postVisualOffsetMs,
      onResolvedAsset,
    } = options ?? {};
    const delaySeconds = delayMs / 1000;
    let syncTargetTime = this.getSyncNowSeconds() + delaySeconds;
    const staggerSeconds = staggerMs / 1000;
    const { effectiveMs: effectiveVisualOffsetMs, clamped: visualOffsetClamped } =
      this.getEffectiveVisualOffsetMs(visualOffsetMs, delayMs);
    const postDelayMsSafe = postDelayMs !== undefined ? Math.max(0, postDelayMs) : null;
    const postDelaySeconds = postDelayMsSafe !== null ? postDelayMsSafe / 1000 : null;
    const postOffsetBase = postVisualOffsetMs !== undefined ? postVisualOffsetMs : visualOffsetMs;
    const { effectiveMs: effectivePostOffsetMs } =
      postDelayMsSafe !== null
        ? this.getEffectiveVisualOffsetMs(postOffsetBase, postDelayMsSafe)
        : { effectiveMs: 0 };

    void (async () => {
      let tone = getToneLoadedSync();
      let ctx = tone?.getContext?.();
      if (ctx?.state === 'suspended') {
        tone?.start().catch((error: unknown) => {
          audioLog.debug('Tone.start failed (ignored)', error);
        });
      }
      let canPlayAudio = ctx?.state === 'running';
      await this.ensureStimulusPathReady(canPlayAudio);
      if (this.isStopped) return;
      tone = getToneLoadedSync();
      ctx = tone?.getContext?.();
      canPlayAudio = ctx?.state === 'running';

      let baseAudioTargetTime: number | null = null;
      if (canPlayAudio && tone) {
        const requestedBase = tone.now() + delaySeconds;
        const { startTimeSeconds: safeBase, shiftSeconds } = this.getSafeAudioStartTimeSeconds(
          tone,
          requestedBase,
        );
        baseAudioTargetTime = safeBase;
        if (shiftSeconds > 0) {
          syncTargetTime += shiftSeconds;
        }
      }

      if (onPreSync) {
        this.visualPreScheduledCount++;
        if (visualOffsetClamped) this.visualOffsetClampedCount++;
        const visualTargetTime = syncTargetTime - effectiveVisualOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: visualTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_pre', (now - visualTargetTime) * 1000);
            this.startSynchronizedTexture(canPlayAudio, tone);
            onPreSync();
          },
        });
      }

      if (onPostSync && postDelaySeconds !== null) {
        const postTargetTime = syncTargetTime + postDelaySeconds - effectivePostOffsetMs / 1000;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: postTargetTime,
          callback: () => {
            const now = this.getUnforcedSyncNowSeconds();
            this.recordTimingSample('visual_post', (now - postTargetTime) * 1000);
            this.stopSynchronizedTexture();
            onPostSync();
          },
        });
      } else if (this.shouldPlaySynchronizedTexture() && canPlayAudio && tone) {
        const isOscPreset = AudioService.isOscillatorPreset(this.config.audioPreset ?? '');
        if (isOscPreset) {
          const handle = this.playOscillatorTexture(tone.now() + delaySeconds);
          if (handle) {
            const dur = postDelaySeconds ?? this.getCueDurationSeconds();
            setTimeout(handle, dur * 1000);
          }
        } else {
          const fallbackDuration = postDelaySeconds ?? this.getCueDurationSeconds();
          this.playNoiseBurst(tone.now() + delaySeconds, fallbackDuration);
        }
      }

      let maxDuration = 0;
      let pendingPlayerStops = 0;
      let onEndedFired = false;
      for (let i = 0; i < sounds.length; i++) {
        const sound = sounds[i];
        if (!sound) continue;

        const resolved = this.resolveBufferForSound(sound);
        const key = resolved?.key ?? (this.config.useVariants ? `${sound}_v01` : sound);
        const buffer = resolved?.buffer ?? null;
        const variant = resolved?.variant;
        const url = this.getSoundUrl(sound, variant);
        onResolvedAsset?.({
          sound,
          key,
          url,
          durationSeconds:
            buffer && Number.isFinite(buffer.duration) && buffer.duration > 0
              ? buffer.duration
              : this.getCueDurationSeconds(),
        });

        if (canPlayAudio && tone && baseAudioTargetTime !== null) {
          const audioTargetTime = baseAudioTargetTime + i * staggerSeconds;
          const pan =
            sounds.length === 2
              ? i === 0
                ? -0.75
                : 0.75
              : sounds.length > 2
                ? (i / (sounds.length - 1)) * 2 - 1
                : 0;

          const onStop = onEnded
            ? () => {
                pendingPlayerStops = Math.max(0, pendingPlayerStops - 1);
                if (onEndedFired || pendingPlayerStops > 0) return;
                onEndedFired = true;
                onEnded();
              }
            : undefined;

          if (buffer) {
            if (onEnded) pendingPlayerStops++;
            this.playBufferAt(buffer, audioTargetTime, { pan, onStop });

            const endTime = i * staggerSeconds + buffer.duration;
            if (endTime > maxDuration) {
              maxDuration = endTime;
            }
          } else {
            if (this.cueMode === 'buffers' && this.buffers.size > 0) {
              audioLog.warn(`Sound not loaded (falling back to synth): ${key}`);
            }
            if (onEnded) pendingPlayerStops++;
            this.playSynthCueAt(sound, audioTargetTime, { pan, onStop });

            const endTime = i * staggerSeconds + this.getCueDurationSeconds();
            if (endTime > maxDuration) {
              maxDuration = endTime;
            }
          }
        }
      }

      this.scheduledCallbacks.push({
        id: this.nextCallbackId++,
        targetTime: syncTargetTime,
        callback: () => {
          const now = this.getUnforcedSyncNowSeconds();
          this.recordTimingSample('audio_sync', (now - syncTargetTime) * 1000);
          onSync();
        },
      });

      if (onEnded && pendingPlayerStops === 0) {
        const effectiveMaxDuration =
          maxDuration > 0
            ? maxDuration
            : this.getFallbackSoundDurationSeconds() +
              Math.max(0, sounds.length - 1) * staggerSeconds;
        const endTargetTime = syncTargetTime + effectiveMaxDuration;
        this.scheduledCallbacks.push({
          id: this.nextCallbackId++,
          targetTime: endTargetTime,
          callback: onEnded,
        });
      }

      this.startSyncLoop();
    })();
  }

  scheduleOperation(operation: BWArithmeticOperation, delayMs: number): void {
    this.configureToneForLowLatency();
    const tone = getToneLoadedSync();
    const ctx = tone?.getContext?.();
    if (ctx?.state === 'suspended') {
      tone?.start().catch((error: unknown) => {
        audioLog.debug('Tone.start failed (ignored)', error);
      });
    }
    if (ctx?.state !== 'running') return;

    const delaySeconds = delayMs / 1000;
    const startTime = (tone?.now?.() ?? 0) + delaySeconds;
    this.playOperationCueAt(operation, startTime);
  }

  scheduleCallback(delayMs: number, callback: () => void): number {
    const callbackId = this.nextCallbackId++;
    const targetTime = this.getSyncNowSeconds() + delayMs / 1000;
    this.scheduledCallbacks.push({ id: callbackId, targetTime, callback });
    this.startSyncLoop();
    return callbackId;
  }

  cancelCallback(callbackId: number): void {
    this.scheduledCallbacks = this.scheduledCallbacks.filter((cb) => cb.id !== callbackId);
  }

  getCurrentTime(): number {
    return this.getSyncNowSeconds();
  }

  getTimingDiagnostics(): {
    count: number;
    avgAbsLateMs: number;
    p95AbsLateMs: number;
    maxAbsLateMs: number;
    byKind: Record<
      string,
      { count: number; avgAbsLateMs: number; p95AbsLateMs: number; maxAbsLateMs: number }
    >;
    visualCalibrationDeltaMs: number;
    visualPreScheduledCount: number;
    visualOffsetClampedCount: number;
    visualOffsetClampedRate: number;
    cueMode: 'buffers' | 'synth';
    cueFallbackReason: string | null;
    bufferCount: number;
    codec: { aacM4a: boolean | null };
  } {
    const samples = this.timingSamples;
    if (samples.length === 0) {
      return {
        count: 0,
        avgAbsLateMs: 0,
        p95AbsLateMs: 0,
        maxAbsLateMs: 0,
        byKind: {},
        visualCalibrationDeltaMs: this.adaptiveVisualOffsetDeltaMs,
        visualPreScheduledCount: this.visualPreScheduledCount,
        visualOffsetClampedCount: this.visualOffsetClampedCount,
        visualOffsetClampedRate:
          this.visualPreScheduledCount > 0
            ? this.visualOffsetClampedCount / this.visualPreScheduledCount
            : 0,
        cueMode: this.cueMode,
        cueFallbackReason: this.cueFallbackReason,
        bufferCount: this.buffers.size,
        codec: {
          aacM4a: AudioService.supportsAacM4a(),
        },
      };
    }

    const computeStats = (lateMsValues: number[]) => {
      if (lateMsValues.length === 0) {
        return { count: 0, avgAbsLateMs: 0, p95AbsLateMs: 0, maxAbsLateMs: 0 };
      }
      const abs = lateMsValues.map((v) => Math.abs(v)).sort((a, b) => a - b);
      const sumAbs = abs.reduce((acc, v) => acc + v, 0);
      const p95Index = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
      return {
        count: abs.length,
        avgAbsLateMs: sumAbs / abs.length,
        p95AbsLateMs: abs[p95Index] ?? 0,
        maxAbsLateMs: abs[abs.length - 1] ?? 0,
      };
    };

    const overall = computeStats(samples.map((s) => s.lateMs));
    return {
      ...overall,
      byKind: (() => {
        const buckets = new Map<string, number[]>();
        for (const s of samples) {
          const existing = buckets.get(s.kind);
          if (existing) existing.push(s.lateMs);
          else buckets.set(s.kind, [s.lateMs]);
        }
        const out: Record<
          string,
          { count: number; avgAbsLateMs: number; p95AbsLateMs: number; maxAbsLateMs: number }
        > = {};
        for (const [kind, lateMsValues] of buckets.entries()) {
          out[kind] = computeStats(lateMsValues);
        }
        return out;
      })(),
      visualCalibrationDeltaMs: this.adaptiveVisualOffsetDeltaMs,
      visualPreScheduledCount: this.visualPreScheduledCount,
      visualOffsetClampedCount: this.visualOffsetClampedCount,
      visualOffsetClampedRate:
        this.visualPreScheduledCount > 0
          ? this.visualOffsetClampedCount / this.visualPreScheduledCount
          : 0,
      cueMode: this.cueMode,
      cueFallbackReason: this.cueFallbackReason,
      bufferCount: this.buffers.size,
      codec: {
        aacM4a: AudioService.supportsAacM4a(),
      },
    };
  }

  setAutoVisualCalibrationEnabled(enabled: boolean): void {
    this.autoVisualCalibrationEnabled = enabled;
  }

  isAutoVisualCalibrationEnabled(): boolean {
    return this.autoVisualCalibrationEnabled;
  }

  resetAutoVisualCalibration(): void {
    this.adaptiveVisualOffsetDeltaMs = 0;
  }

  getAutoVisualCalibrationDeltaMs(): number {
    return this.adaptiveVisualOffsetDeltaMs;
  }

  isReady(): boolean {
    if (this.loadedRevision !== this.configRevision) return false;
    if (this.cueMode === 'synth') return true;
    return this.buffers.size > 0;
  }

  isAudioContextRunning(): boolean {
    return this.getAudioContextState() === 'running';
  }

  /**
   * Get the underlying AudioContext.currentTime (Tone.js context), in seconds.
   * Returns null when the context is not running (autoplay lock / suspended).
   *
   * Note: this is the raw audio clock (not the perf-aligned sync clock).
   */
  getAudioContextTimeSeconds(): number | null {
    try {
      const ctx = Tone.getContext();
      return ctx.state === 'running' ? ctx.currentTime : null;
    } catch {
      return null;
    }
  }

  stopAll(): void {
    this.isStopped = true;
    // After forced stops (visibility changes, pause), some devices/webviews can "cold start" again.
    // Mark warmup stale so the next resume/play primes the pipeline.
    this.markWarmupStale();

    // Stop all active players
    for (const player of this.activePlayers) {
      try {
        player.stop();
        player.dispose();
      } catch {
        // ignore
      }
    }
    this.activePlayers.clear();

    this.stopNoiseLayer();

    for (const dispose of this.activeDisposables) {
      try {
        dispose();
      } catch {
        // ignore
      }
    }
    this.activeDisposables.clear();

    this.scheduledCallbacks = [];
    this.stopSyncLoop();
    this.lastToneScheduleTimeSeconds = Number.NEGATIVE_INFINITY;
    this.lastFeedbackScheduleTimeSeconds = Number.NEGATIVE_INFINITY;
  }

  dispose(): void {
    this.preloadAbortController?.abort();
    this.preloadAbortController = null;
    this.preloadPromise = null;
    this.preloadRevision = null;
    this.stopAll();
    this.unloadAll();
    this.stopNoiseLayer();
    this.feedbackSynth?.dispose();
    this.feedbackSynth = null;
    this.masterGain?.dispose();
    this.masterGain = null;
    this.brownNoiseBuffer = null;
    this.binauralBuffers.clear();
    this.hasWarmedUp = false;
    this.warmupPromise = null;
    this.loadedRevision = -1;
    this.lastToneScheduleTimeSeconds = Number.NEGATIVE_INFINITY;
    this.lastFeedbackScheduleTimeSeconds = Number.NEGATIVE_INFINITY;
  }

  /**
   * Resume the audio context after suspension (e.g., iOS background).
   * Handles the non-standard "interrupted" state used by iOS Safari.
   * Includes a timeout to prevent hanging on iOS where resume() can stay pending.
   *
   * iOS PWA STANDALONE: Has stricter restrictions. May need multiple attempts.
   */
  async resume(): Promise<boolean> {
    await ensureToneLoaded();
    this.configureToneForLowLatency();

    const state = this.getAudioContextState();
    const isIOSPWA = AudioService.isIOSPWAStandalone();

    if (isIOSPWA) {
      audioLog.info(`[AudioService] iOS PWA standalone resume attempt, current state: ${state}`);
    }

    // Already running - just ensure warmup
    if (state === 'running') {
      this.ensureMasterGain();
      await this.warmupAudioPipelineOnce();
      return true;
    }

    // Handle suspended or interrupted states
    if (state === 'suspended' || state === 'interrupted') {
      // iOS PWA STANDALONE: Try HTML audio unlock first to establish audio session
      // This bypasses the stricter Web Audio restrictions in PWA mode
      if (isIOSPWA) {
        audioLog.info('[AudioService] iOS PWA: Attempting HTML audio unlock first');
        await this.unlockIOSAudioViaHtmlAudio();
      }

      // For iOS PWA standalone, we may need multiple attempts
      const maxAttempts = isIOSPWA ? 3 : 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt > 1) {
            audioLog.debug(`[AudioService] iOS PWA retry attempt ${attempt}/${maxAttempts}`);
            // Small delay between retries
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Try Tone.start() (handles most cases)
          const resumePromise = Tone.start();

          // Add timeout for iOS where resume() can hang indefinitely
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Resume timeout')), 2000);
          });

          await Promise.race([resumePromise, timeoutPromise]);

          // If still not running, try direct rawContext access (iOS "interrupted" state workaround)
          if (this.getAudioContextState() !== 'running') {
            const rawContext = this.getRawAudioContext();
            if (rawContext && typeof rawContext.resume === 'function') {
              audioLog.debug('[AudioService] Trying rawContext.resume() for iOS interrupted state');
              await Promise.race([
                rawContext.resume(),
                new Promise<void>((_, reject) =>
                  setTimeout(() => reject(new Error('Raw resume timeout')), 1000),
                ),
              ]);
            }
          }

          // Check if we succeeded
          if (this.getAudioContextState() === 'running') {
            if (isIOSPWA) {
              audioLog.info(`[AudioService] iOS PWA resume succeeded on attempt ${attempt}`);
            }
            break;
          }
        } catch (error) {
          audioLog.debug(`[AudioService] Resume attempt ${attempt} failed:`, error);
          if (attempt === maxAttempts) {
            return false;
          }
        }
      }
    }

    // Check final state
    if (this.getAudioContextState() === 'running') {
      this.ensureMasterGain();
      await this.warmupAudioPipelineOnce();
      return true;
    }

    if (isIOSPWA) {
      audioLog.warn(
        '[AudioService] iOS PWA resume failed after all attempts. ' +
          'This may require a user tap directly on an audio-triggering element.',
      );
    }

    return false;
  }

  /**
   * Get the audio context state, including the non-standard "interrupted" state on iOS.
   */
  getAudioContextState(): 'running' | 'suspended' | 'closed' | 'interrupted' {
    try {
      const ctx = Tone.getContext();
      // Tone.js context state
      const state = ctx.state as string;

      // iOS Safari uses a non-standard "interrupted" state
      if (state === 'interrupted') {
        return 'interrupted';
      }

      // Also check rawContext for iOS
      const rawContext = this.getRawAudioContext();
      if (rawContext && (rawContext.state as string) === 'interrupted') {
        return 'interrupted';
      }

      return state as 'running' | 'suspended' | 'closed';
    } catch {
      return 'suspended';
    }
  }

  /**
   * Get the raw AudioContext from Tone.js (bypassing the wrapper).
   * Needed for iOS workarounds where Tone.start() doesn't handle "interrupted" state.
   */
  private getRawAudioContext(): AudioContext | null {
    try {
      const ctx = Tone.getContext();
      // Tone.js stores the raw context in _context or rawContext
      const raw =
        (ctx as unknown as { _context?: AudioContext; rawContext?: AudioContext })._context ??
        (ctx as unknown as { rawContext?: AudioContext }).rawContext ??
        null;
      return raw;
    } catch {
      return null;
    }
  }

  /**
   * Check if the current device is iOS (Safari or PWA).
   */
  static isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  /**
   * Check if running as PWA standalone (added to home screen).
   * iOS PWA standalone has stricter audio restrictions than Safari.
   */
  static isPWAStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    // iOS Safari A2HS (Add to Home Screen) flag
    const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;

    // Standard display-mode media query (Chrome, Edge, Firefox)
    const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

    return iosStandalone || displayModeStandalone;
  }

  /**
   * Check if running as iOS PWA standalone (strictest audio restrictions).
   */
  static isIOSPWAStandalone(): boolean {
    return AudioService.isIOS() && AudioService.isPWAStandalone();
  }

  /**
   * Unlock iOS audio using an HTML <audio> element.
   *
   * iOS PWA standalone mode has very strict audio restrictions.
   * The Web Audio API may stay suspended even after user interaction.
   * Playing a silent sound through an HTML <audio> element can establish
   * an audio session that allows Web Audio to work.
   *
   * This technique is used by:
   * - https://github.com/nickclaw/nern/tree/main/packages/unmute
   * - https://github.com/feross/unmute-ios-audio
   * - https://github.com/swevans/unmute
   *
   * @returns Promise that resolves to true if unlock succeeded
   */
  private async unlockIOSAudioViaHtmlAudio(): Promise<boolean> {
    if (typeof document === 'undefined') return false;

    return new Promise((resolve) => {
      try {
        const audio = document.createElement('audio');

        // Prevent Control Center media widget from appearing
        audio.setAttribute('x-webkit-airplay', 'deny');
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
        audio.loop = false;
        audio.volume = 1; // Sample is (near-)silent; keep volume > 0 so iOS doesn't optimize it away.
        audio.src = SILENT_WAV_BASE64;

        // iOS requires the audio element to be in the DOM for some versions
        audio.style.position = 'absolute';
        audio.style.left = '-9999px';
        audio.style.top = '-9999px';
        document.body.appendChild(audio);

        audio.load();

        const cleanup = () => {
          try {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            if (audio.parentNode) {
              audio.parentNode.removeChild(audio);
            }
          } catch {
            // Ignore cleanup errors
          }
        };

        // Set a timeout in case play() hangs
        const timeout = setTimeout(() => {
          audioLog.debug('[AudioService] HTML audio unlock timed out');
          cleanup();
          resolve(false);
        }, 2000);

        audio
          .play()
          .then(() => {
            clearTimeout(timeout);
            audioLog.info('[AudioService] HTML audio unlock succeeded');
            // Let it play for a brief moment to establish the audio session
            setTimeout(() => {
              cleanup();
              resolve(true);
            }, 100);
          })
          .catch((error) => {
            clearTimeout(timeout);
            audioLog.debug('[AudioService] HTML audio unlock failed:', error);
            cleanup();
            resolve(false);
          });
      } catch (error) {
        audioLog.debug('[AudioService] HTML audio unlock error:', error);
        resolve(false);
      }
    });
  }

  // =============================================================================
  // Sound Effects (raw Web Audio API — bypasses Tone.Synth state tracking)
  // =============================================================================

  /**
   * Get the raw AudioContext if it is currently running.
   * Returns null if Tone isn't loaded or context isn't in 'running' state.
   */
  private getRunningRawAudioContext(): AudioContext | null {
    try {
      const tone = getToneLoadedSync();
      if (!tone) return null;
      const ctx = tone.getContext();
      if (ctx.state !== 'running') return null;
      const raw = ctx.rawContext;
      if (raw && typeof (raw as AudioContext).createOscillator === 'function') {
        return raw as AudioContext;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Get the native AudioNode destination for feedback sounds.
   * Uses masterGain.input (the underlying native GainNode).
   * Falls back to rawCtx.destination if masterGain isn't available.
   */
  private getFeedbackDestination(rawCtx: AudioContext): AudioNode {
    const mg = this.ensureMasterGain();
    if (mg) {
      // Tone.js ToneAudioNode.input exposes the underlying native AudioNode
      const nativeInput = (mg as unknown as { input: AudioNode }).input;
      if (nativeInput && typeof nativeInput.connect === 'function') {
        return nativeInput;
      }
    }
    return rawCtx.destination;
  }

  /**
   * Play a short sine-wave feedback tone using raw Web Audio API.
   * Each call creates one-shot OscillatorNode + GainNode — no Tone.js state issues.
   * Returns true if played synchronously, false if audio context isn't ready.
   */
  private playFeedbackToneRaw(frequency: number, durationSeconds: number, volume: number): boolean {
    const rawCtx = this.getRunningRawAudioContext();
    if (!rawCtx) return false;

    const dest = this.getFeedbackDestination(rawCtx);
    const now = rawCtx.currentTime;

    const osc = rawCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    const gain = rawCtx.createGain();
    // Envelope: fast attack (5ms), exponential decay
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.005);
    gain.gain.setTargetAtTime(0.001, now + 0.005, durationSeconds * 0.3);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + durationSeconds + 0.05);

    osc.onended = () => {
      try {
        osc.disconnect();
      } catch {
        /* ignore */
      }
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };

    return true;
  }

  /**
   * Play a feedback sound: sync raw Web Audio if context is running,
   * async fallback (start context first) otherwise.
   */
  private fireFeedbackSound(
    frequency: number,
    durationSeconds: number,
    volume: number,
    label: string,
  ): void {
    if (this.playFeedbackToneRaw(frequency, durationSeconds, volume)) return;
    void this.ensureAudioRunningAndWarmed()
      .then((ok) => {
        if (!ok) return;
        this.playFeedbackToneRaw(frequency, durationSeconds, volume);
      })
      .catch((error) => {
        audioLog.debug(`[AudioService] ${label} failed (ignored)`, error);
      });
  }

  playCorrect(): void {
    this.fireFeedbackSound(880, 0.08, 0.15, 'playCorrect');
  }

  playIncorrect(): void {
    this.fireFeedbackSound(220, 0.12, 0.15, 'playIncorrect');
  }

  playClick(): void {
    this.fireFeedbackSound(600, 0.03, 0.08, 'playClick');
  }

  playCountdownTick(value: 3 | 2 | 1 | 0): void {
    const urgency = (3 - value) / 3; // 3 -> 0, 0 -> 1
    const noteByStep: Record<3 | 2 | 1 | 0, number> = {
      3: 520,
      2: 560,
      1: 600,
      0: 680,
    };
    const durationByStep: Record<3 | 2 | 1 | 0, number> = {
      3: 0.028,
      2: 0.03,
      1: 0.032,
      0: 0.036,
    };
    const velocity = 0.07 + urgency * 0.035;
    this.fireFeedbackSound(noteByStep[value], durationByStep[value], velocity, 'playCountdownTick');
  }

  playSwipe(): void {
    this.configureToneForLowLatency();
    void this.ensureAudioRunningAndWarmed()
      .then((ok) => {
        if (!ok) return;

        const tone = getToneLoadedSync();
        if (!tone) return;

        const masterGain = this.ensureMasterGain();
        if (!masterGain) return;

        const tryDispose = (node: unknown): void => {
          try {
            (node as { dispose?: () => void } | null | undefined)?.dispose?.();
          } catch {
            // ignore
          }
        };

        let noise: unknown = null;
        let filter: unknown = null;
        let envelope: unknown = null;

        try {
          // "Ink drop" style: filtered noise with descending pitch envelope
          // Creates a soft whoosh/swipe sound
          const now = this.getStrictlyIncreasingFeedbackTime(tone);

          // Noise source with bandpass filter
          const createdNoise = new tone.Noise('pink').start(now).stop(now + 0.12);
          const createdFilter = new tone.Filter({
            type: 'bandpass',
            frequency: 800,
            Q: 1.5,
          }).connect(masterGain);
          const createdEnvelope = new tone.AmplitudeEnvelope({
            attack: 0.01,
            decay: 0.08,
            sustain: 0,
            release: 0.03,
          }).connect(createdFilter);

          noise = createdNoise;
          filter = createdFilter;
          envelope = createdEnvelope;

          createdNoise.connect(createdEnvelope);

          // Descending filter sweep for "whoosh" effect
          createdFilter.frequency.setValueAtTime(1200, now);
          createdFilter.frequency.exponentialRampToValueAtTime(400, now + 0.1);

          createdEnvelope.triggerAttackRelease(0.08, now, 0.12);

          // Cleanup after sound finishes
          setTimeout(() => {
            tryDispose(noise);
            tryDispose(filter);
            tryDispose(envelope);
          }, 200);
        } catch (error) {
          tryDispose(noise);
          tryDispose(filter);
          tryDispose(envelope);
          throw error;
        }
      })
      .catch((error) => {
        audioLog.debug('[AudioService] playSwipe failed (ignored)', error);
      });
  }

  getVolumeLevel(): number | null {
    return this.masterGain ? this.masterGain.gain.value : null;
  }

  private ensureMasterGain(): Gain | null {
    const tone = getToneLoadedSync();
    if (!tone) {
      // Try to heal by starting an async load, but don't crash the caller.
      void ensureToneLoaded().catch(() => {});
      return null;
    }
    if (!this.masterGain) {
      try {
        this.masterGain = new tone.Gain(1).toDestination();
      } catch (error) {
        audioLog.warn('[AudioService] Failed to create master gain', error);
        return null;
      }
    }
    return this.masterGain;
  }

  // ---------------------------------------------------------------------------
  // Runtime pink noise layer
  // ---------------------------------------------------------------------------

  /**
   * Generate a pink noise AudioBuffer using Paul Kellet's refined method.
   * Cached after first call. Uses the native Web Audio API (no Tone.js dependency).
   * @see https://noisehack.com/generate-noise-web-audio-api/
   */

  /**
   * Generate a brown noise buffer (1/f² spectrum, -6 dB/octave).
   * Brown noise is perceived as smoother and more comfortable than pink noise.
   * Generated via integration of white noise (random walk) with leaky integrator.
   */
  private getOrCreateBrownNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.brownNoiseBuffer) return this.brownNoiseBuffer;

    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * 4); // 4s buffer
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Leaky integrator: each sample = 0.99 * previous + white * 0.1
    // The leak prevents DC drift; the coefficient shapes the -6 dB/octave slope.
    let prev = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      prev = prev * 0.99 + white * 0.1;
      data[i] = prev;
    }

    // Normalize to [-0.5, 0.5] to match pink noise amplitude range
    let max = 0;
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i] as number);
      if (abs > max) max = abs;
    }
    if (max > 0) {
      const scale = 0.5 / max;
      for (let i = 0; i < length; i++) {
        data[i] = (data[i] as number) * scale;
      }
    }

    this.brownNoiseBuffer = buffer;
    return buffer;
  }

  /**
   * Pre-rendered stereo buffer for binaural beat.
   * 4 seconds at native sample rate. Cached by "freqL_freqR" key.
   */
  private getOrCreateBinauralBuffer(ctx: AudioContext, freqL: number, freqR: number): AudioBuffer {
    const cacheKey = `${freqL}_${freqR}`;
    const cached = this.binauralBuffers.get(cacheKey);
    if (cached) return cached;

    const sampleRate = ctx.sampleRate;
    const duration = 4; // seconds
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const amp = 1.0;
    const twoPi = 2 * Math.PI;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      left[i] = amp * Math.sin(twoPi * freqL * t);
      right[i] = amp * Math.sin(twoPi * freqR * t);
    }

    this.binauralBuffers.set(cacheKey, buffer);
    return buffer;
  }

  /**
   * Noise burst parameters per sync preset.
   * Duration is dynamic (matches visual stimulus). Only the spectral
   * shaping (filter) and amplitude envelope (attack/release) differ.
   *
   * Design principles (psychoacoustic research):
   * - Lowpass filtering removes fatiguing 2-5 kHz content (ear canal resonance peak)
   * - Brown/pink noise with -3 to -6 dB/octave rolloff rated most comfortable
   * - Attack 15-50 ms = crisp temporal marker without startle; release 40-100 ms = smooth
   * - attack / release: gain envelope ramp times in seconds (0 = flat)
   * - filter: optional BiquadFilter config applied before the gain node
   */
  private static readonly NOISE_BURST_PARAMS: Record<
    string,
    {
      attack: number;
      release: number;
      noiseType: 'brown';

      filter?: { type: BiquadFilterType; frequency: number; Q: number };
    }
  > = {};

  /**
   * Oscillator-based texture presets. These use OscillatorNode instead of noise
   * buffers — they are continuous by construction, no looping artifacts.
   */
  private static readonly OSCILLATOR_TEXTURE_PARAMS: Record<
    string,
    {
      label: string;
      /** Array of oscillators: each has a frequency, type, and optional detune (cents). */
      oscillators: Array<{ freq: number; type: OscillatorType; detune?: number; gain?: number }>;
      /** Optional per-ear panning for binaural effects (-1 = left, +1 = right). */
      panning?: number[];
    }
  > = {
    // Binaural Theta: 200 Hz left + 206 Hz right → 6 Hz theta (relaxation).
    // Carrier frequency is overridden at runtime by config.binauralCarrierHz.
    sync_binaural_theta: {
      label: 'Binaural Theta',
      oscillators: [
        { freq: 200, type: 'sine' },
        { freq: 206, type: 'sine' },
      ],
      panning: [-1, 1],
    },
    // Binaural Alpha: 200 Hz left + 210 Hz right → 10 Hz alpha (calm focus).
    sync_binaural_alpha: {
      label: 'Binaural Alpha',
      oscillators: [
        { freq: 200, type: 'sine' },
        { freq: 210, type: 'sine' },
      ],
      panning: [-1, 1],
    },
    // Binaural Beta: 200 Hz left + 220 Hz right → 20 Hz beta (concentration).
    sync_binaural_beta: {
      label: 'Binaural Beta',
      oscillators: [
        { freq: 200, type: 'sine' },
        { freq: 220, type: 'sine' },
      ],
      panning: [-1, 1],
    },
    // Binaural Gamma: 200 Hz left + 240 Hz right → 40 Hz gamma (intense focus).
    sync_binaural_gamma: {
      label: 'Binaural Gamma',
      oscillators: [
        { freq: 200, type: 'sine' },
        { freq: 240, type: 'sine' },
      ],
      panning: [-1, 1],
    },
  };

  /**
   * Check if a preset uses oscillator-based textures (vs noise buffers).
   */
  private static isOscillatorPreset(preset: string): boolean {
    return preset in AudioService.OSCILLATOR_TEXTURE_PARAMS;
  }

  /** Check if a preset uses the pre-rendered binaural buffer path. */
  private static isBinauralPreset(preset: string): boolean {
    return preset.startsWith('sync_binaural');
  }

  /**
   * Play an oscillator-based texture. Returns a stop function.
   * Uses OscillatorNode — continuous by nature, no buffer needed.
   */
  private playOscillatorTexture(atTime: number): (() => void) | null {
    const level = this.config.pinkNoiseLevel ?? 0;
    if (level <= 0) return null;

    const tone = getToneLoadedSync();
    if (!tone) return null;
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return null;

    const preset = this.config.audioPreset ?? 'sync_drone';

    // Binaural preset uses a pre-rendered stereo buffer for hard L/R separation
    if (AudioService.isBinauralPreset(preset)) {
      return this.playBinauralBuffer(atTime);
    }

    const params = AudioService.OSCILLATOR_TEXTURE_PARAMS[preset];
    if (!params) return null;

    try {
      const rawCtx = tone.getContext().rawContext as AudioContext;
      const oscillators: OscillatorNode[] = [];
      const gainNodes: GainNode[] = [];
      const panners: StereoPannerNode[] = [];

      for (let i = 0; i < params.oscillators.length; i++) {
        const oscDef = params.oscillators[i];
        if (!oscDef) continue;

        const osc = rawCtx.createOscillator();
        osc.type = oscDef.type;
        osc.frequency.value = oscDef.freq;
        if (oscDef.detune) osc.detune.value = oscDef.detune;

        // Per-oscillator gain (for mixing relative levels)
        const oscGain = rawCtx.createGain();
        const oscLevel = level * (oscDef.gain ?? 1.0);
        // 5ms fade-in anti-click
        oscGain.gain.setValueAtTime(0, atTime);
        oscGain.gain.linearRampToValueAtTime(oscLevel, atTime + 0.005);

        osc.connect(oscGain);

        // Optional panning (for binaural)
        if (params.panning && params.panning[i] !== undefined) {
          const panner = rawCtx.createStereoPanner();
          panner.pan.value = params.panning[i] as number;
          oscGain.connect(panner);
          panner.connect(masterGain.input as unknown as AudioNode);
          panners.push(panner);
        } else {
          oscGain.connect(masterGain.input as unknown as AudioNode);
        }

        osc.start(atTime);
        oscillators.push(osc);
        gainNodes.push(oscGain);
      }

      let stopped = false;
      const cleanup = () => {
        for (const osc of oscillators) {
          try {
            osc.disconnect();
          } catch {
            /* ignore */
          }
        }
        for (const g of gainNodes) {
          try {
            g.disconnect();
          } catch {
            /* ignore */
          }
        }
        for (const p of panners) {
          try {
            p.disconnect();
          } catch {
            /* ignore */
          }
        }
        this.activeDisposables.delete(cleanup);
      };
      this.activeDisposables.add(cleanup);

      // Return stop function
      const stopFn = () => {
        if (stopped) return;
        stopped = true;
        const stopNow = rawCtx.currentTime;
        // Fade out all gains in 5ms
        for (const g of gainNodes) {
          g.gain.cancelScheduledValues(stopNow);
          g.gain.setValueAtTime(g.gain.value, stopNow);
          g.gain.linearRampToValueAtTime(0, stopNow + 0.005);
        }
        // Stop all oscillators after fade
        for (const osc of oscillators) {
          osc.stop(stopNow + 0.006);
        }
        setTimeout(cleanup, 20);
      };
      return stopFn;
    } catch (error) {
      audioLog.debug('[AudioService] playOscillatorTexture failed', error);
      return null;
    }
  }

  /**
   * Play the pre-rendered binaural stereo buffer.
   * Reads freqL/freqR from OSCILLATOR_TEXTURE_PARAMS for the active preset.
   * Bypasses StereoPannerNode entirely — hard L/R separation by construction.
   */
  private playBinauralBuffer(atTime: number): (() => void) | null {
    const level = this.config.pinkNoiseLevel ?? 0;
    if (level <= 0) return null;

    const tone = getToneLoadedSync();
    if (!tone) return null;
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return null;

    try {
      const preset = this.config.audioPreset ?? 'sync_binaural_gamma';
      const params = AudioService.OSCILLATOR_TEXTURE_PARAMS[preset];
      const defaultFreqL = params?.oscillators[0]?.freq ?? 200;
      const defaultFreqR = params?.oscillators[1]?.freq ?? 240;
      // Apply carrier frequency override: shift both tones so the beat frequency is preserved
      const carrierHz = this.config.binauralCarrierHz ?? 200;
      const beatHz = defaultFreqR - defaultFreqL;
      const freqL = carrierHz;
      const freqR = carrierHz + beatHz;

      const rawCtx = tone.getContext().rawContext as AudioContext;
      const buffer = this.getOrCreateBinauralBuffer(rawCtx, freqL, freqR);

      const source = rawCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gainNode = rawCtx.createGain();
      // 40ms fade-in for smooth onset that "wraps" the stimulus
      gainNode.gain.setValueAtTime(0, atTime);
      gainNode.gain.linearRampToValueAtTime(level, atTime + 0.04);

      source.connect(gainNode);
      gainNode.connect(masterGain.input as unknown as AudioNode);
      source.start(atTime);

      let stopped = false;
      const cleanup = () => {
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        try {
          gainNode.disconnect();
        } catch {
          /* ignore */
        }
        this.activeDisposables.delete(cleanup);
      };
      this.activeDisposables.add(cleanup);

      const stopFn = () => {
        if (stopped) return;
        stopped = true;
        const stopNow = rawCtx.currentTime;
        gainNode.gain.cancelScheduledValues(stopNow);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopNow);
        // 60ms fade-out so the binaural "trails" slightly after the stimulus
        gainNode.gain.linearRampToValueAtTime(0, stopNow + 0.06);
        source.stop(stopNow + 0.07);
        setTimeout(cleanup, 100);
      };
      return stopFn;
    } catch (error) {
      audioLog.debug('[AudioService] playBinauralBuffer failed', error);
      return null;
    }
  }

  /**
   * Play a noise burst aligned with the visual stimulus.
   * Spectral shaping (filter) and amplitude envelope depend on the active audioPreset.
   * Uses native Web Audio API (AudioBufferSourceNode) for reliable scheduled playback.
   *
   * @param atTime  Web Audio context time at which the burst starts.
   * @param durationOverride  Duration in seconds; defaults to getCueDurationSeconds().
   */
  private playNoiseBurst(atTime: number, durationOverride?: number): (() => void) | null {
    const level = this.config.pinkNoiseLevel ?? 0;
    if (level <= 0) return null;

    const tone = getToneLoadedSync();
    if (!tone) return null;
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return null;

    try {
      const duration = durationOverride ?? this.getCueDurationSeconds();
      const preset = this.config.audioPreset ?? 'sync_soft';
      // biome-ignore lint/style/noNonNullAssertion: sync_soft always exists in the map
      const params = (AudioService.NOISE_BURST_PARAMS[preset] ??
        AudioService.NOISE_BURST_PARAMS['sync_soft'])!;
      const rawCtx = tone.getContext().rawContext as AudioContext;

      const noiseBuffer = this.getOrCreateBrownNoiseBuffer(rawCtx);

      const source = rawCtx.createBufferSource();
      source.buffer = noiseBuffer;
      // Loop if burst exceeds buffer length (safety for BrainWorkshop long stimuli)
      if (duration > noiseBuffer.duration) {
        source.loop = true;
      }

      // Build signal chain: source → [filter] → gain → masterGain
      let lastNode: AudioNode = source;

      // Optional frequency filter
      let filterNode: BiquadFilterNode | null = null;
      if (params.filter) {
        filterNode = rawCtx.createBiquadFilter();
        filterNode.type = params.filter.type;
        filterNode.frequency.value = params.filter.frequency;
        filterNode.Q.value = params.filter.Q;
        lastNode.connect(filterNode);
        lastNode = filterNode;
      }

      // Gain node — with or without envelope
      const gainNode = rawCtx.createGain();
      if (params.attack > 0 || params.release > 0) {
        // Shaped envelope: ramp up → sustain → ramp down
        gainNode.gain.setValueAtTime(0, atTime);
        gainNode.gain.linearRampToValueAtTime(level, atTime + params.attack);
        const sustainEnd = atTime + duration - params.release;
        if (sustainEnd > atTime + params.attack) {
          gainNode.gain.setValueAtTime(level, sustainEnd);
        }
        gainNode.gain.linearRampToValueAtTime(0, atTime + duration);
      } else {
        // Flat gain, no envelope
        gainNode.gain.value = level;
      }

      lastNode.connect(gainNode);
      // Tone.Gain.input is the underlying native GainNode
      gainNode.connect(masterGain.input as unknown as AudioNode);

      source.start(atTime, 0, duration);

      // Cleanup on end
      let stopped = false;
      const cleanup = () => {
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        if (filterNode) {
          try {
            filterNode.disconnect();
          } catch {
            /* ignore */
          }
        }
        try {
          gainNode.disconnect();
        } catch {
          /* ignore */
        }
        this.activeDisposables.delete(cleanup);
      };
      source.onended = cleanup;
      this.activeDisposables.add(cleanup);

      // Return a stop function for callback-driven lifecycle
      const stopFn = () => {
        if (stopped) return;
        stopped = true;
        const stopNow = rawCtx.currentTime;
        gainNode.gain.cancelScheduledValues(stopNow);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopNow);
        gainNode.gain.linearRampToValueAtTime(0, stopNow + 0.005);
        source.stop(stopNow + 0.006);
        setTimeout(cleanup, 20);
      };
      return stopFn;
    } catch (error) {
      audioLog.debug('[AudioService] playNoiseBurst failed', error);
      return null;
    }
  }

  /** No-op kept for call sites in stopAll/dispose. */
  private stopNoiseLayer(): void {
    if (!this.activeNoiseStop) return;
    try {
      this.activeNoiseStop();
    } catch {
      // ignore
    } finally {
      this.activeNoiseStop = null;
    }
  }

  private ensureFeedbackSynth(): void {
    if (this.feedbackSynth) return;

    const masterGain = this.ensureMasterGain();
    if (!masterGain) return;
    this.feedbackSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.005,
        decay: 0.08,
        sustain: 0,
        release: 0.01,
      },
    }).connect(masterGain);
  }

  /**
   * Warmup the audio pipeline by playing a silent tone.
   * This primes the audio context and avoids the "first sound is muffled" issue.
   *
   * iOS PWA standalone requires a slightly higher volume to actually unlock audio.
   */
  private async warmupAudioPipelineOnce(): Promise<void> {
    if (this.hasWarmedUp) return;
    if (this.warmupPromise) return this.warmupPromise;

    let didWarm = false;
    const promise = new Promise<void>((resolve) => {
      this.configureToneForLowLatency();

      const tone = getToneLoadedSync();
      if (!tone) {
        resolve();
        return;
      }
      // Only meaningful once the context is running.
      if (tone.getContext().state !== 'running') {
        resolve();
        return;
      }
      didWarm = true;

      // Play a very short, near-inaudible tone to prime the pipeline.
      // Using a non-zero gain helps on some devices where 0 can be optimized away.
      // IMPORTANT: Schedule slightly in the future to give the audio thread time to prepare.
      // Without this offset, the first sound can be muffled because lookAhead is set to 0.
      //
      // Keep warmup near-inaudible.
      // iOS PWA standalone unlocking is handled separately (HTML <audio> unlock) to avoid
      // using an audible warmup gain.
      const warmupGain = 0.0001;

      const destination = this.ensureMasterGain();
      if (!destination) {
        resolve();
        return;
      }
      const silentGain = new tone.Gain(warmupGain).connect(destination);
      const osc = new tone.Oscillator(440, 'sine').connect(silentGain);

      // Also warm up the buffer playback path (some devices "muffle" the first decoded sample playback).
      const warmupBuffers = Array.from(this.buffers.values()).slice(0, 3);
      const bufferGain =
        warmupBuffers.length > 0 ? new tone.Gain(warmupGain).connect(destination) : null;
      const bufferPlayers = warmupBuffers
        .map((buffer) => (bufferGain ? new tone.Player(buffer).connect(bufferGain) : null))
        .filter((player): player is Player => player !== null);

      // Use a small offset (50ms) to allow the audio thread to prepare.
      // This is critical when lookAhead is 0 - scheduling at exact currentTime can cause clipping.
      const ctx = tone.getContext();
      const warmupOffset = 0.05;
      const startTime = ctx.currentTime + warmupOffset;
      osc.start(startTime);
      osc.stop(startTime + 0.08);

      const bufferSpacingSeconds = 0.03;
      const maxBufferDurationSeconds = bufferPlayers.reduce((max, player, index) => {
        const buffer = warmupBuffers[index];
        const duration = Math.max(0.02, Math.min(0.06, buffer?.duration ?? 0.05));
        const t = startTime + index * bufferSpacingSeconds;
        try {
          player.start(t, 0, duration);
          player.stop(t + duration);
        } catch {
          // ignore
        }
        return Math.max(max, duration);
      }, 0);

      // Wait for warmup to complete (offset + buffer slices + small safety margin).
      const warmupSeconds =
        warmupOffset +
        Math.max(0, bufferPlayers.length - 1) * bufferSpacingSeconds +
        Math.max(0.08, maxBufferDurationSeconds) +
        0.03;
      const warmupMs = Math.max(200, Math.round(warmupSeconds * 1000));

      setTimeout(() => {
        try {
          osc.dispose();
          silentGain.dispose();
        } catch {
          // ignore
        }
        try {
          // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach side-effect only
          bufferPlayers.forEach((player) => player.dispose());
          bufferGain?.dispose();
        } catch {
          // ignore
        }
        resolve();
      }, warmupMs);
    })
      .catch((error: unknown) => {
        audioLog.debug('Audio warmup failed (ignored)', error);
      })
      .finally(() => {
        if (didWarm) {
          this.hasWarmedUp = true;
        }
        this.warmupPromise = null;
      });

    this.warmupPromise = promise;
    return promise;
  }

  private async ensureAudioRunningAndWarmed(): Promise<boolean> {
    try {
      await ensureToneLoaded();
    } catch (error) {
      audioLog.warn('[AudioService] Failed to load Tone (audio disabled)', error);
      return false;
    }
    this.configureToneForLowLatency();
    if (Tone.getContext().state === 'running') {
      this.ensureMasterGain();
      await this.warmupAudioPipelineOnce();
      return true;
    }

    if (this.startPromise) return this.startPromise;

    const promise = (async () => {
      try {
        // iOS: establish an audio session via HTML audio (helps speaker routing, and PWA strictness).
        if (AudioService.isIOS()) {
          await this.unlockIOSHtmlAudioIfNeeded();
        }
        await Tone.start();
      } catch {
        return false;
      }
      if (Tone.getContext().state !== 'running') return false;
      this.ensureMasterGain();
      await this.warmupAudioPipelineOnce();
      return true;
    })().finally(() => {
      this.startPromise = null;
    });

    this.startPromise = promise;
    return promise;
  }

  private unlockIOSHtmlAudioIfNeeded(): Promise<boolean> {
    if (!AudioService.isIOS()) return Promise.resolve(false);
    if (this.iosHtmlAudioUnlocked) return Promise.resolve(true);
    if (this.iosHtmlAudioUnlockPromise) return this.iosHtmlAudioUnlockPromise;

    this.iosHtmlAudioUnlockPromise = this.unlockIOSAudioViaHtmlAudio()
      .then((ok) => {
        if (ok) this.iosHtmlAudioUnlocked = true;
        return ok;
      })
      .finally(() => {
        this.iosHtmlAudioUnlockPromise = null;
      });

    return this.iosHtmlAudioUnlockPromise;
  }

  /**
   * Play a buffer immediately (creates a new player for this playback)
   */
  private playBufferNow(
    buffer: ToneAudioBuffer,
    startAheadSeconds = AudioService.MIN_START_AHEAD_SECONDS,
  ): void {
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return;
    const player = new Tone.Player(buffer).connect(masterGain);
    this.activePlayers.add(player);
    player.onstop = () => {
      this.activePlayers.delete(player);
      player.dispose();
    };
    try {
      const tone = getToneLoadedSync();
      if (tone && tone.getContext().state === 'running') {
        const requested = tone.now();
        const { startTimeSeconds } = this.getSafeAudioStartTimeSeconds(
          tone,
          requested,
          startAheadSeconds,
        );
        player.start(startTimeSeconds);
        return;
      }
    } catch {
      // ignore, fall back to immediate start
    }
    player.start();
  }

  /**
   * Play a buffer at a scheduled time with optional panning
   */
  private playBufferAt(
    buffer: ToneAudioBuffer,
    time: number,
    options?: { pan?: number; onStop?: () => void },
  ): void {
    const masterGain = this.ensureMasterGain();
    if (!masterGain) return;

    // NOTE: Noise burst scheduling has moved to schedule() / scheduleMultiple()
    // so the burst aligns with the visual stimulus onset, not the audio buffer start.

    const player = new Tone.Player(buffer);
    const notifyStop = () => {
      // Ignore forced stops (pause/stopAll), notify only natural playback end.
      if (this.isStopped) return;
      try {
        options?.onStop?.();
      } catch {
        // ignore
      }
    };

    if (options?.pan !== undefined && Number.isFinite(options.pan)) {
      const panner = new Tone.Panner(Math.max(-1, Math.min(1, options.pan))).connect(masterGain);
      player.connect(panner);
      player.onstop = () => {
        this.activePlayers.delete(player);
        panner.dispose();
        player.dispose();
        notifyStop();
      };
    } else {
      player.connect(masterGain);
      player.onstop = () => {
        this.activePlayers.delete(player);
        player.dispose();
        notifyStop();
      };
    }

    this.activePlayers.add(player);

    // For sync presets: clamp playback to exactly getCueDurationSeconds() (500ms).
    // This ensures player.onstop fires at a deterministic time regardless of
    // AAC decoder padding, matching the timing contract the xState machines expect.
    if (isSyncPreset(this.config.audioPreset)) {
      const targetDuration = this.getCueDurationSeconds();
      if (buffer.duration > targetDuration) {
        // Buffer has AAC padding — center and clamp.
        const offset = (buffer.duration - targetDuration) / 2;
        player.start(time, offset, targetDuration);
      } else {
        player.start(time, 0, targetDuration);
      }
    } else {
      player.start(time);
    }
  }

  // =============================================================================
  // Private - Sync Loop (preserved RAF-based approach)
  // =============================================================================

  private startSyncLoop(): void {
    if (this.rafId !== null) return;
    this.isStopped = false;

    const tick = () => {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        const perfNowMs = performance.now();
        if (this.lastRafPerfNowMs !== null) {
          const deltaMs = perfNowMs - this.lastRafPerfNowMs;
          if (deltaMs > 0 && Number.isFinite(deltaMs)) {
            const clamped = Math.max(8, Math.min(50, deltaMs));
            this.rafFrameMsEstimate = this.rafFrameMsEstimate * 0.9 + clamped * 0.1;
          }
        }
        this.lastRafPerfNowMs = perfNowMs;
      }

      if (this.scheduledCallbacks.length === 0) {
        this.rafId = null;
        return;
      }

      // Tone may not be loaded (tests / audio disabled); the sync loop still
      // drives visual callbacks using the perf clock.
      const tone = getToneLoadedSync();
      try {
        if (tone && tone.getContext().state === 'suspended') {
          tone.start().catch((error: unknown) => {
            audioLog.debug('Tone.start failed (ignored)', error);
          });
        }
      } catch {
        // ignore
      }

      const now = this.getSyncNowSeconds();
      const pending = this.scheduledCallbacks;
      this.scheduledCallbacks = [];

      for (const event of pending) {
        if (this.isStopped) {
          this.rafId = null;
          return;
        }

        if (now >= event.targetTime) {
          this.recordTimingSample('callback', (now - event.targetTime) * 1000);
          this.runAtTime(event.targetTime, event.callback);
        } else {
          this.scheduledCallbacks.push(event);
        }
      }

      if (this.isStopped) {
        this.rafId = null;
        return;
      }

      if (this.scheduledCallbacks.length > 0) {
        this.rafId = this.requestFrame(tick);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = this.requestFrame(tick);
  }

  private stopSyncLoop(): void {
    if (this.rafId !== null) {
      this.cancelFrame(this.rafId);
      this.rafId = null;
    }
  }

  private getSyncNowSeconds(): number {
    if (this.forcedNowSeconds !== null) return this.forcedNowSeconds;

    const perfNowSeconds =
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) / 1000;

    // Audio clock is preferred when available, but audio may not be initialized yet.
    // In that case, fall back to a monotonic performance clock.
    const tone = toneLoaded ? Tone : getToneSync();
    if (tone && !toneLoaded) {
      Tone = tone as ToneModule;
      toneLoaded = true;
    }

    const ctx = tone?.getContext?.();
    if (!ctx) {
      if (perfNowSeconds < this.lastSyncNowSeconds) return this.lastSyncNowSeconds;
      this.lastSyncNowSeconds = perfNowSeconds;
      return perfNowSeconds;
    }
    if (ctx.state === 'running') {
      const audioNowSeconds = ctx.currentTime;
      const candidateOffset = perfNowSeconds - audioNowSeconds;

      if (this.syncOffsetSeconds === null) {
        this.syncOffsetSeconds = candidateOffset;
      } else {
        const driftSeconds = Math.abs(audioNowSeconds + this.syncOffsetSeconds - perfNowSeconds);
        if (driftSeconds > 0.25) {
          this.syncOffsetSeconds = candidateOffset;
        }
      }

      const synced = audioNowSeconds + (this.syncOffsetSeconds ?? 0);
      if (synced < this.lastSyncNowSeconds) return this.lastSyncNowSeconds;
      this.lastSyncNowSeconds = synced;
      return synced;
    }

    if (perfNowSeconds < this.lastSyncNowSeconds) return this.lastSyncNowSeconds;
    this.lastSyncNowSeconds = perfNowSeconds;
    return perfNowSeconds;
  }

  private getUnforcedSyncNowSeconds(): number {
    const prev = this.forcedNowSeconds;
    this.forcedNowSeconds = null;
    try {
      return this.getSyncNowSeconds();
    } finally {
      this.forcedNowSeconds = prev;
    }
  }

  private requestFrame(callback: () => void): number {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(() => callback());
    }
    return setTimeout(callback, 16) as unknown as number;
  }

  private cancelFrame(frameId: number): void {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameId);
      return;
    }
    clearTimeout(frameId);
  }

  private recordTimingSample(kind: string, lateMs: number): void {
    this.timingSamples.push({ kind, lateMs });
    if (this.timingSamples.length > this.timingSampleLimit) {
      this.timingSamples.shift();
    }

    if (this.autoVisualCalibrationEnabled && kind === 'visual_pre' && Number.isFinite(lateMs)) {
      const setpointMs = -this.rafFrameMsEstimate / 2;
      const errorMs = lateMs - setpointMs;
      const k = 0.12;
      const next = this.adaptiveVisualOffsetDeltaMs + errorMs * k;
      this.adaptiveVisualOffsetDeltaMs = Math.max(-20, Math.min(40, next));
    }

    if (!this.isTimingDebugEnabled()) return;

    this.timingLoggedCount++;
    if (this.timingLoggedCount % this.timingLogEvery !== 0) return;

    const diag = this.getTimingDiagnostics();
    const visualPre = diag.byKind['visual_pre'];
    const audioSync = diag.byKind['audio_sync'];
    const clampPct = (diag.visualOffsetClampedRate * 100).toFixed(0);
    audioLog.debug(
      `Timing diag: overall p95=${diag.p95AbsLateMs.toFixed(1)}ms max=${diag.maxAbsLateMs.toFixed(1)}ms | ` +
        `visual_pre p95=${(visualPre?.p95AbsLateMs ?? 0).toFixed(1)}ms max=${(visualPre?.maxAbsLateMs ?? 0).toFixed(1)}ms | ` +
        `audio_sync p95=${(audioSync?.p95AbsLateMs ?? 0).toFixed(1)}ms | ` +
        `frame≈${this.rafFrameMsEstimate.toFixed(1)}ms delta=${diag.visualCalibrationDeltaMs.toFixed(1)}ms clamp=${clampPct}% (${diag.visualOffsetClampedCount}/${diag.visualPreScheduledCount})`,
    );
  }

  private getEffectiveVisualOffsetMs(
    baseOffsetMs: number,
    delayMs: number,
  ): { effectiveMs: number; clamped: boolean } {
    const base = Number.isFinite(baseOffsetMs) ? baseOffsetMs : 0;
    const maxOffset = Math.max(0, delayMs);
    const effective = base + this.adaptiveVisualOffsetDeltaMs;
    // Allow negative offsets (visual fires after audio) — clamp only to delayMs ceiling.
    const effectiveMs = Math.min(maxOffset, effective);
    return { effectiveMs, clamped: effectiveMs !== effective };
  }

  private isTimingDebugEnabled(): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('ND_AUDIO_DEBUG_TIMING') === '1';
      }
      return false;
    } catch {
      return false;
    }
  }

  private maybeExposeDebugApi(): void {
    if (!this.isTimingDebugEnabled()) return;
    try {
      globalThis.__ND_AUDIO__ = this;
    } catch {
      // ignore
    }
  }

  // =============================================================================
  // Private - Audio Operations
  // =============================================================================

  private playOperationCueAt(operation: BWArithmeticOperation, startTime: number): void {
    this.ensureFeedbackSynth();
    const synth = this.feedbackSynth;
    if (!synth) return;
    const tone = getToneLoadedSync();
    if (!tone) return;

    const volume = 0.12;
    const base = this.getStrictlyIncreasingToneTimeSeconds(tone, startTime);
    switch (operation) {
      case 'add':
        synth.triggerAttackRelease(880, '120ms', base, volume);
        break;
      case 'subtract':
        synth.triggerAttackRelease(440, '120ms', base, volume);
        break;
      case 'multiply':
        synth.triggerAttackRelease(660, '80ms', base, volume);
        synth.triggerAttackRelease(
          660,
          '80ms',
          this.getStrictlyIncreasingToneTimeSeconds(tone, base + 0.11),
          volume,
        );
        break;
      case 'divide':
        synth.triggerAttackRelease(880, '60ms', base, volume);
        synth.triggerAttackRelease(
          660,
          '60ms',
          this.getStrictlyIncreasingToneTimeSeconds(tone, base + 0.08),
          volume,
        );
        synth.triggerAttackRelease(
          440,
          '60ms',
          this.getStrictlyIncreasingToneTimeSeconds(tone, base + 0.16),
          volume,
        );
        break;
    }
  }

  private runAtTime(targetTimeSeconds: number, fn: () => void): void {
    const prev = this.forcedNowSeconds;
    this.forcedNowSeconds = targetTimeSeconds;
    try {
      fn();
    } finally {
      this.forcedNowSeconds = prev;
    }
  }

  // =============================================================================
  // Private - Preloading
  // =============================================================================

  private static readonly SUPPORTED_AUDIO_LANGUAGES: ReadonlySet<Language> = new Set([
    'fr',
    'en',
    'de',
    'es',
    'pl',
    'ar',
  ]);

  private getEffectiveAudioLanguage(): Language {
    if (AudioService.SUPPORTED_AUDIO_LANGUAGES.has(this.config.language)) {
      return this.config.language;
    }
    return 'en';
  }

  private getSoundUrl(sound: Sound, variant?: string): string {
    const effectiveLanguage = this.getEffectiveAudioLanguage();

    const extension = 'm4a';
    // Asset packs currently ship only 2 voice folders (voice1/voice2). Clamp any legacy/invalid
    // voice value to avoid 404s and silent stimuli.
    const requestedVoice = this.config.voice;
    const voiceFolder =
      requestedVoice === 'voice2_homme_standard' ? requestedVoice : 'voice1_femme_standard';
    const langFolder = `alphabet_audio_${effectiveLanguage}_varied_aac`;

    if (this.config.useVariants && variant) {
      return `/sounds/${langFolder}/${voiceFolder}/${sound}_${variant}.${extension}`;
    }
    return `/sounds/${langFolder}/${voiceFolder}/${sound}.${extension}`;
  }

  private async ensureBuffersLoaded(): Promise<void> {
    if (typeof fetch !== 'function') {
      audioLog.error('Cannot preload audio buffers: fetch() is not available');
      return;
    }

    const revision = this.configRevision;
    if (this.loadedRevision === revision) {
      return;
    }
    if (this.preloadPromise && this.preloadRevision === revision) {
      return this.preloadPromise;
    }

    const requiredCodec = 'audio/mp4; codecs="mp4a.40.2"';
    const codecSupport = AudioService.supportsAacM4a();

    if (codecSupport === false) {
      this.enableSynthCues(`Codec unsupported (${requiredCodec})`);
      this.preloadAbortController?.abort();
      this.preloadAbortController = null;
      this.preloadPromise = null;
      this.preloadRevision = null;
      this.buffers.clear();
      this.loadedRevision = revision;
      return;
    }

    // If codec support is unknown (null), try decodeAudioData and fallback if needed.
    this.disableSynthCues();

    this.preloadAbortController?.abort();
    const controller = new AbortController();
    this.preloadAbortController = controller;
    this.preloadRevision = revision;

    const soundsToLoad: Array<{ key: string; url: string }> = [];

    for (const toneValue of TONE_VALUES) {
      soundsToLoad.push({
        key: `${AudioService.TONE_BUFFER_KEY_PREFIX}${toneValue}`,
        url: AudioService.SAMPLE_URL_BY_TONE_VALUE[toneValue],
      });
    }

    if (this.config.useVariants) {
      for (const sound of this.GAME_SOUNDS) {
        for (const variant of this.VARIANT_LABELS) {
          const key = `${sound}_${variant}`;
          const url = this.getSoundUrl(sound, variant);
          soundsToLoad.push({ key, url });
        }
      }
    } else {
      for (const sound of this.GAME_SOUNDS) {
        const url = this.getSoundUrl(sound);
        soundsToLoad.push({ key: sound, url });
      }
    }

    const loadingState: LoadingState = {
      total: soundsToLoad.length,
      loaded: 0,
      failed: [],
    };

    // Clear existing buffers
    this.buffers.clear();

    // Keep preload responsive: too much parallel decode creates long main-thread tasks on mobile/web.
    const concurrency = 2;
    const pending = [...soundsToLoad];
    const signal = controller.signal;
    const ctx = Tone.getContext();

    const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (pending.length > 0) {
        if (signal.aborted) return;
        if (this.configRevision !== revision) return;

        const next = pending.pop();
        if (!next) return;

        const { key, url } = next;
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
          const arrayBuffer = await res.arrayBuffer();
          if (signal.aborted) return;
          if (this.configRevision !== revision) return;

          // Decode using Tone's current context (same underlying AudioContext as playback).
          // Safari can require a copy of the buffer.
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          if (signal.aborted) return;
          if (this.configRevision !== revision) return;

          const buffer = new Tone.ToneAudioBuffer(decoded);
          if (signal.aborted) return;
          if (this.configRevision !== revision) return;

          this.buffers.set(key, buffer);

          // Track duration for fallback
          if (Number.isFinite(buffer.duration) && buffer.duration > 0) {
            const clamped = Math.max(0.1, Math.min(2, buffer.duration));
            this.lastKnownSoundDurationSeconds =
              this.lastKnownSoundDurationSeconds * 0.9 + clamped * 0.1;
          }
          loadingState.loaded++;
        } catch (error) {
          if (signal.aborted) return;
          if (this.configRevision !== revision) return;
          loadingState.failed.push(key);
          audioLog.error(`Failed to load ${key}:`, error);
        } finally {
          if (!signal.aborted && this.configRevision === revision) {
            await yieldToMainThread();
          }
        }
      }
    });

    const doPreload = async () => {
      try {
        await Promise.all(workers);
        if (signal.aborted) return;
        if (this.configRevision !== revision) return;

        if (this.buffers.size === 0 && loadingState.failed.length > 0) {
          this.enableSynthCues(
            `All ${loadingState.total} audio files failed to decode/load (likely unsupported codec)`,
          );
        }

        if (loadingState.failed.length > 0) {
          audioLog.warn(
            `[AudioService] ${loadingState.failed.length}/${loadingState.total} sounds failed to load:`,
            loadingState.failed,
          );
        } else {
          audioLog.info(
            `All ${loadingState.total} sounds loaded successfully${this.config.useVariants ? ' (with variants)' : ''}`,
          );
        }

        this.loadedRevision = revision;
      } finally {
        if (this.preloadRevision === revision) {
          this.preloadPromise = null;
          this.preloadRevision = null;
          this.preloadAbortController = null;
        }
      }
    };

    this.preloadPromise = doPreload();
    return this.preloadPromise;
  }

  private getFallbackSoundDurationSeconds(): number {
    const v = this.lastKnownSoundDurationSeconds;
    if (!Number.isFinite(v) || v <= 0) return 0.5;
    return Math.max(0.1, Math.min(2, v));
  }

  private unloadAll(): void {
    // Buffers don't need explicit disposal in Tone.js
    this.buffers.clear();
    this.loadedRevision = -1;
  }
}

// =============================================================================
// Singleton export
// =============================================================================

export const audioService = new AudioService();
