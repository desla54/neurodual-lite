import { afterEach, describe, expect, it } from 'bun:test';
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

describe('trace settings scopes', () => {
  it('stores free-training dual trace timing in the mode settings namespace', () => {
    useSettingsStore.getState().setModeSettingFor('dual-trace', 'traceIsiMs' as never, 3100 as never);

    const state = useSettingsStore.getState();
    expect((state.modes['dual-trace'] as Record<string, unknown>)['traceIsiMs']).toBe(3100);
    expect(state.ui.traceIsiMs).toBe(initialState.ui.traceIsiMs);
  });

  it('stores journey dual trace timing in the journey settings namespace', () => {
    useSettingsStore.getState().setJourneyModeSetting(
      'sim-brainworkshop-journey',
      'traceIsiMs' as never,
      4200 as never,
    );

    const state = useSettingsStore.getState();
    expect(
      (state.ui.journeyModeSettingsByJourneyId['sim-brainworkshop-journey'] as Record<string, unknown>)[
        'traceIsiMs'
      ],
    ).toBe(4200);
    expect((state.modes['dual-trace'] as Record<string, unknown> | undefined)?.['traceIsiMs']).toBeUndefined();
    expect(state.ui.traceIsiMs).toBe(initialState.ui.traceIsiMs);
  });
});
