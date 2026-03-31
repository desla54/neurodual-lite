import { useLayoutEffect, type MutableRefObject } from 'react';

interface UseFlippedCardAnimationOptions {
  readonly cardRef: MutableRefObject<HTMLDivElement | null>;
  readonly pendingCountRef?: MutableRefObject<number>;
  readonly setIsFlipped: (value: boolean) => void;
}

export function useFlippedCardAnimation({
  cardRef,
  pendingCountRef,
  setIsFlipped,
}: UseFlippedCardAnimationOptions): void {
  useLayoutEffect(() => {
    if (!cardRef.current) return;

    if (pendingCountRef) {
      pendingCountRef.current++;
    }

    let hasDecremented = false;
    const timer = window.setTimeout(async () => {
      if (!cardRef.current) return;
      const gsap = (await import('gsap')).default;
      gsap.to(cardRef.current, {
        rotateY: 180,
        duration: 0.4,
        ease: 'power2.inOut',
        onComplete: () => {
          setIsFlipped(true);
          if (pendingCountRef && !hasDecremented) {
            pendingCountRef.current--;
            hasDecremented = true;
          }
        },
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (pendingCountRef && !hasDecremented) {
        pendingCountRef.current--;
      }
    };
  }, [cardRef, pendingCountRef, setIsFlipped]);
}
