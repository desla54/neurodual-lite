/**
 * Upgrade to Premium dialog
 *
 * - Web (PWA): Lemon Squeezy checkout + license key input
 * - Mobile: RevenueCat IAP (annual + lifetime only)
 */

import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '../../../hooks/use-analytics';
import { nonAuthInputProps } from '../../../utils/non-auth-input-props';
import { CheckIcon, CrownIcon, KeyIcon, ArrowSquareOutIcon, XIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import {
  useAuthQuery,
  useIsPaymentAvailable,
  useProducts,
  usePurchase,
  useRestorePurchases,
  useIsLicenseAvailable,
  useLicenseProducts,
  useActivateLicense,
  useGetCheckoutUrl,
} from '@neurodual/ui';
import { AuthDialog } from '../../../components/auth';
import { PostPurchaseModal } from './post-purchase-modal';

interface UpgradeDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly source?: string;
}

type PlanType = 'premium_monthly' | 'premium_yearly' | 'premium_lifetime';

export function UpgradeDialog({
  isOpen,
  onClose,
  source = 'unknown',
}: UpgradeDialogProps): ReactNode {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  const authState = useAuthQuery();
  const isAuthenticated = authState.status === 'authenticated';

  // Mobile (RevenueCat) - Context-based hooks (backward-compatible interface)
  const { products: rcProducts, loading: rcProductsLoading } = useProducts();
  const { purchase, purchasing } = usePurchase();
  const { restore, restoring } = useRestorePurchases();
  const isPaymentAvailable = useIsPaymentAvailable();

  // Web (Lemon Squeezy) - TanStack Query hooks
  const isLicenseAvailable = useIsLicenseAvailable();
  const { data: lsProducts } = useLicenseProducts();
  const { mutateAsync: activateLicense, isPending: activating } = useActivateLicense();
  const { mutateAsync: getCheckoutUrl, isPending: gettingCheckout } = useGetCheckoutUrl();

  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('premium_yearly');
  const [showPostPurchase, setShowPostPurchase] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showLicenseInput, setShowLicenseInput] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  // Analytics: track paywall_viewed when dialog opens
  const paywallTrackedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !paywallTrackedRef.current) {
      paywallTrackedRef.current = true;
      track('paywall_viewed', { source, current_plan: 'free' });
    }
    if (!isOpen) {
      paywallTrackedRef.current = false;
    }
  }, [isOpen, source, track]);

  if (!isOpen) return null;

  const features = [
    {
      key: 'unlimitedTraining',
      label: t('settings.premium.features.unlimitedTraining'),
    },
    { key: 'noAds', label: t('settings.premium.features.noAds') },
    {
      key: 'cloudSync',
      label: t('settings.premium.features.cloudSync'),
    },
    {
      key: 'futureModes',
      label: t('settings.premium.features.futureModes'),
    },
  ];

  // Find products by ID (RevenueCat for mobile)
  const monthlyProduct = rcProducts.find((p) => p.id === 'premium_monthly');
  const yearlyProduct = rcProducts.find((p) => p.id === 'premium_yearly');
  const lifetimeProduct = rcProducts.find((p) => p.id === 'premium_lifetime');

  // Lemon Squeezy products (web) — no monthly on web (store commissions too high)
  const lsYearly = lsProducts?.find((p) => p.interval === 'year');
  const lsLifetime = lsProducts?.find((p) => !p.isSubscription);

  // Compute yearly price per month for display
  const yearlyMonthlyPrice = (() => {
    if (isLicenseAvailable && lsYearly) {
      const monthly = Math.ceil(lsYearly.priceCents / 12);
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: lsYearly.currencyCode,
      }).format(monthly / 100);
    }
    if (yearlyProduct) {
      const monthly = Math.ceil(yearlyProduct.priceMicros / 12);
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: yearlyProduct.currencyCode,
      }).format(monthly / 1_000_000);
    }
    return '2,09 €';
  })();

  // Determine platform
  const isWeb = isLicenseAvailable;
  const isMobile = isPaymentAvailable && !isLicenseAvailable;
  const isSubscriptionPlan =
    selectedPlan === 'premium_yearly' || selectedPlan === 'premium_monthly';
  const platform = Capacitor.getPlatform();
  const purchaseChannel: 'ios' | 'android' | 'web' = isWeb
    ? 'web'
    : platform === 'ios'
      ? 'ios'
      : platform === 'android'
        ? 'android'
        : 'web';

  const autoRenewNotice =
    purchaseChannel === 'ios'
      ? t('settings.premium.legal.autoRenewNoticeIOS')
      : purchaseChannel === 'android'
        ? t('settings.premium.legal.autoRenewNoticeAndroid')
        : t('settings.premium.legal.autoRenewNoticeWeb');

  const oneTimeNotice =
    purchaseChannel === 'ios'
      ? t('settings.premium.legal.oneTimeNoticeIOS')
      : purchaseChannel === 'android'
        ? t('settings.premium.legal.oneTimeNoticeAndroid')
        : t('settings.premium.legal.oneTimeNoticeWeb');

  // Handle mobile purchase (RevenueCat)
  const handleMobilePurchase = async () => {
    setError(null);
    track('upgrade_started', { plan: selectedPlan, channel: purchaseChannel });
    const result = await purchase(selectedPlan);
    if (result.success) {
      track('upgrade_completed', { plan: selectedPlan, channel: purchaseChannel });
      if (isAuthenticated) {
        onClose();
      } else {
        setShowPostPurchase(true);
      }
    } else if (!result.userCancelled && result.errorMessage) {
      console.error('[Purchase] Failed:', result.errorMessage);
      track('upgrade_failed', {
        plan: selectedPlan,
        channel: purchaseChannel,
        error: result.errorMessage,
      });
      if (
        result.errorMessage.toLowerCase().includes('configured') ||
        result.errorMessage.toLowerCase().includes('initialize')
      ) {
        setError(t('settings.premium.purchaseNotConfigured'));
      } else {
        setError(`${t('settings.premium.purchaseFailed')} (${result.errorMessage})`);
      }
    }
  };

  // Handle web checkout (Lemon Squeezy)
  const handleWebCheckout = async () => {
    setError(null);

    const variant =
      selectedPlan === 'premium_yearly'
        ? lsYearly
        : selectedPlan === 'premium_lifetime'
          ? lsLifetime
          : null;
    if (!variant) {
      setError(t('settings.premium.productNotAvailable'));
      return;
    }

    track('upgrade_started', { plan: selectedPlan, channel: 'web' });

    try {
      // Get user info for checkout pre-fill (only available when authenticated)
      const user = authState.status === 'authenticated' ? authState.session.user : null;

      const result = await getCheckoutUrl({
        variantId: variant.variantId,
        options: {
          email: user?.email,
          customData: user?.id ? { user_id: user.id } : undefined,
        },
      });

      // Open checkout in new tab
      window.open(result.url, '_blank', 'noopener,noreferrer');

      // Show license key input after redirect
      setShowLicenseInput(true);
    } catch {
      track('upgrade_failed', { plan: selectedPlan, channel: 'web', error: 'checkout_failed' });
      setError(t('settings.premium.checkoutFailed'));
    }
  };

  // Handle license key activation
  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setError(t('settings.premium.enterLicenseKey'));
      return;
    }

    setError(null);

    try {
      const result = await activateLicense(licenseKey.trim());

      if (result.activated) {
        track('upgrade_completed', { plan: selectedPlan, channel: 'web' });
        onClose();
      } else {
        track('upgrade_failed', {
          plan: selectedPlan,
          channel: 'web',
          error: result.error || 'invalid_key',
        });
        setError(result.error || t('settings.premium.invalidLicenseKey'));
      }
    } catch {
      track('upgrade_failed', { plan: selectedPlan, channel: 'web', error: 'activation_failed' });
      setError(t('settings.premium.activationFailed'));
    }
  };

  const handleRestore = async () => {
    setError(null);
    try {
      const info = await restore();
      if (info.isActive) {
        onClose();
      } else {
        setError(t('settings.premium.noPurchasesToRestore'));
      }
    } catch {
      setError(t('settings.premium.restoreFailed'));
    }
  };

  // Post-purchase flow handlers
  const handleCreateAccount = () => {
    setShowPostPurchase(false);
    setShowAuthDialog(true);
  };

  const handleSkipAccount = () => {
    setShowPostPurchase(false);
    onClose();
  };

  const handleAuthDialogClose = () => {
    setShowAuthDialog(false);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center page-overlay-padding-x settings-upgrade-dialog-content-safe"
    >
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        aria-label={t('common.close')}
      />

      {/* Dialog */}
      <div className="relative bg-surface/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-soft max-w-sm w-full max-h-full overflow-y-auto p-5 animate-in fade-in zoom-in-95">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label={t('common.close')}
        >
          <XIcon className="w-5 h-5" weight="bold" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
            <CrownIcon className="w-7 h-7 text-primary" weight="regular" />
          </div>
          <h2 id="upgrade-dialog-title" className="text-lg font-bold text-foreground">
            {t('settings.premium.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('settings.premium.subtitle')}</p>
        </div>

        {/* Features */}
        <div className="space-y-2 mb-5">
          {features.map((feature) => (
            <div key={feature.key} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                <CheckIcon className="w-3 h-3 text-accent" weight="bold" />
              </div>
              <span className="text-sm text-foreground leading-snug">{feature.label}</span>
            </div>
          ))}
        </div>

        {/* License Key Input (Web - shown after checkout or if user has a key) */}
        {isWeb && showLicenseInput && (
          <div className="mb-5 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <KeyIcon className="w-5 h-5 text-primary" weight="duotone" />
              <span className="font-medium text-foreground">
                {t('settings.premium.enterYourKey')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.premium.licenseKeyHint')}
            </p>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              placeholder="NDUAL-XXXX-XXXX-XXXX"
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-center font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/50"
              {...nonAuthInputProps}
            />
            <button
              type="button"
              onClick={handleActivateLicense}
              disabled={activating || !licenseKey.trim()}
              className="w-full mt-3 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activating ? t('common.loading') : t('settings.premium.activateKey')}
            </button>
            <button
              type="button"
              onClick={() => setShowLicenseInput(false)}
              className="w-full mt-2 py-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              {t('common.back')}
            </button>
          </div>
        )}

        {/* Plan Selection (hidden when showing license input) */}
        {!showLicenseInput && (
          <>
            <div className="space-y-2 mb-5">
              {/* Monthly — mobile stores only (commissions too high for web) */}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setSelectedPlan('premium_monthly')}
                  className={`w-full p-3 rounded-xl border transition-all text-left ${
                    selectedPlan === 'premium_monthly'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-surface hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">
                        {t('settings.premium.planMonthly', 'Mensuel')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">
                        {rcProductsLoading ? '...' : monthlyProduct?.priceString || '3,99 €'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        /{t('settings.premium.perMonth', 'mois')}
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Yearly */}
              <button
                type="button"
                onClick={() => setSelectedPlan('premium_yearly')}
                className={`w-full p-3 rounded-xl border transition-all text-left relative ${
                  selectedPlan === 'premium_yearly'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="absolute -top-2 right-3 px-2 py-0.5 bg-accent text-white text-xs font-bold rounded-full">
                  {t('settings.premium.recommended')}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">
                      {t('settings.premium.planYearly')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.premium.bestValue')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">
                      {rcProductsLoading ? '...' : yearlyMonthlyPrice}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      /{t('settings.premium.perMonth', 'mois')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isWeb
                        ? lsYearly?.priceString || '24,99 €'
                        : rcProductsLoading
                          ? ''
                          : yearlyProduct?.priceString || '24,99 €'}
                      {!rcProductsLoading && ' /'}
                      {!rcProductsLoading && t('settings.premium.perYear', 'an')}
                    </div>
                  </div>
                </div>
              </button>

              {/* Lifetime */}
              <button
                type="button"
                onClick={() => setSelectedPlan('premium_lifetime')}
                className={`w-full p-3 rounded-xl border transition-all text-left ${
                  selectedPlan === 'premium_lifetime'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:border-primary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">
                      {t('settings.premium.planLifetime')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.premium.oneTimePayment')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">
                      {isWeb
                        ? lsLifetime?.priceString || '59,99 €'
                        : rcProductsLoading
                          ? '...'
                          : lifetimeProduct?.priceString || '59,99 €'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.premium.tenYears')}
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive text-center">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              {/* Web: Lemon Squeezy checkout */}
              {isWeb && (
                <>
                  <button
                    type="button"
                    onClick={handleWebCheckout}
                    disabled={gettingCheckout}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {gettingCheckout ? (
                      t('common.loading')
                    ) : (
                      <>
                        {t('settings.premium.upgradeButton')}
                        <ArrowSquareOutIcon className="w-4 h-4" weight="bold" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLicenseInput(true)}
                    className="w-full py-2.5 text-primary text-sm font-medium hover:bg-primary/5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <KeyIcon className="w-4 h-4" weight="duotone" />
                    {t('settings.premium.haveKey')}
                  </button>
                </>
              )}

              {/* Mobile: RevenueCat IAP */}
              {isMobile && (
                <>
                  <button
                    type="button"
                    onClick={handleMobilePurchase}
                    disabled={purchasing}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {purchasing ? t('common.loading') : t('settings.premium.upgradeButton')}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={restoring}
                    className="w-full py-2.5 text-primary text-sm font-medium hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {restoring ? t('common.loading') : t('settings.premium.restorePurchases')}
                  </button>
                </>
              )}

              {/* Neither available (should not happen in practice) */}
              {!isWeb && !isMobile && (
                <div className="p-3 bg-muted/50 rounded-xl text-sm text-muted-foreground text-center">
                  {t('settings.premium.notAvailable')}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                {t('common.later')}
              </button>
            </div>

            {/* Legal disclosures (all platforms) */}
            <div className="mt-4 pt-4 border-t border-border/70 space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isSubscriptionPlan ? autoRenewNotice : oneTimeNotice}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.premium.legal.linksPrefix')}
                <Link
                  to="/legal/terms"
                  className="underline hover:text-foreground transition-colors"
                >
                  {t('settings.legal.terms')}
                </Link>
                {' & '}
                <Link
                  to="/legal/privacy"
                  className="underline hover:text-foreground transition-colors"
                >
                  {t('settings.legal.privacy')}
                </Link>
                .
              </p>
            </div>
          </>
        )}
      </div>

      {/* Post-purchase modal (mobile only) */}
      <PostPurchaseModal
        isOpen={showPostPurchase}
        onCreateAccount={handleCreateAccount}
        onSkip={handleSkipAccount}
      />

      {/* Auth dialog for account creation */}
      <AuthDialog isOpen={showAuthDialog} onClose={handleAuthDialogClose} initialMode="signup" />
    </div>,
    document.body,
  );
}
