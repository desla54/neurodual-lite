/**
 * HomeOnboardingOverlay — First-launch onboarding for the Home page.
 *
 * Sequence:
 * 1. Intro card: structured protocol (Measure → Train → Re-measure) + free path mention
 * 2. Spotlight on fiches zone (protocol overview)
 * 3. Spotlight on OSpan fiche (pin animation)
 * 4. Spotlight on Ravens fiche (pin animation)
 * 5. Spotlight on Profile fiche (pin animation)
 * 6. Spotlight on Training tab
 */

import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import {
  Hatching,
  Logo,
  SpotlightOverlay,
  type SpotlightStep,
  useMountEffect,
} from '@neurodual/ui';
import { useSettingsStore } from '../../stores';

/** Animate a fiche element into view (pin effect). */
function animateFicheIn(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  gsap.fromTo(
    el,
    { opacity: 0, y: -20, scale: 0.8 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.7)' },
  );
}

/** Hide all fiche elements (called once at start). */
function hideAllFiches() {
  for (const sel of [
    '[data-onboarding-target="fiche-ospan"]',
    '[data-onboarding-target="fiche-ravens"]',
    '[data-onboarding-target="fiche-profile"]',
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) gsap.set(el, { opacity: 0 });
  }
}

/** Show all fiches instantly (called on skip or complete). */
function showAllFiches() {
  for (const sel of [
    '[data-onboarding-target="fiche-ospan"]',
    '[data-onboarding-target="fiche-ravens"]',
    '[data-onboarding-target="fiche-profile"]',
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) gsap.set(el, { opacity: 1, y: 0, scale: 1 });
  }
}

