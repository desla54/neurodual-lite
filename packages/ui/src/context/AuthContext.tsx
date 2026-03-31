'use client';

/**
 * Auth Context
 *
 * Provides auth adapter access via module-level injection.
 * Uses TanStack Query for state caching.
 */

import type { AuthPort, AuthState, AuthUser, AuthUserProfile } from '@neurodual/logic';
import { useEffect, useMemo, useState } from 'react';
import { getAuthAdapter, useAuthQuery as useAuthQueryQuery } from '../queries';

type CurrentUser = AuthUser & {
  readonly user: AuthUser;
  readonly profile: AuthUserProfile;
};

/**
 * Hook to get the auth adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useAuthAdapter(): AuthPort {
  return getAuthAdapter();
}

/**
 * Hook to get current auth state with automatic updates.
 * Uses TanStack Query + adapter subscription for immediate updates.
 */
export function useAuthQuery(): AuthState {
  const adapter = useAuthAdapter();
  // Query hook ensures TanStack Query is initialized for this data
  useAuthQueryQuery();
  const [state, setState] = useState<AuthState>(adapter.getState());

  // Subscribe to adapter for immediate auth state changes
  useEffect(() => {
    return adapter.subscribe(setState);
  }, [adapter]);

  // Return the most recent state (prefer local state for immediate updates)
  return state;
}

/**
 * Hook to check if user is authenticated.
 */
export function useIsAuthenticated(): boolean {
  return useAuthQuery().status === 'authenticated';
}

/**
 * Hook to get current user (null if not authenticated).
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
