// @ts-nocheck
/**
 * Cube puzzle algorithms — faithful port of Simon Tatham's cube.c
 *
 * Original: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/
 * License: MIT
 *
 * A polyhedron sits on a grid of squares or triangles. Roll it by
 * tilting over shared edges. Each face is either blue or blank;
 * landing on a blue grid square swaps the bottom face's colour with
 * that square. Goal: make every face blue.
 */

// ---------------------------------------------------------------------------
// Constants (from cube.c)
// ---------------------------------------------------------------------------

const _MAXVERTICES = 20;
const _MAXFACES = 20;
const _MAXORDER = 4;

// Solid type enum
const TETRAHEDRON = 0;
const CUBE = 1;
const OCTAHEDRON = 2;
const ICOSAHEDRON = 3;

// Direction enum
const LEFT = 0;
const RIGHT = 1;
const UP = 2;
const DOWN = 3;
const UP_LEFT = 4;
const UP_RIGHT = 5;
const DOWN_LEFT = 6;
const DOWN_RIGHT = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Solid {
  nvertices: number;
  vertices: number[]; // 3*nvertices coordinates
  order: number;
  nfaces: number;
  faces: number[]; // order*nfaces point indices
  normals: number[]; // 3*nfaces vector components
  shear: number;
  border: number;
}

interface GridSquare {
  x: number;
  y: number;
  npoints: number;
  points: number[]; // up to 8 floats (4 x/y pairs)
  directions: number[]; // 8 bit masks
  flip: boolean;
  tetra_class: number;
}

interface GameParams {
  solid: number;
  d1: number;
  d2: number;
}

interface GameGrid {
  squares: GridSquare[];
  nsquares: number;
}

