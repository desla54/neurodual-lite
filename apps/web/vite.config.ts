import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
// import { devLogsPlugin } from './vite-plugin-dev-logs'; // Disabled - causes HMR issues

// Read APP_VERSION from thresholds.ts to keep Sentry release in sync
function getAppVersion(): string {
  const thresholdsPath = path.resolve(__dirname, '../../packages/logic/src/specs/thresholds.ts');
  const content = fs.readFileSync(thresholdsPath, 'utf-8');
  const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] ?? '0.0.0';
}

// Read Android versionName from Gradle so web/native About screen stay aligned.
function getAndroidVersionName(): string | null {
  const gradlePath = path.resolve(__dirname, './android/app/build.gradle');

  try {
    const content = fs.readFileSync(gradlePath, 'utf-8');
    const match = content.match(/versionName\s+['"]([^'"]+)['"]/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Preload Latin font (critical for LCP - font swap causes layout shift)
 */
function fontPreloadPlugin(): Plugin {
  return {
    name: 'font-preload',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const bundle = ctx.bundle;
      if (!bundle) return html;

      // Find Latin font file (most users need this subset)
      const fontFile = Object.keys(bundle).find(
        (name) => name.includes('manrope-latin-wght-normal') && name.endsWith('.woff2'),
      );

      if (!fontFile) return html;

      return {
        html,
        tags: [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${fontFile}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: 'anonymous',
            },
            injectTo: 'head',
          },
        ],
      };
    },
  };
}

// Sync package.json version with APP_VERSION so it never drifts.
// Runs once at Vite config time (dev, build, build:native…).
function syncPackageJsonVersion(version: string): void {
  const pkgPath = path.resolve(__dirname, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version !== version) {
      pkg.version = version;
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  } catch {
    // Non-critical — don't break the build
  }
}

