/**
 * useEffectiveUserId — single source of truth for the current user's ID.
 *
 * Resolves the user ID through a reliable fallback chain:
 * 1. Supabase auth session (if authenticated)
 * 2. Local profile odalisqueId (persisted locally, survives auth restore delays)
 * 3. 'local' (anonymous fallback)
 *
 * This hook MUST be used everywhere a userId is needed for queries or persistence.
 * It replaces the previously scattered pattern:
 *   `currentUser?.user?.id ?? userProfile.odalisqueId ?? 'local'`
 */

import { useCurrentUser } from '../context/AuthContext';
import { useUserProfile } from './use-user-profile';

export function useEffectiveUserId(): string {
  const currentUser = useCurrentUser();
  const { profile } = useUserProfile();
  return currentUser?.user?.id ?? profile.odalisqueId ?? 'local';
}
