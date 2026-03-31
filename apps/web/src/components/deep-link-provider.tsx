/**
 * Deep Link Provider
 *
 * Initializes and manages deep link handling for mobile platforms.
 * Listens for incoming URLs (OAuth callbacks, reset-password links, etc.)
 * and navigates to the appropriate route.
 *
 * Uses the router instance directly (not useNavigate) since this component
 * wraps the RouterProvider and thus cannot use router context hooks.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { router } from '../router';
import { useAppPorts } from '../providers';
import type { DeepLinkHandlerPort } from '@neurodual/logic';

interface DeepLinkProviderProps {
  children: ReactNode;
}

export function DeepLinkProvider({ children }: DeepLinkProviderProps): ReactNode {
  const { deepLink } = useAppPorts();
  const handlerRef = useRef<DeepLinkHandlerPort | null>(null);

  useEffect(() => {
    // Initialize deep link handler
    // Uses router.navigate directly since we're outside RouterProvider context
    deepLink
      .setupDeepLinkHandler((path: string) => {
        router.navigate(path, { replace: true });
      })
      .then((handler: DeepLinkHandlerPort) => {
        handlerRef.current = handler;
      });

    // Cleanup on unmount
    return () => {
      if (handlerRef.current) {
        handlerRef.current.dispose();
        handlerRef.current = null;
      }
    };
  }, [deepLink]);

  return <>{children}</>;
}
