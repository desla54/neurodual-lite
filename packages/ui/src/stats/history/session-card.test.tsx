import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionHistoryItem } from '@neurodual/logic';
import { SessionCard } from './session-card';

function createSession(overrides: Partial<SessionHistoryItem> = {}): SessionHistoryItem {
  return {
    id: 's1',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    nLevel: 3,
    dPrime: 1.2,
    passed: true,
    trialsCount: 20,
    durationMs: 60000,
    byModality: {
      position: {
        hits: 5,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 4,
        avgRT: 800,
        dPrime: 1.0,
      },
      audio: {
        hits: 5,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 5,
        avgRT: 850,
        dPrime: 1.1,
      },
    },
    generator: 'test',
    gameMode: 'dualnback-classic',
    playContext: 'free',
    activeModalities: ['position', 'audio'],
    reason: 'completed',
    unifiedMetrics: {
      accuracy: 0.9,
      nLevel: 3,
      zone: 1,
      zoneProgress: 0,
    },
    ...overrides,
  };
}

const baseProps = {
  onDelete: mock(() => {}),
  onClick: mock(() => {}),
  selectionMode: false,
  isSelected: false,
  onToggleSelect: mock(() => {}),
  onLongPress: mock(() => {}),
  betaEnabled: true,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SessionCard dualnback classic error rate', () => {
  it('uses byModality counts instead of inverse unified accuracy for dualnback-classic', () => {
    const session = createSession({
      gameMode: 'dualnback-classic',
      byModality: {
        position: {
          hits: 1,
          misses: 3,
          falseAlarms: 1,
          correctRejections: 0,
          avgRT: 800,
          dPrime: 0.5,
        },
      },
      unifiedMetrics: { accuracy: 0.95, nLevel: 3, zone: 1, zoneProgress: 0 },
    });

    render(<SessionCard session={session} {...baseProps} />);

    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('5%').length).toBe(0);
  });

  it('shows placeholder when byModality is missing in list rows', () => {
    const session = createSession({
      gameMode: 'dualnback-classic',
      byModality: {},
      upsAccuracy: 73,
      unifiedMetrics: { accuracy: 0.95, nLevel: 3, zone: 1, zoneProgress: 0 },
    });

    render(<SessionCard session={session} {...baseProps} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('5%').length).toBe(0);
  });

  it('triggers long press when touch stays stationary', async () => {
    const onLongPress = mock(() => {});
    const session = createSession();

    render(<SessionCard session={session} {...baseProps} onLongPress={onLongPress} />);

    const card = screen.getByTestId(`history-session-${session.id}`);
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] });
    await wait(550);

    expect(onLongPress).toHaveBeenCalledWith(session.id);
  });

  it('does not trigger long press while the user is scrolling', async () => {
    const onLongPress = mock(() => {});
    const session = createSession();

    render(<SessionCard session={session} {...baseProps} onLongPress={onLongPress} />);

    const card = screen.getByTestId(`history-session-${session.id}`);
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 118, clientY: 125 }] });
    await wait(550);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
