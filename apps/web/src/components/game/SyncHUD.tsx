import type { SessionSnapshot } from '@neurodual/logic';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPorts } from '../../providers';
import {
  inputLatencyProfiler,
  type InputLatencyDiagnostics,
} from '../../lib/input-latency-profiler';

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
  cueMode?: 'buffers' | 'synth';
  cueFallbackReason?: string | null;
  bufferCount?: number;
  codec?: { aacM4a: boolean | null; wav: boolean | null };
}

function afterNextPaint(cb: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, enabled: boolean): void {
  try {
    window.localStorage?.setItem(key, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}ms`;
}

function fmtSupport(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '?';
}

function fmtCodec(
  codec: { aacM4a: boolean | null; wav: boolean | null } | null | undefined,
): string {
  if (!codec) return '—';
  return `aac/m4a=${fmtSupport(codec.aacM4a)} wav=${fmtSupport(codec.wav)}`;
}

type PaintSample = {
  trialIndex: number;
  showPaintAtMs: number | null;
  hidePaintAtMs: number | null;
};

export function SyncHUD({
  enabled = true,
  snapshot,
}: {
  enabled?: boolean;
  snapshot: SessionSnapshot;
}): ReactNode {
  const { t } = useTranslation();
  const { audioDebug } = useAppPorts();
  const urlEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('syncHud') === '1';
    } catch {
      return false;
    }
  }, []);

  const [pinned, setPinned] = useState(() => readFlag('ND_SYNC_HUD'));
  const [debugTiming, setDebugTiming] = useState(() => readFlag('ND_AUDIO_DEBUG_TIMING'));
  const [debugInput, setDebugInput] = useState(() => inputLatencyProfiler.isEnabled());
  const [expanded, setExpanded] = useState(() => urlEnabled || pinned);
  const [timingDiag, setTimingDiag] = useState<TimingDiagnostics | null>(null);
  const [inputDiag, setInputDiag] = useState<InputLatencyDiagnostics>(() =>
    inputLatencyProfiler.getDiagnostics(),
  );
  const [paint, setPaint] = useState<PaintSample>(() => ({
    trialIndex: snapshot.trialIndex,
    showPaintAtMs: null,
    hidePaintAtMs: null,
  }));

  const lastShowCallbackRef = useRef<number | null>(null);
  const lastHideCallbackRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDebugTiming(readFlag('ND_AUDIO_DEBUG_TIMING'));
      setDebugInput(inputLatencyProfiler.isEnabled());
      try {
        setTimingDiag(audioDebug.getTimingDiagnostics() as TimingDiagnostics);
      } catch {
        setTimingDiag(null);
      }
      setInputDiag(inputLatencyProfiler.getDiagnostics());
    }, 250);
    return () => window.clearInterval(id);
  }, [audioDebug]);

  // Capture paint time for stimulus show (double rAF), keyed by the audio-driven callback timestamp.
  useEffect(() => {
    const cbAt = snapshot.visualTriggerCallbackAtMs ?? null;
    if (cbAt === null || !Number.isFinite(cbAt)) return;
    if (lastShowCallbackRef.current === cbAt) return;
    lastShowCallbackRef.current = cbAt;

    // Reset paint timestamps when a new show callback arrives.
    setPaint({ trialIndex: snapshot.trialIndex, showPaintAtMs: null, hidePaintAtMs: null });

    if (!snapshot.stimulusVisible) return;
    afterNextPaint(() => {
      setPaint((prev) =>
        prev.trialIndex !== snapshot.trialIndex
          ? prev
          : { ...prev, showPaintAtMs: performance.now() },
      );
    });
  }, [snapshot.stimulusVisible, snapshot.trialIndex, snapshot.visualTriggerCallbackAtMs]);

  // Capture paint time for stimulus hide (double rAF), keyed by the audio-driven hide callback timestamp.
  useEffect(() => {
    const cbAt = snapshot.visualHideCallbackAtMs ?? null;
    if (cbAt === null || !Number.isFinite(cbAt)) return;
    if (lastHideCallbackRef.current === cbAt) return;
    lastHideCallbackRef.current = cbAt;

    if (snapshot.stimulusVisible) return;
    afterNextPaint(() => {
      setPaint((prev) =>
        prev.trialIndex !== snapshot.trialIndex
          ? prev
          : { ...prev, hidePaintAtMs: performance.now() },
      );
    });
  }, [snapshot.stimulusVisible, snapshot.trialIndex, snapshot.visualHideCallbackAtMs]);

  const shouldShow = enabled && (urlEnabled || debugTiming || debugInput || pinned);
  if (!shouldShow) return null;

  const stimulusDurationMs = snapshot.stimulusDurationMs ?? null;
  const audioSyncAtMs = snapshot.audioSyncCallbackAtMs ?? null;
  const audioEndedAtMs = snapshot.audioEndedCallbackAtMs ?? null;
  const visualTriggerAtMs = snapshot.visualTriggerCallbackAtMs ?? null;
  const visualHideAtMs = snapshot.visualHideCallbackAtMs ?? null;
  const expectedEndAtMs =
    audioSyncAtMs !== null && stimulusDurationMs !== null
      ? audioSyncAtMs + stimulusDurationMs
      : null;
  const endRefAtMs = audioEndedAtMs ?? expectedEndAtMs;

  const showLagMs =
    paint.showPaintAtMs !== null && visualTriggerAtMs !== null
      ? paint.showPaintAtMs - visualTriggerAtMs
      : null;
  const hideLagMs =
    paint.hidePaintAtMs !== null && visualHideAtMs !== null
      ? paint.hidePaintAtMs - visualHideAtMs
      : null;

  const deltaStartPaintMs =
    audioSyncAtMs !== null && paint.showPaintAtMs !== null
      ? audioSyncAtMs - paint.showPaintAtMs
      : null;
  const deltaEndPaintMs =
    endRefAtMs !== null && paint.hidePaintAtMs !== null ? endRefAtMs - paint.hidePaintAtMs : null;

  const windowPaintMs =
    paint.showPaintAtMs !== null && paint.hidePaintAtMs !== null
      ? paint.hidePaintAtMs - paint.showPaintAtMs
      : null;
  const windowErrMs =
    windowPaintMs !== null && stimulusDurationMs !== null
      ? windowPaintMs - stimulusDurationMs
      : null;

  const visualPre = timingDiag?.byKind?.['visual_pre'];
  const visualPost = timingDiag?.byKind?.['visual_post'];
  const audioSync = timingDiag?.byKind?.['audio_sync'];

  return (
    <div className="absolute top-2 right-2 z-50 select-none">
      <div className="rounded-lg border border-white/10 bg-black/70 text-white shadow-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-semibold tracking-wide"
            onClick={() => setExpanded((v) => !v)}
            title={t('game.syncHud.toggleTitle', 'Toggle sync monitor')}
          >
            {t('game.syncHud.shortLabel', 'SYNC')}
          </button>
          <div className="text-xs font-mono text-white/80">
            {t('game.syncHud.start', 'start')} {fmtMs(deltaStartPaintMs)} ·{' '}
            {t('game.syncHud.end', 'end')} {fmtMs(deltaEndPaintMs)}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={`text-3xs font-mono ${pinned ? 'text-green-300' : 'text-white/60'}`}
              onClick={() => {
                const next = !pinned;
                setPinned(next);
                writeFlag('ND_SYNC_HUD', next);
                if (next) setExpanded(true);
              }}
              title={t('game.syncHud.pinTitle', 'Pin on screen')}
            >
              {t('game.syncHud.pinLabel', 'pin')}
            </button>
            <button
              type="button"
              className={`text-3xs font-mono ${debugInput ? 'text-cyan-300' : 'text-white/60'}`}
              onClick={() => {
                const next = !debugInput;
                inputLatencyProfiler.setEnabled(next);
                setDebugInput(next);
                setInputDiag(inputLatencyProfiler.getDiagnostics());
                if (next) setExpanded(true);
              }}
              title={t(
                'game.syncHud.inputTitle',
                'Toggle input latency profiling (localStorage ND_INPUT_DEBUG_TIMING)',
              )}
            >
              {t('game.syncHud.inputLabel', 'input')}{' '}
              {debugInput ? t('game.syncHud.on', 'on') : t('game.syncHud.off', 'off')}
            </button>
            <button
              type="button"
              className="text-3xs font-mono text-white/60"
              onClick={() => {
                setPinned(false);
                writeFlag('ND_SYNC_HUD', false);
              }}
              title={t(
                'game.syncHud.hideTitle',
                'Hide (unless syncHud=1 or ND_AUDIO_DEBUG_TIMING=1)',
              )}
            >
              {t('game.syncHud.hideLabel', 'hide')}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-4xs font-mono text-white/80">
            <div>{t('game.syncHud.labels.trial', 'trial')}</div>
            <div className="text-right">{snapshot.trialIndex}</div>
            <div>{t('game.syncHud.labels.lagShow', 'lag show')}</div>
            <div className="text-right">{fmtMs(showLagMs)}</div>
            <div>{t('game.syncHud.labels.lagHide', 'lag hide')}</div>
            <div className="text-right">{fmtMs(hideLagMs)}</div>
            <div>{t('game.syncHud.labels.winErr', 'win err')}</div>
            <div className="text-right">{fmtMs(windowErrMs)}</div>
            <div>{t('game.syncHud.labels.endRef', 'end ref')}</div>
            <div className="text-right text-white/60">
              {audioEndedAtMs !== null
                ? t('game.syncHud.endRef.audio', 'audio')
                : t('game.syncHud.endRef.expected', 'expected')}
            </div>
            <div>{t('game.syncHud.labels.visualPreP95', 'visual_pre p95')}</div>
            <div className="text-right">{fmtMs(visualPre?.p95AbsLateMs ?? null)}</div>
            <div>{t('game.syncHud.labels.audioSyncP95', 'audio_sync p95')}</div>
            <div className="text-right">{fmtMs(audioSync?.p95AbsLateMs ?? null)}</div>
            <div>{t('game.syncHud.labels.audioCueMode', 'audio cues')}</div>
            <div className="text-right">
              {timingDiag?.cueMode ?? '—'} · buf={timingDiag?.bufferCount ?? '—'}
            </div>
            <div>{t('game.syncHud.labels.audioCodec', 'codec')}</div>
            <div className="text-right">{fmtCodec(timingDiag?.codec)}</div>
            <div>{t('game.syncHud.labels.visualPostP95', 'visual_post p95')}</div>
            <div className="text-right">{fmtMs(visualPost?.p95AbsLateMs ?? null)}</div>
            <div>{t('game.syncHud.labels.inputToDispatchP95', 'input->dispatch p95')}</div>
            <div className="text-right">{fmtMs(inputDiag.inputToDispatch?.p95Ms ?? null)}</div>
            <div>{t('game.syncHud.labels.inputToCommitP95', 'input->commit p95')}</div>
            <div className="text-right">{fmtMs(inputDiag.inputToCommit?.p95Ms ?? null)}</div>
            <div>{t('game.syncHud.labels.inputToPaintP95', 'input->paint p95')}</div>
            <div className="text-right">{fmtMs(inputDiag.inputToPaint?.p95Ms ?? null)}</div>
            <div>{t('game.syncHud.labels.inputPending', 'input pending')}</div>
            <div className="text-right">{inputDiag.pendingCount}</div>
            <div>{t('game.syncHud.labels.inputSamples', 'input samples')}</div>
            <div className="text-right">{inputDiag.sampleCount}</div>
            <div>{t('game.syncHud.labels.touchSamples', 'touch samples')}</div>
            <div className="text-right">{inputDiag.byMethod.touch.count}</div>
            <div>{t('game.syncHud.labels.mouseSamples', 'mouse samples')}</div>
            <div className="text-right">{inputDiag.byMethod.mouse.count}</div>
            <div>{t('game.syncHud.labels.keyboardSamples', 'kbd samples')}</div>
            <div className="text-right">{inputDiag.byMethod.keyboard.count}</div>
            <div>{t('game.syncHud.labels.latestMethod', 'latest (method)')}</div>
            <div className="text-right">{inputDiag.latest?.inputMethod ?? '—'}</div>
            <div>{t('game.syncHud.labels.latestModality', 'latest modality')}</div>
            <div className="text-right">{inputDiag.latest?.modality ?? '—'}</div>
            <div className="col-span-2 mt-1">
              <button
                type="button"
                className="w-full rounded border border-white/10 px-2 py-1 text-3xs font-mono text-white/70 hover:bg-white/10"
                onClick={() => {
                  inputLatencyProfiler.reset();
                  setInputDiag(inputLatencyProfiler.getDiagnostics());
                }}
              >
                {t('game.syncHud.resetInputProfiler', 'reset input profiler')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
