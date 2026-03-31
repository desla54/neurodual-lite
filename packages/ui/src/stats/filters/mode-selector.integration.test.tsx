import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import type { ModeType } from './types';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

const { ModeSelector } = await import('./mode-selector');

if (typeof globalThis.MutationObserver === 'undefined') {
  class MutationObserverShim {
    observe(): void {}
    disconnect(): void {}
    takeRecords(): MutationRecord[] {
      return [];
    }
  }
  globalThis.MutationObserver = MutationObserverShim as unknown as typeof MutationObserver;
}

function Harness(): ReactNode {
  const [mode, setMode] = useState<ModeType>('all');
  return <ModeSelector value={mode} onChange={setMode} betaEnabled journeyFilter="all" />;
}

describe('ModeSelector integration', () => {
  test('switches Journey -> Libre from the UI dropdown', async () => {
    render(<Harness />);

    const trigger = screen.getByRole('button');

    // open menu
    fireEvent.pointerDown(trigger);
    fireEvent.click(await screen.findByText('stats.mode.journey'));

    // selected label updates to Journey
    expect(screen.getByRole('button').textContent).toContain('stats.journey.');

    // switch to Libre
    fireEvent.pointerDown(screen.getByRole('button'));
    fireEvent.click((await screen.findAllByText('stats.mode.libre'))[0]!);
    expect(screen.getByRole('button').textContent).toContain('stats.mode.libre');
  });
});
