/**
 * Root-level error boundary for React.
 * Catches errors thrown anywhere in the app tree.
 *
 * Note: This is a class component (required for React error boundaries).
 * It cannot use hooks, so we use i18next.t() directly for translations.
 * Design matches "Woven Ink" theme with inline fallback colors.
 */

import { Component, type ReactNode } from 'react';
import { ArrowClockwise, House } from '@phosphor-icons/react';
import { Logo } from '@neurodual/ui';
import i18next from 'i18next';
import { logError } from '../services/error-logger';
import {
  attemptAutoReload,
  canAttemptAutoReload,
  type ReloadReason,
} from '../services/reload-recovery';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRecovering: boolean;
}

/**
 * Detect chunk loading errors (typical after new deployments).
 * Different browsers have different error messages.
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('error loading dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Loading CSS chunk') ||
    error.message.includes('MIME type') ||
    error.message.includes("Unexpected token '<'") ||
    error.name === 'ChunkLoadError'
  );
}

function getAutoReloadConfig(
  error: Error,
): { reason: ReloadReason; requireOnline: boolean } | null {
  if (isChunkLoadError(error)) {
    return { reason: 'chunk-load-error', requireOnline: true };
  }

  // Generic crashes: try a single guarded reload in production to recover from transient/cache issues.
  if (import.meta.env.PROD) {
    return { reason: 'react-error', requireOnline: false };
  }

  return null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isRecovering: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const autoReload = getAutoReloadConfig(error);
    const isRecovering = autoReload
      ? canAttemptAutoReload({ requireOnline: autoReload.requireOnline })
      : false;

    return { hasError: true, error, isRecovering };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to localStorage for local debugging
    logError(error, errorInfo.componentStack ?? undefined);

    // Report to Sentry for remote monitoring (lazy loaded)
    import('../services/sentry')
      .then(({ reportError }) => {
        reportError(error, {
          componentStack: errorInfo.componentStack,
        });
      })
      .catch(() => {});

    const autoReload = getAutoReloadConfig(error);
    if (!autoReload) return;

    const didTrigger = attemptAutoReload(autoReload.reason, {
      requireOnline: autoReload.requireOnline,
    });

    if (!didTrigger) {
      this.setState({ isRecovering: false });
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isChunkError = this.state.error && isChunkLoadError(this.state.error);

      // Determine title/message based on error type
      const title = this.state.isRecovering
        ? i18next.t('error.reloading', 'Reloading...')
        : isChunkError
          ? i18next.t('error.updateAvailable', 'Update available')
          : i18next.t('error.errorOccurred', 'An error occurred');
      const message = this.state.isRecovering
        ? i18next.t(
            'error.recovering',
            'Attempting automatic recovery… If this persists, you can reload manually.',
          )
        : isChunkError
          ? i18next.t(
              'error.newVersionAvailable',
              'A new version is available. Reload the app to continue.',
            )
          : i18next.t(
              'error.unexpectedError',
              'The application encountered an unexpected problem.',
            );

      return (
        // Inline styles as fallback if CSS fails to load
        <div
          className="min-h-dvh flex flex-col items-center justify-center bg-background p-6"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafaf9',
            padding: '1.5rem',
          }}
        >
          <div className="max-w-sm w-full" style={{ maxWidth: '24rem', width: '100%' }}>
            {/* Logo and decorative element */}
            <div
              className="flex flex-col items-center mb-8"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '2rem',
              }}
            >
              <div className="relative" style={{ position: 'relative' }}>
                {/* Decorative circle behind logo */}
                <div
                  className="absolute inset-0 -m-4 rounded-full bg-muted/30"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: '-1rem',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(231, 229, 228, 0.3)',
                  }}
                />
                <Logo variant="icon" size={64} className="relative text-foreground/80" />
              </div>
            </div>

            {/* Error content */}
            <div
              className="text-center space-y-3 mb-8"
              style={{ textAlign: 'center', marginBottom: '2rem' }}
            >
              <h1
                className="text-xl font-semibold text-foreground tracking-tight"
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#1c1917',
                  letterSpacing: '-0.025em',
                  margin: 0,
                }}
              >
                {title}
              </h1>

              <p
                className="text-sm text-muted-foreground leading-relaxed"
                style={{
                  fontSize: '0.875rem',
                  color: '#78716c',
                  lineHeight: 1.625,
                  marginTop: '0.75rem',
                }}
              >
                {message}
              </p>
            </div>

            {/* Actions */}
            <div
              className="flex flex-col gap-3"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                disabled={this.state.isRecovering}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#1c1917',
                  color: '#fafaf9',
                  borderRadius: '0.75rem',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  opacity: this.state.isRecovering ? 0.6 : 1,
                }}
              >
                <ArrowClockwise size={18} weight="bold" />
                {i18next.t('error.reload', 'Reload')}
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                disabled={this.state.isRecovering}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border text-foreground rounded-xl font-medium hover:bg-muted/50 transition-colors"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'transparent',
                  color: '#1c1917',
                  borderRadius: '0.75rem',
                  fontWeight: 500,
                  border: '1px solid #e7e5e4',
                  cursor: 'pointer',
                  opacity: this.state.isRecovering ? 0.6 : 1,
                }}
              >
                <House size={18} weight="regular" />
                {i18next.t('error.goHome', 'Back to home')}
              </button>
            </div>

            {/* Technical details (dev only) */}
            {import.meta.env.DEV && this.state.error && (
              <details style={{ marginTop: '1.5rem' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: 'rgba(120, 113, 108, 0.6)',
                    textAlign: 'center',
                  }}
                >
                  {i18next.t('error.technicalDetails', 'Technical details')}
                </summary>
                <pre
                  style={{
                    marginTop: '0.75rem',
                    padding: '1rem',
                    backgroundColor: 'rgba(231, 229, 228, 0.5)',
                    color: '#78716c',
                    fontSize: '10px',
                    lineHeight: 1.625,
                    borderRadius: '0.75rem',
                    overflow: 'auto',
                    maxHeight: '8rem',
                    border: '1px solid rgba(231, 229, 228, 0.5)',
                  }}
                >
                  {this.state.error.stack || this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
