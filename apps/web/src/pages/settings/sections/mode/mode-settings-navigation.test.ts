import { describe, expect, it } from 'bun:test';

import { getModeSettingsNavigation } from './mode-settings-navigation';

describe('mode settings navigation copy', () => {
  it('provides mode-specific copy for gridlock', () => {
    const copy = getModeSettingsNavigation('gridlock');

    expect(copy.sectionTitleDefault).toBe('Reglages Gridlock');
    expect(copy.base.titleDefault).toBe('Structure de session');
    expect(copy.base.subtitleDefault).toContain('Profil');
    expect(copy.advanced.titleDefault).toBe('Aides et reperes');
  });

  it('provides clearer stable-mode copy where needed', () => {
    expect(getModeSettingsNavigation('tower').base.titleDefault).toBe('Puzzles et difficulte');
    expect(getModeSettingsNavigation('dual-track').base.titleDefault).toBe('Cibles et modalites');
  });
});
