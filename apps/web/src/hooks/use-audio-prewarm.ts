import { useMountEffect } from '@neurodual/ui';
import { useEffectEvent, useRef } from 'react';

interface AudioPortLike {
  init: () => Promise<void>;
}

export function useAudioPrewarm(audio: AudioPortLike): () => Promise<void> {
  const audioPrimedRef = useRef(false);
  const audioInitPromiseRef = useRef<Promise<void> | null>(null);
  const initAudio = useEffectEvent(async () => {
    if (audioPrimedRef.current || audioInitPromiseRef.current) return;

    audioInitPromiseRef.current = audio
      .init()
      .then(() => {
        audioPrimedRef.current = true;
      })
      .catch(() => {
        // Some browsers keep audio locked until a stronger gesture.
      })
      .finally(() => {
        audioInitPromiseRef.current = null;
      });
    await audioInitPromiseRef.current;
  });

  useMountEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUserActivation = () => {
      initAudio();
    };

    // Use click rather than pointerdown for the first unlock attempt.
    // Chrome can still reject Web Audio / vibrate on pointerdown before sticky
    // user activation is fully granted for the frame.
    window.addEventListener('click', handleUserActivation, { passive: true });
    return () => {
      window.removeEventListener('click', handleUserActivation);
    };
  });

  return initAudio;
}
