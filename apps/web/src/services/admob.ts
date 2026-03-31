import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
} from '@capacitor-community/admob';
import { trackEvent } from './analytics';

// Production IDs — used only in `bun build:native` (mode === 'native')
const PROD_AD_UNIT_ANDROID = 'ca-app-pub-9360326805918972/7917673258';

// Google's official test interstitial ID — safe to use during dev/staging
const TEST_AD_UNIT_ANDROID = 'ca-app-pub-3940256099942544/1033173712';

const IS_PROD_NATIVE = import.meta.env.MODE === 'native';
const AD_UNIT_ID = IS_PROD_NATIVE ? PROD_AD_UNIT_ANDROID : TEST_AD_UNIT_ANDROID;

const SESSION_COUNT_KEY = 'nd_ad_session_count';
const LAST_AD_TIME_KEY = 'nd_ad_last_shown';

/** Show an interstitial every N completed sessions */
const AD_FREQUENCY = 3;

/** Minimum time between two ads (10 minutes) */
const MIN_COOLDOWN_MS = 10 * 60 * 1000;

/** Max retry attempts after a failed load */
const MAX_LOAD_RETRIES = 3;

/** Backoff delays in ms for each retry attempt */
const RETRY_DELAYS = [2_000, 5_000, 15_000];

/** How long to wait for a late-loading ad before giving up */
const AD_WAIT_TIMEOUT_MS = 4_000;

class AdMobService {
  private initialized = false;
  private consentHandled = false;
  private adLoaded = false;
  private loading = false;
  private loadRetries = 0;

  async init(): Promise<void> {
    // Only runs on Android native — no-op on web or iOS
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    if (this.initialized) return;

    try {
      await AdMob.initialize({
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        maxAdContentRating: MaxAdContentRating.General,
      });

      this.initialized = true;
      this.registerListeners();

      // Preload the first ad — GDPR consent is deferred to the first maybeShow() call
      // (i.e. first return to Home after completing a session)
      await this.load();
    } catch (e) {
      console.warn('[AdMob] init failed', e);
    }
  }

  /** Request GDPR consent if needed. Called once on the first maybeShow() (first return to Home after a session). */
  private async ensureConsent(): Promise<void> {
    if (this.consentHandled) return;
    this.consentHandled = true;

    try {
      const consentInfo = await AdMob.requestConsentInfo();
      if (
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === AdmobConsentStatus.REQUIRED
      ) {
        await AdMob.showConsentForm();
      }
    } catch (e) {
      console.warn('[AdMob] consent failed', e);
    }
  }

  private registerListeners(): void {
    AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
      this.adLoaded = true;
      this.loading = false;
      this.loadRetries = 0;
    });

    AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
      this.adLoaded = false;
      this.loading = false;
      this.scheduleRetry();
    });

    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      this.adLoaded = false;
      // Preload the next ad as soon as the current one is dismissed
      setTimeout(() => this.load(), 500);
    });
  }

  private scheduleRetry(): void {
    if (this.loadRetries >= MAX_LOAD_RETRIES) return;
    const delay = RETRY_DELAYS[this.loadRetries] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
    this.loadRetries++;
    setTimeout(() => this.load(), delay);
  }

  private async load(): Promise<void> {
    if (!this.initialized || this.loading || this.adLoaded) return;
    this.loading = true;
    try {
      await AdMob.prepareInterstitial({ adId: AD_UNIT_ID });
    } catch (e) {
      this.loading = false;
      console.warn('[AdMob] load failed', e);
      this.scheduleRetry();
    }
  }

  /**
   * Wait for an in-flight ad load to finish, up to AD_WAIT_TIMEOUT_MS.
   * Returns true if the ad became ready, false on timeout.
   */
  private waitForLoad(): Promise<boolean> {
    if (this.adLoaded) return Promise.resolve(true);
    if (!this.loading) {
      this.load();
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.adLoaded) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - start >= AD_WAIT_TIMEOUT_MS) {
          clearInterval(interval);
          resolve(false);
        }
      }, 200);
    });
  }

  private incrementSessionCount(): number {
    const current = Number(localStorage.getItem(SESSION_COUNT_KEY) ?? 0);
    const next = current + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(next));
    return next;
  }

  private isOnCooldown(): boolean {
    const last = Number(localStorage.getItem(LAST_AD_TIME_KEY) ?? 0);
    return Date.now() - last < MIN_COOLDOWN_MS;
  }

  /**
   * Call after each session report is acknowledged (Back to Home / Play Again).
   * Shows an interstitial if all conditions are met:
   * - User is not premium
   * - Running on Android native
   * - Ad is preloaded (or becomes ready within 4s)
   * - Frequency and cooldown conditions are satisfied
   */
  async maybeShow(hasPremium: boolean): Promise<void> {
    const track = (result: string, extra?: { waited_ms?: number }) => {
      trackEvent('ad_opportunity', {
        result: result as Parameters<typeof trackEvent<'ad_opportunity'>>[1]['result'],
        session_count: Number(localStorage.getItem(SESSION_COUNT_KEY) ?? 0),
        ad_loaded: this.adLoaded,
        ...extra,
      });
    };

    if (hasPremium) {
      track('skipped_premium');
      return;
    }
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      track('skipped_not_native');
      return;
    }
    if (!this.initialized) {
      track('skipped_not_initialized');
      return;
    }

    // Show GDPR consent form on the first post-session return to Home
    await this.ensureConsent();

    if (this.isOnCooldown()) {
      track('skipped_cooldown');
      return;
    }

    const count = this.incrementSessionCount();
    if (count % AD_FREQUENCY !== 0) {
      track('skipped_frequency');
      return;
    }

    // Ad ready → show immediately
    if (this.adLoaded) {
      try {
        localStorage.setItem(LAST_AD_TIME_KEY, String(Date.now()));
        await AdMob.showInterstitial();
        track('shown');
      } catch (e) {
        console.warn('[AdMob] show failed', e);
        track('show_error');
      }
      return;
    }

    // Ad not ready → wait up to 4s for it to load
    const waitStart = Date.now();
    const ready = await this.waitForLoad();
    const waitedMs = Date.now() - waitStart;

    if (ready) {
      try {
        localStorage.setItem(LAST_AD_TIME_KEY, String(Date.now()));
        await AdMob.showInterstitial();
        track('waited_and_shown', { waited_ms: waitedMs });
      } catch (e) {
        console.warn('[AdMob] show failed after wait', e);
        track('show_error', { waited_ms: waitedMs });
      }
    } else {
      track('waited_timeout', { waited_ms: waitedMs });
    }
  }
}

export const adMobService = new AdMobService();
