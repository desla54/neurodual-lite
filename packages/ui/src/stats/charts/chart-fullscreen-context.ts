import { createContext, useContext } from 'react';

interface ChartFullscreenState {
  isFullscreen: boolean;
  /** Measured height (px) of the content area inside the fullscreen modal. */
  availableHeight: number;
}

const defaultState: ChartFullscreenState = { isFullscreen: false, availableHeight: 0 };

export const ChartFullscreenContext = createContext<ChartFullscreenState>(defaultState);

export const useIsChartFullscreen = (): boolean => useContext(ChartFullscreenContext).isFullscreen;

/**
 * Returns the measured available height when inside a fullscreen chart modal,
 * or the provided fallback height otherwise.
 */
export function useFullscreenChartHeight(fallback: number): number {
  const { isFullscreen, availableHeight } = useContext(ChartFullscreenContext);
  return isFullscreen && availableHeight > 0 ? availableHeight : fallback;
}
