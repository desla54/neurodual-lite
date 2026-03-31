/**
 * Supabase Admin Functions
 *
 * Administrative functions that require direct Supabase access.
 * These are NOT part of the PowerSync sync flow - they are admin operations
 * that manipulate cloud data directly.
 *
 * Functions:
 * - deleteAllUserData(): Delete all user data (local + cloud)
 * - cleanupOrphanSessions(): Clean up incomplete sessions in cloud
 * - forceFullResync(): Force a complete re-sync from cloud
 */

import { SESSION_END_EVENT_TYPES } from '@neurodual/logic';
import { syncLog } from '../logger';
import { wipeLocalDeviceData } from '../lifecycle/local-data-wipe';
import {
  getPowerSyncDatabase,
  isPowerSyncInitialized,
  reconnectPowerSync,
} from '../powersync/database';
import { isCapacitorNative } from '../db/platform-detector';
import { getSupabase, isSupabaseConfigured } from './client';
import { parseSessionIdFromStreamId } from '../es-emmett/stream-id';

// Session end event types for orphan detection
const SESSION_END_TYPES = Array.from(SESSION_END_EVENT_TYPES) as readonly string[];

function userIdLikePattern(userId: string): string {
  // `emt_messages.message_data` is stored as JSON string (TEXT) for PowerSync compatibility.
  // For admin cleanup/delete we use a best-effort LIKE filter on `"userId":"<uuid>"`.
  return `%"userId":"${userId}"%`;
}

function extractEventTimestampMs(messageDataJson: string, fallbackIso: string): number {
  try {
    const parsed = JSON.parse(messageDataJson) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not object');
    const data = (parsed as Record<string, unknown>)['data'];
    if (typeof data !== 'object' || data === null) throw new Error('missing data');
    const timestamp = (data as Record<string, unknown>)['timestamp'];
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
    if (typeof timestamp === 'string') {
      const n = Number(timestamp);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    // Fall back to created time when JSON is missing/corrupt.
  }
  const ms = Date.parse(fallbackIso);
  return Number.isFinite(ms) ? ms : Date.now();
}

// =============================================================================
// Delete All User Data
// =============================================================================

/**
 * Delete all user data from both local storage and cloud.
 *
 * Steps:
 * 1. Create reset marker (cross-device wipe) + hard-delete cloud data
 * 2. Wipe local persistence (PowerSync + caches)
 *
 * Note: After calling this, the user must reload the app to reinitialize.
 */
export async function deleteAllUserData(): Promise<{ success: boolean; error?: string }> {
  syncLog.info('========== DELETING ALL USER DATA ==========');

  try {
    // Resolve user ID (best-effort) for cloud deletion + reset marker
    let userId: string | null = null;
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        // Continue even if we can't get user ID
        syncLog.warn('Could not get user ID for cloud deletion');
      }
    }

    // Step 1: Hard-delete cloud data
    if (isSupabaseConfigured() && userId) {
      syncLog.debug('Step 1: Hard deleting cloud data...');
      try {
        const supabase = getSupabase();

        // Hard delete everything user-owned (history + stats + tombstones + reset marker)
        // Note: deleted_sessions MUST be cleared, otherwise tombstones block re-imports.
        // Note: user_resets MUST be cleared, otherwise the reset marker triggers repeated wipes.
        await supabase
          .from('emt_messages')
          .delete()
          .eq('message_kind', 'E')
          .like('message_data', userIdLikePattern(userId));
        await supabase.from('deleted_sessions').delete().eq('user_id', userId);
        await supabase.from('user_rewards').delete().eq('user_id', userId);
        await supabase.from('settings').delete().eq('user_id', userId);
        await supabase.from('user_resets').delete().eq('user_id', userId);

        syncLog.debug('Cloud user data hard deleted');
      } catch (cloudErr) {
        // Best-effort: still wipe local so the user actually gets a reset.
        syncLog.warn('Cloud delete error (continuing with local wipe):', cloudErr);
      }
    } else {
      syncLog.debug('Step 1: No cloud sync active, skipping cloud delete');
    }

    // Step 2: Wipe local persistence for this device (PowerSync + caches).
    syncLog.debug('Step 2: Wiping local device data...');
    const local = await wipeLocalDeviceData();
    if (!local.success) {
      syncLog.warn('Local wipe failed:', local.error);
    }

    syncLog.info('========== ALL DATA DELETED ==========');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    syncLog.error('deleteAllUserData failed:', message);
    return { success: false, error: message };
  }
}

// =============================================================================
// Cleanup Orphan Sessions
// =============================================================================

/**
 * Clean up orphan sessions in the cloud.
 *
 * Orphan sessions are sessions that have a SESSION_STARTED event but no
 * SESSION_ENDED-like event. These can occur when:
 * - The app was killed mid-session
 * - The device lost power
 * - A crash occurred before session completion
 *
 * This function archives all orphan session messages in the cloud (`emt_messages.is_archived = 1`).
 * The "orphan threshold" is 24 hours - sessions started more than 24h ago
 * without ending are considered orphans.
 */
