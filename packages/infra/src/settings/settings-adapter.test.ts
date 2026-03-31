import { describe, expect, it, mock } from 'bun:test';
import { createSettingsAdapter } from './settings-adapter';
import type { SettingsStorePort, UserSettings } from '@neurodual/logic';

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockPersistence(overrides: Partial<SettingsStorePort> = {}): SettingsStorePort {
  return {
    getSettings: mock(async () => null),
    saveSettings: mock(async () => {}),
    ...overrides,
  };
}

function makeFakeSettings(): UserSettings {
  return { language: 'en', theme: 'dark' } as unknown as UserSettings;
}

describe('settings-adapter', () => {
  describe('getSettings', () => {
    it('returns settings from persistence', async () => {
      const stored = { language: 'en', theme: 'dark' };
      const persistence = createMockPersistence({
        getSettings: mock(async () => stored),
      });
      const adapter = createSettingsAdapter(persistence);

      const result = await adapter.getSettings('user-1');

      expect(result as any).toEqual(stored);
      expect(persistence.getSettings).toHaveBeenCalledTimes(1);
    });

    it('returns null when persistence returns null', async () => {
      const persistence = createMockPersistence({
        getSettings: mock(async () => null),
      });
      const adapter = createSettingsAdapter(persistence);

      const result = await adapter.getSettings('user-1');

      expect(result).toBeNull();
    });

    it('defaults userId to "local"', async () => {
      const persistence = createMockPersistence();
      const adapter = createSettingsAdapter(persistence);

      // Should not throw - the default parameter is used internally
      const result = await adapter.getSettings();

      expect(result).toBeNull();
    });

    it('catches PowerSync closed errors and returns null', async () => {
      const closedError = new Error('closed');
      const persistence = createMockPersistence({
        getSettings: mock(async () => {
          throw closedError;
        }),
      });
      const adapter = createSettingsAdapter(persistence);

      const result = await adapter.getSettings('user-1');

      expect(result).toBeNull();
    });

    it('catches "database is closing" errors and returns null', async () => {
      const closingError = new Error('database is closing');
      const persistence = createMockPersistence({
        getSettings: mock(async () => {
          throw closingError;
        }),
      });
      const adapter = createSettingsAdapter(persistence);

      const result = await adapter.getSettings('user-1');

      expect(result).toBeNull();
    });

    it('rethrows non-PowerSync errors', async () => {
      const genericError = new Error('network timeout');
      const persistence = createMockPersistence({
        getSettings: mock(async () => {
          throw genericError;
        }),
      });
      const adapter = createSettingsAdapter(persistence);

      await expect(adapter.getSettings('user-1')).rejects.toThrow('network timeout');
    });
  });

  describe('saveSettings', () => {
    it('delegates to persistence.saveSettings', async () => {
      const persistence = createMockPersistence();
      const adapter = createSettingsAdapter(persistence);
      const settings = makeFakeSettings();

      await adapter.saveSettings(settings, 'user-1');

      expect(persistence.saveSettings).toHaveBeenCalledTimes(1);
      expect(persistence.saveSettings).toHaveBeenCalledWith(settings);
    });

    it('defaults userId to "local"', async () => {
      const persistence = createMockPersistence();
      const adapter = createSettingsAdapter(persistence);

      // Should not throw with no userId
      await adapter.saveSettings(makeFakeSettings());

      expect(persistence.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('catches PowerSync closed errors silently', async () => {
      const closedError = new Error('closed');
      const persistence = createMockPersistence({
        saveSettings: mock(async () => {
          throw closedError;
        }),
      });
      const adapter = createSettingsAdapter(persistence);

      // Should not throw
      await adapter.saveSettings(makeFakeSettings(), 'user-1');
    });

    it('rethrows non-PowerSync errors', async () => {
      const genericError = new Error('disk full');
      const persistence = createMockPersistence({
        saveSettings: mock(async () => {
          throw genericError;
        }),
      });
      const adapter = createSettingsAdapter(persistence);

      await expect(adapter.saveSettings(makeFakeSettings(), 'user-1')).rejects.toThrow('disk full');
    });
  });
});
