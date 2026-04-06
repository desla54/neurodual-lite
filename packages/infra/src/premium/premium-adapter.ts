/**
 * PremiumAdapter
 *
 * Local implementation of PremiumPort.
 * - Stores activation code + device ID in SQLite settings
 * - Queries session_summaries for total playtime
 * - Calls the Activation API Worker for code verification
 */

import type {
  ActivationResult,
  DeactivationResult,
  DeviceActivation,
  PremiumPort,
  PremiumState,
  PremiumStateListener,
} from '@neurodual/logic';
import {
  createDefaultPremiumState,
  FREE_PLAYTIME_MS,
  PREMIUM_GATE_N_LEVEL,
} from '@neurodual/logic';

// =============================================================================
// Settings Keys (stored in SQLite 'settings' table)
// =============================================================================

const SETTINGS_KEY = 'premium';

interface PremiumSettings {
  activationCode: string | null;
  deviceId: string;
  isPremium: boolean;
  grantType?: 'activation_code' | 'legacy_migration';
}

// =============================================================================
// Adapter
// =============================================================================

export interface PremiumAdapterDeps {
  /** Base URL of the activation API worker */
  apiUrl: string;
  /** Read a setting from SQLite */
  getSetting: (key: string) => Promise<string | null>;
  /** Write a setting to SQLite */
  setSetting: (key: string, value: string) => Promise<void>;
  /** Query total playtime from session_summaries */
  getTotalPlaytimeMs: () => Promise<number>;
  /** Detect whether this install should receive the one-time legacy lifetime migration */
  shouldGrantLegacyLifetime?: () => Promise<boolean>;
}

