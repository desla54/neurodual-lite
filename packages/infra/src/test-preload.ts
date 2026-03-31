/**
 * Test Preload Script
 *
 * Sets up global mocks that need to be in place before any modules are loaded.
 * This file is loaded via bun test --preload option.
 */

// Mock window for modules that use browser APIs at load time
const g = globalThis as Record<string, unknown>;
if (typeof g['window'] === 'undefined') {
  g['window'] = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: 'http://localhost:3000' },
  };
}

// Mock document for visibility change handlers
if (typeof g['document'] === 'undefined') {
  g['document'] = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  };
}

// Mock localStorage for recovery/session storage
if (typeof g['localStorage'] === 'undefined') {
  const storage = new Map<string, string>();
  g['localStorage'] = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    get length() {
      return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
  };
}
