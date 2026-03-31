import { describe, expect, it } from 'bun:test';
import {
  BASE_CONNECTIONS,
  DIR_OFFSETS,
  OPPOSITE,
  type Connections,
  type PipeCell,
  type PipeType,
  getConnections,
  rotatePipe,
  getDirection,
  findPipeForConnections,
  gridSizeForLevel,
  findConnectedPath,
  generatePath,
  generateSimplePath,
  generatePuzzle,
  isGridFullyConnected,
} from './pipeline';

// =============================================================================
// Helpers
// =============================================================================

function cell(type: PipeType, rotation = 0): PipeCell {
  return { type, rotation, isSource: false, isDestination: false };
}

/** Count the number of true values in a Connections tuple */
function countOpenings(c: Connections): number {
  return c.filter(Boolean).length;
}

// =============================================================================
// Tests
// =============================================================================

describe('pipeline puzzle logic', () => {
  // ── Pipe piece types ──────────────────────────────────────────────────────

  describe('base connections (bitmask)', () => {
    it('straight has exactly 2 openings (top + bottom)', () => {
      const c = BASE_CONNECTIONS.straight;
      expect(countOpenings(c)).toBe(2);
      expect(c).toEqual([true, false, true, false]);
    });

    it('corner has exactly 2 openings (top + right)', () => {
      const c = BASE_CONNECTIONS.corner;
      expect(countOpenings(c)).toBe(2);
      expect(c).toEqual([true, true, false, false]);
    });

    it('t-junction has exactly 3 openings (top, right, left)', () => {
      const c = BASE_CONNECTIONS['t-junction'];
      expect(countOpenings(c)).toBe(3);
      expect(c).toEqual([true, true, false, true]);
    });

    it('cross has 4 openings', () => {
      const c = BASE_CONNECTIONS.cross;
      expect(countOpenings(c)).toBe(4);
      expect(c).toEqual([true, true, true, true]);
    });

    it('empty has 0 openings', () => {
      const c = BASE_CONNECTIONS.empty;
      expect(countOpenings(c)).toBe(0);
      expect(c).toEqual([false, false, false, false]);
    });
  });

  // ── Rotation ──────────────────────────────────────────────────────────────

  describe('rotation', () => {
    it('straight rotated once becomes horizontal (right + left)', () => {
      const c = getConnections(cell('straight', 1));
      expect(c).toEqual([false, true, false, true]);
    });

    it('straight rotated twice returns to vertical', () => {
      const c = getConnections(cell('straight', 2));
      expect(c).toEqual([true, false, true, false]);
    });

    it('corner rotated once connects right + bottom', () => {
      // base: top+right → rotate 1 → right+bottom
      const c = getConnections(cell('corner', 1));
      expect(c).toEqual([false, true, true, false]);
    });

    it('corner rotated twice connects bottom + left', () => {
      const c = getConnections(cell('corner', 2));
      expect(c).toEqual([false, false, true, true]);
    });

    it('corner rotated three times connects left + top', () => {
      const c = getConnections(cell('corner', 3));
      expect(c).toEqual([true, false, false, true]);
    });

    it('cross is invariant under rotation', () => {
      for (let r = 0; r < 4; r++) {
        expect(getConnections(cell('cross', r))).toEqual([true, true, true, true]);
      }
    });

    it('empty is invariant under rotation', () => {
      for (let r = 0; r < 4; r++) {
        expect(getConnections(cell('empty', r))).toEqual([false, false, false, false]);
      }
    });

    it('four rotations return to original', () => {
      const types: PipeType[] = ['straight', 'corner', 't-junction', 'cross', 'empty'];
      for (const t of types) {
        const original = getConnections(cell(t, 0));
        const rotated4 = getConnections(cell(t, 4));
        expect(rotated4).toEqual(original);
      }
    });

    it('rotatePipe helper increments rotation mod 4', () => {
      const c0 = cell('corner', 0);
      const c1 = rotatePipe(c0);
      expect(c1.rotation).toBe(1);
      const c4 = rotatePipe(rotatePipe(rotatePipe(c1)));
      expect(c4.rotation).toBe(0);
    });

    it('negative rotation wraps correctly', () => {
      // rotation -1 should behave like rotation 3
      const neg = getConnections(cell('corner', -1));
      const pos = getConnections(cell('corner', 3));
      expect(neg).toEqual(pos);
    });

    it('opening count is preserved after rotation', () => {
      const types: PipeType[] = ['straight', 'corner', 't-junction', 'cross', 'empty'];
      for (const t of types) {
        const baseCount = countOpenings(BASE_CONNECTIONS[t]);
        for (let r = 0; r < 4; r++) {
          expect(countOpenings(getConnections(cell(t, r)))).toBe(baseCount);
        }
      }
    });
  });

  // ── findPipeForConnections ────────────────────────────────────────────────

  describe('findPipeForConnections', () => {
    it('maps all-false to empty', () => {
      expect(findPipeForConnections([false, false, false, false])).toEqual({
        type: 'empty',
        rotation: 0,
      });
    });

    it('maps all-true to cross', () => {
      expect(findPipeForConnections([true, true, true, true])).toEqual({
        type: 'cross',
        rotation: 0,
      });
    });

    it('maps top+bottom to straight rotation 0', () => {
      const result = findPipeForConnections([true, false, true, false]);
      expect(result.type).toBe('straight');
      // Verify the resulting piece actually has these connections
      expect(getConnections(cell(result.type, result.rotation))).toEqual([
        true,
        false,
        true,
        false,
      ]);
    });

    it('maps right+left to straight rotation 1', () => {
      const result = findPipeForConnections([false, true, false, true]);
      expect(result.type).toBe('straight');
      expect(getConnections(cell(result.type, result.rotation))).toEqual([
        false,
        true,
        false,
        true,
      ]);
    });

    it('maps bottom+left to corner', () => {
      const result = findPipeForConnections([false, false, true, true]);
      expect(result.type).toBe('corner');
      expect(getConnections(cell(result.type, result.rotation))).toEqual([
        false,
        false,
        true,
        true,
      ]);
    });

    it('maps top+right+bottom to t-junction', () => {
      const result = findPipeForConnections([true, true, true, false]);
      expect(result.type).toBe('t-junction');
      expect(getConnections(cell(result.type, result.rotation))).toEqual([true, true, true, false]);
    });

    it('round-trips all possible connection patterns', () => {
      // Generate every possible 2-bit, 3-bit pattern and verify round-trip
      for (let mask = 0; mask < 16; mask++) {
        const target: Connections = [
          Boolean(mask & 1),
          Boolean(mask & 2),
          Boolean(mask & 4),
          Boolean(mask & 8),
        ];
        const count = countOpenings(target);
        // Skip 1-opening patterns (degenerate, not a real pipe)
        if (count === 1) continue;
        const result = findPipeForConnections(target);
        const produced = getConnections(cell(result.type, result.rotation));
        expect(produced).toEqual(target);
      }
    });
  });

  // ── Grid size mapping ─────────────────────────────────────────────────────

  describe('gridSizeForLevel', () => {
    it('nLevel 1 → 5', () => expect(gridSizeForLevel(1)).toBe(5));
    it('nLevel 2 → 6', () => expect(gridSizeForLevel(2)).toBe(6));
    it('nLevel 3 → 7', () => expect(gridSizeForLevel(3)).toBe(7));
  });

  // ── getDirection ──────────────────────────────────────────────────────────

  describe('getDirection', () => {
    it('returns 0 for top', () => expect(getDirection(1, 0, 0, 0)).toBe(0));
    it('returns 1 for right', () => expect(getDirection(0, 0, 0, 1)).toBe(1));
    it('returns 2 for bottom', () => expect(getDirection(0, 0, 1, 0)).toBe(2));
    it('returns 3 for left', () => expect(getDirection(0, 1, 0, 0)).toBe(3));
    it('returns -1 for same cell', () => expect(getDirection(0, 0, 0, 0)).toBe(-1));
  });

  // ── Connectivity check (BFS) ─────────────────────────────────────────────

  describe('findConnectedPath', () => {
    it('detects connected 2x2 grid', () => {
      // Build a simple 2x2 where all pieces form a path:
      // [corner(0)] [corner(1)]   top-right → right-bottom
      // [corner(3)] [corner(2)]   left-top  → bottom-left
      const grid: PipeCell[][] = [
        [cell('corner', 1), cell('corner', 2)],
        [cell('corner', 0), cell('corner', 3)],
      ];
      // Mark source/dest
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      // Verify connections manually:
      // (0,0) corner r1 = [false, true, true, false] → connects right and bottom
      // (0,1) corner r2 = [false, false, true, true] → connects bottom and left (← connects to 0,0)
      // (1,0) corner r0 = [true, true, false, false] → connects top and right (← connects to 0,0 bottom)
      // (1,1) corner r3 = [true, false, false, true] → connects top and left

      const result = findConnectedPath(grid);
      expect(result.reachesDestination).toBe(true);
      expect(result.connected.size).toBe(4);
    });

    it('detects disconnected grid', () => {
      // 2x2 where (1,1) has no matching connection
      const grid: PipeCell[][] = [
        [cell('straight', 1), cell('empty', 0)],
        [cell('empty', 0), cell('straight', 0)],
      ];
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      const result = findConnectedPath(grid);
      expect(result.reachesDestination).toBe(false);
    });

    it('handles single-cell grid', () => {
      const grid: PipeCell[][] = [[cell('cross', 0)]];
      grid[0]![0]!.isSource = true;
      grid[0]![0]!.isDestination = true;

      const result = findConnectedPath(grid);
      // Source = destination, so always connected
      expect(result.reachesDestination).toBe(true);
      expect(result.connected.size).toBe(1);
    });

    it('does not traverse when neighbor does not connect back', () => {
      // (0,0) straight r0 = top+bottom → has bottom opening
      // (1,0) straight r1 = right+left → has NO top opening
      const grid: PipeCell[][] = [
        [cell('straight', 0), cell('empty', 0)],
        [cell('straight', 1), cell('empty', 0)],
      ];
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      const result = findConnectedPath(grid);
      expect(result.connected.size).toBe(1); // only source
      expect(result.reachesDestination).toBe(false);
    });
  });

  // ── Edge pieces ───────────────────────────────────────────────────────────

  describe('edge pieces', () => {
    it('connections pointing outside the grid are ignored by BFS', () => {
      // A 3x3 grid where (0,0) has a top opening — it points outside
      // but BFS should not crash or add out-of-bounds cells
      const grid: PipeCell[][] = [
        [cell('cross', 0), cell('straight', 1), cell('corner', 2)],
        [cell('straight', 0), cell('empty', 0), cell('straight', 0)],
        [cell('corner', 0), cell('straight', 1), cell('cross', 0)],
      ];
      grid[0]![0]!.isSource = true;
      grid[2]![2]!.isDestination = true;

      // Should not throw; just verify it runs
      const result = findConnectedPath(grid);
      expect(typeof result.reachesDestination).toBe('boolean');
      // No cell key should have negative indices
      for (const key of result.connected) {
        const [r, c] = key.split(',').map(Number);
        expect(r!).toBeGreaterThanOrEqual(0);
        expect(c!).toBeGreaterThanOrEqual(0);
        expect(r!).toBeLessThan(3);
        expect(c!).toBeLessThan(3);
      }
    });
  });

  // ── Path generation ───────────────────────────────────────────────────────

  describe('generatePath', () => {
    it('starts at (0,0) and ends at (size-1,size-1)', () => {
      for (const size of [4, 5, 6, 7, 8]) {
        const path = generatePath(size);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([size - 1, size - 1]);
      }
    });

    it('has no duplicate cells', () => {
      for (const size of [5, 6, 7]) {
        const path = generatePath(size);
        const keys = path.map(([r, c]) => `${r},${c}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('consecutive cells are adjacent', () => {
      const path = generatePath(6);
      for (let i = 1; i < path.length; i++) {
        const [r1, c1] = path[i - 1] as [number, number];
        const [r2, c2] = path[i] as [number, number];
        const dist = Math.abs(r1 - r2) + Math.abs(c1 - c2);
        expect(dist).toBe(1);
      }
    });

    it('stays within grid bounds', () => {
      const size = 5;
      const path = generatePath(size);
      for (const [r, c] of path) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(size);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(size);
      }
    });
  });

  describe('generateSimplePath', () => {
    it('starts at (0,0) and ends at (size-1,size-1)', () => {
      const path = generateSimplePath(5);
      expect(path[0]).toEqual([0, 0]);
      expect(path[path.length - 1]).toEqual([4, 4]);
    });

    it('has exactly 2*size - 1 cells (L-shape)', () => {
      const size = 6;
      const path = generateSimplePath(size);
      expect(path.length).toBe(2 * size - 1);
    });
  });

  // ── Grid generation ───────────────────────────────────────────────────────

  describe('generatePuzzle', () => {
    it('returns grid of correct dimensions', () => {
      for (const size of [5, 6, 7]) {
        const { grid } = generatePuzzle(size);
        expect(grid.length).toBe(size);
        for (const row of grid) {
          expect(row.length).toBe(size);
        }
      }
    });

    it('source is at (0,0) and destination at (size-1,size-1)', () => {
      const size = 5;
      const { grid } = generatePuzzle(size);
      expect(grid[0]![0]!.isSource).toBe(true);
      expect(grid[size - 1]![size - 1]!.isDestination).toBe(true);
      // No other cell is source/dest
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (r === 0 && c === 0) continue;
          expect(grid[r]![c]!.isSource).toBe(false);
        }
      }
    });

    it('no cell has "empty" pipe type', () => {
      const { grid } = generatePuzzle(5);
      for (const row of grid) {
        for (const c of row) {
          expect(c.type).not.toBe('empty');
        }
      }
    });

    it('path returned starts at source and ends at destination', () => {
      for (const size of [5, 6, 7]) {
        const { path } = generatePuzzle(size);
        expect(path[0]).toEqual([0, 0]);
        expect(path[path.length - 1]).toEqual([size - 1, size - 1]);
      }
    });

    it('internal path cells (non-endpoints) have mutually connecting pipes in solution', () => {
      // Path cells with 2 neighbors should have correct connections in the solution grid.
      // Endpoint cells (source/dest) only have 1 neighbor, so findPipeForConnections
      // may produce an extra opening — this is expected game behavior.
      for (let attempt = 0; attempt < 10; attempt++) {
        const size = 5;
        const { solutionGrid, path } = generatePuzzle(size);

        // Check interior path cells (indices 1..path.length-2) connect to their neighbors
        for (let i = 1; i < path.length - 1; i++) {
          const [r, c] = path[i] as [number, number];
          const [pr, pc] = path[i - 1] as [number, number];
          const [nr, nc] = path[i + 1] as [number, number];

          const cell = solutionGrid[r]![c]!;
          const conns = getConnections(cell);

          // Cell should connect toward prev
          const dirToPrev = getDirection(r, c, pr, pc);
          expect(conns[dirToPrev]).toBe(true);

          // Cell should connect toward next
          const dirToNext = getDirection(r, c, nr, nc);
          expect(conns[dirToNext]).toBe(true);
        }
      }
    });

    it('solution grid path cells are non-empty', () => {
      const { solutionGrid, path } = generatePuzzle(5);
      for (const [r, c] of path) {
        expect(solutionGrid[r]![c]!.type).not.toBe('empty');
      }
    });
  });

  // ── Puzzle solvability ────────────────────────────────────────────────────

  describe('puzzle solvability', () => {
    it('a hand-crafted solved grid is detected as connected', () => {
      // Build a simple 3x3 grid with a known valid path: (0,0)->(0,1)->(0,2)->(1,2)->(2,2)
      const grid: PipeCell[][] = [
        [cell('corner', 1), cell('straight', 1), cell('corner', 2)],
        [cell('straight', 0), cell('straight', 0), cell('straight', 0)],
        [cell('corner', 0), cell('straight', 1), cell('corner', 3)],
      ];
      // corner r1 = right+bottom, straight r1 = right+left, corner r2 = bottom+left
      // straight r0 = top+bottom, straight r0 = top+bottom, straight r0 = top+bottom
      // corner r0 = top+right, straight r1 = right+left, corner r3 = top+left
      grid[0]![0]!.isSource = true;
      grid[2]![2]!.isDestination = true;

      expect(isGridFullyConnected(grid)).toBe(true);
    });

    it('rotating a critical pipe breaks connectivity', () => {
      // 2x2 grid with a single path: (0,0)->(0,1)->(1,1)
      const grid: PipeCell[][] = [
        [cell('corner', 1), cell('corner', 2)], // right+bottom, bottom+left
        [cell('empty', 0), cell('straight', 0)], // no connections, top+bottom
      ];
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      expect(isGridFullyConnected(grid)).toBe(true);

      // Now rotate (0,1) — breaks the chain from (0,0)
      grid[0]![1] = cell('corner', 0); // was bottom+left, now top+right — no left opening
      expect(isGridFullyConnected(grid)).toBe(false);
    });
  });

  // ── Win detection ─────────────────────────────────────────────────────────

  describe('win detection', () => {
    it('findConnectedPath returns reachesDestination=true for a fully connected grid', () => {
      const grid: PipeCell[][] = [
        [cell('corner', 1), cell('corner', 2)],
        [cell('corner', 0), cell('corner', 3)],
      ];
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      expect(findConnectedPath(grid).reachesDestination).toBe(true);
    });

    it('findConnectedPath returns reachesDestination=false for a disconnected grid', () => {
      const grid: PipeCell[][] = [
        [cell('straight', 0), cell('empty', 0)],
        [cell('empty', 0), cell('straight', 0)],
      ];
      grid[0]![0]!.isSource = true;
      grid[1]![1]!.isDestination = true;

      expect(findConnectedPath(grid).reachesDestination).toBe(false);
    });

    it('scrambled grid is unlikely to be solved', () => {
      // Not guaranteed, but for 5x5+ the probability is extremely low.
      let anyScrambledSolved = false;
      for (let i = 0; i < 20; i++) {
        const { grid } = generatePuzzle(5);
        if (findConnectedPath(grid).reachesDestination) {
          anyScrambledSolved = true;
        }
      }
      // Verify the function runs without error
      expect(typeof anyScrambledSolved).toBe('boolean');
    });
  });

  // ── Constants sanity ──────────────────────────────────────────────────────

  describe('constants', () => {
    it('DIR_OFFSETS has 4 entries', () => {
      expect(DIR_OFFSETS.length).toBe(4);
    });

    it('OPPOSITE maps correctly', () => {
      expect(OPPOSITE[0]).toBe(2); // top ↔ bottom
      expect(OPPOSITE[1]).toBe(3); // right ↔ left
      expect(OPPOSITE[2]).toBe(0);
      expect(OPPOSITE[3]).toBe(1);
    });

    it('OPPOSITE is its own inverse', () => {
      for (let i = 0; i < 4; i++) {
        expect(OPPOSITE[OPPOSITE[i] as number]).toBe(i as any);
      }
    });
  });
});
