/**
 * Profile/Account settings section
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, Section } from '@neurodual/ui';
import { AvatarPicker, UsernameInput } from '../../../../components/profile';
import { useSettingsStore } from '../../../../stores/settings-store';

/**
export function ProfileSection(): ReactNode {
  const { t } = useTranslation();

  // Local profile from settings store
  const localDisplayName = useSettingsStore((s) => s.ui.localDisplayName);
  const localAvatarId = useSettingsStore((s) => s.ui.localAvatarId);
  const setLocalDisplayName = useSettingsStore((s) => s.setLocalDisplayName);
  const setLocalAvatarId = useSettingsStore((s) => s.setLocalAvatarId);

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
    </div>
  );
}
