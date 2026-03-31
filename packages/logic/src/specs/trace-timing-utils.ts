/** STUB: trace-timing-utils removed in NeuroDual Lite */
export interface TraceTimingsFromIsi {
  stimulusMs: number;
  isiMs: number;
}
export function calculateTraceTimingsFromIsi(_isi: number): TraceTimingsFromIsi {
  return { stimulusMs: 3000, isiMs: 500 };
}
