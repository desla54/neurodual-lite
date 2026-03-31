import { useState } from 'react';
import { useMountEffect } from '../hooks';

/** Returns "bottom" on mobile/touch, "top" on desktop */
export function useDrawerDirection(): 'top' | 'bottom' {
  const [dir, setDir] = useState<'top' | 'bottom'>('bottom');

  useMountEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 640px)');
    const update = () => setDir(mq.matches ? 'bottom' : 'top');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  return dir;
}
