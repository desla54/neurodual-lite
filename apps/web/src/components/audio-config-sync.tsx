/**
 * AudioConfigSync
 *
 * Keeps audio service configuration in sync with user settings.
 * Wrapper component that should be placed near the app root.
 */

import type { ReactNode } from 'react';
import { useAudioConfig } from '../hooks/use-audio-config';

interface AudioConfigSyncProps {
  children: ReactNode;
}

export function AudioConfigSync({ children }: AudioConfigSyncProps) {
  useAudioConfig();
  return <>{children}</>;
}
