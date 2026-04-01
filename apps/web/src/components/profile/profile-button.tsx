/**
 * ProfileButton - Avatar + Username button OR Sign-in button
 * - Authenticated: Shows avatar + username, opens ProfileDialog
 * - Local profile customized: Shows local avatar + name, opens AuthDialog (to create account)
 * - Default: Shows "Se connecter" button, opens AuthDialog
 * Nordic design system
 */

import { Avatar, useAuthQuery } from '@neurodual/ui';
import { User } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { AuthDialog } from '../auth/auth-dialog';
import { ProfileDialog } from './profile-dialog';

interface ProfileButtonProps {
  readonly compact?: boolean;
  readonly chrome?: 'standalone' | 'embedded';
}

/** Check if local profile has been customized (avatar or name changed from defaults) */
function useHasCustomizedLocalProfile(): boolean {
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const playerId = useSettingsStore((s) => s.ui.playerId);

  // Default name is "Joueur XXXX" where XXXX = last 4 chars of playerId
  const defaultName = `Joueur ${playerId.slice(-4).toUpperCase()}`;
  const defaultAvatar = 'glasses';

  const hasCustomName = localDisplayName !== defaultName;
  const hasCustomAvatar = localAvatarId !== defaultAvatar;

  return hasCustomName || hasCustomAvatar;
}

export function ProfileButton({
  compact = false,
  chrome = 'standalone',
}: ProfileButtonProps): ReactNode {
  const { t } = useTranslation();
  const authState = useAuthQuery();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Local profile data
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const hasCustomizedProfile = useHasCustomizedLocalProfile();
  const isCaptureHybrid = useSettingsStore((s) => s.ui.visualThemePreset) === 'capture-hybrid';

  const isLoading = authState.status === 'loading';
  const isAuthenticated = authState.status === 'authenticated';
  const compactClassName =
    chrome === 'embedded'
      ? 'flex h-9 w-9 items-center justify-center rounded-full transition duration-200 hover:bg-foreground/6 active:scale-95 group'
      : 'flex h-11 w-11 items-center justify-center rounded-full border border-woven-border bg-woven-surface hover:bg-woven-surface active:scale-95 transition duration-200 group';

  // Loading state - show skeleton
  if (isLoading) {
    if (compact) {
      return (
        <div
          className={
            chrome === 'embedded'
              ? 'flex h-9 w-9 items-center justify-center rounded-full'
              : 'flex h-11 w-11 items-center justify-center rounded-full border border-woven-border bg-woven-surface'
          }
        >
          <div className="h-8 w-8 rounded-full bg-woven-border animate-pulse" />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 pl-1.5 pr-4 py-1.5 bg-woven-surface border border-woven-border rounded-full">
        <div className="w-8 h-8 rounded-full bg-woven-border animate-pulse" />
        <div className="w-16 h-4 rounded bg-woven-border animate-pulse hidden sm:block" />
      </div>
    );
  }

  // Not authenticated but has customized local profile - show local avatar + name
  if (!isAuthenticated && hasCustomizedProfile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          data-capture-control={compact && chrome === 'embedded' ? 'toolbar-button' : undefined}
          className={
            compact
              ? compactClassName
              : 'flex items-center gap-3 pl-1.5 pr-1.5 sm:pr-4 py-1.5 bg-woven-surface border border-woven-border rounded-full hover:bg-woven-surface active:scale-95 transition duration-200 group'
          }
          aria-label={localDisplayName}
          title={localDisplayName}
        >
          <Avatar id={localAvatarId} size={20} className="w-8 h-8 border border-woven-border" />
          {!compact ? (
            <span className="text-sm font-bold text-foreground max-w-[100px] truncate group-hover:text-primary transition-colors hidden sm:block">
              {localDisplayName}
            </span>
          ) : null}
        </button>

        <AuthDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
      </>
    );
  }

  // Not authenticated, no custom profile - show sign in button
  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          data-capture-control={compact && chrome === 'embedded' ? 'toolbar-button' : undefined}
          className={
            compact
              ? chrome === 'embedded'
                ? 'flex h-9 w-9 items-center justify-center rounded-full text-primary transition duration-200 hover:bg-primary/10 active:scale-95'
                : 'flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition duration-200'
              : 'flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold text-sm rounded-full hover:bg-primary/90 active:scale-95 transition duration-200'
          }
          aria-label={t('settings.account.signIn')}
          title={t('settings.account.signIn')}
        >
          <User
            size={compact && chrome === 'embedded' && isCaptureHybrid ? 20 : 18}
            weight={compact && chrome === 'embedded' && isCaptureHybrid ? 'bold' : 'regular'}
          />
          {!compact ? (
            <span className="hidden sm:inline">{t('settings.account.signIn')}</span>
          ) : null}
        </button>

        <AuthDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
      </>
    );
  }

  // Authenticated - show profile button
  const profile = authState.profile;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        data-capture-control={compact && chrome === 'embedded' ? 'toolbar-button' : undefined}
        className={
          compact
            ? compactClassName
            : 'flex items-center gap-3 pl-1.5 pr-1.5 sm:pr-4 py-1.5 bg-woven-surface border border-woven-border rounded-full hover:bg-woven-surface active:scale-95 transition duration-200 group'
        }
        aria-label={t('settings.profile.openProfile', { username: profile?.username ?? 'User' })}
        title={profile?.username ?? t('settings.profile.yourName')}
      >
        <Avatar
          id={profile?.avatarId ?? 1}
          size={20}
          className="w-8 h-8 border border-woven-border"
        />
        {!compact ? (
          <span className="text-sm font-bold text-primary max-w-[100px] truncate group-hover:text-visual transition-colors hidden sm:block">
            {profile?.username ?? t('settings.profile.yourName')}
          </span>
        ) : null}
      </button>

      <ProfileDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  );
}
