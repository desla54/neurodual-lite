/**
 * AdminSettingsTab - Admin settings and visual theme controls
 *
 * Contains the hybrid capture theme toggle and other admin-level settings.
 */

import type { ReactNode } from 'react';
import { Button, Card } from '@neurodual/ui';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';

export function AdminSettingsTab(): ReactNode {
  const { t } = useTranslation();
  const darkMode = useSettingsStore((s) => s.ui.darkMode);
  const visualThemePreset = useSettingsStore((s) => s.ui.visualThemePreset);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const setVisualThemePreset = useSettingsStore((s) => s.setVisualThemePreset);

  return (
    <div className="space-y-6">
      {/* Hybrid capture theme */}
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">
              {t('admin.captureTheme.title', 'Hybrid capture theme')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                'admin.captureTheme.description',
                'Keeps the normal visual identity, but reduces blur, aggressive shadows, and decorative weave patterns for cleaner screenshots.',
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                'admin.captureTheme.note',
                'Designed as a middle ground: less fragile than the default theme, but less flat than a fully stripped capture theme.',
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={visualThemePreset === 'capture-hybrid' ? 'primary' : 'secondary'}
              onClick={() => setVisualThemePreset('capture-hybrid')}
            >
              {t('admin.captureTheme.enable', 'Enable hybrid capture')}
            </Button>
            <Button
              variant={visualThemePreset === 'default' ? 'primary' : 'secondary'}
              onClick={() => setVisualThemePreset('default')}
            >
              {t('admin.captureTheme.disable', 'Use default theme')}
            </Button>
            <Button variant="secondary" onClick={() => setDarkMode(false)} disabled={!darkMode}>
              {t('admin.captureTheme.lightMode', 'Force light mode')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Current settings summary */}
      <Card>
        <h3 className="text-sm font-semibold mb-3">Current Settings</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Theme Preset</p>
            <p className="text-sm font-mono font-bold">{visualThemePreset}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Dark Mode</p>
            <p className="text-sm font-mono font-bold">{darkMode ? 'ON' : 'OFF'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
