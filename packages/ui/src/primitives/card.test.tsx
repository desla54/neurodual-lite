import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { Card, SubCard } from './card';

describe('Card', () => {
  describe('rendering', () => {
    it('should render with children', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeDefined();
    });

    it('should have base classes', () => {
      render(<Card>Content</Card>);
      const card = screen.getByText('Content');
      expect(card.className).toContain('bg-card');
      expect(card.className).toContain('rounded-2xl');
      expect(card.className).toContain('border');
    });
  });

  describe('padding', () => {
    it('should have medium padding by default', () => {
      render(<Card>Default padding</Card>);
      const card = screen.getByText('Default padding');
      expect(card.className).toContain('p-4');
    });

    it('should have no padding when specified', () => {
      render(<Card padding="none">No padding</Card>);
      const card = screen.getByText('No padding');
      expect(card.className).not.toContain('p-3');
      expect(card.className).not.toContain('p-4');
      expect(card.className).not.toContain('p-6');
    });

    it('should have small padding when specified', () => {
      render(<Card padding="sm">Small padding</Card>);
      const card = screen.getByText('Small padding');
      expect(card.className).toContain('p-3');
    });

    it('should have large padding when specified', () => {
      render(<Card padding="lg">Large padding</Card>);
      const card = screen.getByText('Large padding');
      expect(card.className).toContain('p-6');
    });
  });

  describe('className', () => {
    it('should apply custom className', () => {
      render(<Card className="custom-card">Custom</Card>);
      const card = screen.getByText('Custom');
      expect(card.className).toContain('custom-card');
    });
  });
});

describe('SubCard', () => {
  describe('rendering', () => {
    it('should render with children', () => {
      render(<SubCard>SubCard content</SubCard>);
      expect(screen.getByText('SubCard content')).toBeDefined();
    });

    it('should have base classes', () => {
      render(<SubCard>Content</SubCard>);
      const subCard = screen.getByText('Content');
      expect(subCard.className).toContain('py-3');
      expect(subCard.className).toContain('px-4');
      expect(subCard.className).toContain('rounded-xl');
    });

    it('should have glass light classes', () => {
      render(<SubCard>Content</SubCard>);
      const subCard = screen.getByText('Content');
      expect(subCard.className).toContain('bg-card');
    });
  });

  describe('className', () => {
    it('should apply custom className', () => {
      render(<SubCard className="custom-subcard">Custom</SubCard>);
      const subCard = screen.getByText('Custom');
      expect(subCard.className).toContain('custom-subcard');
    });
  });
});
