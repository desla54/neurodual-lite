/**
 * AuthDialog Component
 *
 * Modal dialog for authentication.
 * - If not authenticated: shows login/signup form
 * - If authenticated: shows profile editor
 */

import { Spinner, useAuthQuery } from '@neurodual/ui';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ProfileContent } from '../profile/profile-content';
import { AuthForm } from './auth-form';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export function AuthDialog({ isOpen, onClose, initialMode = 'login' }: AuthDialogProps): ReactNode {
  const { t } = useTranslation();
  const authState = useAuthQuery();

  if (!isOpen) {
    return null;
  }

  // Loading state
  if (authState.status === 'loading') {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
        <div className="relative z-10">
          <Spinner size={40} className="text-primary" />
        </div>
      </div>,
      document.body,
    );
  }

  const isAuthenticated = authState.status === 'authenticated';
  const externalAuthError = authState.status === 'error' ? authState.error : null;
  const externalAuthErrorText = externalAuthError
    ? t(externalAuthError, { defaultValue: externalAuthError })
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center safe-overlay-padding sm:py-6 animate-in fade-in duration-300">
      {/* Backdrop Blur */}
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-md cursor-default w-full h-full border-none p-0 m-0"
        onClick={onClose}
        aria-label={t('common.close')}
      />

      {/* Dialog Card - Keyboard Aware */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-surface rounded-[2rem] border border-border shadow-soft flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
        {/* Header (Fixed) */}
        <div className="flex justify-between items-center p-6 pb-2 shrink-0">
          <h2 className="text-2xl font-bold text-primary tracking-tight">
            {isAuthenticated
              ? t('settings.profile.title')
              : initialMode === 'signup'
                ? t('auth.createAccount', 'Create account')
                : t('auth.welcome', 'Bienvenue')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-background rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-all"
            aria-label={t('common.close')}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-2 scrollbar-hide">
          {externalAuthErrorText ? (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm">
              {externalAuthErrorText}
            </div>
          ) : null}
          {isAuthenticated ? (
            <ProfileContent profile={authState.profile} onClose={onClose} />
          ) : (
            <AuthForm onSuccess={onClose} initialMode={initialMode} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
