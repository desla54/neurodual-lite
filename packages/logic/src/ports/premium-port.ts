/**
 * PremiumPort
 *
 * Simple premium/activation system.
 * - 30 min free gameplay, then level 3+ is locked
 * - €4.99 lifetime unlock via activation code
 * - Max 3 devices per code
 */

// =============================================================================
// Constants
// =============================================================================

/** Free playtime allowance in milliseconds (30 minutes) */
export const FREE_PLAYTIME_MS = 30 * 60 * 1000;

/** N-level at which free users are blocked */
export const PREMIUM_GATE_N_LEVEL = 3;

/** Max device activations per code */
export const MAX_ACTIVATIONS = 3;

// =============================================================================
// Types
// =============================================================================

export interface DeviceActivation {
  readonly deviceId: string;
  readonly deviceName: string | null;
  readonly activatedAt: number;
}

export interface PremiumState {
  /** Whether this device has premium access */
  readonly isPremium: boolean;
  /** The activation code used (null if not activated) */
  readonly activationCode: string | null;
  /** Total gameplay time in ms (from session_summaries) */
  readonly totalPlaytimeMs: number;
  /** Remaining free time in ms (0 if premium or exhausted) */
  readonly remainingFreeTimeMs: number;
  /** Whether the free time is exhausted */
  readonly isFreeTimeExhausted: boolean;
  /** Device activations for the current code */
  readonly devices: readonly DeviceActivation[];
  /** Number of activations used / max */
  readonly activationsUsed: number;
}

export interface ActivationResult {
  readonly success: boolean;
  readonly error?: 'invalid_code' | 'max_activations' | 'network_error' | 'missing_fields';
  readonly alreadyActivated?: boolean;
  readonly activationsUsed?: number;
}

export interface DeactivationResult {
  readonly success: boolean;
  readonly removed?: boolean;
}

export type PremiumStateListener = (state: PremiumState) => void;

// =============================================================================
// Port
// =============================================================================

export interface PremiumPort {
  /** Get current premium state */
  getState(): PremiumState;

  /** Subscribe to state changes */
  subscribe(listener: PremiumStateListener): () => void;

  /** Activate a code on this device */
  activate(code: string): Promise<ActivationResult>;

  /** Deactivate this device from the current code */
  deactivate(): Promise<DeactivationResult>;

  /** Verify current activation status with server */
  verify(): Promise<PremiumState>;

  /** Get unique device ID (generated on first launch) */
  getDeviceId(): string;

  /** Refresh total playtime from local DB */
  refreshPlaytime(): Promise<void>;

  /** Check if a given N-level is accessible */
  canAccessNLevel(nLevel: number): boolean;
}

// =============================================================================
// Helpers
// =============================================================================

export function createDefaultPremiumState(): PremiumState {
  return {
    isPremium: false,
    activationCode: null,
    totalPlaytimeMs: 0,
    remainingFreeTimeMs: FREE_PLAYTIME_MS,
    isFreeTimeExhausted: false,
    devices: [],
    activationsUsed: 0,
  };
}
