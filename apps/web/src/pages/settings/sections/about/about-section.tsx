/**
 * About section - App info, support, rating, legal
 */

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  ArrowsClockwise,
  BookOpenText,
  Bug,
  CaretRight,
  Check,
  DeviceMobile,
  DownloadSimple,
  Envelope,
  FileText,
  Flask,
  Gear,
  Lock,
  Scroll,
  ShareNetwork,
  ShoppingCart,
  Star,
} from '@phosphor-icons/react';
import {
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Logo,
  Section,
  Toggle,
  useMountEffect,
} from '@neurodual/ui';
import { APP_VERSION } from '@neurodual/logic';
import {
  useAdminEnabled,
  useAlphaEnabled,
  useBetaEnabled,
} from '../../../../hooks/use-beta-features';
import { featureFlags } from '../../../../config/feature-flags';
import { useSettingsStore } from '../../../../stores/settings-store';
import { ALPHA_SECRET_CODE } from '../../../../config/experimental-codes';
import { BugReportModal } from '../../../../components/bug-report/bug-report-modal';
import { openExternalUrl } from '../../../../utils/open-external-url';
import { nonAuthInputProps } from '../../../../utils/non-auth-input-props';
import type {} from '../../../../types/pwa.d'; // Import for global Window augmentation

const EXPERIMENTAL_MODES_ENABLED = featureFlags.experimentalModesEnabled;
const WEB_APP_VERSION = import.meta.env.VITE_APP_VERSION || APP_VERSION;
const ALPHA_TOGGLE_UNLOCK_STORAGE_KEY = 'neurodual_alpha_toggle_unlocked_v1';

// External links
const LINKS = {
  contact: 'mailto:support@neurodual.fr',
  rateAndroid: 'https://play.google.com/store/apps/details?id=com.neurodual.app',
  rateIOS: 'https://apps.apple.com/app/neurodual/id123456789',
};

// Legal pages with distinct icons
const LEGAL_LINKS = [
  { href: '/legal/mentions', labelKey: 'settings.legal.mentions', icon: FileText },
  { href: '/legal/privacy', labelKey: 'settings.legal.privacy', icon: Lock },
  { href: '/legal/terms', labelKey: 'settings.legal.terms', icon: Scroll },
  { href: '/legal/cgv', labelKey: 'settings.legal.sales', icon: ShoppingCart },
];

function ExternalLink({
  href,
  icon: Icon,
  label,
  sublabel,
}: {
  href: string;
  icon: typeof Star;
  label: string;
  sublabel?: string;
}): ReactNode {
  const isNative = Capacitor.isNativePlatform();

  return (
    <a
      href={href}
      target={isNative ? undefined : '_blank'}
      rel={isNative ? undefined : 'noopener noreferrer'}
      onClick={
        isNative
          ? (event) => {
              event.preventDefault();
              void openExternalUrl(href);
            }
          : undefined
      }
      className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
    >
      <Icon size={18} className="text-muted-foreground shrink-0" weight="regular" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      <CaretRight size={16} className="text-muted-foreground shrink-0" />
    </a>
  );
}

type InstallState = 'available' | 'ios' | 'installed' | 'unavailable';

function useInstallState(): {
  state: InstallState;
  install: () => Promise<void>;
} {
  const [state, setState] = useState<InstallState>('unavailable');

  useMountEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (typeof (navigator as { standalone?: boolean }).standalone === 'boolean' &&
        (navigator as { standalone?: boolean }).standalone === true);

    if (isStandalone || window.__pwaInstallPromptHandled) {
      setState('installed');
      return;
    }

    // Check if iOS (no beforeinstallprompt support)
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOSDevice) {
      setState('ios');
      return;
    }

    // Check if install prompt is available
    if (window.__pwaInstallPrompt) {
      setState('available');
    }

    // Listen for late-arriving event
    function handleInstallAvailable() {
      if (window.__pwaInstallPrompt) {
        setState('available');
      }
    }

    function handleInstalled() {
      setState('installed');
    }

    window.addEventListener('pwa-install-available', handleInstallAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  });

  const install = async () => {
    if (!window.__pwaInstallPrompt) return;

    await window.__pwaInstallPrompt.prompt();
    const { outcome } = await window.__pwaInstallPrompt.userChoice;

    if (outcome === 'accepted') {
      window.__pwaInstallPrompt = null;
      window.__pwaInstallPromptHandled = true;
      setState('installed');
    }
  };

  return { state, install };
}

