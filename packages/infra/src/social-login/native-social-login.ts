/**
 * Native Social Login Adapter
 *
 * Uses @capgo/capacitor-social-login for native Google/Apple sign-in on mobile.
 * Returns ID tokens that can be exchanged with Supabase via signInWithIdToken.
 */

import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { authLog } from '../logger';

let initialized = false;
let initPromise: Promise<void> | null = null;
const initializedProviders: Partial<Record<'google' | 'apple', true>> = {};

export interface NativeSocialLoginConfig {
  googleWebClientId?: string;
  /**
   * Apple "clientId" for the plugin initializer.
   *
   * - iOS: not used at OS level; required by the plugin to enable the provider.
   * - Android: required (and typically must match your Apple Service ID).
   */
  appleClientId?: string;
  /**
   * Apple redirect URL (Android only, plugin uses OAuth flow).
   *
   * Note: Apple on Android requires a server-capable redirect URL.
   */
  appleRedirectUrl?: string;
}

async function awaitInitIfInProgress(timeoutMs: number): Promise<void> {
  if (initialized) return;
  if (!initPromise) return;

  const started = Date.now();
  try {
    await Promise.race([
      initPromise,
      new Promise<void>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Native social login init timeout')), timeoutMs),
      ),
    ]);
  } catch (error) {
    authLog.warn(
      `Native social login init did not complete (after ${Date.now() - started}ms):`,
      error,
    );
  }
}

/**
 * Initialize native social login plugin.
 * Must be called once at app startup on native platforms.
 *
 * @param config - Configuration with Google Web Client ID
 */
export async function initNativeSocialLogin(config: NativeSocialLoginConfig): Promise<void> {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    authLog.debug('Not a native platform, skipping social login init');
    return;
  }

  const platform = Capacitor.getPlatform();
  const initConfig: Parameters<typeof SocialLogin.initialize>[0] = {};

  if (config.googleWebClientId) {
    initConfig.google = { webClientId: config.googleWebClientId };
  }

  // Apple native sign-in is iOS-only in our app. On Android, the plugin uses an OAuth flow that
  // requires a server-capable redirect URL (POST callback), which our SPA route can't handle.
  if (platform === 'ios') {
    initConfig.apple = {
      clientId: config.appleClientId ?? 'com.neurodual.app',
    };
  } else if (platform === 'android' && config.appleClientId && config.appleRedirectUrl) {
    initConfig.apple = {
      clientId: config.appleClientId,
      redirectUrl: config.appleRedirectUrl,
    };
  }

  if (!initConfig.google && !initConfig.apple) {
    console.warn('[SocialLogin] No provider config provided - native social login disabled');
    authLog.warn('No provider config provided - native social login disabled');
    return;
  }

  console.log(
    `[SocialLogin] Initializing (platform=${platform}, google=${Boolean(initConfig.google)}, apple=${Boolean(initConfig.apple)})`,
  );

  initPromise = (async () => {
    try {
      await SocialLogin.initialize(initConfig);
      initialized = true;
      if (initConfig.google) initializedProviders.google = true;
      if (initConfig.apple) initializedProviders.apple = true;
      console.log('[SocialLogin] Initialized successfully');
    } catch (error) {
      console.error('[SocialLogin] Init failed:', error);
      authLog.error('Failed to initialize native social login:', error);
      authLog.error(
        'Init error details:',
        JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
      );
      throw error;
    }
  })();

  try {
    await initPromise;
  } finally {
    // Allow retry if init failed.
    if (!initialized) initPromise = null;
  }
}

/**
 * Check if native social login is available.
 */
export function isNativeSocialLoginAvailable(): boolean {
  return Capacitor.isNativePlatform() && initialized;
}

export function isNativeSocialLoginProviderAvailable(provider: 'google' | 'apple'): boolean {
  return Capacitor.isNativePlatform() && initialized && initializedProviders[provider] === true;
}

export interface NativeLoginResult {
  success: true;
  provider: 'google' | 'apple';
  idToken: string;
}

export interface NativeLoginError {
  success: false;
  error: string;
  cancelled?: boolean;
}

export type NativeLoginResponse = NativeLoginResult | NativeLoginError;

/**
 * Perform native Google sign-in.
 * Returns an ID token that can be used with Supabase signInWithIdToken.
 */
export async function nativeGoogleLogin(): Promise<NativeLoginResponse> {
  authLog.info(
    `nativeGoogleLogin called (initialized=${initialized}, isNative=${Capacitor.isNativePlatform()})`,
  );

  // If initialization is in progress (app just started), wait briefly instead of falling back.
  await awaitInitIfInProgress(2500);

  if (!isNativeSocialLoginProviderAvailable('google')) {
    authLog.warn('Native social login NOT available');
    return { success: false, error: 'Native social login not available' };
  }

  try {
    authLog.info('Calling SocialLogin.login({ provider: "google" })...');
    const result = await SocialLogin.login({
      provider: 'google',
      options: {},
    });

    authLog.info('Google login result received, keys:', Object.keys(result.result || {}));

    // Extract ID token from result
    const googleResult = result.result as {
      idToken?: string;
      responseType?: string;
    };

    if (!googleResult?.idToken) {
      authLog.error('No ID token in Google response. Full result:', JSON.stringify(result.result));
      return { success: false, error: 'No ID token received from Google' };
    }

    authLog.info('Got Google ID token successfully');
    return {
      success: true,
      provider: 'google',
      idToken: googleResult.idToken,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    authLog.error('Native Google login failed:', message);
    authLog.error(
      'Full error:',
      JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
    );

    // Check if user cancelled
    const cancelled =
      message.includes('cancel') ||
      message.includes('Cancel') ||
      message.includes('user_cancelled');

    return { success: false, error: message, cancelled };
  }
}

/**
 * Perform native Apple sign-in.
 * Returns an ID token that can be used with Supabase signInWithIdToken.
 */
export async function nativeAppleLogin(): Promise<NativeLoginResponse> {
  await awaitInitIfInProgress(2500);
  if (!isNativeSocialLoginProviderAvailable('apple')) {
    return { success: false, error: 'Native social login not available' };
  }

  try {
    const result = await SocialLogin.login({
      provider: 'apple',
      options: {
        scopes: ['email', 'name'],
      },
    });

    authLog.debug('Apple login result:', result);

    // Extract identity token from result
    const appleResult = result.result as {
      identityToken?: string;
    };

    if (!appleResult?.identityToken) {
      authLog.error('No identity token in Apple response');
      return { success: false, error: 'No identity token received from Apple' };
    }

    return {
      success: true,
      provider: 'apple',
      idToken: appleResult.identityToken,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    authLog.error('Native Apple login failed:', message);

    const cancelled =
      message.includes('cancel') ||
      message.includes('Cancel') ||
      message.includes('user_cancelled');

    return { success: false, error: message, cancelled };
  }
}

/**
 * Sign out from native social login providers.
 */
export async function nativeSocialLogout(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await SocialLogin.logout({ provider: 'google' });
    await SocialLogin.logout({ provider: 'apple' });
  } catch {
    // Ignore logout errors
  }
}
