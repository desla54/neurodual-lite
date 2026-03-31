import { useMountEffect } from '@neurodual/ui';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';

interface UseNbackTextureStateOptions {
  readonly audioSyncPreset: string;
  readonly hasSeenPinkNoiseToast: boolean;
  readonly setHasSeenPinkNoiseToast: (seen: boolean) => void;
  readonly phase: string;
}

interface UseNbackTextureStateResult {
  readonly showPinkNoiseBanner: boolean;
  readonly dismissPinkNoiseBanner: () => void;
  readonly textureMuted: boolean;
  readonly markTextureMuted: () => void;
}

export function useNbackTextureState({
  audioSyncPreset,
  hasSeenPinkNoiseToast,
  setHasSeenPinkNoiseToast,
  phase,
}: UseNbackTextureStateOptions): UseNbackTextureStateResult {
  const [showPinkNoiseBanner, setShowPinkNoiseBanner] = useState(false);
  const pinkNoiseBannerShownRef = useRef(false);
  const [textureMuted, setTextureMuted] = useState(false);
  const textureMutedRef = useRef(false);

  useLayoutEffect(() => {
    if (
      audioSyncPreset !== 'default' &&
      !hasSeenPinkNoiseToast &&
      !pinkNoiseBannerShownRef.current
    ) {
      pinkNoiseBannerShownRef.current = true;
      setHasSeenPinkNoiseToast(true);
      setShowPinkNoiseBanner(true);
    }
  }, [audioSyncPreset, hasSeenPinkNoiseToast, setHasSeenPinkNoiseToast]);

  useLayoutEffect(() => {
    if (phase !== 'idle' && showPinkNoiseBanner) {
      setShowPinkNoiseBanner(false);
    }
  }, [phase, showPinkNoiseBanner]);

  useLayoutEffect(() => {
    if (!textureMuted || phase !== 'idle') return;

    useSettingsStore.getState().setPinkNoiseLevel(0);
    useSettingsStore.getState().setAudioSyncPreset('default');
  }, [textureMuted, phase]);

  useMountEffect(() => {
    return () => {
      if (!textureMutedRef.current) return;
      useSettingsStore.getState().setPinkNoiseLevel(0);
      useSettingsStore.getState().setAudioSyncPreset('default');
    };
  });

  const dismissPinkNoiseBanner = useCallback(() => {
    setShowPinkNoiseBanner(false);
  }, []);

  const markTextureMuted = useCallback(() => {
    textureMutedRef.current = true;
    setTextureMuted(true);
  }, []);

  return {
    showPinkNoiseBanner,
    dismissPinkNoiseBanner,
    textureMuted,
    markTextureMuted,
  };
}
