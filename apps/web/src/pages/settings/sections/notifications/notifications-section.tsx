/**
 * Notifications settings section
 * - Training reminders (native only)
 */

import { Capacitor } from '@capacitor/core';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from '@phosphor-icons/react';
import { Card, Section, TimePicker, Toggle, toast } from '@neurodual/ui';
import { useSettingsStore } from '../../../../stores';
import type { TrainingReminderWeekday } from '../../../../stores/settings-store';
import { ensureTrainingReminderPermission } from '../../../../services/training-reminders';

const WEEKDAY_OPTIONS: Array<{
  day: TrainingReminderWeekday;
  labelKey: string;
  fallback: string;
}> = [
  { day: 2, labelKey: 'settings.accessibility.reminderDaysShort.mon', fallback: 'Lun' },
  { day: 3, labelKey: 'settings.accessibility.reminderDaysShort.tue', fallback: 'Mar' },
  { day: 4, labelKey: 'settings.accessibility.reminderDaysShort.wed', fallback: 'Mer' },
  { day: 5, labelKey: 'settings.accessibility.reminderDaysShort.thu', fallback: 'Jeu' },
  { day: 6, labelKey: 'settings.accessibility.reminderDaysShort.fri', fallback: 'Ven' },
  { day: 7, labelKey: 'settings.accessibility.reminderDaysShort.sat', fallback: 'Sam' },
  { day: 1, labelKey: 'settings.accessibility.reminderDaysShort.sun', fallback: 'Dim' },
];

export function NotificationsSection(): ReactNode {
  const { t } = useTranslation();
  const isNative = Capacitor.isNativePlatform();

  const trainingRemindersEnabled = useSettingsStore((s) => s.ui.trainingRemindersEnabled);
  const setTrainingRemindersEnabled = useSettingsStore((s) => s.setTrainingRemindersEnabled);
  const trainingReminderTime = useSettingsStore((s) => s.ui.trainingReminderTime);
  const setTrainingReminderTime = useSettingsStore((s) => s.setTrainingReminderTime);
  const trainingReminderWeekdays = useSettingsStore((s) => s.ui.trainingReminderWeekdays);
  const toggleTrainingReminderWeekday = useSettingsStore((s) => s.toggleTrainingReminderWeekday);

  const selectedWeekdays = new Set(trainingReminderWeekdays);

  const handleTrainingRemindersToggle = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        setTrainingRemindersEnabled(false);
        return;
      }
      if (!isNative) {
        setTrainingRemindersEnabled(false);
        return;
      }

      const granted = await ensureTrainingReminderPermission();
      if (!granted) {
        setTrainingRemindersEnabled(false);
        toast.error(
          t(
            'settings.accessibility.reminderPermissionDenied',
            'Autorise les notifications pour activer les rappels.',
          ),
        );
        return;
      }

      setTrainingRemindersEnabled(true);
    },
    [isNative, setTrainingRemindersEnabled, t],
  );

  return (
    <div className="space-y-6">
      <Section title={t('settings.accessibility.reminderLabel')}>
        <Card className="space-y-0 divide-y divide-border">
          <Toggle
            label={t('settings.accessibility.reminderLabel')}
            description={
              isNative
                ? t(
                    'settings.accessibility.reminderDesc',
                    "Reçois un rappel local aux jours et à l'heure choisis",
                  )
                : t('settings.accessibility.reminderNativeOnly')
            }
            checked={trainingRemindersEnabled}
            onChange={handleTrainingRemindersToggle}
            icon={<Bell size={20} weight="regular" />}
            activeColor="primary"
            disabled={!isNative}
          />

          {trainingRemindersEnabled && isNative && (
            <div className="py-3 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-foreground">
                    {t('settings.accessibility.reminderTime')}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">
                    {t('settings.accessibility.reminderDays')}
                  </div>
                </div>
                <TimePicker
                  value={trainingReminderTime}
                  onChange={setTrainingReminderTime}
                  ariaLabel={t('settings.accessibility.reminderTime')}
                />
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_OPTIONS.map((option) => {
                  const active = selectedWeekdays.has(option.day);
                  return (
                    <button
                      key={option.day}
                      type="button"
                      onClick={() => toggleTrainingReminderWeekday(option.day)}
                      aria-pressed={active}
                      className={`h-9 rounded-lg border text-xs font-bold transition-colors ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t(option.labelKey, option.fallback)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
