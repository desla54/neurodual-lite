/**
 * Profile Queries
 *
 * Reactive read-model:
 * - ProfileReadModel combines 6 watched queries + row→domain transformation
 * - This hook is a thin wrapper around useSubscribable
 */

import type { ProfilePort, PlayerProfile } from '@neurodual/logic';
import { useCurrentUser } from './auth';
import { useSubscribable } from '../reactive/use-subscribable';
import { getProfileReadModel } from './read-models';

// =============================================================================
// Adapter Reference (injected via Provider) - for mutations
// =============================================================================

let profileAdapter: ProfilePort | null = null;

export function setProfileAdapter(adapter: ProfilePort): void {
  profileAdapter = adapter;
}

export function getProfileAdapter(): ProfilePort {
  if (!profileAdapter) {
    throw new Error('Profile adapter not initialized. Call setProfileAdapter first.');
  }
  return profileAdapter;
}

// =============================================================================
// Query Hook (ProfileReadModel reactive)
// =============================================================================

/**
 * Hook to fetch user profile data.
 *
 * Uses ProfileReadModel which internally combines 6 PowerSync watched queries
 * and projects rows into a typed PlayerProfile. No useMemo transformation needed.
 */
export function useProfileQuery(): {
  data: PlayerProfile;
  isPending: boolean;
  error: Error | null;
} {
  const user = useCurrentUser();
  const profileReadModel = getProfileReadModel();
  const snap = useSubscribable(profileReadModel.getProfile(user?.id ?? null));

  return {
    data: snap.data,
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}
