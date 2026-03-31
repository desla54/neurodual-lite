/**
 * Session Recovery Gate
 *
 * Wrapper component that checks for recoverable sessions on mount.
 * Shows recovery modal if an interrupted session is detected.
 */

import type { ReactNode } from 'react';
import { useSessionRecovery } from './use-session-recovery';
import { SessionRecoveryModal } from './session-recovery-modal';

export interface SessionRecoveryGateProps {
  children: ReactNode;
}

/**
 * Renders the session recovery modal if a session can be recovered.
 * Place this inside the RouterProvider but outside the Outlet.
 */
export function SessionRecoveryGate({ children }: SessionRecoveryGateProps): ReactNode {
  const { hasRecovery, snapshot, isStale, resume, decline, dismiss } = useSessionRecovery();

  return (
    <>
      {children}
      {hasRecovery && snapshot && (
        <SessionRecoveryModal
          snapshot={snapshot}
          isStale={isStale}
          onResume={resume}
          onStartFresh={decline}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}
