import { useOnMountReset } from './use-on-mount-reset';

interface UseTraceStoreLifecycleOptions {
  readonly initFromSettings: () => void;
  readonly resetQuitModal: () => void;
  readonly resetSettingsOverlay: () => void;
  readonly resetStore: () => void;
}

export function useTraceStoreLifecycle({
  initFromSettings,
  resetQuitModal,
  resetSettingsOverlay,
  resetStore,
}: UseTraceStoreLifecycleOptions): void {
  useOnMountReset({
    onMount: () => {
      initFromSettings();
      resetQuitModal();
      resetSettingsOverlay();
    },
    onUnmount: resetStore,
  });
}
