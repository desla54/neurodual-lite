// @ts-nocheck
/**
 * Undead (Haunted Mirror Mazes) puzzle generator — faithful port of Simon Tatham's undead.c
 *
 * Ports the following C algorithms:
 *   - Grid/path tracing with mirror reflections
 *   - Iterative constraint solver (solve_iterative)
 *   - Brute-force solver with uniqueness check (solve_bruteforce)
 *   - Puzzle generation with difficulty filtering (new_game_desc)
 *   - get_unique: path-wise unique-view monster assignment
 *
 * Monster encoding: Ghost=1, Vampire=2, Zombie=4 (bitmask: 7=any, 3=G|V, etc.)
 *
 * Source: https://git.tartarus.org/?p=simon/puzzles.git (undead.c)
 */

// =============================================================================
// Public API
// =============================================================================

export interface UndeadPuzzle {
  /** Grid width. */
  width: number;
  /** Grid height. */
  height: number;
  /**
   * The inner grid cells, row-major (width * height).
   * 'L' = backslash mirror (\), 'R' = forward-slash mirror (/),
   * null = empty cell (to be filled by player).
   */
  grid: ('L' | 'R' | null)[];
  /** The unique solution for empty cells. Row-major, same length as grid.
   *  'G' for ghost, 'V' for vampire, 'Z' for zombie, null for mirror cells. */
  solution: ('G' | 'V' | 'Z' | null)[];
  /** Number of ghosts in the solution. */
  numGhosts: number;
  /** Number of vampires in the solution. */
  numVampires: number;
  /** Number of zombies in the solution. */
  numZombies: number;
  /**
   * Clue numbers around the perimeter, clockwise starting from top-left:
   *   top[0..w-1], right[0..h-1], bottom[w-1..0], left[h-1..0]
   * Total length = 2*(w+h).
   */
  clues: number[];
}

export function generateUndeadPuzzle(w: number, h: number): UndeadPuzzle {
  if (w < 3 || h < 3) throw new RangeError('Width and height must be at least 3');
  if (w * h > 54) throw new RangeError('Grid is too big (max 54 cells)');
  return generate(w, h);
}

// =============================================================================
// Constants (from undead.c enums)
// =============================================================================

const CELL_EMPTY = 0;
const CELL_MIRROR_L = 1; // backslash '\'
const CELL_MIRROR_R = 2; // forward-slash '/'
const CELL_GHOST = 3;
const CELL_VAMPIRE = 4;
const CELL_ZOMBIE = 5;

const DIRECTION_NONE = 0;
const DIRECTION_UP = 1;
const DIRECTION_RIGHT = 2;
const DIRECTION_LEFT = 3;
const DIRECTION_DOWN = 4;

const DIFF_EASY = 0;
const DIFF_NORMAL = 1;
const DIFF_TRICKY = 2;

const FALSE = 0;
const _TRUE = 1;

// =============================================================================
// PRNG — simple seedless Math.random wrapper matching random_state usage
// =============================================================================

function random_upto(n: number): number {
  return Math.floor(Math.random() * n);
}

// =============================================================================
// Data structures (faithful to C structs)
// =============================================================================

interface Path {
  length: number;
  p: Int32Array;
  grid_start: number;
  grid_end: number;
  num_monsters: number;
  mapping: Int32Array;
  sightings_start: number;
  sightings_end: number;
  xy: Int32Array;
}

interface GameCommon {
  params: { w: number; h: number; diff: number };
  wh: number;
  num_ghosts: number;
  num_vampires: number;
  num_zombies: number;
  num_total: number;
  num_paths: number;
  paths: Path[];
  grid: Int32Array;
  xinfo: Int32Array;
  fixed: Int32Array | null;
  solved: number;
}

interface GameState {
  common: GameCommon;
  guess: Int32Array | null;
  pencils: Uint8Array | null;
  cell_errors: Uint8Array;
  hint_errors: Uint8Array;
  count_errors: Uint8Array;
  solved: number;
  cheated: number;
}

interface Guess {
  length: number;
  guess: Int32Array;
  possible: Int32Array;
}

// =============================================================================
// State allocation (faithful port of new_state)
// =============================================================================

