import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Bug, Moon, SlidersHorizontal, Sun, X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

interface CognitiveQuickSettingsOverlayProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children?: ReactNode;
  readonly fullMenuState?: unknown;
  readonly onBeforeOpenFullMenu?: () => void;
  readonly isDarkMode?: boolean;
  readonly onThemeToggle?: () => void;
  readonly onBugReport?: () => void;
}

export function CognitiveQuickSettingsOverlay({
  isOpen,
  onClose,
  title,
  children,
  fullMenuState,
  onBeforeOpenFullMenu,
  isDarkMode,
  onThemeToggle,
  onBugReport,
}: CognitiveQuickSettingsOverlayProps): ReactNode {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label={t('common.close', 'Close')}
      />

      <div className="relative w-[min(420px,92vw)] max-h-[80vh] overflow-auto rounded-2xl border border-border bg-background p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold uppercase tracking-wide text-foreground">
              {title ?? t('game.settings.title', 'Settings')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('game.settings.quickHint', 'Adjust a few settings without leaving the game.')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onBugReport && (
              <button
                type="button"
                onClick={onBugReport}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
                aria-label={t('settings.about.reportBug')}
                title={t('settings.about.reportBug')}
              >
                <Bug size={18} />
              </button>
            )}
            {typeof isDarkMode === 'boolean' && onThemeToggle && (
              <button
                type="button"
                onClick={onThemeToggle}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
                aria-label={t('settings.visual.darkMode', 'Dark mode')}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors"
              aria-label={t('common.close', 'Close')}
            >
              <X size={18} className="text-destructive" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {children ? (
            <div className="rounded-xl border border-border bg-white/50 p-4 dark:bg-white/[0.05]">
              {children}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-white/50 p-4 text-sm text-muted-foreground dark:bg-white/[0.05]">
              {t(
                'game.settings.quickUnavailable',
                'No quick settings available for this mode yet.',
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Link
              to="/settings/mode"
              state={fullMenuState}
              onClick={() => {
                onBeforeOpenFullMenu?.();
                onClose();
              }}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <SlidersHorizontal size={14} />
              <span>{t('trace.settings.fullMenu', 'Full menu')}</span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98]"
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