function computeProjectionHash(): string {
  try {
    const repoRoot = path.resolve(__dirname, '../..');
    const logicRoot = path.resolve(repoRoot, 'packages/logic/src');

    const files: string[] = [];
    const walk = (dir: string) => {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.ts')) continue;
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
        files.push(fullPath);
      }
    };

    walk(logicRoot);

    // Include infra projection glue that influences session_summaries semantics.
    // When these files change, we want to invalidate projection checkpoints so
    // existing devices replay + repair their derived read-models automatically.
    const extraFiles = [
      path.resolve(repoRoot, 'packages/infra/src/history/history-projection.ts'),
      path.resolve(repoRoot, 'packages/infra/src/projections/session-summaries-projection.ts'),
    ];
    for (const fullPath of extraFiles) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) files.push(fullPath);
      } catch {
        // Best-effort: some builds/tests may not have the full repo layout.
      }
    }

    // Deterministic ordering + stable paths across OSes
    const uniqueFiles = Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));

    const hash = crypto.createHash('sha256');
    for (const fullPath of uniqueFiles) {
      const rel = path.relative(repoRoot, fullPath).replaceAll('\\', '/');
      hash.update(rel);
      hash.update('\0');
      hash.update(fs.readFileSync(fullPath));
      hash.update('\0');
    }

    return hash.digest('hex').slice(0, 12);
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  // native and production modes should have the same optimizations
  const isProduction = mode === 'production' || mode === 'native';
  const isNative = mode === 'native';
  const analyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';
  const disableHmr =
    !isProduction &&
    (process.env.VITE_DISABLE_HMR === '1' || process.env.VITE_DISABLE_HMR === 'true');
  const appDisplayVersion = getAndroidVersionName() ?? getAppVersion();

  // Keep package.json in sync with the canonical APP_VERSION
  syncPackageJsonVersion(getAppVersion());

  // React Compiler can slow down dev HMR significantly and has been a source of
  // Fast Refresh edge-cases. Keep it opt-in during dev.
  const reactCompilerEnabled =
    isProduction ||
    process.env.VITE_REACT_COMPILER === '1' ||
    process.env.VITE_REACT_COMPILER === 'true';

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appDisplayVersion),
      __DEV_LOGS_ENABLED__: JSON.stringify(false),
      // In dev, use a stable hash so projection versions don't change on every
      // Vite restart (which would trigger a full replay of all events → ~4s freeze).
      // In production/native, compute the real hash for automatic projection upgrades.
      __PROJECTION_HASH__: JSON.stringify(
        isProduction || isNative ? computeProjectionHash() : 'dev',
      ),
    },
    plugins: [
      react({
        // Exclude workers from React transform (no window in worker context)
        // Pattern matches both -worker.ts and .worker.ts
        exclude: [/[-.]worker\.(ts|js)$/],
        babel: {
          plugins: reactCompilerEnabled ? ['babel-plugin-react-compiler'] : [],
        },
      }),
      tailwindcss(),
      fontPreloadPlugin(),
      // devLogsPlugin(), // Temporarily disabled - causes HMR issues
      ...(!isNative
        ? [
            VitePWA({
              // Prompt on new version instead of auto-refreshing after load.
              // This avoids the "page refresh 5s after launch" UX when a SW update lands.
              registerType: 'prompt',
              includeAssets: [
                'favicon.ico',
                'icon.svg',
                'icon-192.svg',
                'icon-192.png',
                'icon-512.png',
                'icon-512-maskable.png',
                'apple-touch-icon.png',
                // Needed for clean offline navigation (referenced by index.html)
                'module-error-handler.js',
                'theme-boot.js',
                // Non-hashed but critical runtime assets
                'wa-sqlite-async.wasm',
                'models/emnist-letters/model.json',
                'models/emnist-letters/group1-shard1of1.bin',
                'models/emnist-digits/model.json',
                'models/emnist-digits/group1-shard1of1.bin',
              ],
              manifest: {
                // Stable ID ensures consistent install prompt across deployments
                id: '/neurodual/',
                name: 'NeuroDual - Brain Training',
                short_name: 'NeuroDual',
                description:
                  'Entraînement cérébral : exercices cognitifs variés pour améliorer mémoire, attention et fonctions exécutives.',
                lang: 'fr',
                theme_color: '#F0EEE9',
                background_color: '#F0EEE9',
                // display_override for graceful fallback
                display_override: ['standalone', 'minimal-ui'],
                display: 'standalone',
                // We allow rotation at the platform level, and enforce portrait via UI overlay
                // (except for Stats, where landscape improves readability).
                orientation: 'any',
                scope: '/',
                start_url: '/',
                // App categories for store visibility
                categories: ['health', 'education', 'games'],
                // Shortcuts for quick access from app icon context menu
                shortcuts: [
                  {
                    name: 'Dual Catch',
                    short_name: 'Dual Catch',
                    description: 'Mode principal avec scoring SDT',
                    url: '/nback?mode=dual-catch',
                    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
                  },
                  {
                    name: 'Statistiques',
                    short_name: 'Stats',
                    description: 'Voir mes performances',
                    url: '/stats',
                    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
                  },
                  {
                    name: 'Tutoriel',
                    short_name: 'Tutoriel',
                    description: 'Apprendre les exercices',
                    url: '/tutorial',
                    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
                  },
                ],
                // PNG icons first for better browser compatibility (SVG not universally supported for install)
                icons: [
                  {
                    src: '/icon-192.png',
                    sizes: '192x192',
                    type: 'image/png',
                  },
                  {
                    src: '/icon-512.png',
                    sizes: '512x512',
                    type: 'image/png',
                  },
                  {
                    // Maskable icon for Android adaptive icons - 'any maskable' for universal compatibility
                    src: '/icon-512-maskable.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable',
                  },
                  // SVG fallbacks for high-DPI displays
                  {
                    src: '/icon-192.svg',
                    sizes: '192x192',
                    type: 'image/svg+xml',
                  },
                  {
                    src: '/icon.svg',
                    sizes: '512x512',
                    type: 'image/svg+xml',
                  },
                ],
              },
              workbox: {
                // Do NOT precache HTML: it is the most common cause of "stuck on an old version"
                // when a Service Worker update is delayed. We cache navigations with NetworkFirst
                // instead (see runtimeCaching below) to keep offline support while always
                // fetching the latest HTML when online.
                globPatterns: ['**/*.{js,css,woff2,png,svg,ico}'],
                // Override vite-plugin-pwa default ("index.html") so Workbox doesn't install
                // a NavigationRoute that always serves a cached index.html.
                navigateFallback: undefined,
                // With `registerType: 'prompt'`, keep the new SW waiting until the user
                // accepts a reload (avoids mid-session asset mismatches).
                skipWaiting: false,
                clientsClaim: false,
                // Remove outdated caches from previous versions
                cleanupOutdatedCaches: true,
                // Vite already hashes filenames, no need for Workbox to add cache-busting
                dontCacheBustURLsMatching: /-[a-f0-9]{8}\./,
                runtimeCaching: [
                  {
                    // HTML navigations: always try network first so deployments propagate
                    // immediately; fallback to cache for offline usage.
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'html-cache',
                      networkTimeoutSeconds: 3,
                      cacheableResponse: { statuses: [0, 200] },
                      expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 60 * 60 * 24, // 1 day
                      },
                    },
                  },
                  {
                    // JS/CSS build assets are content-hashed; prefer cache to avoid 404s during deployments.
                    urlPattern: /\/assets\/.*\.(?:js|css)$/,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'assets-cache',
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                      expiration: {
                        maxEntries: 250,
                        maxAgeSeconds: 60 * 60 * 24 * 60, // 60 days
                      },
                    },
                  },
                  {
                    // Images: StaleWhileRevalidate (fast from cache, update in background)
                    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                    handler: 'StaleWhileRevalidate',
                    options: {
                      cacheName: 'image-cache',
                      expiration: {
                        maxEntries: 100,
                        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                      },
                    },
                  },
                  {
                    // Cache WASM files (wa-sqlite) - immutable, cache forever
                    urlPattern: /\.wasm$/,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'wasm-cache',
                      expiration: {
                        maxEntries: 10,
                        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                      },
                    },
                  },
                  {
                    // Cache sounds on-demand for offline training (avoid precaching hundreds of files)
                    // Support both .opus and .ogg containers (sync preset currently uses .ogg).
                    urlPattern: /\/sounds\/.*\.(?:opus|ogg)$/,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'sound-cache',
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                      expiration: {
                        maxEntries: 1000,
                        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                      },
                    },
                  },
                  {
                    // Cache fonts - immutable, cache forever
                    urlPattern: /\.woff2$/,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'font-cache',
                      expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                      },
                    },
                  },
                ],
              },
              devOptions: {
                enabled: false, // Disable in dev mode
              },
            }),
          ]
        : []),
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
            visualizer({
              filename: 'dist/stats.json',
              template: 'raw-data',
            }),
          ]
        : []),
      // Sentry plugin MUST be last - uploads sourcemaps then deletes them
      ...(isProduction && process.env.SENTRY_AUTH_TOKEN
        ? [
            sentryVitePlugin({
              org: 'abdeslam-no',
              project: 'neurodual',
              authToken: process.env.SENTRY_AUTH_TOKEN,
              // Must match the release in sentry.ts: `neurodual@${APP_VERSION}`
              release: {
                name: `neurodual@${getAppVersion()}`,
                // Must match sentry.ts `dist` for web events, otherwise sourcemap remapping is skipped.
                dist: 'web',
              },
              sourcemaps: {
                filesToDeleteAfterUpload: ['./dist/**/*.map'],
              },
              // Silence upload logs unless there's an error
              silent: true,
            }),
          ]
        : []),
    ],
    // Use relative paths for Tauri, absolute for web
    base: process.env.TAURI_ENV_PLATFORM ? './' : '/',

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Build-time alias: native builds must not import PWA modules.
        '@pwa-prompts': path.resolve(
          __dirname,
          `./src/components/pwa-prompts.${isNative ? 'native' : 'web'}.tsx`,
        ),
        '@neurodual/ui': path.resolve(__dirname, '../../packages/ui/src'),
      },
    },

    // Strip console.log/debug/info in production (keep warn/error)
    esbuild: {
      drop: isProduction ? ['debugger'] : [],
      pure: isProduction ? ['console.log', 'console.info', 'console.debug'] : [],
    },

    // Worker configuration for SQLite Web Worker
    worker: {
      format: 'es', // Required for code-splitting in worker (wa-sqlite uses imports)
    },

    build: {
      target: 'es2022',
      // Avoid Vite injecting eager `__vitePreload` wrappers that can pull large
      // dependency chunks (PowerSync/wa-sqlite) into the entry graph.
      modulePreload: false,
      // 'hidden' generates sourcemaps but doesn't expose them publicly (no sourceMappingURL comment)
      // They're uploaded to Sentry for readable stack traces, then deleted
      // native mode: no sourcemaps (Capacitor doesn't need them, reduces AAB size)
      sourcemap: mode === 'production' ? 'hidden' : mode !== 'native',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vite internal helper used to wrap dynamic imports; keep it tiny and
            // independent so it doesn't get "hosted" inside a heavy vendor chunk.
            if (id.includes('vite/preload-helper') || id.includes('\u0000vite/preload-helper')) {
              return 'vite-preload';
            }
            // React Router
            if (id.includes('react-router')) {
              return 'react-router';
            }
            // Note: React/React-DOM are NOT chunked manually - let Vite handle them
            // to avoid circular dependency issues with i18n
            // PowerSync SDK (keep out of entry chunk)
            if (id.includes('@powersync/web') || id.includes('/@powersync/web/')) {
              return 'powersync-web';
            }
            if (id.includes('@powersync/capacitor') || id.includes('/@powersync/capacitor/')) {
              return 'powersync-capacitor';
            }
            // XState - state machines
            if (id.includes('xstate')) {
              return 'xstate';
            }
            // wa-sqlite - isolate the WASM bundle
            if (id.includes('wa-sqlite')) {
              return 'wa-sqlite';
            }
            // Charts
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'recharts';
            }
            // Animation
            if (id.includes('gsap')) {
              return 'gsap';
            }
            // Framer Motion
            if (id.includes('framer-motion')) {
              return 'framer';
            }
            // i18n
            if (id.includes('i18next')) {
              return 'i18n';
            }
            // Supabase
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            // Sentry
            if (id.includes('@sentry')) {
              return 'sentry';
            }
            // Radix UI
            if (id.includes('@radix-ui')) {
              return 'radix';
            }
            // TanStack
            if (id.includes('@tanstack')) {
              return 'tanstack';
            }
            // Zod validation
            if (id.includes('/zod/')) {
              return 'zod';
            }
            // Phosphor icons
            if (id.includes('@phosphor-icons')) {
              return 'icons';
            }
          },
        },
      },
    },

    optimizeDeps: {
      // async-lock is a CJS dependency of PowerSync that needs to be pre-bundled
      // Use nested dependency syntax since it's a transitive dependency
      include: ['@powersync/web > async-lock'],
      // PowerSync bundles wa-sqlite internally, so we exclude all SQLite-related packages
      // to prevent Vite's optimizer from conflicting with their internal workers
      exclude: ['@powersync/web', '@powersync/capacitor', 'wa-sqlite'],
    },

    assetsInclude: ['**/*.wasm', '**/*.data'],

    server: {
      port: 3000,
      strictPort: true,
      hmr: disableHmr ? false : undefined,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      fs: {
        // Allow serving files from node_modules and packages
        allow: ['../..'],
      },
      watch: {
        // Ignore build outputs and cache to prevent phantom HMR triggers
        // Note: this repo is a Capacitor/Tauri monorepo; native folders can contain
        // huge generated trees (Gradle/Xcode/Tauri) that Vite would otherwise watch.
        ignored: [
          '**/dist/**',
          '**/node_modules/**',
          '**/.git/**',
          '**/coverage/**',
          '**/.cache/**',
          '**/.vite/**',
          '**/.turbo/**',
          '**/*.tsbuildinfo',
          '**/logs/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/android/**',
          '**/ios/**',
          '**/src-tauri/**',
          // Repo-level folders that can be huge/noisy in this monorepo
          '**/archive/**',
          '**/prototypes/**',
          '**/supabase/**',
        ],
      },
    },

    preview: {
      port: 3000,
    },
  };
});
