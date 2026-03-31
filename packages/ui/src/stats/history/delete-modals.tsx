/**
 * DeleteModals - Confirmation modals for single and bulk session deletion
 *
 * Confirmation modals for history deletion flows.
 */

import type { SessionHistoryItem } from '@neurodual/logic';
import { Warning, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

export interface DeleteConfirmModalProps {
  readonly session: SessionHistoryItem;
  readonly onConfirm: (sessionId: string) => void;
  readonly onCancel: () => void;
}

export function DeleteConfirmModal({
  session,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps): ReactNode {
  const { t, i18n } = useTranslation();

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      data-testid="history-delete-modal"
    >
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />

      {/* Modal */}
      <div className="relative bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-border/50 rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <Warning size={28} className="text-destructive" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-center text-foreground mb-2">
          {t('stats.delete.deleteSession')}
        </h3>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {t('stats.delete.sessionInfo', {
            date: session.createdAt.toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            }),
            level: session.nLevel,
          })}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="history-delete-cancel"
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session.id)}
            data-testid="history-delete-confirm"
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }
  return createPortal(modal, document.body);
}

export interface BulkDeleteModalProps {
  readonly count: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function BulkDeleteModal({ count, onConfirm, onCancel }: BulkDeleteModalProps): ReactNode {
  const { t } = useTranslation();

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      data-testid="history-bulk-delete-modal"
    >
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />

      {/* Modal */}
      <div className="relative bg-surface/80 backdrop-blur-xl backdrop-saturate-150 border border-border/50 rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <Warning size={28} className="text-destructive" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-center text-foreground mb-2">
          {t('stats.delete.deleteSessions', { count })}
        </h3>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {t('stats.delete.bulkWarning')}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="history-bulk-delete-cancel"
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="history-bulk-delete-confirm"
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            {t('stats.delete.deleteAll')}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }
  return createPortal(modal, document.body);
}
