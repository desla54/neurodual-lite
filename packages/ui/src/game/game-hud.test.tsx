import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { GameHUD } from './game-hud';

describe('GameHUD', () => {
  it('shows 00 progress when the session has not started yet', () => {
    const { container } = render(<GameHUD trialIndex={-1} totalTrials={20} onQuit={() => {}} />);

    expect(container.textContent).toContain('00');
    expect(container.textContent).toContain('20');
  });

  it('uses the explicit progress count for the progress bar width', () => {
    const { container } = render(<GameHUD trialIndex={2} totalTrials={20} onQuit={() => {}} />);

    const fill = Array.from(container.getElementsByTagName('div')).find(
      (element) => element.getAttribute('data-capture-progress') === 'fill',
    ) as HTMLElement | undefined;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('15%');
  });
});
