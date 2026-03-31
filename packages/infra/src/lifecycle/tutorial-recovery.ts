/**
 * Tutorial Recovery Service
 *
 * Provides localStorage-based tutorial recovery for page refreshes.
 * Much simpler than game session recovery - no SQLite events needed.
 *
 * Pattern:
 * 1. During tutorial: save snapshot to localStorage on each step
 * 2. On page load: check for existing snapshot
 * 3. If found & fresh: offer to resume at that step
 * 4. On resume/decline: clear the snapshot
 */

import type { TutorialRecoverySnapshot, TutorialRecoveryCheckResult } from '@neurodual/logic';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'nd_tutorial_recovery';

/** Snapshot considered stale after 30 minutes */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/** Snapshot expires completely after 2 hours */
const EXPIRY_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// =============================================================================
// Core API
// =============================================================================

/**
 * Save a tutorial recovery snapshot to localStorage.
 * Call this on each step advancement.
 */
export function saveTutorialRecoverySnapshot(snapshot: TutorialRecoverySnapshot): void {
  try {
    const data = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    // localStorage might be full or disabled - fail silently
    console.warn('[Tutorial Recovery] Failed to save snapshot:', error);
  }
}

/**
 * Load a tutorial recovery snapshot from localStorage.
 * Returns null if no snapshot exists or it's invalid.
 */
export function loadTutorialRecoverySnapshot(): TutorialRecoverySnapshot | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const snapshot = JSON.parse(data) as TutorialRecoverySnapshot;

    // Basic validation
    if (!snapshot.tutorialId || typeof snapshot.stepIndex !== 'number') {
      console.warn('[Tutorial Recovery] Invalid snapshot structure');
      clearTutorialRecoverySnapshot();
      return null;
    }

    return snapshot;
  } catch (error) {
    console.warn('[Tutorial Recovery] Failed to load snapshot:', error);
    clearTutorialRecoverySnapshot();
    return null;
  }
}

/**
 * Clear the tutorial recovery snapshot.
 * Call this when:
 * - Tutorial completes normally
 * - User declines to resume
 * - User explicitly starts a new tutorial
 */
export function clearTutorialRecoverySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Check if there's a recoverable tutorial session.
 * This is the main entry point for recovery logic.
 */
export function checkForRecoverableTutorial(): TutorialRecoveryCheckResult {
  const snapshot = loadTutorialRecoverySnapshot();

  if (!snapshot) {
    return { hasSession: false, snapshot: null, isStale: false };
  }

  const age = Date.now() - snapshot.timestamp;

  // Expired completely - auto-clear
  if (age > EXPIRY_THRESHOLD_MS) {
    clearTutorialRecoverySnapshot();
    return { hasSession: false, snapshot: null, isStale: false };
  }

  const isStale = age > STALE_THRESHOLD_MS;

  return {
    hasSession: true,
    snapshot,
    isStale,
  };
}

/**
 * Create a tutorial recovery snapshot.
 * Helper for building the snapshot object.
 */
export function createTutorialRecoverySnapshot(
  tutorialId: string,
  stepIndex: number,
): TutorialRecoverySnapshot {
  return {
    tutorialId,
    stepIndex,
    timestamp: Date.now(),
  };
}
