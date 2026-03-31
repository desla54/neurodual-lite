/**
 * useTutorialLayout - Calculate optimal tutorial layout dimensions
 *
 * Based on useGameLayout pattern from apps/web/hooks/use-game-layout.ts
 * Computes sizes in JavaScript for precise pixel positioning.
 *
 * Layout zones (top to bottom):
 * - hud: Navigation/header area
 * - gameZone: Contains timeline, grid, and letter display
 * - annotation: Tutorial instruction text
 * - controls: Response buttons
 */

import { useCallback, useEffect, useState } from 'react';

/**
 * Dimensions and layout configuration for the tutorial.
 */
export interface TutorialLayoutDimensions {
  gridSize: number;
  hudHeight: number;
  timelineHeight: number;
  letterHeight: number;
  annotationHeight: number;
  controlsHeight: number;
  gap: number;
  isMobile: boolean;
  gridTemplateRows: string;
  gridTemplateAreas: string;
  gameZoneHeight: number;
  buttonScale: number;
}

/**
 * Viewport dimensions for testing or SSR scenarios.
 */
export interface ViewportDimensions {
  width: number;
  height: number;
}

// Layout constants (matching game.tsx patterns)
const MOBILE_BREAKPOINT = 1024;
const COMPACT_HEIGHT_THRESHOLD = 700;
const DESKTOP_COMPACT_HEIGHT_THRESHOLD = 860;
const NAV_HEIGHT = 0;
const HUD_HEIGHT = 56;
const TIMELINE_HEIGHT = 140;
const TIMELINE_HEIGHT_COMPACT = 110;
const LETTER_HEIGHT = 0;
const ANNOTATION_HEIGHT_MOBILE = 80;
const ANNOTATION_HEIGHT_COMPACT = 64;
const ANNOTATION_HEIGHT_DESKTOP = 140;
const CONTROLS_HEIGHT = 88;
const CONTROLS_HEIGHT_COMPACT = 72;
const GAP_MOBILE = 10;
const GAP_COMPACT = 6;
const GAP_DESKTOP = 20;
const GRID_BOTTOM_MARGIN_MOBILE = 8;
const GRID_BOTTOM_MARGIN_DESKTOP = 4;
const TIMELINE_TOP_MARGIN = 16;
const TIMELINE_TOP_MARGIN_COMPACT = 8;
const PADDING_HORIZONTAL = 16;
const PADDING_TOP = 8;
const SAFE_AREA_BOTTOM_MOBILE = 16;

// Grid constraints
const MIN_GRID_SIZE = 160;
const MAX_GRID_SIZE_MOBILE = 260;
const MAX_GRID_SIZE_DESKTOP = 450;

// Button scale thresholds (smaller screens = smaller buttons)
const SMALL_SCREEN_HEIGHT = 600;
const MEDIUM_SCREEN_HEIGHT = 700;

/**
 * Pure calculation function for tutorial layout dimensions.
 * Exported for testing without needing React hooks.
 *
 * @param viewport - Optional explicit viewport dimensions for testing
 */
