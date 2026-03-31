/**
 * Auth Queries
 *
 * TanStack Query hooks for authentication.
 * Replaces manual subscription logic in AuthContext.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AuthPort,
  AuthResult,
  AuthSession,
  AuthState,
  AuthUserProfile,
  SignInCredentials,
  SignUpCredentials,
} from '@neurodual/logic';
import { queryKeys } from './keys';

// =============================================================================
// Adapter Reference (injected via Provider)
// =============================================================================

let authAdapter: AuthPort | null = null;

export function setAuthAdapter(adapter: AuthPort): void {
  authAdapter = adapter;
}

export function getAuthAdapter(): AuthPort {
  if (!authAdapter) {
    throw new Error('Auth adapter not initialized. Call setAuthAdapter first.');
  }
  return authAdapter;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Default auth state for loading/placeholder.
 */
const DEFAULT_AUTH_STATE: AuthState = { status: 'unauthenticated' };

function getImmediateAuthState(): AuthState {
  try {
    return getAuthAdapter().getState();
  } catch {
    return DEFAULT_AUTH_STATE;
  }
}

/**
 * Get current auth state.
 * This is the primary hook for auth status.
 *
 * Uses placeholderData to ensure UI renders immediately while loading.
 */
export function useAuthQuery(): UseQueryResult<AuthState> {
  return useQuery<AuthState>({
    queryKey: queryKeys.auth.session(),
    queryFn: () => Promise.resolve(getAuthAdapter().getState()),
    staleTime: Infinity, // Auth state is invalidated via listener
    // Mirror the adapter state immediately to avoid transient local-user fallbacks after login.
    placeholderData: getImmediateAuthState,
  });
}

/**
 * Convenience hook to check if user is authenticated.
 */
export function useIsAuthenticated(): boolean {
  const { data } = useAuthQuery();
  return data?.status === 'authenticated';
}

/**
 * Get current user (if authenticated).
 */
export function useCurrentUser() {
  const { data } = useAuthQuery();
  if (data?.status === 'authenticated') {
    return data.session.user;
  }
  return null;
}

/**
 * Get current user profile (if authenticated).
 */
export function useUserProfile() {
  const { data } = useAuthQuery();
  if (data?.status === 'authenticated') {
    return data.profile;
  }
  return null;
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Sign up with email/password.
 */
export function useSignUp(): UseMutationResult<AuthResult<AuthSession>, Error, SignUpCredentials> {
  const queryClient = useQueryClient();

  return useMutation<AuthResult<AuthSession>, Error, SignUpCredentials>({
    mutationFn: async (credentials: SignUpCredentials): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signUp(credentials);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      }
    },
  });
}

/**
 * Sign in with email/password.
 */
export function useSignIn(): UseMutationResult<AuthResult<AuthSession>, Error, SignInCredentials> {
  const queryClient = useQueryClient();

  return useMutation<AuthResult<AuthSession>, Error, SignInCredentials>({
    mutationFn: async (credentials: SignInCredentials): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signIn(credentials);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        // Also invalidate sync queries since user may now have cloud access
        queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
      }
    },
  });
}

/**
 * Sign in with Google OAuth.
 */
export function useSignInWithGoogle(): UseMutationResult<AuthResult<AuthSession>, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<AuthResult<AuthSession>, Error, void>({
    mutationFn: async (): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signInWithGoogle();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
      }
    },
  });
}

/**
 * Sign in with Apple OAuth.
 */
export function useSignInWithApple(): UseMutationResult<AuthResult<AuthSession>, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<AuthResult<AuthSession>, Error, void>({
    mutationFn: async (): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signInWithApple();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
      }
    },
  });
}

/**
 * Sign out.
 *
 * IMPORTANT: This clears ALL user data from the TanStack Query cache.
 * The auth adapter already clears SQLite data via resetForLogout().
 * We must also clear the in-memory cache to prevent data leakage.
 */
export function useSignOut(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      return getAuthAdapter().signOut();
    },
    onSuccess: () => {
      // REMOVE (not just invalidate) all user-related data from cache
      // This prevents data from being visible after logout
      queryClient.removeQueries({ queryKey: queryKeys.journey.all });
      queryClient.removeQueries({ queryKey: queryKeys.progression.all });
      queryClient.removeQueries({ queryKey: queryKeys.profile.all });
      queryClient.removeQueries({ queryKey: queryKeys.history.all });
      queryClient.removeQueries({ queryKey: queryKeys.sync.all });

      // Invalidate auth (will refetch as unauthenticated)
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });

      // Invalidate subscription (will refetch with new state)
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });

      if (import.meta.env.DEV) {
        console.log('[Auth] Cache cleared on logout');
      }
    },
  });
}

/**
 * Update user profile.
 */
export function useUpdateProfile(): UseMutationResult<
  AuthResult<AuthUserProfile>,
  Error,
  Partial<Pick<AuthUserProfile, 'username' | 'avatarId'>>
> {
  const queryClient = useQueryClient();

  return useMutation<
    AuthResult<AuthUserProfile>,
    Error,
    Partial<Pick<AuthUserProfile, 'username' | 'avatarId'>>
  >({
    mutationFn: async (
      updates: Partial<Pick<AuthUserProfile, 'username' | 'avatarId'>>,
    ): Promise<AuthResult<AuthUserProfile>> => {
      return getAuthAdapter().updateProfile(updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile() });
      }
    },
  });
}

/**
 * Send password reset email.
 */
export function useResetPassword(): UseMutationResult<AuthResult<void>, Error, string> {
  return useMutation<AuthResult<void>, Error, string>({
    mutationFn: async (email: string): Promise<AuthResult<void>> => {
      return getAuthAdapter().resetPassword(email);
    },
  });
}

/**
 * Update password (after reset email link).
 */
export function useUpdatePassword(): UseMutationResult<AuthResult<void>, Error, string> {
  return useMutation<AuthResult<void>, Error, string>({
    mutationFn: async (newPassword: string): Promise<AuthResult<void>> => {
      return getAuthAdapter().updatePassword(newPassword);
    },
  });
}

/**
 * Refresh auth session.
 */
export function useRefreshSession(): UseMutationResult<AuthResult<AuthSession>, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<AuthResult<AuthSession>, Error, void>({
    mutationFn: async (): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().refreshSession();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.session() });
      }
    },
  });
}

/**
 * Validate session with server.
 * Use for sensitive operations.
 */
export function useValidateSession(): UseMutationResult<boolean, Error, void> {
  return useMutation<boolean, Error, void>({
    mutationFn: async (): Promise<boolean> => {
      return getAuthAdapter().validateSession();
    },
  });
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Invalidate all auth queries.
 */
export function invalidateAuthQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
}
