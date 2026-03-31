/**
 * PostHog Configuration (No-deps loader)
 *
 * We intentionally avoid adding a new npm dependency here (network-restricted envs),
 * and load the official PostHog JS bundle from the configured host.
 */

import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '@neurodual/logic';
import { env, hasPostHog } from '../env';
import { logger } from '../lib';

type PostHogClient = {
  init: (key: string, options?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
  register: (properties: Record<string, unknown>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    posthog?: PostHogClient;
  }
}

let initPromise: Promise<void> | null = null;
let isInitialized = false;
const pending: Array<(client: PostHogClient) => void> = [];

function getPostHogConfig(): { key: string; host: string } | null {
  if (!hasPostHog) return null;
  const key = env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const host = env.VITE_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
  return { key, host };
}

function getLibraryUrl(host: string): string {
  try {
    const url = new URL(host);
    return `${url.origin}/static/array.js`;
  } catch {
    return `${host.replace(/\/+$/, '')}/static/array.js`;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document is not available'));
      return;
    }

    const existing = document.querySelector(`script[data-posthog="1"][src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('PostHog script failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.dataset['posthog'] = '1';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('PostHog script failed')), {
      once: true,
    });
    document.head.append(script);
  });
}

function flushPending(): void {
  const client = window['posthog'];
  if (!client) return;
  const items = pending.splice(0, pending.length);
  for (const fn of items) {
    try {
      fn(client);
    } catch {
      // ignore
    }
  }
}

export async function initPostHog(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const config = getPostHogConfig();
    if (!config) return;

    if (!import.meta.env.PROD) {
      logger.debug('[PostHog] Disabled in development mode');
      return;
    }

    if (isInitialized) return;

    const libUrl = getLibraryUrl(config.host);
    await loadScript(libUrl);

    const client = window.posthog;
    if (!client) {
      throw new Error('PostHog library loaded but window.posthog is missing');
    }

    client.init(config.key, {
      api_host: config.host,
      person_profiles: 'always',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
      },
    });

    // Register super properties AFTER init (the `loaded` callback fires too early
    // and `register` calls inside it are silently dropped).
    client.register({
      app: 'web',
      app_version: APP_VERSION,
      mode: import.meta.env.MODE,
      platform: Capacitor.getPlatform() || 'web',
    });

    isInitialized = true;
    flushPending();

    logger.debug(`[PostHog] Initialized (host: ${config.host})`);
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

function callOrQueue(fn: (client: PostHogClient) => void): void {
  try {
    const client = window.posthog;
    if (client) {
      fn(client);
      return;
    }
  } catch {
    // ignore
  }
  pending.push(fn);
}

export function postHogIdentify(distinctId: string, properties?: Record<string, unknown>): void {
  callOrQueue((client) => client.identify(distinctId, properties));
}

export function postHogReset(): void {
  callOrQueue((client) => client.reset());
}

export function postHogRegister(properties: Record<string, unknown>): void {
  callOrQueue((client) => client.register(properties));
}

export function postHogCapture(event: string, properties?: Record<string, unknown>): void {
  callOrQueue((client) => client.capture(event, properties));
}