export function HomeOnboardingOverlay(): ReactNode {
  const { t } = useTranslation();
  const setHomeOnboardingCompleted = useSettingsStore((s) => s.setHomeOnboardingCompleted);
  const setHomeTab = useSettingsStore((s) => s.setHomeTab);

  const cardRef = useRef<HTMLDivElement>(null);

  const steps = useMemo<SpotlightStep[]>(
    () => [
      // --- Protocol fiches (core value) ---
      {
        id: 'protocole',
        target: '[data-onboarding-target="fiches"]',
        content: t('home.onboarding.protocole'),
        position: 'bottom',
      },
      {
        id: 'fiche-ospan',
        target: '[data-onboarding-target="fiches"]',
        content: t('home.onboarding.ficheOspan'),
        position: 'bottom',
      },
      {
        id: 'fiche-ravens',
        target: '[data-onboarding-target="fiches"]',
        content: t('home.onboarding.ficheRavens'),
        position: 'bottom',
      },
      {
        id: 'fiche-profile',
        target: '[data-onboarding-target="fiches"]',
        content: t('home.onboarding.ficheProfile'),
        position: 'bottom',
      },
      // --- Training tab (free path) ---
      {
        id: 'tab-training',
        target: '[data-onboarding-target="main-card"]',
        content: t('home.onboarding.tabTraining'),
        position: 'bottom',
      },
      // --- Legacy steps hidden for now ---
      // {
      //   id: 'tab-synergy',
      //   target: '[data-onboarding-target="main-card"]',
      //   content: t('home.onboarding._legacy_tabSynergy'),
      //   position: 'bottom',
      // },
      // {
      //   id: 'tab-journey',
      //   target: '[data-onboarding-target="main-card"]',
      //   content: t('home.onboarding._legacy_tabJourney'),
      //   position: 'bottom',
      // },
      // {
      //   id: 'tab-challenge',
      //   target: '[data-onboarding-target="main-card"]',
      //   content: t('home.onboarding._legacy_tabChallenge'),
      //   position: 'bottom',
      // },
    ],
    [t],
  );

  // Animate fiches and switch tabs on step change
  const handleStepChange = useCallback(
    (_stepIndex: number, stepId: string) => {
      // Switch to training tab when reaching that step
      if (stepId === 'tab-training') {
        setHomeTab('free');
      }

      // Fiche pin animations:
      // - protocole: show all 3 so user sees the zone
      // - fiche-ospan: hide all, then pin the first one
      // - fiche-ravens/profile: pin progressively
      if (stepId === 'protocole') {
        showAllFiches();
      } else if (stepId === 'fiche-ospan') {
        hideAllFiches();
        setTimeout(() => animateFicheIn('[data-onboarding-target="fiche-ospan"]'), 200);
      } else if (stepId === 'fiche-ravens') {
        animateFicheIn('[data-onboarding-target="fiche-ravens"]');
      } else if (stepId === 'fiche-profile') {
        animateFicheIn('[data-onboarding-target="fiche-profile"]');
      }
    },
    [setHomeTab],
  );

  const [dismissed, setDismissed] = useState(false);

  const handleComplete = useCallback(() => {
    showAllFiches();
    setHomeOnboardingCompleted(true);
    setDismissed(true);
  }, [setHomeOnboardingCompleted]);

  const introMessage = useMemo(
    () => (
      <div className="flex flex-col items-center w-full">
        <Logo variant="icon" size={44} className="text-foreground" />
        <h2 className="mt-3 text-[22px] sm:text-[26px] font-black tracking-tight text-center leading-tight text-woven-text">
          {t('home.onboarding.introTitle')}
        </h2>

        <p className="mt-5 text-[14px] sm:text-[15px] text-woven-text/75 leading-[1.7]">
          {t('home.onboarding.introProtocol')}
        </p>

        <Hatching id="onb-intro-1" className="w-full mt-4 text-woven-text/40" />

        <p className="mt-4 text-[14px] sm:text-[15px] text-woven-text/75 leading-[1.7]">
          <span className="font-bold text-woven-text">{t('home.onboarding.introStep1Label')}</span>
          {' — '}
          {t('home.onboarding.introStep1')}
        </p>

        <Hatching id="onb-intro-2" className="w-full mt-4 text-woven-text/40" />

        <p className="mt-4 text-[14px] sm:text-[15px] text-woven-text/75 leading-[1.7]">
          <span className="font-bold text-woven-text">{t('home.onboarding.introStep2Label')}</span>
          {' — '}
          {t('home.onboarding.introStep2')}
        </p>

        <Hatching id="onb-intro-3" className="w-full mt-4 text-woven-text/40" />

        <p className="mt-4 text-[14px] sm:text-[15px] text-woven-text/75 leading-[1.7]">
          <span className="font-bold text-woven-text">{t('home.onboarding.introStep3Label')}</span>
          {' — '}
          {t('home.onboarding.introStep3')}
        </p>

        <Hatching id="onb-intro-4" className="w-full mt-4 text-woven-text/40" />

        <p className="mt-4 text-[13px] sm:text-[14px] text-woven-text/60 leading-[1.7]">
          {t('home.onboarding.introFreeNote')}
        </p>
      </div>
    ),
    [t],
  );

  const gridRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useMountEffect(() => {
    let attempts = 0;
    const tryResolve = () => {
      const el =
        document.querySelector<HTMLElement>('.home-card-typography') ??
        document.querySelector<HTMLElement>('.surface-card-typography') ??
        document.querySelector<HTMLElement>('[data-testid="home-page"]');
      if (el) {
        gridRef.current = el;
        setReady(true);
      } else if (attempts < 20) {
        attempts++;
        requestAnimationFrame(tryResolve);
      } else {
        gridRef.current = document.body;
        setReady(true);
      }
    };
    tryResolve();
  });

  if (dismissed || !ready) return null;

  return createPortal(
    <div ref={cardRef}>
      <SpotlightOverlay
        steps={steps}
        onComplete={handleComplete}
        onStepChange={handleStepChange}
        introMessage={introMessage}
        introButtonText={t('home.onboarding.introContinue')}
        gridRef={gridRef}
      />
    </div>,
    document.body,
  );
}
