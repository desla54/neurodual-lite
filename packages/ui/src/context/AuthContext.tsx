'use client';

/**
 * Auth Context (Lite - Local Only)
 *
 * Simplified auth context. Always returns unauthenticated state.
 */

import type { AuthPort, AuthState, AuthUser, AuthUserProfile } from '@neurodual/logic';
import { useMemo } from 'react';
import { getAuthAdapter, useAuthQuery as useAuthQueryQuery } from '../queries';

type CurrentUser = AuthUser & {
  readonly user: AuthUser;
  readonly profile: AuthUserProfile;
};

/**
 * Hook to get the auth adapter.
 */
export function useAuthAdapter(): AuthPort {
  return getAuthAdapter();
}

/**
 * Hook to get current auth state.
 * Always returns unauthenticated in Lite mode.
 */
export function useAuthQuery(): AuthState {
  const { data } = useAuthQueryQuery();
  return data ?? { status: 'unauthenticated' };
}

/**
 * Hook to check if user is authenticated.
 * Always false in Lite mode.
 */
export function useIsAuthenticated(): boolean {
  return useAuthQuery().status === 'authenticated';
}

/**
 * Hook to get current user (null if not authenticated).
 * Always null in Lite mode.
 */
export function useCurrentUser(): CurrentUser | null {
  const state = useAuthQuery();
  return useMemo(() => {
    if (state.status !== 'authenticated') return null;
    return {
      ...state.session.user,
      user: state.session.user,
      profile: state.profile,
    };
  }, [state]);
}