function new_state(w: number, h: number, diff: number): GameState {
  const wh = (w + 2) * (h + 2);
  const num_paths = w + h;

  const common: GameCommon = {
    params: { w, h, diff },
    wh,
    num_ghosts: 0,
    num_vampires: 0,
    num_zombies: 0,
    num_total: 0,
    num_paths,
    paths: [],
    grid: new Int32Array(wh),
    xinfo: new Int32Array(wh),
    fixed: null,
    solved: FALSE,
  };

  for (let i = 0; i < num_paths; i++) {
    common.paths.push({
      length: 0,
      grid_start: -1,
      grid_end: -1,
      num_monsters: 0,
      sightings_start: 0,
      sightings_end: 0,
      p: new Int32Array(wh),
      xy: new Int32Array(wh),
      mapping: new Int32Array(wh),
    });
  }

  const state: GameState = {
    common,
    guess: null,
    pencils: null,
    cell_errors: new Uint8Array(wh),
    hint_errors: new Uint8Array(2 * num_paths),
    count_errors: new Uint8Array(3),
    solved: FALSE,
    cheated: FALSE,
  };

  return state;
}

// =============================================================================
// Grid coordinate helpers (faithful port)
// =============================================================================

function range2grid(
  rangeno: number,
  width: number,
  height: number,
): { x: number; y: number; dir: number } {
  if (rangeno < 0) {
    return { x: 0, y: 0, dir: DIRECTION_NONE };
  }
  if (rangeno < width) {
    return { x: rangeno + 1, y: 0, dir: DIRECTION_DOWN };
  }
  rangeno -= width;
  if (rangeno < height) {
    return { x: width + 1, y: rangeno + 1, dir: DIRECTION_LEFT };
  }
  rangeno -= height;
  if (rangeno < width) {
    return { x: width - rangeno, y: height + 1, dir: DIRECTION_UP };
  }
  rangeno -= width;
  if (rangeno < height) {
    return { x: 0, y: height - rangeno, dir: DIRECTION_RIGHT };
  }
  return { x: 0, y: 0, dir: DIRECTION_NONE };
}

function grid2range(x: number, y: number, w: number, h: number): number {
  if (x > 0 && x < w + 1 && y > 0 && y < h + 1) return -1;
  if (x < 0 || x > w + 1 || y < 0 || y > h + 1) return -1;
  if ((x === 0 || x === w + 1) && (y === 0 || y === h + 1)) return -1;
  if (y === 0) return x - 1;
  if (x === w + 1) return y - 1 + w;
  if (y === h + 1) return 2 * w + h - x;
  return 2 * (w + h) - y;
}

function _num2grid(num: number, width: number): { x: number; y: number } {
  return { x: 1 + (num % width), y: 1 + Math.floor(num / width) };
}

// =============================================================================
// make_paths (faithful port)
// =============================================================================

function make_paths(state: GameState): void {
  const { common } = state;
  const w = common.params.w;
  const h = common.params.h;
  let count = 0;

  for (let i = 0; i < 2 * (w + h); i++) {
    let found = false;
    // Check whether inverse path is already in list
    for (let j = 0; j < count; j++) {
      if (i === common.paths[j].grid_end) {
        found = true;
        break;
      }
    }
    if (found) continue;

    // We found a new path through the mirror maze
    const path = common.paths[count];
    path.grid_start = i;
    path.length = 0;

    let { x, y, dir } = range2grid(i, w, h);
    path.sightings_start = common.grid[x + y * (w + 2)];

    while (true) {
      if (dir === DIRECTION_DOWN) y++;
      else if (dir === DIRECTION_LEFT) x--;
      else if (dir === DIRECTION_UP) y--;
      else if (dir === DIRECTION_RIGHT) x++;

      const r = grid2range(x, y, w, h);
      if (r !== -1) {
        path.grid_end = r;
        path.sightings_end = common.grid[x + y * (w + 2)];
        break;
      }

      const c = common.grid[x + y * (w + 2)];
      path.xy[path.length] = x + y * (w + 2);

      if (c === CELL_MIRROR_L) {
        path.p[path.length] = -1;
        if (dir === DIRECTION_DOWN) dir = DIRECTION_RIGHT;
        else if (dir === DIRECTION_LEFT) dir = DIRECTION_UP;
        else if (dir === DIRECTION_UP) dir = DIRECTION_LEFT;
        else if (dir === DIRECTION_RIGHT) dir = DIRECTION_DOWN;
      } else if (c === CELL_MIRROR_R) {
        path.p[path.length] = -1;
        if (dir === DIRECTION_DOWN) dir = DIRECTION_LEFT;
        else if (dir === DIRECTION_LEFT) dir = DIRECTION_DOWN;
        else if (dir === DIRECTION_UP) dir = DIRECTION_RIGHT;
        else if (dir === DIRECTION_RIGHT) dir = DIRECTION_UP;
      } else {
        path.p[path.length] = common.xinfo[x + y * (w + 2)];
      }
      path.length++;
    }

    // Count unique monster entries in each path
    path.num_monsters = 0;
    for (let j = 0; j < common.num_total; j++) {
      let num_monsters = 0;
      for (let k = 0; k < path.length; k++) {
        if (path.p[k] === j) num_monsters++;
      }
      if (num_monsters > 0) path.num_monsters++;
    }

    // Generate mapping vector
    let mc = 0;
    for (let p = 0; p < path.length; p++) {
      const m = path.p[p];
      if (m === -1) continue;
      let dup = false;
      for (let j = 0; j < mc; j++) {
        if (path.mapping[j] === m) dup = true;
      }
      if (!dup) path.mapping[mc++] = m;
    }

    count++;
  }
}

