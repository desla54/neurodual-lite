/**
 * useGameLayout - Calculate optimal game layout dimensions
 *
 * Computes the size of the game grid and controls based on available viewport space.
 * The grid is always square and sized to fit within the available area.
 */

import { useMountEffect } from '@neurodual/ui';
import { useEffectEvent, useMemo, useState } from 'react';

export interface GameLayoutDimensions {
  /** Size of the square game grid in pixels */
  gridSize: number;
  /** Total height of game area (grid + padding for countdown/instructions) */
  gameAreaHeight: number;
  /** Height available for controls in pixels */
  controlsHeight: number;
  /** Height of header area in pixels */
  headerHeight: number;
  /** Total available height (viewport - nav - safe areas) */
  availableHeight: number;
  /** Available width (viewport - padding) */
  availableWidth: number;
  /** Whether layout is in mobile mode (controls at bottom) */
  isMobile: boolean;
}

export interface UseGameLayoutOptions {
  /** Height of the navigation bar (default: 64px / 4rem) */
  navHeight?: number;
  /** Horizontal padding (default: 16px) */
  padding?: number;
  /** Minimum height for controls on mobile (default: 120px) */
  minControlsHeight?: number;
  /** Height of HUD header (default: 56px) */
  hudHeight?: number;
  /** Height of timeline when visible (default: 112px normal, 240px mirror) */
  timelineHeight?: number;
  /** Height of progress bar when visible (default: 16px including margin) */
  progressBarHeight?: number;
  /** Gap between grid and controls (default: 16px) */
  gap?: number;
  /** Breakpoint for mobile/desktop switch (default: 1024px for lg) */
  mobileBreakpoint?: number;
  /** Whether timeline is visible */
  showTimeline?: boolean;
  /** Whether progress bar is visible */
  showProgressBar?: boolean;
  /** Whether in mirror mode (taller timeline) */
  mirrorMode?: boolean;
  /** Number of control buttons (default: 2) - affects controls height calculation */
  controlsCount?: number;
  /** Extra space around grid for countdown/instructions (default: 48px) */
  gridPadding?: number;
  /** Scale factor for grid size (0.7 - 1.3, default 1.0) */
  gridScale?: number;
  /** Scale factor for controls size (0.7 - 1.3, default 1.0) */
  controlsScale?: number;
}

const DEFAULT_OPTIONS: Required<UseGameLayoutOptions> = {
  navHeight: 64,
  padding: 16,
  minControlsHeight: 140,
  hudHeight: 56,
  timelineHeight: 112,
  progressBarHeight: 16,
  gap: 16,
  mobileBreakpoint: 1024,
  showTimeline: false,
  showProgressBar: true,
  mirrorMode: false,
  controlsCount: 2,
  gridPadding: 48, // Space for countdown (top) + instructions (bottom)
  gridScale: 1.0,
  controlsScale: 1.0,
};

// Button height + gap for controls calculation
const BUTTON_HEIGHT_TALL = 88; // h-[80px] sm:h-[88px] for 2 buttons
const BUTTON_HEIGHT_NORMAL = 60; // h-[56px] sm:h-[60px] for 3-4 buttons
const BUTTON_HEIGHT_COMPACT = 56; // h-[52px] sm:h-[56px] for 5+ buttons
const BUTTON_GAP = 12; // gap-2 sm:gap-3 = 8-12px

function getSafeBottomInsetPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0;
  }

  const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
}

