import { describe, it, expect } from 'bun:test';

import { generateFloodPuzzle } from './flood';
import { generateFifteenPuzzle } from './fifteen';
import { generateUnrulyPuzzle } from './unruly';
import { generateKeenPuzzle } from './keen';
import { generateBridgesPuzzle } from './bridges';
import { generateSlantPuzzle } from './slant';
import { generateLoopyPuzzle } from './loopy';
import { generatePearlPuzzle } from './pearl';
import { generateMagnetsPuzzle } from './magnets';
import { generateLightUpPuzzle } from './lightup';
import { generateTentsPuzzle } from './tents';
import { generateFillingPuzzle } from './filling';
import { generateDominosaPuzzle } from './dominosa';
import { generateSinglesPuzzle } from './singles';
import { generateTowersPuzzle } from './towers';
import { generateTracksPuzzle } from './tracks';
import { generateGalaxiesPuzzle } from './galaxies';
import { generateRectanglesPuzzle } from './rectangles';
import { generateBlackBoxPuzzle } from './blackbox';
import { generateUndeadPuzzle } from './undead';
import { generateMosaicPuzzle } from './mosaic';
import { generateNetPuzzle } from './net';
import { generateSignpostPuzzle } from './signpost';
import { generateInertiaPuzzle } from './inertia';
import { generateSixteenPuzzle } from './sixteen';
import { generatePalisadePuzzle } from './palisade';
import { generateRangePuzzle } from './range';
import { generateCubePuzzle } from './cube';
import { generateNetslidePuzzle } from './netslide';
import { generateFlipPuzzle } from './flip';

