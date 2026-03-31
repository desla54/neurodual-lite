/**
 * AuthForm Component
 *
 * Login/Signup form with email/password and OAuth.
 * Includes Cloudflare Turnstile CAPTCHA protection.
 */

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Eye, EyeSlash, Envelope, User } from '@phosphor-icons/react';
import { Spinner } from '@neurodual/ui';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthForm } from './use-auth-form';

// Cloudflare Turnstile Site Key
const TURNSTILE_SITE_KEY = '0x4AAAAAACHJZv4YITsd767e';

// Enable CAPTCHA in all environments (Supabase requires it when enabled)
const CAPTCHA_ENABLED = true;

// Simple Google icon
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Google"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// Simple Apple icon
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Apple"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

interface AuthFormProps {
  onSuccess?: () => void;
  initialMode?: 'login' | 'signup';
}

export function AuthForm({ onSuccess, initialMode = 'login' }: AuthFormProps): ReactNode {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const isDarkMode = useSettingsStore((s) => s.ui.darkMode);

  const form = useAuthForm(onSuccess, initialMode);

  // Reset Turnstile when captchaToken is cleared (after submit)
  const handleTurnstileSuccess = (token: string) => {
    form.setCaptchaToken(token);
  };

  // Reset the widget when form is submitted
  const handleSubmit = () => {
    form.submit();
    // Reset Turnstile widget after submission attempt
    turnstileRef.current?.reset();
  };

  const isSignup = form.mode === 'signup';
  const isForgot = form.mode === 'forgot';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary tracking-tight">
          {isForgot
            ? t('auth.forgotPasswordTitle', 'Forgot password')
            : isSignup
              ? t('auth.createAccount', 'Create account')
              : t('auth.signIn', 'Sign in')}
        </h2>
        <p className="text-muted-foreground mt-1">
          {isForgot
            ? t('auth.forgotPasswordSubtitle', 'Enter your email to receive a link')
            : isSignup
              ? t('auth.createAccountSubtitle', 'Sync your progress')
              : t('auth.signInSubtitle', 'Pick up where you left off')}
        </p>
      </div>

      {/* Error/Success messages */}
      {form.error && (
        <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-sm text-center">
          {form.error}
        </div>
      )}
      {form.success && (
        <div className="p-3 rounded-xl bg-green-500/10 text-green-500 text-sm text-center">
          {form.success}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-4"
      >
        {/* Username (signup only) */}
        {isSignup && (
          <div className="space-y-2">
            <label
              htmlFor="auth-username"
              className="text-sm font-medium text-muted-foreground flex items-center gap-2"
            >
              <User size={16} />
              {t('auth.username', 'Username')}
            </label>
            <input
              id="auth-username"
              type="text"
              value={form.username}
              onChange={(e) => form.setUsername(e.target.value)}
              placeholder={t('auth.usernamePlaceholder', 'Your username')}
              className={`w-full px-4 py-3 rounded-xl bg-background border transition-all outline-none ${
                form.username && !form.usernameValid
                  ? 'border-red-300 focus:border-red-400'
                  : 'border-border focus:border-primary'
              }`}
              autoComplete="username"
              maxLength={30}
            />
            {form.username && !form.usernameValid && (
              <p className="text-xs text-red-500">
                {t('auth.usernameTooShort', 'Minimum 2 characters')}
              </p>
            )}
          </div>
        )}

        {/* Email */}
        <div className="space-y-2">
          <label
            htmlFor="auth-email"
            className="text-sm font-medium text-muted-foreground flex items-center gap-2"
          >
            <Envelope size={16} />
            {t('auth.email', 'Email')}
          </label>
          <input
            id="auth-email"
            type="email"
            value={form.email}
            onChange={(e) => form.setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder', 'ton@email.com')}
            className={`w-full px-4 py-3 rounded-xl bg-background border transition-all outline-none ${
              form.email && !form.emailValid
                ? 'border-red-300 focus:border-red-400'
                : 'border-border focus:border-primary'
            }`}
            autoComplete="email"
          />
        </div>

        {/* Password (hidden in forgot mode) */}
        {!isForgot && (
          <div className="space-y-2">
            <label
              htmlFor="auth-password"
              className="text-sm font-medium text-muted-foreground flex items-center gap-2"
            >
              {t('auth.password', 'Password')}
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-4 py-3 pr-12 rounded-xl bg-background border transition-all outline-none ${
                  form.password && !form.passwordValid
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-border focus:border-primary'
                }`}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.password && !form.passwordValid && (
              <p className="text-xs text-red-500">
                {t('auth.passwordTooShort', 'Minimum 8 characters')}
              </p>
            )}
          </div>
        )}

        {/* Confirm Password (signup only) */}
        {isSignup && (
          <div className="space-y-2">
            <label
              htmlFor="auth-confirm-password"
              className="text-sm font-medium text-muted-foreground"
            >
              {t('auth.confirmPassword', 'Confirm password')}
            </label>
            <div className="relative">
              <input
                id="auth-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => form.setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-4 py-3 pr-12 rounded-xl bg-background border transition-all outline-none ${
                  form.confirmPassword && !form.confirmValid
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-border focus:border-primary'
                }`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.confirmPassword && !form.confirmValid && (
              <p className="text-xs text-red-500">
                {t('auth.passwordsDontMatch', "Passwords don't match")}
              </p>
            )}
          </div>
        )}

        {/* Forgot Password link (login only) */}
        {!isSignup && !isForgot && (
          <button
            type="button"
            onClick={form.enterForgotMode}
            className="text-sm text-primary hover:underline"
          >
            {t('auth.forgotPassword', 'Forgot password?')}
          </button>
        )}

        {/* Back to login link (forgot mode only) */}
        {isForgot && (
          <button
            type="button"
            onClick={form.backToLogin}
            className="text-sm text-primary hover:underline"
          >
            {t('auth.backToLogin', 'Back to sign in')}
          </button>
        )}

        {/* Turnstile CAPTCHA */}
        {CAPTCHA_ENABLED && (
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={handleTurnstileSuccess}
              onError={() => form.setCaptchaToken(null)}
              onExpire={() => form.setCaptchaToken(null)}
              options={{
                theme: isDarkMode ? 'dark' : 'light',
                size: 'normal',
              }}
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!form.canSubmit}
          className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-xl shadow-primary/10 hover:translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {form.isLoading ? (
            <Spinner size={20} className="text-primary-foreground" />
          ) : isForgot ? (
            t('auth.sendResetLink', 'Send link')
          ) : isSignup ? (
            t('auth.createAccountButton', 'Create account')
          ) : (
            t('auth.signInButton', 'Sign in')
          )}
        </button>
      </form>

      {/* OAuth section (hidden in forgot mode) */}
      {!isForgot && (
        <>
          {/* OAuth Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-3 text-muted-foreground">
                {t('auth.orContinueWith', 'or continue with')}
              </span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={form.signInWithGoogle}
              disabled={form.isLoading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <GoogleIcon className="w-5 h-5" />
              <span className="font-medium">Google</span>
            </button>
            <button
              type="button"
              onClick={form.signInWithApple}
              disabled={form.isLoading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <AppleIcon className="w-5 h-5" />
              <span className="font-medium">Apple</span>
            </button>
          </div>

          {/* Toggle Mode */}
          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
                <button
                  type="button"
                  onClick={form.toggleMode}
                  className="text-primary font-medium hover:underline"
                >
                  {t('auth.signIn', 'Sign in')}
                </button>
              </>
            ) : (
              <>
                {t('auth.noAccount', "Don't have an account yet?")}{' '}
                <button
                  type="button"
                  onClick={form.toggleMode}
                  className="text-primary font-medium hover:underline"
                >
                  {t('auth.createAccount', 'Create account')}
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
