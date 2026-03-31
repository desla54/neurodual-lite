import { useCallback, useEffect, useRef, useState } from 'react';

type ReplayStatus = 'ready' | 'playing' | 'paused' | 'awaitingCompletion' | 'finished';

interface UseFocusTimelineOverlayOptions {
  /** Current replay status */
  status: ReplayStatus | string;
  /** Whether the replay is in a finished-like state (may include awaitingCompletion) */
  isFinished: boolean;
  /** Toggle play/pause on the underlying replay */
  togglePlayPause: () => void;
  /** Whether a countdown is currently active (interactive only) */
  isCountingDown?: boolean;
}

interface UseFocusTimelineOverlayReturn {
  showOverlay: boolean;
  wasPlaying: boolean;
  open: () => void;
  close: () => void;
  resume: () => void;
  /** Direct setter for components that need to reset overlay state externally (e.g. restart) */
  setShowOverlay: (show: boolean) => void;
  setWasPlaying: (was: boolean) => void;
  /** Ref for debounce guard — reads below this timestamp should ignore close events */
  ignoreCloseUntilRef: { current: number };
}

export function useFocusTimelineOverlay({
  status,
  isFinished,
  togglePlayPause,
  isCountingDown = false,
}: UseFocusTimelineOverlayOptions): UseFocusTimelineOverlayReturn {
  const [showOverlay, setShowOverlay] = useState(false);
  const [pauseDismissed, setPauseDismissed] = useState(false);
  const [wasPlaying, setWasPlaying] = useState(false);
  const closeLockUntilRef = useRef(0);
  const ignoreCloseUntilRef = useRef(0);

  const open = useCallback(() => {
    if (isFinished) return;
    if (Date.now() < closeLockUntilRef.current) return;
    if (showOverlay) return;
    ignoreCloseUntilRef.current = Date.now() + 300;
    setPauseDismissed(false);
    const wasPlaying = status === 'playing';
    setWasPlaying(wasPlaying);
    if (wasPlaying) {
      togglePlayPause();
    }
    setShowOverlay(true);
  }, [isFinished, showOverlay, status, togglePlayPause]);

  const close = useCallback(() => {
    setShowOverlay(false);
    setPauseDismissed(true);
    closeLockUntilRef.current = Date.now() + 250;
    if (wasPlaying && status === 'paused') {
      togglePlayPause();
    }
    setWasPlaying(false);
  }, [wasPlaying, status, togglePlayPause]);

  const resume = useCallback(() => {
    setShowOverlay(false);
    setPauseDismissed(false);
    closeLockUntilRef.current = Date.now() + 250;
    setWasPlaying(false);
    if (status === 'paused' || status === 'ready') {
      togglePlayPause();
    }
  }, [status, togglePlayPause]);

  // Auto-open timeline overlay whenever replay is paused (flow continuity).
  useEffect(() => {
    if (status !== 'paused') return;
    if (showOverlay) return;
    if (pauseDismissed) return;
    if (isFinished || isCountingDown) return;
    setWasPlaying(false);
    ignoreCloseUntilRef.current = Date.now() + 300;
    setShowOverlay(true);
  }, [status, showOverlay, pauseDismissed, isFinished, isCountingDown]);

  // Reset dismissal flag when playback resumes.
  useEffect(() => {
    if (status === 'playing') {
      setPauseDismissed(false);
    }
  }, [status]);

  // Ensure timeline overlay never masks end-of-run validation/report.
  useEffect(() => {
    if (!isFinished || !showOverlay) return;
    setShowOverlay(false);
    setWasPlaying(false);
    setPauseDismissed(false);
  }, [isFinished, showOverlay]);

  return {
    showOverlay,
    wasPlaying,
    open,
    close,
    resume,
    setShowOverlay,
    setWasPlaying,
    ignoreCloseUntilRef,
  };
}
