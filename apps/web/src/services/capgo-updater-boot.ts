import { Capacitor } from '@capacitor/core';

const CAPGO_NEXT_RELOAD_GUARD_KEY = '__nd_capgo_next_bundle_reload_id';
const isDevAppBuild =
  import.meta.env['VITE_DEV_APP'] === '1' ||
  import.meta.env['VITE_DEV_APP'] === 'true' ||
  import.meta.env['VITE_DEV_APP'] === 'enabled';

export function initCapgoUpdaterBoot(): void {
  if (!Capacitor.isNativePlatform()) return;

  void import('@capgo/capacitor-updater')
    .then(async ({ CapacitorUpdater }) => {
      if (isDevAppBuild) {
        const current = await CapacitorUpdater.current().catch(() => null);
        const currentBundleId = current?.bundle?.id ?? 'builtin';

        globalThis.localStorage?.removeItem(CAPGO_NEXT_RELOAD_GUARD_KEY);

        if (currentBundleId !== 'builtin') {
          await CapacitorUpdater.reset();
        }
        return;
      }

      // Must be called on every launch to prevent rollback of the current bundle.
      void CapacitorUpdater.notifyAppReady();

      // If an update has already been downloaded and queued as "next", apply it immediately.
      const next = await CapacitorUpdater.getNextBundle().catch(() => null);
      if (!next || next.status !== 'success') return;

      const lastReloadedId = globalThis.localStorage?.getItem(CAPGO_NEXT_RELOAD_GUARD_KEY);
      if (lastReloadedId === next.id) return;

      globalThis.localStorage?.setItem(CAPGO_NEXT_RELOAD_GUARD_KEY, next.id);
      await CapacitorUpdater.reload();
    })
    .catch(() => {
      // Best-effort: never block startup on updater wiring.
    });
}