// =============================================================================
// next_list — enumerate all possible guesses for a path (faithful port)
// =============================================================================

function next_list(g: Guess, pos: number): boolean {
  if (pos === 0) {
    if (
      (g.guess[pos] === 1 && g.possible[pos] === 1) ||
      (g.guess[pos] === 2 && (g.possible[pos] === 3 || g.possible[pos] === 2)) ||
      g.guess[pos] === 4
    )
      return false;
    if (g.guess[pos] === 1 && (g.possible[pos] === 3 || g.possible[pos] === 7)) {
      g.guess[pos] = 2;
      return true;
    }
    if (g.guess[pos] === 1 && g.possible[pos] === 5) {
      g.guess[pos] = 4;
      return true;
    }
    if (g.guess[pos] === 2 && (g.possible[pos] === 6 || g.possible[pos] === 7)) {
      g.guess[pos] = 4;
      return true;
    }
  }

  if (g.guess[pos] === 1) {
    if (g.possible[pos] === 1) {
      return next_list(g, pos - 1);
    }
    if (g.possible[pos] === 3 || g.possible[pos] === 7) {
      g.guess[pos] = 2;
      return true;
    }
    if (g.possible[pos] === 5) {
      g.guess[pos] = 4;
      return true;
    }
  }

  if (g.guess[pos] === 2) {
    if (g.possible[pos] === 2) {
      return next_list(g, pos - 1);
    }
    if (g.possible[pos] === 3) {
      g.guess[pos] = 1;
      return next_list(g, pos - 1);
    }
    if (g.possible[pos] === 6 || g.possible[pos] === 7) {
      g.guess[pos] = 4;
      return true;
    }
  }

  if (g.guess[pos] === 4) {
    if (g.possible[pos] === 5 || g.possible[pos] === 7) {
      g.guess[pos] = 1;
      return next_list(g, pos - 1);
    }
    if (g.possible[pos] === 6) {
      g.guess[pos] = 2;
      return next_list(g, pos - 1);
    }
    if (g.possible[pos] === 4) {
      return next_list(g, pos - 1);
    }
  }

  return false;
}

// =============================================================================
// get_unique — find unique view assignments for a path (faithful port)
// =============================================================================

interface Entry {
  link: Entry | null;
  guess: Int32Array;
  start_view: number;
  end_view: number;
}