interface GameState {
  params: GameParams;
  solid: Solid;
  facecolours: number[];
  grid: GameGrid;
  bluemask: number[]; // packed bit array (32-bit words)
  current: number;
  sgkey: [number, number];
  dgkey: [number, number];
  spkey: [number, number];
  dpkey: [number, number];
  previous: number;
  angle: number;
  completed: number;
  movecount: number;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CubePuzzle {
  /** Which solid: 0=tetrahedron, 1=cube, 2=octahedron, 3=icosahedron */
  solidType: number;
  /** Grid dimension 1 (width for square grids, top side for hex grids) */
  d1: number;
  /** Grid dimension 2 (height for square grids) */
  d2: number;
  /** The grid squares with their geometry */
  grid: GridSquare[];
  /** Number of grid squares */
  nsquares: number;
  /** Blue mask: which squares start as blue (packed 32-bit words) */
  bluemask: number[];
  /** Starting position (index into grid) */
  startSquare: number;
  /** The solid definition */
  solid: Solid;
  /** Number of faces on the solid */
  nfaces: number;
  /** Initial face colours (0 = not blue, 1 = blue) */
  facecolours: number[];
  /** Encoded game description string (Tatham format) */
  desc: string;
}

export type CubeDirection = 'L' | 'R' | 'U' | 'D';

export interface CubeMoveResult {
  /** New game state after the move */
  state: GameState;
  /** Whether the game is now completed */
  completed: boolean;
  /** Total move count */
  movecount: number;
}

// ---------------------------------------------------------------------------
// Solid definitions (from cube.c)
// ---------------------------------------------------------------------------

const s_tetrahedron: Solid = {
  nvertices: 4,
  vertices: [
    0.0, -0.57735026919, -0.20412414523, -0.5, 0.28867513459, -0.20412414523, 0.0, -0.0,
    0.6123724357, 0.5, 0.28867513459, -0.20412414523,
  ],
  order: 3,
  nfaces: 4,
  faces: [0, 2, 1, 3, 1, 2, 2, 0, 3, 1, 3, 0],
  normals: [
    -0.816496580928, -0.471404520791, 0.333333333334, 0.0, 0.942809041583, 0.333333333333,
    0.816496580928, -0.471404520791, 0.333333333334, 0.0, 0.0, -1.0,
  ],
  shear: 0.0,
  border: 0.3,
};

const s_cube: Solid = {
  nvertices: 8,
  vertices: [
    -0.5, -0.5, -0.5, -0.5, -0.5, +0.5, -0.5, +0.5, -0.5, -0.5, +0.5, +0.5, +0.5, -0.5, -0.5, +0.5,
    -0.5, +0.5, +0.5, +0.5, -0.5, +0.5, +0.5, +0.5,
  ],
  order: 4,
  nfaces: 6,
  faces: [0, 1, 3, 2, 1, 5, 7, 3, 5, 4, 6, 7, 4, 0, 2, 6, 0, 4, 5, 1, 3, 7, 6, 2],
  normals: [
    -1.0, 0.0, 0.0, 0.0, 0.0, +1.0, +1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 0.0, 0.0, +1.0, 0.0,
  ],
  shear: 0.3,
  border: 0.5,
};

const s_octahedron: Solid = {
  nvertices: 6,
  vertices: [
    -0.5, -0.28867513459472505, 0.4082482904638664, 0.5, 0.28867513459472505, -0.4082482904638664,
    -0.5, 0.28867513459472505, -0.4082482904638664, 0.5, -0.28867513459472505, 0.4082482904638664,
    0.0, -0.57735026918945009, -0.4082482904638664, 0.0, 0.57735026918945009, 0.4082482904638664,
  ],
  order: 3,
  nfaces: 8,
  faces: [4, 0, 2, 0, 5, 2, 0, 4, 3, 5, 0, 3, 1, 4, 2, 5, 1, 2, 4, 1, 3, 1, 5, 3],
  normals: [
    -0.816496580928, -0.471404520791, -0.333333333334, -0.816496580928, 0.471404520791,
    0.333333333334, 0.0, -0.942809041583, 0.333333333333, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0,
    0.942809041583, -0.333333333333, 0.816496580928, -0.471404520791, -0.333333333334,
    0.816496580928, 0.471404520791, 0.333333333334,
  ],
  shear: 0.0,
  border: 0.5,
};

const s_icosahedron: Solid = {
  nvertices: 12,
  vertices: [
    0.0, 0.57735026919, 0.75576131408, 0.0, -0.93417235896, 0.17841104489, 0.0, 0.93417235896,
    -0.17841104489, 0.0, -0.57735026919, -0.75576131408, -0.5, -0.28867513459, 0.75576131408, -0.5,
    0.28867513459, -0.75576131408, 0.5, -0.28867513459, 0.75576131408, 0.5, 0.28867513459,
    -0.75576131408, -0.80901699437, 0.46708617948, 0.17841104489, 0.80901699437, 0.46708617948,
    0.17841104489, -0.80901699437, -0.46708617948, -0.17841104489, 0.80901699437, -0.46708617948,
    -0.17841104489,
  ],
  order: 3,
  nfaces: 20,
  faces: [
    8, 0, 2, 0, 9, 2, 1, 10, 3, 11, 1, 3, 0, 4, 6, 4, 1, 6, 5, 2, 7, 3, 5, 7, 4, 8, 10, 8, 5, 10, 9,
    6, 11, 7, 9, 11, 0, 8, 4, 9, 0, 6, 10, 1, 4, 1, 11, 6, 8, 2, 5, 2, 9, 7, 3, 10, 5, 11, 3, 7,
  ],
  normals: [
    -0.356822089773, 0.87267799625, 0.333333333333, 0.356822089773, 0.87267799625, 0.333333333333,
    -0.356822089773, -0.87267799625, -0.333333333333, 0.356822089773, -0.87267799625,
    -0.333333333333, -0.0, 0.0, 1.0, 0.0, -0.666666666667, 0.745355992501, 0.0, 0.666666666667,
    -0.745355992501, 0.0, 0.0, -1.0, -0.934172358963, -0.12732200375, 0.333333333333,
    -0.934172358963, 0.12732200375, -0.333333333333, 0.934172358963, -0.12732200375, 0.333333333333,
    0.934172358963, 0.12732200375, -0.333333333333, -0.57735026919, 0.333333333334, 0.745355992501,
    0.57735026919, 0.333333333334, 0.745355992501, -0.57735026919, -0.745355992501, 0.333333333334,
    0.57735026919, -0.745355992501, 0.333333333334, -0.57735026919, 0.745355992501, -0.333333333334,
    0.57735026919, 0.745355992501, -0.333333333334, -0.57735026919, -0.333333333334,
    -0.745355992501, 0.57735026919, -0.333333333334, -0.745355992501,
  ],
  shear: 0.0,
  border: 0.8,
};

const solids: Solid[] = [s_tetrahedron, s_cube, s_octahedron, s_icosahedron];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SQ(x: number): number {
  return x * x;
}

function APPROXEQ(x: number, y: number): boolean {
  return SQ(x - y) < 0.1;
}

function MATMUL(ra: number[], rOff: number, m: number[], a: number[], aOff: number): void {
  const xx = a[aOff],
    yy = a[aOff + 1],
    zz = a[aOff + 2];
  const rx = m[0] * xx + m[3] * yy + m[6] * zz;
  const ry = m[1] * xx + m[4] * yy + m[7] * zz;
  const rz = m[2] * xx + m[5] * yy + m[8] * zz;
  ra[rOff] = rx;
  ra[rOff + 1] = ry;
  ra[rOff + 2] = rz;
}

function SET_SQUARE(bluemask: number[], i: number, val: boolean): void {
  const word = (i / 32) | 0;
  const bit = i % 32;
  bluemask[word] &= ~(1 << bit);
  if (val) bluemask[word] |= 1 << bit;
}

function GET_SQUARE(bluemask: number[], i: number): number {
  const word = (i / 32) | 0;
  const bit = i % 32;
  return (bluemask[word] >> bit) & 1;
}

// ---------------------------------------------------------------------------
// Simple seeded PRNG (xorshift32) — replaces Tatham's random_state
// ---------------------------------------------------------------------------

function makeRng(seed?: number): () => number {
  let s = (seed ?? (Math.random() * 0x7fffffff) | 0) | 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function randomUpto(rng: () => number, n: number): number {
  return (rng() * n) | 0;
}

// ---------------------------------------------------------------------------
// Deep-copy a Solid (needed for transform_poly)
// ---------------------------------------------------------------------------

function copySolid(s: Solid): Solid {
  return {
    nvertices: s.nvertices,
    vertices: s.vertices.slice(),
    order: s.order,
    nfaces: s.nfaces,
    faces: s.faces.slice(),
    normals: s.normals.slice(),
    shear: s.shear,
    border: s.border,
  };
}

// ---------------------------------------------------------------------------
// enum_grid_squares — enumerates all grid squares for the given params
// ---------------------------------------------------------------------------

function enumGridSquares(params: GameParams, callback: (sq: GridSquare) => void): void {
  const solid = solids[params.solid];

  if (solid.order === 4) {
    // Square grid
    for (let y = 0; y < params.d2; y++) {
      for (let x = 0; x < params.d1; x++) {
        const sq: GridSquare = {
          x: x,
          y: y,
          npoints: 4,
          points: [x - 0.5, y - 0.5, x - 0.5, y + 0.5, x + 0.5, y + 0.5, x + 0.5, y - 0.5],
          directions: new Array(8).fill(0),
          flip: false,
          tetra_class: 0,
        };

        sq.directions[LEFT] = 0x03; // 0,1
        sq.directions[RIGHT] = 0x0c; // 2,3
        sq.directions[UP] = 0x09; // 0,3
        sq.directions[DOWN] = 0x06; // 1,2
        sq.directions[UP_LEFT] = 0;
        sq.directions[UP_RIGHT] = 0;
        sq.directions[DOWN_LEFT] = 0;
        sq.directions[DOWN_RIGHT] = 0;

        callback(sq);
      }
    }
  } else {
    // Triangular grid
    const theight = Math.sqrt(3) / 2.0;
    let firstix = -1;

    for (let row = 0; row < params.d1 + params.d2; row++) {
      let other: number;
      let rowlen: number;

      if (row < params.d2) {
        other = +1;
        rowlen = row + params.d1;
      } else {
        other = -1;
        rowlen = 2 * params.d2 + params.d1 - row;
      }

      // Down-pointing triangles
      for (let i = 0; i < rowlen; i++) {
        let ix = 2 * i - (rowlen - 1);
        const x = ix * 0.5;
        const y = theight * row;

        const sq: GridSquare = {
          x: x,
          y: y + theight / 3,
          npoints: 3,
          points: [x - 0.5, y, x, y + theight, x + 0.5, y],
          directions: new Array(8).fill(0),
          flip: true,
          tetra_class: 0,
        };

        sq.directions[LEFT] = 0x03; // 0,1
        sq.directions[RIGHT] = 0x06; // 1,2
        sq.directions[UP] = 0x05; // 0,2
        sq.directions[DOWN] = 0; // invalid

        sq.directions[UP_LEFT] = sq.directions[UP];
        sq.directions[UP_RIGHT] = sq.directions[UP];
        sq.directions[DOWN_LEFT] = sq.directions[LEFT];
        sq.directions[DOWN_RIGHT] = sq.directions[RIGHT];

        if (firstix < 0) firstix = ix & 3;
        ix -= firstix;
        sq.tetra_class = ((row + (ix & 1)) & 2) ^ (ix & 3);

        callback(sq);
      }

      // Up-pointing triangles
      for (let i = 0; i < rowlen + other; i++) {
        let ix = 2 * i - (rowlen + other - 1);
        const x = ix * 0.5;
        const y = theight * row;

        const sq: GridSquare = {
          x: x,
          y: y + (2 * theight) / 3,
          npoints: 3,
          points: [x + 0.5, y + theight, x, y, x - 0.5, y + theight],
          directions: new Array(8).fill(0),
          flip: false,
          tetra_class: 0,
        };

        sq.directions[LEFT] = 0x06; // 1,2
        sq.directions[RIGHT] = 0x03; // 0,1
        sq.directions[DOWN] = 0x05; // 0,2
        sq.directions[UP] = 0; // invalid

        sq.directions[DOWN_LEFT] = sq.directions[DOWN];
        sq.directions[DOWN_RIGHT] = sq.directions[DOWN];
        sq.directions[UP_LEFT] = sq.directions[LEFT];
        sq.directions[UP_RIGHT] = sq.directions[RIGHT];

        if (firstix < 0) firstix = (ix - 1) & 3;
        ix -= firstix;
        sq.tetra_class = ((row + (ix & 1)) & 2) ^ (ix & 3);

        callback(sq);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// grid_area
// ---------------------------------------------------------------------------

function gridArea(d1: number, d2: number, order: number): number {
  if (order === 4) return d1 * d2;
  return d1 * d1 + d2 * d2 + 4 * d1 * d2;
}

// ---------------------------------------------------------------------------
// new_game_desc — generate a game description string
// ---------------------------------------------------------------------------

function newGameDesc(params: GameParams, rng: () => number): string {
  const area = gridArea(params.d1, params.d2, solids[params.solid].order);

  // Determine number of equivalence classes
  let nclasses: number;
  if (params.solid === TETRAHEDRON) nclasses = 4;
  else if (params.solid === OCTAHEDRON) nclasses = 2;
  else nclasses = 1;

  // Classify grid squares
  const gridptrs: number[][] = [];
  for (let i = 0; i < nclasses; i++) gridptrs.push([]);

  let squareindex = 0;
  enumGridSquares(params, (sq) => {
    let thisclass: number;
    if (nclasses === 4) thisclass = sq.tetra_class;
    else if (nclasses === 2) thisclass = sq.flip ? 1 : 0;
    else thisclass = 0;
    gridptrs[thisclass].push(squareindex++);
  });

  const facesperclass = solids[params.solid].nfaces / nclasses;

  // Select blue squares
  const flags = new Array(area).fill(false);

  for (let i = 0; i < nclasses; i++) {
    const arr = gridptrs[i];
    for (let j = 0; j < facesperclass; j++) {
      const n = randomUpto(rng, arr.length);
      flags[arr[n]] = true;
      arr.splice(n, 1);
    }
  }

  // Encode as hex
  let desc = '';
  let j = 0;
  let k = 8;
  for (let i = 0; i < area; i++) {
    if (flags[i]) j |= k;
    k >>= 1;
    if (!k) {
      desc += '0123456789ABCDEF'[j];
      k = 8;
      j = 0;
    }
  }
  if (k !== 8) desc += '0123456789ABCDEF'[j];

  // Collect non-blue squares and choose a starting position
  const nonBlue: number[] = [];
  for (let i = 0; i < area; i++) {
    if (!flags[i]) nonBlue.push(i);
  }
  desc += `,${nonBlue[randomUpto(rng, nonBlue.length)]}`;

  return desc;
}

// ---------------------------------------------------------------------------
// lowest_face — find the face with the lowest average z-coordinate
// ---------------------------------------------------------------------------

function lowestFace(solid: Solid): number {
  let best = 0;
  let zmin = 0.0;

  for (let i = 0; i < solid.nfaces; i++) {
    let z = 0;
    for (let j = 0; j < solid.order; j++) {
      const f = solid.faces[i * solid.order + j];
      z += solid.vertices[f * 3 + 2];
    }
    if (i === 0 || zmin > z) {
      zmin = z;
      best = i;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// align_poly — align a polyhedron to a grid square
// ---------------------------------------------------------------------------

function alignPoly(solid: Solid, sq: GridSquare, pkey: number[]): boolean {
  const flip = sq.flip ? -1 : +1;

  // Find lowest z-coordinate
  let zmin = 0.0;
  for (let i = 0; i < solid.nvertices; i++) {
    if (zmin > solid.vertices[i * 3 + 2]) {
      zmin = solid.vertices[i * 3 + 2];
    }
  }

  // Match grid square points to polyhedron vertices
  for (let j = 0; j < sq.npoints; j++) {
    let matches = 0;
    let index = -1;

    for (let i = 0; i < solid.nvertices; i++) {
      let dist = 0;
      dist += SQ(solid.vertices[i * 3 + 0] * flip - sq.points[j * 2 + 0] + sq.x);
      dist += SQ(solid.vertices[i * 3 + 1] * flip - sq.points[j * 2 + 1] + sq.y);
      dist += SQ(solid.vertices[i * 3 + 2] - zmin);

      if (dist < 0.1) {
        matches++;
        index = i;
      }
    }

    if (matches !== 1 || index < 0) return false;
    pkey[j] = index;
  }

  return true;
}

// ---------------------------------------------------------------------------
// flip_poly — negate x and y coords when on a flipped square
// ---------------------------------------------------------------------------

function flipPoly(solid: Solid, doFlip: boolean): void {
  if (doFlip) {
    for (let i = 0; i < solid.nvertices; i++) {
      solid.vertices[i * 3 + 0] *= -1;
      solid.vertices[i * 3 + 1] *= -1;
    }
    for (let i = 0; i < solid.nfaces; i++) {
      solid.normals[i * 3 + 0] *= -1;
      solid.normals[i * 3 + 1] *= -1;
    }
  }
}

// ---------------------------------------------------------------------------
// transform_poly — rotate the polyhedron through a given angle
// ---------------------------------------------------------------------------

function transformPoly(
  solid: Solid,
  flip: boolean,
  key0: number,
  key1: number,
  angle: number,
): Solid {
  const ret = copySolid(solid);

  flipPoly(ret, flip);

  // Rotation axis from key0 to key1
  const vx = ret.vertices[key1 * 3 + 0] - ret.vertices[key0 * 3 + 0];
  const vy = ret.vertices[key1 * 3 + 1] - ret.vertices[key0 * 3 + 1];

  // Z-axis rotation to align key edge horizontally
  const vmatrix = [vx, -vy, 0, vy, vx, 0, 0, 0, 1];

  const ax = Math.cos(angle);
  const ay = Math.sin(angle);

  // X-axis rotation by angle
  const amatrix = [1, 0, 0, 0, ax, -ay, 0, ay, ax];

  // Inverse Z-axis rotation
  const vmatrix2 = [vx, vy, 0, -vy, vx, 0, 0, 0, 1];

  for (let i = 0; i < ret.nvertices; i++) {
    MATMUL(ret.vertices, 3 * i, vmatrix, ret.vertices, 3 * i);
    MATMUL(ret.vertices, 3 * i, amatrix, ret.vertices, 3 * i);
    MATMUL(ret.vertices, 3 * i, vmatrix2, ret.vertices, 3 * i);
  }
  for (let i = 0; i < ret.nfaces; i++) {
    MATMUL(ret.normals, 3 * i, vmatrix, ret.normals, 3 * i);
    MATMUL(ret.normals, 3 * i, amatrix, ret.normals, 3 * i);
    MATMUL(ret.normals, 3 * i, vmatrix2, ret.normals, 3 * i);
  }

  return ret;
}

// ---------------------------------------------------------------------------
// find_move_dest — find where a move in a given direction leads
// ---------------------------------------------------------------------------

function findMoveDest(
  grid: GameGrid,
  current: number,
  direction: number,
): { dest: number; skey: [number, number]; dkey: [number, number] } | null {
  const mask = grid.squares[current].directions[direction];
  if (mask === 0) return null;

  const points: number[] = [];
  const skey: number[] = [];

  for (let i = 0, j = 0; i < grid.squares[current].npoints; i++) {
    if (mask & (1 << i)) {
      points[j * 2] = grid.squares[current].points[i * 2];
      points[j * 2 + 1] = grid.squares[current].points[i * 2 + 1];
      skey[j] = i;
      j++;
    }
  }

  // Find the neighbouring square sharing those two points
  let dest = -1;
  const dkey: number[] = [];

  for (let i = 0; i < grid.nsquares; i++) {
    if (i !== current) {
      let match = 0;
      const tempDkey: number[] = [];

      for (let j = 0; j < grid.squares[i].npoints; j++) {
        const dist0 =
          SQ(grid.squares[i].points[j * 2] - points[0]) +
          SQ(grid.squares[i].points[j * 2 + 1] - points[1]);
        if (dist0 < 0.1) tempDkey[match++] = j;

        const dist1 =
          SQ(grid.squares[i].points[j * 2] - points[2]) +
          SQ(grid.squares[i].points[j * 2 + 1] - points[3]);
        if (dist1 < 0.1) tempDkey[match++] = j;
      }

      if (match === 2) {
        dest = i;
        dkey[0] = tempDkey[0];
        dkey[1] = tempDkey[1];
        break;
      }
    }
  }

  if (dest < 0) return null;

  return { dest, skey: [skey[0], skey[1]], dkey: [dkey[0], dkey[1]] };
}

// ---------------------------------------------------------------------------
// newGame — parse a game description and create initial state
// ---------------------------------------------------------------------------

function newGame(params: GameParams, desc: string): GameState {
  const solid = solids[params.solid];
  const _area = gridArea(params.d1, params.d2, solid.order);

  // Build grid
  const grid: GameGrid = { squares: [], nsquares: 0 };
  enumGridSquares(params, (sq) => {
    grid.squares.push(sq);
    grid.nsquares++;
  });

  // Parse face colours (all start as 0)
  const facecolours = new Array(solid.nfaces).fill(0);

  // Parse blue mask from description
  const bluemask = new Array(((grid.nsquares + 31) / 32) | 0).fill(0);

  let p = 0;
  let hexJ = 8;
  let hexV = 0;

  for (let i = 0; i < grid.nsquares; i++) {
    if (hexJ === 8) {
      const c = desc.charCodeAt(p++);
      if (c >= 48 && c <= 57)
        hexV = c - 48; // '0'-'9'
      else if (c >= 65 && c <= 70)
        hexV = c - 65 + 10; // 'A'-'F'
      else if (c >= 97 && c <= 102)
        hexV = c - 97 + 10; // 'a'-'f'
      else break;
    }
    if (hexV & hexJ) SET_SQUARE(bluemask, i, true);
    hexJ >>= 1;
    if (hexJ === 0) {
      hexJ = 8;
    }
  }

  // Parse starting position
  if (desc[p] === ',') p++;
  const current = parseInt(desc.substring(p), 10) || 0;

  // Align polyhedron
  const pkey = [0, 0, 0, 0];
  alignPoly(solid, grid.squares[current], pkey);

  const state: GameState = {
    params: { ...params },
    solid,
    facecolours,
    grid,
    bluemask,
    current,
    sgkey: [0, 1],
    dgkey: [0, 1],
    spkey: [pkey[0], pkey[1]],
    dpkey: [pkey[0], pkey[1]],
    previous: current,
    angle: 0.0,
    completed: 0,
    movecount: 0,
  };

  return state;
}

// ---------------------------------------------------------------------------
// dupState — deep copy a game state
// ---------------------------------------------------------------------------

function dupState(state: GameState): GameState {
  return {
    params: { ...state.params },
    solid: state.solid,
    facecolours: state.facecolours.slice(),
    grid: state.grid, // shared, immutable
    bluemask: state.bluemask.slice(),
    current: state.current,
    sgkey: [state.sgkey[0], state.sgkey[1]],
    dgkey: [state.dgkey[0], state.dgkey[1]],
    spkey: [state.spkey[0], state.spkey[1]],
    dpkey: [state.dpkey[0], state.dpkey[1]],
    previous: state.previous,
    angle: state.angle,
    completed: state.completed,
    movecount: state.movecount,
  };
}

// ---------------------------------------------------------------------------
// executeMove — apply a move to a game state (faithful port of execute_move)
// ---------------------------------------------------------------------------

export function executeMove(state: GameState, move: CubeDirection): GameState | null {
  let direction: number;
  switch (move) {
    case 'L':
      direction = LEFT;
      break;
    case 'R':
      direction = RIGHT;
      break;
    case 'U':
      direction = UP;
      break;
    case 'D':
      direction = DOWN;
      break;
    default:
      return null;
  }

  const result = findMoveDest(state.grid, state.current, direction);
  if (!result) return null;

  const { dest, skey, dkey } = result;
  const ret = dupState(state);
  ret.current = dest;

  // Find polyhedron key points for the rotation
  const allPkey = [0, 0, 0, 0];
  alignPoly(state.solid, state.grid.squares[state.current], allPkey);
  const pkey: [number, number] = [allPkey[skey[0]], allPkey[skey[1]]];

  // Find the rotation angle from dot product of the two adjacent face normals
  let angle: number;
  {
    const f: number[] = [];
    for (let i = 0; i < state.solid.nfaces; i++) {
      let match = 0;
      for (let j = 0; j < state.solid.order; j++) {
        if (
          state.solid.faces[i * state.solid.order + j] === pkey[0] ||
          state.solid.faces[i * state.solid.order + j] === pkey[1]
        ) {
          match++;
        }
      }
      if (match === 2) f.push(i);
    }

    let dp = 0;
    for (let i = 0; i < 3; i++) {
      dp += state.solid.normals[f[0] * 3 + i] * state.solid.normals[f[1] * 3 + i];
    }
    angle = Math.acos(dp);
  }

  // Try both rotation directions — cube needs a direction hack
  {
    if (state.solid.order === 4 && direction === UP) {
      angle = -angle;
    }

    let poly = transformPoly(
      state.solid,
      state.grid.squares[state.current].flip,
      pkey[0],
      pkey[1],
      angle,
    );
    flipPoly(poly, state.grid.squares[ret.current].flip);
    const testPkey = [0, 0, 0, 0];
    let success = alignPoly(poly, state.grid.squares[ret.current], testPkey);

    if (!success) {
      angle = -angle;
      poly = transformPoly(
        state.solid,
        state.grid.squares[state.current].flip,
        pkey[0],
        pkey[1],
        angle,
      );
      flipPoly(poly, state.grid.squares[ret.current].flip);
      success = alignPoly(poly, state.grid.squares[ret.current], testPkey);
    }

    if (!success) return null; // should never happen with valid state

    // Map face permutation by matching normals
    const newcolours = new Array(state.solid.nfaces).fill(-1);

    for (let i = 0; i < state.solid.nfaces; i++) {
      for (let j = 0; j < poly.nfaces; j++) {
        let dist = 0;
        for (let k = 0; k < 3; k++) {
          dist += SQ(poly.normals[j * 3 + k] - state.solid.normals[i * 3 + k]);
        }
        if (APPROXEQ(dist, 0)) {
          newcolours[i] = ret.facecolours[j];
        }
      }
    }

    ret.facecolours = newcolours;
  }

  ret.movecount++;

  // Swap colour between bottom face and landed-on grid square
  if (!ret.completed) {
    const i = lowestFace(state.solid);
    const j = ret.facecolours[i];
    ret.facecolours[i] = GET_SQUARE(ret.bluemask, ret.current);
    SET_SQUARE(ret.bluemask, ret.current, !!j);

    // Detect completion: all faces must be blue (1)
    let blueCount = 0;
    for (let f = 0; f < ret.solid.nfaces; f++) {
      if (ret.facecolours[f]) blueCount++;
    }
    if (blueCount === ret.solid.nfaces) {
      ret.completed = ret.movecount;
    }
  }

  // Align for display key points
  const dpkey = [0, 0, 0, 0];
  alignPoly(ret.solid, ret.grid.squares[ret.current], dpkey);
  ret.dpkey = [dpkey[0], dpkey[1]];
  ret.dgkey = [0, 1];

  ret.spkey = [pkey[0], pkey[1]];
  ret.sgkey = [skey[0], skey[1]];
  ret.previous = state.current;
  ret.angle = angle;

  return ret;
}

// ---------------------------------------------------------------------------
// find_bbox — compute bounding box of the grid
// ---------------------------------------------------------------------------

function findBbox(params: GameParams): { l: number; r: number; u: number; d: number } {
  const bb = {
    l: 2.0 * (params.d1 + params.d2),
    r: -2.0 * (params.d1 + params.d2),
    u: 2.0 * (params.d1 + params.d2),
    d: -2.0 * (params.d1 + params.d2),
  };

  enumGridSquares(params, (sq) => {
    for (let i = 0; i < sq.npoints; i++) {
      if (bb.l > sq.points[i * 2]) bb.l = sq.points[i * 2];
      if (bb.r < sq.points[i * 2]) bb.r = sq.points[i * 2];
      if (bb.u > sq.points[i * 2 + 1]) bb.u = sq.points[i * 2 + 1];
      if (bb.d < sq.points[i * 2 + 1]) bb.d = sq.points[i * 2 + 1];
    }
  });

  return bb;
}

// ---------------------------------------------------------------------------
// validate_params — check params are valid
// ---------------------------------------------------------------------------

function validateParams(params: GameParams): string | null {
  if (params.solid < 0 || params.solid >= solids.length) {
    return 'Unrecognised solid type';
  }

  if (solids[params.solid].order === 4) {
    if (params.d1 <= 0 || params.d2 <= 0) {
      return 'Both grid dimensions must be greater than zero';
    }
  } else {
    if (params.d1 <= 0 && params.d2 <= 0) {
      return 'At least one grid dimension must be greater than zero';
    }
  }

  const classes = [0, 0, 0, 0];
  let nclasses: number;
  if (params.solid === TETRAHEDRON) nclasses = 4;
  else if (params.solid === OCTAHEDRON) nclasses = 2;
  else nclasses = 1;

  enumGridSquares(params, (sq) => {
    let thisclass: number;
    if (nclasses === 4) thisclass = sq.tetra_class;
    else if (nclasses === 2) thisclass = sq.flip ? 1 : 0;
    else thisclass = 0;
    classes[thisclass]++;
  });

  for (let i = 0; i < nclasses; i++) {
    if (classes[i] < solids[params.solid].nfaces / nclasses) {
      return 'Not enough grid space to place all blue faces';
    }
  }

  if (
    gridArea(params.d1, params.d2, solids[params.solid].order) <
    solids[params.solid].nfaces + 1
  ) {
    return 'Not enough space to place the solid on an empty square';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Preset configurations (from game_fetch_preset)
// ---------------------------------------------------------------------------

export const CUBE_PRESETS = [
  { name: 'Cube', solid: CUBE, d1: 4, d2: 4 },
  { name: 'Tetrahedron', solid: TETRAHEDRON, d1: 1, d2: 2 },
  { name: 'Octahedron', solid: OCTAHEDRON, d1: 2, d2: 2 },
  { name: 'Icosahedron', solid: ICOSAHEDRON, d1: 3, d2: 3 },
] as const;

// ---------------------------------------------------------------------------
// generateCubePuzzle — main entry point
// ---------------------------------------------------------------------------

export interface CubePuzzleParams {
  /** Which solid: 0=tetrahedron, 1=cube, 2=octahedron, 3=icosahedron. Default: 1 (cube) */
  solid?: number;
  /** Grid dimension 1. Default: 4 */
  d1?: number;
  /** Grid dimension 2. Default: 4 */
  d2?: number;
  /** Optional PRNG seed for reproducibility */
  seed?: number;
}

export function generateCubePuzzle(params?: CubePuzzleParams): CubePuzzle {
  const solid = params?.solid ?? CUBE;
  const d1 = params?.d1 ?? 4;
  const d2 = params?.d2 ?? 4;
  const gameParams: GameParams = { solid, d1, d2 };

  const err = validateParams(gameParams);
  if (err) throw new Error(err);

  const rng = makeRng(params?.seed);
  const desc = newGameDesc(gameParams, rng);
  const state = newGame(gameParams, desc);

  return {
    solidType: solid,
    d1,
    d2,
    grid: state.grid.squares,
    nsquares: state.grid.nsquares,
    bluemask: state.bluemask,
    startSquare: state.current,
    solid: solids[solid],
    nfaces: solids[solid].nfaces,
    facecolours: state.facecolours,
    desc,
  };
}

// ---------------------------------------------------------------------------
// createGameState — create a GameState from a CubePuzzle (for use with executeMove)
// ---------------------------------------------------------------------------

export function createGameState(puzzle: CubePuzzle): GameState {
  const params: GameParams = {
    solid: puzzle.solidType,
    d1: puzzle.d1,
    d2: puzzle.d2,
  };
  return newGame(params, puzzle.desc);
}

// ---------------------------------------------------------------------------
// Re-export types/constants needed by consumers
// ---------------------------------------------------------------------------

export {
  TETRAHEDRON,
  CUBE as CUBE_SOLID,
  OCTAHEDRON,
  ICOSAHEDRON,
  LEFT as DIR_LEFT,
  RIGHT as DIR_RIGHT,
  UP as DIR_UP,
  DOWN as DIR_DOWN,
};

export type { GameState as CubeGameState, GridSquare as CubeGridSquare, Solid as CubeSolid };

// ---------------------------------------------------------------------------
// Rendering helpers — exported for the UI
// ---------------------------------------------------------------------------

/** Get the bounding box for a set of game params */
export function getGridBbox(solidType: number, d1: number, d2: number) {
  return findBbox({ solid: solidType, d1, d2 });
}

/** Get a square's blue/non-blue status from the bluemask */
export function isSquareBlue(bluemask: number[], i: number): boolean {
  return GET_SQUARE(bluemask, i) === 1;
}

/** Get the lowest (bottom) face index for a solid */
export function getBottomFace(solid: Solid): number {
  return lowestFace(solid);
}

/**
 * Compute projected 2D polyhedron face vertices for rendering.
 *
 * Returns an array of faces, each with:
 * - `points`: 2D coordinates (pairs of x,y)
 * - `faceIndex`: index into facecolours
 * - `visible`: whether the face is front-facing (should be drawn)
 */
export function getPolyhedronFaces(
  state: GameState,
): Array<{ points: number[]; faceIndex: number; visible: boolean }> {
  const sq = state.grid.squares[state.current];
  const pkey = [0, 0, 0, 0];
  alignPoly(state.solid, sq, pkey);

  // The poly is the unrotated solid positioned at the current square
  const poly = copySolid(state.solid);
  flipPoly(poly, sq.flip);

  // Compute translation to align key points
  const t = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let tc = 0;
    for (let j = 0; j < 2; j++) {
      const gridCoord = i < 2 ? sq.points[state.dgkey[j] * 2 + i] : 0.0;
      tc += gridCoord - poly.vertices[pkey[j] * 3 + i];
    }
    t[i] = tc / 2;
  }
  for (let i = 0; i < poly.nvertices; i++) {
    for (let j = 0; j < 3; j++) {
      poly.vertices[i * 3 + j] += t[j];
    }
  }

  const faces: Array<{ points: number[]; faceIndex: number; visible: boolean }> = [];

  for (let i = 0; i < poly.nfaces; i++) {
    const pts: number[] = [];
    for (let j = 0; j < poly.order; j++) {
      const f = poly.faces[i * poly.order + j];
      pts.push(
        poly.vertices[f * 3 + 0] - poly.vertices[f * 3 + 2] * poly.shear,
        poly.vertices[f * 3 + 1] - poly.vertices[f * 3 + 2] * poly.shear,
      );
    }

    // Check winding order for visibility
    const v1x = pts[2] - pts[0];
    const v1y = pts[3] - pts[1];
    const v2x = pts[4] - pts[2];
    const v2y = pts[5] - pts[3];
    const dp = v1x * v2y - v1y * v2x;

    faces.push({ points: pts, faceIndex: i, visible: dp > 0 });
  }

  return faces;
}
