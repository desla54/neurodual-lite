/**
 * Auth Queries (Lite - Local Only)
 *
 * Simplified auth queries for local-only mode.
 * Always returns unauthenticated state - no cloud auth.
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
// Adapter Reference (noop - no cloud auth in Lite)
// =============================================================================

const NOOP_AUTH_STATE: AuthState = { status: 'unauthenticated' };

const noopAuthAdapter: AuthPort = {
  getState: () => NOOP_AUTH_STATE,
  subscribe: () => () => {},
  signUp: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  signIn: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  signInWithGoogle: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  signInWithApple: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  signOut: async () => {},
  refreshSession: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  validateSession: async () => false,
  resetPassword: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  updatePassword: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  updateProfile: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
  getAccessToken: async () => null,
  deleteAccount: async () => ({
    success: false,
    error: { code: 'unknown' as const, message: 'Auth not available in Lite' },
  }),
} as unknown as AuthPort;

let authAdapter: AuthPort = noopAuthAdapter;

export function setAuthAdapter(adapter: AuthPort): void {
  authAdapter = adapter;
}

export function getAuthAdapter(): AuthPort {
  return authAdapter;
}

// =============================================================================
// Queries
// =============================================================================

function getImmediateAuthState(): AuthState {
  try {
    return getAuthAdapter().getState();
  } catch {
    return NOOP_AUTH_STATE;
  }
}

/**
 * Get current auth state.
 * In Lite mode, always returns unauthenticated.
 */
export function useAuthQuery(): UseQueryResult<AuthState> {
  return useQuery<AuthState>({
    queryKey: queryKeys.auth.session(),
    queryFn: () => Promise.resolve(getAuthAdapter().getState()),
    staleTime: Infinity,
    placeholderData: getImmediateAuthState,
  });
}

/**
 * Convenience hook to check if user is authenticated.
 * Always false in Lite mode.
 */
export function useIsAuthenticated(): boolean {
  const { data } = useAuthQuery();
  return data?.status === 'authenticated';
}

/**
 * Get current user (if authenticated).
 * Always null in Lite mode.
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
 * Always null in Lite mode.
 */
export function useUserProfile() {
  const { data } = useAuthQuery();
  if (data?.status === 'authenticated') {
    return data.profile;
  }
  return null;
}

// =============================================================================
// Mutations (all noop in Lite)
// =============================================================================

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

export function useSignIn(): UseMutationResult<AuthResult<AuthSession>, Error, SignInCredentials> {
  const queryClient = useQueryClient();
  return useMutation<AuthResult<AuthSession>, Error, SignInCredentials>({
    mutationFn: async (credentials: SignInCredentials): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signIn(credentials);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      }
    },
  });
}

export function useSignInWithGoogle(): UseMutationResult<AuthResult<AuthSession>, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<AuthResult<AuthSession>, Error, void>({
    mutationFn: async (): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signInWithGoogle();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      }
    },
  });
}

export function useSignInWithApple(): UseMutationResult<AuthResult<AuthSession>, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<AuthResult<AuthSession>, Error, void>({
    mutationFn: async (): Promise<AuthResult<AuthSession>> => {
      return getAuthAdapter().signInWithApple();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      }
    },
  });
}

export function useSignOut(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      return getAuthAdapter().signOut();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });
}

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

export function useResetPassword(): UseMutationResult<AuthResult<void>, Error, string> {
  return useMutation<AuthResult<void>, Error, string>({
    mutationFn: async (email: string): Promise<AuthResult<void>> => {
      return getAuthAdapter().resetPassword(email);
    },
  });
}

export function useUpdatePassword(): UseMutationResult<AuthResult<void>, Error, string> {
  return useMutation<AuthResult<void>, Error, string>({
    mutationFn: async (newPassword: string): Promise<AuthResult<void>> => {
      return getAuthAdapter().updatePassword(newPassword);
    },
  });
}

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

export function invalidateAuthQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
}
