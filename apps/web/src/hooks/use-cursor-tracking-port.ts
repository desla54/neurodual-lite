import { useMountEffect } from '@neurodual/ui';
import type { CursorPosition, CursorPositionPort } from '@neurodual/logic';
import { useMemo, useRef } from 'react';

export function useCursorTrackingPort(): CursorPositionPort {
  const cursorPositionRef = useRef<CursorPosition | null>(null);

  useMountEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      cursorPositionRef.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  });

  return useMemo<CursorPositionPort>(
    () => ({
      getCurrentPosition: () => cursorPositionRef.current,
    }),
    [],
  );
}
