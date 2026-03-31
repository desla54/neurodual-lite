import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type ReactNode } from 'react';
import type { HistoryPort, PersistencePort } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { Window } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';

(() => {
  const happyWindow = new Window({ url: 'http://localhost:3000' });
  const globals = globalThis as Record<string, unknown>;

  globals['window'] = happyWindow;
  globals['document'] = happyWindow.document;
  globals['navigator'] = happyWindow.navigator;
  globals['HTMLElement'] = happyWindow.HTMLElement;
  globals['SVGElement'] = happyWindow.SVGElement;
  globals['Element'] = happyWindow.Element;
  globals['DocumentFragment'] = happyWindow.DocumentFragment;
  globals['Text'] = happyWindow.Text;
  globals['Comment'] = happyWindow.Comment;
  globals['Node'] = happyWindow.Node;
  globals['getComputedStyle'] = happyWindow.getComputedStyle.bind(happyWindow);
  globals['requestAnimationFrame'] = happyWindow.requestAnimationFrame.bind(happyWindow);
  globals['cancelAnimationFrame'] = happyWindow.cancelAnimationFrame.bind(happyWindow);
  globals['customElements'] = happyWindow.customElements;

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock;
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
})();

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const unsubscribeMock = mock(() => {});
const setupHistoryPowerSyncWatchMock = mock(() => unsubscribeMock);
const withWatchdogContextMock = mock((_label: string, fn: () => unknown) => fn());
const loggerDebugMock = mock(() => {});

mock.module('@neurodual/infra', () => ({
  setupHistoryPowerSyncWatch: setupHistoryPowerSyncWatchMock,
  withWatchdogContext: withWatchdogContextMock,
}));

mock.module('../lib', () => ({
  logger: {
    debug: loggerDebugMock,
  },
}));

import { useHistoryWatch } from './use-history-watch';

interface HarnessProps {
  readonly db: AbstractPowerSyncDatabase | null;
  readonly userId: string;
  readonly persistence: PersistencePort | null;
  readonly historyAdapter: HistoryPort | null;
}

function Harness({ db, userId, persistence, historyAdapter }: HarnessProps): ReactNode {
  useHistoryWatch(db, userId, persistence, historyAdapter);
  return null;
}

describe('useHistoryWatch', () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted = false;

  beforeEach(() => {
    setupHistoryPowerSyncWatchMock.mockClear();
    withWatchdogContextMock.mockClear();
    loggerDebugMock.mockClear();
    unsubscribeMock.mockClear();
    unmounted = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (!unmounted) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('sets up the history watch when persistence arrives after the DB', () => {
    const db = {} as AbstractPowerSyncDatabase;
    const persistence = {} as PersistencePort;
    const historyAdapter = {} as HistoryPort;

    act(() => {
      root.render(<Harness db={db} userId="local" persistence={null} historyAdapter={null} />);
    });

    expect(setupHistoryPowerSyncWatchMock).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <Harness
          db={db}
          userId="local"
          persistence={persistence}
          historyAdapter={historyAdapter}
        />,
      );
    });

    expect(setupHistoryPowerSyncWatchMock).toHaveBeenCalledTimes(1);
    expect(setupHistoryPowerSyncWatchMock).toHaveBeenCalledWith(
      db,
      'local',
      persistence,
      historyAdapter,
    );

    act(() => {
      root.unmount();
    });
    unmounted = true;

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
