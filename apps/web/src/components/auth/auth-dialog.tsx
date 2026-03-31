/**
 * AuthDialog — stub for NeuroDual Lite (auth features removed).
 *
 * Keeps the public API so ProfileButton can import it without errors.
 * In the lite build the dialog is never rendered (premium/auth is disabled).
 */

import type { ReactNode } from 'react';

export interface AuthDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/** No-op auth dialog for lite builds */
export function AuthDialog(_props: AuthDialogProps): ReactNode {
  return null;
}
