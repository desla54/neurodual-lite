import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';

export function AnimatedCountdownDigits({
  prepDelayMs,
  onCountdownSecond,
}: {
  prepDelayMs: number;
  onCountdownSecond?: (value: 3 | 2 | 1 | 0) => void;
}): ReactNode {
  const countdownDurationMs = Math.max(1, prepDelayMs);
  const countdownStepDurationMs = countdownDurationMs / 4;

  // Fire countdown cues via setTimeout — more reliable than CSS onAnimationStart
  const callbackRef = useRef(onCountdownSecond);
  callbackRef.current = onCountdownSecond;

  useEffect(() => {
    if (!callbackRef.current) return;
    const cb = callbackRef.current;
    const steps = [3, 2, 1, 0] as const;
    const timers = steps.map((value, index) =>
      setTimeout(() => cb(value), countdownStepDurationMs * index),
    );
    return () => timers.forEach(clearTimeout);
  }, [countdownStepDurationMs]);

  return (
    <span className="relative inline-flex items-center gap-1 tabular-nums">
      <span
        aria-hidden="true"
        className="nd-countdown-stack"
        style={
          {
            ['--nd-countdown-duration']: `${countdownDurationMs}ms`,
          } as CSSProperties
        }
      >
        <span className="nd-countdown-digit nd-countdown-digit-3">3</span>
        <span className="nd-countdown-digit nd-countdown-digit-2">2</span>
        <span className="nd-countdown-digit nd-countdown-digit-1">1</span>
        <span className="nd-countdown-digit nd-countdown-digit-0">0</span>
      </span>
    </span>
  );
}
