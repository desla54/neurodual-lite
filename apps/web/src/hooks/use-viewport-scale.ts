/**
 * useViewportScale - Calcule un facteur de scale basé sur la hauteur du viewport
 *
 * Sur desktop, si la hauteur < 700px, on réduit proportionnellement.
 * Sur mobile (détecté via pointer: coarse), pas de scale.
 */

import { useMountEffect } from '@neurodual/ui';
import { useState } from 'react';

const REFERENCE_HEIGHT = 700;
const MIN_SCALE = 0.5; // Ne pas descendre en dessous de 50%
const MOBILE_WIDTH_THRESHOLD = 500; // En dessous de cette largeur = mobile (pas de scale)

interface ViewportScale {
  scale: number;
  shouldScale: boolean;
}

export function useViewportScale(): ViewportScale {
  const [state, setState] = useState<ViewportScale>({ scale: 1, shouldScale: false });

  useMountEffect(() => {
    // Détecte si on est sur un appareil tactile (mobile)
    const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

    const calculateScale = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Pas de scale sur mobile (détection par touch OU par largeur)
      if (isTouchDevice() || width < MOBILE_WIDTH_THRESHOLD) {
        setState({ scale: 1, shouldScale: false });
        return;
      }

      if (height >= REFERENCE_HEIGHT) {
        setState({ scale: 1, shouldScale: false });
      } else {
        const scale = Math.max(MIN_SCALE, height / REFERENCE_HEIGHT);
        setState({ scale, shouldScale: true });
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);

    return () => window.removeEventListener('resize', calculateScale);
  });

  return state;
}
