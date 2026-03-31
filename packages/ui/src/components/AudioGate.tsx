'use client';

/**
 * AudioGate
 *
 * A gating component that blocks its children until audio is ready.
 * Shows an unlock overlay when audio is locked (browser autoplay policy).
 */

import type { ReactNode } from 'react';
import {
  useAudioReady,
  useAudioState,
  useAudioUnlock,
  useAudioLoadingProgress,
} from '../context/AudioContext';
import { useUITranslations } from '../context/UITranslations';

// =============================================================================
// Types
// =============================================================================

export interface AudioGateProps {
  /** Content to show when audio is ready */
  children: ReactNode;
  /** Custom fallback UI (optional, defaults to UnlockAudioOverlay) */
  fallback?: ReactNode;
  /** Custom loading UI (optional) */
  loadingFallback?: ReactNode;
}

// =============================================================================
// Default Overlay Component
// =============================================================================

function UnlockAudioOverlay({ onUnlock, label }: { onUnlock: () => void; label: string }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onUnlock}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onUnlock();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-4 text-white">
        <div className="text-6xl">🔇</div>
        <p className="text-xl font-medium">{label}</p>
      </div>
    </div>
  );
}

function LoadingOverlay({
  loaded,
  total,
  label,
}: {
  loaded: number;
  total: number;
  label: string;
}) {
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 text-white">
        <div className="text-4xl animate-pulse">🎵</div>
        <p className="text-lg font-medium">{label}</p>
        <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm text-gray-400">
          {loaded} / {total}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// AudioGate Component
// =============================================================================

/**
 * AudioGate
 *
 * Use this component to wrap game pages that require audio.
 * It ensures audio is ready before showing the game UI.
 *
 * @example
 * ```tsx
 * function GamePage() {
 *   return (
 *     <AudioGate>
 *       <ActiveTraining />
 *     </AudioGate>
 *   );
 * }
 * ```
 */
export function AudioGate({ children, fallback, loadingFallback }: AudioGateProps) {
  const state = useAudioState();
  const ready = useAudioReady();
  const unlock = useAudioUnlock();
  const progress = useAudioLoadingProgress();
  const t = useUITranslations();

  // Ready: show children
  if (ready) {
    return <>{children}</>;
  }

  // Loading: show loading overlay
  if (state === 'loading' || state === 'uninitialized') {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }
    return (
      <LoadingOverlay
        loaded={progress?.loaded ?? 0}
        total={progress?.total ?? 0}
        label={t.audioGate.loading}
      />
    );
  }

  // Locked or Interrupted: show unlock overlay
  if (state === 'locked' || state === 'interrupted') {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <UnlockAudioOverlay onUnlock={unlock} label={t.audioGate.tapToEnable} />;
  }

  // Fallback for any other state
  return <>{children}</>;
}
