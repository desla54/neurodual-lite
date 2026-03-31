import fs from 'node:fs';
import path from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

// Read APP_VERSION from thresholds.ts (single source of truth)
function getAppVersion(): string {
  const thresholdsPath = path.resolve(__dirname, '../../packages/logic/src/specs/thresholds.ts');
  const content = fs.readFileSync(thresholdsPath, 'utf-8');
  const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? '0.0.0';
}

const config: CapacitorConfig = {
  appId: 'com.neurodual.app',
  appName: 'NeuroDual',
  webDir: 'dist',
  ios: {
    preferredPackageManager: 'cocoapods',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SystemBars: {
      // Inject reliable CSS insets on Android (fixes old WebView safe-area bugs)
      insetsHandling: 'css',
      // DEFAULT follows system dark/light mode during init (before JS loads).
      // updateNativeTheme() overrides with the user's actual preference once React hydrates.
      style: 'DEFAULT',
    },
    Keyboard: {
      resizeOnFullScreen: false,
    },
    SplashScreen: {
      launchShowDuration: 30000,
      launchAutoHide: false,
      launchFadeOutDuration: 0,
      showSpinner: false,
    },
    CapacitorUpdater: {
      autoUpdate: true,
      appReadyTimeout: 30_000,
      // Dev/tester experience: keep everyone on the latest bundle as soon as possible.
      // This may reload the webview when an update is downloaded (including on resume).
      directUpdate: 'always',
      // Preserve the current route when the webview reloads to apply an update.
      keepUrlPathAfterReload: true,
      version: getAppVersion(),
      appId: 'com.neurodual.app',
    },
    CapacitorSQLite: {
      // Android: no encryption (performance)
      androidIsEncryption: false,
      // iOS: store in Library/CapacitorDatabase (not in Documents = no iCloud backup)
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
    },
  },
};

export default config;
