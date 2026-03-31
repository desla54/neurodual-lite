/**
 * useKeyboardControls Hook - Keyboard handling for Dual N-Back
 *
 * Handles keyboard input for game controls using data-driven configuration.
 * Replaces ~480 lines of hardcoded keyboard handling.
 *
 * Features:
 * - Key press/release tracking with timestamps for press duration
 * - Modality resolution for shared keys (S→position2 or visvis)
 * - Pause/resume, start, advance controls
 * - Arithmetic mode input handling
 *
 * @example
 * ```tsx
 * const { pressedKeys, keyDownTimestamps } = useKeyboardControls({
 *   phase,
 *   effectiveModalities,
 *   dispatch,
 *   playClick,
 *   selfPaced,
 *   devPanelEnabled,
 *   setDevPanelOpen,
 * });
 * ```
 */

import { useMountEffect } from '@neurodual/ui';
import { useEffectEvent, useRef, useState } from 'react';
import { resolveModalityForKey, getModalitiesForKey, isGameControlKey } from '@neurodual/logic';

/**
 * Game phase type.
 * Matches SessionPhase from @neurodual/logic
 */
export type GamePhase =
  | 'idle'
  | 'starting'
  | 'countdown'
  | 'stimulus'
  | 'waiting'
  | 'paused'
  | 'feedback'
  | 'complete'
  | 'aborting'
  | 'finished';

/**
 * Dispatch event for game controls.
 */
export type KeyboardDispatchEvent =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ADVANCE' }
  | { type: 'MISFIRED_INPUT'; key: string }
  | {
      type: 'CLAIM_MATCH';
      modality: string;
      inputMethod: 'keyboard';
      telemetryId: string;
      capturedAtMs: number;
    }
  | {
      type: 'RELEASE_CLAIM';
      modality: string;
      pressDurationMs: number;
    }
  | {
      type: 'ARITHMETIC_INPUT';
      key: ArithmeticKey;
      inputMethod: 'keyboard';
    };

/**
 * Arithmetic input key types.
 */
export type ArithmeticKey =
  | { kind: 'digit'; digit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }
  | { kind: 'minus' }
  | { kind: 'decimal' }
  | { kind: 'reset' };

/**
 * Dispatch function type.
 */
export type KeyboardDispatch = (event: KeyboardDispatchEvent) => void;

export interface UseKeyboardControlsOptions {
  /** Current game phase */
  phase: GamePhase;
  /** Active modalities from the game spec */
  effectiveModalities: readonly string[];
  /** Dispatch function for game events */
  dispatch: KeyboardDispatch;
  /** Play click sound callback */
  playClick: () => void;
  /** Whether self-paced mode is enabled (Enter to advance) */
  selfPaced?: boolean;
  /** Whether dev panel shortcut is enabled */
  devPanelEnabled?: boolean;
  /** Callback to toggle dev panel (Ctrl+D) */
  setDevPanelOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  /** Optional callback for input->dispatch latency telemetry */
  onClaimTelemetry?: (event: {
    modality: string;
    inputMethod: 'keyboard';
    telemetryId: string;
    capturedAtMs: number;
    dispatchCompletedAtMs: number;
  }) => void;
}

export interface UseKeyboardControlsReturn {
  /** Currently pressed modality keys */
  pressedKeys: Set<string>;
  /** Ref to keydown timestamps for calculating press duration */
  keyDownTimestamps: React.MutableRefObject<Map<string, number>>;
}

/**
 * Check if arithmetic input is active.
 */
function hasArithmetic(modalities: readonly string[]): boolean {
  return modalities.includes('arithmetic');
}

/**
 * Handle keyboard input for Dual N-Back gameplay.
 *
 * @param options Configuration options
 * @returns Pressed keys state and timestamp ref
 */
