import { describe, expect, it } from 'bun:test';
import {
  calculateTutorialLayout,
  useTutorialLayout,
  type TutorialLayoutDimensions,
  type ViewportDimensions,
} from './use-tutorial-layout';

describe('useTutorialLayout', () => {
  describe('calculateTutorialLayout', () => {
    it('calculates grid dimensions for mobile viewport', () => {
      const viewport: ViewportDimensions = { width: 375, height: 667 };
      const result = calculateTutorialLayout(viewport);

      expect(result.isMobile).toBe(true);
      expect(result.gridSize).toBeGreaterThanOrEqual(180);
      expect(result.gridSize).toBeLessThanOrEqual(260);
    });

    it('calculates grid dimensions for desktop viewport', () => {
      const viewport: ViewportDimensions = { width: 1440, height: 900 };
      const result = calculateTutorialLayout(viewport);

      expect(result.isMobile).toBe(false);
      expect(result.gridSize).toBeLessThanOrEqual(450);
    });

    it('constrains gridSize to minimum on very small viewports', () => {
      const viewport: ViewportDimensions = { width: 300, height: 400 };
      const result = calculateTutorialLayout(viewport);

      expect(result.gridSize).toBeGreaterThanOrEqual(160);
    });

    it('returns gridTemplateRows with flexible gameZone', () => {
      const viewport: ViewportDimensions = { width: 375, height: 667 };
      const result = calculateTutorialLayout(viewport);

      // Flexible layout using 1fr for gameZone is now preferred for GSAP Flip
      expect(result.gridTemplateRows).toContain('1fr');
      expect(result.gridTemplateRows).toContain('px');
    });

    it('calculates gameZoneHeight correctly', () => {
      const viewport: ViewportDimensions = { width: 375, height: 667 };
      const result = calculateTutorialLayout(viewport);

      // gameZoneHeight = timeline_margin + timeline + gap + grid + bottom_margin
      // For compact height (667 < 700):
      // TIMELINE_TOP_MARGIN_COMPACT=8, TIMELINE_HEIGHT_COMPACT=110, GAP_COMPACT=8, MIN_GRID=160, GRID_BOTTOM_MARGIN=8
      const expectedMinHeight = 8 + 110 + 8 + 160 + 8;
      expect(result.gameZoneHeight).toBeGreaterThanOrEqual(expectedMinHeight);
    });

    it('uses window dimensions when no viewport provided', () => {
      // With happy-dom, window.innerWidth=1024, window.innerHeight=768
      // 1024 >= MOBILE_BREAKPOINT (1024), so isMobile=false, isCompact=false
      // Therefore hudHeight=HUD_HEIGHT=56, controlsHeight=CONTROLS_HEIGHT=88
      const result = calculateTutorialLayout();

      expect(result.gridSize).toBeGreaterThan(0);
      expect(result.isMobile).toBe(false);
      expect(result.hudHeight).toBe(56);
      expect(result.controlsHeight).toBe(88);
      expect(result.buttonScale).toBeGreaterThan(0);
    });

    it('returns all required dimension properties', () => {
      const viewport: ViewportDimensions = { width: 375, height: 667 };
      const result = calculateTutorialLayout(viewport);

      expect(result.hudHeight).toBeDefined();
      expect(result.timelineHeight).toBeDefined();
      // letterHeight removed - letter is now inside grid center
      expect(result.annotationHeight).toBeDefined();
      expect(result.controlsHeight).toBeDefined();
      expect(result.gameZoneHeight).toBeDefined();
      expect(result.gridTemplateAreas).toBeDefined();
      expect(result.buttonScale).toBeDefined();
    });

    it('returns smaller buttonScale for small screens', () => {
      const smallViewport: ViewportDimensions = { width: 320, height: 568 }; // iPhone SE 1st gen
      const result = calculateTutorialLayout(smallViewport);

      expect(result.buttonScale).toBeLessThan(1.0);
    });

    it('returns larger buttonScale for large screens', () => {
      const largeViewport: ViewportDimensions = { width: 768, height: 1024 }; // iPad
      const result = calculateTutorialLayout(largeViewport);

      expect(result.buttonScale).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('exports', () => {
    it('exports TutorialLayoutDimensions interface (type check)', () => {
      const dimensions: TutorialLayoutDimensions = calculateTutorialLayout({
        width: 375,
        height: 667,
      });
      expect(dimensions.gridSize).toBeDefined();
      expect(dimensions.isMobile).toBeDefined();
    });

    it('exports ViewportDimensions interface (type check)', () => {
      const viewport: ViewportDimensions = { width: 100, height: 100 };
      expect(viewport.width).toBe(100);
    });

    it('exports useTutorialLayout hook', () => {
      expect(typeof useTutorialLayout).toBe('function');
    });

    it('exports calculateTutorialLayout function', () => {
      expect(typeof calculateTutorialLayout).toBe('function');
    });
  });
});
