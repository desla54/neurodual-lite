/**
 * Post-purchase modal - Explains account requirement for sync
 *
 * Shown after successful premium purchase to:
 * - Congratulate the user
 * - Explain that account is needed for multi-device sync
 * - But other premium features work without account
 */

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon, CloudIcon, DeviceMobileIcon, UserPlusIcon } from '@phosphor-icons/react';

interface PostPurchaseModalProps {
  readonly isOpen: boolean;
  readonly onCreateAccount: () => void;
  readonly onSkip: () => void;
}

export function PostPurchaseModal({
  isOpen,
  onCreateAccount,
  onSkip,
}: PostPurchaseModalProps): ReactNode {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-purchase-title"
      className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center page-overlay-padding-x page-overlay-padding-y sm:px-0 animate-in fade-in duration-300"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md mx-auto mb-4 sm:mb-0 bg-surface/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-border/50 flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-3">
              <CheckIcon className="w-7 h-7 text-accent" weight="bold" />
            </div>
            <h2 id="post-purchase-title" className="text-xl font-bold text-foreground">
              {t('settings.premium.purchaseSuccess', 'Welcome to Premium!')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('settings.premium.purchaseSuccessDesc', 'All premium features are now unlocked.')}
            </p>
          </div>

          {/* Unlocked features */}
          <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                <CheckIcon className="w-3 h-3 text-accent" weight="bold" />
              </div>
              <span className="text-sm text-foreground leading-snug">
                {t('settings.premium.unlockedNow')}
              </span>
            </div>
          </div>

          {/* Account recommendation */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-primary/10 shrink-0">
                <CloudIcon className="w-5 h-5 text-primary" weight="regular" />
              </div>
              <div>
                <div className="font-medium text-foreground text-sm">
                  {t('settings.premium.syncRecommendation')}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t('settings.premium.syncRecommendationDesc')}
                </p>
              </div>
            </div>
          </div>

          {/* Restore info */}
          <div className="flex items-start gap-2.5 px-1">
            <DeviceMobileIcon
              className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5"
              weight="regular"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'settings.premium.restoreInfo',
                'Without an account, you can only restore your purchase on devices signed into the same App Store / Google Play account.',
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onCreateAccount}
              className="w-full py-3.5 bg-primary text-white rounded-2xl font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <UserPlusIcon size={20} weight="regular" />
              {t('settings.premium.createAccount', 'Create account')}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full py-3 text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors"
            >
              {t('settings.premium.continueWithout', 'Continuer sans compte')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
