export const INPUT_LATENCY_DEBUG_KEY = 'ND_INPUT_DEBUG_TIMING';

export type ProfiledInputMethod = 'touch' | 'mouse' | 'keyboard';

interface InputLatencySample {
  id: number;
  modality: string;
  inputMethod: ProfiledInputMethod;
  phaseAtInput: string;
  trialIndexAtInput: number;
  capturedAtMs: number;
  dispatchCompletedAtMs: number;
  commitAtMs: number | null;
  paintAtMs: number | null;
  phaseAtCommit: string | null;
  trialIndexAtCommit: number | null;
}

interface LatencyStats {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface InputLatencyDiagnostics {
  enabled: boolean;
  sampleCount: number;
  pendingCount: number;
  inputToDispatch: LatencyStats | null;
  inputToCommit: LatencyStats | null;
  inputToPaint: LatencyStats | null;
  byMethod: Record<ProfiledInputMethod, { count: number; p95InputToPaintMs: number | null }>;
  latest: {
    modality: string;
    inputMethod: ProfiledInputMethod;
    inputToDispatchMs: number;
    inputToCommitMs: number | null;
    inputToPaintMs: number | null;
  } | null;
}

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(key, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const rank = (p / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sortedValues[low] ?? 0;
  const highValue = sortedValues[high] ?? lowValue;
  const weight = rank - low;
  return lowValue + (highValue - lowValue) * weight;
}

function buildStats(values: readonly number[]): LatencyStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const maxMs = sorted[sorted.length - 1] ?? 0;
  return {
    count: sorted.length,
    avgMs: sum / sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs,
  };
}

class InputLatencyProfiler {
  private readonly maxSamples = 400;
  private nextId = 1;
  private samples: InputLatencySample[] = [];
  private pendingSampleIds: number[] = [];
  private hasLoadedEnabledFlag = false;
  private enabled = false;

  isEnabled(): boolean {
    if (!this.hasLoadedEnabledFlag) {
      this.enabled = readFlag(INPUT_LATENCY_DEBUG_KEY);
      this.hasLoadedEnabledFlag = true;
    }
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.hasLoadedEnabledFlag = true;
    writeFlag(INPUT_LATENCY_DEBUG_KEY, enabled);
    if (!enabled) {
      this.reset();
    }
  }

  reset(): void {
    this.samples = [];
    this.pendingSampleIds = [];
  }

  recordInput(params: {
    modality: string;
    inputMethod: ProfiledInputMethod;
    phase: string;
    trialIndex: number;
    capturedAtMs: number;
    dispatchCompletedAtMs: number;
  }): number | null {
    if (!this.isEnabled()) return null;
    const id = this.nextId++;
    this.samples.push({
      id,
      modality: params.modality,
      inputMethod: params.inputMethod,
      phaseAtInput: params.phase,
      trialIndexAtInput: params.trialIndex,
      capturedAtMs: params.capturedAtMs,
      dispatchCompletedAtMs: params.dispatchCompletedAtMs,
      commitAtMs: null,
      paintAtMs: null,
      phaseAtCommit: null,
      trialIndexAtCommit: null,
    });
    this.pendingSampleIds.push(id);
    if (this.samples.length > this.maxSamples) {
      const overflow = this.samples.length - this.maxSamples;
      const removed = this.samples.splice(0, overflow);
      if (removed.length > 0) {
        const removedIds = new Set(removed.map((sample) => sample.id));
        this.pendingSampleIds = this.pendingSampleIds.filter(
          (sampleId) => !removedIds.has(sampleId),
        );
      }
    }
    return id;
  }

  markNextCommit(commitAtMs: number, phase: string, trialIndex: number): number | null {
    if (!this.isEnabled()) return null;
    while (this.pendingSampleIds.length > 0) {
      const sampleId = this.pendingSampleIds.shift();
      if (sampleId === undefined) return null;
      const sample = this.samples.find((candidate) => candidate.id === sampleId);
      if (!sample || sample.commitAtMs !== null) continue;
      sample.commitAtMs = commitAtMs;
      sample.phaseAtCommit = phase;
      sample.trialIndexAtCommit = trialIndex;
      return sampleId;
    }
    return null;
  }

  markPaint(sampleId: number, paintAtMs: number): void {
    if (!this.isEnabled()) return;
    const sample = this.samples.find((candidate) => candidate.id === sampleId);
    if (!sample || sample.paintAtMs !== null) return;
    sample.paintAtMs = paintAtMs;
  }

  getDiagnostics(): InputLatencyDiagnostics {
    const enabled = this.isEnabled();
    const inputToDispatchValues: number[] = [];
    const inputToCommitValues: number[] = [];
    const inputToPaintValues: number[] = [];
    const methodCounts: Record<ProfiledInputMethod, number> = { touch: 0, mouse: 0, keyboard: 0 };
    const methodPaintValues: Record<ProfiledInputMethod, number[]> = {
      touch: [],
      mouse: [],
      keyboard: [],
    };

    for (const sample of this.samples) {
      methodCounts[sample.inputMethod]++;
      inputToDispatchValues.push(sample.dispatchCompletedAtMs - sample.capturedAtMs);
      if (sample.commitAtMs !== null) {
        inputToCommitValues.push(sample.commitAtMs - sample.capturedAtMs);
      }
      if (sample.paintAtMs !== null) {
        const inputToPaint = sample.paintAtMs - sample.capturedAtMs;
        inputToPaintValues.push(inputToPaint);
        methodPaintValues[sample.inputMethod].push(inputToPaint);
      }
    }

    const latestSample = this.samples[this.samples.length - 1] ?? null;
    return {
      enabled,
      sampleCount: this.samples.length,
      pendingCount: this.pendingSampleIds.length,
      inputToDispatch: buildStats(inputToDispatchValues),
      inputToCommit: buildStats(inputToCommitValues),
      inputToPaint: buildStats(inputToPaintValues),
      byMethod: {
        touch: {
          count: methodCounts.touch,
          p95InputToPaintMs: buildStats(methodPaintValues.touch)?.p95Ms ?? null,
        },
        mouse: {
          count: methodCounts.mouse,
          p95InputToPaintMs: buildStats(methodPaintValues.mouse)?.p95Ms ?? null,
        },
        keyboard: {
          count: methodCounts.keyboard,
          p95InputToPaintMs: buildStats(methodPaintValues.keyboard)?.p95Ms ?? null,
        },
      },
      latest: latestSample
        ? {
            modality: latestSample.modality,
            inputMethod: latestSample.inputMethod,
            inputToDispatchMs: latestSample.dispatchCompletedAtMs - latestSample.capturedAtMs,
            inputToCommitMs:
              latestSample.commitAtMs !== null
                ? latestSample.commitAtMs - latestSample.capturedAtMs
                : null,
            inputToPaintMs:
              latestSample.paintAtMs !== null
                ? latestSample.paintAtMs - latestSample.capturedAtMs
                : null,
          }
        : null,
    };
  }
}

export const inputLatencyProfiler = new InputLatencyProfiler();
