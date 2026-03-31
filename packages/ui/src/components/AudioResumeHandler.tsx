'use client';

/**
 * AudioResumeHandler
 *
 * Global handler that automatically re-unlocks audio after iOS suspends
 * the AudioContext when the app goes to background.
 *
 * This component silently restores audio on the first user interaction
 * (tap anywhere on the screen) - no toast or extra action required.
 *
 * Based on best practices from:
 * - https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos
 * - https://github.com/Tonejs/Tone.js/issues/767
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAudio } from '../context/AudioContext';

const INTERACTION_EVENTS = ['touchstart', 'touchend', 'mousedown', 'click'] as const;

/**
 * AudioResumeHandler
 *
 * Place this component near the app root (inside AudioProvider).
 * It will silently handle audio resume after iOS background suspension.
 * Audio restores automatically on the first tap anywhere - no UI shown.
 */
export function AudioResumeHandler() {
  const { state, unlock, isReady } = useAudio();
  const wasInterruptedRef = useRef(false);
  const unlockListenersAttached = useRef(false);

  // Handle unlock on user interaction - silent, no UI
  const handleUnlockInteraction = useCallback(() => {
    if (unlockListenersAttached.current) {
      for (const evt of INTERACTION_EVENTS) {
        document.removeEventListener(evt, handleUnlockInteraction, true);
      }
      unlockListenersAttached.current = false;
    }

    // Fire and forget - don't await, don't block the user interaction
    void unlock();
  }, [unlock]);

  // Single effect: track interrupted flag, attach/detach unlock listeners, clean up on unmount
  useEffect(() => {
    // Track when we enter interrupted state
    if (state === 'interrupted') {
      wasInterruptedRef.current = true;
    }

    // Only act if we came from interrupted state and are now locked
    if (state === 'locked' && wasInterruptedRef.current && !unlockListenersAttached.current) {
      wasInterruptedRef.current = false;

      // Attach listeners to capture any user interaction
      // Use capture phase to intercept before any other handlers
      for (const evt of INTERACTION_EVENTS) {
        document.addEventListener(evt, handleUnlockInteraction, true);
      }
      unlockListenersAttached.current = true;
    }

    // Clean up when ready
    if (isReady && unlockListenersAttached.current) {
      for (const evt of INTERACTION_EVENTS) {
        document.removeEventListener(evt, handleUnlockInteraction, true);
      }
      unlockListenersAttached.current = false;
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (unlockListenersAttached.current) {
        for (const evt of INTERACTION_EVENTS) {
          document.removeEventListener(evt, handleUnlockInteraction, true);
        }
        unlockListenersAttached.current = false;
      }
    };
  }, [state, isReady, handleUnlockInteraction]);

  // This component renders nothing - it just handles audio silently
  return null;
}