export async function cleanupOrphanSessions(): Promise<{
  cleanedCount: number;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { cleanedCount: 0, error: 'Supabase not configured' };
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { cleanedCount: 0, error: 'Not authenticated' };
  }

  syncLog.info('Checking for orphan sessions in cloud...');

  try {
    // Step 1: Get all unique session IDs with their start events (last 30 days)
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: startMessages, error: startError } = await supabase
      .from('emt_messages')
      .select('stream_id, created, message_data')
      .eq('message_kind', 'E')
      .eq('is_archived', 0)
      .in('message_type', [
        'SESSION_STARTED',
        'FLOW_SESSION_STARTED',
        'RECALL_SESSION_STARTED',
        'TRACE_SESSION_STARTED',
        'DUAL_PICK_SESSION_STARTED',
      ])
      .gte('created', thirtyDaysAgoIso)
      .like('message_data', userIdLikePattern(user.id))
      .order('created', { ascending: true });

    if (startError) {
      syncLog.error('Failed to query start events:', startError);
      return { cleanedCount: 0, error: startError.message };
    }

    if (!startMessages || startMessages.length === 0) {
      syncLog.info('No sessions found in cloud');
      return { cleanedCount: 0 };
    }

    // Group by session_id, keep earliest timestamp
    const sessionStarts = new Map<string, number>();
    for (const msg of startMessages) {
      const sessionId = parseSessionIdFromStreamId(msg.stream_id);
      if (!sessionId) continue;
      if (sessionStarts.has(sessionId)) continue;
      sessionStarts.set(sessionId, extractEventTimestampMs(msg.message_data, msg.created));
    }

    // Step 2: Get all session IDs that have end events
    const sessionIds = Array.from(sessionStarts.keys());
    const completedSessions = new Set<string>();

    // Query in batches of 100 to avoid URL length limits
    for (let i = 0; i < sessionIds.length; i += 100) {
      const batch = sessionIds.slice(i, i + 100);
      const streamIds = batch.map((id) => `session:${id}`);
      const { data: endMessages, error: endError } = await supabase
        .from('emt_messages')
        .select('stream_id')
        .eq('message_kind', 'E')
        .eq('is_archived', 0)
        .in('stream_id', streamIds)
        .in('message_type', SESSION_END_TYPES)
        .like('message_data', userIdLikePattern(user.id));

      if (endError) {
        syncLog.error('Failed to query end events:', endError);
        return { cleanedCount: 0, error: endError.message };
      }

      if (endMessages) {
        for (const msg of endMessages) {
          const sessionId = parseSessionIdFromStreamId(msg.stream_id);
          if (!sessionId) continue;
          completedSessions.add(sessionId);
        }
      }
    }

    // Step 3: Find orphan sessions (started > 24h ago, no end event)
    const orphanThreshold = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const orphanSessionIds: string[] = [];

    for (const [sessionId, startTimestamp] of sessionStarts) {
      if (!completedSessions.has(sessionId) && startTimestamp < orphanThreshold) {
        orphanSessionIds.push(sessionId);
      }
    }

    if (orphanSessionIds.length === 0) {
      syncLog.info('No orphan sessions found');
      return { cleanedCount: 0 };
    }

    syncLog.info(`Found ${orphanSessionIds.length} orphan session(s) - soft-deleting...`);

    // Step 4: Soft-delete all events of orphan sessions
    let cleanedCount = 0;
    for (const sessionId of orphanSessionIds) {
      const { error: archiveError, count } = await supabase
        .from('emt_messages')
        .update({ is_archived: 1 })
        .eq('message_kind', 'E')
        .eq('is_archived', 0)
        .eq('stream_id', `session:${sessionId}`)
        .like('message_data', userIdLikePattern(user.id));

      if (archiveError) {
        syncLog.error(`Failed to archive session ${sessionId}:`, archiveError);
        continue;
      }

      cleanedCount++;
      syncLog.debug(`Archived orphan session ${sessionId.slice(0, 8)} (${count ?? '?'} messages)`);
    }

    syncLog.info(`Cleaned ${cleanedCount} orphan session(s)`);
    return { cleanedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    syncLog.error('cleanupOrphanSessions failed:', message);
    return { cleanedCount: 0, error: message };
  }
}

// =============================================================================
// Force Full Resync
// =============================================================================

/**
 * Force a complete re-sync from cloud.
 *
 * This disconnects and reconnects PowerSync, which triggers
 * a full re-download of all data from the cloud.
 */
export async function forceFullResync(): Promise<{ success: boolean; error?: string }> {
  syncLog.info('Forcing full resync...');

  try {
    if (!isPowerSyncInitialized()) {
      return { success: false, error: 'PowerSync not initialized' };
    }

    const db = getPowerSyncDatabase();

    // Mobile web browsers (Android/iOS PWA) are more sensitive to background socket
    // suspension and reconnect races. A destructive disconnectAndClear can leave the app
    // temporarily offline with an empty local DB if reconnection is flaky.
    // Use a safe reconnect path instead of local wipe.
    const isMobileWeb =
      !isCapacitorNative() &&
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '');
    if (isMobileWeb) {
      const connected = (db as unknown as { connected?: unknown }).connected === true;
      if (!connected) {
        await reconnectPowerSync();
      }
      syncLog.info('Safe mobile-web resync path used (no local clear)');
      return { success: true };
    }

    // Disconnect, clear local data, and reconnect
    // This triggers a full re-sync
    await db.disconnectAndClear();
    await reconnectPowerSync();

    syncLog.info('Full resync initiated');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    syncLog.error('forceFullResync failed:', message);
    return { success: false, error: message };
  }
}
