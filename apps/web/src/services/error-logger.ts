/**
 * Error Logger Service
 *
 * Logs errors to console and localStorage for later retrieval.
 * Can be extended to send to Sentry/Supabase if needed.
 */

const STORAGE_KEY = 'neurodual_error_log';
const MAX_ERRORS = 50;

export interface ErrorLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
}

/**
 * Log an error from ErrorBoundary
 */
export function logError(error: Error, componentStack?: string): void {
  // Always console.error
  console.error('[ErrorLogger] Caught error:', error);
  if (componentStack) {
    console.error('[ErrorLogger] Component stack:', componentStack);
  }

  // Store in localStorage for later retrieval
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    componentStack,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const errors: ErrorLogEntry[] = stored ? JSON.parse(stored) : [];

    // Add new error at the beginning
    errors.unshift(entry);

    // Keep only last N errors
    if (errors.length > MAX_ERRORS) {
      errors.length = MAX_ERRORS;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(errors));
  } catch (e) {
    console.warn('[ErrorLogger] Failed to save to localStorage:', e);
  }
}
