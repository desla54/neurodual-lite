import { useEffect, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { syncTrainingReminders } from '../services/training-reminders';
import { useSettingsStore } from '../stores/settings-store';

interface TrainingRemindersSyncProps {
  children: ReactNode;
}

export function TrainingRemindersSync({ children }: TrainingRemindersSyncProps): ReactNode {
  const { initialized, enabled, time, weekdays, language } = useSettingsStore(
    useShallow((state) => ({
      initialized: state._initialized,
      enabled: state.ui.trainingRemindersEnabled,
      time: state.ui.trainingReminderTime,
      weekdays: state.ui.trainingReminderWeekdays,
      language: state.ui.language,
    })),
  );

  useEffect(() => {
    if (!initialized) return;

    void syncTrainingReminders({
      enabled,
      time,
      weekdays,
      language,
    });
  }, [enabled, initialized, language, time, weekdays]);

  return children;
}
