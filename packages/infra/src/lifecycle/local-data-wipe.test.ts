import { describe, expect, it, beforeEach, spyOn } from 'bun:test';
import * as platformDetector from '../db/platform-detector';
import * as sessionRecovery from './session-recovery';
import * as powerSyncDatabase from '../powersync/database';
import { wipeLocalDeviceData } from './local-data-wipe';

describe('local-data-wipe', () => {
  let isPowerSyncInitializedSpy: ReturnType<typeof spyOn>;
  let closePowerSyncDatabaseSpy: ReturnType<typeof spyOn>;
  let clearAllRecoveryDataSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Default mocks - non-native, powersync not initialized
    spyOn(platformDetector, 'isCapacitorNative').mockReturnValue(false);
    clearAllRecoveryDataSpy = spyOn(sessionRecovery, 'clearAllRecoveryData').mockImplementation(
      () => {},
    );
    isPowerSyncInitializedSpy = spyOn(powerSyncDatabase, 'isPowerSyncInitialized').mockReturnValue(
      false,
    );
    closePowerSyncDatabaseSpy = spyOn(
      powerSyncDatabase,
      'closePowerSyncDatabase',
    ).mockResolvedValue(undefined);
  });

  describe('wipeLocalDeviceData', () => {
    it('should return success in test environment', async () => {
      // The function checks for NODE_ENV === 'test' and returns early
      const result = await wipeLocalDeviceData();
      expect(result.success).toBe(true);
    });

    it('should clear recovery data', async () => {
      await wipeLocalDeviceData();
      expect(clearAllRecoveryDataSpy).toHaveBeenCalled();
    });

    it('should close PowerSync database if initialized', async () => {
      isPowerSyncInitializedSpy.mockReturnValue(true);

      await wipeLocalDeviceData();

      expect(closePowerSyncDatabaseSpy).toHaveBeenCalled();
    });

    it('should not close PowerSync database if not initialized', async () => {
      // Reset the spy call count
      closePowerSyncDatabaseSpy.mockClear();
      isPowerSyncInitializedSpy.mockReturnValue(false);

      await wipeLocalDeviceData();

      expect(closePowerSyncDatabaseSpy).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      isPowerSyncInitializedSpy.mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await wipeLocalDeviceData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });

    it('should handle non-Error thrown values', async () => {
      isPowerSyncInitializedSpy.mockImplementation(() => {
        throw 'string error';
      });

      const result = await wipeLocalDeviceData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });
});
