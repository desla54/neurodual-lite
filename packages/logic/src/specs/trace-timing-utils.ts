function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Match existing UI constraints (Dual Trace): wider range than ARM bounds.
const TRACE_ISI_MIN_MS = 1500;
const TRACE_ISI_MAX_MS = 10000;

export interface TraceTimingsFromIsi {
  // === VISUAL TIMINGS (UI effects) ===
  /** Stimulus extinction delay (ms) - cell turns off to force memorization */
  readonly extinctionMs: number;
  /** Delay before showing feedback (cells return animation) */
  readonly cellsReturnDelayMs: number;
  /** Flash off for same position repeat (ms) */
  readonly flashOffMs: number;

  // === SESSION TIMINGS (state machine durations) ===
  /** Stimulus display duration (ms) */
  readonly stimulusDurationMs: number;
  /** Response window duration (ms) */
  readonly responseWindowMs: number;
  /** Feedback display duration (ms) */
  readonly feedbackDurationMs: number;
  /** Interval / waiting duration (ms) */
  readonly intervalMs: number;
  /** Warmup stimulus duration (ms) */
  readonly warmupStimulusDurationMs: number;
}

/**
 * Derive all trace timings from an ISI value.
 *
 * This is used by the web UI to compute consistent timings and effects. It is intentionally pure.
 *
 * ISI breakdown (total = 100%):
 * - Stimulus display: 20%
 * - Response window: 30%
 * - Feedback display: 25%
 * - Interval/waiting: 25%
 */
export function calculateTraceTimingsFromIsi(isiMs: number): TraceTimingsFromIsi {
  const isi = clamp(isiMs, TRACE_ISI_MIN_MS, TRACE_ISI_MAX_MS);

  return {
    // === VISUAL TIMINGS (UI effects) ===
    extinctionMs: clamp(isi * 0.2 * 0.65, 200, 1500),
    cellsReturnDelayMs: clamp(isi * 0.05, 100, 500),
    flashOffMs: 80,

    // === SESSION TIMINGS (state machine durations) ===
    stimulusDurationMs: clamp(isi * 0.2, 300, 2500),
    responseWindowMs: clamp(isi * 0.3, 500, 4000),
    feedbackDurationMs: clamp(isi * 0.25, 400, 3000),
    intervalMs: clamp(isi * 0.25, 400, 3000),
    warmupStimulusDurationMs: clamp(isi * 0.3, 500, 4000),
  };
}
