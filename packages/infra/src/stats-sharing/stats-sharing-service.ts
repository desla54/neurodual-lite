/**
 * Stats Sharing Service
 *
 * Submits anonymous session statistics to Supabase for leaderboards.
 * Only sends data when user has opted in (shareAnonymousStats = true).
 *
 * Architecture:
 * - Calls Edge Function `submit-session-stats` for server-side validation
 * - Graceful degradation: silently fails if network/server issues
 * - No blocking: async fire-and-forget pattern
 */

// Supabase has been removed; stub functions for compatibility.
function isSupabaseConfigured(): boolean {
  return false;
}
function getSupabase(): { functions: { invoke: <T = unknown>(...args: unknown[]) => Promise<{ data: T | null; error: { message: string } | null }> } } {
  throw new Error('Supabase is not configured');
}

// =============================================================================
// Types
// =============================================================================

export interface SessionStatsPayload {
  playerId: string;
  sessionId: string;
  gameMode: string;
  nLevel: number;
  accuracy: number;
  dPrime?: number;
  hitRate?: number;
  falseAlarmRate?: number;
  trialCount: number;
  durationMs: number;
  endReason: string;
  sessionDate: string; // ISO date string
}

export interface SubmitStatsResult {
  success: boolean;
  duplicate?: boolean;
  error?: string;
}

const VALID_GAME_MODES = new Set([
  'dual-catch',
  'dual-place',
  'dual-pick',
  'dual-memo',
  'dual-trace',
  'recall',
]);

function normalizeGameMode(value: string): string {
  return value.trim();
}

function isValidGameMode(value: string): boolean {
  return VALID_GAME_MODES.has(value);
}

// =============================================================================
// Service
// =============================================================================

/**
 * Submit session stats to the cloud for leaderboards.
 *
 * @param payload - Session statistics to submit
 * @returns Promise resolving to result (success/duplicate/error)
 *
 * This function is designed to be non-blocking and fail-safe:
 * - Returns quickly with error result on any failure
 * - Does not throw exceptions
 * - Logs errors for debugging but doesn't break app flow
 */
export async function submitSessionStats(payload: SessionStatsPayload): Promise<SubmitStatsResult> {
  // Check if Supabase is configured
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Server only accepts a strict allowlist of modes for leaderboard storage.
  // For other modes (e.g. legacy tempo/custom/sim modes), skip silently.
  const normalizedMode = normalizeGameMode(payload.gameMode);
  if (!isValidGameMode(normalizedMode)) {
    return { success: true };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke<{ duplicate?: boolean }>(
      'submit-session-stats',
      {
        body: { ...payload, gameMode: normalizedMode },
      },
    );

    if (error) {
      console.warn('[StatsSharing] Server rejected submission:', error);
      return { success: false, error: error.message || 'Server error' };
    }

    return {
      success: true,
      duplicate: data?.duplicate === true,
    };
  } catch (error) {
    // Network error or other failure - log but don't crash
    console.warn('[StatsSharing] Failed to submit stats:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Helper to build payload from session report model.
 * Use this to transform SessionEndReportModel → SessionStatsPayload.
 */
export function buildStatsPayload(
  playerId: string,
  report: {
    sessionId: string;
    gameMode: string;
    nLevel: number;
    unifiedAccuracy: number;
    totals: {
      hits: number;
      misses: number;
      falseAlarms: number | null;
      correctRejections: number | null;
    };
    durationMs: number;
    reason: string;
    createdAt: string;
  },
): SessionStatsPayload {
  // Calculate hit rate and false alarm rate if applicable
  const totalTargets = report.totals.hits + report.totals.misses;
  const totalNonTargets = (report.totals.falseAlarms ?? 0) + (report.totals.correctRejections ?? 0);

  const hitRate = totalTargets > 0 ? report.totals.hits / totalTargets : undefined;
  const falseAlarmRate =
    totalNonTargets > 0 ? (report.totals.falseAlarms ?? 0) / totalNonTargets : undefined;

  return {
    playerId,
    sessionId: report.sessionId,
    gameMode: report.gameMode,
    nLevel: report.nLevel,
    accuracy: report.unifiedAccuracy,
    hitRate,
    falseAlarmRate,
    trialCount: totalTargets + totalNonTargets,
    durationMs: report.durationMs,
    endReason: mapEndReason(report.reason),
    sessionDate: report.createdAt.split('T')[0] ?? report.createdAt.slice(0, 10), // Extract YYYY-MM-DD
  };
}

// =============================================================================
// Fetch Player Stats (for leaderboard display)
// =============================================================================

export interface PlayerStatsResult {
  percentile: number | null;
  avgAccuracy: number | null;
  playerBestAccuracy: number | null;
  totalSessions: number;
  message?: string;
}

/**
 * Fetch player stats for a given mode/level.
 */
export async function fetchPlayerStats(
  playerId: string,
  gameMode: string,
  nLevel: number,
): Promise<PlayerStatsResult> {
  const normalizedMode = normalizeGameMode(gameMode);
  if (!isValidGameMode(normalizedMode)) {
    return { percentile: null, avgAccuracy: null, playerBestAccuracy: null, totalSessions: 0 };
  }

  if (!isSupabaseConfigured()) {
    return { percentile: null, avgAccuracy: null, playerBestAccuracy: null, totalSessions: 0 };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke<PlayerStatsResult>('get-player-stats', {
      body: { playerId, gameMode: normalizedMode, nLevel },
    });

    if (error || !data) {
      console.warn('[StatsSharing] Failed to fetch player stats', error);
      return { percentile: null, avgAccuracy: null, playerBestAccuracy: null, totalSessions: 0 };
    }

    return data;
  } catch (error) {
    console.warn('[StatsSharing] Error fetching player stats:', error);
    return { percentile: null, avgAccuracy: null, playerBestAccuracy: null, totalSessions: 0 };
  }
}

/** Map session end reason to valid values for stats */
function mapEndReason(reason: string): string {
  switch (reason) {
    case 'completed':
    case 'session_complete':
      return 'completed';
    case 'abandoned':
    case 'user_stopped':
      return 'user_stopped';
    default:
      return 'completed';
  }
}
