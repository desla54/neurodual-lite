/** STUB: trace-timing-utils removed in NeuroDual Lite */
export interface TraceTimingsFromIsi {
  stimulusMs: number;
  isiMs: number;
  stimulusDurationMs: number;
  responseWindowMs: number;
  feedbackDurationMs: number;
  intervalMs: number;
  warmupStimulusDurationMs: number;
}
export function calculateTraceTimingsFromIsi(_isi: number): TraceTimingsFromIsi {
  return {
    stimulusMs: 3000,
    isiMs: 500,
    stimulusDurationMs: 3000,
    responseWindowMs: 2000,
    feedbackDurationMs: 500,
    intervalMs: 500,
    warmupStimulusDurationMs: 3500,
  };
}
