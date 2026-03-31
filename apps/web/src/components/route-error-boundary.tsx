/**
 * Route-level error boundary for React Router.
 * Handles errors thrown during route loading or rendering.
 * Design matches the "Woven Ink" theme.
 */

import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { House, ArrowClockwise } from '@phosphor-icons/react';
import { Logo } from '@neurodual/ui';
import { useEffect, useMemo, useState } from 'react';
import { attemptAutoReload, canAttemptAutoReload } from '../services/reload-recovery';

type ErrorType =
  | 'generic'
  | 'notFound'
  | 'unauthorized'
  | 'forbidden'
  | 'serverError'
  | 'updateAvailable';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!(error instanceof Error)) return;
    import('../services/sentry')
      .then(({ reportError }) => {
        reportError(error, { route: window.location.pathname });
      })
      .catch(() => {});
  }, [error]);

  // Determine error type
  let errorType: ErrorType = 'generic';
  let statusCode: number | null = null;

  const isChunkError = useMemo(() => {
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Loading CSS chunk') ||
      error.message.includes('MIME type') ||
      error.message.includes("Unexpected token '<'") ||
      error.name === 'ChunkLoadError'
    );
  }, [error]);

  const canAutoReload = isChunkError && canAttemptAutoReload({ requireOnline: true });
  const [autoReloadTriggered, setAutoReloadTriggered] = useState(false);

  useEffect(() => {
    if (!canAutoReload || autoReloadTriggered) return;
    setAutoReloadTriggered(true);
    attemptAutoReload('route-chunk-load-error', { requireOnline: true });
  }, [canAutoReload, autoReloadTriggered]);

  if (autoReloadTriggered) {
    return null;
  }

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    switch (error.status) {
      case 404:
        errorType = 'notFound';
        break;
      case 401:
        errorType = 'unauthorized';
        break;
      case 403:
        errorType = 'forbidden';
        break;
      case 500:
        errorType = 'serverError';
        break;
    }
  } else if (isChunkError) {
    errorType = 'updateAvailable';
  }

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/');
  };

  // Get translated title/message
  const title =
    statusCode && errorType === 'generic'
      ? t('error.statusError', { status: statusCode })
      : errorType === 'updateAvailable'
        ? t('error.updateAvailableInfo.title')
        : t(`error.${errorType}.title`);
  const message =
    errorType === 'updateAvailable'
      ? t('error.updateAvailableInfo.message')
      : t(`error.${errorType}.message`);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-6">
      {/* Container with subtle border */}
      <div className="max-w-sm w-full">
        {/* Logo and decorative element */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            {/* Decorative circle behind logo */}
            <div className="absolute inset-0 -m-4 rounded-full bg-muted/30" />
            <Logo variant="icon" size={64} className="relative text-foreground/80" />
          </div>
        </div>

        {/* Error content */}
        <div className="text-center space-y-3 mb-8">
          {/* Status code badge for HTTP errors */}
          {statusCode && (
            <div className="inline-flex items-center justify-center px-3 py-1 bg-muted rounded-full">
              <span className="text-xs font-medium text-muted-foreground tracking-wide">
                {statusCode}
              </span>
            </div>
          )}

          <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>

          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowClockwise size={18} weight="bold" />
            {t('error.reload')}
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border text-foreground rounded-xl font-medium hover:bg-muted/50 transition-colors"
          >
            <House size={18} weight="regular" />
            {t('error.goHome')}
          </button>
        </div>

        {/* Technical details (dev only) */}
        {import.meta.env.DEV && error instanceof Error && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors text-center">
              {t('error.technicalDetails')}
            </summary>
            <pre className="mt-3 p-4 bg-muted/50 text-muted-foreground text-3xs leading-relaxed rounded-xl overflow-auto max-h-32 border border-border/50">
              {error.stack || error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
