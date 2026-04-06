/**
 * ProfileButton - Quick link to /settings/profile
 * Shows avatar (authenticated or local) or a generic user icon.
 */

import { Avatar, useAuthQuery } from '@neurodual/ui';
import { User } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransitionNavigate } from '../../hooks/use-transition-navigate';
import { useSettingsStore } from '../../stores/settings-store';

interface ProfileButtonProps {
  readonly compact?: boolean;
  readonly chrome?: 'standalone' | 'embedded';
}

export function ProfileButton({
  compact = false,
  chrome = 'standalone',
}: ProfileButtonProps): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const authState = useAuthQuery();

  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const isAuthenticated = authState.status === 'authenticated';
  const profile = isAuthenticated ? authState.profile : null;

  const avatarId = profile?.avatarId ?? localAvatarId;
  const label = t('settings.nav.profile');

  const compactClassName =
    chrome === 'embedded'
      ? 'flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-foreground/8 text-foreground transition duration-200 hover:bg-foreground/12 active:scale-95'
      : 'flex h-11 w-11 items-center justify-center rounded-full border border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/15 active:scale-95 transition duration-200';

  return (
    <button
      type="button"
      onClick={() => transitionNavigate('/settings/profile')}
      data-capture-control={compact && chrome === 'embedded' ? 'toolbar-button' : undefined}
      className={compact ? compactClassName : compactClassName}
      aria-label={label}
      title={label}
    >
      {avatarId ? (
        <Avatar id={avatarId} size={20} className="w-8 h-8" />
      ) : (
        <User size={18} weight="bold" />
      )}
    </button>
  );
}
