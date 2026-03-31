// Setup file for Bun tests
import { mock, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import { Window } from 'happy-dom';

process.env.NODE_ENV = 'test';

function parsePositiveIntegerEnv(name: string): number | undefined {
  const rawValue = process.env[name];
  if (!rawValue) return undefined;

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`[test-setup] ${name} must be a positive integer, received: ${rawValue}`);
  }

  return parsedValue;
}

// Fuzzing mode: FUZZ_MODE=true enables aggressive bug hunting
// - Random seed (different each run)
// - 10x more iterations (1000 instead of 100)
// Default mode: reproducible for CI/mutation testing (fixed seed)
const FUZZ_MODE = process.env.FUZZ_MODE === 'true';
const FAST_CHECK_NUM_RUNS = parsePositiveIntegerEnv('FAST_CHECK_NUM_RUNS');
const FAST_CHECK_FUZZ_NUM_RUNS = parsePositiveIntegerEnv('FAST_CHECK_FUZZ_NUM_RUNS');
const FAST_CHECK_SEED = process.env.FAST_CHECK_SEED
  ? Number(process.env.FAST_CHECK_SEED)
  : FUZZ_MODE
    ? undefined // Random seed in fuzz mode
    : 424242; // Fixed seed for reproducibility

const FUZZ_NUM_RUNS = FAST_CHECK_FUZZ_NUM_RUNS ?? 1000; // Aggressive: nightly/fuzz mode
const DEFAULT_NUM_RUNS = FAST_CHECK_NUM_RUNS ?? 50;

fc.configureGlobal({
  seed: Number.isFinite(FAST_CHECK_SEED as number) ? FAST_CHECK_SEED : undefined,
  numRuns: FUZZ_MODE ? FUZZ_NUM_RUNS : DEFAULT_NUM_RUNS,
  verbose: FUZZ_MODE, // Show failing examples in fuzz mode
});

if (FUZZ_MODE) {
  console.log(
    `🔥 FUZZ MODE ENABLED - Random seed, ${FUZZ_NUM_RUNS} iterations per property test`,
  );
}

// Create a happy-dom window instance for proper DOM support
const happyWindow = new Window({ url: 'http://localhost:3000' });

// Set window dimensions for layout tests
(happyWindow as any).innerWidth = 1920;
(happyWindow as any).innerHeight = 1080;

// Register globals from happy-dom
(globalThis as Record<string, unknown>).window = happyWindow;
(globalThis as Record<string, unknown>).document = happyWindow.document;
(globalThis as Record<string, unknown>).navigator = happyWindow.navigator;
(globalThis as Record<string, unknown>).localStorage = happyWindow.localStorage;
(globalThis as Record<string, unknown>).HTMLElement = happyWindow.HTMLElement;
(globalThis as Record<string, unknown>).SVGElement = happyWindow.SVGElement;
(globalThis as Record<string, unknown>).Element = happyWindow.Element;
(globalThis as Record<string, unknown>).DocumentFragment = happyWindow.DocumentFragment;
(globalThis as Record<string, unknown>).Text = happyWindow.Text;
(globalThis as Record<string, unknown>).Comment = happyWindow.Comment;
(globalThis as Record<string, unknown>).Node = happyWindow.Node;
(globalThis as Record<string, unknown>).getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow);
(globalThis as Record<string, unknown>).requestAnimationFrame = happyWindow.requestAnimationFrame.bind(happyWindow);
(globalThis as Record<string, unknown>).cancelAnimationFrame = happyWindow.cancelAnimationFrame.bind(happyWindow);
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
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

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

// Mock IndexedDB for SQLite (wa-sqlite IDB backend) if missing
if (typeof globalThis.indexedDB === 'undefined') {
    (globalThis as any).indexedDB = {
        open: mock(() => ({
            onupgradeneeded: null,
            onsuccess: null,
            onerror: null,
        })),
        deleteDatabase: mock(() => ({
            onsuccess: null,
            onerror: null,
        })),
    };
}

// Ensure performance.now is available (usually is in Bun)
if (typeof performance === 'undefined') {
    (globalThis as any).performance = {
        now: () => Date.now(),
    };
}