function get_unique(state: GameState, counter: number): void {
  const path = state.common.paths[counter];
  const pathGuessLen = path.num_monsters;

  const path_guess: Guess = {
    length: pathGuessLen,
    guess: new Int32Array(pathGuessLen),
    possible: new Int32Array(pathGuessLen),
  };

  for (let p = 0; p < pathGuessLen; p++) {
    path_guess.possible[p] = state.guess?.[path.mapping[p]];
    switch (path_guess.possible[p]) {
      case 1:
        path_guess.guess[p] = 1;
        break;
      case 2:
        path_guess.guess[p] = 2;
        break;
      case 3:
        path_guess.guess[p] = 1;
        break;
      case 4:
        path_guess.guess[p] = 4;
        break;
      case 5:
        path_guess.guess[p] = 1;
        break;
      case 6:
        path_guess.guess[p] = 2;
        break;
      case 7:
        path_guess.guess[p] = 1;
        break;
    }
  }

  let views_head: Entry | null = null;

  const pathlimit = path.length + 1;
  const view_count = new Int32Array(pathlimit * pathlimit);

  do {
    let mirror: boolean;
    let start_view: number;
    let end_view: number;

    mirror = false;
    start_view = 0;
    for (let p = 0; p < path.length; p++) {
      if (path.p[p] === -1) {
        mirror = true;
      } else {
        for (let i = 0; i < pathGuessLen; i++) {
          if (path.p[p] === path.mapping[i]) {
            if (path_guess.guess[i] === 1 && mirror) start_view++;
            if (path_guess.guess[i] === 2 && !mirror) start_view++;
            if (path_guess.guess[i] === 4) start_view++;
            break;
          }
        }
      }
    }

    mirror = false;
    end_view = 0;
    for (let p = path.length - 1; p >= 0; p--) {
      if (path.p[p] === -1) {
        mirror = true;
      } else {
        for (let i = 0; i < pathGuessLen; i++) {
          if (path.p[p] === path.mapping[i]) {
            if (path_guess.guess[i] === 1 && mirror) end_view++;
            if (path_guess.guess[i] === 2 && !mirror) end_view++;
            if (path_guess.guess[i] === 4) end_view++;
            break;
          }
        }
      }
    }

    const idx = start_view * pathlimit + end_view;
    view_count[idx]++;
    if (view_count[idx] === 1) {
      const node: Entry = {
        link: views_head,
        guess: new Int32Array(pathGuessLen),
        start_view,
        end_view,
      };
      node.guess.set(path_guess.guess);
      views_head = node;
    }
  } while (next_list(path_guess, pathGuessLen - 1));

  // Extract single (unique) entries from view list
  const single_views: Entry[] = [];
  let node = views_head;
  while (node !== null) {
    const idx = node.start_view * pathlimit + node.end_view;
    if (view_count[idx] === 1) {
      single_views.push(node);
    }
    node = node.link;
  }

  if (single_views.length > 0) {
    // Choose one unique guess at random
    const chosen = single_views[random_upto(single_views.length)];
    // Modify state.guess according to path.mapping
    for (let i = 0; i < pathGuessLen; i++) {
      state.guess![path.mapping[i]] = chosen.guess[i];
    }
  }
}

// =============================================================================
// count_monsters (faithful port)
// =============================================================================

function count_monsters(state: GameState): {
  cGhost: number;
  cVampire: number;
  cZombie: number;
  cNone: number;
} {
  let cGhost = 0;
  let cVampire = 0;
  let cZombie = 0;
  let cNone = 0;

  for (let i = 0; i < state.common.num_total; i++) {
    if (state.guess?.[i] === 1) cGhost++;
    else if (state.guess?.[i] === 2) cVampire++;
    else if (state.guess?.[i] === 4) cZombie++;
    else cNone++;
  }

  return { cGhost, cVampire, cZombie, cNone };
}

// =============================================================================
// check_numbers (faithful port)
// =============================================================================

function check_numbers(state: GameState, guess: Int32Array): boolean {
  let count_ghosts = 0;
  let count_vampires = 0;
  let count_zombies = 0;

  for (let i = 0; i < state.common.num_total; i++) {
    if (guess[i] === 1) count_ghosts++;
    if (guess[i] === 2) count_vampires++;
    if (guess[i] === 4) count_zombies++;
  }

  if (count_ghosts > state.common.num_ghosts) return false;
  if (count_vampires > state.common.num_vampires) return false;
  if (count_zombies > state.common.num_zombies) return false;

  return true;
}

// =============================================================================
// check_solution (faithful port)
// =============================================================================

