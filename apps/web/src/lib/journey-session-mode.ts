import { DUAL_TRACK_DNB_HYBRID_MODE_ID } from '@neurodual/logic';

interface ResolveConcreteJourneySessionModeInput {
  readonly journeyGameModeId?: string;
  readonly nextSessionGameModeId?: string;
  readonly fallbackModeId?: string;
}

interface CanUseJourneySettingsScopeInput {
  readonly journeyGameModeId?: string;
  readonly modeId?: string;
}

/**
 * Resolve the concrete playable session mode for a journey.
 *
 * `journeyGameModeId` is the abstract identity of the journey.
 * `nextSessionGameModeId` is the concrete mode selected by journey logic.
 */
export function resolveConcreteJourneySessionMode(
  input: ResolveConcreteJourneySessionModeInput,
): string | undefined {
  if (typeof input.nextSessionGameModeId === 'string') {
    return input.nextSessionGameModeId;
  }

  if (input.journeyGameModeId === DUAL_TRACK_DNB_HYBRID_MODE_ID) {
    if (
      typeof input.fallbackModeId === 'string' &&
      input.fallbackModeId !== DUAL_TRACK_DNB_HYBRID_MODE_ID
    ) {
      return input.fallbackModeId;
    }
    return 'dual-track';
  }

  return input.journeyGameModeId ?? input.fallbackModeId;
}

export function canUseJourneySettingsScope(input: CanUseJourneySettingsScopeInput): boolean {
  const { journeyGameModeId, modeId } = input;
  if (typeof journeyGameModeId !== 'string' || typeof modeId !== 'string') {
    return false;
  }

  if (journeyGameModeId === DUAL_TRACK_DNB_HYBRID_MODE_ID) {
    return modeId === 'dual-track' || modeId === 'dualnback-classic';
  }

  return journeyGameModeId === modeId;
}