export function useKeyboardControls({
  phase,
  effectiveModalities,
  dispatch,
  playClick,
  selfPaced = false,
  devPanelEnabled = false,
  setDevPanelOpen,
  onClaimTelemetry,
}: UseKeyboardControlsOptions): UseKeyboardControlsReturn {
  // Minimum press duration to keep keyboard "active" feedback visible.
  // This is a UI/UX affordance; it doesn't change the moment we dispatch CLAIM_MATCH.
  const MIN_KEYBOARD_PRESS_MS = 220;
  // Track currently pressed keys
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // Track keydown timestamps for calculating pressDurationMs
  const keyDownTimestamps = useRef<Map<string, number>>(new Map());
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // Prevent repeat events from held keys
    if (e.repeat) return;

    // Ctrl+D toggles dev panel (when enabled)
    const isToggleDevPanel =
      (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');
    if (isToggleDevPanel && devPanelEnabled && setDevPanelOpen) {
      e.preventDefault();
      setDevPanelOpen((v) => !v);
      return;
    }

    // Escape or Space toggles pause/resume
    if (e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      if (phase === 'paused') {
        dispatch({ type: 'RESUME' });
        return;
      }
      if (phase === 'stimulus' || phase === 'waiting') {
        dispatch({ type: 'PAUSE' });
        return;
      }
      // Space also starts the game from idle
      if (e.key === ' ' && phase === 'idle') {
        dispatch({ type: 'START' });
        return;
      }
      return;
    }

    // Don't process other keys when paused
    if (phase === 'paused') return;

    // Enter key advances to next trial in self-paced mode
    if (e.key === 'Enter' && selfPaced) {
      e.preventDefault();
      if (phase === 'stimulus' || phase === 'waiting') {
        dispatch({ type: 'ADVANCE' });
        return;
      }
    }

    // Capture timestamp as early as possible for processing lag measurement
    const capturedAtMs = performance.now();
    const telemetryId =
      typeof globalThis !== 'undefined' &&
      (globalThis as unknown as { crypto?: Crypto }).crypto?.randomUUID
        ? (globalThis as unknown as { crypto: Crypto }).crypto.randomUUID()
        : `tlm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const misfire = () => {
      if (phase === 'stimulus' || phase === 'waiting') {
        dispatch({ type: 'MISFIRED_INPUT', key: e.key });
      }
    };

    // Brain Workshop arithmetic: typed-answer input (digits/minus/decimal/reset)
    if (hasArithmetic(effectiveModalities) && (phase === 'stimulus' || phase === 'waiting')) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        dispatch({
          type: 'ARITHMETIC_INPUT',
          key: { kind: 'reset' },
          inputMethod: 'keyboard',
        });
        return;
      }

      if (e.key === '-' || e.key === '−') {
        e.preventDefault();
        dispatch({
          type: 'ARITHMETIC_INPUT',
          key: { kind: 'minus' },
          inputMethod: 'keyboard',
        });
        return;
      }

      // BW uses '.'; accept ',' for FR keyboards (numpad decimal)
      if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        dispatch({
          type: 'ARITHMETIC_INPUT',
          key: { kind: 'decimal' },
          inputMethod: 'keyboard',
        });
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        dispatch({
          type: 'ARITHMETIC_INPUT',
          key: {
            kind: 'digit',
            digit: Number.parseInt(e.key, 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
          },
          inputMethod: 'keyboard',
        });
        return;
      }
    }

    // Check if this is a game control key
    if (!isGameControlKey(e.key)) {
      misfire();
      return;
    }

    // Resolve which modality should respond to this key
    const modality = resolveModalityForKey(e.key, effectiveModalities);

    if (!modality) {
      misfire();
      return;
    }

    // Record timestamp and update pressed state
    keyDownTimestamps.current.set(modality, capturedAtMs);
    setPressedKeys((prev) => new Set(prev).add(modality));

    // Dispatch claim
    dispatch({
      type: 'CLAIM_MATCH',
      modality,
      inputMethod: 'keyboard',
      telemetryId,
      capturedAtMs,
    });

    onClaimTelemetry?.({
      modality,
      inputMethod: 'keyboard',
      telemetryId,
      capturedAtMs,
      dispatchCompletedAtMs: performance.now(),
    });

    // Keep feedback non-blocking vs response dispatch.
    playClick();
  });

  const handleKeyUp = useEffectEvent((e: KeyboardEvent) => {
    // Get all possible modalities for this key (for clearing pressed state)
    const possibleModalities = getModalitiesForKey(e.key);

    // Always clear pressed state on key release (even when paused).
    // Apply a small minimum hold so ultra-fast key taps still show feedback.
    if (possibleModalities.length > 0) {
      const now = performance.now();
      let maxRemaining = 0;
      for (const modality of possibleModalities) {
        const downAt = keyDownTimestamps.current.get(modality);
        if (downAt !== undefined) {
          const elapsed = now - downAt;
          const remaining = Math.max(0, MIN_KEYBOARD_PRESS_MS - elapsed);
          if (remaining > maxRemaining) maxRemaining = remaining;
        }
      }

      if (maxRemaining > 0) {
        window.setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            for (const modality of possibleModalities) {
              next.delete(modality);
            }
            return next;
          });
        }, maxRemaining);
      } else {
        setPressedKeys((prev) => {
          const next = new Set(prev);
          for (const modality of possibleModalities) {
            next.delete(modality);
          }
          return next;
        });
      }
    }

    // Don't process releases when paused
    if (phase === 'paused') return;

    // Helper to calculate press duration and clean up timestamp
    const getPressDuration = (modality: string): number => {
      const startTime = keyDownTimestamps.current.get(modality);
      keyDownTimestamps.current.delete(modality);
      return startTime ? performance.now() - startTime : 0;
    };

    // Resolve which modality should respond
    const modality = resolveModalityForKey(e.key, effectiveModalities);

    if (modality) {
      dispatch({
        type: 'RELEASE_CLAIM',
        modality,
        pressDurationMs: getPressDuration(modality),
      });
    }
  });

  // Keyboard event handlers
  useMountEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      handleKeyUp(e);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  return {
    pressedKeys,
    keyDownTimestamps,
  };
}
