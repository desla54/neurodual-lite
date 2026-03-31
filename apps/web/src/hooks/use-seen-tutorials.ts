/**
 * Hook for persisting which rule tutorials have been seen.
 * Uses localStorage keyed by userId to survive across sessions.
 */

import { useCallback, useState } from 'react';
import { useEffectiveUserId } from '@neurodual/ui';

const STORAGE_KEY_PREFIX = 'neurodual:seen-tutorials:';

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function loadSeenTutorials(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed);
    return new Set();
  } catch {
    return new Set();
  }
}

function saveSeenTutorials(userId: string, seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify([...seen]));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export interface UseSeenTutorialsReturn {
  /** Set of tutorial IDs already seen */
  seenTutorials: ReadonlySet<string>;
  /** Array form for passing to MeasureProtocolConfig.seenTutorials */
  seenTutorialsArray: readonly string[];
  /** Mark a tutorial as seen (persists immediately) */
  markSeen: (tutorialId: string) => void;
}

export function useSeenTutorials(): UseSeenTutorialsReturn {
  const userId = useEffectiveUserId();
  const [seen, setSeen] = useState<Set<string>>(() => loadSeenTutorials(userId));

  const markSeen = useCallback(
    (tutorialId: string) => {
      setSeen((prev) => {
        const next = new Set(prev);
        next.add(tutorialId);
        saveSeenTutorials(userId, next);
        return next;
      });
    },
    [userId],
  );

  return {
    seenTutorials: seen,
    seenTutorialsArray: [...seen],
    markSeen,
  };
}
