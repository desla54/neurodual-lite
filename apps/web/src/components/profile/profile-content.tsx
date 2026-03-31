/**
 * ProfileContent Component
 *
 * Profile editor content (username, avatar).
 * Used inside AuthDialog when user is authenticated.
 */

import type { AuthUserProfile } from '@neurodual/logic';
import { Avatar, useAuthAdapter, useSubscriptionQuery } from '@neurodual/ui';
import { Crown, GearSix, SignOut } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AvatarSelectionModal } from './avatar-selection-modal';
import { nonAuthInputProps } from '../../utils/non-auth-input-props';

interface ProfileContentProps {
  profile: AuthUserProfile;
  onClose: () => void;
}

export function ProfileContent({ profile, onClose }: ProfileContentProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authAdapter = useAuthAdapter();
  const subscriptionState = useSubscriptionQuery();

  const [username, setUsername] = useState(profile.username);
  const [avatarId, setAvatarId] = useState(profile.avatarId);
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = username.trim() !== profile.username || avatarId !== profile.avatarId;

  const handleSave = useCallback(async () => {
    if (!hasChanges || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await authAdapter.updateProfile({
      username: username.trim() !== profile.username ? username.trim() : undefined,
      avatarId: avatarId !== profile.avatarId ? avatarId : undefined,
    });

    setIsLoading(false);

    if (result.success) {
      onClose();
    } else {
      setError(result.error.message);
    }
  }, [username, avatarId, profile, hasChanges, authAdapter, onClose, isLoading]);

  const handleSignOut = useCallback(async () => {
    await authAdapter.signOut();
    onClose();
  }, [authAdapter, onClose]);

  const handleOpenProfileSettings = useCallback(() => {
    onClose();
    navigate('/settings/profile');
  }, [navigate, onClose]);

  const getPlanBadge = () => {
    if (subscriptionState.isTrialing) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
          <Crown size={12} />
          {t('subscription.trial')} ({subscriptionState.daysRemaining}d)
        </span>
      );
    }
    if (subscriptionState.hasPremiumAccess) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Crown size={12} />
          Pro
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
        {t('subscription.free')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center">{getPlanBadge()}</div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">{error}</div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="profile-content-username"
          className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1"
        >
          {t('settings.profile.displayName')}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAvatarModalOpen(true)}
            className="shrink-0 rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label={t('settings.profile.avatar')}
          >
            <Avatar id={avatarId} size={28} />
          </button>
          <input
            id="profile-content-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full h-12 px-4 rounded-2xl bg-background border-2 border-transparent focus:border-visual/20 text-primary font-semibold placeholder:text-muted-foreground/60 focus:outline-none focus:bg-background transition-all"
            placeholder={t('settings.profile.yourName')}
            maxLength={20}
            {...nonAuthInputProps}
          />
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!username.trim() || isLoading || !hasChanges}
          className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-semibold text-base shadow-lg shadow-primary/10 hover:translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t('common.saving') : t('common.save')}
        </button>

        <button
          type="button"
          onClick={handleOpenProfileSettings}
          className="w-full h-12 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/20 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
        >
          <GearSix size={16} />
          <span>{t('settings.nav.profile', 'Profile settings')}</span>
        </button>

        <div className="pt-2 mt-1 border-t border-border/60">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full h-12 flex items-center justify-center gap-2 text-muted-foreground font-medium rounded-xl border border-border hover:bg-muted hover:text-red-500 hover:border-red-200 transition-all"
          >
            <SignOut size={18} />
            {t('auth.signOut')}
          </button>
        </div>
      </div>

      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        selectedId={avatarId}
        onSelect={setAvatarId}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </div>
  );
}
