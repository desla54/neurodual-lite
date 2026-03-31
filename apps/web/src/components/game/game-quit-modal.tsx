/**
 * GameQuitModal - Confirmation modal for quitting a game session
 *
 * Displays a modal dialog asking the user to confirm they want to quit.
 */

import type { ReactNode } from 'react';
import { Button } from '@neurodual/ui';

export interface GameQuitModalLabels {
  title: string;
  message: string;
  cancel: string;
  confirm: string;
  close: string;
}

export interface GameQuitModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Labels for modal content */
  labels: GameQuitModalLabels;
  /** Called when user cancels (wants to continue playing) */
  onCancel: () => void;
  /** Called when user confirms they want to quit */
  onConfirm: () => void;
}

/**
 * Modal dialog for confirming game session quit.
 */
export function GameQuitModal({
  open,
  labels,
  onCancel,
  onConfirm,
}: GameQuitModalProps): ReactNode {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-overlay-padding">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={labels.close}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
        onClick={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />

      {/* Modal */}
      <div className="relative bg-woven-surface border border-woven-border rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-lg font-semibold text-woven-text mb-2">{labels.title}</h2>
        <p className="text-sm text-woven-text-muted mb-6">{labels.message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-woven-incorrect hover:opacity-90 text-white font-medium rounded-lg transition-opacity"
          >
            {labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
