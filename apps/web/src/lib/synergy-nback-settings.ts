import type { ModeSettings } from '@neurodual/logic';
import type { SynergyConfig } from '../stores/synergy-store';

/**
 * Build resolved N-Back mode settings for the synergy loop.
 *
 * The synergy loop uses Brain Workshop (sim-brainworkshop) as its N-Back mode.
 * Each synergy modality maps to a single-modality (uni-modal) N-Back:
 *
 * - 'position' → activeModalities: ['position']
 * - 'audio'    → activeModalities: ['audio']
 * - 'color'    → activeModalities: ['color']
 * - 'image'    → activeModalities: ['image']
 */
export interface CalibrationNbackConfig {
  readonly nLevel: number;
  readonly blockSize: number;
  readonly nbackModalities: readonly string[];
}

export function buildResolvedNbackModeSettings(input: {
  readonly modeSettings?: ModeSettings | undefined;
  readonly journeyNLevel?: number | undefined;
  readonly synergyConfig?:
    | Pick<SynergyConfig, 'nbackModality' | 'nbackNLevel' | 'nbackTrialsCount'>
    | undefined;
  readonly calibrationConfig?: CalibrationNbackConfig | undefined;
}): ModeSettings {
  const merged: ModeSettings = { ...(input.modeSettings ?? {}) };

  // Calibration mode: fully overrides settings, no free-mode leakage
  if (input.calibrationConfig) {
    return {
      nLevel: input.calibrationConfig.nLevel,
      trialsCount: input.calibrationConfig.blockSize,
      trialsCountMode: 'manual',
      activeModalities: input.calibrationConfig.nbackModalities,
      guaranteedMatchProbability: 0.2,
      interferenceProbability: 0.125,
    } as ModeSettings;
  }

  if (typeof input.journeyNLevel === 'number' && Number.isFinite(input.journeyNLevel)) {
    merged.nLevel = input.journeyNLevel;
  }

  if (input.synergyConfig) {
    const modality = input.synergyConfig.nbackModality;
    merged.nLevel = input.synergyConfig.nbackNLevel;
    merged.trialsCount = input.synergyConfig.nbackTrialsCount;
    merged.trialsCountMode = 'manual';
    merged.guaranteedMatchProbability = 0.2;
    merged.interferenceProbability = 0.125;
    merged.activeModalities = [modality];
  }

  return merged;
}
