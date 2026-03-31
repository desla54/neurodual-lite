/**
 * Donation Link Component
 *
 * Displays Ko-fi donation button with official styling.
 * URL is configured via environment variable.
 */

import { useTranslation } from 'react-i18next';
import { Heart } from '@phosphor-icons/react';
import { Card } from '@neurodual/ui';
import type { ReactNode } from 'react';
import { openExternalUrl } from '../utils/open-external-url';

const KOFI_URL = import.meta.env.VITE_KOFI_URL || 'https://ko-fi.com/desla54';

export function DonationLinks(): ReactNode {
  const { t } = useTranslation();

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl shrink-0 bg-primary/10 text-primary">
          <Heart size={20} weight="regular" />
        </div>
        <div>
          <div className="font-semibold text-foreground">
            {t('settings.donation.title', 'Support Neurodual')}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('settings.donation.subtitle', 'Help us keep building')}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t(
          'settings.donation.description',
          'Neurodual is free and ad-free. If you like the project, you can support it.',
        )}
      </p>

      {/* Ko-fi Official Button Style */}
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.preventDefault();
          void openExternalUrl(KOFI_URL);
        }}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ backgroundColor: '#FF5E5B' }}
      >
        {/* Ko-fi Cup Icon (simplified SVG) */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Ko-fi"
        >
          <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
        </svg>
        <span>{t('settings.donation.kofiButton', 'Support the project')}</span>
      </a>
    </Card>
  );
}
