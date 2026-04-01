/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

type ViteFeatureFlag = 'enabled' | 'disabled' | 'true' | 'false' | '1' | '0';

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_ACTIVATION_API_URL?: string;
  // Feature flags
  readonly VITE_NATIVE_MODE?: ViteFeatureFlag;
  // Donation links
  readonly VITE_PATREON_URL?: string;
  readonly VITE_KOFI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
