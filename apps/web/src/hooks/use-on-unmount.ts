import { useMountEffect } from '@neurodual/ui';

export function useOnUnmount(onUnmount: () => void): void {
  useMountEffect(() => {
    return () => {
      onUnmount();
    };
  });
}
