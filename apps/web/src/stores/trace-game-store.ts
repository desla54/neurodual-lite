/**
 * trace-game-store.ts - Local UI state for Trace training
 *
 * Manages display settings that persist across sessions but don't affect
 * the session logic itself. Separate from the session state machine.
 *
 * ISI Synchronization:
 * - ISI is persisted in useSettingsStore.ui.traceIsiMs
 * - This store keeps a local copy for fast UI updates
 * - Changes are synced to settings store for persistence
 * - Call initFromSettings() on mount to load persisted value
 */

import { create } from 'zustand';
import { useSettingsStore } from './settings-store';

// =============================================================================
// TYPES
// =============================================================================

/** Grid visual style: 'trace' (rounded cells with gaps) or 'classic' (square cells with borders) */
export type GridStyle = 'trace' | 'classic';

export interface TraceGameState {
  // === Display Settings ===
  /** Show trial count as countdown (remaining) vs count-up */
  countdownMode: boolean;
  /** Show N-level badge in HUD */
  showNLevel: boolean;
  /** Show progress bar below HUD */
  showProgressBar: boolean;
  /** Grid scale factor (0.7 - 1.3) */
  gridScale: number;
  /** Grid visual style: 'trace' (rounded cells) or 'classic' (square cells with borders) */
  gridStyle: GridStyle;
  /** Inter-stimulus interval in ms (response window) */
  isiMs: number;
  /** Adaptive timing enabled (auto-adjusts difficulty based on performance) */
  adaptiveTimingEnabled: boolean;
  /** Sequential trace mode: N swipes step-by-step instead of one direct swipe (self-paced only) */
  sequentialTrace: boolean;
  /** Show contextual instructions during the first N trials */
  showInGameInstructions: boolean;

  // === Overlay State ===
  /** Settings overlay visible */
  showSettingsOverlay: boolean;
  /** Quit confirmation modal visible */
  showQuitModal: boolean;
}

export interface TraceGameActions {
  // === Display Settings ===
  setCountdownMode: (value: boolean) => void;
  setShowNLevel: (value: boolean) => void;
  setShowProgressBar: (value: boolean) => void;
  setGridScale: (value: number) => void;
  setGridStyle: (value: GridStyle) => void;
  setIsiMs: (value: number) => void;
  setAdaptiveTimingEnabled: (value: boolean) => void;
  setSequentialTrace: (value: boolean) => void;
  setShowInGameInstructions: (value: boolean) => void;

  // === Overlay State ===
  setShowSettingsOverlay: (value: boolean) => void;
  setShowQuitModal: (value: boolean) => void;

  // === Initialization ===
  /** Load ISI and adaptive timing from persisted settings (call on mount) */
  initFromSettings: () => void;

  // === Reset ===
  reset: () => void;
}

export type TraceGameStore = TraceGameState & TraceGameActions;

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_STATE: TraceGameState = {
  countdownMode: false,
  showNLevel: true,
  showProgressBar: true,
  gridScale: 1.0,
  gridStyle: 'trace',
  isiMs: 2500,
  adaptiveTimingEnabled: false, // Default from spec
  sequentialTrace: false,
  showInGameInstructions: true,
  showSettingsOverlay: false,
  showQuitModal: false,
};

// =============================================================================
// STORE
// =============================================================================

export const useTraceGameStore = create<TraceGameStore>((set) => ({
  ...DEFAULT_STATE,

  // Display Settings
  setCountdownMode: (value) => set({ countdownMode: value }),
  setShowNLevel: (value) => set({ showNLevel: value }),
  setShowProgressBar: (value) => set({ showProgressBar: value }),
  setGridScale: (value) => set({ gridScale: Math.max(0.7, Math.min(1.3, value)) }),
  setGridStyle: (value) => set({ gridStyle: value }),
  setIsiMs: (value) => {
    const clampedValue = Math.max(1500, Math.min(10000, value));
    set({ isiMs: clampedValue });
    // Sync to persisted settings
    useSettingsStore.getState().setTraceIsiMs(clampedValue);
  },
  setAdaptiveTimingEnabled: (value) => {
    set({ adaptiveTimingEnabled: value });
    // Sync to persisted settings
    useSettingsStore.getState().setTraceAdaptiveTimingEnabled(value);
  },
  setSequentialTrace: (value) => set({ sequentialTrace: value }),
  setShowInGameInstructions: (value) => set({ showInGameInstructions: value }),

  // Overlay State
  setShowSettingsOverlay: (value) => set({ showSettingsOverlay: value }),
  setShowQuitModal: (value) => set({ showQuitModal: value }),

  // Initialization - load from persisted settings
  initFromSettings: () => {
    const settings = useSettingsStore.getState();
    if (settings.ui.traceIsiMs) {
      set({ isiMs: settings.ui.traceIsiMs });
    }
    // Load adaptive timing (default to true if not set)
    const adaptiveTimingEnabled = settings.ui.traceAdaptiveTimingEnabled ?? false;
    set({ adaptiveTimingEnabled });
  },

  // Reset
  reset: () => set(DEFAULT_STATE),
}));