function check_solution(g: Int32Array, path: Path): boolean {
  let count: number;
  let mirror: boolean;

  count = 0;
  mirror = false;
  for (let i = 0; i < path.length; i++) {
    if (path.p[i] === -1) mirror = true;
    else {
      if (g[path.p[i]] === 1 && mirror) count++;
      else if (g[path.p[i]] === 2 && !mirror) count++;
      else if (g[path.p[i]] === 4) count++;
    }
  }
  if (count !== path.sightings_start) return false;

  count = 0;
  mirror = false;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path.p[i] === -1) mirror = true;
    else {
      if (g[path.p[i]] === 1 && mirror) count++;
      else if (g[path.p[i]] === 2 && !mirror) count++;
      else if (g[path.p[i]] === 4) count++;
    }
  }
  if (count !== path.sightings_end) return false;

  return true;
}

// =============================================================================
// solve_iterative (faithful port)
// =============================================================================

function solve_iterative(state: GameState, paths: Path[]): boolean {
  let solved = true;

  const guess = new Int32Array(state.common.num_total);
  const possible = new Int32Array(state.common.num_total);

  for (let i = 0; i < state.common.num_total; i++) {
    guess[i] = state.guess?.[i];
    possible[i] = 0;
  }

  for (let p = 0; p < state.common.num_paths; p++) {
    if (paths[p].num_monsters > 0) {
      const loop: Guess = {
        length: paths[p].num_monsters,
        guess: new Int32Array(paths[p].num_monsters),
        possible: new Int32Array(paths[p].num_monsters),
      };

      for (let i = 0; i < paths[p].num_monsters; i++) {
        switch (state.guess?.[paths[p].mapping[i]]) {
          case 1:
            loop.guess[i] = 1;
            break;
          case 2:
            loop.guess[i] = 2;
            break;
          case 3:
            loop.guess[i] = 1;
            break;
          case 4:
            loop.guess[i] = 4;
            break;
          case 5:
            loop.guess[i] = 1;
            break;
          case 6:
            loop.guess[i] = 2;
            break;
          case 7:
            loop.guess[i] = 1;
            break;
        }
        loop.possible[i] = state.guess?.[paths[p].mapping[i]];
        possible[paths[p].mapping[i]] = 0;
      }

      while (true) {
        for (let i = 0; i < state.common.num_total; i++) {
          guess[i] = state.guess?.[i];
        }
        let count = 0;
        for (let i = 0; i < paths[p].num_monsters; i++) {
          guess[paths[p].mapping[i]] = loop.guess[count++];
        }
        if (check_numbers(state, guess) && check_solution(guess, paths[p])) {
          for (let j = 0; j < paths[p].num_monsters; j++) {
            possible[paths[p].mapping[j]] |= loop.guess[j];
          }
        }
        if (!next_list(loop, loop.length - 1)) break;
      }

      for (let i = 0; i < paths[p].num_monsters; i++) {
        state.guess![paths[p].mapping[i]] &= possible[paths[p].mapping[i]];
      }
    }
  }

  for (let i = 0; i < state.common.num_total; i++) {
    if (
      state.guess?.[i] === 3 ||
      state.guess?.[i] === 5 ||
      state.guess?.[i] === 6 ||
      state.guess?.[i] === 7
    ) {
      solved = false;
      break;
    }
  }

  return solved;
}

// =============================================================================
// solve_bruteforce (faithful port)
// =============================================================================

function solve_bruteforce(state: GameState, paths: Path[]): boolean {
  let solved = false;
  let number_solutions = 0;

  const loop: Guess = {
    length: state.common.num_total,
    guess: new Int32Array(state.common.num_total),
    possible: new Int32Array(state.common.num_total),
  };

  for (let i = 0; i < state.common.num_total; i++) {
    loop.possible[i] = state.guess?.[i];
    switch (state.guess?.[i]) {
      case 1:
        loop.guess[i] = 1;
        break;
      case 2:
        loop.guess[i] = 2;
        break;
      case 3:
        loop.guess[i] = 1;
        break;
      case 4:
        loop.guess[i] = 4;
        break;
      case 5:
        loop.guess[i] = 1;
        break;
      case 6:
        loop.guess[i] = 2;
        break;
      case 7:
        loop.guess[i] = 1;
        break;
    }
  }

  while (true) {
    let correct = true;
    if (!check_numbers(state, loop.guess)) {
      correct = false;
    } else {
      for (let p = 0; p < state.common.num_paths; p++) {
        if (!check_solution(loop.guess, paths[p])) {
          correct = false;
          break;
        }
      }
    }

    if (correct) {
      number_solutions++;
      solved = true;
      if (number_solutions > 1) {
        solved = false;
        break;
      }
      for (let i = 0; i < state.common.num_total; i++) {
        state.guess![i] = loop.guess[i];
      }
    }

    if (!next_list(loop, state.common.num_total - 1)) {
      break;
    }
  }

  return solved;
}

