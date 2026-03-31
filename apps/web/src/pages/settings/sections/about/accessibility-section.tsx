/**
 * Accessibility settings section
 * - Reduced motion
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Waveform } from '@phosphor-icons/react';
import { Card, Section, Toggle } from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';

export function AccessibilitySection(): ReactNode {
  const { t } = useTranslation();

  // Reduced motion
  const reducedMotion = useSettingsStore((s) => s.ui.reducedMotion);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);

  return (
    <div className="space-y-6">
      <Section title={t('settings.accessibility.reducedMotion')}>
        <Card className="space-y-0 divide-y divide-border">
          <Toggle
            label={t('settings.accessibility.reducedMotion')}
            description={t(
              'settings.accessibility.reducedMotionDesc',
              'Limite les animations pour plus de confort',
            )}
            checked={reducedMotion}
            onChange={setReducedMotion}
            icon={<Waveform size={20} weight="regular" />}
            activeColor="primary"
          />
        </Card>
      </Section>
    </div>
  );
}
