import { useEffectEvent, useLayoutEffect, useRef } from 'react';

interface UseSynergyReturnOptions {
  readonly shouldReturn: boolean;
  readonly onReturn: () => void;
}

export function useSynergyReturn({ shouldReturn, onReturn }: UseSynergyReturnOptions): void {
  const synergyAdvancedRef = useRef(false);
  const runReturn = useEffectEvent(onReturn);

  useLayoutEffect(() => {
    if (!shouldReturn) {
      synergyAdvancedRef.current = false;
      return;
    }

    if (synergyAdvancedRef.current) return;
    synergyAdvancedRef.current = true;
    runReturn();
  }, [shouldReturn, runReturn]);
}
