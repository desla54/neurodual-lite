import type { GameMode } from '../../config';

export type ModeSubPage = 'mode' | 'presets' | 'base' | 'tempo' | 'generator' | 'advanced';

export interface ModePageCapabilities {
  readonly supportsPresets: boolean;
  readonly inlineBaseSettings: boolean;
  readonly hasTempo: boolean;
  readonly hasGenerator: boolean;
  readonly hasAdvanced: boolean;
}

export function getModePageCapabilities(
  mode: GameMode,
  alphaEnabled: boolean,
): ModePageCapabilities {
  const isBrainWorkshop = mode === 'sim-brainworkshop';
  const isDualTrace = mode === 'dual-trace';
  const isCustom = mode === 'custom';
  const isDualPlace = mode === 'dual-place';
  const isDualPick = mode === 'dual-pick';
  const isDualMemo = mode === 'dual-memo';
  const isDualTrack = mode === 'dual-track';
  const isDualCatch = mode === 'dual-catch';
  const isDualnbackClassic = mode === 'dualnback-classic';
  const isTower = mode === 'tower';
  const isGridlock = mode === 'gridlock';
  const isStroop = mode === 'stroop';
  const isFlanker = mode === 'flanker';

  return {
    supportsPresets: !isDualnbackClassic && !isTower && !isGridlock && !isStroop && !isFlanker,
    inlineBaseSettings: isStroop || isFlanker,
    hasTempo: isBrainWorkshop || isDualTrack || isDualTrace || isCustom,
    hasGenerator: isBrainWorkshop || isDualPlace || isDualPick || isCustom,
    hasAdvanced:
      isGridlock ||
      isBrainWorkshop ||
      isDualMemo ||
      isDualPlace ||
      isDualTrace ||
      (alphaEnabled && (isDualCatch || isDualMemo || isDualPlace || isDualPick)),
  };
}

export function supportsModeSubPage(
  mode: GameMode,
  subPage: Exclude<ModeSubPage, 'mode'>,
  alphaEnabled: boolean,
): boolean {
  const capabilities = getModePageCapabilities(mode, alphaEnabled);

  switch (subPage) {
    case 'presets':
      return capabilities.supportsPresets;
    case 'base':
      return true;
    case 'tempo':
      return capabilities.hasTempo;
    case 'generator':
      return capabilities.hasGenerator;
    case 'advanced':
      return capabilities.hasAdvanced;
  }
}
