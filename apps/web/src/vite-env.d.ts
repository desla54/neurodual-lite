/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

type ViteFeatureFlag = 'enabled' | 'disabled' | 'true' | 'false' | '1' | '0';

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_APPLE_CLIENT_ID?: string;
  readonly VITE_REVENUECAT_ANDROID_KEY?: string;
  readonly VITE_REVENUECAT_IOS_KEY?: string;
  // Feature flags
  readonly VITE_PREMIUM_MODE?: ViteFeatureFlag;
  readonly VITE_NATIVE_MODE?: ViteFeatureFlag;
  readonly VITE_XP_REWARDS?: ViteFeatureFlag;
  // Donation links
  readonly VITE_PATREON_URL?: string;
  readonly VITE_KOFI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
