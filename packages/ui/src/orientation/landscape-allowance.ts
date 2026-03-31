import { create } from 'zustand';

interface LandscapeAllowanceState {
  allowanceCount: number;
  acquire: () => () => void;
}

export const useLandscapeAllowanceStore = create<LandscapeAllowanceState>((set) => ({
  allowanceCount: 0,
  acquire: () => {
    set((s) => ({ allowanceCount: s.allowanceCount + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ allowanceCount: Math.max(0, s.allowanceCount - 1) }));
    };
  },
}));

export function useIsLandscapeAllowed(): boolean {
  return useLandscapeAllowanceStore((s) => s.allowanceCount > 0);
}
