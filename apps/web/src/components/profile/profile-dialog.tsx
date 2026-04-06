/**
 * ProfileDialog - Modal for editing user profile
 * Keyboard-aware on mobile (bottom sheet style)
 * Nordic design system
 */

import { Avatar, useSignOut } from '@neurodual/ui';
import { Bug, GearSix, SignOut, X } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTransitionNavigate } from '../../hooks/use-transition-navigate';
import { BugReportModal } from '../bug-report/bug-report-modal';
import { nonAuthInputProps } from '../../utils/non-auth-input-props';
import { AvatarSelectionModal } from './avatar-selection-modal';
import { useProfileDialog } from './use-profile-dialog';

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileDialog({ isOpen, onClose }: ProfileDialogProps): ReactNode {
  const { t } = useTranslation();
  const { transitionNavigate } = useTransitionNavigate();
  const logic = useProfileDialog(isOpen, onClose);
  const signOutMutation = useSignOut();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);

  const hasChanges =
    logic.user != null &&
    (logic.username.trim() !== logic.user.username || logic.selectedAvatar !== logic.user.avatarId);

  const handleOpenProfileSettings = () => {
    onClose();
    transitionNavigate('/settings/profile');
  };

  const handleLogout = async () => {
    await signOutMutation.mutateAsync();
    setShowLogoutConfirm(false);
    onClose();
  };

  if (!isOpen || !logic.user || !logic.mounted) {
    return <BugReportModal open={isBugReportOpen} onOpenChange={setIsBugReportOpen} />;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center safe-overlay-padding sm:py-6 animate-in fade-in duration-300">
        <button
          type="button"
          className="absolute inset-0 bg-background cursor-default w-full h-full border-none p-0 m-0"
          onClick={onClose}
          aria-label={t('common.close')}
        />

        <div className="relative z-10 w-full max-w-md mx-auto bg-surface rounded-[2rem] border border-border shadow-soft flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-center p-6 pb-2 shrink-0">
            <h2 className="text-2xl font-bold text-primary tracking-tight">
              {t('settings.profile.title')}
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

          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-5 scrollbar-hide">
            <div className="space-y-2">
              <label
                htmlFor="profile-dialog-username"
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
                  <Avatar id={logic.selectedAvatar} size={28} />
                </button>
                <input
                  id="profile-dialog-username"
                  type="text"
                  value={logic.username}
                  onChange={(event) => logic.setUsername(event.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-background border-2 border-transparent focus:border-visual/20 text-primary font-semibold placeholder:text-muted-foreground/60 focus:outline-none focus:bg-background transition-all"
                  placeholder={t('settings.profile.yourName')}
                  maxLength={20}
                  {...nonAuthInputProps}
                />
              </div>
            </div>
          </div>

          <div className="p-6 pt-2 shrink-0 bg-surface rounded-b-[2rem] space-y-2.5">
            <button
              type="button"
              onClick={() => void logic.handleSave()}
              disabled={!logic.username.trim() || logic.isSaving || !hasChanges}
              className="w-full h-12 bg-primary text-primary-foreground rounded-2xl font-semibold text-base shadow-lg shadow-primary/10 hover:translate-y-0.5 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t('common.save')}
            >
              {logic.isSaving ? t('common.saving', 'Enregistrement...') : t('common.save')}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenProfileSettings}
                className="flex-1 h-12 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/20 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
              >
                <GearSix size={16} />
                <span>{t('settings.nav.profile', 'Profile settings')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setIsBugReportOpen(true);
                }}
                className="h-12 px-3.5 rounded-xl border border-border text-muted-foreground hover:text-primary hover:border-primary/20 hover:bg-primary/5 transition-colors flex items-center justify-center"
                aria-label={t('settings.about.reportBug')}
                title={t('settings.about.reportBug')}
              >
                <Bug size={16} />
              </button>
            </div>

            <div className="pt-2 mt-1 border-t border-border/60">
              {showLogoutConfirm ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 h-12 text-muted-foreground font-medium rounded-xl border border-border hover:bg-muted transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={signOutMutation.isPending}
                    className="flex-1 h-12 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {signOutMutation.isPending
                      ? t('common.loading')
                      : t('settings.account.confirmLogout')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full h-12 flex items-center justify-center gap-2 text-muted-foreground font-medium rounded-xl border border-border hover:bg-muted hover:text-red-500 hover:border-red-200 transition-all"
                >
                  <SignOut size={18} />
                  <span>{t('settings.account.logout')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        selectedId={logic.selectedAvatar}
        onSelect={logic.setSelectedAvatar}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </>,
    document.body,
  );
}
