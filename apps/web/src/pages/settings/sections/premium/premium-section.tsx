/**
 * Premium settings section - subscription status and upgrade
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Check, Cloud, Crown, Flask, Gift, Trophy, Sparkle } from '@phosphor-icons/react';
import {
  Card,
  Section,
  useSubscriptionQuery,
  useGrantedRewards,
  usePendingRewardsCount,
} from '@neurodual/ui';
import { APP_VERSION, PREMIUM_REWARDS } from '@neurodual/logic';
import { UpgradeDialog } from '../../components/upgrade-dialog';
import { DonationLinks } from '../../../../components/donation-links';
import { featureFlags } from '../../../../config/feature-flags';
import { useAlphaEnabled } from '../../../../hooks/use-beta-features';

const PREMIUM_FEATURES = [
  'settings.premium.features.unlimitedTraining',
  'settings.premium.features.cloudSync',
  'settings.premium.features.allPlatforms',
  'settings.premium.features.noAds',
] as const;

/**
 * Early Access banner - explains that subscription countdown is paused during beta
 */
function EarlyAccessBanner(): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="p-3 rounded-xl bg-violet-50 border border-violet-200">
      <div className="flex items-start gap-2.5">
        <Flask size={18} className="text-violet-600 shrink-0 mt-0.5" weight="duotone" />
        <div>
          <div className="text-sm font-semibold text-violet-700">
            {t('settings.premium.earlyAccess.title')}
          </div>
          <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">
            {t(
              'settings.premium.earlyAccess.description',
              "Pendant la bêta, ton abonnement est en pause. Le décompte ne commencera qu'à la sortie de la version stable.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function isPreV1(version: string): boolean {
  const major = Number(version.split('.')[0]);
  return Number.isFinite(major) && major < 1;
}

/**
 * XP Rewards section - displays rewards earned through XP progression
 */
function XPRewardsSection(): ReactNode {
  const { t, i18n } = useTranslation();
  const grantedRewards = useGrantedRewards();
  const pendingCount = usePendingRewardsCount();
  const alphaEnabled = useAlphaEnabled();

  // Hide when XP rewards system is disabled (unless alpha)
  if (!alphaEnabled && !featureFlags.xpRewardsEnabled) {
    return null;
  }

  if (grantedRewards.length === 0 && pendingCount === 0) {
    return null;
  }

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const getDaysRemaining = (expiresAt: Date | null): number | null => {
    if (!expiresAt) return null;
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-100">
          <Trophy size={22} className="text-amber-600" weight="fill" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground">
            {t('settings.premium.xpRewards.title')}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('settings.premium.xpRewards.subtitle')}
          </div>
        </div>
      </div>

      {/* Granted rewards */}
      {grantedRewards.length > 0 && (
        <div className="space-y-2">
          {grantedRewards.map((reward) => {
            const rewardDef = PREMIUM_REWARDS.find((r) => r.id === reward.rewardId);
            if (!rewardDef) return null;

            const daysRemaining = getDaysRemaining(reward.expiresAt);
            const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7;

            return (
              <div
                key={reward.rewardId}
                className={`p-3 rounded-xl border ${
                  isExpiringSoon ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Gift
                    size={20}
                    className={isExpiringSoon ? 'text-orange-500' : 'text-amber-500'}
                    weight="fill"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-foreground text-sm">
                      {t(rewardDef.nameKey)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {reward.expiresAt === null
                        ? t('settings.premium.xpRewards.lifetime')
                        : daysRemaining !== null && daysRemaining > 0
                          ? t('settings.premium.xpRewards.expiresIn', {
                              days: daysRemaining,
                              defaultValue: `Expires in ${daysRemaining} day(s)`,
                            })
                          : t('settings.premium.xpRewards.expired')}
                    </div>
                  </div>
                  {reward.expiresAt && (
                    <div className="text-xs text-muted-foreground">
                      {formatDate(reward.expiresAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending rewards notice */}
      {pendingCount > 0 && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-700">
            {t('settings.premium.xpRewards.pending', {
              count: pendingCount,
              defaultValue: `${pendingCount} reward(s) pending sync`,
            })}
          </p>
        </div>
      )}
    </Card>
  );
}

export function PremiumSection(): ReactNode {
  const { t, i18n } = useTranslation();
  const subscriptionState = useSubscriptionQuery();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const showDonationLinks = featureFlags.donationLinksEnabled && !Capacitor.isNativePlatform();
  const showEarlyAccessBanner = isPreV1(APP_VERSION);

  // Free mode: all features unlocked, show donation links instead of upgrade prompts
  if (!featureFlags.premiumEnabled) {
    return (
      <>
        <Section title={t('settings.premium.title')}>
          <Card className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl shrink-0 bg-primary/10 text-primary">
                <Sparkle size={20} weight="regular" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">
                  {t('settings.premium.freeMode.title')}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.premium.freeMode.subtitle')}
                </div>
              </div>
            </div>

            {/* Message */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('settings.premium.freeMode.description')}
            </p>

            {/* Features */}
            <div className="pt-3 border-t border-border">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-primary" />
                  <span className="text-foreground">
                    {t('settings.premium.features.unlimitedTrainingShort')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-primary" />
                  <span className="text-foreground">
                    {t('settings.premium.features.cloudSyncShort')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-primary" />
                  <span className="text-foreground">
                    {t('settings.premium.features.allPlatformsShort')}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        {showDonationLinks && <DonationLinks />}
      </>
    );
  }

  const subscription = subscriptionState.subscription;
  const isPremium = subscriptionState.hasPremiumAccess;
  const hasCloudSync = subscriptionState.hasCloudSync;

  // Format plan name
  const getPlanName = (planType: string): string => {
    switch (planType) {
      case 'premium':
        return t('settings.premium.planPremium');
      default:
        return t('settings.premium.planFree');
    }
  };

  // Format expiration date
  const formatExpirationDate = (date: Date | null): string => {
    if (!date) return '';
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  // Premium active state
  if (isPremium && subscription) {
    return (
      <>
        <Section title={t('settings.premium.title')}>
          <Card className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <Crown size={22} className="text-accent" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">
                  {getPlanName(subscription.planType)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {subscription.status === 'active' && subscription.expiresAt
                    ? t('settings.premium.expiresOn', {
                        date: formatExpirationDate(subscription.expiresAt),
                      })
                    : t('settings.premium.premiumActive')}
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-semibold">
                {t('settings.premium.statusActive')}
              </div>
            </div>

            {/* Thank you message */}
            <p className="text-sm text-muted-foreground">{t('settings.premium.thankYou')}</p>

            {/* Features */}
            <div className="pt-3 border-t border-border">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-accent" />
                  <span className="text-foreground">
                    {t('settings.premium.features.unlimitedTrainingShort')}
                  </span>
                </div>
                {hasCloudSync && (
                  <div className="flex items-center gap-2 text-sm">
                    <Cloud size={14} className="text-primary" />
                    <span className="text-foreground">
                      {t('settings.premium.features.cloudSyncShort')}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-accent" />
                  <span className="text-foreground">
                    {t('settings.premium.features.allPlatformsShort')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-accent" />
                  <span className="text-foreground">{t('settings.premium.features.noAds')}</span>
                </div>
              </div>
            </div>

            {/* Early Access Banner */}
            {showEarlyAccessBanner && <EarlyAccessBanner />}

            {/* Days remaining */}
            {subscriptionState.daysRemaining !== null && subscriptionState.daysRemaining <= 30 && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">
                  {t('settings.premium.daysRemaining', { count: subscriptionState.daysRemaining })}
                </p>
              </div>
            )}
          </Card>
        </Section>

        {/* XP Rewards section */}
        <XPRewardsSection />
      </>
    );
  }

  // Free/upgrade state
  return (
    <>
      <Section title={t('settings.premium.title')}>
        <Card className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Crown size={22} className="text-primary" />
            </div>
            <div className="font-semibold text-foreground">
              {t('settings.premium.unlockLevels')}
            </div>
          </div>

          {/* Philosophy explanation */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t(
              'settings.premium.freeExplanation',
              "Tu peux jouer gratuitement chaque jour. Si tu veux t'entraîner plus longtemps, passe à Premium pour un temps de jeu illimité.",
            )}
          </p>

          {/* Features list */}
          <ul className="space-y-2">
            {PREMIUM_FEATURES.map((featureKey) => (
              <li key={featureKey} className="flex items-center gap-2 text-sm text-foreground">
                <Check size={14} className="text-accent shrink-0" />
                <span>{t(featureKey)}</span>
              </li>
            ))}
          </ul>

          {/* Early Access Banner */}
          {showEarlyAccessBanner && <EarlyAccessBanner />}

          <button
            type="button"
            onClick={() => setShowUpgradeDialog(true)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            {t('settings.premium.viewOffers')}
          </button>
        </Card>
      </Section>

      <UpgradeDialog
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        source="settings_premium"
      />

      {/* XP Rewards section */}
      <XPRewardsSection />
    </>
  );
}
