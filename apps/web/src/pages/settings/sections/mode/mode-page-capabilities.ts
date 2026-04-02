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
  const isCustom = mode === 'custom';
  const isDualnbackClassic = mode === 'dualnback-classic';
  const isTower = mode === 'tower';
  const isGridlock = mode === 'gridlock';
  const isStroop = mode === 'stroop';
  const isFlanker = mode === 'flanker';

  return {
    supportsPresets: !isDualnbackClassic && !isTower && !isGridlock && !isStroop && !isFlanker,
    inlineBaseSettings: isStroop || isFlanker,
    hasTempo: isBrainWorkshop || isCustom,
    hasGenerator: isBrainWorkshop || isCustom,
    hasAdvanced: isGridlock || isBrainWorkshop || (alphaEnabled && isDualnbackClassic),
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
