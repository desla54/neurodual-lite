import { toast, useChallenge20Query, usePipelineState } from '@neurodual/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getReportLocalDay, isChallengeValidatedToday } from '../lib/challenge-feedback';
import { useSettingsStore } from '../stores/settings-store';

const TOASTED_SESSION_IDS_STORAGE_KEY = 'nd:challenge-validation-toast-session-ids';

function loadToastedSessionIds(): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.sessionStorage.getItem(TOASTED_SESSION_IDS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function persistToastedSessionIds(sessionIds: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      TOASTED_SESSION_IDS_STORAGE_KEY,
      JSON.stringify(Array.from(sessionIds)),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function ChallengeDayValidationObserver(): ReactNode {
  const { t } = useTranslation();
  const pipelineState = usePipelineState();
  const challengeTotalDays = useSettingsStore((s) => s.ui.challengeTotalDays);
  const challengeTargetMinutesPerDay = useSettingsStore((s) => s.ui.challengeTargetMinutesPerDay);
  const challengeStartedAtDay = useSettingsStore((s) => s.ui.challengeStartedAtDay);
  const toastedSessionIdsRef = useRef<Set<string> | null>(null);

  if (toastedSessionIdsRef.current === null) {
    toastedSessionIdsRef.current = loadToastedSessionIds();
  }

  const { data: challengeState } = useChallenge20Query({
    totalDays: challengeTotalDays,
    targetMinutesPerDay: challengeTargetMinutesPerDay,
    startDay: challengeStartedAtDay,
  });

  useEffect(() => {
    if (!challengeStartedAtDay) return;

    const report = pipelineState.result?.report;
    if (!report) return;
    const toastedSessionIds = toastedSessionIdsRef.current;
    if (!toastedSessionIds) return;

    const sessionId = report.sessionId;
    if (!sessionId || toastedSessionIds.has(sessionId)) return;

    const reportDay = getReportLocalDay(report);
    if (!reportDay || reportDay !== challengeState.today) return;
    if (reportDay.localeCompare(challengeStartedAtDay) < 0) return;
    if (!isChallengeValidatedToday(challengeState)) return;

    const currentDurationMs = challengeState.todayDurationMs;
    const reportDurationMs = Math.max(0, Number(report.durationMs ?? 0));
    const targetDurationMs = challengeState.config.targetMinutesPerDay * 60_000;
    const previousDurationMs = Math.max(0, currentDurationMs - reportDurationMs);

    if (reportDurationMs <= 0) return;
    if (currentDurationMs < targetDurationMs) return;
    if (previousDurationMs >= targetDurationMs) return;

    toast.success(
      t(
        'home.challenge.toastValidated',
        'Well done, you reached your daily goal of {{minutes}} min.',
        { minutes: challengeState.config.targetMinutesPerDay },
      ),
    );

    toastedSessionIds.add(sessionId);
    persistToastedSessionIds(toastedSessionIds);
  }, [challengeStartedAtDay, challengeState, pipelineState.result?.report, t]);

  return null;
}
