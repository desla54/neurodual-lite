import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  describe('rendering', () => {
    it('should render progress bar structure', () => {
      const { container } = render(<ProgressBar value={50} />);
      const outer = container.querySelector('.bg-secondary');
      const inner = container.querySelector('.bg-primary');
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
    });
  });

  describe('value calculation', () => {
    it('should calculate percentage correctly', () => {
      const { container } = render(<ProgressBar value={50} max={100} />);
      const inner = container.querySelector('.bg-primary') as HTMLElement;
      expect(inner.style.width).toBe('50%');
    });

    it('should use max of 100 by default', () => {
      const { container } = render(<ProgressBar value={25} />);
      const inner = container.querySelector('.bg-primary') as HTMLElement;
      expect(inner.style.width).toBe('25%');
    });

    it('should handle custom max value', () => {
      const { container } = render(<ProgressBar value={5} max={10} />);
      const inner = container.querySelector('.bg-primary') as HTMLElement;
      expect(inner.style.width).toBe('50%');
    });

    it('should clamp value to 0%', () => {
      const { container } = render(<ProgressBar value={-10} />);
      const inner = container.querySelector('.bg-primary') as HTMLElement;
      expect(inner.style.width).toBe('0%');
    });

    it('should clamp value to 100%', () => {
      const { container } = render(<ProgressBar value={150} />);
      const inner = container.querySelector('.bg-primary') as HTMLElement;
      expect(inner.style.width).toBe('100%');
    });
  });

  describe('label', () => {
    it('should not show label by default', () => {
      render(<ProgressBar value={50} />);
      expect(screen.queryByText('50%')).toBeNull();
    });

    it('should show label when showLabel is true', () => {
      render(<ProgressBar value={50} showLabel />);
      expect(screen.getByText('50%')).toBeDefined();
    });

    it('should round label percentage', () => {
      render(<ProgressBar value={33.33} showLabel />);
      expect(screen.getByText('33%')).toBeDefined();
    });
  });

  describe('colors', () => {
    it('should use primary color by default', () => {
      const { container } = render(<ProgressBar value={50} />);
      const inner = container.querySelector('.bg-primary');
      expect(inner).toBeDefined();
    });

    it('should use audio color', () => {
      const { container } = render(<ProgressBar value={50} color="audio" />);
      const inner = container.querySelector('.bg-audio');
      expect(inner).toBeDefined();
    });

    it('should use visual color', () => {
      const { container } = render(<ProgressBar value={50} color="visual" />);
      const inner = container.querySelector('.bg-visual');
      expect(inner).toBeDefined();
    });

    it('should use destructive color', () => {
      const { container } = render(<ProgressBar value={50} color="destructive" />);
      const inner = container.querySelector('.bg-destructive');
      expect(inner).toBeDefined();
    });
  });

  describe('className', () => {
    it('should apply custom className to wrapper', () => {
      const { container } = render(<ProgressBar value={50} className="custom-progress" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('custom-progress');
    });
  });
});
