/**
 * Profile/Account settings section
 */

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, SignOut, UserPlus } from '@phosphor-icons/react';
import { Avatar, Card, Section, useAuthAdapter, useAuthQuery } from '@neurodual/ui';
import { AuthDialog } from '../../../../components/auth';
import { AvatarPicker, UsernameInput } from '../../../../components/profile';
import { useSettingsStore } from '../../../../stores/settings-store';
import { SyncStatusBadge } from './sync-status-badge';

/**
 * Authenticated profile editor — extracted so `key` on the component instance
 * resets form state when the profile changes externally (after save or sync).
 */
function AuthProfileEditor({
  authProfile,
  userEmail,
}: {
  authProfile: { username: string; avatarId: string };
  userEmail: string | null | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const authAdapter = useAuthAdapter();

  // Form state initialised from props — reset by parent via key
  const [authDisplayName, setAuthDisplayName] = useState(authProfile.username);
  const [authAvatarId, setAuthAvatarId] = useState(authProfile.avatarId);
  const [isSaving, setIsSaving] = useState(false);

  const authHasChanges =
    authDisplayName.trim() !== authProfile.username || authAvatarId !== authProfile.avatarId;

  const handleSaveAuthProfile = useCallback(async () => {
    if (!authHasChanges || isSaving) return;
    setIsSaving(true);
    await authAdapter.updateProfile({
      username:
        authDisplayName.trim() !== authProfile.username ? authDisplayName.trim() : undefined,
      avatarId: authAvatarId !== authProfile.avatarId ? authAvatarId : undefined,
    });
    setIsSaving(false);
  }, [authHasChanges, isSaving, authProfile, authAdapter, authDisplayName, authAvatarId]);

  const handleSignOut = async () => {
    await authAdapter.signOut();
  };

  return (
    <div className="space-y-6">
      <Section title={t('settings.profile.title')}>
        <Card className="space-y-5">
          {/* Header with avatar preview */}
          <div className="flex items-center gap-4">
            <Avatar id={authAvatarId} size={32} className="md:scale-125" />
            <div className="flex-1">
              <div className="font-bold text-foreground">
                {authDisplayName || authProfile.username}
              </div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">
                {t('settings.account.cloudActive')}
              </div>
            </div>
          </div>

          {/* Username input */}
          <UsernameInput
            value={authDisplayName}
            onChange={setAuthDisplayName}
            label={t('settings.profile.displayName')}
            placeholder={t('settings.profile.yourName')}
          />

          {/* Avatar picker */}
          <AvatarPicker
            selectedId={authAvatarId}
            onSelect={setAuthAvatarId}
            label={t('settings.profile.avatar')}
            size="sm"
          />

          {/* Save button (only visible when there are changes) */}
          {authHasChanges && (
            <button
              type="button"
              onClick={handleSaveAuthProfile}
              disabled={!authDisplayName.trim() || isSaving}
              className="w-full h-11 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm shadow-lg shadow-primary/10 hover:translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          )}
        </Card>
      </Section>

      <Section title={t('settings.account.title')}>
        <div className="space-y-3">
          {/* Cloud Account Card */}
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-3 rounded-2xl bg-audio/10 text-audio">
                <Cloud size={24} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-foreground">{t('settings.account.cloudActive')}</div>
                <div className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                  {userEmail}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold transition-all bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
            >
              <SignOut size={18} weight="regular" />
            </button>
          </Card>

          {/* Sync status badge */}
          <SyncStatusBadge />
        </div>
      </Section>
    </div>
  );
}

export function ProfileSection(): ReactNode {
  const { t } = useTranslation();
  const authState = useAuthQuery();
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<'login' | 'signup'>('login');

  const openSignup = () => {
    setAuthDialogMode('signup');
    setIsAuthDialogOpen(true);
  };

  const openLogin = () => {
    setAuthDialogMode('login');
    setIsAuthDialogOpen(true);
  };

  // Local profile from settings store
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const setLocalDisplayName = useSettingsStore((s) => s.setLocalDisplayName);
  const setLocalAvatarId = useSettingsStore((s) => s.setLocalAvatarId);

  const isAuthenticated = authState.status === 'authenticated';
  const userEmail = authState.status === 'authenticated' ? authState.session.user.email : null;
  const authProfile = authState.status === 'authenticated' ? authState.profile : null;

  // Authenticated user view — key resets form state when profile changes externally
  if (isAuthenticated && authProfile) {
    return (
      <AuthProfileEditor
        key={`${authProfile.username}:${authProfile.avatarId}`}
        authProfile={authProfile}
        userEmail={userEmail}
      />
    );
  }

  // Local user view - profile editor
  return (
    <div className="space-y-6">
      <Section title={t('settings.profile.title')}>
        {/* Local Profile Card */}
        <Card className="space-y-5">
          {/* Header with avatar preview */}
          <div className="flex items-center gap-4">
            <Avatar id={localAvatarId} size={32} className="md:scale-125" />
            <div className="flex-1">
              <div className="font-bold text-foreground">
                {localDisplayName || t('settings.profile.anonymous')}
              </div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">
                {t('settings.account.localMode')}
              </div>
            </div>
          </div>

          {/* Username input */}
          <UsernameInput
            value={localDisplayName}
            onChange={setLocalDisplayName}
            label={t('settings.profile.displayName')}
            placeholder={t('settings.profile.yourName')}
          />

          {/* Avatar picker */}
          <AvatarPicker
            selectedId={localAvatarId}
            onSelect={setLocalAvatarId}
            label={t('settings.profile.avatar')}
            size="sm"
          />
        </Card>
      </Section>

      <Section title={t('settings.account.title')}>
        <div className="space-y-3">
          {/* Create account CTA */}
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                <UserPlus size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground text-sm">
                  {t('settings.account.createAccountTitle')}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.account.createAccountPrompt')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={openSignup}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-secondary text-foreground hover:bg-secondary/80 transition-all"
            >
              {t('auth.createAccount')}
            </button>
          </Card>

          {/* Cloud sync login */}
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2.5 rounded-2xl bg-audio/10 text-audio">
                <Cloud size={20} weight="regular" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground text-sm">
                  {t('settings.account.alreadyAccount')}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.account.signInPrompt')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={openLogin}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold bg-secondary text-foreground hover:bg-secondary/80 transition-all"
            >
              {t('settings.account.signIn')}
            </button>
          </Card>
        </div>
      </Section>

      <AuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        initialMode={authDialogMode}
      />
    </div>
  );
}
