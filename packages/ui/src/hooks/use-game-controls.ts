/**
 * useGameControls Hook - Data-driven game control generation
 *
 * Generates GameControlItem[] from effectiveModalities using spec configuration.
 * Replaces 287 lines of hardcoded control definitions.
 *
 * @example
 * ```tsx
 * const { controls } = useGameControls({
 *   effectiveModalities,
 *   pressedKeys,
 *   dispatch,
 *   playClick,
 *   t,
 * });
 *
 * return <GameControls controls={controls} />;
 * ```
 */

import { useMemo, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { type ControlConfig, type ControlColor, getControlConfigs } from '@neurodual/logic';
import type { GameControlItem } from '../game/types';

/**
 * Input method for dispatch events.
 */
export type InputMethod = 'keyboard' | 'mouse' | 'touch';

export interface ClaimTelemetry {
  modality: string;
  inputMethod: InputMethod;
  telemetryId: string;
  capturedAtMs: number;
  dispatchCompletedAtMs: number;
}

/**
 * Button position for mouse analytics.
 */
export interface ButtonPosition {
  x: number;
  y: number;
}

/**
 * Dispatch function type for CLAIM_MATCH and RELEASE_CLAIM events.
 */
export type GameDispatch = (event: GameDispatchEvent) => void;

export type GameDispatchEvent =
  | {
      type: 'CLAIM_MATCH';
      modality: string;
      inputMethod: InputMethod;
      telemetryId: string;
      capturedAtMs: number;
      buttonPosition?: ButtonPosition;
    }
  | {
      type: 'RELEASE_CLAIM';
      modality: string;
      pressDurationMs: number;
    };

function generateTelemetryId(): string {
  if (typeof globalThis !== 'undefined') {
    const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  }
  return `tlm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Translation function type.
 */
export type TranslationFn = (key: string, fallback?: string) => string;

export interface UseGameControlsOptions {
  /** Active modalities from the game spec */
  effectiveModalities: readonly string[];
  /** Currently pressed keys (for active state) */
  pressedKeys: Set<string>;
  /** Dispatch function for game events */
  dispatch: GameDispatch;
  /** Play click sound callback */
  playClick: () => void;
  /** Translation function */
  t: TranslationFn;
  /** Optional custom button order */
  buttonOrder?: string[] | null;
  /** Optional callback for input->dispatch latency telemetry */
  onClaimTelemetry?: (event: ClaimTelemetry) => void;
}

export interface UseGameControlsReturn {
  /** Generated control items for GameControls component */
  controls: GameControlItem[];
  /** Helper to get input method from click event */
  getInputMethodFromEvent: (event: ReactMouseEvent<HTMLButtonElement>) => InputMethod;
  /** Helper to get button position from click event */
  getButtonPosition: (event: ReactMouseEvent<HTMLButtonElement>) => ButtonPosition | undefined;
}

/**
 * Detect input method from click/touch event.
 * Uses PointerEvent.pointerType when available, falls back to touch detection.
 */
function detectInputMethod(event: ReactMouseEvent<HTMLButtonElement>): InputMethod {
  // Check PointerEvent.pointerType (modern browsers)
  const nativeEvent = event.nativeEvent as PointerEvent;
  if (nativeEvent.pointerType) {
    return nativeEvent.pointerType === 'touch' ? 'touch' : 'mouse';
  }
  // Fallback: check if device supports touch and screen is small (likely mobile)
  if (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 1024) {
    return 'touch';
  }
  return 'mouse';
}

/**
 * Get button center position from click event (for mouse RT analysis).
 */
function getButtonCenterPosition(
  event: ReactMouseEvent<HTMLButtonElement>,
  inputMethod: InputMethod,
): ButtonPosition | undefined {
  // Only capture position for mouse input (touch doesn't need travel distance analysis)
  if (inputMethod !== 'mouse') return undefined;

  // Get button center position
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

/**
 * Generate game controls from modality configuration.
 *
 * @param options Configuration options
 * @returns Generated controls and helper functions
 */
export function useGameControls({
  effectiveModalities,
  pressedKeys,
  dispatch,
  playClick,
  t,
  buttonOrder,
  onClaimTelemetry,
}: UseGameControlsOptions): UseGameControlsReturn {
  const onClaimTelemetryRef = useRef(onClaimTelemetry);
  onClaimTelemetryRef.current = onClaimTelemetry;

  // Get input method helper (memoized)
  const getInputMethodFromEvent = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>): InputMethod => {
      return detectInputMethod(event);
    },
    [],
  );

  // Get button position helper (memoized)
  const getButtonPosition = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>): ButtonPosition | undefined => {
      const inputMethod = detectInputMethod(event);
      return getButtonCenterPosition(event, inputMethod);
    },
    [],
  );

  // Generate stable control configs (callbacks don't depend on pressedKeys)
  // This separation prevents re-creating onClick handlers when only active state changes
  const stableConfigs = useMemo(() => {
    // Get control configs for active modalities
    const configs = getControlConfigs(effectiveModalities);

    // Map configs to partial GameControlItems (without active state)
    const items = configs.map((config: ControlConfig) => ({
      id: config.modalityId,
      label: t(config.labelKey),
      shortcut: config.shortcut,
      color: config.color as ControlColor,
      onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
        const capturedAtMs = performance.now();
        const telemetryId = generateTelemetryId();

        const inputMethod = detectInputMethod(e);
        const buttonPosition = getButtonCenterPosition(e, inputMethod);

        dispatch({
          type: 'CLAIM_MATCH',
          modality: config.modalityId,
          inputMethod,
          telemetryId,
          capturedAtMs,
          buttonPosition,
        });

        const dispatchCompletedAtMs = performance.now();

        // Release immediately on click. Pointer-based presses are handled via
        // pointerdown at the component level, but keyboard/assistive activations
        // still route through click.
        dispatch({
          type: 'RELEASE_CLAIM',
          modality: config.modalityId,
          pressDurationMs: 0,
        });

        onClaimTelemetryRef.current?.({
          modality: config.modalityId,
          inputMethod,
          telemetryId,
          capturedAtMs,
          dispatchCompletedAtMs,
        });

        // Keep feedback non-blocking vs response dispatch.
        playClick();
      },
    }));

    // Apply custom button order if provided
    if (buttonOrder && buttonOrder.length > 0) {
      items.sort((a, b) => {
        const indexA = buttonOrder.indexOf(a.id);
        const indexB = buttonOrder.indexOf(b.id);
        // If a button is not in the order, put it at the end
        return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
      });
    }

    return items;
  }, [effectiveModalities, dispatch, playClick, t, buttonOrder]); // NOTE: pressedKeys NOT included

  // Merge stable configs with reactive active state
  // This runs when pressedKeys changes, but onClick callbacks remain stable
  const controls: GameControlItem[] = useMemo(() => {
    return stableConfigs.map((config) => ({
      ...config,
      active: pressedKeys.has(config.id),
    }));
  }, [stableConfigs, pressedKeys]);

  return {
    controls,
    getInputMethodFromEvent,
    getButtonPosition,
  };
}
