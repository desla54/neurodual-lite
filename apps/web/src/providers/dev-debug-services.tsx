import {
  createProgressionAdapter,
  getPersistencePort,
} from '@neurodual/infra';
import type { ReactNode } from 'react';
import { useMountEffect } from '@neurodual/ui';

export function DevDebugServices(): ReactNode {
  useMountEffect(() => {
    if (!import.meta.env.DEV) return;

    const timer = setTimeout(() => {
      let persistence = null;
      try {
        persistence = getPersistencePort();
      } catch {
        persistence = null;
      }

      const debugServices = {
        persistence,
        supabase: null, // Removed in Lite
        powersync: null, // Removed in Lite
        resetPowerSyncAndReload: async () => {
          window.location.reload();
        },
        adapters: {
          progression: persistence ? createProgressionAdapter(persistence) : null,
        },
      };

      (window as unknown as { __neurodual: typeof debugServices }).__neurodual = debugServices;
      console.log('[Dev] Debug services exposed on window.__neurodual');
    }, 2000);

    return () => clearTimeout(timer);
  });

  return null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Cleaning up...');
    void import('@neurodual/infra')
      .then((mod) => mod.resetPersistenceAdapter())
      .catch(console.error);
  });
}
