/**
 * AdminSyncTab - Audio/visual sync monitoring tools
 *
 * Provides:
 * - Live AudioService timing diagnostics (visual_pre / audio_sync)
 * - Controls for auto visual calibration + debug timing flag
 * - Built-in AV sync test runner (500ms stimulus)
 */

import {
  SOUNDS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS,
  type AudioPreset,
  type Sound,
} from '@neurodual/logic';
import type { FreezeEvent, LongTaskEvent } from '@neurodual/logic';
import { Button, Card, useMountEffect } from '@neurodual/ui';
import { ArrowClockwise, DownloadSimple, Pause, Play, Stop, Wrench } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPorts } from '../../providers';

interface TimingDiagnostics {
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
}

interface Measurement {
  trial: number;
  sound: Sound;
  soundKey?: string;
  soundUrl?: string;
  decodedDurationMs?: number | null;
  audioPreset: AudioPreset;
  bufferMs: number;
  visualOffsetMs: number;
  stimulusDurationMs: number;

  // Tone.js / AudioContext clock snapshots (seconds; null if audio context not running)
  audioCtxAtTrialStartS?: number | null;
  audioCtxAtVisualCallbackS?: number | null;
  audioCtxAtAudioSyncCallbackS?: number | null;
  audioCtxAtVisualHideCallbackS?: number | null;
  audioCtxAtAudioEndedCallbackS?: number | null;

  visualCallbackAtMs?: number;
  visualPaintAtMs?: number;
  visualHideCallbackAtMs?: number;
  visualHidePaintAtMs?: number;

  audioSyncCallbackAtMs?: number;
  audioEndedCallbackAtMs?: number;

  // Derived - start (separates scheduling vs render)
  deltaStartCallbackMs?: number; // audioSyncCallback - visualCallback
  showRenderDelayMs?: number; // visualPaint - visualCallback
  deltaStartPaintMs?: number; // audioSyncCallback - visualPaint

  // Derived - end (separates scheduling vs render)
  deltaEndCallbackMs?: number; // audioEndedCallback - visualHideCallback
  hideRenderDelayMs?: number; // visualHidePaint - visualHideCallback
  deltaEndPaintMs?: number; // audioEndedCallback - visualHidePaint

  // Derived - durations
  visualDurationCallbackMs?: number; // visualHideCallback - visualCallback
  visualDurationPaintMs?: number; // visualHidePaint - visualPaint
  audioDurationCallbackMs?: number; // audioEndedCallback - audioSyncCallback

  // Derived - errors (relative to stimulusDurationMs)
  durationErrorCallbackMs?: number;
  durationErrorPaintMs?: number;
  audioDurationErrorMs?: number;

  // Derived - stimulus window relative to audio sync (most actionable for AV sync)
  stimulusWindowFromAudioCallbackMs?: number; // visualHideCallback - audioSyncCallback
  stimulusWindowErrorFromAudioCallbackMs?: number; // stimulusWindowFromAudioCallbackMs - stimulusDurationMs
  stimulusWindowFromAudioPaintMs?: number; // visualHidePaint - audioSyncCallback
  stimulusWindowErrorFromAudioPaintMs?: number; // stimulusWindowFromAudioPaintMs - stimulusDurationMs

  // Diagnostics - main thread hitches during the trial window
  longTaskCount?: number;
  longTaskMaxMs?: number;
  longTaskMaxContext?: string | null;
  longTaskMaxName?: string;
  freezeCount?: number;
  freezeMaxMs?: number;
  freezeMaxContext?: string | null;
}

