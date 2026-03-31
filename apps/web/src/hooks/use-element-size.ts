import { useMountEffect } from '@neurodual/ui';
import { useState, type RefObject } from 'react';

interface ElementSize {
  readonly width: number;
  readonly height: number;
}

const EMPTY_SIZE: ElementSize = {
  width: 0,
  height: 0,
};

export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(EMPTY_SIZE);

  useMountEffect(() => {
    const element = ref.current;
    if (!element) {
      setSize(EMPTY_SIZE);
      return;
    }

    const measure = (): void => {
      const nextWidth = Math.round(element.clientWidth);
      const nextHeight = Math.round(element.clientHeight);

      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  });

  return size;
}
