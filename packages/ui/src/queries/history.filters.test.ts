import { describe, expect, test } from 'bun:test';
import {
  buildJourneyRecordableSessionsCompiledQuery,
  buildSessionSummariesWhere,
  type SessionSummariesFilters,
} from './history';

function baseFilters(): SessionSummariesFilters {
  return {
    mode: 'all',
    journeyFilter: 'all',
    freeModeFilter: 'all',
    modalities: new Set(),
    startDate: null,
    endDate: null,
    nLevels: new Set(),
  };
}

describe('history query filters', () => {
  test('Journey recordable query is strictly scoped to explicit journey context', () => {
    const compiled = buildJourneyRecordableSessionsCompiledQuery(['user-1'], 'journey-1');

    expect(compiled.sql).toContain('journey_id');
    expect(compiled.sql).toContain(`play_context`);
    expect(compiled.sql).toContain('"journey_stage_id" is not null');
    expect(compiled.sql).not.toContain('"journey_id" is null');
    expect(compiled.parameters).toContain('user-1');
    expect(compiled.parameters).toContain('journey-1');
  });

  test('Journey recordable query supports authenticated + local fallback users', () => {
    const compiled = buildJourneyRecordableSessionsCompiledQuery(
      ['user-auth', 'local'],
      'journey-1',
    );

    expect(compiled.sql).toContain('"user_id" in (?, ?)');
    expect(compiled.parameters).toContain('user-auth');
    expect(compiled.parameters).toContain('local');
  });

  test('Journey mode filters strictly by play_context', () => {
    const filters: SessionSummariesFilters = {
      ...baseFilters(),
      mode: 'Journey',
      journeyFilter: 'all',
    };

    const { whereSql, params } = buildSessionSummariesWhere('local', filters);
    expect(whereSql).toContain(`play_context = 'journey'`);
    expect(params).toEqual(['local']);
  });

  test('Journey mode with journeyFilter adds journey_id predicate', () => {
    const filters: SessionSummariesFilters = {
      ...baseFilters(),
      mode: 'Journey',
      journeyFilter: 'dualnback-classic-journey',
    };

    const { whereSql, params } = buildSessionSummariesWhere('user-1', filters);
    expect(whereSql).toContain('journey_id = ?');
    expect(params).toEqual(['user-1', 'dualnback-classic-journey']);
  });

  test('Libre mode filters strictly by free play_context', () => {
    const filters: SessionSummariesFilters = {
      ...baseFilters(),
      mode: 'Libre',
    };

    const { whereSql, params } = buildSessionSummariesWhere('user-1', filters);
    expect(whereSql).toContain(`play_context = 'free'`);
    expect(params).toEqual(['user-1']);
  });

  test('Libre mode with free mode filter also constrains game_mode', () => {
    const filters: SessionSummariesFilters = {
      ...baseFilters(),
      mode: 'Libre',
      freeModeFilter: 'DualnbackClassic',
    };

    const { whereSql, params } = buildSessionSummariesWhere('user-1', filters);
    expect(whereSql).toContain(`play_context = 'free'`);
    expect(whereSql).toContain('game_mode IN (?)');
    expect(params).toEqual(['user-1', 'dualnback-classic']);
  });

  test('DualnbackClassic mode filters by game_mode ids', () => {
    const filters: SessionSummariesFilters = {
      ...baseFilters(),
      mode: 'DualnbackClassic',
    };

    const { whereSql, params } = buildSessionSummariesWhere('user-1', filters);
    expect(whereSql).toContain('game_mode IN (?)');
    expect(params).toEqual(['user-1', 'dualnback-classic']);
  });
});
