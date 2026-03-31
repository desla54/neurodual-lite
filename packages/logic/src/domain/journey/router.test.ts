/**
 * Tests for Journey Router
 */

import { describe, expect, test } from 'bun:test';
import {
  getJourneyRoute,
  buildNavigationParams,
  hasSpecificRoute,
  getRouteForGameMode,
} from './router';
import type { JourneyStageDefinition, JourneyConfig } from '../../types/journey';

describe('Journey Router', () => {
  const mockStage: JourneyStageDefinition = {
    stageId: 1,
    nLevel: 2,
    mode: 'simulator',
  };

  const mockConfig: JourneyConfig = {
    journeyId: 'journey-789',
    startLevel: 1,
    targetLevel: 5,
    gameMode: 'dualnback-classic',
  };

  describe('getJourneyRoute()', () => {
    test('should return /nback for simulator mode with gameMode', () => {
      expect(getJourneyRoute(mockStage, 'dualnback-classic')).toBe('/nback');
      expect(getJourneyRoute(mockStage, 'sim-brainworkshop')).toBe('/nback');
    });

    test('should return /nback for unknown gameMode', () => {
      expect(getJourneyRoute(mockStage, 'unknown')).toBe('/nback');
    });

    test('should return /nback when no gameMode provided', () => {
      expect(getJourneyRoute(mockStage)).toBe('/nback');
    });
  });

  describe('buildNavigationParams()', () => {
    test('should build complete navigation params', () => {
      const params = buildNavigationParams(mockStage, mockConfig);

      expect(params.route).toBe('/nback');
      expect(params.state.journeyId).toBe('journey-789');
      expect(params.state.stageId).toBe(1);
      expect(params.state.nLevel).toBe(2);
      expect(params.state.gameMode).toBe('dualnback-classic');
    });
  });

  describe('Utility methods', () => {
    test('hasSpecificRoute should identify mapped modes', () => {
      expect(hasSpecificRoute('dualnback-classic')).toBe(true);
      expect(hasSpecificRoute('unknown-mode')).toBe(false);
    });

    test('getRouteForGameMode should return correct route or default', () => {
      expect(getRouteForGameMode('dualnback-classic')).toBe('/nback');
      expect(getRouteForGameMode('unknown')).toBe('/nback');
    });
  });
});
