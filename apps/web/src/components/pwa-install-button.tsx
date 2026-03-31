/**
 * PWA Install Button - Home page install prompt
 *
 * Shows a discrete button that morphs into a toast when clicked.
 * Always visible when app is installable (not standalone, not iOS).
 * Uses GSAP for morph animation.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { gsap } from 'gsap';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { useMountEffect } from '@neurodual/ui';

type InstallState = 'hidden' | 'button' | 'expanded' | 'installed';

function canShowInstallButton(): boolean {
  // Check if already installed (standalone mode)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (typeof (navigator as { standalone?: boolean }).standalone === 'boolean' &&
      (navigator as { standalone?: boolean }).standalone === true);

  if (isStandalone) return false;

  // Check if iOS (no beforeinstallprompt support)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) return false;

  return true;
}

export function PWAInstallButton(): ReactNode {
  const { t } = useTranslation();
  const [state, setState] = useState<InstallState>('hidden');
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Check conditions and setup on mount
  useMountEffect(() => {
    // Check if we can show the button (not standalone, not iOS)
    if (!canShowInstallButton()) {
      return;
    }

    // Check if install prompt is available
    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }

    // Listen for late-arriving event
    function handleInstallAvailable() {
      if (window.__pwaInstallPrompt) {
        setInstallPrompt(window.__pwaInstallPrompt);
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

  // Show button immediately when install prompt is available (no delay)
  useEffect(() => {
    if (!installPrompt || state !== 'hidden') return;

    setState('button');

    // Animate button appearance
    if (buttonRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' },
      );
    }
  }, [installPrompt, state]);

  // Handle button click - morph to expanded card
  const handleExpand = () => {
    if (state !== 'button' || !buttonRef.current || !cardRef.current) return;

    const button = buttonRef.current;
    const card = cardRef.current;

    // Get button position for morph origin
    const buttonRect = button.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (!containerRect) return;

    // Calculate relative position
    const originX = buttonRect.left - containerRect.left + buttonRect.width / 2;
    const originY = buttonRect.top - containerRect.top + buttonRect.height / 2;

    // Set transform origin on card
    card.style.transformOrigin = `${originX}px ${originY}px`;

    // Hide button, show card with morph
    const tl = gsap.timeline({
      onComplete: () => setState('expanded'),
    });

    tl.to(button, {
      scale: 0,
      opacity: 0,
      duration: 0.2,
      ease: 'power2.in',
    });

    tl.fromTo(
      card,
      {
        scale: 0,
        opacity: 0,
        display: 'flex',
      },
      {
        scale: 1,
        opacity: 1,
        duration: 0.4,
        ease: 'back.out(1.4)',
      },
      '-=0.1',
    );

    setState('expanded');
  };

  // Handle dismiss - morph back and hide
  const handleDismiss = () => {
    if (!cardRef.current) return;

    gsap.to(cardRef.current, {
      scale: 0.8,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => setState('hidden'),
    });
  };

  // Handle install
  const handleInstall = async () => {
    const prompt = installPrompt as {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    } | null;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === 'accepted') {
      window.__pwaInstallPrompt = null;
      window.__pwaInstallPromptHandled = true;
      setState('installed');
    } else {
      handleDismiss();
    }
  };

  // Don't render if hidden or installed
  if (state === 'hidden' || state === 'installed' || !installPrompt) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative z-40 shrink-0">
      {/* Button state - pill shape matching profile button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleExpand}
        data-capture-control="icon"
        className={`flex items-center justify-center w-11 h-11 bg-white border border-ink/10 rounded-full hover:bg-white/90 active:scale-95 transition duration-200 ${
          state !== 'button' ? 'invisible' : ''
        }`}
        aria-label={t('home.pwa.installButton', 'Install app')}
      >
        <DownloadSimple size={18} weight="bold" className="text-ink" />
      </button>

      {/* Expanded card state - positioned below button */}
      <div
        ref={cardRef}
        className={`surface-card-typography absolute top-14 end-0 w-72 bg-card/85 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4 ${
          state !== 'expanded' ? 'hidden' : 'flex'
        } flex-col gap-3`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-2 end-2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('common.close', 'Close')}
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 pe-6">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <DownloadSimple size={20} weight="bold" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">
              {t('home.pwa.title', 'Install Neurodual')}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('home.pwa.description', 'Full screen, faster, works offline')}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.later', 'Later')}
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className="flex-1 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
          >
            {t('home.pwa.install', 'Install')}
          </button>
        </div>
      </div>
    </div>
  );
}
