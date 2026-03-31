/**
 * Legal section - legal links and version info
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ShieldCheck } from '@phosphor-icons/react';
import { Card, Section } from '@neurodual/ui';

const LEGAL_LINKS = [
  { href: '/legal/mentions', labelKey: 'settings.legal.mentions' },
  { href: '/legal/privacy', labelKey: 'settings.legal.privacy' },
  { href: '/legal/terms', labelKey: 'settings.legal.terms' },
  { href: '/legal/cgv', labelKey: 'settings.legal.sales' },
];

export function LegalSection(): ReactNode {
  const { t } = useTranslation();

  return (
    <Section title={t('settings.legal.title')}>
      <Card className="space-y-0 divide-y divide-border" padding="none">
        {LEGAL_LINKS.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
          >
            <ShieldCheck size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground flex-1">
              {t(link.labelKey)}
            </span>
          </Link>
        ))}
      </Card>
      <div className="text-center mt-6 mb-2">
        <p className="text-3xs text-muted-foreground/50 font-mono">
          {t('settings.legal.version', {
            version: '2.0.0',
            date: new Date().toISOString().split('T')[0],
          })}
        </p>
      </div>
    </Section>
  );
}
