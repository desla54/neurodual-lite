import { useMountEffect } from '@neurodual/ui';

interface UseOnMountResetOptions {
  readonly onMount: () => void;
  readonly onUnmount?: () => void;
}

export function useOnMountReset({ onMount, onUnmount }: UseOnMountResetOptions): void {
  useMountEffect(() => {
    onMount();
    return () => {
      onUnmount?.();
    };
  });
}
