import { useCallback, useLayoutEffect, useRef } from 'react';
import { inputLatencyProfiler } from '../lib/input-latency-profiler';

interface ClaimTelemetryInput {
  readonly modality: string;
  readonly inputMethod: 'keyboard' | 'mouse' | 'touch';
  readonly telemetryId: string;
  readonly capturedAtMs: number;
  readonly dispatchCompletedAtMs: number;
}

interface UseNbackInputTelemetryOptions {
  readonly phase: string;
  readonly trialIndex: number;
  readonly snapshot: unknown;
  readonly dispatch: (event: {
    type: 'REPORT_INPUT_PIPELINE_LATENCY';
    telemetryId: string;
    modality: never;
    inputMethod: 'keyboard' | 'mouse' | 'touch';
    trialIndex: number;
    phase: 'stimulus' | 'waiting';
    capturedAtMs: number;
    dispatchCompletedAtMs: number;
    commitAtMs: number;
    paintAtMs: number;
  }) => void;
}

interface UseNbackInputTelemetryResult {
  readonly onClaimTelemetry: (input: ClaimTelemetryInput) => void;
}

export function useNbackInputTelemetry({
  phase,
  trialIndex,
  snapshot,
  dispatch,
}: UseNbackInputTelemetryOptions): UseNbackInputTelemetryResult {
  const pendingPipelineLatencyRef = useRef<
    Array<{
      telemetryId: string;
      modality: string;
      inputMethod: 'keyboard' | 'mouse' | 'touch';
      phaseAtInput: 'stimulus' | 'waiting';
      trialIndexAtInput: number;
      capturedAtMs: number;
      dispatchCompletedAtMs: number;
    }>
  >([]);
  const inFlightPipelineLatencyRef = useRef<{
    telemetryId: string;
    modality: string;
    inputMethod: 'keyboard' | 'mouse' | 'touch';
    phaseAtInput: 'stimulus' | 'waiting';
    trialIndexAtInput: number;
    capturedAtMs: number;
    dispatchCompletedAtMs: number;
  } | null>(null);
  const phaseRef = useRef(phase);
  const trialIndexRef = useRef(trialIndex);
  phaseRef.current = phase;
  trialIndexRef.current = trialIndex;

  const onClaimTelemetry = useCallback(
    ({
      modality,
      inputMethod,
      telemetryId,
      capturedAtMs,
      dispatchCompletedAtMs,
    }: ClaimTelemetryInput) => {
      if (!inputLatencyProfiler.isEnabled()) return;

      inputLatencyProfiler.recordInput({
        modality,
        inputMethod,
        phase,
        trialIndex,
        capturedAtMs,
        dispatchCompletedAtMs,
      });

      if (phase !== 'stimulus' && phase !== 'waiting') return;

      pendingPipelineLatencyRef.current.push({
        telemetryId,
        modality,
        inputMethod,
        phaseAtInput: phase,
        trialIndexAtInput: trialIndex,
        capturedAtMs,
        dispatchCompletedAtMs,
      });
      if (pendingPipelineLatencyRef.current.length > 200) {
        pendingPipelineLatencyRef.current.splice(0, pendingPipelineLatencyRef.current.length - 200);
      }
    },
    [phase, trialIndex],
  );

  useLayoutEffect(() => {
    if (!inputLatencyProfiler.isEnabled()) return;

    const sampleId = inputLatencyProfiler.markNextCommit(performance.now(), phase, trialIndex);
    if (sampleId === null) return;

    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          inputLatencyProfiler.markPaint(sampleId, performance.now());
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [snapshot, phase, trialIndex]);

  useLayoutEffect(() => {
    if (!inputLatencyProfiler.isEnabled()) {
      pendingPipelineLatencyRef.current = [];
      inFlightPipelineLatencyRef.current = null;
      return;
    }

    const currentPhase = phaseRef.current;
    if (currentPhase !== 'stimulus' && currentPhase !== 'waiting') return;
    if (inFlightPipelineLatencyRef.current) return;

    const next = pendingPipelineLatencyRef.current.shift();
    if (!next) return;
    inFlightPipelineLatencyRef.current = next;

    const commitAtMs = performance.now();
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;

        const paintAtMs = performance.now();
        const latestPhase = phaseRef.current;
        if (latestPhase !== 'stimulus' && latestPhase !== 'waiting') {
          inFlightPipelineLatencyRef.current = null;
          return;
        }

        dispatch({
          type: 'REPORT_INPUT_PIPELINE_LATENCY',
          telemetryId: next.telemetryId,
          modality: next.modality as never,
          inputMethod: next.inputMethod,
          trialIndex: next.trialIndexAtInput,
          phase: next.phaseAtInput,
          capturedAtMs: next.capturedAtMs,
          dispatchCompletedAtMs: next.dispatchCompletedAtMs,
          commitAtMs,
          paintAtMs,
        });
        inFlightPipelineLatencyRef.current = null;
      });
    });

    return () => {
      cancelled = true;
      if (inFlightPipelineLatencyRef.current?.telemetryId === next.telemetryId) {
        inFlightPipelineLatencyRef.current = null;
      }
      pendingPipelineLatencyRef.current.unshift(next);
    };
  }, [dispatch, snapshot]);

  return {
    onClaimTelemetry,
  };
}
