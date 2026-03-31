/**
 * InfoSheet - Info icon trigger + DrawerSheet
 * Thin wrapper for the common "ℹ️ tap → explanation" pattern.
 */

import { Info } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DrawerSheet } from './drawer-sheet';

export interface InfoSheetProps {
  children: ReactNode;
  title?: string;
  iconSize?: number;
  triggerClassName?: string;
}

export function InfoSheet({
  children,
  title,
  iconSize = 14,
  triggerClassName = '',
}: InfoSheetProps): ReactNode {
  const { t } = useTranslation();

  return (
    <DrawerSheet
      title={title}
      srTitle={t('aria.moreInfo')}
      trigger={
        <button
          type="button"
          className={`inline-flex items-center justify-center p-1 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${triggerClassName}`}
          aria-label={t('aria.moreInfo')}
        >
          <Info size={iconSize} />
        </button>
      }
    >
      <div className="text-sm text-muted-foreground leading-relaxed break-words">{children}</div>
    </DrawerSheet>
  );
}
