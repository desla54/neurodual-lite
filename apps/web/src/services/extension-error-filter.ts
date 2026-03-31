/**
 * Extension Error Filter
 *
 * Some browser extensions inject autofill overlays into the page and may throw
 * cross-realm DOM errors that surface as uncaught errors in React event handling.
 * These errors are outside app control and can break DX (error overlays) or UX.
 *
 * We suppress only narrowly-matched extension/autofill errors.
 *
 * Important: In dev, Vite HMR can re-evaluate modules without a full page reload.
 * Any global listeners installed at module init time must be idempotent across HMR.
 */

const KNOWN_MESSAGE_SNIPPETS = [
  'Permission denied to access property "correspondingUseElement"',
  'Node.insertBefore: Child to insert before is not a child of this node',
  'NotFoundError: Node.insertBefore',
] as const;

const KNOWN_SOURCE_SNIPPETS = [
  'bootstrap-autofill-overlay.js',
  'moz-extension://',
  'chrome-extension://',
  'safari-extension://',
] as const;

function includesKnownSnippet(text: string, snippets: readonly string[]): boolean {
  return snippets.some((snippet) => text.includes(snippet));
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isKnownExtensionAutofillError(message: string, source: string): boolean {
  if (!message && !source) return false;
  const messageMatch = includesKnownSnippet(message, KNOWN_MESSAGE_SNIPPETS);
  const sourceMatch = includesKnownSnippet(source, KNOWN_SOURCE_SNIPPETS);

  // Keep the filter narrow: message must match, and source should indicate extension/autofill.
  // If source is unavailable, accept only the specific correspondingUseElement signature.
  if (messageMatch && sourceMatch) return true;

  if (!source) {
    return message.includes('correspondingUseElement');
  }

  return false;
}

const WINDOW_MARKER = '__ND_EXTENSION_ERROR_FILTER__';

type WindowMarkerState = {
  readonly onError: (event: ErrorEvent) => void;
  readonly onUnhandledRejection: (event: PromiseRejectionEvent) => void;
};

function readMarker(): WindowMarkerState | null {
  try {
    const v = (window as unknown as Record<string, unknown>)[WINDOW_MARKER];
    if (!v || typeof v !== 'object') return null;
    const state = v as Partial<WindowMarkerState>;
    if (typeof state.onError !== 'function') return null;
    if (typeof state.onUnhandledRejection !== 'function') return null;
    return state as WindowMarkerState;
  } catch {
    return null;
  }
}

function writeMarker(state: WindowMarkerState): void {
  (window as unknown as Record<string, unknown>)[WINDOW_MARKER] = state;
}

function clearMarker(): void {
  try {
    delete (window as unknown as Record<string, unknown>)[WINDOW_MARKER];
  } catch {
    // ignore
  }
}

export function initExtensionErrorFilter(): void {
  if (readMarker()) return;

  const onError = (event: ErrorEvent) => {
    const message = normalize(event.message);
    const source = normalize(event.filename);

    if (!isKnownExtensionAutofillError(message, source)) return;

    // Prevent noisy uncaught errors caused by injected extension scripts.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as unknown;
    const message =
      normalize((reason as { message?: unknown } | null)?.message) || normalize(String(reason));

    if (!isKnownExtensionAutofillError(message, '')) return;

    event.preventDefault();
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  writeMarker({ onError, onUnhandledRejection });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      const state = readMarker();
      if (!state) return;
      window.removeEventListener('error', state.onError);
      window.removeEventListener('unhandledrejection', state.onUnhandledRejection);
      clearMarker();
    });
  }
}
