import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { Logo } from './logo';

describe('Logo', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      render(<Logo />);
      const svg = screen.getByRole('img', { name: 'NeuroDual Logo' });
      expect(svg).toBeDefined();
    });

    it('should apply custom aria-label', () => {
      render(<Logo ariaLabel="Custom Logo" />);
      const svg = screen.getByRole('img', { name: 'Custom Logo' });
      expect(svg).toBeDefined();
    });

    it('should apply custom className', () => {
      render(<Logo className="custom-class" />);
      const svg = screen.getByRole('img');
      expect(svg.className).toContain('custom-class');
    });
  });

  describe('variants', () => {
    it('should render full variant by default', () => {
      render(<Logo />);
      const svg = screen.getByRole('img');
      // Full variant has viewBox "2 0 268 100"
      expect(svg.getAttribute('viewBox')).toBe('2 0 268 100');
    });

    it('should force LTR direction even in RTL documents', () => {
      document.documentElement.dir = 'rtl';
      render(<Logo />);
      const svg = screen.getByRole('img');
      expect(svg).toBeDefined();
      expect((svg as unknown as SVGElement).style.direction).toBe('ltr');
    });

    it('should render icon variant', () => {
      render(<Logo variant="icon" />);
      const svg = screen.getByRole('img');
      // Icon variant has viewBox "0 0 100 100"
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    });

    it('should render text only in full variant', () => {
      const { container: fullContainer } = render(<Logo variant="full" />);
      const fullTexts = fullContainer.querySelectorAll('text');
      expect(fullTexts.length).toBeGreaterThan(0);

      const { container: iconContainer } = render(<Logo variant="icon" />);
      const iconTexts = iconContainer.querySelectorAll('text');
      expect(iconTexts.length).toBe(0);
    });
  });

  describe('size', () => {
    it('should apply default size', () => {
      render(<Logo />);
      const svg = screen.getByRole('img');
      expect(svg.getAttribute('height')).toBe('100');
    });

    it('should apply custom size', () => {
      render(<Logo size={50} />);
      const svg = screen.getByRole('img');
      expect(svg.getAttribute('height')).toBe('50');
    });

    it('should scale width based on variant', () => {
      render(<Logo variant="full" size={100} />);
      const fullSvg = screen.getByRole('img');
      // Full variant width = size * 2.68
      expect(fullSvg.getAttribute('width')).toBe('268');
    });

    it('should have equal width and height for icon variant', () => {
      render(<Logo variant="icon" size={100} />);
      const iconSvg = screen.getByRole('img');
      expect(iconSvg.getAttribute('width')).toBe('100');
      expect(iconSvg.getAttribute('height')).toBe('100');
    });
  });

  describe('premium badge', () => {
    it('should not show premium badge by default', () => {
      const { container } = render(<Logo />);
      // Premium badge has a circle with r="14"
      const badgeCircle = container.querySelector('circle[r="14"]');
      expect(badgeCircle).toBeNull();
    });

    it('should show premium badge when enabled', () => {
      const { container } = render(<Logo showPremiumBadge />);
      // Premium badge has a circle with r="14"
      const badgeCircle = container.querySelector('circle[r="14"]');
      expect(badgeCircle).not.toBeNull();
    });
  });

  describe('accessibility', () => {
    it('should have role="img"', () => {
      render(<Logo />);
      const svg = screen.getByRole('img');
      expect(svg.getAttribute('role')).toBe('img');
    });

    it('should have aria-label', () => {
      render(<Logo ariaLabel="Test Label" />);
      const svg = screen.getByRole('img', { name: 'Test Label' });
      expect(svg.getAttribute('aria-label')).toBe('Test Label');
    });
  });
});