export function calculateTutorialLayout(viewport?: ViewportDimensions): TutorialLayoutDimensions {
  // Default mobile dimensions for SSR/test environments
  const defaultWidth = 375;
  const defaultHeight = 667;

  const width =
    viewport?.width ??
    (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : defaultWidth);
  const height =
    viewport?.height ??
    (typeof window !== 'undefined' && (window.visualViewport?.height || window.innerHeight) > 0
      ? (window.visualViewport?.height ?? window.innerHeight)
      : defaultHeight);

  const isMobile = width < MOBILE_BREAKPOINT;
  const isCompact = isMobile && height < COMPACT_HEIGHT_THRESHOLD;
  const isDesktopCompact = !isMobile && height < DESKTOP_COMPACT_HEIGHT_THRESHOLD;

  const hudHeight = HUD_HEIGHT;
  const timelineHeight = isCompact ? TIMELINE_HEIGHT_COMPACT : TIMELINE_HEIGHT;
  const timelineTopMargin = isCompact
    ? TIMELINE_TOP_MARGIN_COMPACT
    : isDesktopCompact
      ? 10
      : TIMELINE_TOP_MARGIN;
  const annotationHeight = isCompact
    ? ANNOTATION_HEIGHT_COMPACT
    : isMobile
      ? ANNOTATION_HEIGHT_MOBILE
      : isDesktopCompact
        ? 110
        : ANNOTATION_HEIGHT_DESKTOP;
  const controlsHeight = isCompact ? CONTROLS_HEIGHT_COMPACT : CONTROLS_HEIGHT;
  const gap = isCompact ? GAP_COMPACT : isMobile ? GAP_MOBILE : isDesktopCompact ? 24 : GAP_DESKTOP;

  const safeAreaBottom = isMobile ? SAFE_AREA_BOTTOM_MOBILE : 0;
  const gridBottomMargin = isMobile ? GRID_BOTTOM_MARGIN_MOBILE : GRID_BOTTOM_MARGIN_DESKTOP;

  const availableWidth = width - PADDING_HORIZONTAL * 2;

  const fixedHeights =
    hudHeight +
    timelineHeight +
    annotationHeight +
    controlsHeight +
    timelineTopMargin +
    gap +
    gridBottomMargin +
    gap +
    safeAreaBottom +
    PADDING_TOP;

  const heightForGrid = height - NAV_HEIGHT - fixedHeights;

  let buttonScale = 1.15;
  if (height < SMALL_SCREEN_HEIGHT) {
    buttonScale = 0.85;
  } else if (height < MEDIUM_SCREEN_HEIGHT) {
    buttonScale = 1.0;
  }

  const maxGridSize = isMobile ? MAX_GRID_SIZE_MOBILE : MAX_GRID_SIZE_DESKTOP;
  const widthFactor = isMobile ? 0.85 : 0.6;
  const gridSize = Math.min(
    maxGridSize,
    Math.max(MIN_GRID_SIZE, Math.min(heightForGrid, availableWidth * widthFactor)),
  );

  const gameZoneHeight = timelineTopMargin + timelineHeight + gap + gridSize + gridBottomMargin;

  return {
    gridSize: Math.round(gridSize),
    hudHeight,
    timelineHeight,
    letterHeight: LETTER_HEIGHT,
    annotationHeight,
    controlsHeight,
    gap,
    isMobile,
    gameZoneHeight: Math.round(gameZoneHeight),
    // On desktop, keep gameZone sized to its content. The grid container uses alignContent
    // to prevent auto tracks from stretching and creating large gaps.
    gridTemplateRows: `${hudHeight}px ${isMobile ? '1fr' : 'auto'} ${annotationHeight}px ${controlsHeight}px`,
    gridTemplateAreas: '"hud" "gameZone" "annotation" "controls"',
    buttonScale,
  };
}

/**
 * Hook that provides responsive layout dimensions for the tutorial.
 * Uses useState/useEffect pattern like useGameLayout for stability.
 */
export function useTutorialLayout(): TutorialLayoutDimensions {
  const calculateLayout = useCallback(() => calculateTutorialLayout(), []);

  const [dimensions, setDimensions] = useState<TutorialLayoutDimensions>(calculateLayout);

  useEffect(() => {
    let rafId: number | null = null;

    const isSameLayout = (a: TutorialLayoutDimensions, b: TutorialLayoutDimensions) =>
      a.gridSize === b.gridSize &&
      a.hudHeight === b.hudHeight &&
      a.timelineHeight === b.timelineHeight &&
      a.letterHeight === b.letterHeight &&
      a.annotationHeight === b.annotationHeight &&
      a.controlsHeight === b.controlsHeight &&
      a.gap === b.gap &&
      a.isMobile === b.isMobile &&
      a.gridTemplateRows === b.gridTemplateRows &&
      a.gridTemplateAreas === b.gridTemplateAreas &&
      a.gameZoneHeight === b.gameZoneHeight &&
      a.buttonScale === b.buttonScale;

    const handleResize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const next = calculateLayout();
        setDimensions((prev) => (isSameLayout(prev, next) ? prev : next));
        rafId = null;
      });
    };

    // Initial calculation
    handleResize();

    // Listen to resize and orientation changes
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [calculateLayout]);

  return dimensions;
}