export function createPremiumAdapter(deps: PremiumAdapterDeps): PremiumPort {
  const listeners = new Set<PremiumStateListener>();
  let currentState: PremiumState = createDefaultPremiumState();
  let deviceId: string | null = null;

  function notify(): void {
    for (const listener of listeners) {
      listener(currentState);
    }
  }

  function updateState(partial: Partial<PremiumState>): void {
    currentState = { ...currentState, ...partial };
    notify();
  }

  async function getOrCreateDeviceId(): Promise<string> {
    if (deviceId) return deviceId;

    const raw = await deps.getSetting(SETTINGS_KEY);
    if (raw) {
      try {
        const settings: PremiumSettings = JSON.parse(raw);
        if (settings.deviceId) {
          deviceId = settings.deviceId;
          return deviceId;
        }
      } catch {
        // Corrupted settings, regenerate
      }
    }

    // Generate new device ID
    deviceId = crypto.randomUUID();
    await saveSettings({ activationCode: null, deviceId, isPremium: false });
    return deviceId;
  }

  async function loadSettings(): Promise<PremiumSettings | null> {
    const raw = await deps.getSetting(SETTINGS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PremiumSettings;
    } catch {
      return null;
    }
  }

  async function saveSettings(settings: PremiumSettings): Promise<void> {
    await deps.setSetting(SETTINGS_KEY, JSON.stringify(settings));
  }

  async function claimLegacyMigrationCode(did: string): Promise<boolean> {
    try {
      const res = await fetch(`${deps.apiUrl}/legacy-migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: did,
          deviceName: navigator.userAgent.slice(0, 60),
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        code?: string;
        activationsUsed?: number;
        devices?: DeviceActivation[];
      };

      if (!res.ok || !data.success || !data.code) {
        return false;
      }

      const activationCode = data.code.trim().toUpperCase();
      await saveSettings({
        activationCode,
        deviceId: did,
        isPremium: true,
        grantType: 'legacy_migration',
      });

      updateState({
        isPremium: true,
        activationCode,
        devices: data.devices ?? [],
        activationsUsed: data.activationsUsed ?? 1,
        remainingFreeTimeMs: FREE_PLAYTIME_MS,
        isFreeTimeExhausted: false,
      });

      return true;
    } catch {
      return false;
    }
  }

  async function refreshPlaytime(): Promise<void> {
    const totalMs = await deps.getTotalPlaytimeMs();
    const remaining = currentState.isPremium
      ? FREE_PLAYTIME_MS
      : Math.max(0, FREE_PLAYTIME_MS - totalMs);

    updateState({
      totalPlaytimeMs: totalMs,
      remainingFreeTimeMs: remaining,
      isFreeTimeExhausted: !currentState.isPremium && totalMs >= FREE_PLAYTIME_MS,
    });
  }

  async function initialize(): Promise<void> {
    const did = await getOrCreateDeviceId();
    let settings = await loadSettings();

    if (!settings?.isPremium && deps.shouldGrantLegacyLifetime) {
      try {
        const shouldGrant = await deps.shouldGrantLegacyLifetime();
        if (shouldGrant) {
          await claimLegacyMigrationCode(did);
          settings = await loadSettings();
        }
      } catch {
        // Ignore eligibility probe failures and continue with regular initialization.
      }
    }

    if (settings?.isPremium) {
      currentState = {
        ...currentState,
        isPremium: true,
        activationCode: settings.activationCode ?? null,
      };
    }

    // Refresh playtime
    const totalMs = await deps.getTotalPlaytimeMs();
    const isPremium = currentState.isPremium;
    const remaining = isPremium ? FREE_PLAYTIME_MS : Math.max(0, FREE_PLAYTIME_MS - totalMs);

    currentState = {
      ...currentState,
      totalPlaytimeMs: totalMs,
      remainingFreeTimeMs: remaining,
      isFreeTimeExhausted: !isPremium && totalMs >= FREE_PLAYTIME_MS,
    };

    // If premium, try to verify and get device list (non-blocking)
    if (isPremium && settings?.activationCode) {
      verifyWithServer(settings.activationCode, did).catch(() => {
        // Offline — keep local state
      });
    }

    notify();
  }

  async function verifyWithServer(code: string, did: string): Promise<void> {
    const res = await fetch(
      `${deps.apiUrl}/verify?code=${encodeURIComponent(code)}&deviceId=${encodeURIComponent(did)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      activated: boolean;
      devices?: DeviceActivation[];
      activationsUsed?: number;
    };

    if (data.activated) {
      updateState({
        devices: data.devices ?? [],
        activationsUsed: data.activationsUsed ?? 0,
      });
    } else {
      // Server says not activated — maybe code was revoked
      updateState({
        isPremium: false,
        activationCode: null,
        devices: [],
        activationsUsed: 0,
      });
      await saveSettings({
        activationCode: null,
        deviceId: did,
        isPremium: false,
      });
    }
  }

  // Initialize on creation
  const initPromise = initialize();

  const port: PremiumPort = {
    getState(): PremiumState {
      return currentState;
    },

    subscribe(listener: PremiumStateListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async activate(code: string): Promise<ActivationResult> {
      await initPromise;
      const did = await getOrCreateDeviceId();

      try {
        const res = await fetch(`${deps.apiUrl}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            deviceId: did,
            deviceName: navigator.userAgent.slice(0, 60),
          }),
        });

        const data = (await res.json()) as {
          success?: boolean;
          alreadyActivated?: boolean;
          activationsUsed?: number;
          maxActivations?: number;
          error?: string;
        };

        if (!res.ok) {
          return {
            success: false,
            error: (data.error as ActivationResult['error']) ?? 'network_error',
          };
        }

        // Success — save locally
        const normalizedCode = code.trim().toUpperCase();
        await saveSettings({
          activationCode: normalizedCode,
          deviceId: did,
          isPremium: true,
          grantType: 'activation_code',
        });

        updateState({
          isPremium: true,
          activationCode: normalizedCode,
          activationsUsed: data.activationsUsed ?? 1,
          remainingFreeTimeMs: FREE_PLAYTIME_MS,
          isFreeTimeExhausted: false,
        });

        // Fetch full device list
        verifyWithServer(normalizedCode, did).catch(() => {});

        return {
          success: true,
          alreadyActivated: data.alreadyActivated,
          activationsUsed: data.activationsUsed,
        };
      } catch {
        return { success: false, error: 'network_error' };
      }
    },

    async deactivate(): Promise<DeactivationResult> {
      await initPromise;
      const did = await getOrCreateDeviceId();
      const code = currentState.activationCode;

      if (!code) {
        return { success: false };
      }

      try {
        const res = await fetch(`${deps.apiUrl}/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, deviceId: did }),
        });

        const data = (await res.json()) as { success: boolean; removed?: boolean };

        if (data.success) {
          await saveSettings({
            activationCode: null,
            deviceId: did,
            isPremium: false,
            grantType: 'activation_code',
          });

          updateState({
            isPremium: false,
            activationCode: null,
            devices: [],
            activationsUsed: 0,
          });
          // Recalculate free time
          await refreshPlaytime();
        }

        return data;
      } catch {
        return { success: false };
      }
    },

    async verify(): Promise<PremiumState> {
      await initPromise;
      const did = await getOrCreateDeviceId();
      const code = currentState.activationCode;

      if (code) {
        await verifyWithServer(code, did);
      }

      return currentState;
    },

    getDeviceId(): string {
      return deviceId ?? 'pending';
    },

    async refreshPlaytime(): Promise<void> {
      await initPromise;
      await refreshPlaytime();
    },

    canAccessNLevel(nLevel: number): boolean {
      if (currentState.isPremium) return true;
      if (nLevel < PREMIUM_GATE_N_LEVEL) return true;
      return !currentState.isFreeTimeExhausted;
    },
  };

  return port;
}
