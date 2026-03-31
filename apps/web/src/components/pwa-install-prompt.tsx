/**
 * PWA Install Prompt
 *
 * Shows a prompt to install the app when running in browser.
 * Uses the globally captured beforeinstallprompt event from module-error-handler.js
 * (captured before React mounts to avoid race condition).
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { DownloadSimple, X } from '@phosphor-icons/react';
import type { BeforeInstallPromptEvent } from '../types/pwa.d';
import { useMountEffect } from '@neurodual/ui';

export function PWAInstallPrompt(): ReactNode {
  const { t } = useTranslation();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useMountEffect(() => {
    // Don't show PWA install prompt in native Capacitor app
    if (Capacitor.isNativePlatform()) {
      setIsInstalled(true);
      return;
    }

    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS 13+ reports as MacIntel but has touch points
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    setIsIOS(isIOSDevice);

    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari A2HS flag
      (typeof (navigator as unknown as { standalone?: boolean }).standalone === 'boolean' &&
        (navigator as unknown as { standalone?: boolean }).standalone === true);

    if (isStandalone || window.__pwaInstallPromptHandled) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }

    // Check if event was already captured (before React mounted)
    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }

    // Listen for late-arriving event (rare, but possible)
    function handleInstallAvailable() {
      if (window.__pwaInstallPrompt) {
        setInstallPrompt(window.__pwaInstallPrompt);
      }
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener('pwa-install-available', handleInstallAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  });

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
      window.__pwaInstallPrompt = null;
      window.__pwaInstallPromptHandled = true;
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if already installed or dismissed.
  // On iOS, there is no `beforeinstallprompt`, so we show instructions instead.
  if (isInstalled || isDismissed || (!isIOS && !installPrompt)) {
    return null;
  }

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-50 mx-auto max-w-md">
      <div className="flex items-center gap-3 rounded-xl bg-card/85 backdrop-blur-xl border border-border/50 p-4 text-card-foreground shadow-lg">
        <DownloadSimple size={24} weight="bold" className="shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {t('settings.pwa.installTitle', 'Install NeuroDual')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isIOS
              ? t(
                  'settings.pwa.installDescriptionIOS',
                  'On iPhone/iPad: Share → Add to Home Screen',
                )
              : t('settings.pwa.installDescription', 'Full screen, offline, like a real app')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {!isIOS && (
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('settings.pwa.install', 'Installer')}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label={t('settings.pwa.dismiss', 'Ignorer')}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