function InstallAppButton(): ReactNode {
  const { t } = useTranslation();
  const { state, install } = useInstallState();

  if (state === 'unavailable') {
    return null;
  }

  if (state === 'installed') {
    return (
      <div className="flex items-center gap-3 p-4">
        <Check size={18} className="text-green-500 shrink-0" weight="bold" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {t('settings.about.appInstalled')}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('settings.about.appInstalledDesc')}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'ios') {
    return (
      <div className="flex items-center gap-3 p-4">
        <DeviceMobile size={18} className="text-muted-foreground shrink-0" weight="regular" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {t('settings.about.installApp')}
          </div>
          <div className="text-xs text-muted-foreground">{t('settings.about.installIOS')}</div>
        </div>
      </div>
    );
  }

  // state === 'available'
  return (
    <button
      type="button"
      onClick={install}
      className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors w-full text-left"
    >
      <DownloadSimple size={18} className="text-primary shrink-0" weight="bold" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{t('settings.about.installApp')}</div>
        <div className="text-xs text-muted-foreground">{t('settings.about.installDesc')}</div>
      </div>
      <CaretRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
}

function ReplayOnboardingButton(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setHomeOnboardingCompleted = useSettingsStore((s) => s.setHomeOnboardingCompleted);

  const handleReplay = () => {
    setHomeOnboardingCompleted(false);
    navigate('/');
  };

  return (
    <button
      type="button"
      onClick={handleReplay}
      className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors w-full text-left"
    >
      <BookOpenText size={18} className="text-muted-foreground shrink-0" weight="regular" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">
          {t('settings.about.replayOnboarding', 'Revoir la présentation')}
        </div>
        <div className="text-xs text-muted-foreground">
          {t(
            'settings.about.replayOnboardingDesc',
            "Relancer le guide de découverte de l'application",
          )}
        </div>
      </div>
      <CaretRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
}

export function AboutSection(): ReactNode {
  const { t } = useTranslation();
  const isAlphaEnabled = useAlphaEnabled();
  const isBetaEnabled = useBetaEnabled();
  const isAdminEnabled = useAdminEnabled();
  const setAlphaEnabled = useSettingsStore((s) => s.setAlphaEnabled);
  const setBetaEnabled = useSettingsStore((s) => s.setBetaEnabled);
  const isNative = Capacitor.isNativePlatform();
  const [alphaToggleUnlocked, setAlphaToggleUnlocked] = useState(false);
  const [isAlphaCodeModalOpen, setIsAlphaCodeModalOpen] = useState(false);
  const [alphaUnlockCode, setAlphaUnlockCode] = useState('');
  const [alphaUnlockError, setAlphaUnlockError] = useState(false);
  const [displayVersion, setDisplayVersion] = useState<string>(WEB_APP_VERSION);
  const [displayBuild, setDisplayBuild] = useState<string | null>(null);
  const [capgoInfo, setCapgoInfo] = useState<{
    pluginVersion: string | null;
    builtinVersion: string | null;
    autoUpdateEnabled: boolean | null;
    currentBundle: {
      id: string;
      version: string;
      downloaded: string;
      checksum: string;
      status: string;
    } | null;
    error: string | null;
  } | null>(null);
  const [capgoLoading, setCapgoLoading] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const refreshCapgoInfo = useCallback(async (): Promise<void> => {
    if (!isNative) return;
    setCapgoLoading(true);
    try {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
      const [pluginVersionRes, builtinVersionRes, autoUpdateEnabledRes, current] =
        await Promise.all([
          CapacitorUpdater.getPluginVersion().catch(() => null),
          CapacitorUpdater.getBuiltinVersion().catch(() => null),
          CapacitorUpdater.isAutoUpdateEnabled().catch(() => null),
          CapacitorUpdater.current().catch(() => null),
        ]);

      const pluginVersion = pluginVersionRes?.version ?? null;
      const builtinVersion = builtinVersionRes?.version ?? null;
      const autoUpdateEnabled = autoUpdateEnabledRes?.enabled ?? null;
      const bundle = current?.bundle ?? null;

      setCapgoInfo({
        pluginVersion,
        builtinVersion,
        autoUpdateEnabled,
        currentBundle: bundle
          ? {
              id: bundle.id,
              version: bundle.version,
              downloaded: bundle.downloaded,
              checksum: bundle.checksum,
              status: String(bundle.status),
            }
          : null,
        error: null,
      });
    } catch (err) {
      setCapgoInfo({
        pluginVersion: null,
        builtinVersion: null,
        autoUpdateEnabled: null,
        currentBundle: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCapgoLoading(false);
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    refreshCapgoInfo();
  }, [isNative, refreshCapgoInfo]);

  useMountEffect(() => {
    if (!EXPERIMENTAL_MODES_ENABLED) return;
    try {
      const persisted = window.localStorage.getItem(ALPHA_TOGGLE_UNLOCK_STORAGE_KEY);
      if (persisted === '1') {
        setAlphaToggleUnlocked(true);
      }
    } catch {
      // Ignore storage access errors (private mode / restricted env)
    }
  });

  useEffect(() => {
    if (!EXPERIMENTAL_MODES_ENABLED) return;
    if (!isAlphaEnabled || alphaToggleUnlocked) return;
    setAlphaToggleUnlocked(true);
    try {
      window.localStorage.setItem(ALPHA_TOGGLE_UNLOCK_STORAGE_KEY, '1');
    } catch {
      // Ignore storage access errors (private mode / restricted env)
    }
  }, [isAlphaEnabled, alphaToggleUnlocked]);

  useEffect(() => {
    if (!isNative) return;

    let cancelled = false;

    const loadNativeAppInfo = async () => {
      try {
        const info = await App.getInfo();

        if (cancelled) return;

        if (info.version) {
          setDisplayVersion(info.version);
        }
        setDisplayBuild(info.build || null);
      } catch {
        if (!cancelled) {
          setDisplayBuild(null);
        }
      }
    };

    void loadNativeAppInfo();

    return () => {
      cancelled = true;
    };
  }, [isNative]);

  // Override displayVersion with Capgo OTA bundle version when available
  useEffect(() => {
    if (capgoInfo?.currentBundle?.version) {
      setDisplayVersion(capgoInfo.currentBundle.version);
    }
  }, [capgoInfo]);

  const handleShare = async () => {
    const shareData = {
      title: 'Neurodual',
      text: t('settings.about.shareText', 'Train your brain with Neurodual!'),
      url: 'https://neurodual.com',
    };

    // Native: use Capacitor Share plugin for reliable iOS/Android share sheet
    if (isNative) {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url,
          dialogTitle: shareData.title,
        });
      } catch {
        // User cancelled or error
      }
      return;
    }

    // Web: try navigator.share, fallback to clipboard with feedback
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      } catch {
        // Clipboard access denied
      }
    }
  };

  // Detect platform for store link
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const storeLink = isIOS ? LINKS.rateIOS : LINKS.rateAndroid;
  const canToggleAlpha = featureFlags.devAppEnabled || alphaToggleUnlocked || isAlphaEnabled;

  const handleBetaToggle = useCallback(
    (enabled: boolean) => {
      setBetaEnabled(enabled);
    },
    [setBetaEnabled],
  );

  const handleAlphaToggle = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setAlphaEnabled(false);
        return;
      }
      if (canToggleAlpha) {
        setAlphaEnabled(true);
        return;
      }
      setAlphaUnlockCode('');
      setAlphaUnlockError(false);
      setIsAlphaCodeModalOpen(true);
    },
    [setAlphaEnabled, canToggleAlpha],
  );

  const handleAlphaCodeModalOpenChange = useCallback((open: boolean) => {
    setIsAlphaCodeModalOpen(open);
    if (!open) {
      setAlphaUnlockCode('');
      setAlphaUnlockError(false);
    }
  }, []);

  const handleUnlockAlpha = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (alphaUnlockCode.trim() !== ALPHA_SECRET_CODE) {
        setAlphaUnlockError(true);
        return;
      }
      setAlphaToggleUnlocked(true);
      setIsAlphaCodeModalOpen(false);
      setAlphaUnlockError(false);
      setAlphaUnlockCode('');
      setAlphaEnabled(true);
      try {
        window.localStorage.setItem(ALPHA_TOGGLE_UNLOCK_STORAGE_KEY, '1');
      } catch {
        // Ignore storage access errors (private mode / restricted env)
      }
    },
    [alphaUnlockCode, setAlphaEnabled],
  );

  return (
    <>
      {/* App Info Card */}
      <Card>
        <div className="flex items-center gap-4">
          <Logo variant="icon" size={56} className="text-foreground" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground">Neurodual</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{t('settings.about.tagline')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
              {displayBuild ? `v${displayVersion} (build ${displayBuild})` : `v${displayVersion}`}
            </p>
          </div>
        </div>
      </Card>

      {/* Install App Section */}
      <Section title={t('settings.about.application')}>
        <Card className="space-y-0 divide-y divide-border" padding="none">
          <ReplayOnboardingButton />
          <InstallAppButton />
          {EXPERIMENTAL_MODES_ENABLED && (
            <>
              <div className="px-4">
                <Toggle
                  label={t('settings.about.betaAccess')}
                  description={
                    isBetaEnabled ? t('settings.about.betaActive') : t('settings.about.betaDesc')
                  }
                  checked={isBetaEnabled}
                  onChange={handleBetaToggle}
                  icon={<Flask size={18} weight="regular" />}
                  activeColor="primary"
                />
              </div>

              <div className="px-4">
                <Toggle
                  label={t('settings.about.alphaAccess')}
                  description={
                    isAlphaEnabled
                      ? t('settings.about.alphaActive', 'Alpha features enabled (unstable)')
                      : t(
                          'settings.about.alphaDesc',
                          'Features in development, enable with caution',
                        )
                  }
                  checked={isAlphaEnabled}
                  onChange={handleAlphaToggle}
                  icon={<Flask size={18} weight="regular" />}
                  activeColor="primary"
                />
              </div>
            </>
          )}
          {EXPERIMENTAL_MODES_ENABLED && (
            <Link
              to="/admin"
              className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
            >
              <Gear size={18} className="text-muted-foreground shrink-0" weight="regular" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {t('settings.about.adminAccess')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAdminEnabled ? t('settings.about.adminActive') : t('settings.about.adminDesc')}
                </div>
              </div>
              <CaretRight size={16} className="text-muted-foreground shrink-0" />
            </Link>
          )}
        </Card>
      </Section>

      {/* Native diagnostics (Capacitor only) */}
      {isNative && (
        <Section title={t('settings.about.nativeDiagnostics')}>
          <Card className="space-y-0 divide-y divide-border" padding="none">
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {t('settings.about.liveUpdate')}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  {capgoInfo?.error
                    ? capgoInfo.error
                    : capgoInfo?.currentBundle
                      ? `bundle=${capgoInfo.currentBundle.id} v=${capgoInfo.currentBundle.version} status=${capgoInfo.currentBundle.status}`
                      : t('settings.about.liveUpdateUnavailable')}
                </div>
                {capgoInfo && !capgoInfo.error && (
                  <div className="text-3xs text-muted-foreground/70 font-mono mt-1">
                    {[
                      capgoInfo.pluginVersion ? `plugin=${capgoInfo.pluginVersion}` : null,
                      capgoInfo.builtinVersion ? `builtin=${capgoInfo.builtinVersion}` : null,
                      capgoInfo.autoUpdateEnabled === null
                        ? null
                        : `auto=${capgoInfo.autoUpdateEnabled ? 'on' : 'off'}`,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={refreshCapgoInfo}
                disabled={capgoLoading}
                className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title={t('settings.about.refresh')}
              >
                <ArrowsClockwise size={18} className={capgoLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </Card>
        </Section>
      )}

      {/* Support Section */}
      <Section title={t('settings.about.support')}>
        <Card className="space-y-0 divide-y divide-border" padding="none">
          <ExternalLink
            href={LINKS.contact}
            icon={Envelope}
            label={t('settings.about.contactUs')}
            sublabel="support@neurodual.fr"
          />
          <button
            type="button"
            onClick={() => setIsBugReportOpen(true)}
            className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors w-full text-left"
          >
            <Bug size={18} className="text-muted-foreground shrink-0" weight="regular" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {t('settings.about.reportBug')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('settings.about.reportBugDesc')}
              </div>
            </div>
            <CaretRight size={16} className="text-muted-foreground shrink-0" />
          </button>
        </Card>
      </Section>

      {/* Rate & Share Section */}
      <Section title={t('settings.about.rateShare')}>
        <Card className="space-y-0 divide-y divide-border" padding="none">
          <ExternalLink
            href={storeLink}
            icon={Star}
            label={t('settings.about.rateApp')}
            sublabel={t('settings.about.rateDesc')}
          />
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors w-full text-left"
          >
            {shareCopied ? (
              <Check size={18} className="text-green-500 shrink-0" weight="bold" />
            ) : (
              <ShareNetwork size={18} className="text-muted-foreground shrink-0" weight="regular" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">
                {shareCopied
                  ? t('settings.about.shareCopied', 'Copied!')
                  : t('settings.about.shareApp')}
              </div>
              <div className="text-xs text-muted-foreground">{t('settings.about.shareDesc')}</div>
            </div>
            {!shareCopied && <CaretRight size={16} className="text-muted-foreground shrink-0" />}
          </button>
        </Card>
      </Section>

      {/* Legal Section */}
      <Section title={t('settings.legal.title')}>
        <Card className="space-y-0 divide-y divide-border" padding="none">
          {LEGAL_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                to={link.href}
                className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
              >
                <Icon size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground flex-1">
                  {t(link.labelKey)}
                </span>
                <CaretRight size={16} className="text-muted-foreground" />
              </Link>
            );
          })}
        </Card>
      </Section>

      <BugReportModal open={isBugReportOpen} onOpenChange={setIsBugReportOpen} />

      <Dialog open={isAlphaCodeModalOpen} onOpenChange={handleAlphaCodeModalOpenChange}>
        <DialogContent className="max-w-sm p-5">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Flask size={20} weight="regular" />
              </div>
              <DialogTitle>{t('settings.about.alphaCodeTitle')}</DialogTitle>
            </div>
            <DialogDescription>{t('settings.about.alphaCodeDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUnlockAlpha} className="mt-4 space-y-3">
            <label
              htmlFor="alpha-unlock-code"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t('settings.about.alphaCodeLabel')}
            </label>
            <input
              id="alpha-unlock-code"
              type="password"
              value={alphaUnlockCode}
              onChange={(event) => {
                setAlphaUnlockCode(event.target.value);
                if (alphaUnlockError) setAlphaUnlockError(false);
              }}
              placeholder={t('settings.about.alphaCodePlaceholder')}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              {...nonAuthInputProps}
            />
            {alphaUnlockError && (
              <p className="text-xs text-red-500">
                {t('settings.about.alphaCodeInvalid', 'Invalid code. Try again.')}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => handleAlphaCodeModalOpenChange(false)}
                className="h-10 px-4 rounded-xl border border-border bg-background hover:bg-secondary text-foreground text-sm font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
              >
                {t('common.activate')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