function readViewportSnapshot(): ViewportSnapshot {
  if (typeof window === 'undefined') {
    return {
      width: 400,
      height: 600,
    };
  }

  return {
    width: window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

export function useGameLayout(options: UseGameLayoutOptions = {}): GameLayoutDimensions {
  // Stabilize options to prevent infinite re-renders
  // NOTE: gridScale is NOT used here - it should be applied via CSS transform in the component
  const {
    navHeight = DEFAULT_OPTIONS.navHeight,
    padding = DEFAULT_OPTIONS.padding,
    minControlsHeight = DEFAULT_OPTIONS.minControlsHeight,
    hudHeight = DEFAULT_OPTIONS.hudHeight,
    timelineHeight = DEFAULT_OPTIONS.timelineHeight,
    progressBarHeight = DEFAULT_OPTIONS.progressBarHeight,
    gap = DEFAULT_OPTIONS.gap,
    mobileBreakpoint = DEFAULT_OPTIONS.mobileBreakpoint,
    showTimeline = DEFAULT_OPTIONS.showTimeline,
    showProgressBar = DEFAULT_OPTIONS.showProgressBar,
    mirrorMode = DEFAULT_OPTIONS.mirrorMode,
    controlsCount = DEFAULT_OPTIONS.controlsCount,
    gridPadding = DEFAULT_OPTIONS.gridPadding,
    controlsScale = DEFAULT_OPTIONS.controlsScale,
  } = options;

  // Calculate controls height based on button count
  // - 2 buttons: 2 columns, tall buttons
  // - 3-4 buttons: 2 columns, normal height
  // - 5+ buttons: 3 columns, compact height (optimized for multi-modality modes)
  const columns = controlsCount > 4 ? 3 : 2;
  const controlsRows = Math.ceil(controlsCount / columns);
  const buttonHeight =
    controlsCount <= 2
      ? BUTTON_HEIGHT_TALL
      : controlsCount <= 4
        ? BUTTON_HEIGHT_NORMAL
        : BUTTON_HEIGHT_COMPACT;
  // Apply controlsScale to the base button height
  const scaledButtonHeight = Math.round(buttonHeight * controlsScale);
  const calculatedControlsHeight =
    controlsRows * scaledButtonHeight + Math.max(0, controlsRows - 1) * BUTTON_GAP;

  const [viewport, setViewport] = useState<ViewportSnapshot>(readViewportSnapshot);

  const recalculateViewport = useEffectEvent(() => {
    setViewport((current) => {
      const next = readViewportSnapshot();
      if (current.width === next.width && current.height === next.height) {
        return current;
      }
      return next;
    });
  });

  useMountEffect(() => {
    let rafId: number | null = null;

    const handleResize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        recalculateViewport();
        rafId = null;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  });

  return useMemo((): GameLayoutDimensions => {
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const isMobile = viewportWidth < mobileBreakpoint;

    // Calculate available width (viewport - padding on both sides)
    const availableWidth = viewportWidth - padding * 2;

    // Calculate header height (HUD + optional timeline + optional progress bar)
    const timelineH = showTimeline ? (mirrorMode ? 240 : timelineHeight) : 0;
    const progressH = showProgressBar ? progressBarHeight : 0;
    const headerHeight = hudHeight + timelineH + progressH + gap;

    // Controls height based on button count (dynamic)
    const controlsHeight = Math.max(calculatedControlsHeight, minControlsHeight);

    // Calculate available height for grid + controls
    // Viewport - nav - header - safe areas (bottom padding for mobile)
    // Keep a baseline breathing room (16px) and use real Android safe inset when available.
    const safeAreaBottom = isMobile ? Math.max(16, getSafeBottomInsetPx()) : 0;
    const availableHeight = viewportHeight - navHeight - headerHeight - safeAreaBottom;

    let gridSize: number;

    // Grid fills remaining space after controls (controls height is fixed)
    // Subtract gridPadding to leave room for countdown (top) and instructions (bottom)
    const heightForGrid = availableHeight - controlsHeight - gap - gridPadding;

    if (isMobile) {
      // Mobile: grid capped at 340px so controls stay in the comfortable thumb zone (~70-73% from top).
      // Without this cap, wide phones (iPhone Pro Max etc.) grow the grid to 400px which pushes
      // buttons down to ~80% — outside comfortable one-handed thumb reach.
      const maxGridSize = Math.min(availableWidth, 340);
      gridSize = Math.min(Math.max(heightForGrid, 180), maxGridSize);
    } else {
      // Desktop: grid is square, capped at reasonable size
      const maxGridSize = Math.min(availableWidth * 0.6, 450);
      gridSize = Math.min(Math.max(heightForGrid, 180), maxGridSize);
    }

    return {
      gridSize,
      gameAreaHeight: Math.round(gridSize + gridPadding),
      controlsHeight: Math.round(controlsHeight),
      headerHeight: Math.round(headerHeight),
      availableHeight: Math.round(availableHeight),
      availableWidth: Math.round(availableWidth),
      isMobile,
    };
  }, [
    viewport,
    navHeight,
    padding,
    minControlsHeight,
    calculatedControlsHeight,
    hudHeight,
    timelineHeight,
    progressBarHeight,
    gap,
    gridPadding,
    mobileBreakpoint,
    showTimeline,
    showProgressBar,
    mirrorMode,
  ]);
}
