import type { JourneyStrategyConfig } from '@neurodual/logic';
import { createJourneyPlayIntent, type PlayIntentState } from './play-intent';

export interface ResolveReportJourneyActionInput {
  readonly stageId: number;
  readonly nLevel: number;
  readonly journeyId?: string;
  readonly currentJourneyStageId?: number;
  readonly currentJourneyId?: string;
  readonly reportNLevel: number;
  readonly suggestedStartLevel?: number;
  readonly journeyGameModeId?: string;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
  readonly currentSessionGameModeId?: string;
  readonly nextSessionGameModeId?: string;
}

export type ResolvedReportJourneyAction =
  | {
      readonly kind: 'relaunch-current-session';
      readonly overrideNLevel?: number;
    }
  | {
      readonly kind: 'navigate';
      readonly intent: PlayIntentState;
    };

export function resolveReportJourneyAction(
  input: ResolveReportJourneyActionInput,
): ResolvedReportJourneyAction {
  const shouldUseSuggestedLevel =
    typeof input.suggestedStartLevel === 'number' &&
    Number.isFinite(input.suggestedStartLevel) &&
    input.suggestedStartLevel < input.reportNLevel;

  const targetsCurrentJourneySession =
    input.stageId === input.currentJourneyStageId && input.journeyId === input.currentJourneyId;
  const switchesSessionMode =
    typeof input.currentSessionGameModeId === 'string' &&
    typeof input.nextSessionGameModeId === 'string' &&
    input.currentSessionGameModeId !== input.nextSessionGameModeId;

  if (targetsCurrentJourneySession && !switchesSessionMode) {
    return {
      kind: 'relaunch-current-session',
      overrideNLevel: shouldUseSuggestedLevel ? input.suggestedStartLevel : undefined,
    };
  }

  return {
    kind: 'navigate',
    intent: createJourneyPlayIntent(input.stageId, input.journeyId, {
      gameModeId: input.nextSessionGameModeId,
      journeyGameModeId: input.journeyGameModeId,
      journeyStrategyConfig: input.journeyStrategyConfig,
      journeyNLevel: input.nLevel,
    }),
  };
}
