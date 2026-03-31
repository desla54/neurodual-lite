import { Spinner, cn } from '@neurodual/ui';
import { Warning } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmationDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmWord: string;
  readonly inputValue: string;
  readonly onInputChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly confirmLabel: string;
  readonly loadingLabel: string;
  readonly confirmIcon: ReactNode;
  readonly variant: 'warning' | 'destructive';
}

export function ConfirmationDialog({
  title,
  description,
  confirmWord,
  inputValue,
  onInputChange,
  onConfirm,
  onCancel,
  isLoading,
  error,
  confirmLabel,
  loadingLabel,
  confirmIcon,
  variant,
}: ConfirmationDialogProps): ReactNode {
  const { t } = useTranslation();
  const canConfirm = inputValue.toUpperCase() === confirmWord;
  const isWarning = variant === 'warning';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center page-overlay-padding"
    >
      <button
        type="button"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        aria-label={t('common.close', 'Close')}
        disabled={isLoading}
      />

      <div className="relative w-full max-w-sm animate-in rounded-2xl border border-border/50 bg-surface/95 p-5 shadow-soft backdrop-blur-xl fade-in zoom-in-95">
        <div className="mb-5 text-center">
          <div
            className={cn(
              'mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl',
              isWarning ? 'bg-amber-50' : 'bg-destructive/10',
            )}
          >
            <Warning
              className={cn('h-7 w-7', isWarning ? 'text-amber-600' : 'text-destructive')}
              weight="regular"
            />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            {t('settings.data.typeToConfirm', 'Type {{word}} to confirm', {
              word: confirmWord,
            })}
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={confirmWord}
            className={cn(
              'w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono uppercase tracking-widest outline-none transition-all',
              isWarning ? 'focus:border-amber-400' : 'focus:border-destructive',
            )}
            disabled={isLoading}
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || isLoading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
              isWarning
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-destructive hover:bg-destructive/90',
            )}
          >
            {isLoading ? (
              <>
                <Spinner size={18} className="text-white" />
                {loadingLabel}
              </>
            ) : (
              <>
                {confirmIcon}
                {confirmLabel}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
