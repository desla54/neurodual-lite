import { afterEach, describe, expect, it } from 'bun:test';
import type { GameModeId } from '@neurodual/logic';
import { Window } from 'happy-dom';
import { useSettingsStore } from './settings-store';

(() => {
  const happyWindow = new Window({ url: 'http://localhost:3000' });
  const globals = globalThis as Record<string, unknown>;
  globals['window'] = happyWindow;
  globals['document'] = happyWindow.document;
  globals['HTMLElement'] = happyWindow.HTMLElement;
  globals['HTMLMetaElement'] = happyWindow.HTMLMetaElement;
})();

const initialState = useSettingsStore.getState();

afterEach(() => {
  useSettingsStore.setState({
    currentMode: initialState.currentMode,
    freeTraining: initialState.freeTraining,
    journeyUi: initialState.journeyUi,
    savedJourneys: initialState.savedJourneys,
    ui: initialState.ui,
    modes: initialState.modes,
    _initialized: initialState._initialized,
    _settingsUpdatedAt: initialState._settingsUpdatedAt,
  });
});

describe('settings-store selection slices', () => {
  it('mirrors setCurrentMode into the freeTraining selection slice', () => {
    useSettingsStore.getState().setCurrentMode('gridlock' as GameModeId);

    const state = useSettingsStore.getState();
    expect(state.currentMode).toBe('gridlock');
    expect(state.freeTraining.selectedModeId).toBe('gridlock');
  });

  it('mirrors activateJourney into the journeyUi selection slice', () => {
    useSettingsStore.getState().activateJourney('sim-brainworkshop-journey');

    const state = useSettingsStore.getState();
    expect(state.ui.activeJourneyId).toBe('sim-brainworkshop-journey');
    expect(state.journeyUi.selectedJourneyId).toBe('sim-brainworkshop-journey');
  });

  it('loads selection slices from persisted settings with backward compatibility', () => {
    useSettingsStore.getState()._loadSettings({
      currentMode: 'dualnback-classic',
      freeTraining: { selectedModeId: 'stroop-flex' },
      journeyUi: { selectedJourneyId: 'sim-brainworkshop-journey' },
      savedJourneys: useSettingsStore.getState().savedJourneys,
      modes: useSettingsStore.getState().modes as never,
      ui: {
        ...useSettingsStore.getState().ui,
        activeJourneyId: 'dualnback-classic-journey',
      },
    } as never);

    const state = useSettingsStore.getState();
    expect(state.currentMode).toBe('stroop-flex');
    expect(state.freeTraining.selectedModeId).toBe('stroop-flex');
    expect(state.journeyUi.selectedJourneyId).toBe('sim-brainworkshop-journey');
    expect(state.ui.activeJourneyId).toBe('sim-brainworkshop-journey');
  });
});
