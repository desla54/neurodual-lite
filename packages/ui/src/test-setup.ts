/**
 * Test Setup for React Testing Library
 *
 * Configures happy-dom as the DOM environment for React component tests.
 */

import { Window } from 'happy-dom';
import { afterEach } from 'bun:test';

// Create a happy-dom window instance
const happyWindow = new Window({ url: 'http://localhost:3000' });

// Register globals
(globalThis as Record<string, unknown>).window = happyWindow;
(globalThis as Record<string, unknown>).document = happyWindow.document;
(globalThis as Record<string, unknown>).navigator = happyWindow.navigator;
(globalThis as Record<string, unknown>).HTMLElement = happyWindow.HTMLElement;
(globalThis as Record<string, unknown>).SVGElement = happyWindow.SVGElement;
(globalThis as Record<string, unknown>).Element = happyWindow.Element;
(globalThis as Record<string, unknown>).DocumentFragment = happyWindow.DocumentFragment;
(globalThis as Record<string, unknown>).Text = happyWindow.Text;
(globalThis as Record<string, unknown>).Comment = happyWindow.Comment;
(globalThis as Record<string, unknown>).Node = happyWindow.Node;
(globalThis as Record<string, unknown>).getComputedStyle =
  happyWindow.getComputedStyle.bind(happyWindow);
(globalThis as Record<string, unknown>).requestAnimationFrame =
  happyWindow.requestAnimationFrame.bind(happyWindow);
(globalThis as Record<string, unknown>).cancelAnimationFrame =
  happyWindow.cancelAnimationFrame.bind(happyWindow);
(globalThis as Record<string, unknown>).customElements = happyWindow.customElements;

// Mock ResizeObserver (not implemented in happy-dom)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver (not implemented in happy-dom)
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

// Mock matchMedia (for responsive components)
Object.defineProperty(happyWindow, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Cleanup DOM between tests
afterEach(() => {
  // Clear document body between tests
  happyWindow.document.body.innerHTML = '';
});