describe('Puzzle generators smoke tests', () => {
  it('flood: generateFloodPuzzle(6, 6, 4, 5)', () => {
    try {
      const p = generateFloodPuzzle(6, 6, 4, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(6);
      expect(p.h).toBe(6);
      expect(p.colors).toBe(4);
      expect(p.grid).toHaveLength(36);
      expect(p.movelimit).toBeGreaterThan(0);
    } catch (e) {
      console.error('flood failed:', e);
      throw e;
    }
  }, 5000);

  it('fifteen: generateFifteenPuzzle(3)', () => {
    try {
      const p = generateFifteenPuzzle(3);
      expect(p).toBeDefined();
      expect(p.size).toBe(3);
      expect(p.tiles).toHaveLength(9);
    } catch (e) {
      console.error('fifteen failed:', e);
      throw e;
    }
  }, 5000);

  it('unruly: generateUnrulyPuzzle(6, 6)', () => {
    try {
      const p = generateUnrulyPuzzle(6, 6);
      expect(p).toBeDefined();
      expect(p.w).toBe(6);
      expect(p.h).toBe(6);
      expect(p.grid).toHaveLength(36);
      expect(p.solution).toHaveLength(36);
    } catch (e) {
      console.error('unruly failed:', e);
      throw e;
    }
  }, 5000);

  it('keen: generateKeenPuzzle(4)', () => {
    try {
      const p = generateKeenPuzzle(4);
      expect(p).toBeDefined();
      expect(p.size).toBe(4);
      expect(p.grid).toHaveLength(16);
      expect(p.solution).toHaveLength(16);
      expect(p.cages.length).toBeGreaterThan(0);
    } catch (e) {
      console.error('keen failed:', e);
      throw e;
    }
  }, 5000);

  it('bridges: generateBridgesPuzzle(7, 7, 6)', () => {
    try {
      const p = generateBridgesPuzzle(7, 7, 6);
      expect(p).toBeDefined();
      expect(p.w).toBe(7);
      expect(p.h).toBe(7);
      expect(p.islands.length).toBeGreaterThan(0);
      expect(p.solution.length).toBeGreaterThan(0);
    } catch (e) {
      console.error('bridges failed:', e);
      throw e;
    }
  }, 5000);

  it('slant: generateSlantPuzzle(5, 5)', () => {
    try {
      const p = generateSlantPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.clues).toHaveLength(36); // (5+1)*(5+1)
      expect(p.solution).toHaveLength(25);
    } catch (e) {
      console.error('slant failed:', e);
      throw e;
    }
  }, 5000);

  it('loopy: generateLoopyPuzzle(5, 5)', () => {
    try {
      const p = generateLoopyPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.clues).toHaveLength(25);
      expect(p.numEdges).toBeGreaterThan(0);
      expect(p.solution.length).toBeGreaterThan(0);
    } catch (e) {
      console.error('loopy failed:', e);
      throw e;
    }
  }, 5000);

  it('pearl: generatePearlPuzzle(5, 5)', () => {
    try {
      const p = generatePearlPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.clues).toHaveLength(25);
    } catch (e) {
      console.error('pearl failed:', e);
      throw e;
    }
  }, 5000);

  it('magnets: generateMagnetsPuzzle(6, 4)', () => {
    try {
      const p = generateMagnetsPuzzle(6, 4);
      expect(p).toBeDefined();
      expect(p.w).toBe(6);
      expect(p.h).toBe(4);
      expect(p.dominoes).toHaveLength(24);
    } catch (e) {
      console.error('magnets failed:', e);
      throw e;
    }
  }, 5000);

  it('lightup: generateLightUpPuzzle(5, 5)', () => {
    try {
      const p = generateLightUpPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.grid).toHaveLength(25);
    } catch (e) {
      console.error('lightup failed:', e);
      throw e;
    }
  }, 5000);

  it('tents: generateTentsPuzzle(6, 6)', () => {
    try {
      const p = generateTentsPuzzle(6, 6);
      expect(p).toBeDefined();
      expect(p.w).toBe(6);
      expect(p.h).toBe(6);
      expect(p.grid).toHaveLength(36);
      expect(p.colClues).toHaveLength(6);
      expect(p.rowClues).toHaveLength(6);
    } catch (e) {
      console.error('tents failed:', e);
      throw e;
    }
  }, 5000);

  it('filling: generateFillingPuzzle(5, 5)', () => {
    try {
      const p = generateFillingPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.board).toHaveLength(25);
      expect(p.solution).toHaveLength(25);
    } catch (e) {
      console.error('filling failed:', e);
      throw e;
    }
  }, 5000);

  it('dominosa: generateDominosaPuzzle(3)', () => {
    try {
      const p = generateDominosaPuzzle(3);
      expect(p).toBeDefined();
      expect(p.n).toBe(3);
      expect(p.w).toBe(5); // n+2
      expect(p.h).toBe(4); // n+1
      expect(p.grid).toHaveLength(20);
    } catch (e) {
      console.error('dominosa failed:', e);
      throw e;
    }
  }, 5000);

  it('singles: generateSinglesPuzzle(5, 5)', () => {
    try {
      const p = generateSinglesPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.nums).toHaveLength(25);
      expect(p.solution).toHaveLength(25);
    } catch (e) {
      console.error('singles failed:', e);
      throw e;
    }
  }, 5000);

  it('towers: generateTowersPuzzle(4)', () => {
    try {
      const p = generateTowersPuzzle(4);
      expect(p).toBeDefined();
      expect(p.size).toBe(4);
      expect(p.grid).toHaveLength(16);
      expect(p.solution).toHaveLength(16);
    } catch (e) {
      console.error('towers failed:', e);
      throw e;
    }
  }, 5000);

  it('tracks: generateTracksPuzzle(5, 5)', () => {
    try {
      const p = generateTracksPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.colClues).toHaveLength(5);
      expect(p.rowClues).toHaveLength(5);
    } catch (e) {
      console.error('tracks failed:', e);
      throw e;
    }
  }, 5000);

  it('galaxies: generateGalaxiesPuzzle(5, 5)', () => {
    try {
      const p = generateGalaxiesPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.dots.length).toBeGreaterThan(0);
    } catch (e) {
      console.error('galaxies failed:', e);
      throw e;
    }
  }, 5000);

  it('rectangles: generateRectanglesPuzzle(5, 5)', () => {
    try {
      const p = generateRectanglesPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.numbers).toHaveLength(25);
      expect(p.solution).toHaveLength(25);
    } catch (e) {
      console.error('rectangles failed:', e);
      throw e;
    }
  }, 5000);

  it('blackbox: generateBlackBoxPuzzle(5, 5, 3)', () => {
    try {
      const p = generateBlackBoxPuzzle(5, 5, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.numBalls).toBe(3);
      expect(p.balls).toHaveLength(3);
    } catch (e) {
      console.error('blackbox failed:', e);
      throw e;
    }
  }, 5000);

  it('undead: generateUndeadPuzzle(4, 4)', () => {
    try {
      const p = generateUndeadPuzzle(4, 4);
      expect(p).toBeDefined();
      expect(p.width).toBe(4);
      expect(p.height).toBe(4);
      expect(p.grid).toHaveLength(16);
    } catch (e) {
      console.error('undead failed:', e);
      throw e;
    }
  }, 5000);

  it('mosaic: generateMosaicPuzzle(5, 5)', () => {
    try {
      const p = generateMosaicPuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.clues).toHaveLength(25);
    } catch (e) {
      console.error('mosaic failed:', e);
      throw e;
    }
  }, 5000);

  it('net: generateNetPuzzle(4, 4)', () => {
    try {
      const p = generateNetPuzzle(4, 4);
      expect(p).toBeDefined();
      expect(p.w).toBe(4);
      expect(p.h).toBe(4);
      expect(p.tiles).toHaveLength(16);
    } catch (e) {
      console.error('net failed:', e);
      throw e;
    }
  }, 5000);

  it('signpost: generateSignpostPuzzle(3, 3)', () => {
    try {
      const p = generateSignpostPuzzle(3, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(3);
      expect(p.h).toBe(3);
      expect(p.dirs).toHaveLength(9);
      expect(p.nums).toHaveLength(9);
      expect(p.solution).toHaveLength(9);
    } catch (e) {
      console.error('signpost failed:', e);
      throw e;
    }
  }, 5000);

  it('inertia: generateInertiaPuzzle(8, 8)', () => {
    try {
      const p = generateInertiaPuzzle(8, 8);
      expect(p).toBeDefined();
      expect(p.w).toBe(8);
      expect(p.h).toBe(8);
      expect(p.grid).toHaveLength(64);
      expect(p.px).toBeGreaterThanOrEqual(0);
      expect(p.py).toBeGreaterThanOrEqual(0);
    } catch (e) {
      console.error('inertia failed:', e);
      throw e;
    }
  }, 5000);

  it('sixteen: generateSixteenPuzzle(3, 3)', () => {
    try {
      const p = generateSixteenPuzzle(3, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(3);
      expect(p.h).toBe(3);
      expect(p.tiles).toHaveLength(9);
    } catch (e) {
      console.error('sixteen failed:', e);
      throw e;
    }
  }, 5000);

  it('palisade: generatePalisadePuzzle(6, 6, 3)', () => {
    try {
      const p = generatePalisadePuzzle(6, 6, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(6);
      expect(p.h).toBe(6);
      expect(p.k).toBe(3);
      expect(p.clues).toHaveLength(36);
    } catch (e) {
      console.error('palisade failed:', e);
      throw e;
    }
  }, 5000);

  it('range: generateRangePuzzle(5, 5)', () => {
    try {
      const p = generateRangePuzzle(5, 5);
      expect(p).toBeDefined();
      expect(p.w).toBe(5);
      expect(p.h).toBe(5);
      expect(p.grid).toHaveLength(25);
    } catch (e) {
      console.error('range failed:', e);
      throw e;
    }
  }, 5000);

  it('cube: generateCubePuzzle()', () => {
    try {
      const p = generateCubePuzzle();
      expect(p).toBeDefined();
      expect(p.nsquares).toBeGreaterThan(0);
      expect(p.grid.length).toBeGreaterThan(0);
      expect(p.d1).toBeGreaterThan(0);
      expect(p.d2).toBeGreaterThan(0);
    } catch (e) {
      console.error('cube failed:', e);
      throw e;
    }
  }, 5000);

  it('netslide: generateNetslidePuzzle(3, 3)', () => {
    try {
      const p = generateNetslidePuzzle(3, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(3);
      expect(p.h).toBe(3);
      expect(p.tiles).toHaveLength(9);
    } catch (e) {
      console.error('netslide failed:', e);
      throw e;
    }
  }, 5000);

  it('flip: generateFlipPuzzle(3, 3)', () => {
    try {
      const p = generateFlipPuzzle(3, 3);
      expect(p).toBeDefined();
      expect(p.w).toBe(3);
      expect(p.h).toBe(3);
      expect(p.grid).toHaveLength(9);
    } catch (e) {
      console.error('flip failed:', e);
      throw e;
    }
  }, 5000);
});