// =============================================================================
// path_cmp (faithful port — sort by num_monsters ascending)
// =============================================================================

function path_cmp(a: Path, b: Path): number {
  return a.num_monsters - b.num_monsters;
}

// =============================================================================
// new_game_desc — puzzle generator (faithful port)
// =============================================================================

function new_game_desc(
  w: number,
  h: number,
  diff: number,
): {
  state: GameState;
  old_guess: Int32Array;
} {
  while (true) {
    const state = new_state(w, h, diff);
    let abort = false;

    // Fill grid with random mirrors and empty monster cells
    let cellCount = 0;
    for (let row = 1; row < h + 1; row++) {
      for (let col = 1; col < w + 1; col++) {
        const c = random_upto(5);
        if (c >= 2) {
          state.common.grid[col + row * (w + 2)] = CELL_EMPTY;
          state.common.xinfo[col + row * (w + 2)] = cellCount++;
        } else if (c === 0) {
          state.common.grid[col + row * (w + 2)] = CELL_MIRROR_L;
          state.common.xinfo[col + row * (w + 2)] = -1;
        } else {
          state.common.grid[col + row * (w + 2)] = CELL_MIRROR_R;
          state.common.xinfo[col + row * (w + 2)] = -1;
        }
      }
    }
    state.common.num_total = cellCount;

    // Puzzle is boring if it has too few monster cells
    if (state.common.num_total <= 4) continue;

    // Monsters / Mirrors ratio should be balanced
    const ratio = state.common.num_total / (w * h);
    if (ratio < 0.48 || ratio > 0.78) continue;

    // Assign clue identifiers
    for (let r = 0; r < 2 * (w + h); r++) {
      const { x, y, dir: gridno } = range2grid(r, w, h);
      state.common.grid[x + y * (w + 2)] = gridno;
      state.common.xinfo[x + y * (w + 2)] = 0;
    }

    // Corners
    state.common.grid[0] = 0;
    state.common.xinfo[0] = 0;
    state.common.grid[w + 1] = 0;
    state.common.xinfo[w + 1] = 0;
    state.common.grid[w + 1 + (h + 1) * (w + 2)] = 0;
    state.common.xinfo[w + 1 + (h + 1) * (w + 2)] = 0;
    state.common.grid[(h + 1) * (w + 2)] = 0;
    state.common.xinfo[(h + 1) * (w + 2)] = 0;

    // Initialize solution vector
    state.guess = new Int32Array(state.common.num_total);
    for (let g = 0; g < state.common.num_total; g++) state.guess[g] = 7;

    // Initialize fixed flag
    state.common.fixed = new Int32Array(state.common.num_total);

    // paths generation
    make_paths(state);

    // Grid is invalid if max path length > threshold
    let max_length: number;
    switch (diff) {
      case DIFF_EASY:
        max_length = Math.min(w, h) + 1;
        break;
      case DIFF_NORMAL:
        max_length = Math.floor((Math.max(w, h) * 3) / 2);
        break;
      case DIFF_TRICKY:
        max_length = 9;
        break;
      default:
        max_length = 9;
        break;
    }

    for (let p = 0; p < state.common.num_paths; p++) {
      if (state.common.paths[p].num_monsters > max_length) {
        abort = true;
      }
    }
    if (abort) continue;

    state.common.paths.sort(path_cmp);

    // Grid monster initialization
    let filling: number;
    switch (diff) {
      case DIFF_EASY:
        filling = 2;
        break;
      case DIFF_NORMAL:
        filling = Math.min(w + h, Math.floor(state.common.num_total / 2));
        break;
      case DIFF_TRICKY:
        filling = Math.max(w + h, Math.floor(state.common.num_total / 2));
        break;
      default:
        filling = 0;
        break;
    }

    let pathCount = 0;
    while (count_monsters(state).cNone > filling) {
      if (pathCount >= state.common.num_paths) break;
      if (state.common.paths[pathCount].num_monsters === 0) {
        pathCount++;
        continue;
      }
      get_unique(state, pathCount);
      pathCount++;
    }

    // Fill remaining ambiguous entries with random monsters
    for (let g = 0; g < state.common.num_total; g++) {
      if (state.guess[g] === 7) {
        const r = random_upto(3);
        state.guess[g] = r === 0 ? 1 : r === 1 ? 2 : 4;
      }
    }

    // Determine all hints
    const monsterResult = count_monsters(state);
    state.common.num_ghosts = monsterResult.cGhost;
    state.common.num_vampires = monsterResult.cVampire;
    state.common.num_zombies = monsterResult.cZombie;

    // Puzzle is trivial if it has only one type of monster
    if (
      (state.common.num_ghosts === 0 && state.common.num_vampires === 0) ||
      (state.common.num_ghosts === 0 && state.common.num_zombies === 0) ||
      (state.common.num_vampires === 0 && state.common.num_zombies === 0)
    ) {
      continue;
    }

    // Discard puzzle if difficulty Tricky, and it has only 1 member of any monster type
    if (
      diff === DIFF_TRICKY &&
      (state.common.num_ghosts <= 1 ||
        state.common.num_vampires <= 1 ||
        state.common.num_zombies <= 1)
    ) {
      continue;
    }

    // Write solution into grid
    for (let col = 1; col < w + 1; col++) {
      for (let row = 1; row < h + 1; row++) {
        const c = state.common.xinfo[col + row * (w + 2)];
        if (c >= 0) {
          if (state.guess[c] === 1) state.common.grid[col + row * (w + 2)] = CELL_GHOST;
          if (state.guess[c] === 2) state.common.grid[col + row * (w + 2)] = CELL_VAMPIRE;
          if (state.guess[c] === 4) state.common.grid[col + row * (w + 2)] = CELL_ZOMBIE;
        }
      }
    }

    // Compute path sightings (clue values)
    for (let p = 0; p < state.common.num_paths; p++) {
      state.common.paths[p].sightings_start = 0;
      state.common.paths[p].sightings_end = 0;

      let mirror = false;
      for (let g = 0; g < state.common.paths[p].length; g++) {
        if (state.common.paths[p].p[g] === -1) {
          mirror = true;
        } else {
          if (state.guess[state.common.paths[p].p[g]] === 1 && mirror)
            state.common.paths[p].sightings_start++;
          else if (state.guess[state.common.paths[p].p[g]] === 2 && !mirror)
            state.common.paths[p].sightings_start++;
          else if (state.guess[state.common.paths[p].p[g]] === 4)
            state.common.paths[p].sightings_start++;
        }
      }

      mirror = false;
      for (let g = state.common.paths[p].length - 1; g >= 0; g--) {
        if (state.common.paths[p].p[g] === -1) {
          mirror = true;
        } else {
          if (state.guess[state.common.paths[p].p[g]] === 1 && mirror)
            state.common.paths[p].sightings_end++;
          else if (state.guess[state.common.paths[p].p[g]] === 2 && !mirror)
            state.common.paths[p].sightings_end++;
          else if (state.guess[state.common.paths[p].p[g]] === 4)
            state.common.paths[p].sightings_end++;
        }
      }

      const start = range2grid(state.common.paths[p].grid_start, w, h);
      state.common.grid[start.x + start.y * (w + 2)] = state.common.paths[p].sightings_start;
      const end = range2grid(state.common.paths[p].grid_end, w, h);
      state.common.grid[end.x + end.y * (w + 2)] = state.common.paths[p].sightings_end;
    }

    // Try to solve the puzzle with the iterative solver
    const old_guess = new Int32Array(state.common.num_total);
    for (let p = 0; p < state.common.num_total; p++) {
      state.guess[p] = 7;
      old_guess[p] = 7;
    }

    let iterative_depth = 0;
    let solved_iterative = false;
    let contains_inconsistency = false;
    let count_ambiguous = 0;

    while (true) {
      let no_change = true;
      solved_iterative = solve_iterative(state, state.common.paths);
      iterative_depth++;
      for (let p = 0; p < state.common.num_total; p++) {
        if (state.guess?.[p] !== old_guess[p]) no_change = false;
        old_guess[p] = state.guess?.[p];
        if (state.guess?.[p] === 0) contains_inconsistency = true;
      }
      if (solved_iterative || no_change) break;
    }

    // If necessary, try to solve the puzzle with the brute-force solver
    let solved_bruteforce = false;
    if (diff !== DIFF_EASY && !solved_iterative && !contains_inconsistency) {
      for (let p = 0; p < state.common.num_total; p++) {
        if (state.guess?.[p] !== 1 && state.guess?.[p] !== 2 && state.guess?.[p] !== 4)
          count_ambiguous++;
      }
      solved_bruteforce = solve_bruteforce(state, state.common.paths);
    }

    // Determine puzzle difficulty level
    if (diff === DIFF_EASY && solved_iterative && iterative_depth <= 3 && !contains_inconsistency) {
      return { state, old_guess };
    }

    if (
      diff === DIFF_NORMAL &&
      ((solved_iterative && iterative_depth > 3) || (solved_bruteforce && count_ambiguous < 4)) &&
      !contains_inconsistency
    ) {
      return { state, old_guess };
    }

    if (
      diff === DIFF_TRICKY &&
      solved_bruteforce &&
      iterative_depth > 0 &&
      count_ambiguous >= 4 &&
      !contains_inconsistency
    ) {
      return { state, old_guess };
    }

    // Puzzle does not satisfy difficulty — loop
  }
}

