import type { LocalNotificationDescriptor } from '@capacitor/local-notifications';
import i18n from '../i18n';
import type { TrainingReminderWeekday } from '../stores/settings-store';

const TRAINING_REMINDER_CHANNEL_ID = 'training-reminders';
const TRAINING_REMINDER_ID_BASE = 4200;
const DEFAULT_HOUR = 20;
const DEFAULT_MINUTE = 0;

const ALL_TRAINING_REMINDER_IDS: LocalNotificationDescriptor[] = [
  { id: TRAINING_REMINDER_ID_BASE + 1 },
  { id: TRAINING_REMINDER_ID_BASE + 2 },
  { id: TRAINING_REMINDER_ID_BASE + 3 },
  { id: TRAINING_REMINDER_ID_BASE + 4 },
  { id: TRAINING_REMINDER_ID_BASE + 5 },
  { id: TRAINING_REMINDER_ID_BASE + 6 },
  { id: TRAINING_REMINDER_ID_BASE + 7 },
];

type CapacitorType = typeof import('@capacitor/core')['Capacitor'];
type LocalNotificationsType = typeof import('@capacitor/local-notifications')['LocalNotifications'];
type WeekdayType = typeof import('@capacitor/local-notifications')['Weekday'];

let nativeDepsPromise: Promise<{
  Capacitor: CapacitorType;
  LocalNotifications: LocalNotificationsType;
  Weekday: WeekdayType;
}> | null = null;

function loadNativeDeps(): Promise<{
  Capacitor: CapacitorType;
  LocalNotifications: LocalNotificationsType;
  Weekday: WeekdayType;
}> {
  if (!nativeDepsPromise) {
    nativeDepsPromise = Promise.all([
      import('@capacitor/core'),
      import('@capacitor/local-notifications'),
    ]).then(([core, notifications]) => ({
      Capacitor: core.Capacitor,
      LocalNotifications: notifications.LocalNotifications,
      Weekday: notifications.Weekday,
    }));
  }
  return nativeDepsPromise;
}

export interface TrainingReminderConfig {
  enabled: boolean;
  time: string;
  weekdays: TrainingReminderWeekday[];
  language?: string;
}

function parseReminderTime(time: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function normalizeWeekdays(weekdays: TrainingReminderWeekday[]): TrainingReminderWeekday[] {
  const unique = new Set<TrainingReminderWeekday>();
  for (const day of weekdays) {
    if (day >= 1 && day <= 7) {
      unique.add(day);
    }
  }
  return [...unique].sort((a, b) => a - b);
}

function mapWeekdayToCapacitor(
  weekday: TrainingReminderWeekday,
  Weekday: WeekdayType,
): number | undefined {
  switch (weekday) {
    case 1:
      return Weekday.Sunday;
    case 2:
      return Weekday.Monday;
    case 3:
      return Weekday.Tuesday;
    case 4:
      return Weekday.Wednesday;
    case 5:
      return Weekday.Thursday;
    case 6:
      return Weekday.Friday;
    case 7:
      return Weekday.Saturday;
    default:
      return undefined;
  }
}

async function ensureAndroidTrainingReminderChannel(
  Capacitor: CapacitorType,
  LocalNotifications: LocalNotificationsType,
): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;

  await LocalNotifications.createChannel({
    id: TRAINING_REMINDER_CHANNEL_ID,
    name: 'Training reminders',
    description: 'Weekly reminders for Neurodual training sessions',
    importance: 3,
    visibility: 1,
    vibration: true,
    lights: false,
  });
}

export async function ensureTrainingReminderPermission(): Promise<boolean> {
  const { Capacitor, LocalNotifications } = await loadNativeDeps();
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;

    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch (error) {
    console.error('[TrainingReminders] Permission check failed:', error);
    return false;
  }
}

export async function syncTrainingReminders(config: TrainingReminderConfig): Promise<void> {
  const { Capacitor, LocalNotifications, Weekday } = await loadNativeDeps();
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Always clear previous reminder schedule first to keep one source of truth.
    await LocalNotifications.cancel({ notifications: ALL_TRAINING_REMINDER_IDS });

    if (!config.enabled) return;

    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;

    const weekdays = normalizeWeekdays(config.weekdays);
    if (weekdays.length === 0) return;

    await ensureAndroidTrainingReminderChannel(Capacitor, LocalNotifications);

    const { hour, minute } = parseReminderTime(config.time);
    const t = i18n.getFixedT(config.language ?? i18n.language, 'translation');
    const title = t('settings.accessibility.reminderNotificationTitle', 'Neurodual');
    const body = t(
      'settings.accessibility.reminderNotificationBody',
      "It's time for your training",
    );

    await LocalNotifications.schedule({
      notifications: weekdays
        .map((weekday) => {
          const mappedWeekday = mapWeekdayToCapacitor(weekday, Weekday);
          if (mappedWeekday === undefined) return null;

          return {
            id: TRAINING_REMINDER_ID_BASE + weekday,
            title,
            body,
            channelId: TRAINING_REMINDER_CHANNEL_ID,
            schedule: {
              on: {
                weekday: mappedWeekday,
                hour,
                minute,
              },
              repeats: true,
              allowWhileIdle: true,
            },
            extra: {
              kind: 'training-reminder',
              weekday,
            },
          };
        })
        .filter(
          (notification): notification is NonNullable<typeof notification> => notification !== null,
        ),
    });
  } catch (error) {
    console.error('[TrainingReminders] Failed to sync reminders:', error);
  }
}