function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function afterNextPaint(cb: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

function getDeltaColorClass(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  if (abs < 20) return 'text-green-400';
  if (abs < 50) return 'text-yellow-400';
  return 'text-red-400';
}

function getRenderLagColorClass(deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  if (abs < 16) return 'text-green-400';
  if (abs < 33) return 'text-yellow-400';
  return 'text-red-400';
}

function getTrialTag(m: Measurement): { label: string; className: string } {
  const dur = m.stimulusDurationMs;
  const minExpected = Math.max(150, dur * 0.5);
  const hitch =
    (m.audioDurationCallbackMs !== undefined && m.audioDurationCallbackMs < minExpected) ||
    (m.visualDurationPaintMs !== undefined && m.visualDurationPaintMs < minExpected) ||
    (m.stimulusWindowFromAudioPaintMs !== undefined &&
      m.stimulusWindowFromAudioPaintMs < minExpected) ||
    (m.longTaskMaxMs !== undefined && m.longTaskMaxMs > 200) ||
    (m.freezeMaxMs !== undefined && m.freezeMaxMs > 0);
  if (hitch) return { label: 'HITCH', className: 'text-red-400' };

  const audioBad =
    Math.abs(m.audioDurationErrorMs ?? 0) > 50 ||
    Math.abs(m.stimulusWindowErrorFromAudioPaintMs ?? 0) > 50;
  if (audioBad) return { label: 'AUDIO', className: 'text-yellow-300' };

  const renderBad =
    Math.abs(m.showRenderDelayMs ?? 0) > 50 ||
    Math.abs(m.hideRenderDelayMs ?? 0) > 50 ||
    Math.abs(m.durationErrorPaintMs ?? 0) > 50;
  if (renderBad) return { label: 'RENDER', className: 'text-yellow-300' };

  const alignBad = Math.abs(m.deltaStartPaintMs ?? 0) > 50 || Math.abs(m.deltaEndPaintMs ?? 0) > 50;
  if (alignBad) return { label: 'ALIGN', className: 'text-yellow-300' };

  const ok = m.deltaStartPaintMs !== undefined && m.deltaEndPaintMs !== undefined;
  return ok
    ? { label: 'OK', className: 'text-green-400' }
    : { label: '—', className: 'text-muted-foreground' };
}

export function AdminSyncTab(): ReactNode {
  const { t } = useTranslation();
  const { persistence, audioDebug, diagnostics, adminHistoryMaintenance } = useAppPorts();

  const [audioReady, setAudioReady] = useState(audioDebug.isReady());
  const [audioRunning, setAudioRunning] = useState(audioDebug.isAudioContextRunning());
  const [audioPreset, setAudioPreset] = useState<AudioPreset>(
    ((audioDebug.getConfig() as { audioPreset?: AudioPreset } | null | undefined)?.audioPreset as
      | AudioPreset
      | undefined) ?? 'default',
  );
  const [autoVisualCalibration, setAutoVisualCalibration] = useState(
    audioDebug.isAutoVisualCalibrationEnabled(),
  );
  const [timingDebug, setTimingDebug] = useState(() => {
    try {
      return window.localStorage?.getItem('ND_AUDIO_DEBUG_TIMING') === '1';
    } catch {
      return false;
    }
  });
  const [timingDiag, setTimingDiag] = useState<TimingDiagnostics | null>(null);

  // Sync test controls
  const [bufferMs, setBufferMs] = useState(50);
  const [visualOffsetMs, setVisualOffsetMs] = useState(TIMING_VISUAL_OFFSET_DEFAULT_MS);
  const [stimulusDurationMs, setStimulusDurationMs] = useState(500);
  const [interTrialMs, setInterTrialMs] = useState(1500);
  const [trialsCount, setTrialsCount] = useState(20);

  const [isRunningTest, setIsRunningTest] = useState(false);
  const isRunningRef = useRef(false);

  const [showStimulus, setShowStimulus] = useState(false);
  const [currentSound, setCurrentSound] = useState<Sound | null>(null);
  const currentTrialRef = useRef<number | null>(null);
  const currentMeasurementRef = useRef<Measurement | null>(null);
  const trialCounterRef = useRef(0);
  const trialDoneResolverRef = useRef<(() => void) | null>(null);
  const pendingPaintRef = useRef<{ trial: number; phase: 'show' | 'hide' } | null>(null);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isRebuildingHistory, setIsRebuildingHistory] = useState(false);
  const [rebuildProjectedCount, setRebuildProjectedCount] = useState<number | null>(null);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const refreshAudioStatus = useCallback(() => {
    setAudioReady(audioDebug.isReady());
    setAudioRunning(audioDebug.isAudioContextRunning());
  }, [audioDebug]);

  const tryFinalizeMeasurement = useCallback(() => {
    const m = currentMeasurementRef.current;
    if (!m) return;

    if (
      m.visualPaintAtMs === undefined ||
      m.visualHidePaintAtMs === undefined ||
      m.audioSyncCallbackAtMs === undefined ||
      m.audioEndedCallbackAtMs === undefined
    ) {
      return;
    }

    if (m.visualCallbackAtMs !== undefined) {
      m.deltaStartCallbackMs = m.audioSyncCallbackAtMs - m.visualCallbackAtMs;
      m.showRenderDelayMs = m.visualPaintAtMs - m.visualCallbackAtMs;
    }
    m.deltaStartPaintMs = m.audioSyncCallbackAtMs - m.visualPaintAtMs;

    if (m.visualHideCallbackAtMs !== undefined) {
      m.deltaEndCallbackMs = m.audioEndedCallbackAtMs - m.visualHideCallbackAtMs;
      m.hideRenderDelayMs = m.visualHidePaintAtMs - m.visualHideCallbackAtMs;
    }
    m.deltaEndPaintMs = m.audioEndedCallbackAtMs - m.visualHidePaintAtMs;

    if (m.visualCallbackAtMs !== undefined && m.visualHideCallbackAtMs !== undefined) {
      m.visualDurationCallbackMs = m.visualHideCallbackAtMs - m.visualCallbackAtMs;
      m.durationErrorCallbackMs = m.visualDurationCallbackMs - m.stimulusDurationMs;
    }
    m.visualDurationPaintMs = m.visualHidePaintAtMs - m.visualPaintAtMs;
    m.durationErrorPaintMs = m.visualDurationPaintMs - m.stimulusDurationMs;

    m.audioDurationCallbackMs = m.audioEndedCallbackAtMs - m.audioSyncCallbackAtMs;
    m.audioDurationErrorMs = m.audioDurationCallbackMs - m.stimulusDurationMs;

    if (m.visualHideCallbackAtMs !== undefined) {
      m.stimulusWindowFromAudioCallbackMs = m.visualHideCallbackAtMs - m.audioSyncCallbackAtMs;
      m.stimulusWindowErrorFromAudioCallbackMs =
        m.stimulusWindowFromAudioCallbackMs - m.stimulusDurationMs;
    }
    m.stimulusWindowFromAudioPaintMs = m.visualHidePaintAtMs - m.audioSyncCallbackAtMs;
    m.stimulusWindowErrorFromAudioPaintMs = m.stimulusWindowFromAudioPaintMs - m.stimulusDurationMs;

    setMeasurements((prev) => [...prev, m]);

    currentMeasurementRef.current = null;
    currentTrialRef.current = null;
    pendingPaintRef.current = null;

    const resolve = trialDoneResolverRef.current;
    trialDoneResolverRef.current = null;
    resolve?.();
  }, []);

  // Live diagnostics refresh - 1s interval to avoid lag (was 250ms, caused systematic freezes)
  const DIAG_REFRESH_MS = 1000;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        setTimingDiag(audioDebug.getTimingDiagnostics() as TimingDiagnostics);
      } catch {
        setTimingDiag(null);
      }
      refreshAudioStatus();
      setAutoVisualCalibration(audioDebug.isAutoVisualCalibrationEnabled());
    }, DIAG_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refreshAudioStatus, audioDebug]);

  // Attribute long tasks / freezes to the currently running trial.
  useMountEffect(() => {
    const onLT = (e: LongTaskEvent) => {
      if (!isRunningRef.current) return;
      const m = currentMeasurementRef.current;
      if (!m) return;
      m.longTaskCount = (m.longTaskCount ?? 0) + 1;
      if (m.longTaskMaxMs === undefined || e.durationMs > m.longTaskMaxMs) {
        m.longTaskMaxMs = e.durationMs;
        m.longTaskMaxContext = e.context;
        m.longTaskMaxName = e.name;
      }
    };

    const onF = (e: FreezeEvent) => {
      if (!isRunningRef.current) return;
      const m = currentMeasurementRef.current;
      if (!m) return;
      m.freezeCount = (m.freezeCount ?? 0) + 1;
      if (m.freezeMaxMs === undefined || e.durationMs > m.freezeMaxMs) {
        m.freezeMaxMs = e.durationMs;
        m.freezeMaxContext = e.lastContext;
      }
    };

    const unsubLT = diagnostics.onLongTask(onLT);
    const unsubF = diagnostics.onFreeze(onF);
    return () => {
      unsubLT();
      unsubF();
    };
  });

  // Capture paint times for show/hide transitions.
  useEffect(() => {
    const pending = pendingPaintRef.current;
    const measurement = currentMeasurementRef.current;
    if (!pending || !measurement) return;

    const isRelevant =
      currentTrialRef.current !== null && measurement.trial === currentTrialRef.current;
    if (!isRelevant) return;

    if (pending.phase === 'show' && showStimulus) {
      afterNextPaint(() => {
        const m = currentMeasurementRef.current;
        if (!m || m.trial !== pending.trial) return;
        m.visualPaintAtMs = performance.now();
        pendingPaintRef.current = null;
        tryFinalizeMeasurement();
      });
    }

    if (pending.phase === 'hide' && !showStimulus) {
      afterNextPaint(() => {
        const m = currentMeasurementRef.current;
        if (!m || m.trial !== pending.trial) return;
        m.visualHidePaintAtMs = performance.now();
        pendingPaintRef.current = null;
        tryFinalizeMeasurement();
      });
    }
  }, [showStimulus, tryFinalizeMeasurement]);

  const applyAudioPreset = useCallback(
    (preset: AudioPreset) => {
      setAudioPreset(preset);
      // Must also set pinkNoiseLevel > 0 for sync textures to play
      const level = preset === 'default' ? 0 : 0.15;
      audioDebug.setConfig({ audioPreset: preset, pinkNoiseLevel: level } as unknown as Record<
        string,
        unknown
      >);
      refreshAudioStatus();
    },
    [refreshAudioStatus],
  );

  const setTimingDebugEnabled = useCallback((enabled: boolean) => {
    try {
      window.localStorage?.setItem('ND_AUDIO_DEBUG_TIMING', enabled ? '1' : '0');
    } catch {
      // ignore
    }
    setTimingDebug(enabled);
  }, []);

  const initOrResumeAudio = useCallback(async () => {
    await audioDebug.init();
    await audioDebug.resume();
    refreshAudioStatus();
  }, [refreshAudioStatus, audioDebug]);

  const stopAllAudio = useCallback(() => {
    audioDebug.stopAll();
    refreshAudioStatus();
  }, [refreshAudioStatus, audioDebug]);

  const resetCalibration = useCallback(() => {
    audioDebug.resetAutoVisualCalibration();
  }, [audioDebug]);

  const toggleAutoCalibration = useCallback(() => {
    const next = !audioDebug.isAutoVisualCalibrationEnabled();
    audioDebug.setAutoVisualCalibrationEnabled(next);
    setAutoVisualCalibration(next);
  }, [audioDebug]);

  const runSingleTrial = useCallback(async () => {
    const sound = SOUNDS[Math.floor(Math.random() * SOUNDS.length)] as Sound;
    trialCounterRef.current += 1;
    const trial = trialCounterRef.current;

    currentTrialRef.current = trial;
    const m: Measurement = {
      trial,
      sound,
      audioPreset,
      bufferMs,
      visualOffsetMs,
      stimulusDurationMs,
      audioCtxAtTrialStartS: audioDebug.getAudioContextTimeSeconds(),
    };
    currentMeasurementRef.current = m;

    await new Promise<void>((resolve) => {
      trialDoneResolverRef.current = resolve;

      // Schedule audio; use onPreSync for the visual trigger (same approach as game sessions)
      audioDebug.schedule(
        sound,
        bufferMs,
        () => {
          const mm = currentMeasurementRef.current;
          if (!mm || mm.trial !== trial) return;
          mm.audioSyncCallbackAtMs = performance.now();
          mm.audioCtxAtAudioSyncCallbackS = audioDebug.getAudioContextTimeSeconds();
          tryFinalizeMeasurement();
        },
        {
          onResolvedAsset: (asset: {
            key: string;
            url: string;
            durationSeconds: number | null;
          }) => {
            const mm = currentMeasurementRef.current;
            if (!mm || mm.trial !== trial) return;
            mm.soundKey = asset.key;
            mm.soundUrl = asset.url;
            mm.decodedDurationMs =
              asset.durationSeconds !== null ? asset.durationSeconds * 1000 : null;
          },
          visualOffsetMs,
          onPreSync: () => {
            const mm = currentMeasurementRef.current;
            if (!mm || mm.trial !== trial) return;

            mm.visualCallbackAtMs = performance.now();
            mm.audioCtxAtVisualCallbackS = audioDebug.getAudioContextTimeSeconds();
            setCurrentSound(sound);
            setShowStimulus(true);
            pendingPaintRef.current = { trial, phase: 'show' };
          },
          // Pre-hide from the audio clock (render latency compensation)
          onPostSync: () => {
            const mm = currentMeasurementRef.current;
            if (!mm || mm.trial !== trial) return;
            if (mm.visualHideCallbackAtMs !== undefined) return;
            mm.visualHideCallbackAtMs = performance.now();
            mm.audioCtxAtVisualHideCallbackS = audioDebug.getAudioContextTimeSeconds();
            setShowStimulus(false);
            setCurrentSound(null);
            pendingPaintRef.current = { trial, phase: 'hide' };
            tryFinalizeMeasurement();
          },
          postDelayMs: stimulusDurationMs,
          postVisualOffsetMs: TIMING_POST_VISUAL_OFFSET_MS,
          onEnded: () => {
            const mm = currentMeasurementRef.current;
            if (!mm || mm.trial !== trial) return;
            mm.audioEndedCallbackAtMs = performance.now();
            mm.audioCtxAtAudioEndedCallbackS = audioDebug.getAudioContextTimeSeconds();
            tryFinalizeMeasurement();
          },
        },
      );
    });
  }, [
    audioPreset,
    bufferMs,
    measurements.length,
    stimulusDurationMs,
    tryFinalizeMeasurement,
    visualOffsetMs,
  ]);

  const startTest = useCallback(async () => {
    setMeasurements([]);
    setShowStimulus(false);
    setCurrentSound(null);
    trialCounterRef.current = 0;
    stopAllAudio();

    setIsRunningTest(true);
    isRunningRef.current = true;

    // Ensure audio is initialized (user gesture: clicking start)
    try {
      await initOrResumeAudio();
    } catch {
      // If init fails (autoplay policy), still allow running; AudioService has fallback clock.
    }

    for (let i = 0; i < trialsCount; i++) {
      if (!isRunningRef.current) break;
      await runSingleTrial();
      if (!isRunningRef.current) break;
      await new Promise((r) => setTimeout(r, Math.max(0, interTrialMs)));
    }

    setIsRunningTest(false);
    isRunningRef.current = false;
  }, [initOrResumeAudio, interTrialMs, runSingleTrial, stopAllAudio, trialsCount]);

  const stopTest = useCallback(() => {
    isRunningRef.current = false;
    setIsRunningTest(false);
    setShowStimulus(false);
    setCurrentSound(null);
    currentMeasurementRef.current = null;
    currentTrialRef.current = null;
    pendingPaintRef.current = null;
    trialDoneResolverRef.current?.();
    trialDoneResolverRef.current = null;
    audioDebug.stopAll();
  }, [audioDebug]);

  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      audioDebug.stopAll();
    };
  }, [audioDebug]);

  const stats = useMemo(() => {
    const rows = measurements;
    if (rows.length === 0) return null;

    const numeric = (vals: Array<number | undefined>) =>
      vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
    const maxAbs = (values: number[]) => Math.max(...values.map((v) => Math.abs(v)));
    const p95Abs = (values: number[]) => {
      if (values.length === 0) return 0;
      const abs = values.map((v) => Math.abs(v)).sort((a, b) => a - b);
      const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
      return abs[idx] ?? 0;
    };

    const summarize = (values: number[]) =>
      values.length === 0
        ? null
        : {
            avg: avg(values),
            p95Abs: p95Abs(values),
            maxAbs: maxAbs(values),
          };

    const startPaint = numeric(rows.map((m) => m.deltaStartPaintMs));
    const startCb = numeric(rows.map((m) => m.deltaStartCallbackMs));
    const showLag = numeric(rows.map((m) => m.showRenderDelayMs));

    const endPaint = numeric(rows.map((m) => m.deltaEndPaintMs));
    const endCb = numeric(rows.map((m) => m.deltaEndCallbackMs));
    const hideLag = numeric(rows.map((m) => m.hideRenderDelayMs));

    const visDurPaint = numeric(rows.map((m) => m.visualDurationPaintMs));
    const visDurCb = numeric(rows.map((m) => m.visualDurationCallbackMs));
    const audioDur = numeric(rows.map((m) => m.audioDurationCallbackMs));

    const visErrPaint = numeric(rows.map((m) => m.durationErrorPaintMs));
    const visErrCb = numeric(rows.map((m) => m.durationErrorCallbackMs));
    const audioErr = numeric(rows.map((m) => m.audioDurationErrorMs));
    const windowErrFromAudio = numeric(rows.map((m) => m.stimulusWindowErrorFromAudioPaintMs));

    return {
      count: rows.length,
      startPaint: summarize(startPaint),
      startCb: summarize(startCb),
      showLag: summarize(showLag),
      endPaint: summarize(endPaint),
      endCb: summarize(endCb),
      hideLag: summarize(hideLag),
      visDurPaintAvg: visDurPaint.length ? avg(visDurPaint) : null,
      visDurCbAvg: visDurCb.length ? avg(visDurCb) : null,
      audioDurAvg: audioDur.length ? avg(audioDur) : null,
      visErrPaint: summarize(visErrPaint),
      visErrCb: summarize(visErrCb),
      audioErr: summarize(audioErr),
      windowErrFromAudio: summarize(windowErrFromAudio),
      tags: (() => {
        const counts: Record<'OK' | 'ALIGN' | 'RENDER' | 'AUDIO' | 'HITCH' | '—', number> = {
          OK: 0,
          ALIGN: 0,
          RENDER: 0,
          AUDIO: 0,
          HITCH: 0,
          '—': 0,
        };
        for (const m of rows) {
          const tag = getTrialTag(m).label as keyof typeof counts;
          counts[tag] = (counts[tag] ?? 0) + 1;
        }
        return counts;
      })(),
    };
  }, [measurements, stimulusDurationMs]);

  const exportJSON = useCallback(() => {
    downloadText(
      JSON.stringify(measurements, null, 2),
      `nd-sync-test-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
      'application/json',
    );
  }, [measurements]);

  const exportCSV = useCallback(() => {
    if (measurements.length === 0) return;
    const header = [
      'trial',
      'sound',
      'audioPreset',
      'bufferMs',
      'visualOffsetMs',
      'stimulusDurationMs',
      'audioCtxAtTrialStartS',
      'audioCtxAtVisualCallbackS',
      'audioCtxAtAudioSyncCallbackS',
      'audioCtxAtVisualHideCallbackS',
      'audioCtxAtAudioEndedCallbackS',
      'deltaStartCallbackMs',
      'showRenderDelayMs',
      'deltaStartPaintMs',
      'deltaEndCallbackMs',
      'hideRenderDelayMs',
      'deltaEndPaintMs',
      'stimulusWindowFromAudioPaintMs',
      'stimulusWindowErrorFromAudioPaintMs',
      'visualDurationCallbackMs',
      'visualDurationPaintMs',
      'audioDurationCallbackMs',
      'durationErrorCallbackMs',
      'durationErrorPaintMs',
      'audioDurationErrorMs',
      'longTaskCount',
      'longTaskMaxMs',
      'longTaskMaxContext',
      'longTaskMaxName',
      'freezeCount',
      'freezeMaxMs',
      'freezeMaxContext',
    ].join(',');
    const rows = measurements.map((m) =>
      [
        m.trial,
        m.sound,
        m.audioPreset,
        m.bufferMs,
        m.visualOffsetMs,
        m.stimulusDurationMs,
        m.audioCtxAtTrialStartS ?? '',
        m.audioCtxAtVisualCallbackS ?? '',
        m.audioCtxAtAudioSyncCallbackS ?? '',
        m.audioCtxAtVisualHideCallbackS ?? '',
        m.audioCtxAtAudioEndedCallbackS ?? '',
        m.deltaStartCallbackMs?.toFixed(2) ?? '',
        m.showRenderDelayMs?.toFixed(2) ?? '',
        m.deltaStartPaintMs?.toFixed(2) ?? '',
        m.deltaEndCallbackMs?.toFixed(2) ?? '',
        m.hideRenderDelayMs?.toFixed(2) ?? '',
        m.deltaEndPaintMs?.toFixed(2) ?? '',
        m.stimulusWindowFromAudioPaintMs?.toFixed(2) ?? '',
        m.stimulusWindowErrorFromAudioPaintMs?.toFixed(2) ?? '',
        m.visualDurationCallbackMs?.toFixed(2) ?? '',
        m.visualDurationPaintMs?.toFixed(2) ?? '',
        m.audioDurationCallbackMs?.toFixed(2) ?? '',
        m.durationErrorCallbackMs?.toFixed(2) ?? '',
        m.durationErrorPaintMs?.toFixed(2) ?? '',
        m.audioDurationErrorMs?.toFixed(2) ?? '',
        m.longTaskCount ?? '',
        m.longTaskMaxMs?.toFixed(2) ?? '',
        m.longTaskMaxContext ?? '',
        m.longTaskMaxName ?? '',
        m.freezeCount ?? '',
        m.freezeMaxMs?.toFixed(2) ?? '',
        m.freezeMaxContext ?? '',
      ].join(','),
    );
    downloadText(
      [header, ...rows].join('\n'),
      `nd-sync-test-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`,
      'text/csv',
    );
  }, [measurements]);

  const handleFullHistoryRebuild = useCallback(async () => {
    if (!persistence || isRebuildingHistory) return;

    setIsRebuildingHistory(true);
    setRebuildError(null);
    setRebuildProjectedCount(null);

    try {
      const projected = await adminHistoryMaintenance.rebuildAllSummaries(persistence);
      setRebuildProjectedCount(projected);
    } catch (error) {
      setRebuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRebuildingHistory(false);
    }
  }, [adminHistoryMaintenance, isRebuildingHistory, persistence]);

  return (
    <div className="space-y-6">
      <Card className="bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <Wrench size={22} weight="bold" className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-blue-400 mb-1">
              {t('admin.sync.title', 'Audio/Visual Sync')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.sync.description',
                "Surveille la précision du scheduling audio (Tone.js) et lance un test A/V 500ms. Mesures basées sur l'horloge JS (performance.now) + paint (double rAF).",
              )}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-bold">{t('admin.sync.audioStatus', 'Audio Status')}</h4>
            <div className="text-sm text-muted-foreground">
              {t('admin.sync.status.ready', 'Ready')}:{' '}
              <span className="font-mono text-white/90">{String(audioReady)}</span> ·{' '}
              {t('admin.sync.status.running', 'Running')}:{' '}
              <span className="font-mono text-white/90">{String(audioRunning)}</span> ·{' '}
              {t('admin.sync.status.preset', 'Preset')}:{' '}
              <span className="font-mono text-white/90">{audioPreset}</span> ·{' '}
              {t('admin.sync.status.autoCalibration', 'Auto-calibration')}:{' '}
              <span className="font-mono text-white/90">{String(autoVisualCalibration)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-2" onClick={() => void initOrResumeAudio()}>
              <ArrowClockwise size={16} weight="bold" />
              {t('admin.sync.audioInit', 'Init/Resume')}
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={stopAllAudio}>
              <Stop size={16} weight="bold" />
              {t('admin.sync.audioStop', 'Stop')}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-surface rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {t('admin.sync.audioPreset', 'Audio preset')}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={audioPreset === 'default' ? 'primary' : 'ghost'}
                onClick={() => applyAudioPreset('default')}
              >
                default
              </Button>
              {/* Sync presets removed */}
            </div>
          </div>

          <div className="bg-surface rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {t('admin.sync.debugTiming', 'Debug timing')}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={timingDebug ? 'primary' : 'ghost'}
                onClick={() => setTimingDebugEnabled(true)}
              >
                {t('admin.sync.on', 'ON')}
              </Button>
              <Button
                size="sm"
                variant={!timingDebug ? 'primary' : 'ghost'}
                onClick={() => setTimingDebugEnabled(false)}
              >
                {t('admin.sync.off', 'OFF')}
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              localStorage <span className="font-mono">ND_AUDIO_DEBUG_TIMING</span>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {t('admin.sync.calibration', 'Visual calibration')}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" className="gap-2" onClick={toggleAutoCalibration}>
                {autoVisualCalibration ? <Pause size={16} /> : <Play size={16} />}
                {autoVisualCalibration
                  ? t('admin.sync.disable', 'Disable')
                  : t('admin.sync.enable', 'Enable')}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetCalibration}>
                {t('admin.sync.reset', 'Reset')}
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Δ={timingDiag ? timingDiag.visualCalibrationDeltaMs.toFixed(1) : '—'}ms
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h4 className="font-bold">{t('admin.sync.diagnostics', 'Timing Diagnostics')}</h4>
          <Button size="sm" variant="ghost" onClick={refreshAudioStatus} className="gap-2">
            <ArrowClockwise size={16} />
            {t('admin.sync.refresh', 'Refresh')}
          </Button>
        </div>

        {timingDiag ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">overall p95</div>
              <div className="font-mono">{timingDiag.p95AbsLateMs.toFixed(1)}ms</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">overall max</div>
              <div className="font-mono">{timingDiag.maxAbsLateMs.toFixed(1)}ms</div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">visual_pre p95</div>
              <div className="font-mono">
                {(timingDiag.byKind['visual_pre']?.p95AbsLateMs ?? 0).toFixed(1)}ms
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">audio_sync p95</div>
              <div className="font-mono">
                {(timingDiag.byKind['audio_sync']?.p95AbsLateMs ?? 0).toFixed(1)}ms
              </div>
            </div>

            <div className="md:col-span-4 bg-surface rounded-lg p-3 text-xs text-muted-foreground">
              count=<span className="font-mono text-white/90">{timingDiag.count}</span> · clamp=
              <span className="font-mono text-white/90">
                {(timingDiag.visualOffsetClampedRate * 100).toFixed(0)}%
              </span>{' '}
              ({timingDiag.visualOffsetClampedCount}/{timingDiag.visualPreScheduledCount})
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">
            {t('admin.sync.noDiagnostics', 'No diagnostics available yet.')}
          </div>
        )}
      </Card>

      <Card>
        <h4 className="font-bold mb-2">{t('admin.sync.rebuild.title', 'Session Maintenance')}</h4>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'admin.sync.rebuild.description',
            'Rebuild all session summaries from raw events. Use this after changing projection/report logic.',
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="gap-2"
            onClick={() => void handleFullHistoryRebuild()}
            disabled={!persistence || isRebuildingHistory}
          >
            <ArrowClockwise size={16} weight="bold" />
            {isRebuildingHistory
              ? t('admin.sync.rebuild.running', 'Rebuilding...')
              : t('admin.sync.rebuild.action', 'Rebuild all summaries')}
          </Button>
          {!persistence && (
            <span className="text-xs text-yellow-300">
              {t('admin.sync.rebuild.unavailable', 'Persistence unavailable')}
            </span>
          )}
        </div>
        {rebuildProjectedCount !== null && (
          <p className="mt-3 text-sm text-green-400">
            {t(
              'admin.sync.rebuild.success',
              'Rebuild done: {{count}} sessions reprojected and snapshots refresh scheduled.',
              { count: rebuildProjectedCount },
            )}
          </p>
        )}
        {rebuildError && (
          <p className="mt-3 text-sm text-red-400">
            {t('admin.sync.rebuild.error', 'Rebuild failed')}: {rebuildError}
          </p>
        )}
      </Card>

      <Card>
        <h4 className="font-bold mb-4">{t('admin.sync.test.title', 'AV Sync Test (500ms)')}</h4>

        <div className="relative bg-surface rounded-xl h-56 mb-4 flex items-center justify-center border border-border">
          {showStimulus && currentSound && (
            <div className="text-8xl font-bold text-blue-400">{currentSound}</div>
          )}
          {!showStimulus && !isRunningTest && (
            <div className="text-sm text-muted-foreground">
              {t('admin.sync.test.stimulusZone', 'Stimulus zone')}
            </div>
          )}
          {isRunningTest && !showStimulus && (
            <div className="text-sm text-muted-foreground">
              {t('admin.sync.test.running', 'Running...')}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <label className="text-xs text-muted-foreground">
            {t('admin.sync.test.params.bufferMs', 'buffer (ms)')}
            <input
              type="number"
              value={bufferMs}
              disabled={isRunningTest}
              onChange={(e) => setBufferMs(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('admin.sync.test.params.visualOffsetMs', 'visualOffset (ms)')}
            <input
              type="number"
              value={visualOffsetMs}
              disabled={isRunningTest}
              onChange={(e) => setVisualOffsetMs(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('admin.sync.test.params.durationMs', 'duration (ms)')}
            <input
              type="number"
              value={stimulusDurationMs}
              disabled={isRunningTest}
              onChange={(e) => setStimulusDurationMs(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('admin.sync.test.params.interTrialMs', 'interTrial (ms)')}
            <input
              type="number"
              value={interTrialMs}
              disabled={isRunningTest}
              onChange={(e) => setInterTrialMs(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('admin.sync.test.params.trials', 'trials')}
            <input
              type="number"
              value={trialsCount}
              disabled={isRunningTest}
              onChange={(e) => setTrialsCount(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1 bg-white/5 border border-white/10 rounded"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {!isRunningTest ? (
            <Button className="gap-2" onClick={() => void startTest()}>
              <Play size={16} weight="bold" />
              {t('admin.sync.test.start', 'Start')}
            </Button>
          ) : (
            <Button className="gap-2 text-red-400" variant="secondary" onClick={stopTest}>
              <Stop size={16} weight="bold" />
              {t('admin.sync.test.stop', 'Stop')}
            </Button>
          )}

          <Button
            variant="ghost"
            className="gap-2"
            disabled={measurements.length === 0}
            onClick={exportJSON}
          >
            <DownloadSimple size={16} />
            JSON
          </Button>
          <Button
            variant="ghost"
            className="gap-2"
            disabled={measurements.length === 0}
            onClick={exportCSV}
          >
            <DownloadSimple size={16} />
            CSV
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4 text-sm">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Δ start (paint) avg</div>
              <div
                className={`font-mono ${getDeltaColorClass(stats.startPaint?.avg ?? 0)}`}
                title="audio_sync callback - visual paint"
              >
                {stats.startPaint ? `${stats.startPaint.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.startPaint ? `${stats.startPaint.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Δ start (callback) avg</div>
              <div
                className={`font-mono ${getDeltaColorClass(stats.startCb?.avg ?? 0)}`}
                title="audio_sync callback - visual callback (scheduling)"
              >
                {stats.startCb ? `${stats.startCb.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.startCb ? `${stats.startCb.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Δ end (callback) avg</div>
              <div
                className={`font-mono ${getDeltaColorClass(stats.endCb?.avg ?? 0)}`}
                title="audio ended callback - visual hide callback (audio duration vs 500ms)"
              >
                {stats.endCb ? `${stats.endCb.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.endCb ? `${stats.endCb.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Δ end (paint) avg</div>
              <div
                className={`font-mono ${getDeltaColorClass(stats.endPaint?.avg ?? 0)}`}
                title="audio ended callback - visual hide paint"
              >
                {stats.endPaint ? `${stats.endPaint.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.endPaint ? `${stats.endPaint.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Render lag (show) avg</div>
              <div
                className={`font-mono ${getRenderLagColorClass(stats.showLag?.avg ?? 0)}`}
                title="visual paint - visual callback"
              >
                {stats.showLag ? `${stats.showLag.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.showLag ? `${stats.showLag.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Render lag (hide) avg</div>
              <div
                className={`font-mono ${getRenderLagColorClass(stats.hideLag?.avg ?? 0)}`}
                title="visual hide paint - visual hide callback"
              >
                {stats.hideLag ? `${stats.hideLag.avg.toFixed(1)}ms` : '—'}
              </div>
              <div className="text-4xs text-muted-foreground">
                p95abs {stats.hideLag ? `${stats.hideLag.p95Abs.toFixed(1)}ms` : '—'}
              </div>
            </div>

            <div className="md:col-span-6 bg-surface rounded-lg p-3 text-xs text-muted-foreground">
              trials=<span className="font-mono text-white/90">{stats.count}</span> · visual
              duration(paint) avg=
              <span className="font-mono text-white/90">
                {stats.visDurPaintAvg !== null ? `${stats.visDurPaintAvg.toFixed(1)}ms` : '—'}
              </span>
              {' · '}duration(callback) avg=
              <span className="font-mono text-white/90">
                {stats.visDurCbAvg !== null ? `${stats.visDurCbAvg.toFixed(1)}ms` : '—'}
              </span>
              {' · '}audio duration(avg)=
              <span className="font-mono text-white/90">
                {stats.audioDurAvg !== null ? `${stats.audioDurAvg.toFixed(1)}ms` : '—'}
              </span>
              {' · '}window err(audio) p95abs=
              <span className="font-mono text-white/90">
                {stats.windowErrFromAudio ? `${stats.windowErrFromAudio.p95Abs.toFixed(1)}ms` : '—'}
              </span>
              {' · '}err(paint) p95abs=
              <span className="font-mono text-white/90">
                {stats.visErrPaint ? `${stats.visErrPaint.p95Abs.toFixed(1)}ms` : '—'}
              </span>
              {' · '}err(callback) p95abs=
              <span className="font-mono text-white/90">
                {stats.visErrCb ? `${stats.visErrCb.p95Abs.toFixed(1)}ms` : '—'}
              </span>
              {' · '}audio err p95abs=
              <span className="font-mono text-white/90">
                {stats.audioErr ? `${stats.audioErr.p95Abs.toFixed(1)}ms` : '—'}
              </span>
              {' · '}tags=
              <span className="font-mono text-white/90">
                OK:{stats.tags.OK} HITCH:{stats.tags.HITCH} AUDIO:{stats.tags.AUDIO} RENDER:
                {stats.tags.RENDER} ALIGN:{stats.tags.ALIGN}
              </span>
            </div>
          </div>
        )}

        {measurements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">sound</th>
                  <th className="py-2 pr-4">asset</th>
                  <th className="py-2 pr-4">Δ start (cb)</th>
                  <th className="py-2 pr-4">lag show</th>
                  <th className="py-2 pr-4">Δ start (paint)</th>
                  <th className="py-2 pr-4">Δ end (cb)</th>
                  <th className="py-2 pr-4">lag hide</th>
                  <th className="py-2 pr-4">Δ end (paint)</th>
                  <th className="py-2 pr-4">win err</th>
                  <th className="py-2 pr-4">dur err</th>
                  <th className="py-2 pr-4">LT max</th>
                  <th className="py-2 pr-4">tag</th>
                  <th className="py-2 pr-4">preset</th>
                </tr>
              </thead>
              <tbody>
                {measurements.slice(-50).map((m) => {
                  const tag = getTrialTag(m);
                  return (
                    <tr
                      key={m.trial}
                      className={`border-b border-white/5 ${
                        getTrialTag(m).label === 'HITCH' ||
                        Math.abs(m.durationErrorPaintMs ?? 0) > 50 ||
                        Math.abs(m.hideRenderDelayMs ?? 0) > 50 ||
                        Math.abs(m.audioDurationErrorMs ?? 0) > 50
                          ? 'bg-red-500/5'
                          : Math.abs(m.showRenderDelayMs ?? 0) > 33 ||
                              Math.abs(m.hideRenderDelayMs ?? 0) > 33 ||
                              Math.abs(m.audioDurationErrorMs ?? 0) > 33 ||
                              Math.abs(m.stimulusWindowErrorFromAudioPaintMs ?? 0) > 33
                            ? 'bg-yellow-500/5'
                            : ''
                      }`}
                    >
                      <td className="py-2 pr-4 font-mono">{m.trial}</td>
                      <td className="py-2 pr-4 font-mono">{m.sound}</td>
                      <td
                        className="py-2 pr-4 font-mono text-xs text-muted-foreground"
                        title={
                          m.soundUrl
                            ? `${m.soundUrl}${m.decodedDurationMs ? ` (${m.decodedDurationMs.toFixed(1)}ms decoded)` : ''}`
                            : undefined
                        }
                      >
                        {m.soundKey ? m.soundKey : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.deltaStartCallbackMs ?? 0)}`}
                      >
                        {m.deltaStartCallbackMs !== undefined
                          ? `${m.deltaStartCallbackMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getRenderLagColorClass(m.showRenderDelayMs ?? 0)}`}
                      >
                        {m.showRenderDelayMs !== undefined
                          ? `${m.showRenderDelayMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.deltaStartPaintMs ?? 0)}`}
                      >
                        {m.deltaStartPaintMs !== undefined
                          ? `${m.deltaStartPaintMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.deltaEndCallbackMs ?? 0)}`}
                      >
                        {m.deltaEndCallbackMs !== undefined
                          ? `${m.deltaEndCallbackMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getRenderLagColorClass(m.hideRenderDelayMs ?? 0)}`}
                      >
                        {m.hideRenderDelayMs !== undefined
                          ? `${m.hideRenderDelayMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.deltaEndPaintMs ?? 0)}`}
                      >
                        {m.deltaEndPaintMs !== undefined
                          ? `${m.deltaEndPaintMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(
                          m.stimulusWindowErrorFromAudioPaintMs ?? 0,
                        )}`}
                        title="(visualHidePaint - audioSyncCallback) - stimulusDurationMs"
                      >
                        {m.stimulusWindowErrorFromAudioPaintMs !== undefined
                          ? `${m.stimulusWindowErrorFromAudioPaintMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.durationErrorPaintMs ?? 0)}`}
                        title="visualDurationPaintMs - stimulusDurationMs"
                      >
                        {m.durationErrorPaintMs !== undefined
                          ? `${m.durationErrorPaintMs.toFixed(1)}ms`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 font-mono ${getDeltaColorClass(m.longTaskMaxMs ?? 0)}`}
                        title={`${m.longTaskMaxContext ?? 'unknown'}${m.longTaskMaxName ? ` (${m.longTaskMaxName})` : ''}`}
                      >
                        {m.longTaskMaxMs !== undefined ? `${m.longTaskMaxMs.toFixed(0)}ms` : '—'}
                      </td>
                      <td className={`py-2 pr-4 font-mono text-xs ${tag.className}`}>
                        {tag.label}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {m.audioPreset}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