// =============================================================================
// generate — wrapper that converts internal state to public UndeadPuzzle
// =============================================================================

function generate(w: number, h: number): UndeadPuzzle {
  // Use DIFF_EASY for reliable generation on small grids
  const diff = w <= 4 && h <= 4 ? DIFF_EASY : DIFF_NORMAL;
  const { state } = new_game_desc(w, h, diff);

  const gridArr: ('L' | 'R' | null)[] = [];
  const solutionArr: ('G' | 'V' | 'Z' | null)[] = [];

  // Read the grid and solution from the internal state
  // At this point state.common.grid has the final grid with monsters written in,
  // but state.guess holds the solver's result (which is the solution).
  // We need to re-read the original grid layout. The xinfo array tells us
  // which cells are mirrors (xinfo == -1) vs monster cells (xinfo >= 0).
  // The grid array for inner cells will have CELL_GHOST/CELL_VAMPIRE/CELL_ZOMBIE
  // or CELL_MIRROR_L/CELL_MIRROR_R.

  for (let row = 1; row < h + 1; row++) {
    for (let col = 1; col < w + 1; col++) {
      const cellGrid = state.common.grid[col + row * (w + 2)];
      const xi = state.common.xinfo[col + row * (w + 2)];

      if (cellGrid === CELL_MIRROR_L) {
        gridArr.push('L');
        solutionArr.push(null);
      } else if (cellGrid === CELL_MIRROR_R) {
        gridArr.push('R');
        solutionArr.push(null);
      } else {
        // Monster cell
        gridArr.push(null);
        const monsterCode = state.guess?.[xi];
        if (monsterCode === 1) solutionArr.push('G');
        else if (monsterCode === 2) solutionArr.push('V');
        else if (monsterCode === 4) solutionArr.push('Z');
        else solutionArr.push(null); // should not happen
      }
    }
  }

  // Extract clues: clockwise from top-left
  // rangeno 0..w-1 = top (left to right)
  // rangeno w..w+h-1 = right (top to bottom)
  // rangeno w+h..2w+h-1 = bottom (right to left)
  // rangeno 2w+h..2(w+h)-1 = left (bottom to top)
  const clues: number[] = [];
  for (let p = 0; p < 2 * (w + h); p++) {
    const { x, y } = range2grid(p, w, h);
    clues.push(state.common.grid[x + y * (w + 2)]);
  }

  return {
    width: w,
    height: h,
    grid: gridArr,
    solution: solutionArr,
    numGhosts: state.common.num_ghosts,
    numVampires: state.common.num_vampires,
    numZombies: state.common.num_zombies,
    clues,
  };
}
