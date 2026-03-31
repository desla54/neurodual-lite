/**
 * useAuthForm Hook
 *
 * Logic for auth form (login/signup).
 */

import { toast, useAuthAdapter } from '@neurodual/ui';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

export type AuthMode = 'login' | 'signup' | 'forgot';

interface AuthFormState {
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
  mode: AuthMode;
  isLoading: boolean;
  error: string | null;
  success: string | null;
  captchaToken: string | null;
}

export function useAuthForm(onSuccess?: () => void, initialMode: AuthMode = 'login') {
  const authAdapter = useAuthAdapter();
  const { t } = useTranslation();

  const [state, setState] = useState<AuthFormState>({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    mode: initialMode,
    isLoading: false,
    error: null,
    success: null,
    captchaToken: null,
  });

  const setEmail = useCallback((email: string) => {
    setState((s) => ({ ...s, email, error: null }));
  }, []);

  const setPassword = useCallback((password: string) => {
    setState((s) => ({ ...s, password, error: null }));
  }, []);

  const setConfirmPassword = useCallback((confirmPassword: string) => {
    setState((s) => ({ ...s, confirmPassword, error: null }));
  }, []);

  const setUsername = useCallback((username: string) => {
    setState((s) => ({ ...s, username, error: null }));
  }, []);

  const setCaptchaToken = useCallback((captchaToken: string | null) => {
    setState((s) => ({ ...s, captchaToken }));
  }, []);

  const resetCaptcha = useCallback(() => {
    setState((s) => ({ ...s, captchaToken: null }));
  }, []);

  const toggleMode = useCallback(() => {
    setState((s) => ({
      ...s,
      mode: s.mode === 'login' ? 'signup' : 'login',
      error: null,
      success: null,
      confirmPassword: '',
      username: '',
    }));
  }, []);

  const enterForgotMode = useCallback(() => {
    setState((s) => ({
      ...s,
      mode: 'forgot',
      error: null,
      success: null,
      password: '',
      confirmPassword: '',
    }));
  }, []);

  const backToLogin = useCallback(() => {
    setState((s) => ({
      ...s,
      mode: 'login',
      error: null,
      success: null,
    }));
  }, []);

  const validate = useCallback((): string | null => {
    // Forgot mode only needs email
    if (state.mode === 'forgot') {
      if (!state.email.trim()) {
        return t('auth.validation.emailRequired');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
        return t('auth.validation.emailInvalid');
      }
      return null;
    }

    if (state.mode === 'signup' && !state.username.trim()) {
      return t('auth.validation.usernameRequired');
    }
    if (state.mode === 'signup' && state.username.trim().length < 2) {
      return t('auth.validation.usernameMinLength');
    }
    if (!state.email.trim()) {
      return t('auth.validation.emailRequired');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
      return t('auth.validation.emailInvalid');
    }
    if (!state.password) {
      return t('auth.validation.passwordRequired');
    }
    if (state.password.length < 8) {
      return t('auth.validation.passwordMinLength');
    }
    if (state.mode === 'signup' && state.password !== state.confirmPassword) {
      return t('auth.validation.passwordsMismatch');
    }
    return null;
  }, [state.email, state.password, state.confirmPassword, state.username, state.mode, t]);

  const submit = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setState((s) => ({ ...s, error: validationError }));
      toast.error(validationError);
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Handle forgot password mode
      if (state.mode === 'forgot') {
        const result = await authAdapter.resetPassword(
          state.email,
          state.captchaToken ?? undefined,
        );
        // Reset captcha after attempt
        resetCaptcha();
        if (result.success) {
          setState((s) => ({
            ...s,
            isLoading: false,
            success: t('auth.toast.resetEmailSent'),
          }));
          toast.success(t('auth.toast.emailSent'), {
            description: t('auth.toast.emailSentDesc'),
            duration: 6000,
          });
        } else {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: result.error.message,
          }));
          toast.error(result.error.message);
        }
        return;
      }

      if (state.mode === 'signup') {
        const result = await authAdapter.signUp({
          email: state.email,
          password: state.password,
          username: state.username.trim(),
          captchaToken: state.captchaToken ?? undefined,
          locale: i18n.language,
        });
        // Reset captcha after attempt
        resetCaptcha();

        if (result.success) {
          setState((s) => ({
            ...s,
            isLoading: false,
            success: t('auth.toast.accountCreated'),
          }));
          toast.success(t('auth.toast.accountCreated'), {
            description: t('auth.toast.accountCreatedDesc'),
            duration: 6000,
          });
          onSuccess?.();
        } else {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: t(result.error.message, { defaultValue: result.error.message }),
          }));
          toast.error(t(result.error.message, { defaultValue: result.error.message }));
        }
      } else {
        const result = await authAdapter.signIn({
          email: state.email,
          password: state.password,
          captchaToken: state.captchaToken ?? undefined,
        });
        // Reset captcha after attempt
        resetCaptcha();

        if (result.success) {
          setState((s) => ({ ...s, isLoading: false }));
          toast.success(t('auth.toast.loginSuccess'), {
            description: t('auth.toast.loginSuccessDesc'),
          });
          onSuccess?.();
        } else {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: t(result.error.message, { defaultValue: result.error.message }),
          }));
          toast.error(t(result.error.message, { defaultValue: result.error.message }));
        }
      }
    } catch {
      const errorMsg = t('auth.toast.genericError');
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  }, [
    state.mode,
    state.email,
    state.password,
    state.captchaToken,
    authAdapter,
    validate,
    onSuccess,
    resetCaptcha,
    t,
  ]);

  const signInWithGoogle = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    toast.info(t('auth.toast.redirectGoogle'));
    try {
      // Initialize Sentry before leaving the page (OAuth redirects can otherwise drop early errors).
      if (import.meta.env.PROD && import.meta.env['VITE_SENTRY_DSN']) {
        void import('../../services/sentry').then((m) => m.initSentry()).catch(() => {});
      }

      const result = await authAdapter.signInWithGoogle();
      if (result.success) {
        setState((s) => ({ ...s, isLoading: false }));
        onSuccess?.();
        return;
      }

      if (result.error.code === 'oauth_redirect') {
        // OAuth redirect will take over navigation immediately.
        // In PWA contexts, the provider login may happen in a separate window.
        // Avoid leaving the form in a stuck loading state.
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      if (result.error.code === 'cancelled') {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      const errorMsg = t(result.error.message, { defaultValue: result.error.message });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    } catch {
      const errorMsg = t('auth.toast.googleError');
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  }, [authAdapter, onSuccess, t]);

  const signInWithApple = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    toast.info(t('auth.toast.redirectApple'));
    try {
      const result = await authAdapter.signInWithApple();
      if (result.success) {
        setState((s) => ({ ...s, isLoading: false }));
        onSuccess?.();
        return;
      }

      if (result.error.code === 'oauth_redirect') {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      if (result.error.code === 'cancelled') {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      const errorMsg = t(result.error.message, { defaultValue: result.error.message });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    } catch {
      const errorMsg = t('auth.toast.appleError');
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  }, [authAdapter, onSuccess, t]);

  const resetPassword = useCallback(async () => {
    if (!state.email.trim()) {
      const errorMsg = t('auth.validation.emailRequired');
      setState((s) => ({ ...s, error: errorMsg }));
      toast.error(errorMsg);
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const result = await authAdapter.resetPassword(state.email);
      if (result.success) {
        setState((s) => ({
          ...s,
          isLoading: false,
          success: t('auth.toast.resetEmailSent'),
        }));
        toast.success(t('auth.toast.emailSent'), {
          description: t('auth.toast.emailSentDesc'),
          duration: 6000,
        });
      } else {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: t(result.error.message, { defaultValue: result.error.message }),
        }));
        toast.error(t(result.error.message, { defaultValue: result.error.message }));
      }
    } catch {
      const errorMsg = t('auth.toast.genericError');
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  }, [state.email, authAdapter, t]);

  // Validation states for UI feedback
  const usernameValid = state.mode !== 'signup' || state.username.trim().length >= 2;
  const emailValid = state.email.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);
  const passwordValid = state.mode === 'forgot' || state.password.length >= 8;
  const confirmValid = state.mode !== 'signup' || state.password === state.confirmPassword;

  // In forgot mode, only email is needed
  const canSubmit =
    state.mode === 'forgot'
      ? emailValid && !state.isLoading
      : usernameValid && emailValid && passwordValid && confirmValid && !state.isLoading;

  return {
    ...state,
    setEmail,
    setPassword,
    setConfirmPassword,
    setUsername,
    setCaptchaToken,
    resetCaptcha,
    toggleMode,
    enterForgotMode,
    backToLogin,
    submit,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    usernameValid,
    emailValid,
    passwordValid,
    confirmValid,
    canSubmit,
  };
}
